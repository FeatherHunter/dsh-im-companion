/** left-badges 行属性视图：订阅 stream 快照 → 给工作区行写 data-lb-* 属性，徽标由 CSS 伪元素呈现。
 * 行上只读写三个无害属性（data-lb-kind/data-lb-label/title），不增删节点——重渲染无东西可吃。
 * 无自有轮询；徽标纯展示不可点（用户裁定，点击事件已退役）。 */
import { badgeForWorkspace } from '../../client/data/bindings'
import type { BotSnap, RpcCall } from '../../client/data/fleet-api'
import { collectCensus, reportDebug } from './debug-report'
import { buildCardData, mountHoverCard } from './hover-card'
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
/* TEMP-DEBUG(#6)：上报用（定位后删除） */
let debugRpc: RpcCall | null = null
let lastPaintKey = ''
/* 代际哨兵：热更新/双挂载堆叠时只有最新一代画画（老代永久静默，防新旧打架闪烁）。 */
let activeGen = 0
const claimGen = (): number => { try { const w = window as unknown as Record<string, number>; w.__lbGen = (w.__lbGen || 0) + 1; return w.__lbGen } catch { return 1 } }
const genAlive = (g: number): boolean => { try { return (window as unknown as Record<string, number>).__lbGen === g } catch { return true } }

function info(msg: string): void {
  try {
    console.info('[dsh-im-companion] left-badges：' + msg)
  } catch {
    /* 无 console 环境静默 */
  }
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

/** key（行可见文本 = 工作区展示名）→ bots 中的规范 workspace 路径；找不到就原样返回（判未绑定）。
 * 匹配面（大小写不敏感）：展示名 = 路径全等 / 路径 basename / Bot 名（覆盖重命名行）。 */
export function resolveWorkspace(key: string, bots: BotSnap[]): string {
  const k = normPath(key).trim()
  if (!k) return key
  for (const b of bots) {
    if (b.workspace && (normPath(b.workspace) === k || basenameOf(b.workspace) === k)) return b.workspace
    if (b.botName && normPath(b.botName).trim() === k) return b.workspace
  }
  return key
}

function basenameOf(ws: string): string {
  const parts = normPath(ws).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}



function paint(bots: BotSnap[], nowMs: number): void {
  if (!genAlive(activeGen)) return
  const rows = collectRows()
  let decorated = 0
  const seenWs = new Set<string>()
  for (const row of rows) {
    try {
      const key = rowKey(row)
      if (!key) continue
      const ws = resolveWorkspace(key, bots)
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
  /* TEMP-DEBUG(#6)：行数/已饰变化即上报一行（定位后删除） */
  try {
    const pk = rows.length + ':' + decorated
    if (pk !== lastPaintKey) {
      lastPaintKey = pk
      reportDebug(debugRpc, { kind: 'paint', rows: rows.length, decorated, ...collectCensus() })
    }
  } catch {
    /* 上报失败静默 */
  }
  if (!loggedFirstHit) {
    loggedFirstHit = true
    info('命中 ' + rows.length + ' 行，开始装饰')
  }
  if (rows.length !== lastRowTotal) {
    lastRowTotal = rows.length
    try {
      console.debug('[dsh-im-companion] left-badges：行数 ' + rows.length + '，已装饰 ' + decorated)
    } catch {
      /* 无 console 环境静默 */
    }
  }
}

/* observer 回调经 rAF 合并（一帧最多画一次；无 rAF 环境同步直画，保证单测与旧宿主）。 */
let rafQueued = false
function schedulePaint(bots: BotSnap[]): void {
  const run = (): void => {
    rafQueued = false
    try {
      paint(bots, Date.now())
    } catch {
      /* 绘制失败下次再试 */
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
  let observer: MutationObserver | undefined
  const repaint = (): void => {
    if (!hasSnap) return
    try {
      paint(current, Date.now())
    } catch {
      /* 绘制失败下次再试 */
    }
  }
  info('已挂载（选择器 ' + ROW_SELECTORS.join(' / ') + '，等 stream 首轮快照）')
  /* TEMP-DEBUG(#6)：挂载普查（定位后删除） */
  try {
    debugRpc = ctx.rpc ? ctx.rpc : null
    const noRpc = ctx.rpc ? false : true
    reportDebug(debugRpc, { kind: 'mount', rpcNull: noRpc, ...collectCensus() })
  } catch {
    /* 上报失败静默 */
  }
  activeGen = claimGen()
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((snap: StreamSnapshot) => {
      current = snap.bots
      hasSnap = snap.updatedAt > 0
      if (!genAlive(activeGen)) return
      /* TEMP-DEBUG(#6)：快照到达即上报（定位后删除） */
      try {
        const nfail = snap.failed ? snap.failed.length : 0
        reportDebug(debugRpc, { kind: 'snap', updatedAt: snap.updatedAt, bots: snap.bots.length, failed: nfail, hasSnap, ...collectCensus() })
      } catch {
        /* 上报失败静默 */
      }
      repaint()
    })
  } catch {
    /* 订阅失败即不挂载 */
    return noop
  }
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
          return buildCardData(resolveWorkspace(key, current), current)
        } catch {
          return null
        }
      },
    })
  } catch {
    /* 悬浮卡失败不影响徽标 */
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
