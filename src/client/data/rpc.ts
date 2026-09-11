/** client 侧 connection 句柄（只读 rpc.call；轮询节拍归 connection-stream 所有）。
 * #77 终审返工 F1：panel.ts 本地副本已删、直引本文件 extractRpcV2，两处合一完成，无循环依赖（本文件值依赖为零）。
 * T5 落地（#77）：dsh-im 管理 RPC 改道（上游 503a24a）双传输翻译收敛在本文件，
 * 调用点（fleet-api/fetchBots/healthOf/轮询）零改；回包信封语义未变，unwrap/extractBots 照旧。 */
import type { RpcCall } from './fleet-api'

type RawCall = (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>

/** 新载体白名单（旧 channel → 新 endpoint 'dsh-im'+channel；钉死 management-rpc.mjs rpcEndpoint 规则）。
 * 9 状态渠道 + wecom-app（上游 WECOM_APP_RPC_CHANNEL='/wecom-app'，wecomAppRpcCall 经新载体）
 * + office（上游 OFFICE_RPC_CHANNEL='/office'）+ /dsh-im-delivery（DELIVERY_RPC_CHANNEL，
 * 新 endpoint 'dsh-im/dsh-im-delivery'，header-overlay.ts 经同一 RpcCall 有真实调用点）。
 * '/im-companion' 自有桥（routes.list/activity/meta）不在表内，直通不动。 */
const NEW_CARRIER_CHANNELS: ReadonlySet<string> = new Set([
  '/feishu', '/weixin', '/qq', '/slack', '/telegram', '/discord', '/whatsapp', '/dingtalk', '/wecom',
  '/wecom-app', '/office', '/dsh-im-delivery',
  '/im-companion',
])

/** 新载体 endpoint：dsh-im 渠道沿用 'dsh-im'+channel；自有桥 '/im-companion' 用 'im-companion'
 *  （#80：host 侧已把自有桥改道到 connection.fetch.register，路径 /api/im-companion）。 */
function newCarrierEndpoint(channel: string): string {
  return channel === '/im-companion' ? 'im-companion' : 'dsh-im' + channel
}

type Direction = 'new' | 'old'

/** per-channel 方向记忆（channel 为键）：首个成功者锁定本 channel 后续轮询方向（省每 15s 双打）；
 * 只做优化不锁死——失败仍换路试探，回退成功即更新，环境升级后能回得来。 */
const dirMemo = new Map<string, Direction>()

/** 调用方取消判定：signal 已耗尽，或错误即 AbortError——此二者永不回退，直接重抛。 */
function isCallerAbort(signal: AbortSignal, err: unknown): boolean {
  if (signal.aborted) return true
  return (err as { name?: unknown } | null)?.name === 'AbortError'
}

/** T5 双传输翻译（#77 生产落地；旧 extractRpc 默认路径冻结，非白名单原样直通）：
 * 新形态优先 rpc.call('/api','dsh-im<ch>',{method,payload})（与 callManagementRpc 同构）；
 * 保守回退：仅传输 reject 才换路——回包 ok:false 是权威答复永不回退，
 * Abort/调用方取消永不回退（直接重抛，不换 signal 重试）。 */
export async function dualTransportCallV2(
  call: RawCall, channel: string, endpoint: string, payload: Record<string, unknown>, signal: AbortSignal,
): Promise<unknown> {
  if (!NEW_CARRIER_CHANNELS.has(channel)) return call(channel, endpoint, payload, signal)
  const fresh = (s: AbortSignal): Promise<unknown> =>
    call('/api', newCarrierEndpoint(channel), { method: endpoint, payload }, s)
  const legacy = (s: AbortSignal): Promise<unknown> => call(channel, endpoint, payload, s)
  const first: Direction = dirMemo.get(channel) ?? 'new'
  try {
    const value = first === 'new' ? await fresh(signal) : await legacy(signal)
    if (dirMemo.get(channel) !== first) dirMemo.set(channel, first)
    return value
  } catch (err) {
    if (isCallerAbort(signal, err)) throw err
    const second: Direction = first === 'new' ? 'old' : 'new'
    const value = second === 'new' ? await fresh(signal) : await legacy(signal)
    dirMemo.set(channel, second)
    return value
  }
}

/** 旧签名/默认路径冻结（T5 前行为）：同名同参同返回，旧形态直调；回滚时调用点切回此函数即复原。 */
export function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  return (channel, endpoint, payload, signal) =>
    (call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>)(channel, endpoint, payload, signal)
}

/** T5 opt-in 出口：与 extractRpc 同签名，内层经 dualTransportCallV2；
 * 调用点（index.ts/panel.ts）显式切此函数，fleet-api 其下零动。 */
export function extractRpcV2(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  const raw = call as RawCall
  return (channel, endpoint, payload, signal) => dualTransportCallV2(raw, channel, endpoint, payload, signal)
}
