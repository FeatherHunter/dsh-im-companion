/** T13 #135 助理芯片的**悬停小气泡**（owner：漂亮的小气泡，popover 也行）。
 *
 * 为什么自己做、不复用 `[data-tip]` 那条 CSS 气泡：CSS 气泡只能塞一行 `attr(data-tip)` 文本，
 * 而这里要的是「小头像 ＋ 名字 ＋ 状态点 ＋ 渠道/机器人」两行卡片。故做成 body 级 float
 * （宿主仍带 `.home-ui` 类，作用域不破）：`position:fixed` ⇒ 不会被列表的 `overflow:hidden` 裁掉。
 *
 * 纪律：气泡只读、不拦指针（`pointer-events:none`）⇒ 不会把鼠标从芯片上"抢走"造成闪烁；
 * 延迟 120ms 才显（扫过一排芯片不刷屏）；滚动/点击/离开任一即收。日志零（纯视觉，不进关键路径）。
 *
 * 永不裸奔三件套（owner 2026-10-16：左下角裸字 `DLdsh-log未绑定 · 飞书 · 未绑定`）：
 * 无样式不画（`homeRowStylesAlive` 验活）、定位完才亮（`.on` 落在定位之后）、收起即倒内容
 * —— 三条同时成立，裸字在构造上就没有出现的位置。
 */
import { h } from '../dom'
import { avatarStyle, imageCover, initialsOf } from './home-identity'
import { ensureHomeRowStyles, homeRowStylesAlive } from './home-row-styles'

export interface TipData {
  id: string
  name: string
  /** 图片头像的 data URL（取不到给 null ⇒ 回落预设色＋首字母）。 */
  url: string | null
  avatar: string | null
  status: 'on' | 'off' | 'unbound'
  statusText: string
  /** 附加一行（渠道 · 机器人名之类），空串则不显示。 */
  sub: string
}

let box: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let anchor: HTMLElement | null = null
let wired = false

const dotClass = (s: TipData['status']): string => 'hu-cdot' + (s === 'on' ? ' on' : s === 'off' ? ' off' : ' none')

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

function ensureBox(): HTMLElement {
  if (box && connected(box)) return box
  const doc = (globalThis as unknown as { document?: { body?: HTMLElement } }).document
  /* 热重载/插件重载后旧盒子会留在 body 里（本模块变量已重置）：认领它而不是再叠一个，
   * 否则 reco 越多、游离裸盒越多（#136 左下角裸字即此物缺样式时的样子）。 */
  const adopted = doc?.body?.querySelector?.('.hu-tiphost') as unknown as HTMLElement | null
  if (adopted && connected(adopted)) { box = adopted; return box }
  box = h('div', { className: 'home-ui hu-tiphost', role: 'tooltip' })
  doc?.body?.appendChild(box)
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
    h('small', {}, h('i', { className: dotClass(data.status) }), data.statusText + (data.sub ? ' · ' + data.sub : ''))))
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

/** 收起（离开/滚动/点击/换目标都走它）：灭掉＋倒掉内容。
 * 内容必须一起倒：盒子肮脏地留在 body 里是设计（复用单盒），但旧字不许过夜 ——
 * 以后样式再掉、定位再丢，盒子里没有字，就没有裸字可露（#136 左下角）。 */
export function hideAsstTip(): void {
  const clear = (globalThis as unknown as { clearTimeout?: typeof clearTimeout }).clearTimeout
  if (timer !== null && typeof clear === 'function') clear(timer)
  timer = null
  anchor = null
  try { box?.classList.remove('on'); if (box) box.textContent = '' } catch { /* 桩环境无 classList 就算了 */ }
}
