/** C1a 抽屉容器：事件开合 + 写透 + stream 保活（P0-3）。 */
import { mount } from '../../client/dom'
import { showSheet } from '../../client/ui/sheet'
import { toast } from '../../client/ui/toast'
import { chooseBot, runTestSend } from '../../client/data/header-overlay'
import type { FeatureCtx } from '../protocol'
import type { OpenDrawerDetail } from '../../client/data/config'
import { OPEN_DRAWER_EVENT, buildDrawerModel, type DrawerModel } from './data'
import { renderDrawerContent, type DrawerCallbacks } from './view'

let currentClose: (() => void) | null = null

export interface PanelRect {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SheetGeom {
  top: number
  right: number
  bottom: number
  width: number
}

/** 抽屉贴设置面板右沿（真机体验反馈）：fixed 相对视口，用面板矩形反推四边；面板找不到回 null（调用方保持视口右沿兜底）。 */
export function sheetGeometry(panel: PanelRect | null, viewport: { width: number; height: number }): SheetGeom | null {
  if (!panel || !(viewport.width > 0 && viewport.height > 0)) return null
  const pw = panel.right - panel.left
  if (!(pw > 0)) return null
  const width = pw < 420 ? Math.max(0, pw) : 360
  return {
    top: Math.max(0, Math.round(panel.top)),
    right: Math.max(0, Math.round(viewport.width - panel.right)),
    bottom: Math.max(0, Math.round(viewport.height - panel.bottom)),
    width: Math.round(width),
  }
}

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
    const model = buildDrawerModel(lastBots, meta, key)
    if (!model) {
      closeAll()
      return
    }
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
  const cbs = (model: DrawerModel): DrawerCallbacks => ({
    onPreset: (id) => {
      if (id === 'custom') {
        paint()
        return
      }
      void (async () => {
        try {
          await fctx.meta.setPreset(model.storeKey, id)
          await reloadMeta()
          toast('预设已保存', 'check')
        } catch (e) {
          toast('保存失败：' + String((e as Error)?.message ?? e))
        }
        paint()
      })()
    },
    onCustomName: (name) => {
      const v = name.trim()
      void (async () => {
        try {
          await fctx.meta.setPreset(model.storeKey, v ? 'custom:' + v : 'default')
          await reloadMeta()
          toast('预设已保存', 'check')
        } catch (e) {
          toast('保存失败：' + String((e as Error)?.message ?? e))
        }
        paint()
      })()
    },
    onToggleCtx: () => {
      void (async () => {
        try {
          await fctx.meta.setCtx(model.storeKey, { enabled: !model.ctx.enabled, level: model.ctx.level })
          await reloadMeta()
          toast('上下文增强已保存', 'check')
        } catch (e) {
          toast('保存失败：' + String((e as Error)?.message ?? e))
        }
        paint()
      })()
    },
    onLevel: (lv) => {
      void (async () => {
        try {
          await fctx.meta.setCtx(model.storeKey, { enabled: model.ctx.enabled, level: lv })
          await reloadMeta()
          toast('上下文增强已保存', 'check')
        } catch (e) {
          toast('保存失败：' + String((e as Error)?.message ?? e))
        }
        paint()
      })()
    },
    onSaveWorkspace: (path) => {
      const ws = path.trim()
      if (!ws || !(ws.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ws))) {
        toast('请输入绝对路径形式的工作区目录')
        return
      }
      if (!fctx.rpc) {
        toast('连接服务不可用')
        return
      }
      if (!model.bots.length) {
        toast('该 Agent 尚未绑定机器人')
        return
      }
      void (async () => {
        try {
          for (const b of model.bots) {
            await fctx.rpc?.('/' + b.channel, 'bot.workspace.set', { botId: b.botId, workspace: ws }, AbortSignal.timeout(8000))
          }
          toast('绑定工作区已保存', 'check')
          await fctx.refresh()
        } catch (e) {
          toast('保存失败：' + String((e as Error)?.message ?? e))
        }
      })()
    },
    onRemoveBot: (channel, botId) => {
      if (!fctx.rpc) {
        toast('连接服务不可用')
        return
      }
      void (async () => {
        try {
          await fctx.rpc?.('/' + channel, 'bot.delete', { botId, confirm: true }, AbortSignal.timeout(8000))
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
  })
  let unsub: () => void = () => undefined
  try {
    unsub = fctx.subscribe((snap) => {
      lastBots = snap.bots
      paint()
    })
  } catch {
    closeAll()
  }
}
