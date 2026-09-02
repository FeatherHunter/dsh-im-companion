/** 空态视图（Apple 风格：圆形图标 + 主/副文案）。 */
import { h } from '../dom'
import { icon, type IconName } from '../icons'

export interface EmptyOpts {
  iconName: IconName
  title: string
  sub?: string
}

export function makeEmpty(o: EmptyOpts): HTMLDivElement {
  return h('div', { className: 'af-empty' },
    h('div', { className: 'af-empty-icon' }, icon(o.iconName, 26)),
    h('div', { className: 'af-empty-title' }, o.title),
    o.sub ? h('div', { className: 'af-empty-sub' }, o.sub) : null,
  )
}
