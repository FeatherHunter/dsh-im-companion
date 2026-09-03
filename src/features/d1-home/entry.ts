/** d1-home 入口：左栏头按钮 → 只读 peek 浮层（看一眼 + 跳去设置页管）。
 * 行里不摆表单与确认（地方大小推出）；peek 只读，动手一律去花名册。 */
import { h } from '../../client/dom'
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import type { BotSnap } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import { groupHomes, homeName, isEmptyRoster } from './model'

const ENTRY_CLASS = 'd1-entry'
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'

let entryBtn: HTMLElement | null = null
let lastBots: BotSnap[] = []
let lastNames: Record<string, string> = {}

const claim = (): number => {
  try {
    const w = window as unknown as Record<string, number>
    w.__d1Gen = (w.__d1Gen || 0) + 1
    return w.__d1Gen
  } catch { return 1 }
}
const alive = (g: number): boolean => {
  try { return (window as unknown as Record<string, number>).__d1Gen === g } catch { return true }
}

function resolveHeader(container: Element): Element | null {
  try {
    let path: Element | null = container
    let node: Element | null = null
    try { node = container.parentElement } catch { return null }
    for (let depth = 0; depth < 5 && node; depth++) {
      try {
        const tag = String(node.tagName ?? '').toLowerCase()
        if (tag === 'body' || tag === 'html') return null
        const kids: Element[] = []
        try { node.children && Array.prototype.forEach.call(node.children, (k: Element) => kids.push(k)) } catch { /* 上一层 */ }
        for (const k of kids) {
          if (k === path) continue
          try {
            if (typeof k.contains === 'function' && k.contains(container)) continue
          } catch { /* 当平级继续 */ }
          try {
            const hasBtn = typeof k.querySelector === 'function' && !!k.querySelector('button')
            const hasRow = typeof k.querySelector === 'function' && !!k.querySelector('[role="treeitem"]')
            if (hasBtn && !hasRow) return k
          } catch { /* 下一个 */ }
        }
      } catch { /* 上一层 */ }
      try { path = node; node = node.parentElement } catch { return null }
    }
    return null
  } catch { return null }
}

function openPeek(ctx: FeatureCtx): void {
  try {
    document.querySelectorAll('.d1-overlay').forEach((n) => n.remove())
    const panel = h('div', { className: 'd1-peek', role: 'dialog', 'aria-modal': 'true' }) as HTMLElement
    const close = (): void => {
      try { ov.remove() } catch { /* 忽略 */ }
      try { document.removeEventListener('keydown', onKey, true) } catch { /* 忽略 */ }
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    panel.appendChild(h('div', { className: 'd1-peek-t' }, '各家花名册（只读看一眼）') as unknown as Node)
    if (isEmptyRoster(lastBots)) {
      panel.appendChild(h('div', { className: 'd1-empty' },
        h('div', { className: 'd1-empty-t' }, '名下还没有机器人'),
        h('div', { className: 'd1-empty-s' }, '去“串门”领人，或先接入渠道')) as unknown as Node)
    } else {
      for (const g of groupHomes(lastBots)) {
        const lines = g.bots.map((b) => {
          const st = b.stale ? '未知' : (HEALTH_LABELS[b.healthKind] ?? b.healthKind)
          return h('div', { className: 'd1-peek-row' },
            h('span', { className: 'd1-hdot d1-h-' + (b.stale ? 'warn' : b.healthKind) }),
            h('span', null, (b.botName || b.botId) + ' · ' + channelLabel(b.channel) + ' · ' + st)) as unknown as Node
        })
        panel.appendChild(h('div', { className: 'd1-peek-home' },
          h('div', { className: 'd1-peek-h' }, homeName(g.workspace, lastNames) + '（' + g.bots.length + '）'),
          ...lines) as unknown as Node)
      }
    }
    panel.appendChild(h('div', { className: 'd1-peek-go' }, '动手换家去：设置 → IM机器人辅助 → 花名册') as unknown as Node)
    const x = h('button', { className: 'd1-x', type: 'button', 'aria-label': '关闭', onClick: close }, '×') as HTMLElement
    panel.appendChild(x)
    const ov = h('div', { className: 'd1-overlay' }, panel) as HTMLElement
    ov.addEventListener('mousedown', (e: Event) => { if (e.target === ov) close() })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(ov)
    try {
      void ctx.meta.loadMeta().then((doc) => {
        try { if (doc && doc.names) lastNames = doc.names } catch { /* 忽略 */ }
      }, () => undefined)
    } catch { /* 读不到名就用目录名 */ }
  } catch { /* 打不开就不开 */ }
}

function ensureEntry(ctx: FeatureCtx, g: number): void {
  try {
    if (typeof document === 'undefined') return
    if (entryBtn && entryBtn.isConnected) return
    entryBtn = null
    const groups = document.querySelectorAll(GROUP_SEL)
    if (!groups.length) return
    const section = groups[0].parentElement
    const container = section?.parentElement
    if (!container) return
    const header = resolveHeader(container)
    if (!header) return
    if (header.querySelector('.' + ENTRY_CLASS)) return
    const btn = h('button', {
      className: ENTRY_CLASS,
      title: '在家管：看看各家花名册（只读），动手去设置页',
      'aria-label': '在家管：查看各家花名册',
      onClick: () => { if (alive(g)) openPeek(ctx) },
      html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>',
    }) as HTMLElement
    header.appendChild(btn)
    entryBtn = btn
  } catch { /* 找不到头栏就不放入口（fail-closed） */ }
}

export function mountEntry(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  const g = claim()
  try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
  let off: (() => void) | null = null
  try {
    off = ctx.subscribe((snap) => {
      lastBots = snap.bots
      try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
    })
  } catch {
    return noop
  }
  return () => {
    try { off?.() } catch { /* 忽略 */ }
    try {
      if (entryBtn && entryBtn.isConnected && alive(g)) entryBtn.remove()
      entryBtn = null
    } catch { /* 忽略 */ }
  }
}
