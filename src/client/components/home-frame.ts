/** 绿框框架件（T6a）：页头（返回/层级图标/标题/副标/更多/＋）、三级 chip 面包屑（液签）、
 * 底部主操作随层——逐字照 T4 认可款原型 proto-studio.html 的 fhead / renderCrumbs / renderFoot。 */
import { h } from '../dom'
import { huIcon, type HuIconName } from './home-icons'

export type Level = 'L1' | 'L2' | 'L3'

export interface HeadOpts {
  level: Level
  title: string
  sub: string
  onBack: () => void
  onAdd: () => void
  onMore: () => void
}

/** 页头：L1 无返回；L2/L3 有返回；＋ 在 L1/L2；⋯ 在 L2（T6a 未实现 ⇒ 禁用并标票号）。 */
export function headEl(o: HeadOpts): HTMLElement {
  const iconName: HuIconName = o.level === 'L3' ? 'person' : 'home'
  const head = h('div', { className: 'hu-fhead' })
  if (o.level !== 'L1') {
    const back = h('button', { className: 'hu-back', type: 'button', 'aria-label': '返回上一级', 'data-act': 'back' }, huIcon('back', 15))
    back.addEventListener('click', () => o.onBack())
    head.appendChild(back)
  }
  head.appendChild(h('span', { className: 'hu-av sm', style: 'background:var(--hu-accent-soft);color:var(--hu-accent-deep)' }, huIcon(iconName, 15)))
  head.appendChild(h('div', { className: 'hu-ttl' }, h('b', {}, o.title), h('small', {}, o.sub)))
  if (o.level === 'L2') {
    const more = h('button', {
      className: 'hu-ibtn planned', type: 'button', 'aria-label': '更多操作', 'data-tip': '更多操作（#114 待实现）',
    }, huIcon('more', 15))
    more.disabled = true
    more.setAttribute('disabled', '')
    more.setAttribute('aria-disabled', 'true')
    head.appendChild(more)
  }
  if (o.level !== 'L3') {
    const add = h('button', { className: 'hu-ibtn solid', type: 'button', 'aria-label': o.level === 'L1' ? '新建家' : '新建助理' },
      huIcon('plus', 15))
    add.addEventListener('click', () => o.onAdd())
    head.appendChild(add)
  }
  return head
}

export interface CrumbOpts {
  level: Level
  homeName: string
  asstName: string
  focusHomeName: string
  focusAsstName: string
  onGo: (level: Level) => void
}

function crumb(level: Level, label: string, opts: { current?: boolean; next?: boolean; off?: boolean; onGo: (l: Level) => void }): HTMLElement {
  const cls = `hu-crumb${opts.current ? ' cur' : ''}${opts.next ? ' next' : ''}${opts.off ? ' off' : ''}`
  const el = h('button', { className: cls, type: 'button' }, h('span', { className: 'hu-lv' }, level), h('b', {}, label))
  if (opts.current) el.setAttribute('aria-current', 'true')
  else {
    el.setAttribute('data-goto', level)
    if (opts.off) el.setAttribute('aria-disabled', 'true')
  }
  if (opts.next && !opts.off) el.appendChild(huIcon('chev', 12, 'hu-i hu-go'))
  if (!opts.current) {
    el.addEventListener('click', () => { if (!opts.off) opts.onGo(level) })
  }
  return el
}

/** 三级链路：L1 焦点家 → L2 焦点助理 → L3；当前层高亮，可前进层带虚线框与箭头。 */
export function crumbsEl(o: CrumbOpts): HTMLElement {
  const wrap = h('div', { className: 'hu-crumbs' })
  const tab = h('span', { className: 'hu-tablk' })
  tab.setAttribute('hidden', '')
  wrap.appendChild(tab)
  const push = (el: HTMLElement): void => { wrap.appendChild(el) }
  const split = (): void => { push(h('span', { className: 'hu-csplit' }, '›')) }
  if (o.level === 'L1') {
    push(crumb('L1', '家', { current: true, onGo: o.onGo }))
    split()
    push(crumb('L2', o.focusHomeName ? `助理 · ${o.focusHomeName}` : '助理', { next: true, off: !o.focusHomeName, onGo: o.onGo }))
    split()
    push(crumb('L3', o.focusAsstName ? `机器人 · ${o.focusAsstName}` : '机器人', { next: true, off: !o.focusAsstName, onGo: o.onGo }))
  } else if (o.level === 'L2') {
    push(crumb('L1', '家', { onGo: o.onGo }))
    split()
    push(crumb('L2', o.homeName, { current: true, onGo: o.onGo }))
    split()
    push(crumb('L3', o.focusAsstName ? `机器人 · ${o.focusAsstName}` : '机器人', { next: true, off: !o.focusAsstName, onGo: o.onGo }))
  } else {
    push(crumb('L1', '家', { onGo: o.onGo }))
    split()
    push(crumb('L2', o.homeName, { onGo: o.onGo }))
    split()
    push(crumb('L3', o.asstName, { current: true, onGo: o.onGo }))
  }
  return wrap
}

/** 液签：把药丸滑到当前 chip 下（无布局引擎时静默跳过）。
 * `instant=true` 时先关过渡再落位——**重建面包屑或焦点变化绝不能再触发滑动动画**，
 * 否则每次悬停换行都会把液签从 0 位滑过来（真机表现为「一级目录反复动画、抖动」）。
 * 尺寸取 chip 的实测矩形（原型用 top/bottom 内缩，液签会比 chip 高出约 4px）。 */
export function slideTab(crumbs: HTMLElement, tab: HTMLElement | null, instant = false): void {
  if (!tab || typeof crumbs.getBoundingClientRect !== 'function') return
  const cur = crumbs.querySelector('.hu-crumb[aria-current="true"]') as HTMLElement | null
  if (!cur) { tab.setAttribute('hidden', ''); return }
  const cr = crumbs.getBoundingClientRect()
  const r = cur.getBoundingClientRect()
  if (!r.width) return
  tab.removeAttribute('hidden')
  const prev = tab.style.transition
  if (instant) tab.style.transition = 'none'
  tab.style.width = `${r.width}px`
  tab.style.height = `${r.height}px`
  tab.style.transform = `translate(${r.left - cr.left + crumbs.scrollLeft}px, ${r.top - cr.top}px)`
  if (instant) {
    const restore = (): void => { tab.style.transition = prev }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore)
    else restore()
  }
}

export interface FootOpts {
  level: Level
  bound: boolean
  busy?: boolean
  onPrimary: () => void
}

/** 底部主操作随层：L1 新建家 · L2 新建助理 · L3 绑定机器人 / 返回助理列表。 */
export function footEl(o: FootOpts): HTMLElement {
  const foot = h('div', { className: 'hu-ffoot' })
  if (o.level === 'L3' && o.bound) {
    const b = h('button', { className: 'hu-pbtn ghost', type: 'button', 'data-act': 'to-list' }, '返回助理列表')
    b.addEventListener('click', () => o.onPrimary())
    foot.appendChild(b)
    return foot
  }
  const label = o.level === 'L1' ? '新建家' : o.level === 'L2' ? '新建助理' : '绑定机器人'
  const btn = h('button', { className: 'hu-pbtn', type: 'button', 'data-act': 'primary' },
    huIcon(o.level === 'L3' ? 'link' : 'plus', 15), label)
  if (o.level === 'L3') {
    btn.disabled = true
    btn.setAttribute('disabled', '')
    btn.setAttribute('aria-disabled', 'true')
    btn.setAttribute('data-tip', '绑定机器人（#114 待实现）')
    btn.classList.add('planned')
  } else if (o.busy) {
    btn.disabled = true
    btn.setAttribute('disabled', '')
  } else {
    btn.addEventListener('click', () => o.onPrimary())
  }
  foot.appendChild(btn)
  return foot
}
