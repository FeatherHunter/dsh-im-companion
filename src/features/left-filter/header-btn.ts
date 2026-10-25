/** left-filter header 按钮：原生头栏里的第 4 个 28px 圆形按钮（漏斗），点击循环三态。
 * 与条带同源（同一 currentFilter）；tooltip 承载三数；激活态着色。绝不动原生三个按钮。
 * 头栏发现走共享唯一锚点（client/dom，第二步：猜错就藏），本文件只保留按钮行为。 */
import { findWorkspaceHeaderFromNode } from '../../client/dom'
import { logLine, logOn } from '../../client/log'
import { t } from '../../client/i18n'
import { FILTERS, filterLabel, type FilterId, type GroupCount } from './model'

export const HB_CLASS = 'left-filter-hbtn'
export const HB_ON = 'on'
/** #183 搜索态禁用形态：置灰 + aria-disabled + tooltip 说明「搜索态不参与筛选」。 */
export const HB_OFF = 'off'
export const SEARCH_TIP = '绑定筛选：搜索态不参与筛选（退出搜索后恢复），点击无效'

const FUNNEL_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h12l-4.6 5.4v3.9l-2.8 1.7V8.9z"/></svg>'

export function nextFilter(f: FilterId): FilterId {
  return FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]
}

export function headerTip(filter: FilterId, counts: GroupCount): string {
  /* 三数口径统一走词条表（#184）：中文模板内含「全部/有助理/无助理」，英文模板同构。 */
  return t('left-filter', 'header.tip', {
    label: filterLabel(filter),
    n: counts[filter],
    all: counts.all,
    bound: counts.bound,
    unbound: counts.unbound,
  })
}

/* #184 验收修：DSH 换语言会重建左栏头（真机：两枚插件头钮一起消失）。记着头节点身份，变了就报 true，
 * 调用方据此清签名强制重绘；同时记 debug 便于事后判定「钮是被换头带走的」。 */
let lastHeader: Element | null = null

export function headerChanged(header: Element | null): boolean {
  if (header === lastHeader) return false
  const had = !!lastHeader
  lastHeader = header
  if (had) {
    try { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'header-replace', ok: true, message: '头栏节点已变化（旧头注入钮随之失效）⇒ 强制重绘重挂；新头' + (header ? '已找到' : '未找到（fail-closed 等结构稳定）') }) } catch { /* 日志失败忽略 */ }
  }
  return true
}

/** 当前头里有没有漏斗钮（#184 验收修：签名加这一位，钮被摘掉而同头还在时也能越过短路重挂）。 */
export function hasHeaderBtn(header: Element | null): boolean {
  if (!header) return false
  try { return !!header.querySelector('.' + HB_CLASS) } catch { return false }
}

/** 头栏定位：唯一锚点（client/dom.findWorkspaceHeaderFromNode）。
 * 旧注释保留口径：从容器逐级上行，真机列表与头栏之间隔着多层容器；就近优先，头栏排在列表区之前。
 * 验货（有钮无行、宽度像侧栏）不通过即返回空——调用方 fail-closed 不挂按钮。 */
export function resolveHeader(container: Element): Element | null {
  try { return findWorkspaceHeaderFromNode(container) } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'anchor-fail', ok: false, message: '头栏锚点解析失败（fail-closed 不挂漏斗钮）：' + String((e as Error)?.message ?? e) }); return null }
}

export function updateHeaderBtn(btn: Element, filter: FilterId, counts: GroupCount, disabled = false): void {
  try {
    const el = btn as HTMLElement
    el.setAttribute('class', HB_CLASS + (disabled ? ' ' + HB_OFF : filter === 'all' ? '' : ' ' + HB_ON))
    const tip = disabled ? SEARCH_TIP : headerTip(filter, counts)
    el.setAttribute('title', tip)
    el.setAttribute('aria-label', tip)
    /* #183：搜索态禁用形态（置灰 + aria-disabled + 挡点击）；退出搜索自动恢复三数 tooltip。 */
    if (disabled) el.setAttribute('aria-disabled', 'true')
    else el.removeAttribute('aria-disabled')
  } catch { /* 更新失败下次再试 */ }
}

export function ensureHeaderBtn(header: Element, filter: FilterId, counts: GroupCount, onCycle: () => void, disabled = false): Element | null {
  try {
    if (typeof document === 'undefined') return null
    let btn: Element | null = null
    try { btn = header.querySelector('.' + HB_CLASS) } catch { btn = null }
    if (!btn) {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'header-reinject', ok: true, message: '头里没有漏斗钮（首挂/换头/被摘）⇒ 新建并挂上' })
      const fresh = document.createElement('button')
      fresh.setAttribute('class', HB_CLASS)
      fresh.setAttribute('type', 'button')
      try { (fresh as HTMLElement).innerHTML = FUNNEL_SVG } catch { /* 无 innerHTML 环境就纯按钮 */ }
      /* #183：禁用态只置灰 + 挡点击，不摘监听——退出搜索后同一颗按钮自动恢复循环。 */
      try { fresh.addEventListener('click', (e: Event) => { try { e.stopPropagation() } catch { /* 阻断失败忽略 */ } if (fresh.getAttribute('aria-disabled') === 'true') return; onCycle() }) } catch { /* 监听失败忽略 */ }
      try { header.appendChild(fresh) } catch { return null }
      btn = fresh
    }
    updateHeaderBtn(btn, filter, counts, disabled)
    return btn
  } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'header-btn-fail', ok: false, message: '漏斗钮创建失败（fail-closed 不挂）：' + String((e as Error)?.message ?? e) }); return null }
}

/** #183：已挂头钮的父级（原生头栏不重渲染，注入钮仍在原头栏）。
 * 搜索态组行消失、没有行种子可找头栏时，用它复用上一轮头栏（漏斗不闪退）。 */
export function headerOfInjectedBtn(): Element | null {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null
    const btns = document.querySelectorAll('.' + HB_CLASS)
    for (let i = 0; i < btns.length; i++) {
      const p = btns[i].parentElement
      if (p) return p
    }
  } catch { /* 复用失败按无头栏处理 */ }
  return null
}

export function removeHeaderBtns(): void {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return
    document.querySelectorAll('.' + HB_CLASS).forEach((n) => {
      try { n.parentNode && typeof n.parentNode.removeChild === 'function' && n.parentNode.removeChild(n) } catch { /* 单个摘除失败忽略 */ }
    })
  } catch { /* 清理失败忽略 */ }
}
