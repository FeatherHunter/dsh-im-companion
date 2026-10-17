/**
 * 改名确认的**锚定**轻提示（owner 2026-10-17③：要出现在被改的名字控件正上方，且看得清对比度）。
 *
 * 为什么不用共享层 `ui/toast`：它只会钉在视口底部（变异类也只能挪到顶），不知道控件在哪。
 * 这里自实现——量控件矩形 → 优先放它正上方，上方不够就翻到下方，左右夹进视口；1.8s 自动淡出。
 *
 * 几何与 DOM 分开：`toastPlace` 是纯函数（可单测，不碰 DOM）；`homeToast` 只负责挂载与计时。
 * 样式在 `home-row-styles.ts`（`.home-ui.hu-toast`，元素自带 `.home-ui` ⇒ body 级挂载也能拿到令牌）。
 */
import { h } from '../dom'
import { icon } from '../icons'
import { logLine } from '../log'

/** 锚框：只要这四个数（`getBoundingClientRect()` 的结构子集，桩环境也能造）。 */
export interface AnchorBox { left: number; top: number; width: number; height: number }

/** 纯几何：给定气泡尺寸、锚框与视口，算落位（`above`＝落在控件上方）。无锚框＝顶部居中兜底。 */
export function toastPlace(w: number, hh: number, box: AnchorBox | null, vw: number, vh: number): { left: number; top: number; above: boolean } {
  const gap = 8
  const edge = 8
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi))
  if (!box) return { left: clamp((vw - w) / 2, edge, vw - w - edge), top: 16, above: true }
  const above = box.top - hh - gap >= edge
  const top = above ? box.top - hh - gap : box.top + box.height + gap
  return { left: clamp(box.left + box.width / 2 - w / 2, edge, vw - w - edge), top: clamp(top, edge, vh - hh - edge), above }
}

/** 就地改名的统一收尾（owner 2026-10-17③）：**先量锚框再写盘**——`render()` 会把行换掉，量晚了 rect 全 0；
 *  `write(true)`＝走 quiet（`home-ops` 让出成功提示，否则系统 toast 与锚定提示两处同时冒）；成功才提示。 */
export function finishRename(el: HTMLElement | undefined, value: string, write: (quiet: boolean) => Promise<boolean>, render: () => void): void {
  const box = boxOf(el)
  void write(true).then((ok) => {
    render()
    if (ok) homeToast(value.trim() ? '已改名：' + value.trim() : '已恢复默认名', box)
  })
}

let current: HTMLElement | null = null

/** 取锚框：元素还活着才量（行会在写盘后被重建 ⇒ 调用方必须先量后写）。量不到＝null（走顶部兜底）。 */
export function boxOf(el?: HTMLElement | null): AnchorBox | null {
  if (!el || el.isConnected === false) return null
  if (typeof el.getBoundingClientRect !== 'function') return null
  const r = el.getBoundingClientRect()
  if (!r || (!r.width && !r.height)) return null
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * 挂一条锚定提示。同刻只留一条；1.8s 后淡出、2s 后摘除。
 * `box` 为 null（桩 DOM／控件已重建）⇒ 顶部居中，宁可能偏也不丢提示。
 */
export function homeToast(message: string, box?: AnchorBox | null): void {
  logLine('debug', 'ui.action', { area: 'ui.toast', action: 'rename', ok: true, message: '用户可见提示：' + message })
  try { current?.remove() } catch { /* noop */ }
  /* 令牌作用域：本元素挂 body（.af-root 之外）⇒ 光有 .home-ui 不够——--af-* 由 theme.ts 的令牌块
   * 只发给 .af-root,.af-menu,.af-toast,.af-overlay,.af-portal；不在那一组里 ⇒ --hu-* 全成计算期
   * 无效值 ⇒ background-color 整条失效（computed 透明）、color 退回继承（浅色）。owner 2026-10-17④
   * 真机「背景是透明的」就是这个。故自带 af-portal（同 home-pop.ts:60 的 hu-pophost af-portal 那套）。 */
  const t = h('div', { className: 'hu-toast home-ui af-portal', role: 'status' }, icon('check', 14), message)
  document.body.appendChild(t)
  const r = typeof t.getBoundingClientRect === 'function' ? t.getBoundingClientRect() : null
  const g = globalThis as unknown as { innerWidth?: number; innerHeight?: number }
  const at = toastPlace(r?.width || 180, r?.height || 32, box ?? null, g.innerWidth || 1024, g.innerHeight || 768)
  t.setAttribute('style', 'left:' + Math.round(at.left) + 'px;top:' + Math.round(at.top) + 'px')
  const show = (): void => t.classList.add('show')
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(show)
  else setTimeout(show, 16)
  current = t
  setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => { try { t.remove() } catch { /* noop */ } }, 240)
  }, 1800)
}
