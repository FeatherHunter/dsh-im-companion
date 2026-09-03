/** left-filter header 按钮：原生头栏里的第 4 个 28px 圆形按钮（漏斗），点击循环三态。
 * 与条带同源（同一 currentFilter）；tooltip 承载三数；激活态着色。绝不动原生三个按钮。 */
import { FILTERS, FILTER_LABEL, type FilterId, type GroupCount } from './model'

export const HB_CLASS = 'left-filter-hbtn'
export const HB_ON = 'on'

const FUNNEL_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h12l-4.6 5.4v3.9l-2.8 1.7V8.9z"/></svg>'

export function nextFilter(f: FilterId): FilterId {
  return FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]
}

export function headerTip(filter: FilterId, counts: GroupCount): string {
  return '绑定筛选：' + FILTER_LABEL[filter] + ' ' + counts[filter] + '（全部 ' + counts.all + ' · 已绑定 ' + counts.bound + ' · 未绑定 ' + counts.unbound + '），点击切换'
}

/** 头栏定位：从容器逐级上行（最多 5 层，真机列表与头栏之间隔着多层容器），
 * 每层找“含 button 但不含 treeitem 行”的兄弟节点（不读文本，防 locale 差异；
 * 就近优先，文档顺序优先——头栏排在列表区之前，页脚不会抢先）。 */
export function resolveHeader(container: Element): Element | null {
  try {
    let path: Element | null = container
    let node: Element | null = null
    try { node = container.parentElement } catch { return null }
    for (let depth = 0; depth < 5 && node; depth++) {
      try {
        const tag = String(node.tagName ?? '').toLowerCase()
        if (tag === 'body' || tag === 'html') return null
        const kids: Element[] = []
        try { node.children && Array.prototype.forEach.call(node.children, (k: Element) => kids.push(k)) } catch { /* 本层无子就上一层 */ }
        for (const k of kids) {
          if (k === path) continue
          try {
            if (typeof k.contains === 'function' && k.contains(container)) continue
          } catch { /* 无 contains 就当平级继续 */ }
          try {
            const hasBtn = typeof k.querySelector === 'function' && !!k.querySelector('button')
            const hasRow = typeof k.querySelector === 'function' && !!k.querySelector('[role="treeitem"]')
            if (hasBtn && !hasRow) return k
          } catch { /* 单个候选失败就下一个 */ }
        }
      } catch { /* 本层失败就上一层 */ }
      try { path = node; node = node.parentElement } catch { return null }
    }
    return null
  } catch { return null }
}

export function updateHeaderBtn(btn: Element, filter: FilterId, counts: GroupCount): void {
  try {
    const el = btn as HTMLElement
    el.setAttribute('class', HB_CLASS + (filter === 'all' ? '' : ' ' + HB_ON))
    el.setAttribute('title', headerTip(filter, counts))
    el.setAttribute('aria-label', headerTip(filter, counts))
  } catch { /* 更新失败下次再试 */ }
}

export function ensureHeaderBtn(header: Element, filter: FilterId, counts: GroupCount, onCycle: () => void): Element | null {
  try {
    if (typeof document === 'undefined') return null
    let btn: Element | null = null
    try { btn = header.querySelector('.' + HB_CLASS) } catch { btn = null }
    if (!btn) {
      btn = document.createElement('button')
      btn.setAttribute('class', HB_CLASS)
      btn.setAttribute('type', 'button')
      try { (btn as HTMLElement).innerHTML = FUNNEL_SVG } catch { /* 无 innerHTML 环境就纯按钮 */ }
      try { btn.addEventListener('click', (e: Event) => { try { e.stopPropagation() } catch { /* 阻断失败忽略 */ } onCycle() }) } catch { /* 监听失败忽略 */ }
      try { header.appendChild(btn) } catch { return null }
    }
    updateHeaderBtn(btn, filter, counts)
    return btn
  } catch { return null }
}

export function removeHeaderBtns(): void {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return
    document.querySelectorAll('.' + HB_CLASS).forEach((n) => {
      try { n.parentNode && typeof n.parentNode.removeChild === 'function' && n.parentNode.removeChild(n) } catch { /* 单个摘除失败忽略 */ }
    })
  } catch { /* 清理失败忽略 */ }
}
