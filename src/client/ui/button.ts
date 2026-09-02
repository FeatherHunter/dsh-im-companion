/** 按钮原语：Apple 风格三态（primary / tinted / ghost）+ 图标按钮。 */
import { h, type ChildNode } from '../dom'
import { icon, type IconName } from '../icons'

export type BtnKind = 'default' | 'primary' | 'tinted' | 'ghost'

export interface BtnOpts {
  kind?: BtnKind
  size?: 'md' | 'sm'
  label: string
  iconName?: IconName
  onClick?: (e: Event) => void
  disabled?: boolean
  title?: string
}

export function makeButton(o: BtnOpts): HTMLButtonElement {
  const cls = ['af-btn']
  if (o.kind && o.kind !== 'default') cls.push(o.kind)
  if (o.size === 'sm') cls.push('sm')
  const children: ChildNode[] = []
  if (o.iconName) children.push(icon(o.iconName, 15))
  children.push(o.label)
  return h('button', {
    className: cls.join(' '),
    type: 'button',
    onClick: o.onClick,
    disabled: o.disabled === true,
    title: o.title ?? undefined,
  }, ...children)
}

export interface IconBtnOpts {
  iconName: IconName
  label: string
  onClick?: (e: Event) => void
  title?: string
}

export function makeIconButton(o: IconBtnOpts): HTMLButtonElement {
  return h('button', {
    className: 'af-icon-btn',
    type: 'button',
    'aria-label': o.label,
    title: o.title ?? o.label,
    onClick: o.onClick,
  }, icon(o.iconName, 18))
}
