/** client 侧 connection 句柄（只读 rpc.call；轮询节拍归 connection-stream 所有）。
 * panel.ts 另有一份同名 extractRpc（在途改动）：为避免耦合暂各持一份，待其稳定后两处合一。
 * T4 原型（#76）：dsh-im 管理 RPC 改道（上游 503a24a）双传输翻译收敛在本文件，
 * 调用点（fleet-api/healthOf/轮询）零改；回包信封语义未变，unwrap/extractBots 照旧。 */
import type { RpcCall } from './fleet-api'

type RawCall = (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>

/** 新载体白名单（旧 channel → 新 endpoint 'dsh-im'+channel；management-rpc.mjs:3-6 规则）。
 * 9 状态渠道 + wecom-app（WECOM_APP_RPC_CHANNEL='/wecom-app'，wecomAppRpcCall 经新载体）
 * + office（OFFICE_RPC_CHANNEL='/office'，installProductionChannel channel:'office'）
 * + /dsh-im-delivery（DELIVERY_RPC_CHANNEL，新 endpoint 'dsh-im/dsh-im-delivery'，
 * 本仓无 delivery-rpc.mjs，映射按统一规则 + client/index.js:431 查明，一并列入）。
 * '/im-companion' 自有桥（routes.list/activity/meta）不在表内，直通不动。 */
const NEW_CARRIER_CHANNELS: ReadonlySet<string> = new Set([
  '/feishu', '/weixin', '/qq', '/slack', '/telegram', '/discord', '/whatsapp', '/dingtalk', '/wecom',
  '/wecom-app', '/office', '/dsh-im-delivery',
])

/** 会话级方向记忆：首个成功者锁定后续轮询方向，避免每 15s 双打；只做优化不锁死（失败仍回退）。 */
let preferred: 'new' | 'old' | null = null

/** 保守回退：仅传输 reject 才换路；回包 ok:false 是权威答复，永不回退（调用方 unwrap 处理）。 */
export async function dualTransportCall(
  call: RawCall, channel: string, endpoint: string, payload: Record<string, unknown>, signal: AbortSignal,
): Promise<unknown> {
  if (!NEW_CARRIER_CHANNELS.has(channel)) return call(channel, endpoint, payload, signal)
  const fresh = (s: AbortSignal): Promise<unknown> =>
    call('/api', 'dsh-im' + channel, { method: endpoint, payload }, s)
  const legacy = (s: AbortSignal): Promise<unknown> => call(channel, endpoint, payload, s)
  /* 旧直调 5s 超时二选一（T1 §4b）：首打若耗尽调用方 signal，回退需新 signal，否则瞬间 abort。 */
  const fallbackSignal = (): AbortSignal => (signal.aborted ? AbortSignal.timeout(5000) : signal)
  const first: 'new' | 'old' = preferred ?? 'new'
  try {
    const value = first === 'new' ? await fresh(signal) : await legacy(signal)
    if (preferred === null) preferred = first
    return value
  } catch {
    /* 新载体拒识/超时 → 回旧直调；旧方向失败 → 回新载体（环境可能已升级）。 */
    const value = first === 'new' ? await legacy(fallbackSignal()) : await fresh(fallbackSignal())
    if (preferred === null) preferred = first === 'new' ? 'old' : 'new'
    return value
  }
}

export function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  const raw = call as RawCall
  return (channel, endpoint, payload, signal) => dualTransportCall(raw, channel, endpoint, payload, signal)
}
