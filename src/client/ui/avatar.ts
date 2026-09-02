/** 头像组件：自定义图 > 渠道头像 > 渐变首字母（Apple 通讯录风格 44px 圆形）。 */
import { h } from '../dom'
import { initialOf } from '../data/model'

export interface AvatarOpts {
  name: string
  avatar: string | null
  palette: number
  size?: number
  title?: string
  onClick?: (e: Event) => void
}

export function makeAvatar(o: AvatarOpts): HTMLDivElement {
  const el = h('div', {
    className: 'af-avatar af-av-' + (o.palette % 8),
    role: 'button',
    title: o.title ?? '设置头像',
    onClick: o.onClick,
  })
  if (o.avatar) el.appendChild(h('img', { src: o.avatar, alt: o.name }))
  else el.appendChild(document.createTextNode(initialOf(o.name)))
  if (o.size && o.size !== 44) {
    el.style.width = o.size + 'px'
    el.style.height = o.size + 'px'
    el.style.fontSize = Math.round(o.size * 0.38) + 'px'
  }
  return el
}
