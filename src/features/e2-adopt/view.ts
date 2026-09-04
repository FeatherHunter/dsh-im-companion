/** e2-adopt 视图：左栏头按钮 → 中央驾驶舱（纯拖拽 + 巷子口歇脚）。自有 DOM（e2-*）；无自有轮询；写走渠道 RPC + 写后立刷。 */
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import { installFeatureStyles } from '../../client/theme'
import { toast } from '../../client/ui/toast'
import type { FeatureCtx } from '../protocol'
import { actDrop, dismissUndo } from './acts'
import { openBoard, type BoardHandle } from './panel'
import { CSS } from './styles'

const COCKPIT_CLASS = 'e2-cockpit', MIME = 'application/x-e2-adopt-bot', ENTRY_CLASS = 'e2-entry'
const SEC_CLASS = 'e2-sec', ROW_CLASS = 'e2-row', OK_CLASS = 'e2-drop-ok', WARN_CLASS = 'e2-drop-warn'
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'

let entryBtn: HTMLElement | null = null
let board: BoardHandle | null = null
let lastBots: BotSnap[] = []
let lastMeta: AgentMetaDoc | null = null

function reloadMeta(ctx: FeatureCtx): void {
  try {
    void ctx.meta.loadMeta().then((doc) => {
      lastMeta = doc
      if (hadDrag || pressDown) return
      try { board?.repaint(lastBots, staged) } catch { /* 忽略 */ }
    }, () => undefined)
  } catch { /* 读不到昵称就用目录名（fail-closed 展示） */ }
}
let dragId: string | null = null, dragEl: Element | null = null, dragStartX: number | null = null
let dragDesc: { botId: string | null; channel: string | null } | null = null
let hadDrag = false, dropped = false, pressDown = false, pressSkip = 0
let pressAt = 0, lastSig = ''
/* 歇脚小本本：botId → 出来自哪家（只记不写，关面板即撕）。 */
let staged = new Map<string, string>()
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
    try { installFeatureStyles('e2-adopt', CSS) } catch { /* 忽略 */ }
    try { board?.close() } catch { /* 忽略 */ }
    board = null
    board = openBoard(ctx, lastMeta)
    const rawClose = board.close.bind(board)
    board.close = () => { try { if (staged.size) toast([...staged.keys()].map((id) => lastBots.find((b) => b.botId === id)?.botName || id).join('、') + '没安顿好，已送回原来的家') } catch { /* 提示失败不阻断 */ } staged.clear(); try { rawClose() } catch { /* 忽略 */ } }
    board.repaint(lastBots, staged)
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
  hadDrag = false; dropped = false; pressDown = false; pressSkip = 0; lastSig = ''
  dragId = null; dragEl = null; dragDesc = null; dragStartX = null; staged.clear()
  try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
  reloadMeta(ctx)
  /* 面板签名：展示字段不变就不重建 DOM（15s 空转快照不再掀桌）。 */
  const sigOf = (bots: BotSnap[]): string => (bots || []).map((b) => b.channel + '|' + b.botId + '|' + b.workspace + '|' + b.botName + '|' + b.healthKind + '|' + (b.stale ? 1 : 0) + '|' + (b.connected ? 1 : 0)).join('\n')
  const paint = (): void => { try { board?.repaint(lastBots, staged) } catch { /* 忽略 */ } try { lastSig = sigOf(lastBots) } catch { /* 忽略 */ } }
  const off = ctx.subscribe((snap) => {
    if (!alive(g)) return
    lastBots = snap.bots
    try { ensureEntry(ctx, g) } catch { /* 忽略 */ }
    /* 按住/拖飞中冻结：按下点节点一换，原生拖拽还没出生就没了（静默拖不动的主因）。 */
    if (pressDown) { try { if (Date.now() - pressAt > 10000) pressDown = false } catch { pressDown = false } }
    if (hadDrag || pressDown) { if (pressDown) pressSkip++; return }
    const s = sigOf(snap.bots)
    if (s === lastSig) return
    paint()
  })

  const onDragStart = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      const row = (de.target as Element)?.closest?.('.' + ROW_CLASS) as HTMLElement | null
      if (!row || !de.dataTransfer) return
      hadDrag = true
      dropped = false; pressDown = false
      dragId = row.getAttribute('data-e2-bot')
      dragEl = row
      dragDesc = { botId: row.getAttribute('data-e2-bot'), channel: row.getAttribute('data-e2-channel') }
      try { dragStartX = de.clientX } catch { dragStartX = null }
      /* 出生后置：分发内只采样不动源节点（mock 第69行同款）；回调重验仍在飞才变影子。 */
      try { const src = row, id = dragId; setTimeout(() => { try { if (dragId === id && id !== null) src.classList.add('e2-ph') } catch { /* 忽略 */ } }, 0) } catch { /* 忽略 */ }
      try { de.dataTransfer.effectAllowed = 'move' } catch { /* 忽略 */ }
      try { de.dataTransfer.setData('text/plain', String(dragId)) } catch { /* 忽略 */ }
      try { de.dataTransfer.setData(MIME, JSON.stringify({ botId: dragId, channel: row.getAttribute('data-e2-channel') })) } catch { /* 置数失败不阻断 */ }
    } catch { /* 忽略 */ }
  }
  const onDragOver = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      if ((!hasMime(de) && !hadDrag) || !de.dataTransfer) return
      de.preventDefault()
      const sec = (de.target as Element)?.closest?.('.' + SEC_CLASS) as Element | null
      clearAfford()
      if (!sec) { de.dataTransfer.dropEffect = 'none'; return }
      const ws = sec.getAttribute('data-e2-ws')
      if (!ws && !sec.hasAttribute('data-e2-new')) {
        de.dataTransfer.dropEffect = 'none'
        return
      }
      if (!ws) { de.dataTransfer.dropEffect = 'move'; sec.classList.add(OK_CLASS); return }
      de.dataTransfer.dropEffect = 'move'
      const live = dragId ? lastBots.find((b) => b.botId === dragId) : undefined
      sec.classList.add(live?.workspace && live.workspace !== ws ? WARN_CLASS : OK_CLASS)
    } catch { /* 忽略 */ }
  }
  function clearGhost(): void {
    try { dragEl?.classList.remove('e2-ph') } catch { /* 忽略 */ }
    try { (dragEl as HTMLElement).style.removeProperty('transform') } catch { /* 忽略 */ }
    dragEl = null
  }

  const onDrop = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      if ((!hasMime(de) && !hadDrag) || !de.dataTransfer) return
      de.preventDefault()
      clearAfford()
      clearGhost()
      dropped = true
      dragId = null
      let desc: { botId?: string | null; channel?: string | null } = {}
      try { desc = JSON.parse(de.dataTransfer.getData(MIME) || '{}') } catch { /* 载荷坏则拒收 */ }
      if ((!desc.botId || !desc.channel) && dragDesc?.botId && dragDesc?.channel) desc = { botId: dragDesc.botId, channel: dragDesc.channel }
      dragDesc = null
      if (!desc.botId || !desc.channel) {
        toast('拖拽数据无效，未绑定任何工作区')
        return
      }
      const sec = (de.target as Element)?.closest?.('.' + SEC_CLASS) as Element | null
      const live = lastBots.find((b) => b.botId === desc.botId)
      const bot = { botId: desc.botId, channel: desc.channel, workspace: live?.workspace ?? '' }
      if (sec && sec.hasAttribute('data-e2-plaza')) {
        /* 巷子口歇脚：只记小本本不写服务器；拖进一家才走正常换绑，关面板即送回。 */
        if (!live) { toast('没找着这张照片'); return }
        if (!live.workspace) { toast('它已经在巷子口歇着了'); return }
        staged.set(live.botId, live.workspace)
        toast((live.botName || live.botId) + '去巷子口歇着了，拖进一家才算搬完')
        if (alive(g)) paint()
        return
      }
      const to = sec?.getAttribute('data-e2-ws')
      try { if (to && to === live?.workspace && desc.botId) staged.delete(desc.botId) } catch { /* 忽略 */ }
      if (!to) {
        toast('空白处不可放，请拖到分组上')
        return
      }
      actDrop(ctx, bot, { kind: 'workspace', workspace: to })
    } catch { /* 忽略 */ }
  };
  const onDragEnd = (): void => {
    dragId = null; dragStartX = null; dragDesc = null
    pressDown = false; pressSkip = 0
    clearGhost()
    /* 取消静默回原位：点击微抖也会走 dragstart+dragend，弹 toast 等于点一下骂一句。 */
    hadDrag = false
    dropped = false
    if (alive(g)) clearAfford()
    if (alive(g)) paint()
  }
  /* 按住熔断 + 按下拦截金丝雀：mousedown 被 preventDefault 则原生拖拽永不出生（它杀）。 */
  const onPress = (e: Event): void => {
    if (!alive(g)) return
    try {
      const t = (e as PointerEvent).target as Element | null
      if (!t?.closest?.('.' + COCKPIT_CLASS)) return
      pressDown = true
      try { pressAt = Date.now() } catch { pressAt = 0 }
    } catch { /* 忽略 */ }
  }
  const onRelease = (): void => {
    if (!pressDown && pressSkip === 0) return
    pressDown = false
    if (pressSkip > 0 && alive(g)) paint()
    pressSkip = 0
  }

  /* 影子跟手倒：起点以左向左歪，以右向右歪（H 定稿）。与主 dragover 并存，只动影子。 */
  const onTilt = (e: Event): void => {
    if (!alive(g)) return
    try {
      if (dragId === null || dragStartX === null || !dragEl) return
      const dx = (e as DragEvent).clientX - dragStartX
      ;(dragEl as HTMLElement).style.transform = dx < 0 ? 'rotate(-4deg)' : 'rotate(4deg)'
    } catch { /* 忽略 */ }
  }
  try {
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('pointerup', onRelease)
    document.addEventListener('pointercancel', onRelease)
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragover', onTilt)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', onDragEnd)
  } catch { /* 无 DOM 环境可挂载为空操作 */ }

  return () => {
    try {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('pointerup', onRelease)
      document.removeEventListener('pointercancel', onRelease)
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
