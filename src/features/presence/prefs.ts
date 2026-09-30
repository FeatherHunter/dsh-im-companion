/** presence 动效开关偏好读写（#98 · 契约 §3 Added-only）：
 *  读 —— 首选 `FeatureCtx.meta.loadMeta()`（既有 `meta.get` 全量快照，**不新增读端点**）；
 *  降级 —— meta 未就绪（client 入口 `metaCache` 异步 ping 宿主，挂载瞬间必为 null，读即抛）时
 *  直调 `ctx.rpc('/im-companion', 'meta.get', {})` 读宿主真值（rpc 同步就绪，无竞态）。
 *  写 —— 自有桥 `ctx.rpc(CHANNEL, 'meta.motion.set', { manualReduced })` 落 host 盘（跨 DSH 重启），
 *  外加 `ctx.meta.setMotion?.()` 写本地镜像（host 不可用时同 profile 浏览器重启仍在）。
 *  `MOTION_CHANNEL` 自持常量（值与 `client/data/meta.ts` 同，取舍同 #90：不引他人模块、不引 A1 私有）。
 *  零轮询；feature 不直写 localStorage（九律 ③：本地镜像走 MetaStore 接口，feature 只调接口）。 */
import type { FeatureCtx } from '../protocol'

/** 自有桥渠道前缀（与 `client/data/meta.ts` 内常量同值；各持一份，避免跨模块 import）。 */
export const MOTION_CHANNEL = '/im-companion'
/** host 端点名（对应 `src/host/rpc.ts` 的 `meta.motion.set`）。 */
export const MOTION_ENDPOINT = 'meta.motion.set'
/** 读端点（既有 `meta.get` 全量快照，不新增）。 */
const MOTION_READ_ENDPOINT = 'meta.get'
const RPC_TIMEOUT_MS = 5000

function timeoutSignal(ms: number): AbortSignal {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  } catch { /* 落到下面的兜底 */ }
  return undefined as unknown as AbortSignal
}

export interface MotionReadResult {
  /** true = 本次读到了权威快照（可定稿）；false = meta 未就绪且直读也失败（未知，下次重绘再试）。 */
  ok: boolean
  /** 手动关？（ok=false 时恒 false——绝不因读失败把用户的动效关掉）。 */
  off: boolean
}

function pickOff(doc: unknown): boolean {
  try {
    const m = (doc as { motion?: { manualReduced?: unknown } } | null | undefined)?.motion
    return m?.manualReduced === true
  } catch {
    return false
  }
}

/** 读偏好（带成败）：先走 `ctx.meta`，未就绪（抛错）则直调 `ctx.rpc` 读宿主真值。 */
export async function readMotionOffResult(ctx: FeatureCtx | null | undefined): Promise<MotionReadResult> {
  // ① 首选契约通道（host 盘权威；Local 降级时读 localStorage 镜像）。
  try {
    const meta = (ctx as unknown as { meta?: { loadMeta?: () => Promise<unknown> } } | null | undefined)?.meta
    if (meta && typeof meta.loadMeta === 'function') {
      const doc = await meta.loadMeta()
      return { ok: true, off: pickOff(doc) }
    }
  } catch {
    /* meta 未就绪（client 入口 metaCache 异步中）→ 落到下面的直读，不算失败 */
  }
  // ② 直读宿主（绕开 metaCache 竞态：rpc 同步就绪，重启后首帧即能读到盘上真值）。
  try {
    const rpc = (ctx as unknown as { rpc?: unknown } | null | undefined)?.rpc
    if (typeof rpc === 'function') {
      const call = rpc as (channel: string, endpoint: string, payload: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
      const raw = await call(MOTION_CHANNEL, MOTION_READ_ENDPOINT, {}, timeoutSignal(RPC_TIMEOUT_MS))
      const res = raw as { ok?: unknown; value?: unknown } | null | undefined
      // RpcMetaStore 信封 `{ ok:true, value: doc }`；裸 doc（单测桩）也认。
      const doc = res && typeof res === 'object' && 'value' in (res as Record<string, unknown>) ? (res as { value?: unknown }).value : raw
      if (res && typeof res === 'object' && 'ok' in (res as Record<string, unknown>) && (res as { ok?: unknown }).ok !== true) {
        return { ok: false, off: false }
      }
      return { ok: true, off: pickOff(doc) }
    }
  } catch {
    /* 直读失败 → 未知 */
  }
  return { ok: false, off: false }
}

/** 读偏好：缺字段 / 旧快照 / 无桥环境一律 false（动效开）——**绝不因读失败把用户的动效关掉**。 */
export async function readMotionOff(ctx: FeatureCtx | null | undefined): Promise<boolean> {
  try {
    return (await readMotionOffResult(ctx)).off
  } catch {
    return false
  }
}

/** 写偏好：fire-and-forget（失败不抛、不回滚 UI——开关照翻，只是这一次没记住）。
 *  双写：host 盘（跨 DSH 重启）+ MetaStore 本地镜像（host 不可用时同 profile 仍在）。 */
export function writeMotionOff(ctx: FeatureCtx | null | undefined, off: boolean): void {
  try {
    const rpc = (ctx as unknown as { rpc?: unknown } | null | undefined)?.rpc
    if (typeof rpc === 'function') {
      const call = rpc as (channel: string, endpoint: string, payload: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
      void call(MOTION_CHANNEL, MOTION_ENDPOINT, { manualReduced: off }, timeoutSignal(RPC_TIMEOUT_MS)).catch(() => undefined)
    }
  } catch { /* 无桥环境静默：开关仍翻转，仅不落盘 */ }
  try {
    const meta = (ctx as unknown as { meta?: { setMotion?: (off: boolean) => Promise<unknown> } } | null | undefined)?.meta
    if (meta && typeof meta.setMotion === 'function') {
      void meta.setMotion(off).catch(() => undefined)
    }
  } catch { /* meta 未就绪就跳过本地镜像（host 那份已发出） */ }
}
