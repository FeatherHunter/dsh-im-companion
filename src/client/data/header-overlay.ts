/** B3 Header 浮层纯数据层（C 变体 verdict #8）。
 * 时机三态：工作区不可解析 → hidden（不注入）；已知无绑定 → unbound（灰色提示）；
 * 已绑定 → full（呼吸点 + 详情）。健康语义复用 B1（任一在线即在线，失败按未知）。
 * 发测试消息只走 dsh-im 已保存目标（PROACTIVE_DELIVERY 契约）：无目标不谎报发送。 */
import { badgeForWorkspace, type BadgeKind } from './bindings'
import type { BotSnap, RpcCall } from './fleet-api'

/** 发测试消息意图事件名：detail = { workspace, agent, botId, channel, targetId }（只读意图，见组件）。 */
export const SEND_TEST_EVENT = 'dsh-im-companion:send-test'

/** dsh-im 主动投递通道（PROACTIVE_DELIVERY.md）：Connection RPC 共用投递核心。 */
export const DELIVERY_CHANNEL = '/dsh-im-delivery'

const RPC_TIMEOUT_MS = 5000

/** 测试文案固定前缀（与 dsh-im 检查连接同文案，便于识别），后接 Agent 归因。 */
export const TEST_TEXT_PREFIX = 'DeepSeek Harness 连接测试成功'

export interface WorkspaceItem {
  workspaceId: string
  path?: string
  title?: string
  sessionIds?: readonly string[]
}

/** session → workspace 路径（官方 ui-workspace 同款语义：items.find(item.sessionIds.includes(session))）。 */
export function resolveWorkspacePath(sessionId: string, items: readonly WorkspaceItem[]): string | undefined {
  if (!sessionId || !items) return undefined
  for (const item of items) {
    try {
      if (item && item.path && item.sessionIds && item.sessionIds.includes(sessionId)) return item.path
    } catch {
      /* 单项异常跳过 */
    }
  }
  return undefined
}

export type OverlayMode = 'hidden' | 'unbound' | 'full'
export type DotKind = BadgeKind

export interface HeaderOverlay {
  mode: OverlayMode
  agent: string
  label: string
  tooltip: string
  dotKind: DotKind
  /** full 态下首选 Bot（优先在线），其余态为 null。 */
  bot: BotSnap | null
}

/** 当前工作区浮层状态：纯函数，调用方按 mode 决定渲染（hidden 返回 null）。 */
export function headerOverlayFor(
  workspacePath: string | undefined,
  bots: BotSnap[],
  nowMs = Date.now(),
): HeaderOverlay {
  if (!workspacePath) {
    return { mode: 'hidden', agent: '', label: '', tooltip: '', dotKind: 'unbound', bot: null }
  }
  const badge = badgeForWorkspace(workspacePath, bots, nowMs)
  if (badge.kind === 'unbound') {
    return { mode: 'unbound', agent: badge.agent, label: badge.label, tooltip: badge.tooltip, dotKind: 'unbound', bot: null }
  }
  return {
    mode: 'full',
    agent: badge.agent,
    label: badge.label,
    tooltip: badge.tooltip,
    dotKind: badge.kind,
    bot: chooseBot(bots, workspacePath),
  }
}

/** 首选 Bot：优先在线绑定，否则首个绑定；无绑定为 null（调用方走 unbound）。 */
export function chooseBot(
  bots: BotSnap[],
  workspacePath: string,
): BotSnap | null {
  const bound = (bots ?? []).filter((b) => b && b.workspace === workspacePath)
  if (!bound.length) return null
  return bound.find((b) => b.healthKind === 'online') ?? bound[0]
}

/** 测试文案：固定前缀 + Agent 归因（纯文字，1 MiB 上限内）。 */
export function buildTestText(agent: string): string {
  return TEST_TEXT_PREFIX + '（工作区浮层：' + (agent || '未命名') + '）'
}

export interface DeliveryTarget {
  targetId: string
  name?: string
  kind?: string
}

function codedError(code: string, message: string): Error {
  const e = new Error(message || code)
  ;(e as { code?: string }).code = code
  return e
}

/** dsh-im 信封解包：{ok:true,value} 取值；{ok:false} 按码抛错；裸值透传。 */
function unwrapValue(raw: unknown): unknown {
  const r = raw as { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
  if (r && typeof r === 'object') {
    if (r.ok === true) return r.value
    if (r.ok === false) throw codedError(r.error?.code || 'delivery-failed', r.error?.message || 'delivery-failed')
  }
  return raw
}

async function callDelivery(rpc: RpcCall, endpoint: string, payload: Record<string, unknown>): Promise<unknown> {
  const raw = await rpc(DELIVERY_CHANNEL, endpoint, payload, AbortSignal.timeout(RPC_TIMEOUT_MS))
  return unwrapValue(raw)
}

/** 列出机器人已保存投递目标（dsh-im 设置页配置）。 */
export async function listTargets(rpc: RpcCall, botId: string): Promise<DeliveryTarget[]> {
  const value = (await callDelivery(rpc, 'target.list', { botId })) as { targets?: DeliveryTarget[] } | null
  const targets = value?.targets
  return Array.isArray(targets) ? targets : []
}

/** 发测试消息完整流程（组件直接调用）：只走已保存目标，无目标/离线如实返回文案，绝不谎报发送。 */
export interface TestSendOutcome {
  ok: boolean
  text: string
  event?: { workspace: string; agent: string; botId: string; channel: string; targetId: string }
}

export async function runTestSend(
  rpc: RpcCall | null,
  bot: BotSnap | null,
  workspacePath: string,
  agent: string,
): Promise<TestSendOutcome> {
  if (!rpc) return { ok: false, text: '无法连接 Host 连接服务，稍后重试。' }
  if (!bot) return { ok: false, text: '该工作区尚未绑定机器人，先去绑定后再试。' }
  if (bot.healthKind === 'offline' || bot.connected === false) {
    return { ok: false, text: '该机器人当前离线，恢复连接后重试。' }
  }
  if (bot.stale) return { ok: false, text: '该机器人状态待确认（轮询失败），请稍后重试。' }
  try {
    const targets = await listTargets(rpc, bot.botId)
    if (!targets.length) {
      return { ok: false, text: '该机器人尚未配置投递目标，请到 dsh-im 设置页新建目标后重试。' }
    }
    const target = targets[0]
    await sendTestMessage(rpc, bot.botId, target.targetId, buildTestText(agent))
    return {
      ok: true,
      text: '已发送到「' + (target.name || target.targetId) + '」。',
      event: { workspace: workspacePath, agent, botId: bot.botId, channel: bot.channel, targetId: target.targetId },
    }
  } catch (e) {
    const code = (e as { code?: string })?.code
    return { ok: false, text: '发送失败' + (code ? '（' + code + '）' : '') + '：' + String((e as Error)?.message ?? e) }
  }
}

/** 经已保存目标发送测试消息；成功透传 {sent:true}，失败按码抛错（调用方如实展示）。 */
export async function sendTestMessage(
  rpc: RpcCall,
  botId: string,
  targetId: string,
  text: string,
): Promise<{ sent: true }> {
  const value = (await callDelivery(rpc, 'message.send', { botId, targetId, text })) as { sent?: boolean } | null
  if (!value || value.sent !== true) throw codedError('delivery-failed', 'delivery-failed')
  return { sent: true }
}
