/** 弹出菜单：锚定在元素附近，点外部/Escape/滚动关闭。 */
import { h } from '../dom'
import { icon, type IconName } from '../icons'

export interface MenuItem {
  label: string
  iconName?: IconName
  danger?: boolean
  /** 二次确认：首次点击变「再次点击确认」，第二次才执行 */
  confirm?: boolean
  /** 分隔线 */
  sep?: boolean
  onSelect?: () => void
}

export type MenuPlacement = 'bottom-left' | 'bottom-right'

export function showMenu(anchor: HTMLElement, items: MenuItem[], placement: MenuPlacement = 'bottom-left'): () => void {
  const menu = h('div', { className: 'af-menu', role: 'menu' })
  for (const it of items) {
    if (it.sep) {
      menu.appendChild(h('div', { className: 'af-menu-sep' }))
      continue
    }
    let armed = false
    const btn = h('button', {
      className: 'af-menu-item' + (it.danger ? ' danger' : ''),
      type: 'button',
      role: 'menuitem',
      onClick: () => {
        if (it.confirm && !armed) {
          armed = true
          btn.classList.add('confirming')
          btn.textContent = ''
          if (it.iconName) btn.appendChild(icon(it.iconName, 16))
          btn.appendChild(document.createTextNode('再次点击确认'))
          return
        }
        close()
        it.onSelect?.()
      },
    }, it.iconName ? icon(it.iconName, 16) : null, it.label)
    menu.appendChild(btn)
  }
  document.body.appendChild(menu)

  const rect = anchor.getBoundingClientRect()
  const mw = menu.offsetWidth || 190
  const mh = menu.offsetHeight || 140
  const vw = document.documentElement.clientWidth || window.innerWidth || 1440
  const vh = document.documentElement.clientHeight || window.innerHeight || 900
  // 默认：菜单左上角对齐锚点右下角（右下角展开）
  let left = placement === 'bottom-right' ? rect.left : rect.right - mw
  let top = rect.bottom + 6
  if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8)
  if (left < 8) left = 8
  if (top + mh > vh - 8) top = Math.max(8, rect.top - mh - 6)
  menu.style.left = left + 'px'
  menu.style.top = top + 'px'

  function close(): void {
    menu.remove()
    document.removeEventListener('mousedown', onDoc, true)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', onScroll, true)
  }
  function onDoc(e: Event): void {
    if (!menu.contains(e.target as Node)) close()
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }
  function onScroll(): void {
    close()
  }
  document.addEventListener('mousedown', onDoc, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', onScroll, true)
  return close
}