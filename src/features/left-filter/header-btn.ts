/** left-filter header 按钮：原生头栏里的第 4 个 28px 圆形按钮（漏斗），点击循环三态。
 * 与条带同源（同一 currentFilter）；tooltip 承载三数；激活态着色。绝不动原生三个按钮。
 * 头栏发现走共享唯一锚点（client/dom，第二步：猜错就藏），本文件只保留按钮行为。 */
import { findWorkspaceHeaderFromNode } from '../../client/dom'
import { FILTERS, FILTER_LABEL, type FilterId, type GroupCount } from './model'

export const HB_CLASS = 'left-filter-hbtn'
export const HB_ON = 'on'

const FUNNEL_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h12l-4.6 5.4v3.9l-2.8 1.7V8.9z"/></svg>'

export function nextFilter(f: FilterId): FilterId {
  return FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]
}

export function headerTip(filter: FilterId, counts: GroupCount): string {
  /* 地基补漏（a36e661 改名续尾）：三数口径统一走 FILTER_LABEL，不再硬编码已绑定/未绑定。 */
  return '绑定筛选：' + FILTER_LABEL[filter] + ' ' + counts[filter] + '（' + FILTER_LABEL.all + ' ' + counts.all + ' · ' + FILTER_LABEL.bound + ' ' + counts.bound + ' · ' + FILTER_LABEL.unbound + ' ' + counts.unbound + '），点击切换'
}

/** 头栏定位：唯一锚点（client/dom.findWorkspaceHeaderFromNode）。
 * 旧注释保留口径：从容器逐级上行，真机列表与头栏之间隔着多层容器；就近优先，头栏排在列表区之前。
 * 验货（有钮无行、宽度像侧栏）不通过即返回空——调用方 fail-closed 不挂按钮。 */
export function resolveHeader(container: Element): Element | null {
  try { return findWorkspaceHeaderFromNode(container) } catch { return null }
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
