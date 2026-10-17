/** adopt 视图：左栏头按钮 → 中央驾驶舱（纯拖拽 + 巷子口歇脚）。自有 DOM（adopt-*）；无自有轮询；写走渠道 RPC + 写后立刷。
 * 头栏锚点走共享唯一真相源（client/dom，与 left-filter 同锚→成对出现，要错一起错）。 */
import { ADOPT_VIEW_EVENT } from '../../client/data/config'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import { installFeatureStyles } from '../../client/theme'
import { toast } from '../../client/ui/toast'
import { logLine } from '../../client/log'
import type { FeatureCtx } from '../protocol'
import { actDrop, dismissUndo } from './acts'
import { actAssistantDrop, dismissAssistantUndo, ensureAssistantImages, fetchHomes } from './assistant-acts'
import { clearEntry, ensureEntry } from './entry'
import { type AssistantRef, type HomeRef } from './model'
import { listHomes, openBoard, type BoardHandle } from './panel'
import { CSS } from './styles'

const COCKPIT_CLASS = 'adopt-cockpit', MIME = 'application/x-adopt-bot', SEC_CLASS = 'adopt-sec', ROW_CLASS = 'adopt-row', OK_CLASS = 'adopt-drop-ok', WARN_CLASS = 'adopt-drop-warn'

let board: BoardHandle | null = null
let lastBots: BotSnap[] = []
let lastMeta: AgentMetaDoc | null = null
let lastHomes: HomeRef[] = []
let lastAssistants: AssistantRef[] = []
let useAssistant = false

function paintBoard(): void {
  try {
    if (useAssistant && lastHomes.length && board?.repaintAssistants) board.repaintAssistants(lastHomes, lastAssistants, lastBots, staged)
    else board?.repaint(lastBots, staged)
  } catch { /* 忽略 */ }
}

function reloadMeta(ctx: FeatureCtx): void {
  try {
    void ctx.meta.loadMeta().then((doc) => {
      lastMeta = doc
      if (hadDrag || pressDown) return
      try { paintBoard() } catch { /* 忽略 */ }
    }, () => undefined)
  } catch { /* 读不到昵称就用目录名（fail-closed 展示） */ }
}
let dragId: string | null = null, dragEl: Element | null = null, dragStartX: number | null = null
let dragDesc: { botId: string | null; channel: string | null; aid: string | null } | null = null
let hadDrag = false, dropped = false, pressDown = false, pressSkip = 0, pressAt = 0, lastSig = ''
/* 歇脚小本本：botId → 出来自哪家（只记不写，关面板即撕）。 */
let staged = new Map<string, string>()
const claim = (): number => {
  try {
    const w = window as unknown as Record<string, number>
    w.__adoptGen = (w.__adoptGen || 0) + 1
    return w.__adoptGen
  } catch { return 1 }
}
const alive = (g: number): boolean => {
  try { return (window as unknown as Record<string, number>).__adoptGen === g } catch { return true }
}

function clearAfford(): void {
  try { document.querySelectorAll('.' + OK_CLASS + ', .' + WARN_CLASS).forEach((n) => n.classList.remove(OK_CLASS, WARN_CLASS)) } catch { /* 忽略 */ }
}

function hasMime(e: DragEvent): boolean {
  try { return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(MIME) } catch { return false }
}

function openPanel(ctx: FeatureCtx): void {
  logLine('debug', 'ui.action', { area: 'adopt', action: 'open-panel', ok: true, message: '打开串门搬家面板（bot 数 ' + lastBots.length + '）' })
  try {
    try { installFeatureStyles('adopt', CSS) } catch { /* 忽略 */ }
    try { board?.close() } catch { /* 忽略 */ }
    board = null
    board = openBoard(ctx, lastMeta)
    const rawClose = board.close.bind(board)
    board.close = () => { try { if (staged.size) toast([...staged.keys()].map((id) => lastBots.find((b) => b.botId === id)?.botName || lastAssistants.find((a) => a.id === id)?.name || id).join('、') + '没安顿好，已送回原来的家') } catch { /* 提示失败不阻断 */ } staged.clear(); try { rawClose() } catch { /* 忽略 */ } }
    board.repaint(lastBots, staged)
    /* 有家表就换助理棋盘（无表＝旧面板，老路不动，fail-closed）；有上传头像顺手取图，到了补绘。 */
    if (board.repaintAssistants) void fetchHomes(ctx).then(({ homes, assistants }) => {
      if ((!homes.length && !assistants.length) || !board?.repaintAssistants) return
      lastHomes = homes; lastAssistants = assistants; useAssistant = true
      try { board.repaintAssistants(homes, assistants, lastBots, staged) } catch { /* 忽略 */ }
      ensureAssistantImages(ctx, assistants, () => { try { paintBoard() } catch { /* 忽略 */ } })
    })
    reloadMeta(ctx)
  } catch (e) { logLine('error', 'ui.render.fail', { area: 'adopt', message: '串门面板打开失败：' + String((e as Error)?.message ?? e) }) }
}

export function mountAdopt(ctx: FeatureCtx): () => void {
  const g = claim()
  hadDrag = false; dropped = false; pressDown = false; pressSkip = 0; lastSig = ''
  dragId = null; dragEl = null; dragDesc = null; dragStartX = null; staged.clear()
  useAssistant = false
  const openSelf = (): void => { if (alive(g)) openPanel(ctx) }
  try { ensureEntry(openSelf) } catch { /* 忽略 */ }
  reloadMeta(ctx)
  /* 面板签名：展示字段不变就不重建 DOM（15s 空转快照不再掀桌）。 */
  const sigOf = (bots: BotSnap[]): string => (bots || []).map((b) => b.channel + '|' + b.botId + '|' + b.workspace + '|' + b.botName + '|' + b.healthKind + '|' + (b.stale ? 1 : 0) + '|' + (b.connected ? 1 : 0)).join('\n') + '\n@' + listHomes(ctx).join('|')
  const paint = (): void => { try { paintBoard() } catch { /* 忽略 */ } try { lastSig = sigOf(lastBots) } catch { /* 忽略 */ } }
  /* 落定/撤销后重拉家表＋重绘（面板新鲜度归这里，编排只管写）。 */
  const refetchHomes = (): void => { void fetchHomes(ctx).then((t) => { lastHomes = t.homes; lastAssistants = t.assistants; if (alive(g)) paint() }) }
  const off = ctx.subscribe((snap) => {
    if (!alive(g)) return
    lastBots = snap.bots
    try { ensureEntry(openSelf) } catch { /* 忽略 */ }
    /* 按住/拖飞中冻结：按下点节点一换，原生拖拽还没出生就没了（静默拖不动的主因）。 */
    if (pressDown) { try { if (Date.now() - pressAt > 10000) pressDown = false } catch { pressDown = false } }
    if (hadDrag || pressDown) { if (pressDown) pressSkip++; return }
    const s = sigOf(snap.bots)
    if (s === lastSig) return
    paint()
  })

  /* 工具栏串门搬家入口（FLEET_VIEW_EVENT 同款事件制）：A1 只派发，本特性自开面板。 */
  const onAdoptEvent = (): void => { if (alive(g)) openPanel(ctx) }
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(ADOPT_VIEW_EVENT, onAdoptEvent)
    }
  } catch { /* 无窗口环境跳过 */ }

  const onDragStart = (e: Event): void => {
    if (!alive(g)) return
    try {
      const de = e as DragEvent
      const row = (de.target as Element)?.closest?.('.' + ROW_CLASS) as HTMLElement | null
      if (!row || !de.dataTransfer) return
      hadDrag = true
      dropped = false; pressDown = false
      dragId = row.getAttribute('data-adopt-bot')
      dragEl = row
      dragDesc = { botId: row.getAttribute('data-adopt-bot'), channel: row.getAttribute('data-adopt-channel'), aid: row.getAttribute('data-adopt-assistant') }
      try { dragStartX = de.clientX } catch { dragStartX = null }
      /* 出生后置：分发内只采样不动源节点（mock 第69行同款）；回调重验仍在飞才变影子。 */
      try { const src = row, id = dragId; setTimeout(() => { try { if (dragId === id && id !== null) src.classList.add('adopt-ph') } catch { /* 忽略 */ } }, 0) } catch { /* 忽略 */ }
      try { de.dataTransfer.effectAllowed = 'move' } catch { /* 忽略 */ }
      try { de.dataTransfer.setData('text/plain', String(dragId)) } catch { /* 忽略 */ }
      try { de.dataTransfer.setData(MIME, JSON.stringify({ botId: dragId, channel: row.getAttribute('data-adopt-channel'), aid: row.getAttribute('data-adopt-assistant') })) } catch { /* 置数失败不阻断 */ }
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
      const ws = sec.getAttribute('data-adopt-ws')
      if (!ws && !sec.hasAttribute('data-adopt-plaza')) {
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
    try { dragEl?.classList.remove('adopt-ph') } catch { /* 忽略 */ }
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
      let desc: { botId?: string | null; channel?: string | null; aid?: string | null } = {}
      try { desc = JSON.parse(de.dataTransfer.getData(MIME) || '{}') } catch { /* 载荷坏则拒收 */ }
      if ((!desc.botId || !desc.channel) && dragDesc?.botId && dragDesc?.channel) desc = { botId: dragDesc.botId, channel: dragDesc.channel, aid: dragDesc.aid }
      if (!desc.aid && dragDesc?.aid) { try { desc.aid = dragDesc.aid } catch { /* 忽略 */ } }
      dragDesc = null
      const sec = (de.target as Element)?.closest?.('.' + SEC_CLASS) as Element | null
      /* 助理行优先（新增要求）：拖的是助理卡就走助理搬家，不看 bot 键；巷子口伪行（bot:…）回落旧路。 */
      const aid = typeof desc.aid === 'string' && desc.aid && !desc.aid.startsWith('bot:') ? desc.aid : null
      const asst = aid && useAssistant ? lastAssistants.find((a) => a.id === aid) : null
      if (asst) {
        actAssistantDrop(ctx, asst, sec, {
          homes: lastHomes, bots: lastBots, meta: lastMeta, staged,
          isAlive: () => alive(g), repaint: () => paint(), refetch: () => refetchHomes(),
        })
        return
      }
      if (!desc.botId || !desc.channel) {
        logLine('debug', 'ui.action', { area: 'adopt', action: 'drop-bad-payload', ok: false, message: '拖拽载荷缺 botId/channel，未绑定任何工作区' })
        toast('拖拽数据无效，未绑定任何工作区')
        return
      }
      const live = lastBots.find((b) => b.botId === desc.botId)
      const bot = {
        botId: desc.botId, channel: desc.channel, workspace: live?.workspace ?? '',
        botName: live?.botName ?? '', stale: live?.stale ?? false, healthKind: live?.healthKind ?? '', connected: live?.connected ?? false,
      }
      if (sec && sec.hasAttribute('data-adopt-plaza')) {
        /* 巷子口歇脚：只记小本本不写服务器；拖进一家才走正常换绑，关面板即送回。 */
        if (!live) { toast('找不到这张照片'); return }
        if (!live.workspace) { toast('它已经在巷子口歇着了'); return }
        staged.set(live.botId, live.workspace)
        logLine('debug', 'ui.action', { area: 'adopt', action: 'stage-plaza', ok: true, message: (live.botName || live.botId) + ' 歇脚于巷子口，来自 ' + live.workspace })
        toast((live.botName || live.botId) + '去巷子口歇着了，拖进一家才算搬完')
        if (alive(g)) paint()
        return
      }
      const to = sec?.getAttribute('data-adopt-ws')
      try { if (to && to === live?.workspace && desc.botId) staged.delete(desc.botId) } catch { /* 忽略 */ }
      if (!to) {
        logLine('debug', 'ui.action', { area: 'adopt', action: 'drop-empty', ok: false, message: '空白处不可放：' + desc.botId })
        toast('空白处不可放，请拖到分组上')
        return
      }
      actDrop(ctx, bot, { kind: 'workspace', workspace: to }, lastMeta, { onCommitted: (id) => { try { staged.delete(id) } catch { /* 忽略 */ } if (alive(g)) paint() } })
    } catch (e) { logLine('error', 'ui.render.fail', { area: 'adopt', message: 'drop 处理失败（本次拖放作废）：' + String((e as Error)?.message ?? e) }) }
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
  } catch (e) { logLine('error', 'feature.mount.fail', { feature: 'adopt', message: '拖放监听注册失败：' + String((e as Error)?.message ?? e) }) }

  return () => {
    try {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener(ADOPT_VIEW_EVENT, onAdoptEvent)
      }
    } catch { /* 忽略 */ }
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
    try { clearEntry() } catch { /* 忽略 */ }
    try { board?.close() } catch { /* 忽略 */ }
    board = null
    clearAfford()
    dismissUndo()
    try { dismissAssistantUndo() } catch { /* 忽略 */ }
    try { off() } catch { /* 忽略 */ }
  }
}
