/** T13 #135 助理芯片的**悬停小气泡**（owner：漂亮的小气泡，popover 也行）。
 *
 * 为什么自己做、不复用 `[data-tip]` 那条 CSS 气泡：CSS 气泡只能塞一行 `attr(data-tip)` 文本，
 * 而这里要的是「小头像 ＋ 名字 ＋ 状态点 ＋ 渠道/机器人」两行卡片。故做成 body 级 float
 * （宿主仍带 `.home-ui` 类，作用域不破）：`position:fixed` ⇒ 不会被列表的 `overflow:hidden` 裁掉。
 *
 * 纪律：气泡只读、不拦指针（`pointer-events:none`）⇒ 不会把鼠标从芯片上"抢走"造成闪烁；
 * 延迟 120ms 才显（扫过一排芯片不刷屏）；滚动/点击/离开任一即收。悬停即落一条 info
 * 自证几何（#136 真机竖排卡：磁盘日志直接给出盒子的真实朝向/尺寸，不用开控制台），其余日志零。
 *
 * 永不裸奔（owner 2026-10-16：左下角裸字 `DLdsh-log未绑定 · 飞书 · 未绑定`，且气泡就该长在
 * 被悬停的头像旁边、不该钉在屏幕上）：**拆盒制** —— 气泡盒用一次就从 DOM 里拆掉，不复用、
 * 不认领旧盒；每次画之前先把 body 里所有的 `.hu-tiphost` 扫掉（跨版本热重载留下的旧盒也一并带走）。
 * 再加上画前验样式活（死了就不画）、定位完才亮（几何丢了就不亮），四条同时成立，
 * 屏幕上就不存在“有字无样式”的东西。
 * 可见性（同轮补钉：悬停了却什么都不出）：进层走绿框 popover 系统——有 Popover API 进 top layer
 * （设置页落在 dialog 下时纯 z-index 会被整层盖住，#112 实证），盒子自带 `af-portal` 保令牌作用域。
 */
import { h } from '../dom'
import { channelGlyphSvg } from '../icons'
import { logLine } from '../log'
import { avatarStyle, imageCover, initialsOf } from './home-identity'
import { ensureHomeRowStyles, homeRowStylesAlive } from './home-row-styles'
/* 进层三件套复用绿框 popover 系统（`home-pop.ts`，#112 实证：设置页可能落在 dialog 下，
 * 纯 z-index 会被整层盖住 ⇒ 有 Popover API 就进 top layer，没有就退回 z-index）。 */
import { applyLayerAttr, hideLayer, showLayer } from './home-pop'

export interface TipData {
  id: string
  name: string
  /** 图片头像的 data URL（取不到给 null ⇒ 回落预设色＋首字母）。 */
  url: string | null
  avatar: string | null
  status: 'on' | 'off' | 'unbound'
  statusText: string
  /** 渠道 id（logo 就地取自 icons.ts；未知回退首字徽标，不自造第二套图标）。 */
  channel: string
  /** 附加一行（渠道＋机器人名之类），空串则不显示。 */
  sub: string
}

let box: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let anchor: HTMLElement | null = null
let wired = false

const dotClass = (s: TipData['status']): string => 'hu-cdot' + (s === 'on' ? ' on' : s === 'off' ? ' off' : ' none')

/** 渠道 logo 节点：品牌 glyph 原色（icons.ts 唯一源）；未知渠道回退首字徽标（detail-drawer 同款）。 */
function logoNode(data: TipData): HTMLElement {
  const svg = channelGlyphSvg(data.channel ?? '', 14)
  if (svg) return h('span', { className: 'hu-logo', html: svg })
  return h('span', { className: 'hu-logo hu-logo-fb' }, (data.sub ?? '').charAt(0) || '?')
}

function wireOnce(): void {
  if (wired) return
  wired = true
  try {
    const w = globalThis as unknown as { addEventListener?: (t: string, f: () => void, c?: boolean) => void }
    const d = (globalThis as unknown as { document?: { addEventListener?: (t: string, f: () => void, c?: boolean) => void } }).document
    w.addEventListener?.('scroll', hideAsstTip, true)
    w.addEventListener?.('resize', hideAsstTip)
    d?.addEventListener?.('pointerdown', hideAsstTip, true)
  } catch { /* 桩环境无事件系统：气泡本就只在真机出现，忽略 */ }
}

function connected(el: HTMLElement): boolean {
  const flag = (el as unknown as { isConnected?: boolean }).isConnected
  return typeof flag === 'boolean' ? flag : !!el.parentNode
}

/** 把 body 里所有的气泡盒全部拆掉（跨版本热重载留下的旧盒也在内：只认类名，不认是不是自己建的）。
 * 返回拆掉的个数（平时是 0；大于 0 说明刚才屏幕上躺着一个随时可能裸奔的旧盒）。 */
function sweepTipBoxes(): number {
  try {
    const doc = (globalThis as unknown as { document?: { body?: { querySelectorAll?: (s: string) => ArrayLike<unknown> } } }).document
    const list = doc?.body?.querySelectorAll?.('.hu-tiphost')
    const n = (list as ArrayLike<unknown> | undefined)?.length ?? 0
    for (let i = 0; i < n; i++) {
      try { ((list as ArrayLike<any>)[i] as any)?.remove?.() } catch { /* 单个拆不掉不影响别的 */ }
    }
    return n
  } catch { return 0 }
}

function ensureBox(): HTMLElement {
  /* 不认领、只新建：认领旧盒等于把上一个版本/上一次悬停的旧字请回来，拆了重建最干净。 */
  sweepTipBoxes()
  box = null
  const doc = (globalThis as unknown as { document?: { body?: { appendChild?: (e: unknown) => void } } }).document
  /* 自带 `af-portal` 保令牌作用域（body 在 .af-root 之外，无它则 --hu-* 全失效）＋
   * 按宿主能力挂 `popover="manual"`（有 API 进 top layer，无则不带、免得被 UA 藏盒）。 */
  box = h('div', { className: 'home-ui hu-tiphost af-portal', role: 'tooltip' })
  try { applyLayerAttr(box) } catch { /* 桩里 setAttribute 若缺就当无 API */ }
  try { doc?.body?.appendChild?.(box) } catch { /* 桩里 body 缺 appendChild 就算了 */ }
  return box
}

function paint(a: HTMLElement, data: TipData): void {
  /* 锚点已游离（120ms 延迟里条带被重画/面板被刷新）⇒ 不画：零 rect 会把气泡钉到 (8,8)，
   * 且旧悬停已无意义（#136 把关）。 */
  if (!connected(a)) return
  /* 条带每次重画都换掉芯片：旧悬停随旧芯片一起作废，先收再画（#136 左下角滞留即此漏）。 */
  hideAsstTip()
  /* 无样式不画（宁可不弹也不裸）：样式装不上或正处在被卸掉的窗口期时，盒子一旦有内容，
   * `.on` 的显隐、fixed 的定位全都不生效 ⇒ 单行裸字钉在 body 末尾（左下角）。 */
  try { ensureHomeRowStyles() } catch { /* 装不上就认没样式 */ }
  if (!homeRowStylesAlive()) return
  const el = ensureBox()
  el.textContent = ''
  el.appendChild(h('span', {
    className: 'hu-tav',
    style: data.url ? imageCover(data.url) : avatarStyle(data.id, data.avatar),
  }, data.url ? '' : initialsOf(data.name)))
  el.appendChild(h('span', { className: 'hu-tt' },
    h('b', {}, data.name),
    /* 状态行三个独立节点（点＋渠道＋状态，flex gap 撑开）：分隔靠结构不靠符号，不许拼 · 也不许紧贴成一片。
     * 渠道节点＝平台 logo＋渠道名（A 方案，以图标认渠道、以文字兜底）。 */
    h('small', {},
      h('i', { className: dotClass(data.status) }),
      data.sub ? h('span', { className: 'hu-ch' }, logoNode(data), data.sub) : null,
      h('span', { className: 'hu-st' + (data.status === 'unbound' ? ' hu-st-bad' : '') }, data.statusText))))
  try {
    const r = a.getBoundingClientRect()
    const w = Number(el.offsetWidth) || 0
    const hh = Number(el.offsetHeight) || 0
    const doc = (globalThis as unknown as { document?: { documentElement?: { clientWidth?: number; clientHeight?: number } } }).document
    const vw = Number(doc?.documentElement?.clientWidth) || 0
    const vh = Number(doc?.documentElement?.clientHeight) || 0
    /* 默认在芯片正上方；上方装不下就翻到下方（真机第一行芯片贴顶）。左右夹在视口内。 */
    let top = r.top - hh - 8
    if (top < 8) top = Math.min(r.bottom + 8, Math.max(8, vh - hh - 8))
    let left = r.left + r.width / 2 - w / 2
    if (vw > 0) left = Math.max(8, Math.min(left, Math.max(8, vw - w - 8)))
    el.style.top = Math.round(top) + 'px'
    el.style.left = Math.round(Math.max(0, left)) + 'px'
    /* 定位落定了才点亮（opacity:0 不影响量尺寸，先量后亮完全够用）：几何拿不到（抛了）
     * ⇒ 盒子保持熄灭，不许无定位现身（之前先亮后量，定位一丢就是左下角一个已点亮的盒子）。 */
    el.classList.add('on')
    /* 最后进层：有 Popover API 的宿主进 top layer（盖过设置页的 dialog），失败自动退回 z-index。 */
    try { showLayer(el) } catch { /* 进层失败不挡显示（z-index 兜底还在） */ }
    /* 自证几何（#136 真机竖排卡）：悬停落一条 info，磁盘日志直接给出盒子的真实朝向/尺寸/
     * 子节点数，不用开控制台、不看截图像素。走 assistant.action（info 常驻，无需拨开关）。 */
    try {
      const cs = (globalThis as unknown as { getComputedStyle?: (e: unknown) => { flexDirection?: string } }).getComputedStyle?.(el)
      const t0 = el.children?.[0] as unknown as { offsetWidth?: number; offsetHeight?: number } | undefined
      logLine('info', 'assistant.action', {
        action: 'tip-show', assistantId: data.id, ok: true,
        message: 'flex=' + String(cs?.flexDirection ?? '?') + ' box=' + String(w) + 'x' + String(hh)
          + ' tav=' + String(t0?.offsetWidth ?? '?') + 'x' + String(t0?.offsetHeight ?? '?')
          + ' kids=' + String(el.children?.length ?? '?')
          + ' pop=' + String(typeof el.hasAttribute === 'function' && el.hasAttribute('popover')),
      })
    } catch { /* 取证失败不挡显示 */ }
  } catch { /* 拿不到几何信息就不显示 */ }
}

/** 悬停进入：延迟 120ms 再显（扫过不刷屏），期间离开则作废。 */
export function showAsstTip(a: HTMLElement, data: TipData): void {
  wireOnce()
  hideAsstTip()
  /* 样式兜底：认领来的旧盒子可能正处在样式被卸掉的窗口期（热重载/插件重载），先重装再画，
   * 裸盒（无气泡 chrome、单行裸字）不许再出现（#136 左下角）。 */
  try { ensureHomeRowStyles() } catch { /* 样式装不上也不挡显示 */ }
  anchor = a
  const set = (globalThis as unknown as { setTimeout?: typeof setTimeout }).setTimeout
  if (typeof set !== 'function') { paint(a, data); return }
  timer = set(() => { timer = null; if (anchor === a) paint(a, data) }, 120)
}

/** 收起（离开/滚动/点击/换目标都走它）：灭掉＋**拆盒**。
 * 拆盒不留盒：盒子从 DOM 里拿掉之后，以后样式再掉、版本再换，body 里没有盒子，
 * 就没有裸字可露（#136 左下角）。下次悬停重建一个（一个小 div，120ms 延迟后建一次，忽略不计）。 */
export function hideAsstTip(): void {
  const clear = (globalThis as unknown as { clearTimeout?: typeof clearTimeout }).clearTimeout
  if (timer !== null && typeof clear === 'function') clear(timer)
  timer = null
  anchor = null
  /* 先下层再拆盒（进过 top layer 的节点，hidePopover 让它归位；没进过就是空操作）。 */
  try { hideLayer(box) } catch { /* 桩里无 API 就是空操作 */ }
  try { (box as unknown as { remove?: () => void } | null)?.remove?.() } catch { /* 桩环境无 remove 就算了 */ }
  finally { box = null }
}
