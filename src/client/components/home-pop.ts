/** 绿框 popover 系统（T6a/T7 #112）：锚定弹层，禁底部弹窗（T4 verdict §2.3）。
 * 位置算法＝纯函数 computePlacement（home-place.ts，verify 可直接断言）；内容一律真 DOM 节点（不用 innerHTML）。
 * 弹层挂 body 级 portal（避开设置页滚动容器裁剪），宿主带 .home-ui + .af-portal 保令牌作用域。
 *
 * 第一性原则（2026-10-14 真机 bug 之后）：**锚点不许被捕获**。面板每次数据刷新都会 clear 重建
 * （panel-body.render），捕获的元素随即游离（rect 全 0）⇒ 定位掉进兜底分支、弹层跳到窗口左上
 * （用户实测：点「复用工作区」后弹层飞到顶部）。所以锚点一律传解析器（() => HTMLElement | null），
 * 每次定位现取；解析不到就**收掉弹层**——绝不把弹层扔到一个默认位置。 */
import { h, clear } from '../dom'
import { computePlacement, POP_EDGE, widthFor } from './home-place'
import { logLine, logOn } from '../log'

export interface PopOpts {
  width?: number
  label?: string
  /** 标题行：与 foot 的按钮同一行（按钮落在弹层右上角；owner 2026-10-15 裁定）。 */
  title?: HTMLElement
  /** 强制开在锚点上方：贴底主操作「新建家/新建助理/绑定机器人」专用（owner 2026-10-15 裁定）。 */
  above?: boolean
  body: HTMLElement[]
  foot?: HTMLElement[]
  onClose?: () => void
}

/** 锚点：元素（静态场景）或解析器（会被面板重建的场景一律用解析器）。null ⇒ 无锚点。 */
export type AnchorRef = HTMLElement | null | (() => HTMLElement | null)

let hostEl: HTMLElement | null = null
let popEl: HTMLElement | null = null
let anchorRef: AnchorRef = null
let onCloseCb: (() => void) | null = null
let keyHandler: ((e: KeyboardEvent) => void) | null = null
let resizeBound = false
/** 本次弹层是否强制开在锚点上方（openHomePop / updateHomePop 从 opts.above 写入，place 现取）。 */
let popAbove = false

function viewport(): { w: number; h: number } {
  const w = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024
  const hh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 768
  return { w, h: hh }
}

/** 宿主能力探测：有 Popover API 就带 `popover="manual"`（进 top layer），没有就确保不带——
 * 否则支持 `[popover]` 的宿主会把它按 UA 默认样式 `display:none` 藏掉。复用旧宿主时也要补正。 */
function applyLayerAttr(el: HTMLElement): void {
  const has = typeof (el as { showPopover?: unknown }).showPopover === 'function'
  if (has) el.setAttribute('popover', 'manual')
  else el.removeAttribute('popover')
}

function ensureHost(): HTMLElement {
  if (hostEl && hostEl.parentNode) {
    applyLayerAttr(hostEl)
    return hostEl
  }
  /* 宿主挂 document.body（在 .af-root 之外）⇒ 必须自带令牌作用域类 `af-portal`（theme.ts 的
   * `.af-root,.af-menu,.af-toast,.af-overlay,.af-portal` 那一组）：否则 --af-* 未定义、--hu-* 全失效，
   * 弹层会整块透明、无边框无阴影（2026-10-14 真机 #112 截图实证）。 */
  const el = h('div', { className: 'home-ui hu-pophost af-portal' })
  /* 宿主设置页可能落在比 z-index 更高的层（原生 dialog / top layer）⇒ 有 Popover API 的宿主一律进 top layer，
   * 否则弹层会被整层盖住、点下去像「没反应」（2026-10-14 真机 #112 实测）。无该 API 时退回 z-index 层。 */
  applyLayerAttr(el)
  const body = typeof document !== 'undefined' ? document.body : null
  if (body) body.appendChild(el)
  hostEl = el
  return el
}

/** 把宿主提进 top layer（失败即摘掉 popover 属性退回 z-index 层，绝不让弹层因此不可见）。 */
function showLayer(host: HTMLElement): void {
  const el = host as { showPopover?: () => void; matches?: (s: string) => boolean }
  if (typeof el.showPopover !== 'function') return
  try {
    if (!el.matches?.(':popover-open')) el.showPopover()
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'pop', action: 'show-layer', ok: false, message: 'top layer 不可用，退回 z-index：' + String((e as Error)?.message ?? e) })
    try { host.removeAttribute('popover') } catch { /* noop */ }
  }
}

function hideLayer(host: HTMLElement | null): void {
  if (!host) return
  const el = host as { hidePopover?: () => void; matches?: (s: string) => boolean }
  try {
    if (el.matches?.(':popover-open')) el.hidePopover?.()
  } catch {
    /* noop */
  }
}

function resolveAnchor(ref: AnchorRef): HTMLElement | null {
  if (!ref) return null
  if (typeof ref === 'function') {
    try { return ref() } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'pop', action: 'anchor', ok: false, message: String((e as Error)?.message ?? e) }); return null }
  }
  return ref
}

function rectOf(el: HTMLElement | null): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const r = el.getBoundingClientRect()
  if (!r || (!r.width && !r.height)) return null
  return r
}

/** 弹层尺寸取**布局尺寸**（offsetWidth/Height）：入场动画带 transform:scale(.94)，rect 会量偏。 */
function sizeOf(pop: HTMLElement): { w: number; h: number } {
  const w = pop.offsetWidth || parseInt(pop.style.width, 10) || 300
  const h = pop.offsetHeight || 320
  return { w, h }
}

function markAnchor(el: HTMLElement | null): void {
  if (el && el.classList && typeof el.classList.add === 'function') el.classList.add('anchor')
}

/** 焦点送进弹层／还给锚点：preventScroll 保证不因聚焦把宿主页面滚走（键盘用户否则要点不到弹层里的按钮）。 */
function focusTo(el: HTMLElement | null): void {
  if (!el || typeof el.focus !== 'function') return
  try { el.focus({ preventScroll: true }) } catch { /* 老环境不吃参数就忽略 */ }
}

function alive(el: HTMLElement): boolean {
  const c = (el as { isConnected?: boolean }).isConnected
  return typeof c === 'boolean' ? c : !!el.parentNode
}

/** 锚点最近的可裁剪祖先（overflow 非 visible）的下沿——按计算样式判定，不写任何 A1 私有类选择器
 *  （绿框不占 .af-* 约定）。弹层不许越出它：否则贴底的「＋ 新建家」会把弹层放到按钮下方、半截挂在面板外
 *  （2026-10-14 真机 #112 第二次目验实证）。取不到（无样式环境/没有裁剪祖先）⇒ 交给视口下沿兜底。 */
function clipBottom(el: HTMLElement, vpH: number): number | undefined {
  const win = typeof window !== 'undefined' ? (window as unknown as { getComputedStyle?: (e: Element) => CSSStyleDeclaration }) : null
  const gcs = win?.getComputedStyle
  if (typeof gcs !== 'function') return undefined
  let node: HTMLElement | null = el.parentElement ?? null
  for (let i = 0; node && i < 6; i += 1, node = node.parentElement ?? null) {
    const s = gcs.call(win, node)
    const oy = s?.overflowY ?? ''
    const o = s?.overflow ?? ''
    if ((!oy || oy === 'visible') && (!o || o === 'visible')) continue
    const r = rectOf(node)
    return r ? Math.min(vpH - POP_EDGE, r.bottom - POP_EDGE) : undefined
  }
  return undefined
}

/** 落位；锚点已不存在 ⇒ 收掉弹层并返回 false（绝不兜底到默认位置——真机 bug 的成因）。 */
function place(pop: HTMLElement, ref: AnchorRef): boolean {
  const el = resolveAnchor(ref)
  if (!el || !alive(el)) {
    closeHomePop(true)
    return false
  }
  const r = rectOf(el)
  /* 量不到（未布局/隐藏）时保持原位：宁可不挪，也不猜一个位置。 */
  if (!r) {
    markAnchor(el)
    return true
  }
  const vp = viewport()
  /* 宽度跟锚点走（满宽按钮 ⇒ 等宽弹层；行内小按钮 ⇒ 保底宽），必须在量高度之前落定。 */
  pop.style.width = `${widthFor(r.width, vp.w)}px`
  const p = computePlacement(vp, r, sizeOf(pop), clipBottom(el, vp.h), popAbove)
  pop.style.left = `${p.left}px`
  pop.style.top = `${p.top}px`
  const arrow = pop.querySelector('.hu-arrow') as HTMLElement | null
  if (arrow) {
    arrow.style.left = `${p.arrowX}px`
    if (p.below) arrow.classList.remove('b')
    else arrow.classList.add('b')
  }
  markAnchor(el)
  return true
}

function buildPop(opts: PopOpts): HTMLElement {
  const width = opts.width ?? 300
  const pop = h('div', { className: 'hu-pop', role: 'dialog', 'aria-label': opts.label ?? '操作' })
  pop.style.width = `min(${width}px, calc(100vw - 20px))`
  const btns = opts.foot ?? []
  /* 标题栏＝标题与按钮同一行（按钮落在弹层右上角，owner 2026-10-15 裁定）；没有标题的弹层退回底部按钮行。 */
  if (opts.title && btns.length) pop.appendChild(h('div', { className: 'hu-phead' }, opts.title, ...btns))
  else {
    if (opts.title) pop.appendChild(h('div', { className: 'hu-phead' }, opts.title))
    if (btns.length) pop.appendChild(h('div', { className: 'hu-pfoot' }, ...btns))
  }
  pop.appendChild(h('div', { className: 'hu-ppo' }, ...opts.body))
  pop.appendChild(h('span', { className: 'hu-arrow' }))
  return pop
}

/** resize 只绑一次（早先每次开弹层都 addEventListener ⇒ 监听器越积越多，且各自捕获旧锚点）。 */
function bindResize(): void {
  if (resizeBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  resizeBound = true
  window.addEventListener('resize', () => { if (popEl) place(popEl, anchorRef) })
}

/** 打开锚定弹层；返回 pop 元素（宿主缺失或锚点不可用返回 null）。 */
export function openHomePop(anchor: AnchorRef, opts: PopOpts): HTMLElement | null {
  closeHomePop(true)
  const host = ensureHost()
  if (!host) return null
  const pop = buildPop(opts)
  const scrim = h('div', { className: 'hu-scrim' })
  scrim.addEventListener('click', () => closeHomePop())
  clear(host)
  host.appendChild(scrim)
  host.appendChild(pop)
  popEl = pop
  anchorRef = anchor
  popAbove = !!opts.above
  onCloseCb = opts.onClose ?? null
  markAnchor(resolveAnchor(anchor))
  /* 先提层再量位：宿主带 `popover` 时未 show 前是 UA `display:none`，此刻量 pop 只会得到 0×0。 */
  showLayer(host)
  if (!place(pop, anchor)) return null
  focusTo((pop.querySelector('button, input, [tabindex]') as HTMLElement | null) ?? null)
  keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHomePop() }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', keyHandler as unknown as EventListener)
  }
  bindResize()
  return pop
}

/** 就地换内容（分段切换、目录回填等）：不关不开、不重播入场动画，位置用同一解析器重算。
 * 锚点若已被面板重建，解析器会取到新元素 ⇒ 弹层跟着走；取不到则收掉（不跳位）。 */
export function updateHomePop(opts: PopOpts): HTMLElement | null {
  if (!popEl) return openHomePop(anchorRef, opts)
  popAbove = !!opts.above
  /* 就地换内容会把「刚点的那个按钮」换成新节点 ⇒ 焦点会掉到 body；先记下它的身份，重建后补回去。 */
  const prev = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
  let key: string | null = null
  if (prev && typeof popEl.contains === 'function' && popEl.contains(prev)) {
    for (const a of ['data-mode', 'data-act', 'data-value']) {
      const v = prev.getAttribute?.(a)
      if (v) { key = `[${a}="${v}"]`; break }
    }
  }
  const fresh = buildPop(opts)
  clear(popEl)
  /* 先快照再搬：childNodes 是活集合，边搬边读会漏节点（真 DOM 与桩上都一样）。 */
  const kids = Array.from(fresh.childNodes) as unknown as Node[]
  for (let i = 0; i < kids.length; i += 1) popEl.appendChild(kids[i] as unknown as HTMLElement)
  place(popEl, anchorRef)
  if (key) focusTo(popEl.querySelector(key) as HTMLElement | null)
  return popEl
}

export function closeHomePop(immediate = false): void {
  if (keyHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('keydown', keyHandler as unknown as EventListener)
  }
  keyHandler = null
  const marked = resolveAnchor(anchorRef)
  if (marked && marked.classList && typeof marked.classList.remove === 'function') marked.classList.remove('anchor')
  focusTo(marked)
  const cb = onCloseCb
  const host = hostEl
  popEl = null
  anchorRef = null
  onCloseCb = null
  if (host) {
    if (immediate) {
      hideLayer(host)
      clear(host)
    } else setTimeout(() => {
      /* 淡出期间若又开了新弹层（popEl 非空）就不能收：宿主是同一个，收掉会把新弹层一起藏了。 */
      if (!popEl) {
        hideLayer(hostEl)
        if (hostEl) clear(hostEl)
      }
    }, 130)
  }
  if (cb) cb()
}

export function homePopOpen(): boolean {
  return !!popEl
}

export function homePopNode(): HTMLElement | null {
  return popEl
}
