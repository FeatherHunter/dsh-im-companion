/** 渠道数据采集：并发 connection.status（9 渠道），RPC 信封解包，统一成 BotSnap。 */
import { CHANNEL_ORDER, healthOf, type HealthKind } from './config'

export type RpcCall = (
  channel: string,
  endpoint: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>

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
  health?: { status?: string; summary?: string; lastCheckedAt?: number }
  bot?: { name?: string; avatarUrl?: string; appIdMasked?: string }
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
  const bots = botsRaw.map((b): BotSnap => {
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
    }
  })
  const provisioning = value?.provisioning ?? value?.snapshot?.provisioning ?? null
  return { bots, provisioning: provisioning && typeof provisioning === 'object' ? provisioning : null }
}

/** 并发拉取全部渠道连接状态；失败渠道降级为空数组并记入 failed。 */
export async function fetchBots(rpc: RpcCall): Promise<{ bots: BotSnap[]; failed: string[] }> {
  const results = await Promise.allSettled(
    CHANNEL_ORDER.map(async (ch) => {
      const raw = await rpc('/' + ch, 'connection.status', {}, AbortSignal.timeout(RPC_TIMEOUT_MS))
      const value = unwrap(raw)
      const doc = value as { ok?: boolean; error?: unknown } | null
      if (doc && doc.ok === false) return []
      return extractBots(value).map((b): BotSnap => {
        const hs = b.health?.status ?? b.status ?? null
        return {
          channel: ch,
          botId: b.botId ?? '',
          workspace: b.workspace ?? b.workspacePath ?? '',
          connected: b.connected === true,
          healthStatus: hs,
          healthKind: healthOf(hs, b.connected),
          botName: b.bot?.name ?? '',
          avatarUrl: b.bot?.avatarUrl ?? '',
          healthSummary: b.health?.summary ?? '',
          lastCheckedAt: typeof b.health?.lastCheckedAt === 'number' ? b.health.lastCheckedAt : null,
        }
      })
    }),
  )
  const bots: BotSnap[] = []
  const failed: string[] = []
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') bots.push(...res.value)
    else failed.push(CHANNEL_ORDER[i])
  })
  return { bots, failed }
}
