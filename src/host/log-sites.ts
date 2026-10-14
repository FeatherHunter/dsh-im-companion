/** 语义日志映射（T9 #123）：把「端点 + 入参 + 结果」翻成一条**有语义**的日志行。
 *
 * 为什么放在这里而不是逐个 case 里加行：`src/host/rpc.ts` 已贴着 300 行红线，且逐 case 加行会把
 * 日志散进 34 个分支里。本文件是**纯函数**（不碰 IO、不抛、无副作用），可被
 * `tools/verify/log-pipeline.ts` 逐端点断言——「埋了点没进清单」「字段漂移」当场红。
 *
 * 读操作的逐次明细不在这里（那由 `withRpcLog` 的 `host.rpc.call` debug 行覆盖）；
 * 这里只记**语义事实**：谁建了/绑了/搬了/删了什么、成功还是失败、失败原因原文。
 * 更新系统的细节由包自己的事件口（`host.update.tap`）承载，这里只留一行结果。
 */
import type { LogLevel } from './log.js'

export interface LogLine {
  level: LogLevel
  event: string
  fields: Record<string, unknown>
}

interface RpcLike {
  ok: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** 改了哪些字段（`changed` 字段用）：入参里除 id 外的键，排序后逗号连接。 */
function changedKeys(p: Record<string, unknown>, skip: string[]): string {
  return Object.keys(p).filter((k) => !skip.includes(k)).sort().join(',')
}

/** 端点 → 语义行；返回 null 表示「这条端点没有语义行」（仍有 host.rpc.call 的 debug 明细）。 */
export function describeCall(endpoint: string, payload: Record<string, unknown>, result: RpcLike): LogLine | null {
  const p = rec(payload)
  const okFlag = result.ok === true
  const message = okFlag ? '' : str(result.error?.message ?? result.error?.code)
  const level: LogLevel = okFlag ? 'info' : 'error'
  const value = rec(result.value)
  const row = rec(value.assistant ?? value.home)
  const id = str(row.id ?? p.id)

  switch (endpoint) {
    case 'home.create':
      return { level, event: 'home.create', fields: { homeId: id, workspaceId: str(p.workspaceId ?? row.workspaceId), name: str(row.name ?? p.name), ok: okFlag, message } }
    case 'home.update':
      return { level, event: 'home.update', fields: { homeId: id, changed: changedKeys(p, ['id']), ok: okFlag, message } }
    case 'home.seed': {
      const summary = rec(value.summary ?? value)
      return { level, event: 'home.seed', fields: { created: num(summary.created), adopted: num(summary.adopted), skipped: num(summary.skipped), ok: okFlag, message } }
    }
    case 'assistant.create':
    case 'assistant.createUnbound':
      return { level, event: 'assistant.create', fields: { assistantId: id, homeId: str(p.homeId ?? row.homeId), botId: str(p.botId ?? row.botId), mode: endpoint === 'assistant.createUnbound' ? 'unbound' : 'bound', ok: okFlag, message } }
    case 'assistant.bind':
      return { level, event: 'assistant.bind', fields: { assistantId: id, homeId: str(p.homeId ?? row.homeId), botId: str(p.botId ?? row.botId), ok: okFlag, message } }
    case 'assistant.update':
      return { level, event: 'assistant.update', fields: { assistantId: id, changed: changedKeys(p, ['id']), ok: okFlag, message } }
    case 'assistant.remove':
      return { level, event: 'assistant.remove', fields: { assistantId: id, ok: okFlag, message } }
    case 'assistant.move':
      return { level, event: 'assistant.move', fields: { assistantId: id, fromHomeId: str(p.fromHomeId ?? row.homeId), toHomeId: str(p.targetHomeId ?? row.homeId), botFollowed: p.followBot === false ? false : true, ok: okFlag, message } }
    case 'assistant.unbind':
      return { level, event: 'assistant.unbind', fields: { assistantId: id, botId: str(row.botId ?? p.botId), reason: p.orphan === true ? 'orphan' : 'user', ok: okFlag, message } }
    case 'meta.rename':
    case 'meta.avatar.set':
    case 'meta.avatar.clear':
    case 'meta.local.add':
    case 'meta.local.remove':
    case 'meta.local.rename':
    case 'meta.local.workspace':
    case 'meta.preset.set':
    case 'meta.ctx.set':
    case 'meta.welcomed.set':
    case 'meta.update.set':
    case 'meta.motion.set':
      return { level: okFlag ? 'debug' : 'error', event: 'meta.write', fields: { op: endpoint, key: str(p.key ?? p.name ?? p.from), ok: okFlag, message } }
    case 'fs.list':
      return { level: okFlag ? 'debug' : 'error', event: 'fs.list', fields: { dir: str(p.dir), count: num(rec(value).count ?? (Array.isArray(value.entries) ? value.entries.length : 0)), ok: okFlag, message } }
    case 'imc.updateStatus':
      return { level: 'debug', event: 'update.status', fields: { ok: okFlag, phase: str(rec(value.snapshot).phase ?? value.phase) } }
    case 'imc.updateCheck': {
      const snap = rec(value.snapshot)
      return { level, event: 'update.check', fields: { ok: okFlag, current: str(snap.runningVersion ?? snap.installedVersion ?? snap.current), latest: str(snap.latestVersion ?? snap.latest), message } }
    }
    case 'imc.updateInstall': {
      const snap = rec(value.snapshot)
      return { level, event: 'update.install', fields: { ok: okFlag, version: str(snap.latestVersion ?? snap.installedVersion ?? value.version), message } }
    }
    case 'imc.updateChangelog':
      return { level: 'debug', event: 'update.changelog', fields: { ok: okFlag, version: str(rec(value.snapshot).latestVersion ?? value.version) } }
    default:
      return null
  }
}
