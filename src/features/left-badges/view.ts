/** left-badges 行属性视图：订阅 stream 快照 → 给工作区行写 data-lb-* 属性，徽标由 CSS 伪元素呈现。
 * 行上只读写三个无害属性（data-lb-kind/data-lb-label/title），不增删节点——重渲染无东西可吃。
 * 无自有轮询；徽标纯展示不可点（用户裁定，点击事件已退役）。 */
import { badgeForWorkspace } from '../../client/data/bindings'
import { EMPTY_WORKSPACE_INDEX, resolveRowWorkspace, workspaceIdOfRow, workspaceIndexOf, type WorkspaceIndex } from '../../client/data/workspace-index'
import { logLine, logOn } from '../../client/log'
import type { BotSnap } from '../../client/data/fleet-api'
import { mountHoverCard } from './hover-card'
import { buildCardData } from './card-model'
import { mountAssistantFaces } from './assistant-face'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'

/** 左侧工作区行钩子（DSH 本体取证：dsh-client-ui-workspace 以 div[role=treeitem][aria-expanded]
 * 渲染工作区分组行，会话行无 aria-expanded；类名系 CSS Modules 哈希、不可依赖）。
 * 行内唯一可见文本即工作区展示名（projectText>title），故 key 取行文本做名称匹配。 */
const ROW_SELECTORS = ['div[role="treeitem"][aria-expanded]']

/* 作用域说明（#6 真机教训）：禁止把扫描收窄到命中行的父容器——左栏重排会换掉整个容器，
 * 收窄即锁死在脱离文档的死子树上空画。列表仅数十行，全文档直查零成本。 */
let loggedFirstHit = false
let lastRowTotal = -1
/* #154：工作区注册表索引的取数口（组行按身份解析 ⇒ 读注册表快照；无自有轮询）。 */
let ctxGet: ((name: string) => unknown) | null = null
// paint-key retired ''
/* 代际哨兵：热更新/双挂载堆叠时只有最新一代画画（老代永久静默，防新旧打架闪烁）。 */
let activeGen = 0
const claimGen = (): number => { try { const w = window as unknown as Record<string, number>; w.__lbGen = (w.__lbGen || 0) + 1; return w.__lbGen } catch { return 1 } }
const genAlive = (g: number): boolean => { try { return (window as unknown as Record<string, number>).__lbGen === g } catch { return true } }

/* 关键节点人话（挂载/首次命中）：低频，走 ui.action（area=left-badges），不套开关守卫。 */
function info(msg: string): void {
  logLine('debug', 'ui.action', { area: 'left-badges', action: 'lifecycle', ok: true, message: msg })
}

function collectRows(): Element[] {
  const out: Element[] = []
  const seen = new Set<Element>()
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return out
    for (const sel of ROW_SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach((row) => {
          if (!seen.has(row)) {
            seen.add(row)
            out.push(row)
          }
        })
      } catch {
        /* 该选择器不支持就跳过 */
      }
    }
  } catch {
    /* 非浏览器环境静默 */
  }
  return out
}

function rowKey(row: Element): string {
  try {
    const t = typeof row.textContent === 'string' ? row.textContent : ''
    return t.trim()
  } catch {
    return ''
  }
}

function normPath(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase()
}

/** 行可见文本 + 行身份（data-row-key 的 workspaceId）→ 规范 workspace 路径（#154：共享层单点）。
 * 口径与 left-filter / presence 一致：身份 → 注册表标题 → 老口径字面匹配；
 * 解析不出 ⇒ ''（未解析哨兵），绝不把显示名当工作区标识。 */
export function resolveWorkspace(
  key: string,
  bots: BotSnap[],
  workspaceId = '',
  index: WorkspaceIndex = EMPTY_WORKSPACE_INDEX,
): string {
  return resolveRowWorkspace(key, workspaceId, index, bots).path
}

function basenameOf(ws: string): string {
  const parts = normPath(ws).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}



function paint(bots: BotSnap[], nowMs: number): void {
  if (!genAlive(activeGen)) return
  const rows = collectRows()
  /* #154：按行身份（data-row-key）解析归属；显示名只作兜底。 */
  const index = ctxGet ? workspaceIndexOf(ctxGet) : EMPTY_WORKSPACE_INDEX
  let decorated = 0
  const seenWs = new Set<string>()
  for (const row of rows) {
    try {
      const key = rowKey(row)
      if (!key) continue
      const ws = resolveWorkspace(key, bots, workspaceIdOfRow(row), index)
      if (seenWs.has(ws)) continue
      seenWs.add(ws)
      const badge = badgeForWorkspace(ws, bots, nowMs)
      if (typeof row.setAttribute !== 'function' || typeof row.removeAttribute !== 'function') continue
      if (badge.kind === 'unbound') {
        row.removeAttribute('data-lb-kind')
        row.removeAttribute('data-lb-label')
        row.removeAttribute('title')
        continue
      }
      row.setAttribute('data-lb-kind', badge.kind)
      row.setAttribute('data-lb-label', badge.label)
      row.removeAttribute('title')
      decorated++
    } catch {
      /* 单行失败不影响其他行 */
    }
  }
  if (!loggedFirstHit) {
    loggedFirstHit = true
    info('命中 ' + rows.length + ' 行，开始装饰')
  }
  if (rows.length !== lastRowTotal) {
    lastRowTotal = rows.length
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-badges', action: 'rows', ok: true, message: '行数 ' + rows.length + '，已装饰 ' + decorated })
  }
}

/* observer 回调经 rAF 合并（一帧最多画一次；无 rAF 环境同步直画，保证单测与旧宿主）。 */
let rafQueued = false
function schedulePaint(bots: BotSnap[]): void {
  const run = (): void => {
    rafQueued = false
    try {
      paint(bots, Date.now())
    } catch (e) {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-badges', action: 'paint-fail', ok: false, message: String((e as Error)?.message ?? e) })
    }
  }
  try {
    if (typeof requestAnimationFrame === 'function') {
      if (rafQueued) return
      rafQueued = true
      requestAnimationFrame(() => run())
    } else {
      run()
    }
  } catch {
    run()
  }
}

/** 挂载：订阅 stream + observer 跟随行增减；首轮快照到达前不绘制。 */
export function mountLeftBadges(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  let current: BotSnap[] = []
  let hasSnap = false
  /* #154：注册表取数口（惰性读；读不到就退回老口径字面匹配）。 */
  ctxGet = typeof ctx.get === 'function' ? (name: string) => ctx.get(name) : null
  let customNames: Record<string, string> = {}
  let observer: MutationObserver | undefined
  const faces = mountAssistantFaces(ctx.rpc)
  /* 每次 stream 快照都交给 faces 自己判定要不要真打 RPC（家表 TTL 60s + 仅待取图清单 ⇒ 空转不打桥）。
     旧实现只在挂载时调一次：首次取图超时后头像永不出现（#190 验收问题二）。 */
  const faceTick = (): void => {
    try {
      void faces.refresh()
    } catch { /* 脸刷新失败不影响徽标 */ }
  }
  const repaint = (): void => {
    if (!hasSnap) return
    try {
      paint(current, Date.now())
    } catch (e) {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-badges', action: 'paint-fail', ok: false, message: String((e as Error)?.message ?? e) })
    }
  }
  info('已挂载（选择器 ' + ROW_SELECTORS.join(' / ') + '，等 stream 首轮快照）')
  activeGen = claimGen()
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((snap: StreamSnapshot) => {
      current = snap.bots
      hasSnap = snap.updatedAt > 0
      try {
        const m = ctx.meta
        if (m && typeof m.loadMeta === 'function') {
          void m.loadMeta().then((doc) => {
            try {
              if (doc && doc.names) customNames = doc.names
            } catch {
              /* 名表刷新失败保留旧表 */
            }
          }).catch((e) => { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-badges', action: 'meta-fail', ok: false, message: '名表未刷新，保留旧表：' + String((e as Error)?.message ?? e) }) })
        }
      } catch {
        /* meta 未就绪下轮再试 */
      }
      if (!genAlive(activeGen)) return
      repaint()
      faceTick()
    })
  } catch (e) {
    logLine('error', 'feature.mount.fail', { feature: 'left-badges', message: String((e as Error)?.message ?? e) })
    return noop
  }
  faceTick()
  let stopHover: (() => void) | null = null
  try {
    stopHover = mountHoverCard({
      matchRow: (elm) => {
        try {
          if (!elm || typeof (elm as unknown as { closest?: unknown }).closest !== 'function') return null
          for (const sel of ROW_SELECTORS) {
            try {
              const hit = (elm as unknown as { closest: (s: string) => Element | null }).closest(sel)
              if (hit) return hit
            } catch {
              /* 该选择器跳过 */
            }
          }
          return null
        } catch {
          return null
        }
      },
      resolve: (row) => {
        try {
          const key = rowKey(row)
          if (!key) return null
          const index = ctxGet ? workspaceIndexOf(ctxGet) : EMPTY_WORKSPACE_INDEX
          const ws = resolveWorkspace(key, current, workspaceIdOfRow(row), index)
          const custom = customNames[ws] || customNames[basenameOf(ws)] || ''
          const snap = faces.snapshot()
          return buildCardData({
            workspacePath: ws,
            bots: current,
            homes: snap.homes,
            assistants: snap.assistants,
            images: snap.images,
            displayName: custom || undefined,
          })
        } catch {
          return null
        }
      },
    })
  } catch (e) {
    logLine('error', 'ui.render.fail', { area: 'left-badges', message: '悬浮卡挂载失败（徽标不受影响）：' + String((e as Error)?.message ?? e) })
  }
  try {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => schedulePaint(current))
      observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
    }
  } catch {
    /* 无 observer 就只靠快照重绘 */
  }
  return () => {
    try {
      unsub?.()
    } catch {
      /* 清理失败忽略 */
    }
    try {
      observer?.disconnect()
    } catch {
      /* 清理失败忽略 */
    }
    try {
      if (typeof stopHover === 'function') stopHover()
    } catch {
      /* 清理失败忽略 */
    }
  }
}
