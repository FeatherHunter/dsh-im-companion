/** session-header 助理身份层（#144）：家表助理 → 弹窗身份＋助理单选的数据唯一来源。
 * 纯模块（无 React/DOM）：匹配、命名、状态、脸描述、home.list/avatar.get 一次性拉取。
 * 家归属/命名链复用共享 home-model（单向依赖）；脸算法是 home-identity/left-badges 的只读镜像
 * （feature 禁引别家，色相环/字形规则相同，底色改挂 --af-*：本弹窗不在 .home-ui 之下，--hu-* 取不到）。
 * 无自有轮询：fetchAssistBriefs 只在弹窗打开时调一次；图未到先画色脸（不等、不重试、不存东西）。 */
import { HEALTH_LABELS, channelLabel, healthOf, type HealthKind } from '../../client/data/config'
import { botDisplayLabel, type BotSnap, type RpcCall } from '../../client/data/fleet-api'
import { normPath, resolveAssistantDisplay, type Assistant, type Home } from '../../client/data/home-model'

export type AssistStatus = HealthKind | 'unbound'

export const ASSIST_STATUS_TEXT: Record<AssistStatus, string> = { ...HEALTH_LABELS, unbound: '未绑定' }

export interface AssistBrief {
  assistant: Assistant
  bot: BotSnap | null
  name: string
  from: string
  status: AssistStatus
  statusText: string
  img: string | null
  tint: string
  initial: string
}

/** 图片标记（与宿主 AVATAR_PREFIX 同字面量 `img:`，跨端各持一份，见 home-avatar.ts）。 */
export function hasAssistImage(avatar: string | null | undefined): boolean {
  return typeof avatar === 'string' && avatar.startsWith('img:') && avatar.length > 4
}

const HUE = [174, 205, 262, 32, 340, 150]

function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export function initialsOf(name: string): string {
  const s = String(name ?? '').trim()
  if (!s) return '?'
  if (!/^[\x20-\x7e]+$/.test(s)) return Array.from(s)[0] ?? '?'
  const words = s.split(/[-_\s.]+/).filter(Boolean)
  if (words.length >= 2) return ((words[0][0] ?? '') + (words[1][0] ?? '')).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}

/** 助理色脸底色（--af-* 作用域，见文件头；色相环/字形与 home-identity 同规则）。预置表 owner 2026-10-17 重做，2026-10-18 追修 9 档。 */
const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['#17181C', '#FFFFFF'], ['#4D6BFE', '#FFFFFF'], ['#2F4A44', '#FFFFFF'],
  ['#4E6E8E', '#FFFFFF'], ['#7A3E5A', '#FFFFFF'], ['#C4B49A', '#1B1B1F'],
  ['#B5473A', '#FFFFFF'], ['#7C3AED', '#FFFFFF'], ['#0E8A43', '#FFFFFF'],
]
export function faceStyle(id: string, avatar: string | null = null): string {
  const i = avatar == null ? -1 : Number.parseInt(avatar, 10) - 1
  const hue = Number.isInteger(i) && i >= 0 && i < HUE.length ? HUE[i] : HUE[hash32(String(id ?? '')) % HUE.length]
  const p = Number.isInteger(i) && i >= 0 && i < PRESETS.length ? PRESETS[i] : null
  return p ? `background:${p[0]};color:${p[1]}` : `background:hsl(${hue} 62% 30%);color:#fff`
}

/** bot → 助理：渠道+botId 精确命中优先，botId 兜底（与 left-badges matchAssistant 同序）。 */
export function matchBotAssistant(assistants: Assistant[], bot: BotSnap): Assistant | null {
  const list = assistants || []
  if (bot?.botId) {
    const byKey = list.find((a) => a && a.botId === bot.botId && (!a.channel || a.channel === bot.channel))
    if (byKey) return byKey
    const byId = list.find((a) => a && a.botId === bot.botId)
    if (byId) return byId
  }
  return null
}

function statusFor(a: Assistant, b: BotSnap | null): AssistStatus {
  if (!b) return a.status === 'unbound' ? 'unbound' : 'offline'
  if (b.stale) return 'warn'
  return healthOf(b.healthStatus, b.connected)
}

/** 同路家（非墓碑、规范路径命中）的助理行，按 createdAt 保序；悬空 homeId 不渲染（fail-closed）。 */
export function buildAssistBriefs(
  homes: Home[], assistants: Assistant[], bots: BotSnap[], wsPath: string, images: ReadonlyMap<string, string>,
): AssistBrief[] {
  const target = normPath(wsPath)
  const homeById = new Map<string, Home>()
  for (const h of homes || []) {
    if (h && !h.tombstone && normPath(h.path) === target) homeById.set(h.id, h)
  }
  const rows = (assistants || [])
    .filter((a) => a && homeById.has(a.homeId))
    .slice()
    .sort((x, y) => x.createdAt - y.createdAt)
  return rows.map((a) => {
    const live = (bots || []).find((x) => x && x.botId === a.botId && (!a.channel || x.channel === a.channel))
      ?? (bots || []).find((x) => x && a.botId && x.botId === a.botId) ?? null
    const home = homeById.get(a.homeId)
    const disp = resolveAssistantDisplay(a, live ? botDisplayLabel(live) : '', home?.name ?? '')
    const status = statusFor(a, live)
    const hit = hasAssistImage(a.avatar) ? images.get(a.id) : undefined
    if (typeof hit === 'string' && hit) {
      return { assistant: a, bot: live, name: disp.text, from: disp.from, status, statusText: ASSIST_STATUS_TEXT[status], img: hit, tint: '', initial: '' }
    }
    const url = (live?.avatarUrl || '').trim()
    if (url) {
      return { assistant: a, bot: live, name: disp.text, from: disp.from, status, statusText: ASSIST_STATUS_TEXT[status], img: url, tint: '', initial: '' }
    }
    return { assistant: a, bot: live, name: disp.text, from: disp.from, status, statusText: ASSIST_STATUS_TEXT[status], img: null, tint: faceStyle(a.id, a.avatar), initial: initialsOf(disp.text) }
  })
}

const BRIDGE = '/im-companion'

/** 聚合渠道行最小面（OverlayChannel 的结构子集，避免纯层引 header-overlay）。 */
export interface ChannelRow { channel: string; label: string; kind: HealthKind; statusText: string }

export interface AssistChannelView { label: string; live: boolean; kind: HealthKind | 'unbound'; statusText: string }

/** 渠道行诚实视图（#144 追修）：只有助理确有 Bot 才借用聚合行状态；
 * 无 Bot（未绑定/失联）一律用助理自身状态，绝不把同渠道别人的“在线”安到它头上。 */
export function channelViewFor(b: AssistBrief, rows: ChannelRow[]): AssistChannelView {
  const row = b.bot ? (rows || []).find((r) => r && r.channel === b.assistant.channel) : undefined
  if (row) return { label: row.label, live: true, kind: row.kind, statusText: row.statusText }
  return {
    label: (rows || []).find((r) => r && r.channel === b.assistant.channel)?.label ?? channelLabel(b.assistant.channel),
    live: false,
    kind: b.status === 'unbound' ? 'unbound' : b.status,
    statusText: b.statusText,
  }
}

/** 一次性拉取：home.list 建行＋avatar.get 取图（调用方只在弹窗打开时调，无轮询）。 */
export async function fetchAssistBriefs(rpc: RpcCall | null, bots: BotSnap[], wsPath: string): Promise<AssistBrief[]> {
  if (!rpc || !wsPath) return []
  let homes: Home[] = []
  let assistants: Assistant[] = []
  try {
    const raw = await rpc(BRIDGE, 'home.list', {}, AbortSignal.timeout(8000)) as { ok?: boolean; value?: { homes?: unknown; assistants?: unknown } } | null
    const v = raw?.ok === true ? raw.value : null
    homes = Array.isArray(v?.homes) ? v.homes as Home[] : []
    assistants = Array.isArray(v?.assistants) ? v.assistants as Assistant[] : []
  } catch { return [] }
  const images = new Map<string, string>()
  const need = assistants.filter((a) => a && hasAssistImage(a.avatar)).map((a) => a.id)
  if (need.length) {
    try {
      const raw = await rpc(BRIDGE, 'avatar.get', { ids: need }, AbortSignal.timeout(8000)) as { ok?: boolean; value?: { images?: Record<string, string> } } | null
      const got = raw?.ok === true ? raw.value?.images : null
      for (const id of need) {
        const u = got?.[id]
        if (typeof u === 'string' && u.startsWith('data:image/')) images.set(id, u)
      }
    } catch { /* 图未到留色脸 */ }
  }
  try {
    return buildAssistBriefs(homes, assistants, bots, wsPath, images)
  } catch { return [] }
}
