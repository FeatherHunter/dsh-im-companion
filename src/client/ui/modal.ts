/** Apple 风格弹层：遮罩 + 圆角卡片；Escape/点遮罩关闭。 */
import { h } from '../dom'
import type { ChildNode } from '../dom'

export interface ModalHandle {
  el: HTMLElement
  close(): void
}

export function showModal(children: ChildNode[], opts?: { onClose?: () => void }): ModalHandle {
  const card = h('div', { className: 'af-modal', role: 'dialog', 'aria-modal': 'true' }, ...children)
  const overlay = h('div', { className: 'af-overlay' }, card)
  document.body.appendChild(overlay)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
    opts?.onClose?.()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e: Event) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  return { el: card, close }
}
