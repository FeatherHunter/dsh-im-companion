/** e2-adopt 视图：左栏头按钮 → 分组面板（按归属列机器人，组间互拖换绑 + 每行“移交给”下拉兜底）。
 * 自有 DOM（e2-*）+ 共享 sheet/modal/toast 原语；宿主只读（头栏定位复用 B2 口径），不行行业务节点。无自有轮询；写走渠道 RPC + 写后立刷。 */
import { channelLabel } from '../../client/data/config'
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import { showModal } from '../../client/ui/modal'
import { showSheet, type SheetHandle } from '../../client/ui/sheet'
import { toast } from '../../client/ui/toast'
import type { FeatureCtx } from '../protocol'
import { UNDO_WINDOW_MS, boardGroups, resolveDrop, shortName, undoTarget } from './model'

const MIME = 'application/x-e2-adopt-bot'
const ENTRY_CLASS = 'e2-entry'
const SEC_CLASS = 'e2-sec'
const ROW_CLASS = 'e2-row'
const OK_CLASS = 'e2-drop-ok'
const WARN_CLASS = 'e2-drop-warn'
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'

let entryBtn: HTMLElement | null = null
let sheet: SheetHandle | null = null
let lastBots: BotSnap[] = []
let dragId: string | null = null
let hadDrag = false
let dropped = false
let undoTimer: ReturnType<typeof setTimeout> | null = null
let undoEl: HTMLElement | null = null

const claim = (): number => {
  try {
    const w = window as unknown as Record<string, number>
    w.__e2Gen = (w.__e2Gen || 0) + 1
    return w.__e2Gen
  } catch { return 1 }
}
/* 单挂载假设：宿主同时只保留一代挂载；重挂载由代际哨兵 + dispose 清理旧代。模块级状态皆属当前代。 */
const alive = (g: number): boolean => {
  try { return (window as unknown as Record<string, number>).__e2Gen === g } catch { return true }
}

/* 头栏定位（评审声明：与 left-filter/header-btn.resolveHeader 同语义，重复优于跨 feature 引用）。 */
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

function hasMime(e: DragEvent): boolean {
  try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(MIME) } catch { return false }
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
    const msg = h('span', {}, text + '（5s 内可撤销）')
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
    undoTimer = setTimeout(() => { dismissUndo(); toast('撤销超时，绑定已生效') }, UNDO_WINDOW_MS)
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

function botLabel(b: BotSnap): string {
  return (b.botName || b.botId) + ' · ' + channelLabel(b.channel)
}

function paintPanel(ctx: FeatureCtx): void {
  if (!sheet) return
  try {
    const { unbound, groups } = boardGroups(lastBots)
    const body: unknown[] = [
      h('h2', { className: 'e2-panel-title' }, '重新分配机器人归属'),
      h('p', { className: 'e2-panel-sub' }, '把牌拖到另一组完成换绑（会二次确认）；拖不动时用每行的“移交给”下拉。'),
    ]
    const sec = (name: string, ws: string | null, bots: BotSnap[], dashed: boolean): HTMLElement => {
      const box = h('div', { className: SEC_CLASS + (dashed ? ' e2-sec-unbound' : '') }) as HTMLElement
      if (ws) box.setAttribute('data-e2-ws', ws)
      box.appendChild(h('div', { className: 'e2-sec-name' }, name + ' ', h('span', { className: 'e2-n' }, bots.length + ' 个')) as unknown as Node)
      const others = groups.map((g) => g.workspace).filter((w) => w !== ws)
      for (const b of bots) {
        const row = h('div', { className: ROW_CLASS }) as HTMLElement
        row.setAttribute('draggable', ctx.rpc ? 'true' : 'false')
        row.setAttribute('data-e2-bot', b.botId)
        row.setAttribute('data-e2-channel', b.channel)
        row.title = ctx.rpc ? '拖到另一组完成换绑' : '连接服务不可用，暂不能分配'
        row.appendChild(h('span', { className: 'e2-who' }, botLabel(b)) as unknown as Node)
        if (others.length > 0) {
          const sel = h('select', {
            title: '移交给别的归属',
            onChange: () => {
              const to = (sel as HTMLSelectElement).value
              try { (sel as HTMLSelectElement).value = '' } catch { /* 忽略 */ }
              if (!to) return
              if (!b.workspace) {
                void (async () => {
                  if (await setWorkspace(ctx, b.channel, b.botId, to, '绑定')) toast('已绑定到' + shortName(to), 'check')
                })()
              } else if (to !== b.workspace) {
                askMove(ctx, b.channel, b.botId, b.workspace, to)
              }
            },
          }) as HTMLSelectElement
          sel.appendChild(h('option', { value: '' }, '移交给…') as unknown as Node)
          for (const w of others) sel.appendChild(h('option', { value: w }, shortName(w)) as unknown as Node)
          row.appendChild(sel as unknown as Node)
        }
        box.appendChild(row as unknown as Node)
      }
      return box
    }
    if (unbound.length > 0) body.push(sec('未分配', null, unbound, true))
    for (const g of groups) body.push(sec(g.name, g.workspace, g.bots, false))
    sheet.panel.replaceChildren()
    for (const n of body) sheet.panel.appendChild(n as unknown as Node)
  } catch { /* 渲染失败保持旧面板（fail-closed） */ }
}

function openPanel(ctx: FeatureCtx): void {
  try {
    try { sheet?.close() } catch { /* 忽略 */ }
    sheet = null
    sheet = showSheet({ overlayClass: 'e2-overlay', panelClass: 'e2-panel', label: '重新分配机器人归属' })
    paintPanel(ctx)
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
      title: '打开重新分配面板（把机器人换到别的归属）',
      onClick: () => { if (alive(g)) openPanel(ctx) },
    }, '分身份') as HTMLElement
    header.appendChild(btn)
    entryBtn = btn
  } catch { /* 找不到头栏就不放入口（fail-closed） */ }
}

export function mountE2Adopt(ctx: FeatureCtx): () => void {
  const g = claim()
  hadDrag = false
  dropped = false
  dragId = null
  try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
  const off = ctx.subscribe((snap) => {
    if (!alive(g)) return
    lastBots = snap.bots
    try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
    paintPanel(ctx)
  })

  const onDragStart = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      const row = (de.target as Element)?.closest?.('.' + ROW_CLASS) as HTMLElement | null
      if (!row || !de.dataTransfer) return
      hadDrag = true
      dropped = false
      dragId = row.getAttribute('data-e2-bot')
      de.dataTransfer.setData(MIME, JSON.stringify({ botId: dragId, channel: row.getAttribute('data-e2-channel') }))
      de.dataTransfer.effectAllowed = 'move'
    } catch { /* 忽略 */ }
  }
  const onDragOver = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      if (!hasMime(de) || !de.dataTransfer) return
      de.preventDefault()
      const sec = (de.target as Element)?.closest?.('.' + SEC_CLASS) as Element | null
      clearAfford()
      if (!sec) {
        de.dataTransfer.dropEffect = 'none'
        return
      }
      const ws = sec.getAttribute('data-e2-ws')
      if (!ws) {
        de.dataTransfer.dropEffect = 'none'
        return
      }
      de.dataTransfer.dropEffect = 'move'
      const live = dragId ? lastBots.find((b) => b.botId === dragId) : undefined
      sec.classList.add(live?.workspace && live.workspace !== ws ? WARN_CLASS : OK_CLASS)
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
      dragId = null
      let desc: { botId?: string; channel?: string } = {}
      try { desc = JSON.parse(de.dataTransfer.getData(MIME) || '{}') } catch { /* 载荷坏则拒收 */ }
      if (!desc.botId || !desc.channel) {
        toast('拖拽数据无效，未绑定任何工作区')
        return
      }
      const sec = (de.target as Element)?.closest?.('.' + SEC_CLASS) as Element | null
      const live = lastBots.find((b) => b.botId === desc.botId)
      const bot = { botId: desc.botId, channel: desc.channel, workspace: live?.workspace ?? '' }
      const to = sec?.getAttribute('data-e2-ws')
      if (!to) {
        toast('空白处不可放，请拖到分组上')
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
        toast('空白处不可放，请拖到分组上')
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
    try { entryBtn?.remove() } catch { /* 忽略 */ }
    entryBtn = null
    try { sheet?.close() } catch { /* 忽略 */ }
    sheet = null
    clearAfford()
    dismissUndo()
    try { off() } catch { /* 忽略 */ }
  }
}
