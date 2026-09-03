/** C1a 抽屉容器：事件开合 + 真系统写透 + stream 保活（P0-3）。
 * A'：预设/上下文直写 dsh-im 真接口（按 botId 逐渠道），读不到真值禁用写；host 自持账本弃用不断路。 */
import { mount } from '../../client/dom'
import { showSheet } from '../../client/ui/sheet'
import { toast } from '../../client/ui/toast'
import { chooseBot, runTestSend } from '../../client/data/header-overlay'
import type { AgentPresetCatalog } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import type { OpenDrawerDetail } from '../../client/data/config'
import {
  OPEN_DRAWER_EVENT, PRESET_MIXED, buildDrawerModel, ctxPayloadFor, loadingModel,
  presetPayloadFor, sheetGeometry, unwrapRpc, type DrawerBot, type DrawerModel,
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
    try {
      window.removeEventListener(OPEN_DRAWER_EVENT, onEvent as EventListener)
    } catch {
      /* ignore */
    }
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
        try {
          window.removeEventListener('resize', onResize)
        } catch {
          /* ignore */
        }
        if (currentClose === closeAll) currentClose = null
      },
    })
  } catch {
    toast('抽屉打开失败')
    return
  }
  currentClose = closeAll
  let settled = false
  let giveUp: ReturnType<typeof setTimeout> | null = null
  const clearGiveUp = (): void => {
    try {
      if (giveUp !== null) clearTimeout(giveUp)
    } catch {
      /* ignore */
    }
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
  const placeSheet = (): void => {
    try {
      if (!sheet || typeof window === 'undefined' || typeof document === 'undefined') return
      const el = document.querySelector('.af-root') as HTMLElement | null
      const r = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
      const g = sheetGeometry(
        r ? { top: r.top, right: r.right, bottom: r.bottom, left: r.left } : null,
        { width: window.innerWidth || 0, height: window.innerHeight || 0 },
      )
      if (!g || !sheet) return
      sheet.panel.style.top = g.top + 'px'
      sheet.panel.style.right = g.right + 'px'
      sheet.panel.style.bottom = g.bottom + 'px'
      sheet.panel.style.width = g.width + 'px'
    } catch {
      /* 定位失败保持视口右沿兜底 */
    }
  }
  const onResize = (): void => {
    if (!closed) placeSheet()
  }
  placeSheet()
  try {
    window.addEventListener('resize', onResize)
  } catch {
    /* 监听失败忽略（位置定格） */
  }
  const paint = (): void => {
    if (closed || !meta || !sheet) return
    const model = buildDrawerModel(lastBots, meta, key, lastCatalogs)
    if (!model) {
      if (settled) {
        settled = false
        toast('该 Agent 已不在列表，关闭抽屉')
        closeAll()
      } else {
        paintLoading()
      }
      return
    }
    settled = true
    clearGiveUp()
    try {
      mount(sheet.panel, renderDrawerContent(model, cbs(model)))
    } catch {
      /* keep old frame */
    }
  }
  const reloadMeta = async (): Promise<void> => {
    try {
      meta = await fctx.meta.loadMeta()
    } catch {
      /* keep old meta */
    }
  }
  /** 逐渠道写透：部分失败如实透出（失败渠道名），成功后 refresh 广播。 */
  const writeBots = async (
    model: DrawerModel, kind: string, run: (b: DrawerBot) => Promise<void>,
  ): Promise<void> => {
    if (!fctx.rpc) {
      toast('连接服务不可用')
      return
    }
    if (!model.bots.length) {
      toast('该 Agent 尚未绑定机器人')
      return
    }
    const fails: string[] = []
    let ok = 0
    let lastErr = ''
    for (const b of model.bots) {
      try {
        await run(b)
        ok++
      } catch (e) {
        fails.push(b.channel)
        lastErr = String((e as Error)?.message ?? e)
      }
    }
    if (!fails.length) toast(kind + '已写入真系统，新会话生效', 'check')
    else if (ok > 0) toast(kind + '部分写入（成功 ' + ok + ' 个），失败：' + fails.join('、'))
    else toast(kind + '写入失败：' + lastErr)
    try {
      await reloadMeta()
      await fctx.refresh()
    } catch {
      /* 刷新失败忽略（下轮 15s 自愈） */
    }
    paint()
  }
  const rpcOf = (channel: string, endpoint: string, payload: Record<string, unknown>): Promise<void> => {
    const rpc = fctx.rpc
    if (!rpc) return Promise.reject(new Error('连接服务不可用'))
    return rpc('/' + channel, endpoint, payload, AbortSignal.timeout(8000)).then((raw) => unwrapRpc(raw))
  }
  const cbs = (model: DrawerModel): DrawerCallbacks => {
    const flipCtx = (which: 'group' | 'direct', kind: string): void => {
      if (!model.ctxReady) {
        toast('上下文配置尚未读到，稍后再试（防覆盖已有配置）')
        return
      }
      const cur = which === 'group' ? model.ctxGroup : model.ctxDirect
      void writeBots(model, kind, (b) => {
        const cfg = ctxPayloadFor(b.ctx, which, cur !== true)
        if (!cfg) return Promise.reject(new Error('上下文真值缺失'))
        return rpcOf(b.channel, 'bot.context-enhancement.set', { botId: b.botId, config: cfg })
      })
    }
    return {
    onPreset: (id) => {
      if (id === PRESET_MIXED || !model.presetReady) {
        toast('预设真值尚未读全，稍后再试')
        paint()
        return
      }
      void writeBots(model, '预设', (b) => {
        const p = presetPayloadFor(b.botId, id)
        if (!p) return Promise.reject(new Error('预设 id 非法'))
        return rpcOf(b.channel, 'bot.preset.set', p)
      })
    },
    onToggleGroup: () => flipCtx('group', '群聊增强'),
    onToggleDirect: () => flipCtx('direct', '私聊增强'),
    onSaveWorkspace: (path) => {
      const ws = path.trim()
      if (!ws || !(ws.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ws))) {
        toast('请输入绝对路径形式的工作区目录')
        return
      }
      void writeBots(model, '绑定工作区', (b) => rpcOf(b.channel, 'bot.workspace.set', { botId: b.botId, workspace: ws }))
    },
    onRemoveBot: (channel, botId) => {
      if (!fctx.rpc) {
        toast('连接服务不可用')
        return
      }
      void (async () => {
        try {
          await rpcOf(channel, 'bot.delete', { botId, confirm: true })
          toast('渠道机器人已移除', 'check')
          await fctx.refresh()
        } catch (e) {
          toast('移除失败：' + String((e as Error)?.message ?? e))
        }
      })()
    },
    onTestSend: () => {
      void (async () => {
        try {
          const bot = chooseBot(lastBots, model.workspace)
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
    })
  } catch {
    closeAll()
  }
}
