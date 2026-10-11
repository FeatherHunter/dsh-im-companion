/** 更新系统宿主侧（T7 #90 接线 → #99 升 0.2.0 大幅解耦 → T5 #110 升 0.9.0 接第四电话 → M5 删调度器）。
 *
 * 本模块现在只做两件事，其余全归更新包：
 * ① 按包真身调 `createHostUpdate`，把 `update.handlers` 的 4 个键交给 `src/host/rpc.ts` 的端点表；
 * ② 本仓 `RpcResult` 信封：成功把包载荷 `{ok,snapshot,manual,receipt}` **原样**放进 `value`
 *    （字段名一个不改）；包失败（`{ok:false,error,errorKind,diag?}`）走本仓失败通道，
 *    原因码**原样透传**（包 README §5.2 冻结了这组码，本仓不自造第二套词表）。
 *
 * ── M5 删掉了什么（T5 #110 单一切片，一次删光）─────────────────────────────
 * 自建自动检查调度器整体删除：`update-schedule.ts`（171 行）＋本文件内装配层
 * （`createUpdateScheduler/autoState/runCheck/autoCheckView/sync/start/dispose` 定时器部分）。
 * 包无 host 侧定时调度（T2 U3），面板只剩包的挂载自查（entry autoCheck mount）＋用户手动检查。
 * `meta.json update 段`本身保留（用户偏好不丢，读写仍走 `meta.get`／`meta.update.set`），
 * 但写后不再重排定时器（`rpc.ts` 的 `sync()` 调用一并清理）；回包不再注入 `autoCheck` 运行期状态。
 *
 * ── #99 删掉了什么（0.2.0 原生接管，别再长回来）─────────────────────────────
 * 0.1.x 认「插件装在哪、跑的是哪版」的唯一手段是 `containingPackage(import.meta.url, 目标包名)`——
 * 起点是**更新包自己所在的目录**，按版本号装进 profile 后目标包是它的兄弟目录 ⇒ 必然 `unknown-profile`。
 * 当时我们为此自写了 `update-reader.ts`（194 行）与 `update-paths.ts`（92 行），
 * 再用 `readerOverrides.{runningVersion,profileDir,readInstalled}` 注入。
 * **0.2.0 起包自己按包名解析目标包**，使用范围目录由实装路径反推，安装指纹与合法性判定都在包内。
 * ⇒ 两份自持实现整体删除，装配只留 `{ ctx, logCtx }` 两个参数（README §2 第 2 步的原样接线）。
 * 唯一保留的注入是 `readerOverrides.homeDir`：它是**取值**不是实现（本仓 `dshHome` 可被插件配置覆盖，
 * 而包的默认值只看 `DSH_HOME` 环境变量与家目录），传它才能保证更新落盘与本仓 `meta.json` 同源。
 */
import { createHostUpdate } from 'dsh-plugin-update'
import type { RpcResult } from './rpc.js'

export const UPDATE_PLUGIN_ID = 'dsh-im-companion'
/** 电话名前缀：包冻结 `buildPhoneNames` 的拼法为 `<前缀>.<动作>`，故前缀只能是单段（T4 §3.7）。 */
export const UPDATE_PHONE_PREFIX = 'imc'
/** 目标包名：要检查/安装更新的那个包就是本插件自己（包按它反推使用范围目录）。 */
export const TARGET_PACKAGE_NAME = 'dsh-im-companion'
/** 端点名（= 电话名，票面定死）：`rpc.ts` 的 case 标签必须与它逐字一致；verify 断言包给的电话名等于它。 */
export const UPDATE_ENDPOINTS = ['imc.updateStatus', 'imc.updateCheck', 'imc.updateInstall', 'imc.updateChangelog'] as const

export interface UpdateBridgeLogger {
  info?(message: string): void
  warn?(message: string): void
}

/** 包的事件日志口（README §6.11：按插件标识过滤 `host.call` / `host.call.fail` / `update.install.exec`）。
 *  只做形状适配——包调 `fire(level, event, fields)`，本仓 logger 只有 info/warn；`fields` 是包定义的脱敏字段。 */
export interface UpdateLogContext {
  fire(level: string, event: string, fields: Record<string, unknown>): void
}

export interface UpdateHostOptions {
  ctx: unknown
  /** 本仓家目录（`config.dshHome` → `DSH_HOME` → `~/.dsh`）。作为**取值**交给包，保证两侧落盘同源。 */
  dshHome: string
  logger?: UpdateBridgeLogger
  /** 事件日志口；缺省由 `logger` 拼一个（warn/error 走 warn，其余走 info）。 */
  logCtx?: UpdateLogContext
  /** 测试/门禁缝：透传给包的 readerOverrides（仅取值，不含任何解析逻辑）。 */
  readerOverrides?: Record<string, unknown>
}

export interface UpdateHostBridge {
  handlers: Record<string, (payload?: unknown) => Promise<unknown>>
  reply(pkgReply: unknown): RpcResult
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? input as Record<string, unknown> : null
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
  const packageHost = createHostUpdate(
    {
      ctx: options.ctx,
      logCtx: typeof options.logCtx?.fire === 'function' ? options.logCtx : defaultLogContext(logger),
      readerOverrides: { homeDir: options.dshHome, ...options.readerOverrides },
    },
    { pluginId: UPDATE_PLUGIN_ID, prefix: UPDATE_PHONE_PREFIX, targetPackageName: TARGET_PACKAGE_NAME },
  )
  const phone = packageHost.phoneNames

  // 四个端点按包自己拼的电话名建表（不另拼字符串）；键名即端点名，`rpc.ts` 的 case 逐字对齐。
  // 四通全直通（version 由调用方给，包内做 tarball 取数；缺 version 时包回失败码，不抛）。
  const handlers: Record<string, (payload?: unknown) => Promise<unknown>> = {
    [phone.updateStatus]: (payload?: unknown) => packageHost.handlers[phone.updateStatus](asRecord(payload) ?? {}),
    [phone.updateCheck]: (payload?: unknown) => packageHost.handlers[phone.updateCheck](asRecord(payload) ?? {}),
    [phone.updateInstall]: (payload?: unknown) => packageHost.handlers[phone.updateInstall](asRecord(payload) ?? {}),
    [phone.updateChangelog]: (payload?: unknown) => packageHost.handlers[phone.updateChangelog](asRecord(payload) ?? {}),
  }

  return {
    handlers,
    /** 把包的回包翻成本仓 `RpcResult` 信封；成功载荷原样进 `value`（M5 起不再注入 autoCheck）。 */
    reply(pkgReply: unknown): RpcResult {
      const row = asRecord(pkgReply)
      if (row?.ok === true) return { ok: true, value: { ...row } }
      // 原因码原样透传（包 README §5.2 的冻结词表，不再维护第二份）。
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
  }
}
