/** 格悬浮明细（home × 渠道）：一行一位助理＝状态点＋状态词＋头像＋名字。
 * 照抄 home-row-tip（#135/#136）用血换来的纪律：body 级 fixed 盒＋pointer-events:none
 * （不抢鼠标、不闪烁）；120ms 延迟（扫过不刷屏）；拆盒制（显一次拆一次，旧盒按类名横扫，
 * 跨版本热重载不裸奔）；离开/滚动/点击/表格重画即收；量完尺寸再点亮（无定位不许现身）。
 * 头像：有 `img:` 标记走 `avatar.get` 直读（与绿框同端点同形状，不经过写管道）；
 * 无标记回落首字色块（与雷达行头同语言，不混绿框色相环）。 */
import { h } from '../../client/dom'
import { imageCover } from '../../client/components/home-identity'
import { channelGlyphSvg } from '../../client/icons'
import type { RpcCall } from '../../client/data/fleet-api'
import { avatarColor, healthLabel, LOGO_TILE_BG, strings, type CellMate, type Lang, type MatrixCell } from './data'

/** 图片标记前缀：与 `home-avatar.ts` 的 MARK 同字面量（读口径对齐；写/缓存仍归 T11）。 */
const IMG_MARK = 'img:'

let box: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let anchor: HTMLElement | null = null
let last: { a: HTMLElement; cell: MatrixCell; lang: Lang } | null = null
let wired = false
let getRpc: (() => RpcCall | null) | null = null

/** 挂载时接一次取图通道（view 层调；取的是 ctx.rpc，与面板同桥）。 */
export function setCellPopRpc(fn: (() => RpcCall | null) | null): void {
  getRpc = fn
}

/** 悬浮私有的图缓存（id → data URL；只读，不碰 T11 写管道；负缓存记标记，免每悬停重试）。 */
const imgCache = new Map<string, string>()
const imgFailed = new Set<string>()
const imgPending = new Map<string, string>()
let imgScheduled = false

function queueImage(m: CellMate): void {
  if (!m.avatar || !m.avatar.startsWith(IMG_MARK) || !m.id) return
  if (imgCache.has(m.id) || imgFailed.has(m.avatar) || imgPending.has(m.id)) return
  imgPending.set(m.id, m.avatar)
  if (!imgScheduled) {
    imgScheduled = true
    setTimeout(flushImages, 0)
  }
}

/** 同一 tick 的多行合并成一条 `avatar.get`（home-avatar 同款批量思路，失败绝不抛）。
 * 通道未就绪（挂载前）⇒ 留队不丢，下次排队/刷新时顺带发出。 */
function flushImages(): void {
  imgScheduled = false
  const rpc = getRpc?.()
  if (!rpc || imgPending.size === 0) return
  const ask = Array.from(imgPending.entries())
  imgPending.clear()
  const markers = new Map(ask)
  void (rpc('/im-companion', 'avatar.get', { ids: ask.map(([id]) => id) }, AbortSignal.timeout(8000)) as Promise<unknown>)
    .then((raw) => {
      const envelope = raw as { ok?: boolean; value?: { images?: Record<string, unknown> } } | null
      const images = envelope?.ok === true ? (envelope.value?.images ?? {}) : {}
      let touched = false
      for (const [id] of ask) {
        const u = images[id]
        if (typeof u === 'string' && u.startsWith('data:image/')) {
          imgCache.set(id, u)
          touched = true
        } else {
          imgFailed.add(markers.get(id) ?? '')
        }
      }
      /* 图到了且盒子还开着 ⇒ 就地重画（anchor 已游离/盒子已收则 last 为空，自然作废）。 */
      if (touched && last && last.a.isConnected) paint(last.a, last.cell, last.lang)
    })
    .catch(() => {
      for (const marker of markers.values()) imgFailed.add(marker)
    })
}

function wireOnce(): void {
  if (wired) return
  wired = true
  try {
    window.addEventListener('scroll', hideCellPop, true)
    window.addEventListener('resize', hideCellPop)
    document.addEventListener('pointerdown', hideCellPop, true)
  } catch { /* 桩环境无事件系统：悬浮只在真机出现，忽略 */ }
}

/** 拆掉 body 里所有本悬浮盒（跨版本热重载留下的旧盒一并带走：只认类名）。 */
function sweep(): void {
  try {
    const list = document.body.querySelectorAll('.fleet-radar-pop')
    for (let i = 0; i < list.length; i++) {
      try { list[i]?.remove() } catch { /* 单个拆不掉不影响别的 */ }
    }
  } catch { /* 无 DOM 即无盒 */ }
}

function mateRow(m: CellMate, lang: Lang): HTMLElement {
  const t = strings(lang)
  const hasMark = !!m.avatar && m.avatar.startsWith(IMG_MARK) && !!m.id
  const url = hasMark ? (imgCache.get(m.id) ?? null) : null
  /* 未命中且有标记 ⇒ 排一次批量取图（首绘先露首字块，图到重画补上，不空等）。 */
  if (hasMark && !url) queueImage(m)
  const av = url
    ? h('span', { className: 'fleet-radar-av', style: imageCover(url) })
    : h('span', {
      className: 'fleet-radar-av',
      style: { background: avatarColor(m.name || m.botId) },
    }, (m.name || m.botId || '?').charAt(0).toUpperCase()) as HTMLElement
  return h('div', { className: 'fleet-radar-poprow' },
    h('span', { className: 'fleet-radar-dot ' + m.health }),
    h('span', { className: 'fleet-radar-st' }, healthLabel(m.health, lang) + (m.stale ? t.staleNote : '')),
    av,
    h('span', { className: 'fleet-radar-nm' }, m.name || m.botId)) as HTMLElement
}

/** 首行渠道 LOGO：照抄 view 侧 logoNode（读共享 icons＋data 底色，不 import view，免循环）。
 * 未知渠道回 null，首行只剩文字。 */
function logoNode(channel: string): HTMLElement | null {
  try {
    const svg = channelGlyphSvg(channel, 12)
    if (!svg) return null
    return h('span', {
      className: 'fleet-radar-logo',
      dataset: { ch: channel },
      html: svg,
      style: { background: LOGO_TILE_BG[channel] ?? 'var(--dsw-alias-fill-tertiary,rgba(127,127,127,.15))' },
    }) as HTMLElement
  } catch {
    return null
  }
}

function paint(a: HTMLElement, cell: MatrixCell, lang: Lang): void {
  try {
    if (typeof document === 'undefined' || !a.isConnected) return
    hideCellPop()
    const el = h('div', { className: 'fleet-radar-pop', role: 'tooltip' }) as HTMLElement
    const hd = h('div', { className: 'fleet-radar-pop-hd' }) as HTMLElement
    const logo = logoNode(cell.channel)
    if (logo) hd.appendChild(logo as unknown as Node)
    hd.appendChild(h('span', {}, cell.label) as unknown as Node)
    el.appendChild(hd as unknown as Node)
    for (const m of cell.mates) el.appendChild(mateRow(m, lang) as unknown as Node)
    document.body.appendChild(el)
    box = el
    const r = a.getBoundingClientRect()
    const w = el.offsetWidth || 0
    const hh = el.offsetHeight || 0
    const vw = document.documentElement?.clientWidth || 0
    const vh = document.documentElement?.clientHeight || 0
    let top = r.top - hh - 8
    if (top < 8) top = Math.min(r.bottom + 8, Math.max(8, vh - hh - 8))
    let left = r.left + r.width / 2 - w / 2
    if (vw > 0) left = Math.max(8, Math.min(left, Math.max(8, vw - w - 8)))
    el.style.top = Math.round(top) + 'px'
    el.style.left = Math.round(Math.max(0, left)) + 'px'
    /* 定位落定了才点亮（CSS 侧 opacity:0 先量尺寸，.on 再亮）：几何拿不到 ⇒ 盒子保持熄灭。 */
    el.classList.add('on')
  } catch { /* 拿不到几何就不显示 */ }
}

/** 预热：表格画完即把全格有图助理排进批量取图（与悬浮同缓存同端点，不新增请求种类）。
 * 用户从看到表到悬停通常有数秒 ⇒ 首悬即见真图，无占位闪。命中/失败/排队中自动跳过，
 * 全命中时连一条请求都不发；预热永不干扰渲染。 */
export function warmCellPopImages(cells: MatrixCell[]): void {
  try {
    for (const c of cells) {
      const mates = c?.mates
      if (!mates) continue
      for (const m of mates) queueImage(m)
    }
  } catch { /* 预热失败只影响首悬速度，不影响表 */ }
}

/** 悬停进入：延迟 120ms 再显（扫过一排格子不刷屏），期间离开则作废。 */
export function showCellPop(a: HTMLElement, cell: MatrixCell, lang: Lang): void {
  try {
    wireOnce()
    hideCellPop()
    if (!cell.mates.length) return
    anchor = a
    last = { a, cell, lang }
    timer = setTimeout(() => { timer = null; if (anchor === a) paint(a, cell, lang) }, 120)
  } catch { /* 桩环境直接忽略 */ }
}

/** 收起（离开/滚动/点击/重画都走它）：清延迟＋拆盒，不留盒。 */
export function hideCellPop(): void {
  try {
    if (timer !== null) clearTimeout(timer)
  } catch { /* ignore */ }
  timer = null
  anchor = null
  last = null
  try { box?.remove() } catch { /* ignore */ }
  box = null
  sweep()
}

/** 卸载（弹窗关闭）：收盒＋断取图通道（transport 是挂载级，paint 级重画不断）。 */
export function disposeCellPop(): void {
  hideCellPop()
  getRpc = null
}
