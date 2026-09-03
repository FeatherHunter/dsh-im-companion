/** e2-adopt 视图：左栏头按钮 → 中央驾驶舱（彩色地盘纯拖拽 + “＋ 新地盘”兜底空人）。
 * 自有 DOM（e2-*）+ 共享 modal/toast/dir-picker 原语；宿主只读（头栏定位复用 B2 口径），不行行业务节点。无自有轮询；写走渠道 RPC + 写后立刷。 */
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import { installFeatureStyles } from '../../client/theme'
import { toast } from '../../client/ui/toast'
import type { FeatureCtx } from '../protocol'
import { actDrop, dismissUndo, pickDir } from './acts'
import { openBoard, type BoardHandle } from './panel'
import { CSS } from './styles'

const MIME = 'application/x-e2-adopt-bot'
const ENTRY_CLASS = 'e2-entry'
const SEC_CLASS = 'e2-sec'
const ROW_CLASS = 'e2-row'
const OK_CLASS = 'e2-drop-ok'
const WARN_CLASS = 'e2-drop-warn'
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'

let entryBtn: HTMLElement | null = null
let board: BoardHandle | null = null
let lastBots: BotSnap[] = []
let lastMeta: AgentMetaDoc | null = null

function reloadMeta(ctx: FeatureCtx): void {
  try {
    void ctx.meta.loadMeta().then((doc) => {
      lastMeta = doc
      try { board?.repaint(lastBots) } catch { /* 忽略 */ }
    }, () => undefined)
  } catch { /* 读不到昵称就用目录名（fail-closed 展示） */ }
}
let dragId: string | null = null
let dragEl: Element | null = null
let dragPh: Element | null = null
let dragStartX: number | null = null
let hadDrag = false
let dropped = false
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

function hasMime(e: DragEvent): boolean {
  try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(MIME) } catch { return false }
}

function openPanel(ctx: FeatureCtx): void {
  try {
    /* 样式兜底重装（幂等：同名标签复写；覆盖 HMR/新 fiber 漏装。CSS 失效首先怀疑 lib 未重新构建）。 */
    try { installFeatureStyles('e2-adopt', CSS) } catch { /* 忽略 */ }
    try { board?.close() } catch { /* 忽略 */ }
    board = null
    board = openBoard(ctx, lastMeta)
    board.repaint(lastBots)
    reloadMeta(ctx)
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
      title: '串门：看看各家机器人，拖一拖就搬家',
      'aria-label': '串门：重新分配机器人归属',
      onClick: () => { if (alive(g)) openPanel(ctx) },
      html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="12" height="9" rx="2.5"/><circle cx="10" cy="13.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="14" cy="13.5" r="1.1" fill="currentColor" stroke="none"/><path d="M12 9V5"/><circle cx="12" cy="4" r="1"/><path d="M3.5 20c1.5-1.2 3-1.7 4.5-1.7M20.5 20c-1.5-1.2-3-1.7-4.5-1.7"/></svg>',
    }) as HTMLElement
    header.appendChild(btn)
    entryBtn = btn
  } catch { /* 找不到头栏就不放入口（fail-closed） */ }
}

export function mountE2Adopt(ctx: FeatureCtx): () => void {
  const g = claim()
  hadDrag = false
  dropped = false
  dragId = null
  dragEl = null
  dragPh = null
  dragStartX = null
  try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
  reloadMeta(ctx)
  const off = ctx.subscribe((snap) => {
    if (!alive(g)) return
    lastBots = snap.bots
    try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
    try { board?.repaint(lastBots) } catch { /* 忽略 */ }
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
      dragEl = row
      try { dragStartX = de.clientX } catch { dragStartX = null }
      try { row.classList.add('e2-dragging') } catch { /* 忽略 */ }
      /* 原牌隐身 + 歪斜占位符：setTimeout 让浏览器先抓完原生拖影再藏，否则拖影是空的（Firefox 会直接取消拖拽）。 */
      setTimeout(() => {
        try {
          row.style.display = 'none'
          const ph = row.cloneNode(true) as HTMLElement
          ph.classList.remove('e2-dragging')
          ph.classList.add('e2-ph')
          ph.removeAttribute('draggable')
          ph.removeAttribute('id')
          row.parentNode?.insertBefore(ph, row.nextSibling)
          dragPh = ph
        } catch { /* 占位失败不阻断拖拽 */ }
      }, 0)
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
      if (!ws && !sec.hasAttribute('data-e2-new')) {
        de.dataTransfer.dropEffect = 'none'
        return
      }
      if (!ws) {
        de.dataTransfer.dropEffect = 'move'
        sec.classList.add(OK_CLASS)
        return
      }
      de.dataTransfer.dropEffect = 'move'
      const live = dragId ? lastBots.find((b) => b.botId === dragId) : undefined
      sec.classList.add(live?.workspace && live.workspace !== ws ? WARN_CLASS : OK_CLASS)
    } catch { /* 忽略 */ }
  }
  function clearGhost(): void {
    try { dragEl?.classList.remove('e2-dragging') } catch { /* 忽略 */ }
    try { (dragEl as HTMLElement | null)?.style && ((dragEl as HTMLElement).style.display = '') } catch { /* 忽略 */ }
    try { dragPh?.remove() } catch { /* 忽略 */ }
    dragEl = null
    dragPh = null
  }

  const onDrop = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      if (!hasMime(de) || !de.dataTransfer) return
      de.preventDefault()
      clearAfford()
      clearGhost()
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
      if (sec && sec.hasAttribute('data-e2-new')) {
        /* 目录选择器是共享遮罩（层级低于本面板）：先收起面板再选，选完用户重进（快照已刷新）。 */
        try { board?.close() } catch { /* 忽略 */ }
        board = null
        void (async () => {
          const picked = await pickDir(ctx, live?.workspace ?? '')
          if (!picked) return
          actDrop(ctx, bot, { kind: 'workspace', workspace: picked })
        })()
        return
      }
      const to = sec?.getAttribute('data-e2-ws')
      if (!to) {
        toast('空白处不可放，请拖到分组上')
        return
      }
      actDrop(ctx, bot, { kind: 'workspace', workspace: to })
    } catch { /* 忽略 */ }
  };
  const onDragEnd = (): void => {
    dragId = null
    dragStartX = null
    clearGhost()
    if (hadDrag && !dropped && alive(g)) toast('已取消拖拽，回到原位')
    hadDrag = false
    dropped = false
    if (alive(g)) clearAfford()
  }

  /* 影子跟手倒：起点以左向左歪，以右向右歪（H 定稿）。与主 dragover 并存，只动影子。 */
  const onTilt = (e: Event): void => {
    if (!alive(g)) return
    try {
      if (dragId === null || dragStartX === null || !dragPh) return
      const dx = (e as DragEvent).clientX - dragStartX
      ;(dragPh as HTMLElement).style.transform = dx < 0 ? 'rotate(-4deg)' : 'rotate(4deg)'
    } catch { /* 忽略 */ }
  }
  try {
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragover', onTilt)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', onDragEnd)
  } catch { /* 无 DOM 环境可挂载为空操作 */ }

  return () => {
    try {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragover', onTilt)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('dragend', onDragEnd)
    } catch { /* 忽略 */ }
    try { entryBtn?.remove() } catch { /* 忽略 */ }
    entryBtn = null
    try { board?.close() } catch { /* 忽略 */ }
    board = null
    clearAfford()
    dismissUndo()
    try { off() } catch { /* 忽略 */ }
  }
}
