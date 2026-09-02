/** 轻提示（底部浮出，2.4s 自动消失）。 */
import { h } from '../dom'
import { icon, type IconName } from '../icons'

let current: HTMLElement | null = null

export function toast(message: string, iconName?: IconName): void {
  try {
    current?.remove()
  } catch {
    /* noop */
  }
  const t = h('div', { className: 'af-toast', role: 'status' },
    iconName ? icon(iconName, 15) : null,
    message,
  )
  document.body.appendChild(t)
  requestAnimationFrame(() => t.classList.add('show'))
  current = t
  setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => {
      try {
        t.remove()
      } catch {
        /* noop */
      }
    }, 220)
  }, 2400)
}
