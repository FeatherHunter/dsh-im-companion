/** FleetRadar 矩阵数据层（DOM-free，可 node 直测）：家 × 9 渠道稠密表（verdict #10 = A 变体）。
 * 行：家（home.id 稳定身份；墓碑家过滤；空家沉底，组内健康 rank → 按名）；
 * 列：CHANNEL_ORDER 固定 9 序；格：该家该渠道的助理集合（助理渠道经 channelOf 判定：
 * 未绑定无渠道、不进列、计入待绑；孤儿留历史渠道、进列标失联；同格多助理合并健康）。
 * 健康只读机器人快照（按 channel+botId 查，快照缺席按离线、stale 升待确认）；绑定是助理轴，
 * 连通是机器人轴——汇总列两轴分开讲（健康词 ＋ N助理，M已绑，K待绑，J失联），不复读。
 * 钻取 key 与 DetailDrawer 同源（抽屉仍按工作区 path 查）：行 key = home.id，drillKey = home.path。
 * 旧 buildMatrix（按 Agent 分组）保留作降级 fallback：家表不可用（旧宿主/桥抖动）时雷达不空白。 */
import { CHANNEL_ORDER, HEALTH_LABELS, OPEN_DRAWER_EVENT, channelLabel, type HealthKind } from '../../client/data/config'
import { buildModel, type AgentView } from '../../client/data/model'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { BotSnap } from '../../client/data/fleet-api'

export type CellHealth = HealthKind | 'empty' | 'orphan'

export interface MatrixCell {
  channel: string
  label: string
  botId: string
  health: CellHealth
  bound: boolean
  stale: boolean
  /** 同格助理数（>1 时格内挂“（N位）”注解，title 列全名）。 */
  count: number
  names: string[]
  /** 同格助理明细（悬浮 popover 一行一位；旧 fallback 格为空）。 */
  mates: CellMate[]
}

/** 悬浮行：该助理在本格的快照状态（orphan 即失联；stale 即数据过期）。
 * id＋avatar 专供悬浮头像：有 `img:` 标记才取图，否则回落首字色块（与行头同语言）。 */
export interface CellMate {
  id: string
  name: string
  avatar: string | null
  botId: string
  health: CellHealth
  stale: boolean
}

const AVATAR_COLORS = ['#3964fe', '#07c160', '#e8890c', '#8e44ad', '#12b7f5', '#d92d20', '#00b386', '#5865f2']

/** 头像底色（纯函数：同 key 同色；行头与悬浮头像同源）。 */
export function avatarColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export interface MatrixRow {
  key: string
  /** 钻取 key（home.path）：抽屉按工作区 path 查，行身份 key = home.id，两者分开。 */
  drillKey: string
  name: string
  base: string
  workspace: string
  bound: boolean
  status: HealthKind
  botCount: number
  assistantCount: number
  boundCount: number
  unboundCount: number
  orphanCount: number
  cells: MatrixCell[]
}

export interface MatrixModel {
  rows: MatrixRow[]
  cols: { id: string; label: string }[]
  /** 有行但整列无 bot 的渠道（窄屏可折叠的候选，不自动隐藏）。 */
  emptyColumns: string[]
  counts: { agents: number; channels: number; bots: number; assistants?: number }
}

export type Lang = 'zh' | 'en'

const EN_CHANNELS: Record<string, string> = {
  feishu: 'Feishu', weixin: 'WeChat', qq: 'QQ', slack: 'Slack', telegram: 'Telegram',
  discord: 'Discord', whatsapp: 'WhatsApp', dingtalk: 'DingTalk', wecom: 'WeCom',
}

/** 渠道列名（双语）：中文走共享 channelLabel，英文走本表（共享层只有中文名，不碰共享）。 */
export function matrixChannelLabel(id: string, lang: Lang): string {
  return lang === 'en' ? (EN_CHANNELS[id] ?? id) : channelLabel(id)
}

const EN_HEALTH: Record<HealthKind, string> = { online: 'Online', warn: 'Pending', offline: 'Offline' }

/** 格健康词（双语）：empty 中文“未接入”/英文“Not connected”；orphan 中文“失联”/英文“Orphaned”。 */
export function healthLabel(health: CellHealth, lang: Lang): string {
  if (health === 'empty') return lang === 'en' ? 'Not connected' : '未接入'
  if (health === 'orphan') return lang === 'en' ? 'Orphaned' : '失联'
  return lang === 'en' ? EN_HEALTH[health] : HEALTH_LABELS[health]
}

export interface MatrixStrings {
  title: string
  close: string
  refresh: string
  loading: string
  emptyTitle: string
  emptySub: string
  agentCol: string
  summaryCol: string
  drillHint: string
  staleNote: string
}

const STRINGS: Record<Lang, MatrixStrings> = {
  zh: {
    title: '舰队雷达', close: '关闭', refresh: '刷新', loading: '正在加载',
    emptyTitle: '还没有家', emptySub: '新建家并为助理绑定机器人后，这里会出现矩阵',
    agentCol: '家 ＼ 渠道', summaryCol: '汇总', drillHint: '点击钻取详情', staleNote: '（数据过期）',
  },
  en: {
    title: 'Fleet Radar', close: 'Close', refresh: 'Refresh', loading: 'Loading',
    emptyTitle: 'No homes yet', emptySub: 'Create a home and bind a bot for an assistant, and the matrix will appear here',
    agentCol: 'Home ＼ Channel', summaryCol: 'Summary', drillHint: 'Click for details', staleNote: '(stale)',
  },
}

export function strings(lang: Lang): MatrixStrings {
  return STRINGS[lang]
}

/** 语言归一（纯函数，可测）：DSH 只发 zh/en（zh-CN 归 zh）；空/未知按中文兜底（插件历史 UI 全中文）。 */
export function langOf(tag: string | null | undefined): Lang {
  const t = String(tag ?? '').toLowerCase()
  if (!t || t.startsWith('zh')) return 'zh'
  return 'en'
}

/** 头部计数之一（可见）：分组形状（家 × channel）与机器人数是两个平级事实，
 * 各自成节点、由 .fleet-radar-meta 的 flex gap 分隔 ⇒ 拆成两行文案函数，不再拼中点。 */
export function metaGridLine(homes: number, channels: number, lang: Lang): string {
  return lang === 'en' ? homes + ' homes × ' + channels + ' channels' : homes + ' 个家 × ' + channels + ' 渠道'
}

export function metaBotsLine(bots: number, lang: Lang): string {
  return lang === 'en' ? bots + ' bots' : bots + ' 个机器人'
}

/** 头部计数之二（可见）：助理与机器人双计数（家→助理→机器人三级，一行讲清两级人数）。
 * 并列项之间用**逗号**，不用中点（owner 2026-10-17：`·` 在渲染文案里整体退役，见 separator-retired 门禁）。 */
export function metaCrewLine(assistants: number, bots: number, lang: Lang): string {
  return lang === 'en'
    ? assistants + ' assistants, ' + bots + ' bots'
    : assistants + '助理，' + bots + '机器人'
}

/** 汇总列人数成分（可见注角）：零项省略；空家（0 助理）回空串（调用方只剩“未接入”）。 */
export function rowCrewNote(row: Pick<MatrixRow, 'assistantCount' | 'boundCount' | 'unboundCount' | 'orphanCount'>, lang: Lang): string {
  if (!row.assistantCount) return ''
  const parts: string[] = []
  if (lang === 'en') {
    parts.push(row.assistantCount + ' assistants')
    if (row.boundCount) parts.push(row.boundCount + ' bound')
    if (row.unboundCount) parts.push(row.unboundCount + ' pending')
    if (row.orphanCount) parts.push(row.orphanCount + ' orphaned')
  } else {
    parts.push(row.assistantCount + '助理')
    if (row.boundCount) parts.push(row.boundCount + '已绑')
    if (row.unboundCount) parts.push(row.unboundCount + '待绑')
    if (row.orphanCount) parts.push(row.orphanCount + '失联')
  }
  return parts.join(lang === 'en' ? ', ' : '，')
}

export function footAllLine(channels: number, lang: Lang): string {
  return lang === 'en' ? 'All ' + channels + ' channels connected' : channels + ' 渠道均有接入'
}

export function footSomeLine(names: string[], lang: Lang): string {
  return names.join(lang === 'en' ? ', ' : '、') + (lang === 'en' ? ' not connected' : ' 暂无接入')
}

/** LOGO 底色（纯数据，可测）：dsh-im 设置页同款——品牌色圆角底 + 白 glyph；
 * 飞书/企微 glyph 自带多色，只配白底衬；其余 7 单色 glyph 经 view/styles 洗白
 * （共享 icons 仍是品牌 fill 以保详情面板透明底可读，上游 currentColor 口径由本特性 CSS 落地）。 */
export const LOGO_TILE_BG: Record<string, string> = {
  feishu: '#ffffff', weixin: '#07c160', qq: '#12b7f5', slack: '#4a154b', telegram: '#2aabee',
  discord: '#5865f2', whatsapp: '#25d366', dingtalk: '#0091ff', wecom: '#ffffff',
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

/** 状态文案（DOM-free，可测）：**只喂不可见处**（title 等），分隔走中文逗号／英文逗号+空格。
 * 可见格与汇总列改用 statusParts 拆成两个节点，由容器 flex gap 分隔（分隔靠结构不靠符号）。 */
export function statusText(status: HealthKind, bound: boolean, lang: Lang = 'zh'): string {
  return healthLabel(status, lang) + (bound ? '' : lang === 'en' ? ', Unbound' : '，未绑定')
}

/** 可见状态两段：健康词 + 未绑定注解（绑定时注解为空串，调用方按需省掉节点）。 */
export function statusParts(status: HealthKind, bound: boolean, lang: Lang = 'zh'): { health: string; note: string } {
  return { health: healthLabel(status, lang), note: bound ? '' : lang === 'en' ? 'Unbound' : '未绑定' }
}

export function cellFor(view: AgentView, snaps: BotSnap[], channel: string): MatrixCell {
  const bound = view.workspace !== ''
  const label = channelLabel(channel)
  const ch = view.channels.find((c) => c.id === channel)
  const ref = view.bots.find((b) => b.channel === channel)
  if (!ch || !ref) return { channel, label, botId: '', health: 'empty', bound, stale: false, count: 0, names: [], mates: [] }
  const snap = snaps.find((s) => s.channel === ref.channel && s.botId === ref.botId)
  return { channel, label: ch.label, botId: ref.botId, health: ch.status, bound, stale: snap?.stale === true, count: 1, names: [], mates: [] }
}

export function buildMatrix(bots: BotSnap[], meta: AgentMetaDoc, lang: Lang = 'zh'): MatrixModel {
  const fleet = buildModel(bots, meta, 'agent', '')
  const cols = CHANNEL_ORDER.map((id) => ({ id, label: matrixChannelLabel(id, lang) }))
  const rows = fleet.agents.map((v) => ({
    key: v.key,
    drillKey: v.workspace || v.key,
    name: v.name,
    base: v.base,
    workspace: v.workspace,
    bound: v.workspace !== '',
    status: v.status,
    botCount: v.bots.length,
    assistantCount: v.bots.length,
    boundCount: v.bots.length,
    unboundCount: 0,
    orphanCount: 0,
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

/** 钻取事件载荷（view 层按此派发，DetailDrawer 抽屉是真消费者）。 */
export function drillEventFor(key: string): { name: string; detail: { key: string } } {
  return { name: OPEN_DRAWER_EVENT, detail: { key } }
}
