/** 更新系统宿主侧（T7 #90 接线 → #99 升 0.2.0 后**大幅解耦**）。
 *
 * 本模块现在只做三件事，其余全归更新包：
 * ① 按包真身调 `createHostUpdate`，把 `update.handlers` 的 3 个键交给 `src/host/rpc.ts` 的端点表；
 * ② 本仓 `RpcResult` 信封：成功把包载荷 `{ok,snapshot,manual,receipt}` **原样**放进 `value`（字段名一个不改），
 *    并在**同一位置**追加 `autoCheck` 运行期状态（与包的 `manual` 同级，三通电话一套代码路径）；
 *    包失败（`{ok:false,error,errorKind}`）走本仓失败通道，原因码**原样透传**（包 README §5.2 冻结了这组码，
 *    本仓不自造第二套词表，也不做恒等映射表）。
 * ③ 自动检查调度器：默认开 / 24 h 一档 / 启动后 60 s 首查，定时器一律走宿主受管定时器。
 *
 * ── #99 删掉了什么（0.2.0 原生接管，别再长回来）─────────────────────────────
 * 0.1.x 认「插件装在哪、跑的是哪版」的唯一手段是 `containingPackage(import.meta.url, 目标包名)`——
 * 起点是**更新包自己所在的目录**，按版本号装进 profile 后目标包是它的兄弟目录 ⇒ 必然 `unknown-profile`。
 * 当时我们为此自写了 `update-reader.ts`（194 行：清单/安装/合法性/安装指纹全流程）与 `update-paths.ts`
 * （92 行：包根、运行版本、使用范围目录），再用 `readerOverrides.{runningVersion,profileDir,readInstalled}` 注入。
 * **0.2.0 起包自己按包名解析目标包**（清单直解 → 入口反查 → `node_modules` 步行 → 自锚定兜底），
 * 使用范围目录由实装路径反推（`<范围>/node_modules/<目标包>`），安装指纹与合法性判定都在包内。
 * ⇒ 两份自持实现整体删除，装配只留 `{ ctx, logCtx }` 两个参数（README §2 第 2 步的原样接线）。
 * 唯一保留的注入是 `readerOverrides.homeDir`：它是**取值**不是实现（本仓 `dshHome` 可被插件配置覆盖，
 * 而包的默认值只看 `DSH_HOME` 环境变量与家目录），传它才能保证更新落盘与本仓 `meta.json` 同源。
 * 测试缝（`readerOverrides.*`、`timer`、`now`）保留：只做注入，不含任何解析逻辑。
 *
 * 装配顺序（票面硬要求）：让位分支（`src/index.ts` 的 already registered 早退）上**不建任何定时器**——
 * 故本模块的构造函数**零副作用**（只建能力、不碰盘、不排定时器），定时器只在 `start()` 里起。
 */
import { createHostUpdate } from 'dsh-plugin-update'
import type { UpdatePrefs } from './meta-store.js'
import type { RpcResult } from './rpc.js'
import { createUpdateScheduler, type TimerPort, type UpdateScheduler } from './update-schedule.js'

export const UPDATE_PLUGIN_ID = 'dsh-im-companion'
/** 电话名前缀：包冻结 `buildPhoneNames` 的拼法为 `<前缀>.<动作>`，故前缀只能是单段（T4 §3.7）。 */
export const UPDATE_PHONE_PREFIX = 'imc'
/** 目标包名：要检查/安装更新的那个包就是本插件自己（包按它反推使用范围目录）。 */
export const TARGET_PACKAGE_NAME = 'dsh-im-companion'
/** 端点名（= 电话名，票面定死）：`rpc.ts` 的 case 标签必须与它逐字一致；verify 断言包给的电话名等于它。 */
export const UPDATE_ENDPOINTS = ['imc.updateStatus', 'imc.updateCheck', 'imc.updateInstall'] as const

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

/** 包的事件日志口（README §6.11：按插件标识过滤 `host.call` / `host.call.fail` / `update.install.exec`）。
 *  只做形状适配——包调 `fire(level, event, fields)`，本仓 logger 只有 info/warn；`fields` 是包定义的脱敏字段。 */
export interface UpdateLogContext {
  fire?(level: string, event: string, fields: Record<string, unknown>): void
}

export interface UpdateHostOptions {
  ctx: unknown
  store: UpdatePrefsStore
  /** 本仓家目录（`config.dshHome` → `DSH_HOME` → `~/.dsh`）。作为**取值**交给包，保证两侧落盘同源。 */
  dshHome: string
  logger?: UpdateBridgeLogger
  /** 事件日志口；缺省由 `logger` 拼一个（warn/error 走 warn，其余走 info）。 */
  logCtx?: UpdateLogContext
  /** ── 以下皆为测试/门禁缝，缺省即生产口径（不含任何解析逻辑） ── */
  readerOverrides?: Record<string, unknown>
  timer?: TimerPort
  now?: () => number
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

/** 事件日志口缺省实现：把包的 `fire(level, event, fields)` 翻成宿主日志一行。 */
function defaultLogContext(logger: UpdateBridgeLogger): UpdateLogContext {
  return {
    fire(level, event, fields) {
      const line = event + ' ' + JSON.stringify(fields)
      if (level === 'warn' || level === 'error') logger.warn?.(line)
      else logger.info?.(line)
    },
  }
}

export function createUpdateHostBridge(options: UpdateHostOptions): UpdateHostBridge {
  const logger = options.logger ?? {}
  const now = options.now ?? ((): number => Date.now())
  const packageHost = createHostUpdate(
    {
      ctx: options.ctx,
      logCtx: options.logCtx ?? defaultLogContext(logger),
      readerOverrides: { homeDir: options.dshHome, ...options.readerOverrides },
    },
    { pluginId: UPDATE_PLUGIN_ID, prefix: UPDATE_PHONE_PREFIX, targetPackageName: TARGET_PACKAGE_NAME },
  )
  const phone = packageHost.phoneNames
  const autoState: { failing: boolean; lastFailureAt: number | null } = { failing: false, lastFailureAt: null }
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
      // 原因码原样透传（包 README §5.2 的八种阻塞 + 五种失败码就是本仓词表，不再维护第二份）。
      const token = typeof row?.error === 'string' && row.error ? row.error : 'internal'
      return {
        ok: false,
        error: {
          code: token,
          message: token,
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
        logger.info?.('[update] 自动检查已装配，下次 ' + String(scheduler?.nextCheckAt() ?? null))
      })
    },
    /** 显式释放：卸载 / 让位早退走它（幂等）。 */
    dispose(): void {
      disposed = true
      scheduler?.stop()
    },
  }
}
