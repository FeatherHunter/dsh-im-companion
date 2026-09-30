/** presence 动效总控（E1 · 方向 A，用户裁定）：不画任何点，只定档位 + 开关。
 * B1 拥有全部徽标视觉（文件零触碰）；本特性订阅 stream 计数 bound 行 → resolveMotion 定级 →
 * 写 body[data-presence-level]（full = 不写，B1 原生 1.6s；reduced = 2.8s；static = 停），
 * 档位经本特性样式作用到 B1 已有呼吸上。行与 rail 列表零写入（重渲染与增量渲染均无影响）。
 * 开关搬家（#98，用户裁定 2026-09-24）：右下角 body 悬浮胶囊退役。E1 当年弃「rail 行间锚点」是因
 * 增量渲染会把行内节点挤进两组之间（#19 ②），但**筛选条不是行**——`.left-filter-strip` 由 left-filter
 * 自建自守（#64 收起钮已在同一排证明稳定），故绿点改挂条带内、收起钮左侧。
 * 跨特性只读锚点（#98 裁定 M1，评审见票面触碰面自述）：只读对家类名 + 只挂自产 presence-* 节点，
 * 零 import、零对家改动；对家换类名或换条带 ⇒ 绿点静默消失（fail-closed），不报错、不影响其他功能。
 * 偏好持久化：读走既有 meta.get 全量快照、写走 meta.motion.set（见 prefs.ts），刷新/重启后仍记得「已关」。
 * 无自有轮询；计数只读共享 bindings。 */
import { badgeForWorkspace, basenameOfPath } from '../../client/data/bindings'
import type { BotSnap } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'
import { resolveMotion, systemReduced, type MotionLevel } from './motion'
import { readMotionOffResult, writeMotionOff } from './prefs'

const ROW_SEL = 'div[role="treeitem"][aria-expanded]'
const LEVEL_ATTR = 'data-presence-level'
/* 跨特性只读锚点（#98 裁定 M1）：条带与收起钮的类名归 left-filter 所有，本特性只读不写。 */
const STRIP_SEL = '.left-filter-strip'
const COLLAPSE_SEL = '.left-filter-collapse'
const BTN_CLASS = 'presence-motion-btn'
const DOT_CLASS = 'presence-motion-dot'
/* 无可视气泡（#98 裁定 Q7/Q10，用户「文案不加」）：只留不可见无障碍名，不写 title。 */
const LABEL_ON = '在场感动效：开，点击关闭'
const LABEL_OFF = '在场感动效：已关，点击开启'

/* 代际哨兵（B1 同款教训）：热更新双挂载时只有最新一代定档并持有开关。 */
let activeGen = 0
const claimGen = (): number => { try { const w = window as unknown as Record<string, number>; w.__presenceGen = (w.__presenceGen || 0) + 1; return w.__presenceGen } catch { return 1 } }
const genAlive = (g: number): boolean => { try { return (window as unknown as Record<string, number>).__presenceGen === g } catch { return true } }

let dotBtn: HTMLElement | null = null
let dotOwner = 0

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

/** 摘绿点：只从当前父节点摘自产节点（对家条带若已重建，旧节点随旧条带自然消失）。 */
function removeDot(): void {
  try {
    if (dotBtn && dotBtn.parentNode && typeof dotBtn.parentNode.removeChild === 'function') dotBtn.parentNode.removeChild(dotBtn)
  } catch { /* 摘除失败忽略 */ }
}

function findStrip(): Element | null {
  try {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null
    return document.querySelector(STRIP_SEL)
  } catch { return null }
}

/* 绿点开关（#98）：挂左栏筛选条内、收起钮左侧；条带缺席即不画（fail-closed，零副作用）。
 * 幂等：先在对家条带里认领既有 .presence-motion-btn，认不到才建——对家重建条带后下次重绘自动跟回。 */
function ensureDot(gen: number, manual: boolean, onFlip: () => void): void {
  try {
    if (typeof document === 'undefined') return
    const strip = findStrip() as unknown as {
      querySelector?: (s: string) => unknown
      insertBefore?: (n: Node, r: Node) => unknown
      appendChild?: (n: Node) => unknown
    } | null
    if (!strip || typeof strip.appendChild !== 'function') return
    let btn: HTMLElement | null = null
    try { btn = (typeof strip.querySelector === 'function' ? strip.querySelector('.' + BTN_CLASS) : null) as HTMLElement | null } catch { btn = null }
    if (!btn) {
      const el = document.createElement('button')
      el.setAttribute('class', BTN_CLASS)
      el.setAttribute('type', 'button')
      const dot = document.createElement('span')
      dot.setAttribute('class', DOT_CLASS)
      dot.setAttribute('aria-hidden', 'true')
      el.appendChild(dot)
      el.addEventListener('click', () => { try { onFlip() } catch { /* 翻转失败忽略 */ } })
      let collapse: Node | null = null
      try { collapse = (typeof strip.querySelector === 'function' ? strip.querySelector(COLLAPSE_SEL) : null) as Node | null } catch { collapse = null }
      try {
        if (collapse && typeof strip.insertBefore === 'function') strip.insertBefore(el, collapse)
        else strip.appendChild(el)
      } catch { return /* 挂不上就不持有（下次重绘再试） */ }
      btn = el
      dotBtn = el
      dotOwner = gen
      info('动效开关已挂到筛选条（收起钮左侧）')
    }
    if (btn === dotBtn) dotOwner = gen
    try {
      btn.setAttribute('aria-pressed', manual ? 'true' : 'false')
      btn.setAttribute('aria-label', manual ? LABEL_OFF : LABEL_ON)
    } catch { /* 状态同步失败忽略 */ }
  } catch { /* 建绿点失败就无绿点（fail-closed，动效照常） */ }
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
  /* 偏好定稿态（#98 重启持久化补丁）：mount 瞬间 `ctx.meta` 必未就绪（client 入口异步 ping），
   * 首帧直读即 `ok:false`（未知）——未知绝不等同「动效开」，下次快照再试，直到读到权威快照或用户先动手。 */
  let prefsOk = false
  let prefsLoading = false
  let prefsDirty = false
  const repaint = (): void => {
    if (!hasSnap || !genAlive(myGen)) return
    try {
      const bound = countBound(bots)
      const m = resolveMotion({ count: bound, manualReduced: manual, sysReduced: sys })
      paintBody(m.level)
      if (!loggedHit && collectRows().length > 0) { loggedHit = true; info('动效总控已接管（档位 ' + m.level + '，' + m.reason + '）') }
      ensureDot(myGen, manual, () => {
        manual = !manual
        prefsDirty = true
        prefsOk = true
        writeMotionOff(ctx, manual)
        try { repaint() } catch { /* 翻转后重绘失败忽略 */ }
      })
    } catch { /* 定档失败下次再试 */ }
  }
  /* 偏好回填（#98）：只在读到权威快照（ok:true）时定稿；未知（ok:false）保持默认「动效开」并等下次快照再试——
   * 绝不因读不到就把用户的动效关掉，也绝不把「未知」当「开」定稿。用户先动手则以手为准，不再回填覆盖。 */
  const tryLoadPrefs = async (): Promise<void> => {
    if (prefsOk || prefsLoading || prefsDirty || !genAlive(myGen)) return
    prefsLoading = true
    try {
      const r = await readMotionOffResult(ctx)
      if (!genAlive(myGen) || prefsDirty) return
      if (!r.ok) return /* 未知：保持默认，下次快照再试 */
      prefsOk = true
      if (r.off && !manual) {
        manual = true
        try { repaint() } catch { /* 回填后重绘失败下次再试 */ }
      }
    } catch { /* 回填失败下次再试 */ }
    finally { prefsLoading = false }
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
  /* 偏好回填（#98）：挂载即试一次（直读宿主，无 metaCache 竞态）；首轮快照后再试，直到定稿。 */
  void tryLoadPrefs()
  info('已挂载（动效总控，等 stream 首轮快照）')
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((snap: StreamSnapshot) => {
      bots = snap.bots
      hasSnap = snap.updatedAt > 0
      if (!genAlive(myGen) || !hasSnap) return
      if (!prefsOk) void tryLoadPrefs()
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
    try { if (dotOwner === myGen) { removeDot(); dotBtn = null } } catch { /* 忽略 */ }
    try {
      if (genAlive(myGen) && typeof document !== 'undefined') document.body?.removeAttribute?.(LEVEL_ATTR)
    } catch { /* 忽略 */ }
  }
}
