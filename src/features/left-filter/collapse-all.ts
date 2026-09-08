/** left-filter 一键收起（#64）：筛选条旁按钮，仅收当前可见工作区分组。
 * 纯原生点击语义（保证 React 状态一致，禁改 aria-expanded 造假）；已收起不动；
 * 被筛选藏起（data-left-filter="hidden" 祖先链）的不动；血统树（aria-level）永不动。
 * 无轮询、无存储、无跨 feature 引用；按钮随条带同生同灭。 */
import { isLineageNode } from '../../client/dom'
import { GROUP_SEL, HIDE_ATTR, HIDE_ON } from './dom-scope'

export const COLLAPSE_CLASS = 'left-filter-collapse'
export const COLLAPSE_LABEL = '收起'
export const COLLAPSE_TIP = '一键收起当前可见分组'

/* G 方案（2026-09-08 用户拍板）：圆圈 + 单箭头图标，无文本；含义走 title/aria-label 全文案兜底。 */
export const COLLAPSE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M5.8 9.6l2.2-2.2 2.2 2.2"/></svg>'

function info(msg: string): void {
  try { console.info('[dsh-im-companion] left-filter：' + msg) } catch { /* 无 console 静默 */ }
}

function isExpanded(row: Element): boolean {
  try { return row.getAttribute('aria-expanded') === 'true' } catch { return false }
}

/** 是否被筛选藏起：自身或任一祖先带 data-left-filter="hidden" 即不可见（display:none 同源）。 */
export function isHiddenByFilter(row: Element): boolean {
  try {
    let n: Element | null = row
    while (n) {
      try {
        const tag = String(n.tagName ?? '').toLowerCase()
        if (tag === 'body' || tag === 'html') return false
        if (typeof n.getAttribute === 'function' && n.getAttribute(HIDE_ATTR) === HIDE_ON) return true
      } catch { /* 单层失败继续上行 */ }
      try { n = n.parentElement } catch { return false }
    }
  } catch { /* 遍历失败按可见处理，调用方再验 */ }
  return false
}

export function isCollapseTarget(row: Element | null | undefined): boolean {
  try {
    if (!row || typeof (row as Element).getAttribute !== 'function') return false
    if (isLineageNode(row)) return false
    if (!isExpanded(row)) return false
    if (isHiddenByFilter(row)) return false
    return true
  } catch { return false }
}

/** 容器内快照一次：可见且展开的非血统分组行（扁平/嵌套通用；搜索 button 行天然排除）。 */
export function collectCollapseTargets(container: Element | null | undefined): Element[] {
  const out: Element[] = []
  try {
    if (!container || typeof (container as Element).querySelectorAll !== 'function') return out
    let list: ArrayLike<Element> | null = null
    try { list = (container as Element).querySelectorAll(GROUP_SEL) } catch { return out }
    if (!list) return out
    try { Array.prototype.forEach.call(list, (n: Element) => { if (isCollapseTarget(n)) out.push(n) }) } catch { /* 遍历失败即空 */ }
  } catch { /* 查询失败即空 */ }
  return out
}

function saveScroll(container: Element | null): Array<{ el: Element; top: number; left: number }> {
  const saved: Array<{ el: Element; top: number; left: number }> = []
  try {
    const seen = new Set<Element>()
    const push = (el: Element | null | undefined): void => {
      try {
        if (!el || seen.has(el)) return
        seen.add(el)
        const h = el as unknown as { scrollTop?: unknown; scrollLeft?: unknown }
        if (typeof h.scrollTop === 'number' || typeof h.scrollLeft === 'number') {
          saved.push({ el, top: typeof h.scrollTop === 'number' ? (h.scrollTop as number) : 0, left: typeof h.scrollLeft === 'number' ? (h.scrollLeft as number) : 0 })
        }
      } catch { /* 单个失败忽略 */ }
    }
    try { push(container) } catch { /* 忽略 */ }
    try {
      let n: Element | null = container
      while (n) {
        try {
          const tag = String(n.tagName ?? '').toLowerCase()
          if (tag === 'body' || tag === 'html') break
          push(n)
          n = n.parentElement
        } catch { break }
      }
    } catch { /* 上行失败忽略 */ }
  } catch { /* 保存失败忽略 */ }
  return saved
}

function restoreScroll(saved: Array<{ el: Element; top: number; left: number }>): void {
  try {
    for (const s of saved) {
      try {
        const h = s.el as unknown as { scrollTop?: unknown; scrollLeft?: unknown }
        if (typeof h.scrollTop === 'number') h.scrollTop = s.top
        if (typeof h.scrollLeft === 'number') h.scrollLeft = s.left
      } catch { /* 单个恢复失败忽略 */ }
    }
  } catch { /* 恢复失败忽略 */ }
}

/** 对单行触发一次原生折叠（真实点击语义；禁止改 aria-expanded 造假）。 */
function collapseOne(row: Element): boolean {
  try {
    const el = row as unknown as { click?: unknown; dispatchEvent?: unknown }
    if (typeof el.click === 'function') {
      try { (el.click as () => void).call(row); return true } catch { /* 掉到 dispatch */ }
    }
    try {
      const doc = (row as unknown as { ownerDocument?: Document }).ownerDocument ?? (typeof document !== 'undefined' ? document : null)
      const Ctor = (doc?.defaultView?.MouseEvent ?? (typeof MouseEvent !== 'undefined' ? MouseEvent : null)) as unknown as (new (t: string, i: object) => Event) | null
      if (doc && typeof (row as unknown as { dispatchEvent?: unknown }).dispatchEvent === 'function' && Ctor) {
        const ev: Event = new Ctor('click', { bubbles: true, cancelable: true })
        if (!ev) return false
        try { ((row as unknown as { dispatchEvent: (e: Event) => void }).dispatchEvent).call(row, ev); return true } catch { return false }
      }
    } catch { /* dispatch 失败忽略 */ }
  } catch { /* 单行失败忽略 */ }
  return false
}

/** 逐个折叠快照；折叠后不抢焦点、不滚动跳动；返回实际触发数。 */
export function collapseGroups(targets: Element[], container: Element | null = null): number {
  if (!targets.length) { info('一键收起：当前可见分组均已收起，无需操作'); return 0 }
  let active: Element | null = null
  try { active = (typeof document !== 'undefined' ? document.activeElement : null) as Element | null } catch { active = null }
  const saved = saveScroll(container)
  let n = 0
  try {
    for (const row of targets) {
      try { if (collapseOne(row)) n++ } catch { /* 单行失败继续 */ }
    }
  } catch { /* 遍历失败忽略 */ }
  try { restoreScroll(saved) } catch { /* 忽略 */ }
  try {
    if (active && typeof document !== 'undefined' && document.activeElement !== active && typeof (active as unknown as { focus?: unknown }).focus === 'function') {
      try { (active as unknown as { focus: (o?: object) => void }).focus.call(active, { preventScroll: true }) } catch {
        try { (active as unknown as { focus: () => void }).focus.call(active) } catch { /* 恢复失败忽略 */ }
      }
    }
  } catch { /* 焦点恢复失败忽略 */ }
  info('一键收起：已收起 ' + n + ' 组可见分组')
  return n
}

/** 条带点击入口：以条带父容器为界收起可见组（不在条带容器里的血统/设置树永不动）。 */
export function collapseFromStrip(strip: Element | null | undefined): number {
  try {
    if (!strip) return 0
    let container: Element | null = null
    try { container = strip.parentElement } catch { container = null }
    if (!container) return 0
    const targets = collectCollapseTargets(container)
    return collapseGroups(targets, container)
  } catch { return 0 }
}

/** 条带旁幂等挂按钮（与三段同一行；随条带同生同灭，fail-closed 无条带则不挂）。 */
export function ensureCollapseBtn(strip: Element | null | undefined): Element | null {
  try {
    if (!strip || typeof document === 'undefined') return null
    let btn: Element | null = null
    try { btn = strip.querySelector('.' + COLLAPSE_CLASS) } catch { btn = null }
    if (btn) return btn
    const doc = strip.ownerDocument ?? document
    btn = doc.createElement('button')
    btn.setAttribute('class', COLLAPSE_CLASS)
    btn.setAttribute('type', 'button')
    btn.setAttribute('title', COLLAPSE_TIP)
    btn.setAttribute('aria-label', COLLAPSE_TIP)
    try { (btn as HTMLElement).innerHTML = COLLAPSE_SVG } catch { try { (btn as HTMLElement).textContent = COLLAPSE_LABEL } catch { /* 无内容环境留空钮（aria-label 仍可读） */ } }
    try {
      btn.addEventListener('click', (e: Event) => {
        try { e.stopPropagation() } catch { /* 阻断失败忽略 */ }
        try { collapseFromStrip(strip) } catch { /* 折叠失败不抛 */ }
      })
    } catch { /* 监听失败忽略 */ }
    try { strip.appendChild(btn) } catch { return null }
    return btn
  } catch { return null }
}
