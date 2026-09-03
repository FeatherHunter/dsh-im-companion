/** left-filter DOM 作用域：隐藏单元判定 + 节点藏显/名牌（纯 DOM，无业务状态）。
 * 法医结论（Round 6）：组行常被悬停卡片包一层独占 div，会话是该包的兄弟而非组行的兄弟——
 * 故隐藏单元不能是“组行父级”，而是“子树只含本组的最小祖先”；扁平列表则退化为组行 + 后续会话兄弟。 */
export const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'
export const RESULT_SEL = 'button[role="treeitem"]'
export const HIDE_ATTR = 'data-left-filter'
export const HIDE_ON = 'hidden'
export const TIP_ATTR = 'data-lf-tip'

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

/** 本组独占的最小祖先：上行直到“子树含 ≥2 组行”的父级，停在其子（即我们这条线）。
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
      if (n >= 2) break
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
