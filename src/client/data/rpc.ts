/** client 侧 connection 句柄（只读 rpc.call；轮询节拍归 connection-stream 所有）。
 * panel.ts 另有一份同名 extractRpc（在途改动）：为避免耦合暂各持一份，待其稳定后两处合一。 */
import type { RpcCall } from './fleet-api'

export function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  return (channel, endpoint, payload, signal) =>
    (call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>)(channel, endpoint, payload, signal)
}
