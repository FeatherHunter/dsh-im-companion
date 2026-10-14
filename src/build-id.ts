/** 构建身份（#130）：宿主与客户端**同形**的一行标识 —— `<版本>@<产物写入时刻>`。
 *
 * 为什么必须有它：`lib/` 是 gitignore 的构建产物，dev 期一个会话能重打好几版（#130 取证：02:45:05
 * 一份已被验收的 lib/client.js 被另一并发会话的 build 覆写），而插件版本号在两次重打之间**不变**
 * ⇒ 事后只读日志（不再 stat 库内文件）就答不出「这条到底出自哪份产物」。
 * 把「版本」与「产物写入时刻」绑进同一字段、且时刻与 `lib/*.js` 的 mtime 同口径 ⇒ 日志自身即可对齐产物。
 *
 * 两侧取值来源不同（宿主＝运行中产物的 mtime，客户端＝打包期注入的常量），**格式必须一致**：
 * tools/verify/log-truth.ts 钉住格式与两侧接线，别各写一套。
 * 本模块必须纯净（无 node / 无 DOM 依赖）：它同时进宿主产物与浏览器 bundle。
 */

/** 毫秒截掉（`2026-10-15T04:01:41Z`）：日志里够用，且与 lib/ 文件 mtime 肉眼可比。 */
const MS_TAIL = /\.\d{3}Z$/

/** 时刻 → `YYYY-MM-DDTHH:mm:ssZ`（UTC）；取不到回空串（不编造）。 */
export function isoSeconds(at: number | string): string {
  try {
    const ms = typeof at === 'number' ? at : Date.parse(String(at))
    if (!Number.isFinite(ms)) return ''
    return new Date(ms).toISOString().replace(MS_TAIL, 'Z')
  } catch {
    return ''
  }
}

/** `<版本>@<时刻>`；任一段取不到就只留另一段，两段都取不到回空串（宁缺毋滥，绝不编造）。 */
export function formatBuildId(version: unknown, at: number | string): string {
  const parts: string[] = []
  const v = typeof version === 'string' ? version.trim() : ''
  if (v) parts.push(v)
  const s = isoSeconds(at)
  if (s) parts.push(s)
  return parts.join('@')
}
