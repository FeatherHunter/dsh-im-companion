/** adopt 助理单位搬家编排（新增要求）：助理＋唯一绑定机器人一起切家。
 * 顺序铁律（与 home-move-ops.moveAssistant 同款）：已绑先 bot.workspace.set（远端跟随）
 * 再 assistant.move（落表）；落表失败回滚远端，两边都不脏。未绑定只换表。
 * 本文件只放编排＋确认框＋撤销窗；判定纯函数在 ./model；旧 acts.ts 一字不动。 */
import { h } from '../../client/dom'
import { logLine } from '../../client/log'
import { toast } from '../../client/ui/toast'
import { channelLabel } from '../../client/data/config'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { FeatureCtx } from '../protocol'
import { dismissUndo } from './acts'
import { UNDO_WINDOW_MS, hasAssistantImage, homePlate, resolveAssistantDrop, shortName, type AssistantRef, type HomeRef } from './model'

const BRIDGE = '/im-companion'

let aUndoTimer: ReturnType<typeof setTimeout> | null = null

export function dismissAssistantUndo(): void {
  try {
    if (aUndoTimer) clearTimeout(aUndoTimer)
    aUndoTimer = null
  } catch { /* 忽略 */ }
  try {
    document.querySelectorAll('.adopt-undo').forEach((n) => n.remove())
  } catch { /* 忽略 */ }
}

function msgOf(e: unknown): string {
  return String((e as Error)?.message ?? e)
}

async function botSet(ctx: FeatureCtx, channel: string, botId: string, workspace: string): Promise<boolean> {
  if (!ctx.rpc) {
    toast('连接服务不可用')
    return false
  }
  try {
    const raw = await ctx.rpc('/' + channel, 'bot.workspace.set', { botId, workspace }, AbortSignal.timeout(8000)) as
      { ok?: boolean; error?: { code?: string; message?: string } } | null
    if (raw && raw.ok === true) return true
    toast('绑定失败：' + String(raw?.error?.message ?? '绑定失败'))
    return false
  } catch (e) {
    toast('绑定失败：' + msgOf(e))
    return false
  }
}

async function tableMove(ctx: FeatureCtx, id: string, from: string, to: string, followed: boolean): Promise<boolean> {
  if (!ctx.rpc) {
    toast('连接服务不可用')
    return false
  }
  try {
    /* fromHomeId/followBot 只进日志（log-sites 读它们纠正 from/to），宿主只认 id/targetHomeId，多键忽略。 */
    const raw = await ctx.rpc(BRIDGE, 'assistant.move', { id, targetHomeId: to, fromHomeId: from, followBot: followed }, AbortSignal.timeout(8000)) as
      { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
    if (raw && raw.ok === true) return true
    toast('搬家失败：' + String(raw?.error?.message ?? 'host 桥调用失败'))
    return false
  } catch (e) {
    toast('搬家失败：' + msgOf(e))
    return false
  }
}

export interface AssistantMoveHooks {
  onCommitted?: (assistantId: string) => void
}

/** 助理单位搬家一步到位（含远端跟随＋落表＋回滚＋刷新；调用方只管重拉家表重绘）。 */
export async function moveAssistantUnit(
  ctx: FeatureCtx,
  assistant: AssistantRef,
  toHome: HomeRef,
  toPath: string,
  fromPath: string,
  hooks?: AssistantMoveHooks,
): Promise<boolean> {
  const bound = assistant.status === 'bound' && !!assistant.botId && !!assistant.channel
  if (bound) {
    if (!await botSet(ctx, assistant.channel, assistant.botId as string, toPath)) {
      logLine('debug', 'ui.action', { area: 'adopt', action: 'assistant-move-far-fail', ok: false, message: assistant.id })
      return false
    }
    if (!await tableMove(ctx, assistant.id, assistant.homeId, toHome.id, true)) {
      try { await botSet(ctx, assistant.channel, assistant.botId as string, fromPath) } catch { /* 回滚尽力 */ }
      logLine('debug', 'ui.action', { area: 'adopt', action: 'assistant-move-rollback', ok: false, message: assistant.id })
      return false
    }
  } else {
    if (!await tableMove(ctx, assistant.id, assistant.homeId, toHome.id, false)) return false
  }
  try { hooks?.onCommitted?.(assistant.id) } catch { /* 通知失败不阻断已落地 */ }
  showAssistantUndo(ctx, assistant, toHome.id, fromPath, hooks)
  try { await ctx.refresh() } catch { /* 刷新失败不阻断已落地 */ }
  return true
}

function showAssistantUndo(ctx: FeatureCtx, assistant: AssistantRef, toHomeId: string, fromPath: string, hooks?: AssistantMoveHooks): void {
  try { dismissUndo() } catch { /* 忽略 */ }
  dismissAssistantUndo()
  try {
    const back = assistant.homeId
    const label = (assistant.name || assistant.botId || assistant.id) + '已搬到' + shortName(toHomeId)
    const msg = h('span', {}, label + '（5s 内可撤销）')
    const btn = h('button', {
      onClick: () => {
        dismissAssistantUndo()
        void (async () => {
          /* 撤销＝原路搬回去（机器人跟随＋表回迁，不复用 moveAssistantUnit 的撤销窗避免套娃）。 */
          const bound = assistant.status === 'bound' && !!assistant.botId && !!assistant.channel
          if (bound) {
            if (!await botSet(ctx, assistant.channel, assistant.botId as string, fromPath)) return
            await tableMove(ctx, assistant.id, toHomeId, back, true)
          } else {
            await tableMove(ctx, assistant.id, toHomeId, back, false)
          }
          toast('已撤销，回到原家', 'check')
          try { hooks?.onCommitted?.(assistant.id) } catch { /* 通知失败不阻断已落地（调用方重拉家表） */ }
          try { await ctx.refresh() } catch { /* 忽略 */ }
        })()
      },
    }, '撤销')
    const el = h('div', { className: 'adopt-undo', role: 'status' }, msg, btn) as HTMLElement
    document.body.appendChild(el)
    aUndoTimer = setTimeout(() => { dismissAssistantUndo(); toast('撤销超时，搬家已生效') }, UNDO_WINDOW_MS)
  } catch { /* 提示失败不阻断已落地 */ }
}

export interface AssistantBotView {
  botId: string
  channel: string
  botName?: string
  healthKind?: string
  stale?: boolean
}

function healthText(b: AssistantBotView): string {
  if (b.stale || b.healthKind === 'warn') return '打盹'
  if (b.healthKind === 'online') return '在岗'
  return '睡着了'
}

/** 助理搬家二次确认（自有确认框，与 acts.askMove 同层级、不复用共享 modal）。 */
export function askAssistantMove(
  ctx: FeatureCtx,
  assistant: AssistantRef,
  bot: AssistantBotView | null,
  fromPath: string,
  toHome: HomeRef,
  toPath: string,
  meta: AgentMetaDoc | null,
  hooks?: AssistantMoveHooks,
): void {
  try {
    try { dismissUndo() } catch { /* 忽略 */ }
    dismissAssistantUndo()
    const box = h('div', { className: 'adopt-confirmbox', role: 'dialog', 'aria-modal': 'true' }) as HTMLElement
    let closed = false
    const close = (): void => {
      if (closed) return
      closed = true
      try { box.remove() } catch { /* 忽略 */ }
      try { document.removeEventListener('keydown', onKey, true) } catch { /* 忽略 */ }
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    const go = (): void => {
      close()
      void moveAssistantUnit(ctx, assistant, toHome, toPath, fromPath, hooks)
    }
    const btns = h('div', { className: 'adopt-confirm-btns' },
      h('button', { onClick: close }, '留在这里'),
      h('button', { onClick: go }, '确认换绑'))
    const whoName = assistant.name || bot?.botName || assistant.botId || assistant.id
    const title = h('div', { className: 'adopt-who' },
      h('div', null, whoName.length > 18 ? whoName.slice(0, 12) + '…' : whoName) as unknown as Node,
      h('div', { className: 'adopt-cap adopt-cap-pair' },
        h('span', null, channelLabel(bot?.channel ?? assistant.channel)) as unknown as Node,
        h('span', null, bot ? healthText(bot) : '未绑定') as unknown as Node) as unknown as Node)
    const fromPlate = homePlate(fromPath, meta)
    const toPlate = homePlate(toPath, meta)
    box.appendChild(h('div', { className: 'adopt-confirm' }, title,
      h('div', {}, '从「' + fromPlate.name + '」') as unknown as Node,
      h('span', { className: 'adopt-cap' }, fromPath) as unknown as Node,
      h('div', {}, '到「' + toPlate.name + '」') as unknown as Node,
      h('span', { className: 'adopt-cap' }, toPath) as unknown as Node, btns) as unknown as Node)
    box.addEventListener('mousedown', (e: Event) => { if (e.target === box) close() })
    document.addEventListener('keydown', onKey, true)
    document.body.appendChild(box)
  } catch (e) { logLine('error', 'ui.render.fail', { area: 'adopt', message: '助理换绑确认框未弹出（fail-closed：不动）：' + msgOf(e) }) }
}

/** 家表一次拉取（失败回空、调用方回落旧面板；不抛）。 */
export async function fetchHomes(ctx: FeatureCtx): Promise<{ homes: HomeRef[]; assistants: AssistantRef[] }> {
  try {
    if (!ctx.rpc) return { homes: [], assistants: [] }
    const raw = await ctx.rpc(BRIDGE, 'home.list', {}, AbortSignal.timeout(8000)) as
      { ok?: boolean; value?: { homes?: HomeRef[]; assistants?: AssistantRef[] } } | null
    const v = raw?.ok === true ? raw.value : null
    return {
      homes: Array.isArray(v?.homes) ? v.homes as HomeRef[] : [],
      assistants: Array.isArray(v?.assistants) ? v.assistants as AssistantRef[] : [],
    }
  } catch { return { homes: [], assistants: [] } }
}

/* ── 助理头像图（img: 标记才取；预设色/默认不发 RPC，图未到先画回落脸）──
 * 只走契约白名单的自有桥（avatar.get 批量，home-avatar.ts 同款出入形状），不引 A1 的 components。 */
const imgCache = new Map<string, string>()
const imgAsked = new Set<string>()

/** 图到了吗（渲染侧纯读；未命中回 null 画回落脸）。 */
export function assistantImage(id: string): string | null {
  return imgCache.get(id) ?? null
}

/** 批量取图（到一批新的才回掉重绘；失败静默留回落脸，不抛）。 */
export function ensureAssistantImages(
  ctx: FeatureCtx,
  assistants: AssistantRef[],
  onReady: () => void,
): void {
  if (!ctx.rpc) return
  const rpc = ctx.rpc
  const need = (assistants || []).filter((a) => a && hasAssistantImage(a.avatar) && !imgCache.has(a.id) && !imgAsked.has(a.id)).map((a) => a.id)
  if (!need.length) return
  for (const id of need) imgAsked.add(id)
  void (async () => {
    try {
      const raw = await rpc(BRIDGE, 'avatar.get', { ids: need }, AbortSignal.timeout(8000)) as
        { ok?: boolean; value?: { images?: Record<string, string> } } | null
      const images = raw?.ok === true ? raw.value?.images : null
      let n = 0
      for (const id of need) {
        const u = images?.[id]
        if (typeof u === 'string' && u.startsWith('data:image/')) { imgCache.set(id, u); n++ }
      }
      if (n) { try { onReady() } catch { /* 忽略 */ } }
    } catch { /* 取不到图就留回落脸 */ }
  })()
}

export interface AssistantDropEnv {
  homes: HomeRef[]
  bots: BotSnap[]
  meta: AgentMetaDoc | null
  staged: Map<string, string>
  isAlive: () => boolean
  repaint: () => void
  /** 重拉家表＋重绘（落定/撤销后调；面板新鲜度归调用方）。 */
  refetch: () => void
}

/** 助理行落点（view 文档级 drop 里助理优先分支的全部活；回 true＝已接管，旧 bot 路碰不到）。 */
export function actAssistantDrop(
  ctx: FeatureCtx,
  asst: AssistantRef,
  sec: Element | null,
  env: AssistantDropEnv,
): boolean {
  if (sec?.hasAttribute('data-adopt-plaza')) {
    env.staged.set(asst.id, asst.homeId)
    toast((asst.name || asst.botId || '它') + '去巷子口歇着了，拖进一家才算搬完')
    if (env.isAlive()) env.repaint()
    return true
  }
  const home = env.homes.find((x) => x.id === sec?.getAttribute('data-adopt-home'))
  if (!sec || !home) { toast('空白处不可放，请拖到分组上'); return true }
  const v = resolveAssistantDrop(asst, { kind: 'home', homeId: home.id }, env.homes)
  if (v.kind !== 'move') { toast(v.kind === 'noop' ? '它已经在这里了' : '这个家接不了'); return true }
  const fromPath = env.homes.find((x) => x.id === asst.homeId)?.path ?? ''
  const live = asst.botId ? env.bots.find((b) => b.botId === asst.botId) : undefined
  askAssistantMove(ctx, asst, live ? { botId: live.botId, channel: live.channel, botName: live.botName, healthKind: live.healthKind, stale: live.stale } : null,
    fromPath, home, home.path, env.meta, { onCommitted: () => { try { env.staged.delete(asst.id) } catch { /* 忽略 */ } env.refetch() } })
  return true
}
