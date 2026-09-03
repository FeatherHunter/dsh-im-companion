/** left-badges 自画悬浮卡：行悬停约 0.3s 出卡（渠道 glyph + 状态点 + 检测时间），纯视觉补充。\n * 委托监听不绑行（重渲染免疫）；滚轮/尺寸/Esc/点击/移出即藏；未绑定无卡。\n * 视觉第一：logo 认渠道、点认状态，不复读文字（用户裁定）。 */
import { badgeForWorkspace } from '../../client/data/bindings'
import type { BotSnap } from '../../client/data/fleet-api'
import { HEALTH_LABELS, channelLabel, healthOf, type HealthKind } from '../../client/data/config'
import { channelGlyphSvg } from '../../client/icons'
import { lastCheckedText } from '../../client/data/bindings'

export interface CardChannel {
  channel: string
  kind: HealthKind
  glyph: string | null
}

export interface CardData {
  agent: string
  kind: HealthKind
  channels: CardChannel[]
  time: string
}

/** 卡片数据（纯函数可单测）：未绑定返回 null（无卡）。 */
export function buildCardData(workspacePath: string, bots: BotSnap[]): CardData | null {
  try {
    const badge = badgeForWorkspace(workspacePath, bots)
    if (badge.kind === 'unbound') return null
    const bound = bots.filter((b) => b.workspace === workspacePath)
    if (!bound.length) return null
    return {
      agent: badge.agent,
      kind: badge.kind,
      channels: bound.map((b) => ({
        channel: b.channel,
        kind: b.stale ? 'warn' : healthOf(b.healthStatus, b.connected),
        glyph: channelGlyphSvg(b.channel, 16),
      })),
      time: lastCheckedText(bound),
    }
  } catch {
    return null
  }
}

const CARD_CLASS = 'left-badges-card'
const HEAD_CLASS = 'left-badges-card-head'
const NAME_CLASS = 'left-badges-card-name'
const DOT_CLASS = 'left-badges-card-dot'
const ROW_CLASS = 'left-badges-card-row'
const GLYPH_CLASS = 'left-badges-card-glyph'
const FOOT_CLASS = 'left-badges-card-foot'

export interface HoverDeps {
  matchRow: (el: Element | null) => Element | null
  resolve: (row: Element) => CardData | null
}

function el(tag: string, cls: string, text?: string): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    const d = document.createElement(tag)
    d.setAttribute('class', cls)
    if (typeof text === 'string') d.textContent = text
    return d as unknown as HTMLElement
  } catch {
    return null
  }
}

function dot(kind: HealthKind, big: boolean): HTMLElement | null {
  const d = el('span', DOT_CLASS + ' ' + kind + (big ? ' big' : ''))
  return d
}

export function mountHoverCard(deps: HoverDeps, dwellMs = 300): () => void {
  const noop = (): void => {}
  try {
    if (typeof document === 'undefined') return noop
  } catch {
    return noop
  }
  let card: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Element | null = null
  let cursor = { x: 0, y: 0 }
  const clearTimer = (): void => {
    try {
      if (timer !== undefined) clearTimeout(timer)
    } catch {
      /* 清理失败忽略 */
    }
    timer = undefined
    pending = null
  }
  const hide = (): void => {
    clearTimer()
    try {
      if (card) (card as unknown as { style?: { display?: string } }).style!.display = 'none'
    } catch {
      /* 隐藏失败忽略 */
    }
  }
  const inCard = (t: unknown): boolean => {
    try {
      return !!card && !!t && (card as unknown as { contains?: (n: unknown) => boolean }).contains?.(t) === true
    } catch {
      return false
    }
  }
  const place = (): void => {
    try {
      if (!card) return
      const c = card as unknown as { offsetWidth?: number; offsetHeight?: number; style?: { left?: string; top?: string; visibility?: string } }
      const w = c.offsetWidth || 220
      const h = c.offsetHeight || 120
      const W = typeof window === 'undefined' ? 0 : window.innerWidth || 0
      const H = typeof window === 'undefined' ? 0 : window.innerHeight || 0
      let x = cursor.x + 14
      let y = cursor.y + 16
      if (W > 0) x = Math.max(8, Math.min(x, W - w - 8))
      if (H > 0) y = y + h + 8 > H ? Math.max(8, cursor.y - h - 10) : y
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
      const c = card as unknown as { style?: { display?: string; visibility?: string }; replaceChildren?: (...n: unknown[]) => void; append?: (...n: unknown[]) => void }
      try {
        if (typeof (card as unknown as { replaceChildren?: unknown }).replaceChildren === 'function') (c.replaceChildren as (...n: unknown[]) => void)()
        else if (c.style) c.style.display = 'none'
      } catch {
        /* 清空失败继续 */
      }
      const head = el('div', HEAD_CLASS)
      const name = el('span', NAME_CLASS, data.agent)
      const hd = dot(data.kind, true)
      if (!head || !name || !hd) return false
      head.appendChild(name)
      head.appendChild(hd)
      const parts: unknown[] = [head]
      for (const ch of data.channels) {
        const row = el('div', ROW_CLASS)
        if (!row) continue
        try {
          row.setAttribute('aria-label', channelLabel(ch.channel) + ' ' + HEALTH_LABELS[ch.kind])
        } catch {
          /* 无障碍标签失败忽略 */
        }
        const g = el('span', GLYPH_CLASS)
        const d = dot(ch.kind, false)
        if (!g || !d) continue
        try {
          if (ch.glyph) (g as unknown as { innerHTML?: string }).innerHTML = ch.glyph
          else g.textContent = (ch.channel || '?').slice(0, 1).toUpperCase()
        } catch {
          /* glyph 失败回退首字 */
        }
        row.appendChild(g)
        row.appendChild(d)
        parts.push(row)
      }
      const foot = el('div', FOOT_CLASS, data.time)
      if (!foot) return false
      parts.push(foot)
      for (const p of parts) (card as unknown as { appendChild: (n: unknown) => void }).appendChild(p)
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
      place()
    } catch {
      /* 展示失败静默 */
    }
  }
  const onOver = (ev: unknown): void => {
    try {
      const e = ev as { target?: Element | null; clientX?: number; clientY?: number }
      if (typeof e.clientX === 'number') cursor = { x: e.clientX, y: typeof e.clientY === 'number' ? e.clientY : 0 }
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
        if (pending && (to === pending || (pending as unknown as { contains?: (n: unknown) => boolean }).contains?.(to))) return
      } catch {
        /* 归属判断失败就隐藏 */
      }
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
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', hide as (ev: UIEvent) => void)
      stops.push(() => {
        try {
          window.removeEventListener('resize', hide as (ev: UIEvent) => void)
        } catch {
          /* 清理失败忽略 */
        }
      })
    }
  } catch {
    /* 注册失败忽略 */
  }
  return () => {
    clearTimer()
    for (const s of stops) {
      try {
        s()
      } catch {
        /* 清理失败忽略 */
      }
    }
    try {
      if (card) {
        const p = (card as unknown as { parentNode?: { removeChild?: (c: unknown) => void } }).parentNode
        if (p && typeof p.removeChild === 'function') p.removeChild(card)
      }
    } catch {
      /* 清理失败忽略 */
    }
    card = null
  }
}
