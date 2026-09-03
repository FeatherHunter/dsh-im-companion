/** C1a 抽屉定位（drawer 瘦身拆出）：贴设置面板（.af-root）并占满其全部区域；resize 跟随。 */
import { sheetGeometry } from './data'

interface Rect { top: number; right: number; bottom: number; left: number }

function panelRect(): Rect | null {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    const el = document.querySelector('.af-root') as HTMLElement | null
    const r = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
    if (!r) return null
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left }
  } catch {
    return null
  }
}

/** 占满面板：找不到面板时不动（调用方 CSS 视口右沿 360 兜底）。 */
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
