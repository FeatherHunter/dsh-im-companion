/** 日志出口（T9 #123）：`dsh-log/client` 的薄封装——**客户端只入队，宿主是唯一落盘者**。
 *
 * 桥：`host.call(电话名, 参数)` → 自有桥（channel `'/im-companion'` → `/api/im-companion` 信封），
 * 宿主侧 `src/index.ts` 把 dsh-log 的电话并进同一张注册表；电话名与入参形状全归包，本仓不拼字符串。
 *
 * 三个必须知道的点（踩过就别再踩）：
 * ① 只能 import `dsh-log/client`（`/host`、`/node` 会把 `node:fs` 拖进浏览器 bundle）；
 * ② **resident 事件不要套 `if (isEnabled('info'))`**——类型只声明一参、运行期认常驻集合，
 *    套了外层守卫等于自己把「开关关着也要落盘」的事件挡掉；高频 `debug` 明细才用 `logOn('debug')`；
 * ③ 日志绝不影响功能：建实例/写行/冲刷全部 try/catch 吞掉。
 */
import { createClientLog, type ClientLog } from 'dsh-log/client'
import type { RpcCall } from './data/fleet-api'
import { LOG_EVENTS, LOG_EVENT_LIST, LOG_PLUGIN_ID } from '../log-events'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

let log: ClientLog | null = null

function safeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

/** 装配时接上桥（`rpc` 为 null 时只记本地、不转发）。 */
export function initLog(rpc: RpcCall | null): void {
  try {
    const host = rpc
      ? {
        call: async (name: string, args?: unknown): Promise<unknown> => {
          const raw = await rpc('/im-companion', name, (args ?? {}) as Record<string, unknown>, new AbortController().signal)
          /* 解本仓信封：桥回 `{ok,value}`，电话原始返回值交回给包（包侧按自己的形状读）。 */
          const env = raw as { ok?: boolean; value?: unknown } | null
          return env && env.ok === true && env.value !== undefined ? env.value : raw
        },
      }
      : null
    log = createClientLog({ host, storage: safeStorage() }, { pluginId: LOG_PLUGIN_ID, prefix: LOG_PLUGIN_ID, eventList: LOG_EVENT_LIST })
    log.log('info', 'client.log.init', { ok: true, reason: '' })
  } catch (e) {
    log = null
    /* 建不起来也要留痕：这里只能走包外的路（本实例已经不可用），交给宿主 logger 的面板错误面。 */
    void e
  }
}

/** 记一行。resident / error / warn 直接记；高频 debug 明细先 `logOn('debug')` 再记。 */
export function logLine(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  try {
    log?.log(level, event, fields ?? {})
    /* resident 行立刻冲刷：客户端批量默认约 1s，宿主侧同一操作的行会插到前面去，时间线看着是错的（真机日志实证）。 */
    if (level !== 'debug' && LOG_EVENTS[event]?.kind === 'resident') log?.flush()
  } catch { /* 静默 */ }
}

/** 此刻该级别是否记（只给非 resident 的高频明细用）。 */
export function logOn(level: LogLevel): boolean {
  try { return log?.isEnabled(level) === true } catch { return false }
}

/** 立刻把队列交给宿主（卸载 / 页面隐藏时调）。 */
export function flushLogs(): void {
  try { log?.flush() } catch { /* 静默 */ }
}

/** 以宿主为准对账调试开关（装配时调一次）。 */
export function reconcileLogSwitch(): void {
  try { void log?.reconcileLogSwitch() } catch { /* 静默 */ }
}

/** 客户端丢弃计数（诊断用；宿主侧另有一份）。 */
export function droppedLogs(): number {
  try { return log?.getDroppedCount() ?? 0 } catch { return 0 }
}
