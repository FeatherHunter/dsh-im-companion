/** 日志系统宿主侧（T9 #123）：自建 dsh-log 库 + 电话注册表。
 *
 * 落点照生态惯例（dsh-opencode-palette / dsh-prompt 同构，磁盘上有实物可对）：
 *   <DSH_HOME>/logs/dsh-im-companion/YYYY-MM-DD.log
 *   开关 <DSH_HOME>/logs/log-switch-dsh-im-companion.json（宿主持有，客户端经电话对账）
 *
 * 三条硬约束（都是别人拿真机噪声换来的，别改回去）：
 * ① 不传 `ctx.get('fs')`：DSH 的 fs 是沙箱实现（写用户家目录会被 FS_SANDBOX_DENIED 拒），且缺 mkdir/unlink
 *    ⇒ 直接用 `dsh-log/node` 的 `createNodeFileService()` / `createNodeTimer()`（零 ctx 依赖）。
 * ② 装配时先 mkdir 日志目录，再用 store 自己的 API 物化开关文件——否则每次启动读开关都记一条误报。
 * ③ `store.log()` 在「同一日志目录已有别的活跃写者」时会抛中文错（热重载让位窗口）⇒ 出口一律 try/catch。
 * 日志能力不许拖垮插件：建库失败一律降级 no-op（返回 null），调用方继续照常跑。
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHostLog, registerHostLogPhones, type HostLog, type PhoneRegistry } from 'dsh-log/host'
import { createNodeFileService, createNodeTimer } from 'dsh-log/node'
import { LOG_EVENT_LIST, LOG_PLUGIN_ID } from '../log-events.js'
import { describeCall } from './log-sites.js'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** 电话注册表：dsh-log 只要求 `has` + `set` 两个方法（Map 天然满足）。 */
export type LogPhoneRegistry = Map<string, (args: never) => Promise<unknown>>

export interface HostLogHandle {
  /** 日志目录绝对路径（装配日志与排查提示都报它）。 */
  dir: string
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void
  registerPhones(registry: LogPhoneRegistry): void
  /** 等真的落盘（杀进程/热重载前用）。 */
  synced(): Promise<void>
  dropped(): number
}

/** 建库；任何失败都返回 null（调用方据此降级为「无日志」而不是崩）。 */
export async function createHostLogFor(dshHome: string): Promise<HostLogHandle | null> {
  const cacheDir = join(dshHome, 'logs')
  const dir = join(cacheDir, LOG_PLUGIN_ID)
  try {
    const hostLog: HostLog = createHostLog(
      { fs: createNodeFileService(), timer: createNodeTimer(), getCacheDir: () => cacheDir, DEFAULT_CWD: process.cwd() },
      {
        pluginId: LOG_PLUGIN_ID,
        prefix: LOG_PLUGIN_ID,
        logDirName: LOG_PLUGIN_ID,
        switchFileName: 'log-switch-' + LOG_PLUGIN_ID + '.json',
        eventList: LOG_EVENT_LIST,
      },
    )
    const store = hostLog.store
    await mkdir(dir, { recursive: true })
    /* 先读回磁盘上的开关（保住用户上次的选择），再写回同一值把开关文件物化——
     * 直接 setSwitch(getSwitchState().enabled) 会把内存默认值（false）当成真相，每次启动静默关掉调试开关。 */
    const state = await store.loadSwitch()
    await store.setSwitch(state.enabled)
    return {
      dir,
      log(level, event, fields) {
        try { store.log(level, event, fields ?? {}) } catch { /* 目录被占/写盘冲突：日志绝不外泄到功能面 */ }
      },
      registerPhones(registry) { registerHostLogPhones(registry as PhoneRegistry, hostLog) },
      synced: () => store.synced(),
      dropped: () => store.getDroppedCount(),
    }
  } catch {
    return null
  }
}

/** rpc 分发器的日志包装（放在这里，免得 `src/host/rpc.ts` 顶到 300 行红线）：
 *  逐调用一条——成功 `debug`（高频，默认不落盘），失败 `error`（恒落盘，带原因码）。 */
export function withRpcLog<P, T extends { ok: boolean; error?: { code?: string } }>(
  dispatch: (endpoint: string, payload: P, signal?: AbortSignal | null) => Promise<T>,
  log?: () => HostLogHandle | null,
): (endpoint: string, payload: P, signal?: AbortSignal | null) => Promise<T> {
  return async (endpoint, payload, signal) => {
    const started = Date.now()
    const result = await dispatch(endpoint, payload, signal)
    const handle = log?.() ?? null
    if (handle) {
      /* 语义行（建家/绑定/搬家/删除/更新结果…）：成功 info、失败 error，带定位字段与错误原文。 */
      const detail = describeCall(endpoint, payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}, result)
      if (detail) handle.log(detail.level, detail.event, detail.fields)
      const code = result.ok ? '' : String(result.error?.code ?? '')
      handle.log(result.ok ? 'debug' : 'error', result.ok ? 'host.rpc.call' : 'host.rpc.fail',
        { method: endpoint, ok: result.ok, latencyMs: Date.now() - started, code })
    }
    return result
  }
}
