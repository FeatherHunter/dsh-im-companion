/** left-badges 自画悬浮卡：行悬停约 0.3s 出卡（家行 + 分隔线 + 助理/机器人行 + 检测时间），纯视觉补充。
 * 委托监听不绑行（重渲染免疫）；滚轮/尺寸/Esc/点击/移出即藏。
 * 本文件只管悬停生命周期与定位；卡片内容结构在 card-render，数据在 card-model。
 * 视觉第一：logo 认渠道、脸认助理、机器人字形认游离、点认状态。 */
import { logLine, logOn } from '../../client/log'
import { CARD_CLASS, renderCard } from './card-render'
import type { CardData } from './card-model'

export type { CardData } from './card-model'

export interface HoverDeps {
  matchRow: (el: Element | null) => Element | null
  resolve: (row: Element) => CardData | null
}

function el(tag: string, cls: string): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    const d = document.createElement(tag)
    d.setAttribute('class', cls)
    return d as unknown as HTMLElement
  } catch {
    return null
  }
}

export function mountHoverCard(deps: HoverDeps, dwellMs = 300): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  let card: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Element | null = null
  const clearTimer = (): void => {
    if (timer !== undefined) try { clearTimeout(timer) } catch { /* 忽略 */ }
    timer = undefined
    pending = null
  }
  const hide = (): void => {
    clearTimer()
    try {
      const st = (card as unknown as { style?: { display?: string } } | null)?.style
      if (st) st.display = 'none'
    } catch { /* 忽略 */ }
  }
  const inCard = (t: unknown): boolean => {
    try {
      return !!card && !!t && (card as unknown as { contains?: (n: unknown) => boolean }).contains?.(t) === true
    } catch {
      return false
    }
  }
  const place = (anchor: Element | null): void => {
    try {
      if (!card) return
      const c = card as unknown as { offsetWidth?: number; offsetHeight?: number; style?: { left?: string; top?: string; visibility?: string } }
      const w = c.offsetWidth || 220
      const h = c.offsetHeight || 120
      const W = typeof window === 'undefined' ? 0 : window.innerWidth || 0
      const H = typeof window === 'undefined' ? 0 : window.innerHeight || 0
      let edge = W > 0 ? W - 8 : 320
      let top = 8
      let bottom = top + 34
      try {
        const g = anchor && typeof anchor.getBoundingClientRect === 'function' ? anchor.getBoundingClientRect() : null
        if (g) { edge = g.right; top = g.top; bottom = g.bottom }
      } catch { /* 忽略 */ }
      let x = edge - w
      if (W > 0) x = Math.max(8, Math.min(x, W - w - 8))
      let y = top - h - 8
      if (y < 8) y = bottom + 8
      if (H > 0) y = Math.max(8, Math.min(y, H - h - 8))
      if (c.style) {
        c.style.left = Math.max(0, x) + 'px'
        c.style.top = Math.max(0, y) + 'px'
        c.style.visibility = 'visible'
      }
    } catch {
      /* 定位失败保持隐藏 */
    }
  }
  const fill = (data: CardData): boolean => {
    try {
      if (typeof document === 'undefined') return false
      if (!card) {
        const made = el('div', CARD_CLASS)
        if (!made) return false
        card = made
        const host = document.body ?? document.documentElement
        host.appendChild(card)
      }
      const c = card as unknown as { style?: { display?: string; visibility?: string } }
      if (!renderCard(card, data)) return false
      if (c.style) {
        c.style.display = 'block'
        c.style.visibility = 'hidden'
      }
      return true
    } catch {
      return false
    }
  }
  const show = (row: Element): void => {
    try {
      const data = deps.resolve(row)
      if (!data) return
      if (!fill(data)) return
      place(row)
    } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-badges', action: 'card-fail', ok: false, message: String((e as Error)?.message ?? e) }) }
  }
  const onOver = (ev: unknown): void => {
    try {
      const e = ev as { target?: Element | null }
      if (inCard(e.target)) return
      const row = deps.matchRow(e.target ?? null)
      if (!row) {
        clearTimer()
        return
      }
      if (row === pending) return
      clearTimer()
      hide()
      pending = row
      timer = setTimeout(() => {
        timer = undefined
        if (pending) show(pending)
      }, dwellMs)
    } catch {
      /* 悬停失败静默 */
    }
  }
  const onOut = (ev: unknown): void => {
    try {
      const e = ev as { relatedTarget?: unknown }
      const to = e.relatedTarget
      if (inCard(to)) return
      try {
        const pc = pending as unknown as { contains?: (n: unknown) => boolean } | null
        if (pending && (to === pending || (typeof pc?.contains === 'function' ? pc.contains(to) : false))) return
      } catch { /* 忽略 */ }
      hide()
    } catch {
      /* 移出失败静默 */
    }
  }
  const onKey = (ev: unknown): void => {
    try {
      if ((ev as { key?: string }).key === 'Escape') hide()
    } catch {
      /* 按键失败忽略 */
    }
  }
  const stops: (() => void)[] = []
  const on = (t: string, fn: (ev: unknown) => void, capture?: boolean): void => {
    try {
      document.addEventListener(t, fn as (ev: Event) => void, capture === true)
      stops.push(() => {
        try {
          document.removeEventListener(t, fn as (ev: Event) => void, capture === true)
        } catch {
          /* 清理失败忽略 */
        }
      })
    } catch {
      /* 注册失败忽略 */
    }
  }
  on('mouseover', onOver)
  on('mouseout', onOut)
  on('keydown', onKey)
  on('click', hide)
  on('scroll', hide, true)
  const onWin = (t: string, fn: (ev: unknown) => void): void => {
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
      window.addEventListener(t, fn as (ev: Event) => void)
      stops.push(() => {
        try { window.removeEventListener(t, fn as (ev: Event) => void) } catch { /* 忽略 */ }
      })
    } catch { /* 忽略 */ }
  }
  onWin('resize', hide)
  return () => {
    clearTimer()
    for (const s of stops) {
      try { s() } catch { /* 忽略 */ }
    }
    try {
      const p = (card as unknown as { parentNode?: { removeChild?: (c: unknown) => void } } | null)?.parentNode
      if (p && typeof p.removeChild === 'function') p.removeChild(card)
    } catch { /* 忽略 */ }
    card = null
  }
}
