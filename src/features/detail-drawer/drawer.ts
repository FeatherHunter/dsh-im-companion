/** DetailDrawer 抽屉容器：事件开合 + 真系统写透 + stream 保活（P0-3）。A'：预设/上下文直写 dsh-im 真接口（按 botId 逐渠道），读不到真值禁用写。 */
import { mount } from '../../client/dom'
import { logLine, logOn } from '../../client/log'
import { nativePicker, openDirPicker } from '../../client/ui/dir-picker'
import { showSheet } from '../../client/ui/sheet'
import { toast } from '../../client/ui/toast'
import { chooseBot, runTestSend } from '../../client/data/header-overlay'
import type { AgentPresetCatalog } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import { OPEN_ASSIST_EDIT_EVENT, channelLabel, type AssistBrief, type AssistEditDetail, type OpenDrawerDetail } from '../../client/data/config'
import { rpcOf, writeBots, type WriteDeps } from './actions'
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
      if (typeof key === 'string' && key) void openDrawer(fctx, key, detail?.assistant ?? null)
    } catch {
      /* ignore */
    }
  }
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined
    window.addEventListener(OPEN_DRAWER_EVENT, onEvent as EventListener)
  } catch (e) { logLine('error', 'feature.mount.fail', { feature: 'detail-drawer', message: String((e as Error)?.message ?? e) }); return () => undefined }
  return () => {
    try { window.removeEventListener(OPEN_DRAWER_EVENT, onEvent as EventListener) } catch { /* ignore */ }
  }
}

type MetaDoc = Awaited<ReturnType<FeatureCtx['meta']['loadMeta']>>
type SnapBots = Parameters<typeof buildDrawerModel>[0]
/** #173 编辑跳转：派发 OPEN_ASSIST_EDIT_EVENT（feature→A1，契约 §4）后关面板；派发失败不阻断关闭。 */
export function jumpToAssistEdit(model: DrawerModel, close: () => void): void {
  const detail: AssistEditDetail = { assistantId: model.assistant?.id ?? '', homePath: model.workspace }
  try { window.dispatchEvent(new window.CustomEvent(OPEN_ASSIST_EDIT_EVENT, { detail })) } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'detail-drawer', action: 'open-assist-edit', ok: false, message: String((e as Error)?.message ?? e) }) }
  close()
}

async function openDrawer(fctx: FeatureCtx, key: string, assistant: AssistBrief | null = null): Promise<void> {
  logLine('debug', 'ui.action', { area: 'detail-drawer', action: 'open', ok: true, message: '打开 Agent 详情：' + key })
  try {
    currentClose?.()
  } catch {
    /* ignore */
  }
  currentClose = null
  let meta: MetaDoc | null = null
  try {
    meta = await fctx.meta.loadMeta()
  } catch (e) { logLine('warn', 'bridge.call.fail', { method: 'meta.loadMeta', message: String((e as Error)?.message ?? e) }); toast('身份配置不可用，稍后重试'); return }
  let sheet: ReturnType<typeof showSheet> | null = null
  let closed = false
  let lastBots: SnapBots = []
  let lastCatalogs: Record<string, AgentPresetCatalog> = {}
  let lastRoutes: RouteEntry[] = []
  const closeAll = (): void => {
    try { sheet?.close() } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'detail-drawer', action: 'close-fail', ok: false, message: String((e as Error)?.message ?? e) }) }
  }
  try {
    sheet = showSheet({
      overlayClass: 'detail-drawer-overlay',
      panelClass: 'detail-drawer-sheet',
      label: 'Agent 详情面板',
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
  } catch (e) {
    sheet = null
    logLine('error', 'ui.render.fail', { area: 'detail-drawer', message: 'showSheet 抛错：' + String((e as Error)?.message ?? e) })
  }
  if (!sheet) { logLine('error', 'ui.render.fail', { area: 'detail-drawer', message: '抽屉面板未建出（showSheet 返回空）' }); toast('抽屉打开失败'); return }
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
    } catch (e) {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'detail-drawer', action: 'loading-paint-fail', ok: false, message: String((e as Error)?.message ?? e) })
    }
  }
  try {
    giveUp = setTimeout(() => {
      giveUp = null
      if (!settled && !closed) {
        logLine('warn', 'stream.fail', { message: '抽屉等 8s 未等到该 Agent 数据（端点空或 key 未命中）：' + key })
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
    const model = buildDrawerModel(lastBots, meta, key, lastCatalogs, lastRoutes, assistant)
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
    const bd = sheet.panel.querySelector('.detail-drawer-dbody') as HTMLElement | null
    const st = bd ? bd.scrollTop : 0
    const sl = bd ? bd.scrollLeft : 0
    try {
      mount(sheet.panel, renderDrawerContent(model, cbs(model), draftWs))
    } catch (e) {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'detail-drawer', action: 'paint-fail', ok: false, message: '保留旧帧：' + String((e as Error)?.message ?? e) })
    }
    const nb = sheet.panel.querySelector('.detail-drawer-dbody') as HTMLElement | null
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
  const deps = (): WriteDeps => ({ rpc: fctx.rpc, refresh: () => fctx.refresh(), reloadMeta, paint, notify: toast })
  const cbs = (model: DrawerModel): DrawerCallbacks => {
    const flipOne = (channel: string, botId: string, which: 'group' | 'direct'): void => {
      const target = model.bots.find((b) => b.channel === channel && b.botId === botId)
      if (!target || target.ctx === undefined) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'detail-drawer', action: 'toggle-rejected', ok: false, message: '本渠道真值未读到，拒绝翻转（防覆盖已有配置）' }); toast('本渠道真值尚未读到，稍后再试（防覆盖已有配置）'); return }
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
      /* 原生优先：inject 直连 → get 透传；都没有才内置浏览（原生不需 rpc，不断路前置）。 */
      let svc: unknown; try { svc = typeof fctx.get === 'function' ? fctx.get('uiWorkspace') : undefined } catch { svc = undefined }
      const native = nativePicker({ pickDirectory: fctx.pickDirectory }, svc)
      if (!native && !fctx.rpc) {
        toast('连接服务不可用')
        return
      }
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
          const msg = String((e as Error)?.message ?? e)
          logLine('warn', 'bridge.call.fail', { method: channel + '/bot.delete', message: msg })
          toast('移除失败：' + msg)
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
          const msg = String((e as Error)?.message ?? e)
          logLine('warn', 'bridge.call.fail', { method: 'test-send', message: msg })
          toast('发送失败：' + msg)
        }
      })()
    },
    onEditAssistant: () => jumpToAssistEdit(model, closeAll),
    onNotify: (message, icon) => toast(message, icon),
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
  } catch (e) {
    logLine('warn', 'bridge.call.fail', { method: 'stream.subscribe', message: '抽屉订阅失败即关：' + String((e as Error)?.message ?? e) })
    closeAll()
  }
}
