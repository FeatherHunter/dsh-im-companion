/** Star History 纯函数：按天聚合与增量追加，不含 IO。
 *
 * 移植自 dsh-mattpocock-skills-deck 的 scripts/star-history.mts（2026-10-21），行为零变化，
 * 只按本仓风格改写（无分号、单引号）。纯函数在这里，好处是门禁能直接断言聚合口径，
 * 不必起子进程、不必碰磁盘。
 *
 * 输入：starredAtList —— GitHub `Accept: application/vnd.github.star+json` 返回的 ISO 8601 时间串数组
 * 输出：{ date: 'YYYY-MM-DD', total: number, daily: number }[] 按 date 升序（total 为累计值）
 */
export interface StarDay {
  /** UTC 日历日，YYYY-MM-DD */
  date: string
  /** 到当天为止的累计星标数 */
  total: number
  /** 当天新增的星标数 */
  daily: number
}

/** 按 UTC 日聚合：同一天的多颗星合并成一条，日期升序，total 逐日累加。 */
export function aggregateByDay(starredAtList: string[]): StarDay[] {
  if (!Array.isArray(starredAtList) || starredAtList.length === 0) return []
  const dayCounts = new Map<string, number>()
  for (const iso of starredAtList) {
    if (typeof iso !== 'string' || !iso) continue
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) continue
    const key = d.toISOString().slice(0, 10) // YYYY-MM-DD UTC
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1)
  }
  const sortedDays = Array.from(dayCounts.keys()).sort()
  let running = 0
  return sortedDays.map((date) => {
    const daily = dayCounts.get(date)!
    running += daily
    return { date, total: running, daily }
  })
}

/** 零星日起点：首日前一天补 {total:0,daily:0}，两条曲线都从原点起画。
 *
 * 幂等（已有零星行直接返回）；空数组保持空。更新脚本在 aggregateByDay 之后调用，
 * 每日全量重拉会自动带上，落盘 JSON 永远带零星首行。
 */
export function withZeroStart(days: StarDay[]): StarDay[] {
  if (!Array.isArray(days) || days.length === 0) return []
  const first = days[0]
  if (first.total === 0 && first.daily === 0) return days
  const prev = new Date(first.date + 'T00:00:00Z')
  prev.setUTCDate(prev.getUTCDate() - 1)
  return [{ date: prev.toISOString().slice(0, 10), total: 0, daily: 0 }, ...days]
}

/** 合并「已落盘的历史」与「这次聚合到的增量」。
 *
 * 两种情形：
 *   ① 日期不重叠 —— 增量追加，total 重算。
 *   ② 日期有重叠 —— 说明来的是**全量回溯**（重新拉了整个 stargazers 列表），直接以它为准，
 *      否则同一天会被当成「又新增了一次」而重复计数。
 */
export function mergeHistory(
  existing: StarDay[] | null | undefined,
  nextAggregated: StarDay[] | null | undefined,
): StarDay[] {
  const map = new Map<string, number>()
  for (const row of [...(existing || []), ...(nextAggregated || [])]) {
    if (!row || typeof row.date !== 'string') continue
    // 以 daily 为准，total 稍后重算，故这里只记 daily
    const prev = map.get(row.date) || 0
    map.set(row.date, Math.max(prev, row.daily || 0))
  }
  if (nextAggregated && nextAggregated.length > 0 && existing && existing.length > 0) {
    const nextDates = new Set<string>(nextAggregated.map((r) => r.date))
    const hasOverlap = existing.some((r) => nextDates.has(r.date))
    if (hasOverlap) {
      // 全量回溯：nextAggregated 已是正确的全量聚合，直接返回它
      return nextAggregated.slice().sort((a, b) => a.date.localeCompare(b.date))
    }
  }
  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  let running = 0
  return sorted.map(([date, daily]) => {
    running += daily
    return { date, total: running, daily }
  })
}
