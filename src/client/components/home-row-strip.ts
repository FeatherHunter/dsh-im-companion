/** T13 #135 家行第二段（owner 选定的 B 方案）：助理条带 / 空家入口 / 孤儿红色警示行。
 *
 * 三种形态，一条不换行、溢出裁掉：
 *   ① 有空家 ⇒ 「＋ 建助理」虚线胶囊（零态即入口，带 `data-item-act` ⇒ 被 `wireRow` 拦下，不会误触进 L2）；
 *   ② 有助理 ⇒ 芯片（圆头像 ＋ 名字 ＋ 状态点）＋ 末端「N 助理」徽章；
 *   ③ 孤儿家 ⇒ 红色警示行（⚠ 章 ＋ 原工作区目录），由 `homeRow` 传 `orphan`。
 *
 * **按宽度三级降级**（owner 2026-10-15）：
 *   完整（芯片带名字）→ 收起（只留头像＋点，名字/状态改由悬停小气泡报）→ 裁剪（后面不画，
 *   末端那枚「N 助理」徽章说明这个家一共有几位）。判定一律用**真 DOM 实测**（`scrollWidth/clientWidth`），
 *   不做宽度估算 ⇒ 换字体、换语言、缩放都不会跑偏；量不到（面板没挂/隐藏、单测桩）时**保持完整档**。
 *
 * 数据进、DOM 出（不 import `home-rows`）⇒ 与 `home-rows` 无环；取图仍只走 `home-avatar` 的唯一通道。
 */
import { h } from '../dom'
import { avatarSrc } from './home-avatar'
import { avatarStyle, imageCover, initialsOf } from './home-identity'
import { ensureHomeRowStyles } from './home-row-styles'
import { hideAsstTip, showAsstTip } from './home-row-tip'

export interface StripAsst {
  id: string
  name: string
  /** 行里的 `avatar` 原值（`img:<文件名>` / `'1'..'6'` / null）——取图与色相都靠它。 */
  avatar: string | null
  /** true 在线 / false 离线或未绑定 / null 未绑定（画空心点）。 */
  on: boolean | null
  /** 气泡第二行的附加信息（渠道 · 机器人名）。 */
  sub: string
}

export interface StripOpts {
  homeId: string
  orphan: boolean
  /** 孤儿家显示的原工作区目录。 */
  path: string
  assts: StripAsst[]
}

interface Ctx { o: StripOpts; badge: HTMLElement }
const CTX = new WeakMap<HTMLElement, Ctx>()
/* 还活着的条带（有助理才进）：窗口宽度/字体/缩放变了之后重判一遍的登记簿。
 * 面板每次 render 都重建行 ⇒ 旧条带游离，重判时顺手摘掉（不泄漏）。 */
const LIVE = new Set<HTMLElement>()
let resizeArmed = false

function connected(el: HTMLElement): boolean {
  const flag = (el as unknown as { isConnected?: boolean }).isConnected
  return typeof flag === 'boolean' ? flag : !!el.parentNode
}

/** 所有活条带按当前宽度重判（窗口 resize/字体就绪后走它；`fits` 是留给验证物的接缝）。
 *  游离（已被面板刷新换掉）的只摘不判。 */
export function refitStrips(fits?: (el: HTMLElement) => boolean): void {
  for (const s of [...LIVE]) {
    if (!connected(s)) { LIVE.delete(s); continue }
    applyFit(s, fits)
  }
}

function armResize(): void {
  if (resizeArmed) return
  resizeArmed = true
  try {
    const w = globalThis as unknown as { addEventListener?: (t: string, f: () => void) => void }
    const raf = (globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame
    let queued = false
    w.addEventListener?.('resize', () => {
      /* rAF 节流：一次 resize 风暴只重判一轮（每条带只是一次 paint＋量宽，本来就很轻）。 */
      if (queued) return
      queued = true
      const run = (): void => { queued = false; refitStrips() }
      if (typeof raf === 'function') raf(run)
      else run()
    })
  } catch { /* 桩环境无事件系统：首帧 fit 照常，不跟窗宽 */ }
}

/** 状态点三态（类名显式写出 on/off/none：断言与样式都不靠「默认就是绿」这种隐含约定）。 */
const dotClass = (on: boolean | null): string => 'hu-cdot' + (on === true ? ' on' : on === false ? ' off' : ' none')
const statusText = (on: boolean | null): string => (on === true ? '在线' : on === false ? '离线' : '未绑定')

function asstChip(a: StripAsst, compact: boolean): HTMLElement {
  const url = a.avatar ? avatarSrc(a.id, a.avatar) : null
  const av = h('span', { className: 'hu-cav', style: url ? imageCover(url) : avatarStyle(a.id, a.avatar) },
    url ? '' : initialsOf(a.name))
  if (compact) av.appendChild(h('i', { className: dotClass(a.on) }))
  const chip = h('span', {
    className: `hu-chip${a.on === null ? ' unbound' : ''}${compact ? ' cmp' : ''}`,
    'data-asst': a.id,
    'aria-label': `${a.name}：${statusText(a.on)}`,
  }, av, ...(compact ? [] : [h('span', { className: 'hu-cnm' }, a.name), h('i', { className: dotClass(a.on) })]))
  /* 悬停小气泡：收起档只有头像＋点，名字与状态全靠它报出来（owner 2026-10-15）。 */
  const data = { id: a.id, name: a.name, url, avatar: a.avatar, status: (a.on === true ? 'on' : a.on === false ? 'off' : 'unbound') as 'on' | 'off' | 'unbound', statusText: statusText(a.on), sub: a.sub }
  chip.addEventListener('pointerenter', () => showAsstTip(chip, data))
  chip.addEventListener('pointerleave', hideAsstTip)
  return chip
}

function paint(strip: HTMLElement, ctx: Ctx, mode: 'full' | 'compact', keep: number): void {
  strip.textContent = ''
  const list = ctx.o.assts
  const shown = mode === 'full' ? list : list.slice(0, Math.max(0, keep))
  for (const a of shown) strip.appendChild(asstChip(a, mode === 'compact'))
  strip.appendChild(ctx.badge)
  strip.setAttribute('data-rung', mode === 'full' ? 'full' : keep === list.length ? 'compact' : 'trim')
}

/** 真机实测＝这一个判据：**量不到（宽 0：面板没挂/隐藏、单测桩）一律当「放得下」** ⇒ 保持完整档，
 *  绝不因为量不到就把条带降级（那是「瞎降级」，比溢出更糟）。 */
function fitsNow(el: HTMLElement): boolean {
  const w = Number((el as unknown as { clientWidth?: number }).clientWidth ?? 0)
  if (!(w > 0)) return true
  return Number((el as unknown as { scrollWidth?: number }).scrollWidth ?? 0) <= w
}

/** 按实测宽度降级：完整档放得下就什么都不做；否则改画收起档并逐个减到放得下为止
 *  （减到 0 就只剩末端那枚「N 助理」徽章——它报的是**总数**，不是显示出来的个数）。
 *  `fits` 是留给验证物的接缝（真机走 `fitsNow`），回 true＝这一档放得下。 */
export function applyFit(strip: HTMLElement, fits?: (el: HTMLElement) => boolean): void {
  const ctx = CTX.get(strip)
  if (!ctx || !ctx.o.assts.length) return
  const ok = fits ?? fitsNow
  /* 先归一到完整档再判：降级**不是单向闩锁**——面板变宽/换设备/换字体后必须能长回完整档，
     故判据永远量「完整档放不放得下」，而不是量当前（可能已经收起/裁剪）的那一份。 */
  paint(strip, ctx, 'full', ctx.o.assts.length)
  if (ok(strip)) return
  for (let keep = ctx.o.assts.length; keep >= 0; keep -= 1) {
    paint(strip, ctx, 'compact', keep)
    if (ok(strip)) return
  }
}

/** 首帧之后实测一次（此刻行已经挂进 DOM，量得到真宽度）。没有 rAF 的环境（单测桩）跳过。 */
function scheduleFit(strip: HTMLElement): void {
  const raf = (globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame
  if (typeof raf === 'function') raf(() => applyFit(strip))
}

/** 家行第二段。孤儿家回红色警示行；空家回「＋ 建助理」；有助理回条带（首帧完整，帧后按宽度降级）。 */
export function homeStrip(o: StripOpts): HTMLElement {
  ensureHomeRowStyles()
  if (o.orphan) {
    return h('div', { className: 'hu-warnline' },
      h('span', { className: 'hu-pill alert' }, '⚠ 工作区已不在'),
      h('span', { className: 'hu-path', title: o.path || '原工作区目录已不可知' }, o.path || '原工作区目录已不可知'))
  }
  const strip = h('div', { className: 'hu-strip' })
  if (!o.assts.length) {
    strip.appendChild(h('button', {
      className: 'hu-add', type: 'button', 'data-item-act': 'new-asst', 'data-id': o.homeId,
      'aria-label': '在这个家新建助理', title: '在这个家新建助理',
    }, '＋ 建助理'))
    return strip
  }
  const ctx: Ctx = { o, badge: h('span', { className: `hu-cnt${o.assts.length > 1 ? ' many' : ''}` }, `${o.assts.length} 助理`) }
  CTX.set(strip, ctx)
  paint(strip, ctx, 'full', o.assts.length)
  scheduleFit(strip)
  /* 进登记簿＋装窗宽跟随：挂载时只判一次不够，窗口/字体/缩放变了必须重判（原型那根宽度条就是干这个的）。 */
  LIVE.add(strip)
  armResize()
  return strip
}
