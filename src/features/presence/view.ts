/** presence 动效总控（E1 · 方向 A，用户裁定）：不画任何点，只定档位 + 开关。
 * B1 拥有全部徽标视觉（文件零触碰）；本特性订阅 stream 计数 bound 行 → resolveMotion 定级 →
 * 写 body[data-presence-level]（full = 不写，B1 原生 1.6s；reduced = 2.8s；static = 停），
 * 档位经本特性样式作用到 B1 已有呼吸上。行与 rail 列表零写入（重渲染与增量渲染均无影响）。
 * 开关为 body 级悬浮小钮（自有图层， fixed 右下角，永不插入行间——rail 尾锚点在增量渲染下会卡进
 * 两组之间，已弃用）。无自有轮询；计数只读共享 bindings。 */
import { badgeForWorkspace, basenameOfPath } from '../../client/data/bindings'
import type { BotSnap } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'
import { resolveMotion, systemReduced, type MotionLevel } from './motion'

const ROW_SEL = 'div[role="treeitem"][aria-expanded]'
const LEVEL_ATTR = 'data-presence-level'
const TOGGLE_CLASS = 'presence-toggle'
const DOT_CLASS = 'presence-toggle-dot'

/* 代际哨兵（B1 同款教训）：热更新双挂载时只有最新一代定档并持有开关。 */
let activeGen = 0
const claimGen = (): number => { try { const w = window as unknown as Record<string, number>; w.__presenceGen = (w.__presenceGen || 0) + 1; return w.__presenceGen } catch { return 1 } }
const genAlive = (g: number): boolean => { try { return (window as unknown as Record<string, number>).__presenceGen === g } catch { return true } }

let toggle: HTMLButtonElement | null = null
let toggleOwner = 0

function info(msg: string): void {
  try { console.info('[dsh-im-companion] presence：' + msg) } catch { /* 无 console 静默 */ }
}

function textOf(el: Element): string {
  try { return typeof el.textContent === 'string' ? el.textContent.trim() : '' } catch { return '' }
}

function normPath(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase()
}

/** 行文本 → 规范 workspace（B1 同款映射口径的独立实现：只读共享 basename，不引他人 feature）。 */
export function resolveWorkspace(key: string, bots: BotSnap[]): string {
  const k = normPath(key).trim()
  if (!k) return key
  for (const b of bots) {
    if (b.workspace && (normPath(b.workspace) === k || normPath(basenameOfPath(b.workspace)) === k)) return b.workspace
    if (b.botName && normPath(b.botName).trim() === k) return b.workspace
  }
  return key
}

function collectRows(): Element[] {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return []
    return Array.from(document.querySelectorAll(ROW_SEL))
  } catch { return [] }
}

function paintBody(level: MotionLevel): void {
  try {
    if (typeof document === 'undefined' || !document.body) return
    if (level === 'full') document.body.removeAttribute(LEVEL_ATTR)
    else document.body.setAttribute(LEVEL_ATTR, level)
  } catch { /* body 不可写就跳过 */ }
}

/** 计数 bound 行（去重 workspace；未绑定不计；行上零写入）。 */
export function countBound(bots: BotSnap[], rows: Element[] = collectRows(), nowMs = Date.now()): number {
  let bound = 0
  const seen = new Set<string>()
  for (const row of rows) {
    try {
      const key = textOf(row)
      if (!key) continue
      const ws = resolveWorkspace(key, bots)
      if (seen.has(ws)) continue
      seen.add(ws)
      if (badgeForWorkspace(ws, bots, nowMs).kind !== 'unbound') bound++
    } catch { /* 单行失败不影响计数 */ }
  }
  return bound
}

function removeToggle(): void {
  try {
    if (toggle && toggle.parentNode && typeof toggle.parentNode.removeChild === 'function') toggle.parentNode.removeChild(toggle)
  } catch { /* 摘除失败忽略 */ }
}

/* 悬浮开关（自有图层）：直挂 body，fixed 定位，永不进入 rail 行间。 */
function ensureToggle(gen: number, manual: boolean, onFlip: () => void): void {
  try {
    if (typeof document === 'undefined' || !document.body) return
    if (!toggle) {
      const btn = document.createElement('button')
      btn.setAttribute('class', TOGGLE_CLASS)
      btn.setAttribute('type', 'button')
      const dot = document.createElement('span')
      dot.setAttribute('class', DOT_CLASS)
      dot.setAttribute('aria-hidden', 'true')
      const label = document.createElement('span')
      label.setAttribute('class', 'presence-toggle-label')
      btn.appendChild(dot)
      btn.appendChild(label)
      btn.addEventListener('click', () => { try { onFlip() } catch { /* 翻转失败忽略 */ } })
      toggle = btn as HTMLButtonElement
      toggleOwner = gen
    }
    toggleOwner = gen
    if (toggle.parentNode !== document.body) {
      try { document.body.appendChild(toggle) } catch { /* 挂载失败下次再试 */ }
    }
    const label = toggle.querySelector('.presence-toggle-label')
    const text = manual ? '动效已关' : '动效开'
    try {
      toggle.setAttribute('aria-pressed', manual ? 'true' : 'false')
      toggle.setAttribute('title', manual ? '点击恢复在场感动效' : '点击减少动态（无障碍）')
      if (label) label.textContent = text
    } catch { /* 状态同步失败忽略 */ }
  } catch { /* 建开关失败就无开关（fail-closed，动效照常） */ }
}

let loggedHit = false
let rafQueued = false

/** 挂载：订阅 stream + observer 跟随行增减（重算档位）；首轮快照前不写 body。 */
export function mountPresence(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  const myGen = claimGen()
  activeGen = myGen
  void activeGen
  let bots: BotSnap[] = []
  let hasSnap = false
  let manual = false
  let sys = systemReduced()
  let observer: MutationObserver | undefined
  let stopMedia: (() => void) | null = null
  const repaint = (): void => {
    if (!hasSnap || !genAlive(myGen)) return
    try {
      const bound = countBound(bots)
      const m = resolveMotion({ count: bound, manualReduced: manual, sysReduced: sys })
      paintBody(m.level)
      if (!loggedHit && collectRows().length > 0) { loggedHit = true; info('动效总控已接管（档位 ' + m.level + '，' + m.reason + '）') }
      ensureToggle(myGen, manual, () => {
        manual = !manual
        try { repaint() } catch { /* 翻转后重绘失败忽略 */ }
      })
    } catch { /* 定档失败下次再试 */ }
  }
  const schedule = (): void => {
    try {
      if (typeof requestAnimationFrame === 'function') {
        if (rafQueued) return
        rafQueued = true
        requestAnimationFrame(() => { rafQueued = false; repaint() })
      } else repaint()
    } catch { try { repaint() } catch { /* 忽略 */ } }
  }
  info('已挂载（动效总控，等 stream 首轮快照）')
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((snap: StreamSnapshot) => {
      bots = snap.bots
      hasSnap = snap.updatedAt > 0
      if (!genAlive(myGen) || !hasSnap) return
      repaint()
    })
  } catch { return noop }
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      const onChange = (): void => { try { sys = !!mq.matches; schedule() } catch { /* 忽略 */ } }
      try {
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', onChange)
          stopMedia = () => { try { mq.removeEventListener('change', onChange) } catch { /* 忽略 */ } }
        } else if (typeof (mq as unknown as { addListener?: (fn: () => void) => void }).addListener === 'function') {
          (mq as unknown as { addListener: (fn: () => void) => void }).addListener(onChange)
        }
      } catch { /* 监听失败就只读初值 */ }
    }
  } catch { /* 无 matchMedia 就只靠手动 */ }
  try {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => { if (hasSnap) schedule() })
      observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
    }
  } catch { /* 无 observer 就只靠快照重绘 */ }
  return () => {
    try { unsub?.() } catch { /* 清理失败忽略 */ }
    try { observer?.disconnect() } catch { /* 清理失败忽略 */ }
    try { stopMedia?.() } catch { /* 清理失败忽略 */ }
    try { if (toggleOwner === myGen) { removeToggle(); toggle = null } } catch { /* 忽略 */ }
    try {
      if (genAlive(myGen) && typeof document !== 'undefined') document.body?.removeAttribute?.(LEVEL_ATTR)
    } catch { /* 忽略 */ }
  }
}
