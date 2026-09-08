/** 轻量 DOM 构建器：h(tag, props, ...children)。组件层唯一的 DOM 创建入口。 */

export type ChildNode = Node | string | number | null | undefined | Array<ChildNode>
export type DomProps = Record<string, unknown>

const PROPERTY_KEYS = new Set(['checked', 'value', 'disabled', 'selected', 'multiple'])

function isNodeLike(c: unknown): boolean {
  return typeof c === 'object' && c !== null && 'nodeType' in (c as object) && 'appendChild' in (c as object)
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: DomProps | null,
  ...children: ChildNode[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  applyProps(el as HTMLElement, props)
  appendChildren(el as HTMLElement, children)
  return el
}

export function applyProps(el: HTMLElement, props?: DomProps | null): void {
  if (!props) return
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'className') {
      el.className = String(value)
    } else if (key === 'style') {
      if (typeof value === 'string') el.style.cssText = value
      else {
        const map = value as Record<string, string>
        for (const [sk, sv] of Object.entries(map)) (el.style as unknown as Record<string, string>)[sk] = sv
      }
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value as Record<string, string>)) el.dataset[dk] = dv
    } else if (key === 'html') {
      el.innerHTML = String(value)
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (PROPERTY_KEYS.has(key)) {
      ;(el as unknown as Record<string, unknown>)[key] = value
    } else {
      el.setAttribute(key, String(value))
    }
  }
}

export function appendChildren(el: HTMLElement, children: ChildNode[]): void {
  const list = ([] as unknown[]).concat(...(children as unknown[])) as unknown[]
  for (const c of list) {
    if (c === null || c === undefined) continue
    if (typeof c === 'string' || typeof c === 'number') {
      el.appendChild(document.createTextNode(String(c)))
    } else if (isNodeLike(c)) {
      el.appendChild(c as unknown as Node)
    }
  }
}

export function mount(el: HTMLElement, children: ChildNode | ChildNode[]): void {
  el.replaceChildren()
  const list = Array.isArray(children) ? children : [children]
  appendChildren(el, list)
}

export function clear(el: HTMLElement): void {
  el.replaceChildren()
}

/** 侧栏宽度作用域（2026-09-08 幽灵黄行修复）：只认侧栏宽度的行，排除主面板宽节点。
 * design-preview 之前全文档扫 div[role=treeitem]，把主面板里的折叠块/消息状态点
 * 当成会话行归因给最后一组——点选不同会话→主面板内容变→组色跟着变，且组黄时组里无黄行。
 * 侧栏行约 300px（上限见 WORKSPACE_LIST_MAX_WIDTH）；主面板宽节点一律跳过。
 * 无布局环境（单测桩无 getBoundingClientRect / 宽 0）中性通过，既有验证行为不变。 */
export function fitsSidebarWidth(el: Element | null | undefined): boolean {
  try {
    if (!el) return false
    const r = (el as HTMLElement).getBoundingClientRect?.()
    const w = typeof r?.width === 'number' ? r.width : 0
    if (!Number.isFinite(w) || w <= 0) return true
    return w <= WORKSPACE_LIST_MAX_WIDTH
  } catch { return true }
}

/** 第一性原理头栏锚点（左栏三件套唯一真相源）。
 * DSH 未开放 workspace-rail 槽位，故锚点只能是原生头栏（有按钮、无 treeitem 行的那一行）。
 * 小机器人 + 漏斗挂头栏上，条带挂列表顶部但必须经头栏验货——猜错就藏（fail-closed），宁可缺席不许贴错。
 * 新增导出（契约 §3：共享层只加导出，既有行为不动）。 */
export const WORKSPACE_HEADER_MAX_WIDTH = 400
export const WORKSPACE_LIST_MAX_WIDTH = 380

function hasBtn(el: Element | null | undefined): boolean {
  try { return !!el && typeof (el as Element).querySelector === 'function' && !!(el as Element).querySelector('button') } catch { return false }
}

function hasRow(el: Element | null | undefined): boolean {
  try {
    if (!el || typeof (el as Element).querySelector !== 'function') return false
    try { if ((el as Element).querySelector('[role="treeitem"]')) return true } catch { /* 选择器不支持就换精确口径 */ }
    /* 单测桩仅实现精确选择器与类选择器（tools/verify/features/left-filter.ts），逐个试 */
    try {
      const q = (el as Element).querySelectorAll
      if (typeof q === 'function') {
        try { if (q.call(el, 'div[role="treeitem"][aria-expanded]').length > 0) return true } catch { /* 继续 */ }
        try { if (q.call(el, 'button[role="treeitem"]').length > 0) return true } catch { /* 继续 */ }
      }
    } catch { /* 无 querySelectorAll 就走手动遍历 */ }
    /* 手动遍历兜底（真 DOM 与桩都可用；子树小，成本可忽略） */
    try {
      const stack: Element[] = [el]
      while (stack.length) {
        const cur = stack.pop() as Element
        try { if (cur !== el && (cur as Element).getAttribute?.('role') === 'treeitem') return true } catch { /* 单节点失败继续 */ }
        try {
          const kids = (cur as Element).children
          if (kids) Array.prototype.forEach.call(kids, (k: Element) => stack.push(k))
        } catch { /* 无子继续 */ }
      }
    } catch { /* 遍历失败即无行 */ }
    return false
  } catch { return false }
}

function rectWidth(el: Element): number {
  try {
    const r = (el as HTMLElement).getBoundingClientRect?.()
    const w = typeof r?.width === 'number' ? r.width : 0
    return Number.isFinite(w) ? w : 0
  } catch { return 0 }
}

/** 自家节点：我们注入的条带/头钮/入口/空提示。找头栏时必须跳过，否则条带（有按钮、无行）
 * 会被误认为头栏，漏斗就会被挂进条带里（2026-09-07 真机回归：第二轮 paint 自匹配）。
 * 注意：仅含头钮/入口的仍是真头栏（那是我们上一轮挂对的证明），只有“自身是注入节点”或
 * “子树含条带/空提示（=列表侧容器）”才跳过。 */
export function isOwnNode(el: Element | null | undefined): boolean {
  try {
    if (!el || typeof (el as Element).querySelector !== 'function') return false
    const cls = String((el as Element).getAttribute?.('class') ?? (el as unknown as { className?: unknown }).className ?? '')
    if (cls.includes('left-filter-strip') || cls.includes('left-filter-empty') || cls.includes('left-filter-hbtn') || cls.includes('adopt-entry')) return true
    for (const s of ['left-filter-strip', 'left-filter-empty']) {
      try { if ((el as Element).querySelector('.' + s)) return true } catch { /* 该选择器继续下一个 */ }
    }
    return false
  } catch { return false }
}

/** 头栏验货：有按钮、无行、非自家、已连接、宽度像侧栏（无布局环境如单测桩跳过宽度项）。 */
export function isPlausibleWorkspaceHeader(el: Element | null | undefined): boolean {
  try {
    if (!el) return false
    const tag = String((el as Element).tagName ?? '').toLowerCase()
    if (tag === 'body' || tag === 'html') return false
    try { if ((el as unknown as { isConnected?: boolean }).isConnected === false) return false } catch { /* 无 isConnected 环境视为已连接 */ }
    if (isOwnNode(el)) return false
    if (!hasBtn(el) || hasRow(el)) return false
    const w = rectWidth(el)
    if (w > 0 && (w < 120 || w > WORKSPACE_HEADER_MAX_WIDTH)) return false
    return true
  } catch { return false }
}

/** 从任意种子节点（行或容器）上行找头栏：每层扫描“含按钮但不含行”的兄弟，首个验货通过即唯一锚。 */
export function findWorkspaceHeaderFromNode(seed: Element | null | undefined): Element | null {
  try {
    if (!seed) return null
    let path: Element | null = seed
    let node: Element | null = null
    try { node = (seed as Element).parentElement } catch { return null }
    for (let depth = 0; depth < 6 && node; depth++) {
      try {
        const tag = String(node.tagName ?? '').toLowerCase()
        if (tag === 'body' || tag === 'html') return null
        const kids: Element[] = []
        try { node.children && Array.prototype.forEach.call(node.children, (k: Element) => kids.push(k)) } catch { /* 本层无子就上一层 */ }
        for (const k of kids) {
          if (k === path) continue
          try { if (typeof k.contains === 'function' && k.contains(seed)) continue } catch { /* 无 contains 就当平级继续 */ }
          try {
            if (isOwnNode(k)) continue
            if (hasBtn(k) && !hasRow(k) && isPlausibleWorkspaceHeader(k)) return k
          } catch { /* 单个候选失败就下一个 */ }
        }
      } catch { /* 本层失败就上一层 */ }
      try { path = node; node = node.parentElement } catch { return null }
    }
    return null
  } catch { return null }
}

/** 列表容器验货：混入行外原生按钮或超宽即猜大了→藏条带。
 * 住在行里的按钮（行 hover 操作，[role="treeitem"] 子树内）不算混入——真机行内常带按钮，不排除就会永远误杀（2026-09-07 真机回归）。
 * 自家条带按钮（.left-filter-strip 内）与结果行/溢出按钮（role/aria-expanded）同样不算，避免自证无辜。
 * 无行不判死（搜索态、首绘空列表皆中性），只拦“行外按钮/超宽”两种必错态。 */
export function isPlausibleListContainer(el: Element | null | undefined): boolean {
  try {
    if (!el) return false
    const tag = String((el as Element).tagName ?? '').toLowerCase()
    if (tag === 'body' || tag === 'html') return false
    try { if ((el as unknown as { isConnected?: boolean }).isConnected === false) return false } catch { /* 忽略 */ }
    const w = rectWidth(el)
    if (w > 0 && w > WORKSPACE_LIST_MAX_WIDTH) return false
    try {
      const q = (el as Element).querySelectorAll?.('button') ?? []
      const btns: Element[] = []
      try { Array.prototype.forEach.call(q, (b: Element) => btns.push(b)) } catch { /* 类数组遍历失败即无按钮 */ }
      for (const b of btns) {
        try {
          /* 行内按钮（住在 [role="treeitem"] 子树里）不算混入：先 closest，后手动上行（单测桩无 closest）。 */
          let inRow = false
          try {
            const closer = (b as unknown as { closest?: (s: string) => Element | null }).closest
            if (typeof closer === 'function' && closer.call(b, '[role="treeitem"]')) inRow = true
          } catch { /* 无 closest 就手动上行 */ }
          if (!inRow) {
            try {
              let p: Element | null = (b as Element).parentElement
              while (p && p !== el) {
                try { if ((p as Element).getAttribute?.('role') === 'treeitem') { inRow = true; break } } catch { /* 单层失败继续上行 */ }
                try { p = p.parentElement } catch { break }
              }
            } catch { /* 上行失败即非行内 */ }
          }
          if (inRow) continue
          /* 自家按钮排除：先 closest，后手动上行（单测桩无 closest）。 */
          let self = false
          try {
            const closer = (b as unknown as { closest?: (s: string) => Element | null }).closest
            if (typeof closer === 'function' && (closer.call(b, '.left-filter-strip') || closer.call(b, '.left-filter-empty'))) self = true
          } catch { /* 无 closest 就手动上行 */ }
          if (!self) {
            try {
              let p: Element | null = (b as Element).parentElement
              while (p) {
                const c = String(p.getAttribute?.('class') ?? (p as unknown as { className?: unknown }).className ?? '')
                if (c.includes('left-filter-strip') || c.includes('left-filter-empty')) { self = true; break }
                try { p = p.parentElement } catch { break }
              }
            } catch { /* 上行失败即非自家 */ }
          }
          if (self) continue
          const cls = String((b as Element).getAttribute?.('class') ?? (b as unknown as { className?: unknown }).className ?? '')
          if (cls.includes('left-filter-hbtn') || cls.includes('left-filter-strip') || cls.includes('adopt-entry')) continue
          if ((b as Element).getAttribute?.('role') === 'treeitem') continue
          if ((b as Element).getAttribute?.('aria-expanded') !== null) continue
          return false
        } catch { /* 单钮失败忽略 */ }
      }
    } catch { /* 查不到按钮即无混入 */ }
    return true
  } catch { return false }
}
