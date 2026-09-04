/** C1a 抽屉容器：事件开合 + 真系统写透 + stream 保活（P0-3）。
 * A'：预设/上下文直写 dsh-im 真接口（按 botId 逐渠道），读不到真值禁用写；host 自持账本弃用不断路。 */
import { mount } from '../../client/dom'
import { openDirPicker } from '../../client/ui/dir-picker'
import { showSheet } from '../../client/ui/sheet'
import { toast } from '../../client/ui/toast'
import { chooseBot, runTestSend } from '../../client/data/header-overlay'
import type { AgentPresetCatalog } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import { channelLabel, type OpenDrawerDetail } from '../../client/data/config'
import { applyPersonality, rpcOf, writeBots, type WriteDeps } from './actions'
import {
  OPEN_DRAWER_EVENT, PRESET_MIXED, buildDrawerModel, ctxPayloadFor, fetchRoutes, loadingModel,
  modelSig, presetPayloadFor, type DrawerModel, type RouteEntry,
} from './data'
import { quietCallbacks, renderDrawerContent, type DrawerCallbacks } from './view'

let currentClose: (() => void) | null = null

export function mountDrawer(fctx: FeatureCtx): () => void {
  const onEvent = (e: Event): void => {
    try {
      const detail = (e as CustomEvent)?.detail as Partial<OpenDrawerDetail> | undefined
      const key = detail?.key
      if (typeof key === 'string' && key) void openDrawer(fctx, key)
    } catch {
      /* ignore */
    }
  }
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined
    window.addEventListener(OPEN_DRAWER_EVENT, onEvent as EventListener)
  } catch {
    return () => undefined
  }
  return () => {
    try { window.removeEventListener(OPEN_DRAWER_EVENT, onEvent as EventListener) } catch { /* ignore */ }
  }
}

type MetaDoc = Awaited<ReturnType<FeatureCtx['meta']['loadMeta']>>
type SnapBots = Parameters<typeof buildDrawerModel>[0]

async function openDrawer(fctx: FeatureCtx, key: string): Promise<void> {
  try {
    currentClose?.()
  } catch {
    /* ignore */
  }
  currentClose = null
  let meta: MetaDoc | null = null
  try {
    meta = await fctx.meta.loadMeta()
  } catch {
    toast('身份配置不可用，稍后重试')
    return
  }
  let sheet: ReturnType<typeof showSheet> | null = null
  let closed = false
  let lastBots: SnapBots = []
  let lastCatalogs: Record<string, AgentPresetCatalog> = {}
  let lastRoutes: RouteEntry[] = []
  const closeAll = (): void => {
    try {
      sheet?.close()
    } catch {
      /* ignore */
    }
  }
  try {
    sheet = showSheet({
      overlayClass: 'c1a-overlay',
      panelClass: 'c1a-sheet',
      label: 'Agent 详情抽屉',
      onClose: () => {
        closed = true
        clearGiveUp()
        try {
          unsub()
        } catch {
          /* ignore */
        }
        if (currentClose === closeAll) currentClose = null
      },
    })
  } catch {
    sheet = null
  }
  if (!sheet) {
    toast('抽屉打开失败')
    return
  }
  currentClose = closeAll
  let settled = false
  let giveUp: ReturnType<typeof setTimeout> | null = null
  const clearGiveUp = (): void => {
    try { if (giveUp !== null) clearTimeout(giveUp) } catch { /* ignore */ }
    giveUp = null
  }
  const paintLoading = (): void => {
    if (closed || !sheet) return
    try {
      mount(sheet.panel, renderDrawerContent(loadingModel(key), quietCallbacks(() => closeAll())))
    } catch {
      /* keep old frame */
    }
  }
  try {
    giveUp = setTimeout(() => {
      giveUp = null
      if (!settled && !closed) {
        toast('未找到该 Agent 的数据，可点列表右上刷新后重试')
        closeAll()
      }
    }, 8000)
  } catch {
    /* 定时器不可用则不设限 */
  }
  let lastSig: string | null = null
  const paint = (): void => {
    if (closed || !meta || !sheet) return
    const model = buildDrawerModel(lastBots, meta, key, lastCatalogs, lastRoutes)
    if (!model) {
      if (settled) {
        settled = false
        toast('该 Agent 已不在列表，关闭抽屉')
        closeAll()
      } else if (lastSig !== 'loading') {
        lastSig = 'loading'
        paintLoading()
      }
      return
    }
    /* 同构快照跳过重绘：15s 轮询不再抖动滚动/焦点 */
    const sig = modelSig(model)
    if (settled && sig && sig === lastSig) return
    settled = true
    clearGiveUp()
    const bd = sheet.panel.querySelector('.c1a-dbody') as HTMLElement | null
    const st = bd ? bd.scrollTop : 0
    const sl = bd ? bd.scrollLeft : 0
    try {
      mount(sheet.panel, renderDrawerContent(model, cbs(model), draftWs, draftPers))
    } catch {
      /* keep old frame */
    }
    const nb = sheet.panel.querySelector('.c1a-dbody') as HTMLElement | null
    if (nb) { nb.scrollTop = st; nb.scrollLeft = sl }
    lastSig = sig
  }
  const reloadMeta = async (): Promise<void> => {
    try {
      meta = await fctx.meta.loadMeta()
    } catch {
      /* keep old meta */
    }
  }
  let draftWs: string | null = null
  let draftPers: string | null = null
  const deps = (): WriteDeps => ({ rpc: fctx.rpc, refresh: () => fctx.refresh(), reloadMeta, paint, notify: toast })
  const cbs = (model: DrawerModel): DrawerCallbacks => {
    const flipOne = (channel: string, botId: string, which: 'group' | 'direct'): void => {
      const target = model.bots.find((b) => b.channel === channel && b.botId === botId)
      if (!target || target.ctx === undefined) {
        toast('本渠道真值尚未读到，稍后再试（防覆盖已有配置）')
        return
      }
      const cur = target.ctx
      const on = cur !== null && (which === 'group' ? cur.groupEnabled : cur.directEnabled) === true
      const cfg = ctxPayloadFor(cur, which, !on)
      if (!cfg) {
        toast('本渠道真值缺失，稍后再试')
        return
      }
      const single: DrawerModel = { ...model, bots: [target] }
      const kind = channelLabel(channel) + (which === 'group' ? '群聊增强' : '私聊增强')
      void writeBots(single, deps(), kind,
        () => rpcOf(fctx.rpc, channel, 'bot.context-enhancement.set', { botId: botId, config: cfg }))
    }
    return {
    onPreset: (id) => {
      const problem = !model.presetReady ? '预设真值尚未读全，稍后再试'
        : id === PRESET_MIXED ? '多渠道不一致，请选一个具体预设' : ''
      if (problem) {
        toast(problem)
        paint()
        return
      }
      void writeBots(model, deps(), '预设', (b) => {
        const p = presetPayloadFor(b.botId, id)
        if (!p) return Promise.reject(new Error('预设 id 非法'))
        return rpcOf(fctx.rpc, b.channel, 'bot.preset.set', p)
      })
    },
    onToggleGroup: (channel, botId) => flipOne(channel, botId, 'group'),
    onToggleDirect: (channel, botId) => flipOne(channel, botId, 'direct'),
    onSaveWorkspace: (path) => {
      const ws = path.trim()
      if (!ws || !(ws.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ws))) {
        toast('请输入绝对路径形式的工作区目录')
        return
      }
      void (async () => {
        await writeBots(model, deps(), '绑定工作区',
          (b) => rpcOf(fctx.rpc, b.channel, 'bot.workspace.set', { botId: b.botId, workspace: ws }), '')
        draftWs = null
        paint()
      })()
    },
    onBrowseWorkspace: () => {
      if (!fctx.rpc) {
        toast('连接服务不可用')
        return
      }
      let svc: unknown; try { svc = typeof fctx.get === 'function' ? fctx.get('uiWorkspace') : undefined } catch { svc = undefined }
      const anySvc: any = svc
      const native = anySvc && typeof anySvc.pickDirectory === 'function'
        ? () => Promise.resolve().then(() => anySvc.pickDirectory())
        : undefined
      void (async () => {
        try {
          const picked = await openDirPicker(fctx.rpc, draftWs ?? model.workspace, native).promise
          if (picked) {
            draftWs = picked
            paint()
          }
        } catch {
          /* 用户取消 */
        }
      })()
    },
    onDraftWorkspace: (v) => {
      draftWs = v
    },
    onApplyPersonality: (text) => {
      if (model.bots.some((b) => b.ctx === undefined)) {
        toast('有渠道真值尚未读到，稍后再应用（防覆盖）')
        return
      }
      if (!text.trim()) {
        toast('先写点性格描述再应用')
        return
      }
      void (async () => {
        await applyPersonality(model, deps(), text)
        draftPers = null
        paint()
      })()
    },
    onDraftPersonality: (v) => {
      draftPers = v
    },
    onRemoveBot: (channel, botId) => {
      if (!fctx.rpc) {
        toast('连接服务不可用')
        return
      }
      void (async () => {
        try {
          await rpcOf(fctx.rpc, channel, 'bot.delete', { botId, confirm: true })
          toast('渠道机器人已移除', 'check')
          await fctx.refresh()
        } catch (e) {
          toast('移除失败：' + String((e as Error)?.message ?? e))
        }
      })()
    },
    onTestSend: (channel, botId) => {
      void (async () => {
        try {
          const bot = lastBots.find((b) => b && b.channel === channel && b.botId === botId) ?? null
          if (!bot) {
            toast('该渠道机器人已不在列表')
            return
          }
          const outcome = await runTestSend(fctx.rpc, bot, model.workspace, model.name)
          toast(outcome.text, outcome.ok ? 'check' : undefined)
        } catch (e) {
          toast('发送失败：' + String((e as Error)?.message ?? e))
        }
      })()
    },
    onClose: () => closeAll(),
    }
  }
  let unsub: () => void = () => undefined
  try {
    unsub = fctx.subscribe((snap) => {
      lastBots = snap.bots
      lastCatalogs = (snap as { catalogs?: Record<string, AgentPresetCatalog> }).catalogs ?? {}
      paint()
      // 路由跟随每轮快照重读（本地小文件；变了才重绘，避免空转闪烁）。
      void fetchRoutes(fctx.rpc, snap.bots).then((r) => {
        if (JSON.stringify(r) !== JSON.stringify(lastRoutes)) { lastRoutes = r; paint() }
      }).catch(() => undefined)
    })
  } catch {
    closeAll()
  }
}
