/** C1a 抽屉挂载（drawer 瘦身拆出）：弹窗挂进副容器，不再挂 body。
 * 副容器 = .af-root 最近的裁剪祖先（设置面板可见区）；遮罩 + 面板 absolute 相对副容器铺满，
 * 上下左右天然以副容器为界，不随整页走。关闭时移除并还原副容器定位。 */
import { h } from '../../client/dom'

export interface PanelSheet {
  overlay: HTMLElement
  panel: HTMLElement
  close(): void
}

export interface PanelSheetOpts {
  label: string
  onClose?: () => void
}

/** 副容器：.af-root 最近的 overflow 非 visible 祖先；找不到回 null（调用方走失败态）。 */
export function findPanelHost(): HTMLElement | null {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    const el = document.querySelector('.af-root') as HTMLElement | null
    if (!el) return null
    let cur: HTMLElement | null = el.parentElement
    while (cur && cur !== document.documentElement && cur !== document.body) {
      let clip = false
      try {
        const cs = window.getComputedStyle(cur)
        clip = cs.overflowY !== 'visible' || cs.overflowX !== 'visible'
      } catch {
        /* 样式不可读则跳过该祖先 */
      }
      if (clip) return cur
      cur = cur.parentElement
    }
    return null
  } catch {
    return null
  }
}

/** 把遮罩 + 面板挂进副容器；副容器 static 时临时 relative，关闭还原。 */
export function showPanelSheet(opts: PanelSheetOpts): PanelSheet | null {
  const host = findPanelHost()
  if (!host) return null
  let prevPosition = ''
  let touched = false
  try {
    if (window.getComputedStyle(host).position === 'static') {
      prevPosition = host.style.position || ''
      host.style.position = 'relative'
      touched = true
    }
  } catch {
    /* 读不到定位就按原样挂 */
  }
  const panel = h('aside', { className: 'c1a-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label })
  const overlay = h('div', { className: 'c1a-overlay' }, panel)
  host.appendChild(overlay)
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    try {
      overlay.remove()
    } catch {
      /* ignore */
    }
    try {
      document.removeEventListener('keydown', onKey, true)
    } catch {
      /* ignore */
    }
    if (touched) {
      try {
        host.style.position = prevPosition
      } catch {
        /* ignore */
      }
    }
    if (opts.onClose) opts.onClose()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e: Event) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  return { overlay, panel, close }
}
