/** update-center 电话层（DOM-free）：三通电话回包的**两个信封**解构 + 载荷归一化。
 * 硬约束：失败信封里可能带同名 token（如 'source-install'），且**没有** autoCheck ⇒ 取不到按「无失败可显示」处理；
 * 成功信封的 value 行内也可能是 `ok:false` 的包原始载荷（install 缺 checkId 等）。两条通道同一个词表。
 * 两条不变量：① 成功信封取不到 snapshot ⇒ 落「回包缺少更新状态」的失败信封（**没有 snapshot 就绝不可能是「已是最新」**）；
 * ② `''`/纯空白的 token 不算原因代号（**没有原因，就不许渲染成「有确切原因」的装不了**）。 */

export interface UpdateJob {
  id: string | null
  state: string | null
  targetVersion: string | null
  message: string | null
  requestId: string | null
}
export interface UpdateSnapshot {
  runningVersion: string | null
  installedVersion: string | null
  latestVersion: string | null
  canInstall: boolean
  blockedReason: string | null
  job: UpdateJob | null
}
export interface AutoCheckState {
  failing: boolean
  lastFailureAt: number | null
  nextCheckAt: number | null
}
export interface UpdateValue {
  ok: true
  snapshot: UpdateSnapshot
  manual: string | null
  receipt: { checkId?: string } | null
  autoCheck: AutoCheckState | null
}
export interface UpdateFailure {
  ok: false
  /** 失败 token（errorKind / error 字符串 / error.code / details.update.error 四路收敛，取不到为 null）。 */
  token: string | null
  message: string | null
}
export type PhoneResult = UpdateValue | UpdateFailure
export interface UpdateRpc {
  (channel: string, endpoint: string, payload: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
}
export interface UpdateCtx {
  rpc: UpdateRpc | null
  /** 只在回调里读（P0-a：mount 内同步读 meta 会抛错并被上层静默吞掉 ⇒ 功能假死）。 */
  meta: { loadMeta(): Promise<unknown> } | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** token 专用归一化（与 str 的区别只在空白）：`''` / `'   '` 等于「**没有**原因代号」。
 *  不变量：**空 token 绝不是已知原因**——若当已知原因收下，面板会落「装不了」而原因那行是空白，
 *  用户看到的是一块毫无解释的失败（比「暂时查不到」更坏：它冒充「有确切原因」）。非空 token 原样通过、不 trim。 */
const asToken = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** 从错误通道的三层里收敛出 token：包原始载荷（details.update.error）优先，其后 error 字符串 / error.code / errorKind。 */
export function tokenFromError(err: unknown): string | null {
  if (typeof err === 'string') return asToken(err)
  if (!err || typeof err !== 'object') return null
  const e = err as Record<string, unknown>
  const details = e.details as { update?: { error?: unknown } } | undefined
  return asToken(details?.update?.error) ?? asToken(e.code) ?? asToken(e.error) ?? asToken(e.errorKind)
}

/** 解构本仓 RpcResult 信封：成功信封（行内可能仍是 ok:false 的包载荷）与失败信封都归一化。 */
export function decodePhone(raw: unknown): PhoneResult {
  const res = raw as Record<string, unknown> | null
  if (!res || typeof res !== 'object') return { ok: false, token: null, message: '宿主无回包' }
  if (res.ok === true) {
    const v = res.value as Record<string, unknown> | undefined
    if (!v || typeof v !== 'object') return { ok: false, token: null, message: '成功信封缺 value' }
    if (v.ok === false) return { ok: false, token: tokenFromError(v.error), message: null } // 同名 token 从错误通道回来
    // 不变量：**没有 snapshot，就绝不可能是「已是最新」**。成功信封本该带回更新状态；取不到就是「没有证据」，
    // 只能落失败信封 ⇒ data.ts 的 deriveState 落 `unavailable`（见 !res.ok 那行），绝不与「确实没有新版」合流。
    // 真宿主每次都带完整数据，故此路只在回包被截断/伪装时触发——而那正是最需要它说实话的时刻。
    if (!v.snapshot || typeof v.snapshot !== 'object' || Array.isArray(v.snapshot)) {
      return { ok: false, token: null, message: '回包缺少更新状态' }
    }
    return {
      ok: true,
      snapshot: normalizeSnapshot(v.snapshot),
      manual: str(v.manual),
      receipt: (v.receipt as { checkId?: string } | null | undefined) ?? null,
      autoCheck: normalizeAuto(v.autoCheck),
    }
  }
  const e = res.error as Record<string, unknown> | undefined
  const msg = typeof res.error === 'string' ? null : str(e?.message)
  return { ok: false, token: tokenFromError(res.error) ?? tokenFromError(res.errorKind), message: msg }
}

function normalizeSnapshot(raw: unknown): UpdateSnapshot {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const j = (s.job && typeof s.job === 'object' ? s.job : null) as Record<string, unknown> | null
  return {
    runningVersion: str(s.runningVersion),
    installedVersion: str(s.installedVersion),
    latestVersion: str(s.latestVersion),
    canInstall: s.canInstall === true,
    blockedReason: str(s.blockedReason),
    job: j ? {
      id: str(j.id), state: str(j.state), targetVersion: str(j.targetVersion),
      message: str(j.message), requestId: str(j.requestId),
    } : null,
  }
}

/** 失败信封里没有 autoCheck ⇒ 取不到按「无失败可显示」处理，不得当失败渲染。 */
function normalizeAuto(raw: unknown): AutoCheckState | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (typeof a.failing !== 'boolean') return null
  return { failing: a.failing === true, lastFailureAt: num(a.lastFailureAt), nextCheckAt: num(a.nextCheckAt) }
}

export function snapshotOf(res: PhoneResult | null): UpdateSnapshot | null {
  return res && res.ok ? res.snapshot : null
}
/** 灰字显示条件唯一来源：failing === true（初值 false ⇒ 新装用户不会一开面板就看到「暂时不可用」）。 */
export function failingOf(res: PhoneResult | null): boolean {
  return res !== null && res.ok && res.autoCheck !== null && res.autoCheck.failing === true
}
export function nextCheckAtOf(res: PhoneResult | null): number | null {
  return res !== null && res.ok && res.autoCheck !== null ? res.autoCheck.nextCheckAt : null
}
/** 阻塞 token：成功信封看 snapshot.blockedReason，失败信封看同名 token（两条通道同一个词表）。
 *  两条通道都过 asToken ⇒ 纯空白的 blockedReason 也不算原因（快照通道的 `'   '` 同样会渲染出空白原因行）。 */
export function blockedTokenOf(res: PhoneResult | null): string | null {
  if (res === null) return null
  return asToken(res.ok ? res.snapshot.blockedReason : res.token)
}
/** 装/校验中的 job 状态（1s 轮询开表的唯一判据）。 */
export const BUSY_STATES = ['installing', 'verifying']
export function isBusy(state: string | null): boolean {
  return state !== null && BUSY_STATES.indexOf(state) >= 0
}
