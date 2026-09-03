/** client 侧 connection 句柄与轮询节拍（B1 结论落点）。
 * panel.ts 另有一份同名 extractRpc（在途改动）：为避免耦合暂各持一份，待其稳定后两处合一。
 * CONNECTION_POLL_MS = 15s，与 FleetPanel 轮询同频（panel.ts setInterval 15000）：改动须两处同步。 */
import type { RpcCall } from './fleet-api'

export const CONNECTION_POLL_MS = 15000

export function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  return (channel, endpoint, payload, signal) =>
    (call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>)(channel, endpoint, payload, signal)
}
