/** update-center 设置行（自包含 DOM；自带 h 直建节点，不 import view.ts ⇒ 无环）。
 * 开关 + 档位下拉（6/12/24 默认/每周）：关掉开关**立即**写 meta.update.set（宿主 sync() 立刻释放定时器），
 * 并把档位置灰、下次检查置灰、显示「自动检查已关闭」。偏好入参取自 FeatureCtx.meta（字段 update.autoCheckEnabled / update.intervalHours）。 */
import { h } from '../../client/dom'
import { nextCheckText, INTERVALS } from './text'
import type { UpdateStore } from './data'

export interface SettingsHandlers {
  toggle(): void
  interval(hours: number): void
}

export function buildSettings(store: UpdateStore, hd: SettingsHandlers): HTMLElement {
  const prefs = store.prefs()
  const off = prefs.autoCheckEnabled !== true
  const track = h('button', {
    className: 'update-center-track', type: 'button', 'aria-label': '自动检查更新',
    'aria-pressed': off ? 'false' : 'true', onClick: hd.toggle,
  })
  track.appendChild(h('span', { className: 'update-center-knob' }))
  const select = h('select', { className: 'update-center-select', 'aria-label': '自动检查间隔' })
  for (const item of INTERVALS) {
    const opt = h('option', { value: String(item.hours) })
    opt.textContent = item.label
    if (item.hours === prefs.intervalHours) opt.selected = true
    select.appendChild(opt)
  }
  select.disabled = off
  select.addEventListener('change', () => { hd.interval(Number(select.value) || 24) })
  const res = store.result()
  const next = res !== null && res.ok && res.autoCheck ? res.autoCheck.nextCheckAt : null
  const nextText = h('span', { className: 'update-center-next' + (off ? ' update-center-greyed' : '') },
    '下次检查 ' + (off ? '—' : nextCheckText(next, Date.now())))
  return h('div', { className: 'update-center-settings' },
    h('div', { className: 'update-center-switch' }, track, h('span', { className: 'update-center-switch-label' }, '自动检查更新')),
    select,
    off ? h('span', { className: 'update-center-hint' }, '自动检查已关闭') : null,
    nextText)
}
