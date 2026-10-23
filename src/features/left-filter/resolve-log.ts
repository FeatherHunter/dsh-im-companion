/** 归属解析依据留痕（#154）：身份/标题/字面/未解析 各多少行 ⇒ 事后只看磁盘日志
 * 就能判定「这行为什么没绑上」。debug 级（调试开关关着不落盘）＋ 签名去重（同一结论不重复记）。
 * 事件沿用既有的 ui.action（area/action/ok/message），不新增清单项。 */
import { logLine, logOn } from '../../client/log'

let lastSig = ''

export function logResolveStats(sources: readonly string[]): void {
  const sig = sources.join(',')
  if (sig === lastSig) return
  lastSig = sig
  try {
    if (!logOn('debug')) return
    const c: Record<string, number> = {}
    for (const s of sources) c[s] = (c[s] ?? 0) + 1
    logLine('debug', 'ui.action', {
      area: 'left-filter',
      action: 'resolve-stats',
      ok: true,
      message: '工作区归属解析：按身份 ' + (c.id ?? 0) + ' 行 / 按标题 ' + (c.title ?? 0)
        + ' 行 / 按绑定字面 ' + (c.bot ?? 0) + ' 行 / 未解析 ' + (c.none ?? 0) + ' 行',
    })
  } catch {
    /* 日志失败忽略 */
  }
}
