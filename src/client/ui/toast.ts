/** 轻提示（底部浮出，2.4s 自动消失）。
 *  `variant`＝**调用方自带**的变异类（位置/风格）：共享层不认识任何 feature 的类名，
 *  类与样式都留在调用方自己的命名空间里（家列表用它把「改名成功」挪到顶部，见
 *  `home-row-styles.ts` 的 `.af-toast.hu-toast-top`）。不给＝原样落底部，老调用点行为不变。 */
import { h } from '../dom'
import { icon, type IconName } from '../icons'
import { logLine } from '../log'

let current: HTMLElement | null = null

export function toast(message: string, iconName?: IconName, variant?: string): void {
  logLine('debug', 'ui.action', { area: 'ui.toast', action: iconName ?? 'plain', ok: true, message: '用户可见提示：' + message })
  try {
    current?.remove()
  } catch {
    /* noop */
  }
  const t = h('div', { className: variant ? 'af-toast ' + variant : 'af-toast', role: 'status' },
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
