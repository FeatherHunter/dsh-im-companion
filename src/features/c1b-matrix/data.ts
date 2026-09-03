/** C1b 矩阵数据层（DOM-free，可 node 直测）：Agent × 9 渠道稠密表（verdict #10 = A 变体）。
 * 行：buildModel 的 Agent 视图按（健康 在线>待确认>离线、未绑定沉底、组内按名）重排；
 * 列：CHANNEL_ORDER 固定 9 序；格：渠道 bot（健康 + 行级绑定），无 bot = 未接入。
 * 绑定取行级（workspace 是否为空）：真模型按工作区分组，归属某工作区即已绑定；
 * 未绑定 bot 自成一行（key 前缀 unbound:），本地空 Agent 无渠道。
 * 钻取 key 与 C1a 同源（buildDrawerModel 按同一 key 回查），点格即开抽屉。 */
import { CHANNEL_ORDER, HEALTH_LABELS, OPEN_DRAWER_EVENT, channelLabel, type HealthKind } from '../../client/data/config'
import { buildModel, type AgentView } from '../../client/data/model'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { BotSnap } from '../../client/data/fleet-api'

export type CellHealth = HealthKind | 'empty'

export interface MatrixCell {
  channel: string
  label: string
  botId: string
  health: CellHealth
  bound: boolean
  stale: boolean
}

export interface MatrixRow {
  key: string
  name: string
  base: string
  workspace: string
  bound: boolean
  status: HealthKind
  botCount: number
  cells: MatrixCell[]
}

export interface MatrixModel {
  rows: MatrixRow[]
  cols: { id: string; label: string }[]
  /** 有行但整列无 bot 的渠道（窄屏可折叠的候选，不自动隐藏）。 */
  emptyColumns: string[]
  counts: { agents: number; channels: number; bots: number }
}

const RANK: Record<HealthKind, number> = { online: 0, warn: 1, offline: 2 }

/** 行排序（锁定规格）：未绑定独立沉底 → 健康 rank → 按名（中文）。 */
export function compareRows(
  a: { status: HealthKind; bound: boolean; name: string },
  b: { status: HealthKind; bound: boolean; name: string },
): number {
  if (a.bound !== b.bound) return a.bound ? -1 : 1
  const d = RANK[a.status] - RANK[b.status]
  if (d !== 0) return d
  return a.name.localeCompare(b.name, 'zh')
}

/** 状态文案（DOM-free，可测）：健康 label + 未绑定后缀；汇总列与单元格共用，消除三重复。 */
export function statusText(status: HealthKind, bound: boolean): string {
  return HEALTH_LABELS[status] + (bound ? '' : '·未绑定')
}

export function cellFor(view: AgentView, snaps: BotSnap[], channel: string): MatrixCell {
  const bound = view.workspace !== ''
  const label = channelLabel(channel)
  const ch = view.channels.find((c) => c.id === channel)
  const ref = view.bots.find((b) => b.channel === channel)
  if (!ch || !ref) return { channel, label, botId: '', health: 'empty', bound, stale: false }
  const snap = snaps.find((s) => s.channel === ref.channel && s.botId === ref.botId)
  return { channel, label: ch.label, botId: ref.botId, health: ch.status, bound, stale: snap?.stale === true }
}

export function buildMatrix(bots: BotSnap[], meta: AgentMetaDoc): MatrixModel {
  const fleet = buildModel(bots, meta, 'agent', '')
  const cols = CHANNEL_ORDER.map((id) => ({ id, label: channelLabel(id) }))
  const rows = fleet.agents.map((v) => ({
    key: v.key,
    name: v.name,
    base: v.base,
    workspace: v.workspace,
    bound: v.workspace !== '',
    status: v.status,
    botCount: v.bots.length,
    cells: CHANNEL_ORDER.map((ch) => cellFor(v, bots, ch)),
  })).sort(compareRows)
  const emptyColumns = rows.length
    ? cols.filter((c) => rows.every((r) => {
      const cell = r.cells.find((x) => x.channel === c.id)
      return !cell || cell.health === 'empty'
    })).map((c) => c.id)
    : []
  return {
    rows,
    cols,
    emptyColumns,
    counts: { agents: rows.length, channels: cols.length, bots: rows.reduce((s, r) => s + r.botCount, 0) },
  }
}

/** 钻取事件载荷（view 层按此派发，C1a 抽屉是真消费者）。 */
export function drillEventFor(key: string): { name: string; detail: { key: string } } {
  return { name: OPEN_DRAWER_EVENT, detail: { key } }
}
