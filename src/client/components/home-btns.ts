/** 家面板的**行按钮工厂**（iconBtn/textBtn ＋ 「待实现」钮语义）。
 *  原在 `home-rows.ts` 内：owner 2026-10-17 要给家行加原位改名与换头像，那里正好压着 300 行红线，
 *  于是把这组与行渲染无关的按钮词汇整组搬出来；`home-rows.ts` 仍**原样再导出**（老调用点一字不改）。 */
import { h } from '../dom'
import { huIcon, type HuIconName } from './home-icons'

/** 未实现钮（T6b/T6c）：照原型画出但语义化禁用（不用 opacity .45）；悬停说明归属票号（owner 裁定 2026-10-12）。 */
export function pendingTip(label: string, ticket: string): string {
  return `${label}（#${ticket} 待实现）`
}

function planned(el: HTMLElement, label: string, ticket: string): HTMLElement {
  const btn = el as HTMLButtonElement
  btn.disabled = true
  btn.setAttribute('disabled', '')
  btn.setAttribute('aria-disabled', 'true')
  btn.setAttribute('data-tip', pendingTip(label, ticket))
  btn.classList.add('planned')
  return btn
}

export function iconBtn(act: string, label: string, iconName: HuIconName, opts: { ticket?: string } = {}): HTMLElement {
  const el = h('button', { className: 'hu-ract icon', type: 'button', 'data-item-act': act,
    'aria-label': label, 'data-tip': opts.ticket ? pendingTip(label, opts.ticket) : label }, huIcon(iconName, 15))
  return opts.ticket ? planned(el, label, opts.ticket) : el
}

export function textBtn(act: string, label: string, opts: { cls?: string; ticket?: string; id?: string } = {}): HTMLElement {
  const el = h('button', { className: `hu-ract ${opts.cls ?? ''}`.trim(), type: 'button',
    'data-item-act': act, ...(opts.id ? { 'data-id': opts.id } : {}) }, label)
  return opts.ticket ? planned(el, label, opts.ticket) : el
}
