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
