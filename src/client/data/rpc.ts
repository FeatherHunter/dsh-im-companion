/** client 侧 connection 句柄（只读 rpc.call；轮询节拍归 connection-stream 所有）。
 * #77 终审返工 F1：panel.ts 本地副本已删、直引本文件 extractRpcV2，两处合一完成，无循环依赖（本文件值依赖为零）。
 * T5 落地（#77）：dsh-im 管理 RPC 改道（上游 503a24a）双传输翻译收敛在本文件，
 * 调用点（fleet-api/fetchBots/healthOf/轮询）零改；回包信封语义未变，unwrap/extractBots 照旧。 */
import type { RpcCall } from './fleet-api'
import { buildLogQueryPhoneName, buildPhoneNames } from 'dsh-log/client'
import { LOG_PLUGIN_ID } from '../../log-events'
import { currentTraceId, logLine } from '../log'

/** 两条传输都失败＝真桥故障：记 warn（method 带渠道定位），同键同原文只记一次防轮询刷盘（T9 #123）。
 * **首选方向与换路的原文都要进 message**：真机验收实测——`/im-companion` 的旧前缀路由已退役、换路必 405，
 * 只记改道后的那条原文，等于拿「永远不会通的老路由」盖掉首选载体的真因（读日志的人会追错方向）。 */
const failSig = new Map<string, string>()
function dirName(d: Direction): string { return d === 'new' ? '新载体' : '旧前缀回退' }
function noteBridgeFail(method: string, err: unknown, first?: { dir: Direction; err: unknown }): void {
  const message = String((err as Error)?.message ?? err)
  const full = first
    ? dirName(first.dir) + '失败：' + String((first.err as Error)?.message ?? first.err)
      + '；换路' + dirName(first.dir === 'new' ? 'old' : 'new') + '仍失败：' + message
    : message
  if (failSig.get(method) === full) return
  failSig.set(method, full)
  logLine('warn', 'bridge.call.fail', { method, message: full })
}

type RawCall = (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>

/** 新载体白名单（旧 channel → 新 endpoint 'dsh-im'+channel；钉死 management-rpc.mjs rpcEndpoint 规则）。
 * 9 状态渠道 + wecom-app（上游 WECOM_APP_RPC_CHANNEL='/wecom-app'，wecomAppRpcCall 经新载体）
 * + office（上游 OFFICE_RPC_CHANNEL='/office'）+ /dsh-im-delivery（DELIVERY_RPC_CHANNEL，
 * 新 endpoint 'dsh-im/dsh-im-delivery'，header-overlay.ts 经同一 RpcCall 有真实调用点）。
 * '/im-companion' 自有桥（routes.list/activity/meta）自 #79 起并入本表：host 半已改道
 * connection.fetch.register（路径 /api/im-companion），旧前缀路由退役，故 endpoint 取 'im-companion'。 */
const NEW_CARRIER_CHANNELS: ReadonlySet<string> = new Set([
  '/feishu', '/weixin', '/qq', '/slack', '/telegram', '/discord', '/whatsapp', '/dingtalk', '/wecom',
  '/wecom-app', '/office', '/dsh-im-delivery',
  '/im-companion',
])

/** 新载体 endpoint：dsh-im 渠道沿用 'dsh-im'+channel；自有桥 '/im-companion' 用 'im-companion'
 *  （#79：host 侧已把自有桥改道到 connection.fetch.register，路径 /api/im-companion）。 */
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
    try {
      const value = second === 'new' ? await fresh(signal) : await legacy(signal)
      dirMemo.set(channel, second)
      return value
    } catch (e2) {
      /* 换路仍失败：**两条原文照记**（这是「桥坏了」与「某个渠道没配」的分界证据），Abort 仍直通不记。 */
      if (isCallerAbort(signal, e2)) throw e2
      noteBridgeFail(channel + ':' + endpoint, e2, { dir: first, err })
      throw e2
    }
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

/** 日志电话名单（**包自拼名字，本仓不拼字符串**）：电话入参是包自己的语义面，不同义于桥元数据——
 * `logQuery` 的 `traceId` 是**过滤条件**，桥上再塞一把同名键等于把「查全部」静默收窄成「只查当前链」
 * ⇒ 电话调用一律不加键，入参逐字节原样；宿主侧另有一道对称的「电话不摘键」（`src/index.ts`）。
 * 拼不出名字（前缀非法等）就退化成空集：多一把键也只对业务端点有害（但那正是要的），电话侧由宿主放行兜底。 */
const LOG_PHONE_NAMES: ReadonlySet<string> = (() => {
  try {
    return new Set<string>([...Object.values(buildPhoneNames(LOG_PLUGIN_ID)), buildLogQueryPhoneName(LOG_PLUGIN_ID)])
  } catch { return new Set<string>() }
})()

/** T9 #125：自有桥的业务请求带上当前会话链 id（宿主日志行与触发动作用同一个 traceId）。
 * 四条纪律：① 只给自有桥（`'/im-companion'`）加——上游 dsh-im 渠道的载荷不掺本仓字段；
 * ② 日志电话不加（见 `LOG_PHONE_NAMES`）；③ 载荷里已有 `traceId` 键就**不覆盖**——显式传的那把
 * 是调用方语义（`logQuery` 的过滤条件），桥只在「本来没有」时补当前链；④ 无链（`null`）不加键，不许编造空串。
 * 键名与语义见 `docs/features-contract.md` §4「桥内层 payload 的可选 traceId」；宿主必须先摘掉再用。 */
function withTraceId(channel: string, endpoint: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (channel !== '/im-companion' || LOG_PHONE_NAMES.has(endpoint)) return payload
  if (Object.hasOwn(payload, 'traceId')) return payload
  const tid = currentTraceId()
  return tid ? { ...payload, traceId: tid } : payload
}

/** T5 opt-in 出口：与 extractRpc 同签名，内层经 dualTransportCallV2；
 * 调用点（index.ts/panel.ts）显式切此函数，fleet-api 其下零动。 */
export function extractRpcV2(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  const raw = call as RawCall
  return (channel, endpoint, payload, signal) =>
    dualTransportCallV2(raw, channel, endpoint, withTraceId(channel, endpoint, payload), signal)
}
