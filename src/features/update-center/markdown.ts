/** 版本说明的行内 Markdown 轻渲染（owner 2026-09-12 裁定：说明区不能露裸 `**`）。
 * 只认三种行内记号：**粗体**、`行内码`、[文字](链接)；其余原样输出。
 * **安全**：说明文本来自网络（CHANGELOG），故一律 createElement + textContent 直建，
 * 零 innerHTML、零 eval；链接只放 http(s) 且带 rel="noreferrer noopener"。
 * 解析刻意保持"够用就好"：不处理嵌套、不处理跨行，避免自造一个不完整的 Markdown 引擎。 */
import { h } from '../../client/dom'

const TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g

function linkNode(label: string, href: string): Node {
  const safe = /^https?:\/\//i.test(href)
  if (!safe) return document.createTextNode(label)
  const a = h('a', { className: 'update-center-note-link', href, target: '_blank', rel: 'noreferrer noopener' })
  a.textContent = label
  return a
}

/** 把一行说明切成「文本 / 粗体 / 行内码 / 链接」节点序列。 */
export function inlineNodes(text: string): Node[] {
  const out: Node[] = []
  const src = String(text ?? '')
  let last = 0
  for (const m of src.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(document.createTextNode(src.slice(last, at)))
    const tok = m[0]
    if (tok.startsWith('**')) {
      const b = h('b', {})
      b.textContent = tok.slice(2, -2)
      out.push(b)
    } else if (tok.startsWith('`')) {
      const c = h('code', { className: 'update-center-note-code' })
      c.textContent = tok.slice(1, -1)
      out.push(c)
    } else {
      const cut = tok.indexOf('](')
      out.push(linkNode(tok.slice(1, cut), tok.slice(cut + 2, -1)))
    }
    last = at + tok.length
  }
  if (last < src.length) out.push(document.createTextNode(src.slice(last)))
  return out
}

/** 一行说明 → `<li>`（行内记号已渲染）。 */
export function noteItem(text: string): HTMLLIElement {
  const li = h('li', {})
  for (const node of inlineNodes(text)) li.appendChild(node)
  return li
}

/** 说明列表容器（无内容时返回 null，调用方按三态文案处理）。 */
export function notesList(items: string[]): HTMLUListElement | null {
  if (!Array.isArray(items) || items.length === 0) return null
  const ul = h('ul', { className: 'update-center-notes' })
  for (const item of items) ul.appendChild(noteItem(item))
  return ul
}
