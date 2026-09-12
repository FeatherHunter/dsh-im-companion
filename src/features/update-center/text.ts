/** update-center 文案层（DOM-free）：自动检查档位 + 下次检查 / 最近检查的相对时间。
 * 给不出准确时间就说「暂不可知」，不编造；时间计算只吃调用方传进来的 now（可测）。 */
export const INTERVALS: { hours: number; label: string }[] = [
  { hours: 6, label: '6 小时' }, { hours: 12, label: '12 小时' },
  { hours: 24, label: '24 小时（默认）' }, { hours: 168, label: '每周' },
]
export function intervalLabel(hours: number): string {
  return INTERVALS.filter((i) => i.hours === hours)[0]?.label ?? '24 小时（默认）'
}
export function nextCheckText(nextCheckAt: number | null, now: number): string {
  if (nextCheckAt === null) return '暂不可知'
  const ms = nextCheckAt - now
  /* 剩余不足 30 秒不再四舍五入成「0 分钟后」（宿主首查排在启动后 60 秒，刷新页面常撞进这个窗口）。 */
  if (ms <= 30000) return '马上'
  const min = Math.round(ms / 60000)
  if (min < 60) return min + ' 分钟后'
  const hours = Math.round(min / 60)
  if (hours < 48) return hours + ' 小时后'
  return Math.round(hours / 24) + ' 天后'
}
export function lastCheckText(at: number | null, now: number): string {
  if (at === null) return '尚未检查'
  const ago = Math.max(0, now - at)
  if (ago < 60000) return '刚刚'
  const min = Math.floor(ago / 60000)
  if (min < 60) return min + ' 分钟前'
  const hours = Math.floor(min / 60)
  if (hours < 24) return hours + ' 小时前'
  return Math.floor(hours / 24) + ' 天前'
}
