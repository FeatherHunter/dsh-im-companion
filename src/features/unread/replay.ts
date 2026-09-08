/** V2 状态重演（纯函数 #55）：磁盘真相 + 持久候选 → red/blue/yellow/none，完全不看绿点当前状态。
 * 优先级（与 flags.ts 真相路径同序，候选只在非红非蓝非 approval 时介入）：
 * 402/aborted/error → 红（T4 真相红压黄 verdict，本票不推翻）；
 * approval → 黄（等你选择；P1 永不产红）；
 * open → 蓝（执行中）；
 * 候选（notifyAt 非空且 (seenAt??0) < notifyAt）→ 黄：completed/transient/空/其他未知（PM 裁定未知 kind 兜底黄；空=解码缺失但官方挂过点，点证据胜）；
 * 无候选 → completed/transient/空=平静，其他未知=红（与 live 真相路径一致）；
 * 注：error 有候选仍红（PM 未知 kind 问的已知集之外）；approval 与候选叠加仍黄（同色）。 */
import { classifyKind } from '../../client/data/session-kind'

export type ReplayFlag = 'red' | 'blue' | 'yellow' | 'none'
export type ReplayRedReason = 'forbidden402' | 'aborted' | 'error' | 'unknown-default'
export type ReplayYellowSrc = 'approval-wait' | 'unread'

export interface ReplayInput {
  open: boolean
  kind: string
  approval: boolean
  seenAt: number | null
  notifyAt: number | null
}

export interface ReplayOut {
  flag: ReplayFlag
  redReason?: ReplayRedReason
  yellowSrc?: ReplayYellowSrc
  tip: string
}

function numOrZero(v: number | null): number {
  try {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

export function replaySession(input: ReplayInput): ReplayOut {
  try {
    const cls = classifyKind(input.kind)
    if (cls.is402) return { flag: 'red', redReason: 'forbidden402', tip: '请求被拒需处理' }
    if (cls.isAborted) return { flag: 'red', redReason: 'aborted', tip: '已中止需处理' }
    if (cls.isError) return { flag: 'red', redReason: 'error', tip: '异常收尾需确认' }
    if (input.approval === true) return { flag: 'yellow', yellowSrc: 'approval-wait', tip: '待确认 · 等你选择' }
    if (input.open === true) return { flag: 'blue', tip: '执行中' }
    const candidate = input.notifyAt !== null && numOrZero(input.seenAt) < numOrZero(input.notifyAt)
    if (candidate) return { flag: 'yellow', yellowSrc: 'unread', tip: '待看' }
    if (cls.isDoneKind || cls.isEmpty) return { flag: 'none', tip: '平静' }
    return { flag: 'red', redReason: 'unknown-default', tip: '未知收尾需确认' }
  } catch {
    return { flag: 'none', tip: '平静' }
  }
}
