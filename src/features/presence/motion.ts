/** presence 动效分级纯逻辑（E1 · 方向 A）：full → B1 原生呼吸（1.6s，不写 body）；
 * reduced → 实例数 > 20 自动降级（2.8s 慢呼吸）；static → 全停（手动开关 / 系统偏好）。
 * 阈值 20（verdict 口径，真机卡顿点校准前暂定）。手法字段已随去点化移除（2026-09-04）。 */

export type MotionLevel = 'full' | 'reduced' | 'static'

export interface MotionInput {
  count: number
  manualReduced: boolean
  sysReduced: boolean
}

export interface MotionResult {
  level: MotionLevel
  reason: string
}

/** 自动降级阈值：实例数 > 20 → reduced（verdict 口径）。 */
export const PRESENCE_THRESHOLD = 20

/** 分级决策（纯函数，唯一可带走逻辑；与原型 resolveMotion 同真值表）。 */
export function resolveMotion(s: MotionInput): MotionResult {
  if (s.manualReduced) return { level: 'static', reason: '手动减少动态开' }
  if (s.sysReduced) return { level: 'static', reason: '系统 prefers-reduced-motion' }
  if (s.count > PRESENCE_THRESHOLD) {
    return { level: 'reduced', reason: '实例数 ' + s.count + ' > ' + PRESENCE_THRESHOLD + ' 自动降级（2.8s 慢呼吸）' }
  }
  return { level: 'full', reason: '全动效（原生呼吸）' }
}

/** 读系统减动态偏好（非浏览器环境恒 false；调用方监听 change 事件重算）。 */
export function systemReduced(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
