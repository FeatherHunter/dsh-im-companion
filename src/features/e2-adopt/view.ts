/** e2-adopt 叠加视图：左栏待领养池（自有 DOM）+ 工作区行放置目标（overlay：唯一写操作 = 着色 class，dispose 必清；行发现口径复用 B2 overlay 先例，只读文本做映射）。
 * 拖拽源抽象为 Bot 描述（标识 + 渠道 + 当前归属），C1a/矩阵后续挂载只需派发同一载荷。无自有轮询；写走渠道 RPC + 写后立刷。 */
import { channelLabel } from '../../client/data/config'
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import { showModal } from '../../client/ui/modal'
import { toast } from '../../client/ui/toast'
import type { FeatureCtx } from '../protocol'
import { UNDO_WINDOW_MS, resolveDrop, resolveRowWorkspace, shortName, unboundBots, undoTarget } from './model'

const MIME = 'application/x-e2-adopt-bot'
const POOL_CLASS = 'e2-pool'
const CHIP_CLASS = 'e2-chip'
const OK_CLASS = 'e2-drop-ok'
const WARN_CLASS = 'e2-drop-warn'
/* 行选择器与容器口径（评审声明：与 left-filter overlay 同一宿主 DOM 口径，只读文本做映射，不写行业务）。 */
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'

/* 单挂载假设：宿主同时只保留一代挂载；重挂载由代际哨兵 + dispose 清理旧代。模块级状态皆属当前代。 */
const claim = (): number => {
  try {
    const w = window as unknown as Record<string, number>
    w.__e2Gen = (w.__e2Gen || 0) + 1
    return w.__e2Gen
  } catch { return 1 }
}
const alive = (g: number): boolean => {
  try { return (window as unknown as Record<string, number>).__e2Gen === g } catch { return true }
}

let pool: HTMLElement | null = null
let dragId: string | null = null
let hadDrag = false
let dropped = false
let lastBots: BotSnap[] = []
let lastSig = ''
let undoTimer: ReturnType<typeof setTimeout> | null = null
let undoEl: HTMLElement | null = null

function textOf(el: Element): string {
  try { return typeof el.textContent === 'string' ? el.textContent.trim() : '' } catch { return '' }
}

function hasMime(e: DragEvent): boolean {
  try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(MIME) } catch { return false }
}

function clearAfford(): void {
  try { document.querySelectorAll('.' + OK_CLASS + ', .' + WARN_CLASS).forEach((n) => n.classList.remove(OK_CLASS, WARN_CLASS)) } catch { /* 忽略 */ }
}

function dismissUndo(): void {
  try {
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = null
    undoEl?.remove()
    undoEl = null
  } catch { /* 忽略 */ }
}

async function setWorkspace(ctx: FeatureCtx, channel: string, botId: string, workspace: string, label: string): Promise<boolean> {
  if (!ctx.rpc) {
    toast('连接服务不可用')
    return false
  }
  try {
    await ctx.rpc('/' + channel, 'bot.workspace.set', { botId, workspace }, AbortSignal.timeout(8000))
    await ctx.refresh()
    return true
  } catch (e) {
    toast(label + '失败：' + String((e as Error)?.message ?? e))
    return false
  }
}

function showUndo(ctx: FeatureCtx, channel: string, botId: string, from: string, text: string): void {
  dismissUndo()
  try {
    const left = Math.round(UNDO_WINDOW_MS / 1000)
    const msg = h('span', {}, text + '（' + left + 's 内可撤销）')
    const btn = h('button', {
      onClick: () => {
        dismissUndo()
        void (async () => {
          if (await setWorkspace(ctx, channel, botId, from, '撤销')) toast('已撤销，回到' + shortName(from), 'check')
        })()
      },
    }, '撤销')
    undoEl = h('div', { className: 'e2-undo', role: 'status' }, msg, btn) as HTMLElement
    document.body.appendChild(undoEl)
    undoTimer = setTimeout(() => { dismissUndo(); toast('绑定已落定') }, UNDO_WINDOW_MS)
  } catch { /* 提示失败不阻断已落地绑定 */ }
}

function askMove(ctx: FeatureCtx, channel: string, botId: string, from: string, to: string): void {
  try {
    const m = showModal([
      h('div', { className: 'e2-confirm' }, '“' + botId + '”现属' + shortName(from) + '，换绑到“' + shortName(to) + '”？'),
      h('div', { className: 'e2-confirm-btns' },
        h('button', { onClick: () => m.close() }, '留在这里'),
        h('button', {
          onClick: () => {
            m.close()
            void (async () => {
              if (await setWorkspace(ctx, channel, botId, to, '换绑')) {
                const back = undoTarget(from)
                if (back) showUndo(ctx, channel, botId, back, '已换绑到' + shortName(to))
                else toast('已换绑到' + shortName(to), 'check')
              }
            })()
          },
        }, '确认换绑')),
    ])
  } catch { /* 弹层失败则不动（fail-closed） */ }
}

function paint(ctx: FeatureCtx, bots: BotSnap[]): void {
  lastBots = bots
  const sig = bots.map((b) => b.channel + '/' + b.botId + '=' + (b.workspace || '')).join('|')
  if (sig === lastSig) return
  lastSig = sig
  try {
    if (typeof document === 'undefined') return
    const groups = document.querySelectorAll(GROUP_SEL)
    if (!groups.length) return
    const section = groups[0].parentElement
    const container = section?.parentElement
    if (!container || container === document.body || container === document.documentElement) return
    if (!pool) {
      pool = document.createElement('div')
      pool.setAttribute('class', POOL_CLASS)
    }
    pool.replaceChildren()
    const title = document.createElement('div')
    title.setAttribute('class', 'e2-pool-title')
    const unbound = unboundBots(bots)
    title.textContent = '待领养（未绑定 ' + unbound.length + '）— 拖到工作区行上岗'
    pool.appendChild(title)
    if (!unbound.length) {
      const empty = document.createElement('div')
      empty.setAttribute('class', 'e2-pool-empty')
      empty.textContent = '全部已上岗'
      pool.appendChild(empty)
    }
    const writable = !!ctx.rpc
    for (const b of unbound) {
      const chip = document.createElement('span')
      chip.setAttribute('class', CHIP_CLASS)
      chip.setAttribute('draggable', writable ? 'true' : 'false')
      chip.setAttribute('data-e2-bot', b.botId)
      chip.setAttribute('data-e2-channel', b.channel)
      chip.title = writable ? '拖到左栏工作区行完成绑定' : '连接服务不可用，暂不能分配'
      chip.textContent = (b.botName || b.botId) + ' · ' + channelLabel(b.channel)
      pool.appendChild(chip)
    }
    if (pool.parentNode !== container) container.insertBefore(pool, container.firstChild)
  } catch { /* 建池失败就无池（fail-closed，行照常可被外部拖拽命中判定） */ }
}

export function mountE2Adopt(ctx: FeatureCtx): () => void {
  const g = claim()
  hadDrag = false
  dropped = false
  dragId = null
  const off = ctx.subscribe((snap) => { if (alive(g)) paint(ctx, snap.bots) })

  const onDragStart = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      const chip = (de.target as Element)?.closest?.('.' + CHIP_CLASS) as HTMLElement | null
      if (!chip || !de.dataTransfer) return
      hadDrag = true
      dropped = false
      dragId = chip.getAttribute('data-e2-bot')
      de.dataTransfer.setData(MIME, JSON.stringify({ botId: dragId, channel: chip.getAttribute('data-e2-channel') }))
      de.dataTransfer.effectAllowed = 'move'
    } catch { /* 忽略 */ }
  }
  const onDragOver = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      if (!hasMime(de) || !de.dataTransfer) return
      de.preventDefault()
      const row = (de.target as Element)?.closest?.(GROUP_SEL) as Element | null
      clearAfford()
      if (!row) {
        de.dataTransfer.dropEffect = 'none'
        return
      }
      const ws = resolveRowWorkspace(textOf(row), lastBots)
      de.dataTransfer.dropEffect = 'move'
      const live = dragId ? lastBots.find((b) => b.botId === dragId) : undefined
      row.classList.add(live?.workspace && live.workspace !== ws ? WARN_CLASS : OK_CLASS)
    } catch { /* 忽略 */ }
  }
  const onDrop = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      if (!hasMime(de) || !de.dataTransfer) return
      de.preventDefault()
      clearAfford()
      dropped = true
      let desc: { botId?: string; channel?: string } = {}
      try { desc = JSON.parse(de.dataTransfer.getData(MIME) || '{}') } catch { /* 载荷坏则拒收 */ }
      if (!desc.botId || !desc.channel) {
        toast('拖拽数据无效，未绑定任何工作区')
        return
      }
      const row = (de.target as Element)?.closest?.(GROUP_SEL) as Element | null
      const live = lastBots.find((b) => b.botId === desc.botId)
      const bot = { botId: desc.botId, channel: desc.channel, workspace: live?.workspace ?? '' }
      dragId = null
      if (!row) {
        toast('空白处不可放：拖到工作区行上完成绑定')
        return
      }
      const to = resolveRowWorkspace(textOf(row), lastBots)
      if (!to) {
        toast('未能识别该工作区，未绑定任何内容')
        return
      }
      const v = resolveDrop(bot, { kind: 'workspace', workspace: to })
      if (v.kind === 'bind') {
        void (async () => {
          if (await setWorkspace(ctx, bot.channel, bot.botId, v.to, '绑定')) {
            const back = undoTarget('')
            if (back) showUndo(ctx, bot.channel, bot.botId, back, '已绑定到' + shortName(v.to))
            else toast('已绑定到' + shortName(v.to), 'check')
          }
        })()
      } else if (v.kind === 'confirm-move') {
        askMove(ctx, bot.channel, bot.botId, v.from, v.to)
      } else if (v.kind === 'noop') {
        toast('它已经在这里了')
      } else {
        toast('空白处不可放：拖到工作区行上完成绑定')
      }
    } catch { /* 忽略 */ }
  };
  const onDragEnd = (): void => {
    dragId = null
    if (hadDrag && !dropped && alive(g)) toast('已取消拖拽，回到原位')
    hadDrag = false
    dropped = false
    if (alive(g)) clearAfford()
  }

  try {
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', onDragEnd)
  } catch { /* 无 DOM 环境可挂载为空操作 */ }

  return () => {
    try {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('dragend', onDragEnd)
    } catch { /* 忽略 */ }
    try { pool?.remove() } catch { /* 忽略 */ }
    pool = null
    clearAfford()
    dismissUndo()
    try { off() } catch { /* 忽略 */ }
  }
}
