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
export function buildCardData(workspacePath: string, bots: BotSnap[], displayName?: string): CardData | null {
  try {
    const badge = badgeForWorkspace(workspacePath, bots)
    if (badge.kind === 'unbound') return null
    const bound = bots.filter((b) => b.workspace === workspacePath)
    if (!bound.length) return null
    return {
      agent: displayName || badge.agent,
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

const BREATH_BASE_MS = 1600
/** 呼吸相位：同渠道稳定、渠道间错开（ organic 节奏，见#6）；重渲染不跳变。 */
export function breathPhase(channel: string): { delay: string; duration: string } {
  try {
    let h = 5381
    const s = String(channel || '?')
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    const u = Math.abs(h)
    return { delay: '-' + ((u % BREATH_BASE_MS) / 1000).toFixed(2) + 's', duration: (1.6 + ((u >> 3) % 800) / 1000).toFixed(2) + 's' }
  } catch {
    return { delay: '0s', duration: '1.6s' }
  }
}

function dot(kind: HealthKind): HTMLElement | null {
  const d = el('span', DOT_CLASS + ' ' + kind)
  return d
}

export function mountHoverCard(deps: HoverDeps, dwellMs = 300): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  let card: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Element | null = null
  const clearTimer = (): void => {
    if (timer !== undefined) {
      try { clearTimeout(timer) } catch { /* 忽略 */ }
    }
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
      const c = card as unknown as { style?: { display?: string; visibility?: string }; replaceChildren: (...n: unknown[]) => void }
      try {
        c.replaceChildren()
      } catch { /* 忽略 */ }
      const head = el('div', HEAD_CLASS)
      const name = el('span', NAME_CLASS, data.agent)
      if (!head || !name) return false
      head.appendChild(name)
      const parts: unknown[] = [head]
      for (const ch of data.channels) {
        const row = el('div', ROW_CLASS)
        if (!row) continue
        try { row.setAttribute('aria-label', channelLabel(ch.channel) + ' ' + HEALTH_LABELS[ch.kind]) } catch { /* 忽略 */ }
        const g = el('span', GLYPH_CLASS)
        const d = dot(ch.kind)
        if (!g || !d) continue
        try {
          const ph = breathPhase(ch.channel)
          const st = (d as unknown as { style?: { animationDelay?: string; animationDuration?: string } }).style
          if (st) { st.animationDelay = ph.delay; st.animationDuration = ph.duration }
        } catch { /* 忽略 */ }
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
      place(row)
    } catch {
      /* 展示失败静默 */
    }
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
