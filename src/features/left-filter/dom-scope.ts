/** left-filter DOM 作用域：隐藏单元判定 + 节点藏显/名牌（纯 DOM，无业务状态）。
 * 法医结论（Round 6）：组行常被悬停卡片包一层独占 div，会话是该包的兄弟而非组行的兄弟——
 * 故隐藏单元不能是“组行父级”，而是“子树只含本组的最小祖先”；扁平列表则退化为组行 + 后续会话兄弟。 */
export const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'
export const HIDE_ATTR = 'data-left-filter'
export const HIDE_ON = 'hidden'
export const TIP_ATTR = 'data-lf-tip'

/** #183 搜索态判定（决策：搜索态不参与筛选，维护者 2026-10-23 拍板）。
 * 实测锚点（DSH 2026-10-24 构建）：侧栏搜索框常驻 DOM（折叠时 opacity:0/width:0/tabindex=-1），
 * 故「输入框存在」不能当搜索态；非空白 query 会以单一扁平结果列表替换浏览树 ⇒ 以 value 非空判态。
 * 该输入框是当前构建唯一带 type="text" + maxlength 的常驻输入（maxlength 来自 SEARCH_QUERY_MAX_CODE_UNITS）；
 * 不用 role="searchbox"（现构建没有）；不用结果行 role=treeitem[aria-selected]（普通会话行同样带，会误判）。 */
export const SEARCH_INPUT_SEL = 'input[type="text"][maxlength]'

/** 侧栏搜索框当前是否有非空查询（=扁平结果列表在显示）。只读 DOM，失败一律按否（不误禁用筛选）。 */
export function searchQueryActive(): boolean {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false
    let active = false
    document.querySelectorAll(SEARCH_INPUT_SEL).forEach((el) => {
      try {
        const v = (el as HTMLInputElement).value
        if (!active && typeof v === 'string' && v.trim() !== '') active = true
      } catch { /* 单个输入失败忽略 */ }
    })
    return active
  } catch { return false }
}

function tagOf(el: Element | null | undefined): string {
  try { return String(el?.tagName ?? '').toLowerCase() } catch { return '' }
}

export function textOf(el: Element): string {
  try { return typeof el.textContent === 'string' ? el.textContent.trim() : '' } catch { return '' }
}

function isGroupRow(el: Element | null | undefined): boolean {
  try {
    if (!el || tagOf(el) !== 'div') return false
    return el.getAttribute('role') === 'treeitem' && el.getAttribute('aria-expanded') !== null
  } catch { return false }
}

function isSessionRow(el: Element | null | undefined): boolean {
  try {
    if (!el || tagOf(el) !== 'div') return false
    return el.getAttribute('role') === 'treeitem' && el.getAttribute('aria-expanded') === null
  } catch { return false }
}

function isOverflowBtn(el: Element | null | undefined): boolean {
  try {
    if (!el || tagOf(el) !== 'button') return false
    return el.getAttribute('aria-expanded') !== null
  } catch { return false }
}

/** 扁平列表退化：组行后面跟着的会话兄弟（遇下组行或异物即停）。 */
export function siblingSessions(row: Element): Element[] {
  const out: Element[] = []
  try {
    const p = row.parentElement
    if (!p) return out
    const pt = tagOf(p)
    if (pt === 'body' || pt === 'html') return out
    let s = row.nextElementSibling
    while (s) {
      if (isGroupRow(s)) break
      if (isSessionRow(s) || isOverflowBtn(s)) {
        out.push(s)
        try { s = s.nextElementSibling } catch { break }
        continue
      }
      break
    }
  } catch { /* 遍历失败就只藏组行 */ }
  return out
}

/** 官方列表容器（dsh-client-ui-workspace 真身：treeBody > list[role="tree"]）。
 * #94 单组树：只判「父级 ≥2 组行」时，全场只有 1 组 ⇒ 一路爬到应用根 ⇒ 条带被容器验货判死。 */
const LIST_ROLE = 'tree'
export function isListContainer(el: Element | null | undefined): boolean {
  try { return !!el && (el as Element).getAttribute?.('role') === LIST_ROLE } catch { return false }
}

/** 本组独占的最小祖先：上行直到“子树含 ≥2 组行”**或**官方列表容器（role="tree"）的父级，停在其子（即我们这条线）。
 * 若组行之父已含多组（扁平列表），返回组行 + 后续会话兄弟。 */
export function hideRootsFor(row: Element): Element[] {
  let node: Element = row
  try {
    for (;;) {
      let p: Element | null = null
      try { p = node.parentElement } catch { return [node] }
      if (!p) return [node]
      const pt = tagOf(p)
      if (pt === 'body' || pt === 'html') return [node]
      let n = -1
      try { n = p.querySelectorAll(GROUP_SEL).length } catch { return [node] }
      if (n >= 2 || isListContainer(p)) break
      node = p
    }
  } catch { return [node] }
  if (node === row) return [row, ...siblingSessions(row)]
  return [node]
}

export function setHidden(node: Element, hide: boolean): void {
  try {
    const el = node as HTMLElement
    if (hide) { el.setAttribute(HIDE_ATTR, HIDE_ON); el.style.display = 'none' }
    else if (el.getAttribute(HIDE_ATTR) === HIDE_ON) { el.removeAttribute(HIDE_ATTR); el.style.display = '' }
  } catch { /* 单节点失败忽略 */ }
}

export function restoreAll(): void {
  try {
    document.querySelectorAll('[' + HIDE_ATTR + '="' + HIDE_ON + '"]').forEach((n) => setHidden(n, false))
  } catch { /* 清理失败忽略 */ }
}

/** 数字降级：把「有助理 2」拆成标签 + span.left-filter-n（setLabel 会重置文本，每次重调，幂等）。
 * 纯 DOM 活儿：只拆自家条带里的分段按钮，不读业务状态。 */
export function tuneLabels(host: Element | null): void {
  try {
    if (!host || typeof host.querySelectorAll !== 'function') return
    host.querySelectorAll('.af-seg-item').forEach((btn) => {
      try {
        if (btn.querySelector('.left-filter-n')) return
        const m = /^(.*)\s+(\d+)$/.exec(textOf(btn))
        if (!m) return
        btn.textContent = m[1] + ' '
        const doc = btn.ownerDocument ?? document
        const span = doc.createElement('span')
        span.setAttribute('class', 'left-filter-n')
        span.textContent = m[2]
        btn.appendChild(span)
      } catch { /* 单钮失败忽略 */ }
    })
  } catch { /* 调整失败忽略 */ }
}

/** 行悬停名牌（只读 title 属性；打标以便卸载还原；行原生无 title，经核实）。 */
export function setRowTip(row: Element, tip: string): void {
  try {
    if (row.getAttribute(TIP_ATTR) !== '1') row.setAttribute(TIP_ATTR, '1')
    if (row.getAttribute('title') !== tip) row.setAttribute('title', tip)
  } catch { /* 单行失败忽略 */ }
}

export function clearTips(): void {
  try {
    document.querySelectorAll('[' + TIP_ATTR + ']').forEach((n) => {
      try { n.removeAttribute('title'); n.removeAttribute(TIP_ATTR) } catch { /* 单行失败忽略 */ }
    })
  } catch { /* 清理失败忽略 */ }
}
