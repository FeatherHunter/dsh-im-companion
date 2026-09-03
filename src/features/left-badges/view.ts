/** left-badges 叠加视图：订阅 stream 快照 → MutationObserver 装饰左侧工作区行。
 * 防御式挂载（选择器命中不了就静默），无自有轮询（数据唯一来源 connection-stream），
 * 点击只读：派发 OPEN_AGENT_EVENT，不做任何 mutation。 */
import { OPEN_AGENT_EVENT, badgeForWorkspace } from '../../client/data/bindings'
import type { BotSnap } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'

/** 左侧工作区行钩子（DSH 本体取证：dsh-client-ui-workspace 以 div[role=treeitem][aria-expanded]
 * 渲染工作区分组行，会话行无 aria-expanded；类名系 CSS Modules 哈希、不可依赖）。
 * 行内唯一可见文本即工作区展示名（projectText>title），故 key 取行文本做名称匹配。 */
const ROW_SELECTORS = ['div[role="treeitem"][aria-expanded]']
const BADGE_CLASS = 'left-badges-badge'
const DOT_CLASS = 'left-badges-dot'
const LABEL_CLASS = 'left-badges-label'
const KEY_ATTR = 'data-left-badges'

/* 扫描作用域：命中行后收窄到其父容器（消息流刷屏时不全文档扫描）；行消失回大局。null = 全文档。 */
let scope: Element | null = null
let loggedFirstHit = false
let lastRowTotal = -1

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
    if (typeof document === 'undefined') return out
    const root: Element | Document = scope ?? document
    if (typeof root.querySelectorAll !== 'function') return out
    for (const sel of ROW_SELECTORS) {
      try {
        root.querySelectorAll(sel).forEach((row) => {
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

/* TODO(#6)：OPEN_AGENT_EVENT 的消费者（设置面板 #agent= 高亮联动）在后续票落地；此前事件只发无收。 */
function emitOpenAgent(workspace: string, agent: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent(OPEN_AGENT_EVENT, { detail: { workspace, agent } }))
  } catch {
    /* 事件派发失败不影响徽标展示 */
  }
}

function decorateRow(row: Element, bots: BotSnap[], nowMs: number): boolean {
  const key = rowKey(row)
  if (!key) return false
  const ws = resolveWorkspace(key, bots)
  const badge = badgeForWorkspace(ws, bots, nowMs)
  const paintKey = badge.kind + '|' + badge.label + '|' + badge.tooltip
  let el: Element | null = null
  try {
    el = typeof row.querySelector === 'function' ? row.querySelector('.' + BADGE_CLASS) : null
  } catch {
    el = null
  }
  if (el) {
    let prev = ''
    try {
      prev = el.getAttribute?.(KEY_ATTR) ?? ''
    } catch {
      prev = ''
    }
    if (prev === paintKey) return true /* 无变化不碰 DOM（避免 observer 自激） */
    try {
      el.setAttribute('class', BADGE_CLASS + ' ' + badge.kind)
      el.setAttribute('title', badge.tooltip)
      el.setAttribute(KEY_ATTR, paintKey)
      const label = el.querySelector?.('.' + LABEL_CLASS)
      if (label) label.textContent = badge.label
    } catch {
      /* 更新失败下次快照再试 */
      return false
    }
    return true
  }
  try {
    if (typeof document === 'undefined') return false
    const host = document.createElement('span')
    host.setAttribute('class', BADGE_CLASS + ' ' + badge.kind)
    host.setAttribute('title', badge.tooltip)
    host.setAttribute(KEY_ATTR, paintKey)
    const dot = document.createElement('span')
    dot.setAttribute('class', DOT_CLASS)
    const label = document.createElement('span')
    label.setAttribute('class', LABEL_CLASS)
    label.textContent = badge.label
    host.appendChild(dot)
    host.appendChild(label)
    host.addEventListener('click', (ev) => {
      try {
        ev.stopPropagation()
      } catch {
        /* 阻止冒泡失败也继续派发 */
      }
      emitOpenAgent(badge.workspace, badge.agent)
    })
    row.appendChild(host)
    return true
  } catch {
    /* 创建失败下次快照再试 */
    return false
  }
}

function paint(bots: BotSnap[], nowMs: number): void {
  const rows = collectRows()
  if (!rows.length) {
    if (scope !== null) scope = null
    return
  }
  if (scope === null) {
    const parent = rows[0].parentElement
    if (parent) scope = parent
  }
  let decorated = 0
  for (const row of rows) {
    try {
      if (decorateRow(row, bots, nowMs)) decorated++
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

/** 挂载：订阅 stream + observer 重绘；首轮快照到达前不绘制（避免“未检查”闪成“未绑定”）。 */
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
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((snap: StreamSnapshot) => {
      current = snap.bots
      hasSnap = snap.updatedAt > 0
      repaint()
    })
  } catch {
    /* 订阅失败即不挂载 */
    return noop
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
  }
}
