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
  /** B1 结论：该通道轮询失败时保留旧快照并标 stale（时间冻结，按未知/待确认展示）。 */
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

/** 原始单 bot → BotSnap（两处拉取共用；新快照恒 stale:false）。 */
function toBotSnap(channel: string, b: RawBot): BotSnap {
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
    stale: false,
  }
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
  const bots = botsRaw.map((b): BotSnap => toBotSnap(channel, b))
  const provisioning = value?.provisioning ?? value?.snapshot?.provisioning ?? null
  return { bots, provisioning: provisioning && typeof provisioning === 'object' ? provisioning : null }
}

/** 并发拉取全部渠道连接状态；失败渠道记入 failed。
 * B1 结论：传输失败的渠道保留上一轮快照并标 stale（时间冻结、按未知展示），
 * 而不是丢弃谎报离线；ok:false（渠道未配置）是权威空，不保留。 */
export async function fetchBots(rpc: RpcCall, prev: BotSnap[] = []): Promise<{ bots: BotSnap[]; failed: string[] }> {
  const results = await Promise.allSettled(
    CHANNEL_ORDER.map(async (ch) => {
      const raw = await rpc('/' + ch, 'connection.status', {}, AbortSignal.timeout(RPC_TIMEOUT_MS))
      const value = unwrap(raw)
      const doc = value as { ok?: boolean; error?: unknown } | null
      if (doc && doc.ok === false) return []
      return extractBots(value).map((b): BotSnap => toBotSnap(ch, b))
    }),
  )
  const bots: BotSnap[] = []
  const failed: string[] = []
  results.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      bots.push(...res.value)
    } else {
      const ch = CHANNEL_ORDER[i]
      failed.push(ch)
      for (const p of prev) {
        if (p.channel === ch) bots.push({ ...p, stale: true, healthKind: 'warn' })
      }
    }
  })
  return { bots, failed }
}
