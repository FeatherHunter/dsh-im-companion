/** 渠道数据采集：并发 connection.status（9 渠道），RPC 信封解包，统一成 BotSnap。 */
import { CHANNEL_ORDER, healthOf, type HealthKind } from './config'

export type RpcCall = (
  channel: string,
  endpoint: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>

/** 上游 dsh-im 真值回流（connection.status decorateStatus 原样带回，只读不写）。 */
export interface AgentPresetCatalog {
  defaultId: string
  items: { id: string; label: string }[]
}

export interface UpstreamCtx {
  groupEnabled: boolean
  directEnabled: boolean
  fields: string[]
  guidance: string
}

export interface BotSnap {
  channel: string
  botId: string
  workspace: string
  connected: boolean
  healthStatus: string | null
  healthKind: HealthKind
  botName: string
  avatarUrl: string
  healthSummary: string
  lastCheckedAt: number | null
  /** 轮询失败保留的旧快照标记（connection-stream 写入，时间冻结、按未知展示）。 */
  stale?: boolean
  /** 上游回流：null = 跟随默认；undefined = 该轮未读到（读守卫：禁用写）。 */
  agentPreset?: string | null
  /** 上游回流：null 缺席时按双关全关理解；undefined = 未读到（读守卫：禁用写）。 */
  contextEnhancement?: UpstreamCtx | null
}

/** provision.begin 返回/快照中的授权状态（跨渠道同名）。 */
export interface ProvisionState {
  attemptId?: string
  phase?: string
  submitted?: boolean
  expiresAt?: number
  durationMs?: number
  qrCodeDataUrl?: string
  verificationUrl?: string
  botId?: string
  botName?: string
  operation?: string
  error?: { code?: string; message?: string } | null
}

const RPC_TIMEOUT_MS = 5000

type RawBot = {
  botId?: string
  workspace?: string
  workspacePath?: string
  connected?: boolean
  status?: string
  agentPreset?: unknown
  contextEnhancement?: unknown
  health?: { status?: string; summary?: string; lastCheckedAt?: number }
  bot?: { name?: string; avatarUrl?: string; appIdMasked?: string }
}

const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/

/** 上游 agentPreset 归一：字符串 id 原样，非空非法值按未读到处理，null/'' = 跟随默认。 */
export function normalizeUpstreamPreset(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  const id = v.trim()
  if (id === '') return null
  return PRESET_ID_RE.test(id) ? id : undefined
}

/** 上游 contextEnhancement 归一：缺键按关/空补齐（只读展示用，写时原样回填全量）。 */
export function normalizeUpstreamCtx(v: unknown): UpstreamCtx | null | undefined {
  if (v === undefined) return undefined
  if (v === null || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const fields = Array.isArray(r.fields) ? r.fields.filter((f): f is string => typeof f === 'string') : []
  return {
    groupEnabled: r.groupEnabled === true,
    directEnabled: r.directEnabled === true,
    fields,
    guidance: typeof r.guidance === 'string' ? r.guidance : '',
  }
}

/** 上游 agentPresetCatalog 归一：缺席/损坏按空目录处理（下拉仅跟随默认）。 */
export function normalizeUpstreamCatalog(v: unknown): AgentPresetCatalog {
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  const items = Array.isArray(r?.items) ? r.items : []
  const out: { id: string; label: string }[] = []
  const seen = new Set<string>()
  for (const e of items) {
    const id = e && typeof e === 'object'
      ? ((e as Record<string, unknown>).id as string ?? '')
      : (typeof e === 'string' ? e : '')
    const t = typeof id === 'string' ? id.trim() : ''
    if (!t || !PRESET_ID_RE.test(t) || seen.has(t)) continue
    seen.add(t)
    const label = e && typeof e === 'object' && typeof (e as Record<string, unknown>).label === 'string'
      && ((e as Record<string, unknown>).label as string).trim()
      ? ((e as Record<string, unknown>).label as string).trim().slice(0, 128)
      : t
    out.push({ id: t, label })
  }
  const dflt = typeof r?.defaultId === 'string' && PRESET_ID_RE.test(r.defaultId.trim()) ? r.defaultId.trim() : ''
  return { defaultId: dflt, items: out }
}

function snapBot(channel: string, b: RawBot): BotSnap {
  const hs = b.health?.status ?? b.status ?? null
  return {
    channel,
    botId: b.botId ?? '',
    workspace: b.workspace ?? b.workspacePath ?? '',
    connected: b.connected === true,
    healthStatus: hs,
    healthKind: healthOf(hs, b.connected),
    botName: b.bot?.name ?? '',
    avatarUrl: b.bot?.avatarUrl ?? '',
    healthSummary: b.health?.summary ?? '',
    lastCheckedAt: typeof b.health?.lastCheckedAt === 'number' ? b.health.lastCheckedAt : null,
    agentPreset: normalizeUpstreamPreset(b.agentPreset),
    contextEnhancement: normalizeUpstreamCtx(b.contextEnhancement),
  }
}

function unwrap(raw: unknown): unknown {
  const r = raw as { ok?: boolean; value?: unknown } | null
  if (r && r.ok === true && r.value !== undefined) return r.value
  return raw
}

function extractBots(value: unknown): RawBot[] {
  const r = value as { bots?: RawBot[]; snapshot?: { bots?: RawBot[] }; data?: { bots?: RawBot[] } } | null
  if (!r) return []
  if (Array.isArray(r)) return r as RawBot[]
  if (Array.isArray(r.bots)) return r.bots
  if (r.snapshot && Array.isArray(r.snapshot.bots)) return r.snapshot.bots
  if (r.data && Array.isArray(r.data.bots)) return r.data.bots
  return []
}

/** 单渠道状态（接入流程轮询用）：返回该渠道 bots + 顶层 provisioning。 */
export async function fetchChannelStatus(rpc: RpcCall, channel: string): Promise<{ bots: BotSnap[]; provisioning: ProvisionState | null }> {
  const raw = await rpc('/' + channel, 'connection.status', {}, AbortSignal.timeout(RPC_TIMEOUT_MS))
  const value = unwrap(raw) as { bots?: RawBot[]; provisioning?: ProvisionState | null; snapshot?: { bots?: RawBot[]; provisioning?: ProvisionState | null } } | null
  const botsRaw = value?.bots ?? value?.snapshot?.bots ?? []
  const bots = botsRaw.map((b): BotSnap => snapBot(channel, b))
  const provisioning = value?.provisioning ?? value?.snapshot?.provisioning ?? null
  return { bots, provisioning: provisioning && typeof provisioning === 'object' ? provisioning : null }
}

/** 并发拉取全部渠道连接状态；失败渠道降级为空数组并记入 failed。
 * A' 追加：每渠道 agentPresetCatalog 随状态回流（catalogs，缺席即空目录；只加字段）。 */
export async function fetchBots(rpc: RpcCall): Promise<{ bots: BotSnap[]; failed: string[]; catalogs: Record<string, AgentPresetCatalog> }> {
  const results = await Promise.allSettled(
    CHANNEL_ORDER.map(async (ch) => {
      const raw = await rpc('/' + ch, 'connection.status', {}, AbortSignal.timeout(RPC_TIMEOUT_MS))
      const value = unwrap(raw)
      const doc = value as { ok?: boolean; error?: unknown } | null
      if (doc && doc.ok === false) return { bots: [], catalog: normalizeUpstreamCatalog(null) }
      const v = value as { agentPresetCatalog?: unknown } | null
      return { bots: extractBots(value).map((b): BotSnap => snapBot(ch, b)), catalog: normalizeUpstreamCatalog(v?.agentPresetCatalog) }
    }),
  )
  const bots: BotSnap[] = []
  const failed: string[] = []
  const catalogs: Record<string, AgentPresetCatalog> = {}
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      bots.push(...res.value.bots)
      catalogs[CHANNEL_ORDER[i]] = res.value.catalog
    } else failed.push(CHANNEL_ORDER[i])
  })
  return { bots, failed, catalogs }
}

/** B1 verdict 延续（connection-stream 落地前各调用方复用）：传输失败的渠道保留上一轮快照
 * 并标 stale（时间冻结、按未知展示），而不是丢弃谎报离线；ok:false 是权威空，不保留。 */
export function mergeStaleBots(prev: BotSnap[], fresh: BotSnap[], failed: readonly string[]): BotSnap[] {
  if (!failed.length) return fresh
  const seen = new Set(fresh.map((b) => b.channel + '\0' + b.botId))
  const retained = (prev ?? []).filter(
    (b) => b && failed.includes(b.channel) && !seen.has(b.channel + '\0' + b.botId),
  ).map((b): BotSnap => ({ ...b, stale: true, healthKind: 'warn' }))
  return [...fresh, ...retained]
}
