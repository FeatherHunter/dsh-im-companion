/** C1a 抽屉定位（drawer 瘦身拆出）：贴设置面板可见区并占满之；resize 跟随。
 * 锚点：.af-root（插件面板）的可见矩形 = 与全部裁剪祖先（面板/弹窗 padding-box）求交；
 * 内容高于面板可视区时，抽屉底边锁在面板底，不再顶到 DSH 视口底。（真机 #9 反馈） */
import { clipRect, sheetGeometry, type PanelRect } from './data'

/** .af-root 祖先链中的裁剪框：scroll/hidden/clip 容器的 padding-box（设置面板可视区即其一）。 */
function clipBoxes(el: HTMLElement): PanelRect[] {
  const clips: PanelRect[] = []
  let cur: HTMLElement | null = el.parentElement
  while (cur && cur !== document.documentElement && cur !== document.body) {
    let cs: CSSStyleDeclaration | null = null
    try {
      cs = window.getComputedStyle(cur)
    } catch {
      /* 样式不可读则跳过该祖先 */
    }
    if (cs && (cs.overflowY !== 'visible' || cs.overflowX !== 'visible')) {
      const b = cur.getBoundingClientRect()
      const left = b.left + (cur.clientLeft || 0)
      const top = b.top + (cur.clientTop || 0)
      clips.push({ top, left, right: left + (cur.clientWidth || 0), bottom: top + (cur.clientHeight || 0) })
    }
    cur = cur.parentElement
  }
  return clips
}

function panelRect(): PanelRect | null {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    const el = document.querySelector('.af-root') as HTMLElement | null
    if (!el || typeof el.getBoundingClientRect !== 'function') return null
    const r = el.getBoundingClientRect()
    return clipRect({ top: r.top, right: r.right, bottom: r.bottom, left: r.left }, clipBoxes(el))
  } catch {
    return null
  }
}

/** 占满面板可视区：找不到面板（或无可见面积）时不动（调用方 CSS 视口右沿兜底）。 */
export function placeSheetPanel(panel: HTMLElement): void {
  try {
    const vp = { width: window.innerWidth || 0, height: window.innerHeight || 0 }
    const g = sheetGeometry(panelRect(), vp)
    if (!g) return
    panel.style.top = g.top + 'px'
    panel.style.right = g.right + 'px'
    panel.style.bottom = g.bottom + 'px'
    panel.style.width = g.width + 'px'
  } catch {
    /* 定位失败保持兜底 */
  }
}

/** 跟随窗口变化重贴面板；返回 dispose（抽屉关闭时调用）。 */
export function followSheetResize(panel: HTMLElement): () => void {
  const onResize = (): void => placeSheetPanel(panel)
  window.addEventListener('resize', onResize)
  return () => {
    try {
      window.removeEventListener('resize', onResize)
    } catch {
      /* ignore */
    }
  }
}
