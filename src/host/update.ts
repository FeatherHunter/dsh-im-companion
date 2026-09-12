/** 更新系统宿主侧（T7 #90）：接线装配 + 回包信封 + 自动检查生命周期。
 *
 * 本模块是 T7 的唯一出口，做四件事：
 * ① 按包真身调 `createHostUpdate`，把 `update.handlers` 的 3 个键交给 `src/host/rpc.ts` 的端点表；
 * ② 注入 `readerOverrides.{runningVersion, profileDir, readInstalled}`——**这三样是必需件不是可选优化**，
 *    理由链见 `update-paths.ts` / `update-reader.ts` 的头注（R3 实测：不注入 ⇒ `unknown-profile`；
 *    只注入 runningVersion ⇒ `installation-changed`、`canInstall` 恒假）；
 * ③ 本仓 `RpcResult` 信封：成功把包载荷 `{ok,snapshot,manual,receipt}` **原样**放进 `value`（字段名一个不改），
 *    并在**同一位置**追加 `autoCheck` 运行期状态（与包的 `manual` 同级，三通电话一套代码路径）；
 *    包失败（`{ok:false,error,errorKind}`）走本仓失败通道，错误码按显式表映射、原载荷放 `details.update` 不吞掉；
 * ④ 自动检查调度器：默认开 / 24 h 一档 / 启动后 60 s 首查，定时器一律走宿主受管定时器。
 * 装配顺序（票面硬要求）：让位分支（`src/index.ts` 的 already registered 早退）上**不建任何定时器**——
 * 故本模块的构造函数**零副作用**（只读盘算路径），定时器只在 `start()` 里、且在让位分支之后才起。
 */
import { createHostUpdate, detectEnvironmentKind } from 'dsh-plugin-update'
import type { UpdatePrefs } from './meta-store.js'
import type { RpcResult } from './rpc.js'
import { TARGET_PACKAGE_NAME, ownPackage, resolveProfileDir } from './update-paths.js'
import { nodeUpdateReaderFs, readUpdateEnv, type UpdateReaderFs } from './update-reader.js'
import { createUpdateScheduler, type TimerPort, type UpdateScheduler } from './update-schedule.js'

export const UPDATE_PLUGIN_ID = 'dsh-im-companion'
/** 电话名前缀：包冻结 `buildPhoneNames` 的拼法为 `<前缀>.<动作>`，故前缀只能是单段（T4 §3.7）。 */
export const UPDATE_PHONE_PREFIX = 'imc'
/** 端点名（= 电话名，票面定死）：`rpc.ts` 的 case 标签必须与它逐字一致；verify 断言包给的电话名等于它。 */
export const UPDATE_ENDPOINTS = ['imc.updateStatus', 'imc.updateCheck', 'imc.updateInstall'] as const

/** 更新包错误码白名单（`dist/host.js:142-156` 的 13 个）→ 本仓错误码的**显式映射**。
 *  本仓既有先例是把上游冻结 token 原样当错误码用（`src/client/data/binding-commit.ts:48` 判 `workspace-bot-not-found`），
 *  故这里保持同形：已知 token 原样透传（**不吞掉**），白名单外折叠为本仓通用码 `internal`（**不自造一套**）；
 *  包的原始 token 与 `errorKind` 同时进 `message` / `details`，信息零丢失。 */
export const UPDATE_ERROR_CODES: Record<string, string> = {
  'check-failed': 'check-failed',
  'invalid-release': 'invalid-release',
  'check-expired': 'check-expired',
  'update-busy': 'update-busy',
  'install-failed': 'install-failed',
  'unknown-profile': 'unknown-profile',
  'source-install': 'source-install',
  'invalid-installation': 'invalid-installation',
  'installation-changed': 'installation-changed',
  'pending-restart': 'pending-restart',
  'incompatible-node': 'incompatible-node',
  'registry-conflict': 'registry-conflict',
  'recovery-required': 'recovery-required',
}

/** 偏好存取端口：`AgentMetaStore` 结构性满足它（落盘沿用 host `meta.json`，不新建文件、不碰 localStorage）。 */
export interface UpdatePrefsStore {
  load(): Promise<void>
  updatePrefs(): UpdatePrefs
  setUpdate(input: { intervalHours?: unknown }): Promise<void>
}

export interface UpdateBridgeLogger {
  info?(message: string): void
  warn?(message: string): void
}

export interface UpdateHostOptions {
  ctx: unknown
  store: UpdatePrefsStore
  dshHome: string
  logger?: UpdateBridgeLogger
  /** 显式使用范围名（缺省由 `resolveProfileDir` 认领）。 */
  profileName?: string
  /** ── 以下皆为测试/门禁缝，缺省即生产口径 ── */
  runningVersion?: string
  profileDir?: string
  timer?: TimerPort
  now?: () => number
  readerFs?: UpdateReaderFs
  readerOverrides?: Record<string, unknown>
  firstDelayMs?: number
  retryDelayMs?: number
}

/** `autoCheck` 运行期状态（内存，不落盘；宿主重启即归零）。**设置项不在这条通道**——开关/档位走 `meta.get`。 */
export interface AutoCheckView {
  /** 是否处于「自动检查失败」态。初始 `false`：从未自动检查过**不是**失败，面板不显示灰字。 */
  failing: boolean
  /** 最近一次**自动**检查失败的时间；任何一次检查成功（自动或手动）清成 `null`。 */
  lastFailureAt: number | null
  /** 下次自动检查预计时间；开关关闭时报 `null`。 */
  nextCheckAt: number | null
}

export interface UpdateHostBridge {
  handlers: Record<string, (payload?: unknown) => Promise<unknown>>
  reply(pkgReply: unknown): RpcResult
  autoCheck(): AutoCheckView
  sync(): void
  start(): void
  dispose(): void
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? input as Record<string, unknown> : null
}

/** 宿主受管定时器端口：`ctx.interval`（周期）+ `ctx.timeout`（一次性），均返回释放函数。
 *  缺服务时回 `null`——上层诚实降级（warn 且不排检查），**不退回裸 `setInterval`**。 */
export function ctxTimerPort(ctx: unknown): TimerPort | null {
  const source = asRecord(ctx)
  const every = source?.interval
  const once = source?.timeout
  if (typeof every !== 'function' || typeof once !== 'function') return null
  const wrap = (method: unknown, callback: () => void, delayMs: number): (() => void) => {
    const dispose = (method as (cb: () => void, ms: number) => unknown).call(source, callback, delayMs)
    return typeof dispose === 'function' ? dispose as () => void : () => {}
  }
  return {
    every: (callback, delayMs) => wrap(every, callback, delayMs),
    once: (callback, delayMs) => wrap(once, callback, delayMs),
  }
}

export function createUpdateHostBridge(options: UpdateHostOptions): UpdateHostBridge {
  const logger = options.logger ?? {}
  const now = options.now ?? ((): number => Date.now())
  const own = ownPackage()
  const runningVersion = options.runningVersion ?? own?.version ?? ''
  const profileDir = options.profileDir
    ?? resolveProfileDir({ dshHome: options.dshHome, selfDir: own?.directory ?? null, profileName: options.profileName })
  const readerFs = options.readerFs ?? nodeUpdateReaderFs
  const environmentKind = detectEnvironmentKind(options.ctx)
  // 注入必须在**首次调用**就带：`dist/host.js:93` 的单例键不含 `readInstalled`，同进程内先建过读取器就吃不上
  // （`__resetSharedUpdateReaderForTests` 只给测试）。`overrides` 在构造期定版，故首调必然带上。
  const overrides: Record<string, unknown> = {
    runningVersion,
    profileDir,
    homeDir: options.dshHome,
    readInstalled: () => readUpdateEnv({
      profileDir,
      runningVersion,
      homeDir: options.dshHome,
      environmentKind,
      pluginId: UPDATE_PLUGIN_ID,
      targetPackageName: TARGET_PACKAGE_NAME,
      fs: readerFs,
    }),
    ...options.readerOverrides,
  }
  const autoState: { failing: boolean; lastFailureAt: number | null } = { failing: false, lastFailureAt: null }
  const packageHost = createHostUpdate(
    { ctx: options.ctx, logCtx: null, readerOverrides: overrides },
    { pluginId: UPDATE_PLUGIN_ID, prefix: UPDATE_PHONE_PREFIX, targetPackageName: TARGET_PACKAGE_NAME },
  )
  const phone = packageHost.phoneNames
  let scheduler: UpdateScheduler | null = null
  let disposed = false

  const isOk = (reply: unknown): boolean => asRecord(reply)?.ok === true

  /** 一套代码路径：自动与手动检查共用它，区别只在 `source`（只由**自动**失败写运行期失败态）。 */
  async function runCheck(payload: Record<string, unknown>, source: 'auto' | 'manual'): Promise<unknown> {
    const reply = await packageHost.handlers[phone.updateCheck](payload)
    if (isOk(reply)) {
      // 任何一次检查成功（自动或手动）都清失败态：owner 裁定「成功后自动消失」就是这一行。
      autoState.failing = false
      autoState.lastFailureAt = null
    } else if (source === 'auto') {
      autoState.failing = true
      autoState.lastFailureAt = now()
    }
    return reply
  }

  // 三个端点按包自己拼的电话名建表（不另拼字符串）；键名即端点名，`rpc.ts` 的 case 逐字对齐。
  const handlers: Record<string, (payload?: unknown) => Promise<unknown>> = {
    [phone.updateStatus]: (payload?: unknown) => packageHost.handlers[phone.updateStatus](asRecord(payload) ?? {}),
    [phone.updateCheck]: (payload?: unknown) => runCheck(asRecord(payload) ?? {}, 'manual'),
    [phone.updateInstall]: (payload?: unknown) => packageHost.handlers[phone.updateInstall](asRecord(payload) ?? {}),
  }

  function autoCheckView(): AutoCheckView {
    return {
      failing: autoState.failing,
      lastFailureAt: autoState.lastFailureAt,
      nextCheckAt: scheduler ? scheduler.nextCheckAt() : null,
    }
  }

  return {
    handlers,
    autoCheck: autoCheckView,
    /** 把包的回包翻成本仓 `RpcResult` 信封；`autoCheck` 与包的 `manual` 同级，三通电话同一处注入。 */
    reply(pkgReply: unknown): RpcResult {
      const row = asRecord(pkgReply)
      if (row?.ok === true) return { ok: true, value: { ...row, autoCheck: autoCheckView() } }
      const token = typeof row?.error === 'string' ? row.error : ''
      return {
        ok: false,
        error: {
          code: UPDATE_ERROR_CODES[token] ?? 'internal',
          message: token || 'internal',
          details: { errorKind: row?.errorKind ?? null, update: row ?? null },
        },
      }
    },
    /** 面板改档位/开关后重排定时器（读 store 现值；改档位不重跑启动首查，关开关立即全释放）。 */
    sync(): void {
      if (disposed) return
      scheduler?.apply(options.store.updatePrefs())
    },
    /** 装配点（必须在让位分支之后）：登记卸载释放 + 起自动检查。 */
    start(): void {
      if (disposed) return
      const timer = options.timer ?? ctxTimerPort(options.ctx)
      if (!timer) {
        logger.warn?.('[update] 宿主没有受管定时器服务（ctx.interval/ctx.timeout），自动检查不启用；不使用裸 setInterval')
        return
      }
      scheduler = createUpdateScheduler({
        timer,
        now,
        check: async () => isOk(await runCheck({}, 'auto')),
        onWarn: (message) => logger.warn?.('[update] ' + message),
        firstDelayMs: options.firstDelayMs,
        retryDelayMs: options.retryDelayMs,
      })
      // 偏好要先从盘上读到再排定时器：装配方 `store.load()` 是并发启动的，可能还没落定
      // （读不到就按默认开 24 h 排，会把「上次关掉过」的用户重新打开自动检查）。
      void Promise.resolve(options.store.load()).catch(() => {}).then(() => {
        if (disposed) return
        scheduler?.start(options.store.updatePrefs())
        logger.info?.('[update] 自动检查已装配：使用范围 ' + profileDir + '，下次 ' + String(scheduler?.nextCheckAt() ?? null))
      })
    },
    /** 显式释放：卸载 / 让位早退走它（幂等）。 */
    dispose(): void {
      disposed = true
      scheduler?.stop()
    },
  }
}
