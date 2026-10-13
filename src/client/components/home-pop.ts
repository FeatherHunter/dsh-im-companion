/** 绿框 popover 系统（T6a）：锚定弹层，禁底部弹窗（T4 verdict §2.3）。
 * 位置算法照原型 proto-studio.html 的 placePop（下方放不下翻上方；左右夹在视口内，贴边时改右/左对齐）；
 * 内容一律真 DOM 节点（不用 innerHTML）⇒ 开发态 DOM 桩里也能点得到表单。
 * 弹层挂 body 级 portal（避开设置页滚动容器裁剪），宿主同样带 .home-ui 类以保作用域。 */
import { h, clear } from '../dom'

export interface PopOpts {
  width?: number
  label?: string
  body: HTMLElement[]
  foot?: HTMLElement[]
  onClose?: () => void
}

let hostEl: HTMLElement | null = null
let popEl: HTMLElement | null = null
let anchorEl: HTMLElement | null = null
let onCloseCb: (() => void) | null = null
let keyHandler: ((e: KeyboardEvent) => void) | null = null

function viewport(): { w: number; h: number } {
  const w = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024
  const hh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 768
  return { w, h: hh }
}

function ensureHost(): HTMLElement {
  if (hostEl && hostEl.parentNode) return hostEl
  const el = h('div', { className: 'home-ui hu-pophost' })
  const body = typeof document !== 'undefined' ? document.body : null
  if (body) body.appendChild(el)
  hostEl = el
  return el
}

function rectOf(el: HTMLElement | null): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const r = el.getBoundingClientRect()
  if (!r || (!r.width && !r.height)) return null
  return r
}

function place(pop: HTMLElement, anchor: HTMLElement | null): void {
  const vp = viewport()
  const r = rectOf(anchor)
  const pr = rectOf(pop)
  const pw = pr ? pr.width : (parseInt(pop.style.width, 10) || 300)
  if (!r) {
    pop.style.left = `${Math.max(10, Math.round((vp.w - pw) / 2))}px`
    pop.style.top = '80px'
    return
  }
  const gap = 9
  const ph = pr ? pr.height : 320
  const below = r.bottom + gap + ph <= vp.h - 8
  const top = below ? r.bottom + gap : Math.max(8, r.top - gap - ph)
  const pad = 10
  const minL = pad
  const maxL = Math.max(pad, vp.w - pw - pad)
  const centered = r.left + r.width / 2 - pw / 2
  let want = centered
  if (centered > maxL) want = r.right - pw
  else if (centered < minL) want = r.left
  const left = Math.min(Math.max(minL, want), maxL)
  pop.style.top = `${top}px`
  pop.style.left = `${left}px`
  const arrow = pop.querySelector('.hu-arrow') as HTMLElement | null
  if (arrow) {
    const ax = Math.min(Math.max(12, r.left + r.width / 2 - left - 6), Math.max(12, pw - 22))
    arrow.style.left = `${ax}px`
    if (below) arrow.classList.remove('b')
    else arrow.classList.add('b')
  }
}

/** 打开锚定弹层；返回 pop 元素（宿主缺失时返回 null）。 */
export function openHomePop(anchor: HTMLElement | null, opts: PopOpts): HTMLElement | null {
  closeHomePop(true)
  const host = ensureHost()
  if (!host) return null
  const width = opts.width ?? 300
  const pop = h('div', { className: 'hu-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label ?? '操作' })
  pop.style.width = `min(${width}px, calc(100vw - 20px))`
  const bodyBox = h('div', { className: 'hu-ppo' }, ...opts.body)
  pop.appendChild(bodyBox)
  if (opts.foot && opts.foot.length) pop.appendChild(h('div', { className: 'hu-pfoot' }, ...opts.foot))
  pop.appendChild(h('span', { className: 'hu-arrow' }))
  const scrim = h('div', { className: 'hu-scrim' })
  scrim.addEventListener('click', () => closeHomePop())
  clear(host)
  host.appendChild(scrim)
  host.appendChild(pop)
  popEl = pop
  anchorEl = anchor
  onCloseCb = opts.onClose ?? null
  if (anchor && anchor.classList) anchor.classList.add('anchor')
  place(pop, anchor)
  keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHomePop() }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', keyHandler as unknown as EventListener)
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => { if (popEl) place(popEl, anchorEl) })
  }
  return pop
}

export function closeHomePop(immediate = false): void {
  if (keyHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('keydown', keyHandler as unknown as EventListener)
  }
  keyHandler = null
  if (anchorEl && anchorEl.classList) anchorEl.classList.remove('anchor')
  const cb = onCloseCb
  const host = hostEl
  popEl = null
  anchorEl = null
  onCloseCb = null
  if (host) {
    if (immediate) clear(host)
    else setTimeout(() => { if (hostEl) clear(hostEl) }, 130)
  }
  if (cb) cb()
}

export function homePopOpen(): boolean {
  return !!popEl
}

export function homePopNode(): HTMLElement | null {
  return popEl
}
