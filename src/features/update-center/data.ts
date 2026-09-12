/** update-center 数据层（DOM-free，可 node 直测）：六态状态机 + 三通电话的唯一出入口 + 1s 轮询控制 + 偏好读写。
 * 硬约束：① 不碰 DOM、不读 FeatureCtx.meta（读取一律由 view 在 {host} 回调里发起）；
 * ② 轮询至多一个定时器：只在 job.state ∈ {installing, verifying} 期间开 UPD_POLL，离开立即清（双路清理：sync + dispose）；
 * ③ 读取时机只有三类：{host} 回调里一次 / 用户动作后一次 / 上面那条 1s 表期间。 */
import { UPD_CHANNEL, UPD_CHECK, UPD_INSTALL, UPD_POLL, UPD_POLL_MIN, UPD_RPC_TIMEOUT, UPD_STATUS } from './constants'
import { blockedTokenOf, decodePhone, failingOf, isBusy, snapshotOf, type PhoneResult, type UpdateCtx, type UpdateRpc } from './phone'
import { INTERVALS } from './text'

/** 轮询周期：包常量自带下限（UPD_POLL 不得低于 UPD_POLL_MIN），这里按同一条口径夹一次。 */
const POLL_MS = Math.max(UPD_POLL, UPD_POLL_MIN)

/** 每次点安装发一个新请求凭证（更新包的幂等键；缺它包一律判 `check-expired`，见 install() 注释）。 */
function newRequestId(): string {
  return 'req-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000))
}

export interface UpdatePrefs {
  autoCheckEnabled: boolean
  intervalHours: number
}
export const DEFAULT_PREFS: UpdatePrefs = { autoCheckEnabled: true, intervalHours: 24 }

/** 档位白名单＝面板文案表 `INTERVALS` 的 hours 列（宿主侧另持一份同值常量，分构建各持一份，不跨侧 import）。
 *  读盘一律过这道闸：越界值若原样收进内存态，下拉框会选不中任何档位（浏览器退回显示第一项「6 小时」）、
 *  而宿主按那个越界值排程 —— 面板就在说一件不真实的事。归一化后内存态与显示同落 24。 */
const VALID_INTERVAL_HOURS: readonly number[] = INTERVALS.map((i) => i.hours)
/** 档位校验：`{6,12,24,168}` 之内才算合法（非 number / NaN / 越界 / 非整数一律不合法）。 */
function isValidIntervalHours(value: unknown): value is number {
  return typeof value === 'number' && VALID_INTERVAL_HOURS.includes(value)
}

/* ---------------- 状态机 ---------------- */
export type UiState = 'latest' | 'update' | 'blocked' | 'installing' | 'restart' | 'failed' | 'unavailable'
/** 七态优先级：安装中 > 待重启（pending-restart）> 装不了 > 有新版可装 > 检查失败 > 查不到（未知失败）> 已是最新。
 * 判定原则：**「未知」绝不允许渲染成「已是最新」**——"查不了"与"没有新版"是两件不同的事，混淆它们等于对用户撒谎
 * （用户会因此错过更新，还以为检查成功过）。所以：`res` 缺失、失败信封且 token 映射不到具体 blockedReason
 * （rpc 抛错 / 超时 / rpc 不可用 / 宿主无回包 / 成功信封缺 value）一律落 `unavailable`，由视图展示 `message`；
 * 只有**成功信封**才可能落到 `latest`。反之，`res.ok===false` 但带回同名 token 的仍算「已知原因」⇒ 照旧走 `blocked`。 */
export function deriveState(res: PhoneResult | null, failing: boolean): UiState {
  const snap = snapshotOf(res)
  if (isBusy(snap?.job?.state ?? null)) return 'installing'
  /* 不变量（窄缝 A）：**没有 snapshot，就绝不可能是「已是最新」**。成功信封本该带回更新状态，取不到就是「没有证据」——
   * 落 `unavailable` 由视图说「暂时查不到更新状态」，绝不与「确实没有新版」合流。判在 token 之前：快照缺席时
   * `blockedTokenOf` 连读都读不下去（`res.snapshot` 为 undefined/null 会抛），抛出去这块面板就白屏了。 */
  if (!snap && (res === null || res.ok)) return 'unavailable'
  const token = blockedTokenOf(res)
  if (token === 'pending-restart') return 'restart'
  if (token !== null) return 'blocked' // 有 token ＝ 已知原因（含失败信封从错误通道带回 token 的形态）
  if (snap !== null && snap.canInstall === true && snap.latestVersion !== null && snap.latestVersion !== snap.runningVersion) return 'update'
  if (failing) return 'failed'
  if (res === null || !res.ok) return 'unavailable' // 未知失败：绝不与「没有新版」合流
  return 'latest'
}

/* ---------------- 轮询端口（FeatureCtx 没有 ctx.interval：用 window 表 + 双路清理） ---------------- */
export interface TimerPort {
  setInterval(fn: () => void, ms: number): number
  clearInterval(id: number): void
}
export const WINDOW_TIMER: TimerPort = {
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
}

export interface UpdateStore {
  result(): PhoneResult | null
  prefs(): UpdatePrefs
  state(): UiState
  failing(): boolean
  /** 请求在途（§3.2 并发）：视图据此把检查按钮变「检查中…」并禁用，防重复提交。 */
  checking(): boolean
  lastCheckAt(): number | null
  subscribe(fn: () => void): () => void
  loadPrefs(): Promise<void>
  readStatus(): Promise<PhoneResult>
  check(): Promise<PhoneResult>
  install(): Promise<PhoneResult>
  setPrefs(patch: Partial<UpdatePrefs>): Promise<void>
  pollArmed(): boolean
  dispose(): void
}

/** 状态容器：三通电话的唯一出入口（轮询不变量整块在此，别拆到两个文件去）。 */
export function createUpdateStore(ctx: UpdateCtx, deps: { timer: TimerPort; now?: () => number }): UpdateStore {
  const timer = deps.timer
  const now = deps.now ?? ((): number => Date.now())
  const listeners = new Set<() => void>()
  let res: PhoneResult | null = null
  let prefs: UpdatePrefs = { autoCheckEnabled: DEFAULT_PREFS.autoCheckEnabled, intervalHours: DEFAULT_PREFS.intervalHours }
  let pollId: number | null = null
  let inFlight = false
  let dead = false
  let checkedAt: number | null = null
  const emit = (): void => { for (const fn of [...listeners]) { try { fn() } catch { /* 单个订阅者失败不影响其他 */ } } }
  const state = (): UiState => deriveState(res, failingOf(res))

  /** 只认 job.state：进 installing/verifying 开表，离开立即清（第二路清理在 dispose）。 */
  function syncPoll(): void {
    const need = !dead && isBusy(snapshotOf(res)?.job?.state ?? null)
    if (need && pollId === null) {
      pollId = timer.setInterval(() => { void tick() }, POLL_MS)
    } else if (!need && pollId !== null) {
      timer.clearInterval(pollId)
      pollId = null
    }
  }
  function tick(): void {
    if (inFlight || dead) return // 轮询不叠加：上一发没回来就跳过这一拍
    void call(UPD_STATUS) // 轮询只调 UPD_STATUS（check 要联网，绝不经这条表发）
  }
  async function call(endpoint: string, payload: Record<string, unknown> = {}): Promise<PhoneResult> {
    const rpc = ctx.rpc
    if (dead) return res ?? { ok: false, token: null, message: null }
    if (!rpc) {
      res = { ok: false, token: null, message: '宿主桥不可用' }
      syncPoll(); emit()
      return res
    }
    inFlight = true
    emit() // 在途态立刻可见（按钮变「检查中…」并禁用）；结束（无论成功/失败）由下面同一处恢复
    try {
      const raw = await rpc(UPD_CHANNEL, endpoint, payload, AbortSignal.timeout(UPD_RPC_TIMEOUT))
      res = decodePhone(raw)
    } catch (e) {
      res = { ok: false, token: null, message: (e as Error)?.message ?? '请求失败' }
    } finally {
      inFlight = false
    }
    syncPoll(); emit()
    return res
  }
  async function readStatus(): Promise<PhoneResult> { return call(UPD_STATUS) }
  async function check(): Promise<PhoneResult> {
    const out = await call(UPD_CHECK)
    if (out.ok) checkedAt = now() // 最近检查＝本会话内最后一次成功的检查（snapshot 恰好六字段，没有 checkedAt 可读）
    emit()
    return out
  }
  async function install(): Promise<PhoneResult> {
    const receipt = res !== null && res.ok ? res.receipt : null
    let checkId = typeof receipt?.checkId === 'string' ? receipt.checkId : null
    if (checkId === null) {
      const fresh = await call(UPD_CHECK) // 面板重开后 receipt 已归 null：先复检拿新 receipt，不让用户撞 check-expired
      checkId = fresh.ok && typeof fresh.receipt?.checkId === 'string' ? fresh.receipt.checkId : null
    }
    if (checkId === null) return res ?? { ok: false, token: null, message: null }
    /* T10 真机揪出的**必修项**：更新包 `dist/service.js:299` 要求 `validRequestId(requestId)`（非空串），
     * 缺它就一律抛 `check-expired` —— 面板会永远装不了任何版本。这里每次点安装发一个新凭证
     * （包拿它当幂等键：同 requestId 重复提交直接回既有 job，这正是"重试同一次安装"要的语义）。 */
    return call(UPD_INSTALL, { checkId, requestId: newRequestId() })
  }
  async function setPrefs(patch: Partial<UpdatePrefs>): Promise<void> {
    prefs = {
      autoCheckEnabled: patch.autoCheckEnabled ?? prefs.autoCheckEnabled,
      intervalHours: patch.intervalHours ?? prefs.intervalHours,
    }
    emit() // 先本地生效（开关立刻响应）；写失败也不回滚假开关，下一次 loadPrefs 会以宿主为准
    const rpc = ctx.rpc
    if (rpc) {
      try {
        await rpc(UPD_CHANNEL, 'meta.update.set',
          { autoCheckEnabled: prefs.autoCheckEnabled, intervalHours: prefs.intervalHours },
          AbortSignal.timeout(UPD_RPC_TIMEOUT))
      } catch { /* 写失败：保留本地值，用户可再点一次 */ }
      await readStatus() // 关开关立即停宿主定时器由宿主 sync() 完成；重读拿新的 nextCheckAt
    }
  }
  async function loadPrefs(): Promise<void> {
    try {
      const meta = ctx.meta
      if (!meta) return
      const doc = (await meta.loadMeta()) as { update?: { autoCheckEnabled?: unknown; intervalHours?: unknown } } | null
      const u = doc?.update
      if (u && typeof u === 'object') {
        prefs = {
          autoCheckEnabled: u.autoCheckEnabled !== false,
          intervalHours: isValidIntervalHours(u.intervalHours) ? u.intervalHours : DEFAULT_PREFS.intervalHours,
        }
      }
    } catch { /* 存储未就绪：保持默认；此处是回调内异步读，绝不静默吞掉整条监听 */ }
    emit()
  }
  return {
    result: () => res, prefs: () => prefs, state, failing: () => failingOf(res),
    checking: () => inFlight, lastCheckAt: () => checkedAt, pollArmed: () => pollId !== null,
    subscribe: (fn) => { listeners.add(fn); return (): void => { listeners.delete(fn) } },
    loadPrefs, readStatus, check, install, setPrefs,
    dispose: (): void => {
      dead = true
      if (pollId !== null) { timer.clearInterval(pollId); pollId = null }
      listeners.clear()
    },
  }
}
