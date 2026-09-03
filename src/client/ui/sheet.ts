/** 右侧 sheet 原语：遮罩 + 右锚定面板。 */
import { h } from '../dom'

export interface SheetOpts {
  overlayClass: string
  panelClass: string
  label: string
  onClose?: () => void
}

export interface SheetHandle {
  panel: HTMLElement
  close(): void
}

export function showSheet(opts: SheetOpts): SheetHandle {
  const panel = h('aside', { className: opts.panelClass, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label })
  const overlay = h('div', { className: opts.overlayClass }, panel)
  document.body.appendChild(overlay)
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
    if (opts.onClose) opts.onClose()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e: Event) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  return { panel, close }
}
