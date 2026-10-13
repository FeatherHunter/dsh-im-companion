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
  onMore: (anchor: HTMLElement) => void
  /** 面板级动作（船 / 串门搬家 / 刷新）由装配层交进来，与页头同一行右侧成簇——
   * 上部区域因此只剩「标题行 + 绿框页头」，不再有独立工具栏行（owner 裁定 2026-10-13）。 */
  actions?: HTMLElement | null
}

/** 页头：L1 无返回；L2/L3 有返回；⋯ 在 L2 开家设置（改名·配图，T6b #114）。
 * 页头**不再有 ＋**（owner 裁定 2026-10-13）：它与底部主操作同效、同屏、同时可见，
 * 而在 L3 还点了没反应 —— 一个动作一个入口，建单归底部主操作（随层：新建家 / 新建助理）。
 * 页头只留「面板级动作」（去舰队 / 串门搬家 / 刷新），两个区各管一类，语义不再重叠。 */
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
  if (o.actions) head.appendChild(o.actions)
  if (o.level === 'L2') {
    const more = h('button', {
      className: 'hu-ibtn', type: 'button', 'aria-label': '更多操作', 'data-tip': '家设置（改名·配图）',
    }, huIcon('more', 15))
    more.addEventListener('click', () => o.onMore(more))
    head.appendChild(more)
  }
  return head
}

export interface CrumbOpts {
  level: Level
  homeName: string
  asstName: string
  focusHomeName: string
  focusAsstName: string
  /** 后两级的**默认去处**（owner：无焦点时 chip 显示列表第一个，点 tab 就自动进去）。
   * L2 落点＝家 id（渠道模式下是渠道 id，`go('L2', id)` 两种模式各自解读）；
   * L3 落点＝助理 id。空串＝没有下一级（例如空家）⇒ 该 chip 显式禁用。 */
  l2Target: string
  l3Target: string
  onGo: (level: Level, id?: string) => void
}

function crumb(level: Level, label: string, opts: { current?: boolean; next?: boolean; off?: boolean; target?: string; onGo: (l: Level, id?: string) => void }): HTMLElement {
  const cls = `hu-crumb${opts.current ? ' cur' : ''}${opts.next ? ' next' : ''}${opts.off ? ' off' : ''}`
  const el = h('button', { className: cls, type: 'button' }, h('span', { className: 'hu-lv' }, level), h('b', {}, label))
  if (opts.current) el.setAttribute('aria-current', 'true')
  else {
    el.setAttribute('data-goto', level)
    if (opts.off) el.setAttribute('aria-disabled', 'true')
  }
  if (opts.next && !opts.off) el.appendChild(huIcon('chev', 12, 'hu-i hu-go'))
  if (!opts.current) {
    el.addEventListener('click', () => { if (!opts.off) opts.onGo(level, opts.target) })
  }
  return el
}

/** 三级链路：L1 焦点家 → L2 焦点助理 → L3；当前层高亮，可前进层带虚线框与箭头。
 * 后两级的**文案与落点同源**（`focusXxxName` 说什么，`lXTarget` 就带你去哪）——两者若各算各的，
 * 就会出现「chip 写着 A、点进去到 B」这种最难查的不一致。 */
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
    push(crumb('L2', o.focusHomeName ? `助理 · ${o.focusHomeName}` : '助理', { next: true, off: !o.focusHomeName, target: o.l2Target, onGo: o.onGo }))
    split()
    push(crumb('L3', o.focusAsstName ? `机器人 · ${o.focusAsstName}` : '机器人', { next: true, off: !o.focusAsstName, target: o.l3Target, onGo: o.onGo }))
  } else if (o.level === 'L2') {
    push(crumb('L1', '家', { onGo: o.onGo }))
    split()
    push(crumb('L2', o.homeName, { current: true, onGo: o.onGo }))
    split()
    push(crumb('L3', o.focusAsstName ? `机器人 · ${o.focusAsstName}` : '机器人', { next: true, off: !o.focusAsstName, target: o.l3Target, onGo: o.onGo }))
  } else {
    push(crumb('L1', '家', { onGo: o.onGo }))
    split()
    push(crumb('L2', o.homeName, { onGo: o.onGo, target: o.l2Target }))
    split()
    push(crumb('L3', o.asstName, { current: true, onGo: o.onGo }))
  }
  return wrap
}

/** 液签：在三个 chip 之间**真的滑动**（FLIP：先按回旧位，再放开过渡滑到新位）。
 *
 * 真机两难（owner 2026-10-13）：
 *   ① 「一级目录反复动画、抖动」——每次悬停换行都重建面包屑，新液签从 0 位滑过来；
 *   ② 「应该在三个 tab 之间滑动（液态 tab）」——为治①把动画整个关掉，设计意图又丢了。
 * 正解不是二选一，而是**分清「位没变」和「位变了」**：
 *   起止同点（悬停换行不改当前层）⇒ 零位移 ⇒ 不抖；层级切换 ⇒ 从旧 chip 真滑到新 chip。
 * 尺寸全部取 chip 的实测矩形（原型用 top/bottom 内缩，液签会比 chip 高约 4px）。 */
let lastTabRect: { x: number; y: number; w: number; h: number } | null = null

export function slideTab(crumbs: HTMLElement, tab: HTMLElement | null): void {
  if (!tab || typeof crumbs.getBoundingClientRect !== 'function') return
  const cur = crumbs.querySelector('.hu-crumb[aria-current="true"]') as HTMLElement | null
  if (!cur) { tab.setAttribute('hidden', ''); lastTabRect = null; return }
  const cr = crumbs.getBoundingClientRect()
  const r = cur.getBoundingClientRect()
  if (!r.width) return
  tab.removeAttribute('hidden')
  const next = { x: r.left - cr.left + crumbs.scrollLeft, y: r.top - cr.top, w: r.width, h: r.height }
  const place = (rect: { x: number; y: number; w: number; h: number }): void => {
    tab.style.width = `${rect.w}px`
    tab.style.height = `${rect.h}px`
    tab.style.transform = `translate(${rect.x}px, ${rect.y}px)`
  }
  const prev = tab.style.transition
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null
  if (lastTabRect) {
    tab.style.transition = 'none'
    place(lastTabRect)
    const play = (): void => { tab.style.transition = prev || ''; place(next) }
    if (raf) raf(play)
    else play()
  } else {
    /* 首帧（无旧位可 FLIP）：直接落位，过渡下一帧恢复——绝不能从 0 位滑过来。 */
    tab.style.transition = 'none'
    place(next)
    const restore = (): void => { tab.style.transition = prev || '' }
    if (raf) raf(restore)
    else restore()
  }
  lastTabRect = next
}

export interface FootOpts {
  level: Level
  bound: boolean
  busy?: boolean
  onPrimary: () => void
}

/** 底部主操作随层：L1 新建家 · L2 新建助理 · L3 绑定机器人（未绑，T6b #114）/ 返回助理列表（已绑）。 */
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
  if (o.busy) {
    btn.disabled = true
    btn.setAttribute('disabled', '')
  } else {
    btn.addEventListener('click', () => o.onPrimary())
  }
  foot.appendChild(btn)
  return foot
}
