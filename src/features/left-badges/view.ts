/** left-badges 叠加视图：订阅 stream 快照 → MutationObserver 装饰左侧工作区行。
 * 防御式挂载（选择器命中不了就静默），无自有轮询（数据唯一来源 connection-stream），
 * 点击只读：派发 OPEN_AGENT_EVENT，不做任何 mutation。 */
import { OPEN_AGENT_EVENT, badgeForWorkspace } from '../../client/data/bindings'
import type { BotSnap } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'

/** 左侧工作区行的候选钩子（逐个尝试；命中即用，未命中静默）。 */
const ROW_SELECTORS = ['[data-workspace-id]', '[data-workspace-path]']
const BADGE_CLASS = 'left-badges-badge'
const DOT_CLASS = 'left-badges-dot'
const LABEL_CLASS = 'left-badges-label'
const KEY_ATTR = 'data-left-badges'

function eachRow(fn: (row: Element) => void): void {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return
    const q = document.querySelectorAll.bind(document)
    for (const sel of ROW_SELECTORS) {
      try {
        q(sel).forEach(fn)
      } catch {
        /* 该选择器不支持就跳过 */
      }
    }
  } catch {
    /* 非浏览器环境静默 */
  }
}

function rowKey(row: Element): string {
  try {
    const byPath = typeof row.getAttribute === 'function' ? row.getAttribute('data-workspace-path') : null
    const byId = typeof row.getAttribute === 'function' ? row.getAttribute('data-workspace-id') : null
    return (byPath || byId || '').trim()
  } catch {
    return ''
  }
}

function normPath(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase()
}

/** key（行属性，可能是全路径或简称）→ bots 中的规范 workspace 路径；找不到就原样返回（判未绑定）。 */
export function resolveWorkspace(key: string, bots: BotSnap[]): string {
  const k = normPath(key).trim()
  if (!k) return key
  for (const b of bots) if (b.workspace && normPath(b.workspace) === k) return b.workspace
  const base = k.split('/').filter(Boolean).pop() ?? ''
  if (base) {
    for (const b of bots) {
      const p = normPath(b.workspace).split('/').filter(Boolean).pop() ?? ''
      if (p && p === base) {
        try {
          console.debug('[dsh-im-companion] 左栏行按简称匹配：' + key + ' → ' + b.workspace + '（同名工作区可能错绑）')
        } catch {
          /* 日志失败忽略 */
        }
        return b.workspace
      }
    }
  }
  return key
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

function decorateRow(row: Element, bots: BotSnap[], nowMs: number): void {
  const key = rowKey(row)
  if (!key) return
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
    if (prev === paintKey) return /* 无变化不碰 DOM（避免 observer 自激） */
    try {
      el.setAttribute('class', BADGE_CLASS + ' ' + badge.kind)
      el.setAttribute('title', badge.tooltip)
      el.setAttribute(KEY_ATTR, paintKey)
      const label = el.querySelector?.('.' + LABEL_CLASS)
      if (label) label.textContent = badge.label
    } catch {
      /* 更新失败下次快照再试 */
    }
    return
  }
  try {
    if (typeof document === 'undefined') return
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
  } catch {
    /* 创建失败下次快照再试 */
  }
}

function paint(bots: BotSnap[], nowMs: number): void {
  eachRow((row) => {
    try {
      decorateRow(row, bots, nowMs)
    } catch {
      /* 单行失败不影响其他行 */
    }
  })
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
      observer = new MutationObserver(() => repaint())
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
