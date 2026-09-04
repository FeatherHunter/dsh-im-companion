/** d1-home 主力：设置页人名卡下花名册段（看全 + 换家）。自有 DOM（d1-*）；无自有轮询。
 * 只读经 stream 订阅 + meta 名表；写走渠道 RPC + 写后立刷；无开除按钮（故事 14）。 */
import { h, mount } from '../../client/dom'
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import type { BotSnap } from '../../client/data/fleet-api'
import { toast } from '../../client/ui/toast'
import type { FeatureCtx } from '../protocol'
import { actMove, dismissUndo } from './acts'
import { groupHomes, homeName, isEmptyRoster, shortName } from './model'

const SEC_CLASS = 'd1-roster'

let sec: HTMLElement | null = null
let lastBots: BotSnap[] = []
let lastNames: Record<string, string> = {}
let metaReady = false
let hasSnap = false
let lastSig = ''

function sigOf(bots: BotSnap[]): string {
  return (bots || []).map((b) => b.channel + '|' + b.botId + '|' + b.workspace + '|' + b.botName + '|' + b.healthKind + '|' + (b.stale ? 1 : 0)).join('\n')
}

function statusText(b: BotSnap): string {
  if (b.stale) return '未知（轮询失败）'
  return HEALTH_LABELS[b.healthKind] ?? b.healthKind
}

function reloadNames(ctx: FeatureCtx): void {
  try {
    void ctx.meta.loadMeta().then((doc) => {
      try {
        if (doc && doc.names) {
          lastNames = doc.names
          metaReady = true
          paint(ctx)
        }
      } catch { /* 保留旧表 */ }
    }, () => undefined)
  } catch {
    metaReady = false
  }
}

function botRow(ctx: FeatureCtx, b: BotSnap, canWrite: string | null): HTMLElement {
  const dot = h('span', { className: 'd1-hdot d1-h-' + (b.stale ? 'warn' : b.healthKind) })
  const who = h('span', { className: 'd1-who' }, b.botName || b.botId)
  const cap = h('span', { className: 'd1-cap' }, channelLabel(b.channel) + ' · ' + statusText(b))
  const btn = h('button', {
    className: 'd1-move',
    type: 'button',
    title: canWrite ?? ('把“' + (b.botName || b.botId) + '”换给别家'),
    disabled: canWrite ? true : undefined,
    onClick: () => actMove(ctx, b),
  }, '换家…') as HTMLButtonElement
  return h('div', { className: 'd1-row' }, dot, h('div', { className: 'd1-id' }, who, cap), btn) as HTMLElement
}

function paint(ctx: FeatureCtx): void {
  try {
    if (typeof document === 'undefined') return
    if (!hasSnap) return
    const root = document.querySelector('.af-root')
    if (!root) return
    if (!sec || !sec.isConnected) {
      sec = h('div', { className: SEC_CLASS }) as HTMLElement
      root.appendChild(sec)
    }
    const canWrite = !ctx.rpc ? '连接服务不可用，稍后再试' : (!metaReady ? '身份配置不可用，写入口已禁用' : null)
    const head = h('div', { className: 'd1-head' },
      h('div', { className: 'd1-title' }, '各家机器人'),
      h('div', { className: 'd1-sub' }, '谁归谁都在这；换家点右边按钮，删除请去原来的地方')) as HTMLElement
    const body: HTMLElement[] = []
    if (canWrite) body.push(h('div', { className: 'd1-warn' }, canWrite) as HTMLElement)
    if (isEmptyRoster(lastBots)) {
      body.push(h('div', { className: 'd1-empty' },
        h('div', { className: 'd1-empty-t' }, '名下还没有机器人'),
        h('div', { className: 'd1-empty-s' }, '去左栏点“串门”从机器人堆里领人，或先接入渠道')) as HTMLElement)
    } else {
      for (const g of groupHomes(lastBots)) {
        const title = homeName(g.workspace, lastNames)
        const base = shortName(g.workspace)
        const rows = g.bots.map((b) => botRow(ctx, b, canWrite))
        body.push(h('div', { className: 'd1-home' },
          h('div', { className: 'd1-home-t' }, title,
            title !== base ? h('span', { className: 'd1-home-s' }, base) : null,
            h('span', { className: 'd1-n' }, g.bots.length + ' 台')) as unknown as Node,
          ...rows) as HTMLElement)
      }
    }
    mount(sec, [head, ...body])
    lastSig = sigOf(lastBots) + '|' + (metaReady ? 1 : 0) + '|' + (!ctx.rpc ? 0 : 1)
  } catch { /* 绘制失败下次快照再试 */ }
}

/** 挂载：跟随 .af-root 出现（设置页打开时）+ stream 重绘；卸载即净。 */
export function mountRoster(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  lastSig = ''
  hasSnap = false
  try {
    void ctx.meta.loadMeta().then((doc) => {
      try {
        if (doc && doc.names) {
          lastNames = doc.names
          metaReady = true
          paint(ctx)
        }
      } catch { /* 忽略 */ }
    }, () => {
      metaReady = false
      try { toast('身份配置不可用，管的入口已禁用') } catch { /* 忽略 */ }
    })
  } catch {
    metaReady = false
  }
  let off: (() => void) | null = null
  try {
    off = ctx.subscribe((snap) => {
      lastBots = snap.bots
      hasSnap = snap.updatedAt > 0
      if (!metaReady) reloadNames(ctx)
      const s = sigOf(lastBots) + '|' + (metaReady ? 1 : 0) + '|' + (!ctx.rpc ? 0 : 1)
      if (s === lastSig) return
      paint(ctx)
    })
  } catch {
    return noop
  }
  /* 设置页后打开兜底：轮询快照到时设置页还没开，paint 会扑空；
   * 盯住 .af-root 出现就地补画，不用干等下一轮 15s。 */
  let observer: MutationObserver | undefined
  try {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        try {
          if (!hasSnap) return
          if (sec && sec.isConnected) return
          if (!document.querySelector('.af-root')) return
          paint(ctx)
        } catch { /* 下次再试 */ }
      })
      observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
    }
  } catch { /* 无 observer 就只靠快照重绘 */ }
  try { paint(ctx) } catch { /* 忽略 */ }
  return () => {
    try { off?.() } catch { /* 忽略 */ }
    try { observer?.disconnect() } catch { /* 忽略 */ }
    try { dismissUndo() } catch { /* 忽略 */ }
    try {
      sec?.remove()
      sec = null
    } catch { /* 忽略 */ }
  }
}
