/** unread host 调用薄封装（同 RpcMetaStore 信封：ok:true 取值；失败静默）。
 * events.ts 的内联 twin 保持不动（动工作代码风险大于重复 10 行）；新调用走这里。 */
import type { RpcCall } from '../../client/data/fleet-api'

const CHANNEL = '/im-companion'
const RPC_TIMEOUT_MS = 5000

export async function callUnread(rpc: RpcCall | null, endpoint: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    if (!rpc) return false
    let raw: unknown = null
    try {
      raw = await rpc(CHANNEL, endpoint, payload, AbortSignal.timeout(RPC_TIMEOUT_MS))
    } catch {
      return false
    }
    const res = raw as { ok?: unknown } | null
    return !!res && res.ok === true
  } catch {
    return false
  }
}
