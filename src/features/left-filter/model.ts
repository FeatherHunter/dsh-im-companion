/** left-filter 纯逻辑（可单测）：筛选三态 + 行数口径计数 + 绑定判定。
 * 无 DOM；视图只做“按结论藏/显节点”。绑定真相唯一来源 stream 快照。 */
import type { BotSnap } from '../../client/data/fleet-api'

export type FilterId = 'all' | 'bound' | 'unbound'

export const FILTERS: FilterId[] = ['all', 'bound', 'unbound']

/** 用户语言（2026-09-04 裁定）：不说“绑定”（实现语言），说“助理”（用户语言）。 */
export const FILTER_LABEL: Record<FilterId, string> = { all: '全部', bound: '有助理', unbound: '无助理' }

export function normKey(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase().trim()
}

function basenameOf(ws: string): string {
  const parts = normKey(ws).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** 行可见文本（工作区展示名/搜索结果的归属名）→ bots 中的规范 workspace 路径。
 * 复刻口径（评审声明：与 left-badges/view.resolveWorkspace 同语义，重复优于跨 feature 引用）。 */
export function resolveWorkspaceKey(rowText: string, bots: BotSnap[]): string {
  const k = normKey(rowText)
  if (!k) return rowText
  for (const b of bots) {
    if (b.workspace && (normKey(b.workspace) === k || basenameOf(b.workspace) === k)) return b.workspace
    if (b.botName && normKey(b.botName) === k) return b.workspace
  }
  return rowText
}

/** 搜索结果行全文 → 归属 workspace：结果行含标题+归属名+摘要，只能做包含匹配。
 * 误伤上界 = 行文本偶然含另一工作区名（摘要极少见，可接受，见 A4）。 */
export function resolveResultKey(fullText: string, bots: BotSnap[]): string {
  const hay = normKey(fullText)
  if (!hay) return fullText
  for (const b of bots) {
    if (!b.workspace) continue
    if (hay.includes(normKey(b.workspace)) || hay.includes(basenameOf(b.workspace))) return b.workspace
    if (b.botName && hay.includes(normKey(b.botName))) return b.workspace
  }
  return fullText
}

export function isBoundWorkspace(wsPath: string, bots: BotSnap[]): boolean {
  for (const b of bots) if (b.workspace === wsPath) return true
  return false
}

/** 筛选是否放行该工作区（stale 仍算绑定：绑定≠在线，见 B1 结论）。 */
export function passFilter(wsPath: string, filter: FilterId, bots: BotSnap[]): boolean {
  if (filter === 'all') return true
  const bound = isBoundWorkspace(wsPath, bots)
  return filter === 'bound' ? bound : !bound
}

export interface GroupCount { all: number; bound: number; unbound: number }

/** 计数口径 = 左栏分组行数（所见即所得；未分组桶恒算未绑定）。 */
export function countsOf(resolvedPaths: string[], bots: BotSnap[]): GroupCount {
  let bound = 0
  for (const p of resolvedPaths) if (isBoundWorkspace(p, bots)) bound++
  return { all: resolvedPaths.length, bound, unbound: resolvedPaths.length - bound }
}

export function segLabel(filter: FilterId, n: number): string {
  return FILTER_LABEL[filter] + ' ' + n
}

const CHANNEL_LABEL: Record<string, string> = { feishu: '飞书', qq: 'QQ', wechat: '微信' }

export function channelName(ch: string): string {
  return CHANNEL_LABEL[String(ch ?? '').toLowerCase()] ?? String(ch ?? '')
}

/** 该工作区的助理名牌：去重 Bot 名（无名用路径 basename）；空数组 = 无助理。 */
export function assistantsOf(wsPath: string, bots: BotSnap[]): string[] {
  const out: string[] = []
  for (const b of bots) {
    if (b.workspace !== wsPath) continue
    const name = String(b.botName ?? '').trim() || basenameOf(wsPath)
    if (name && out.indexOf(name) === -1) out.push(name)
  }
  return out
}

/** 行悬停名牌（只读 title 属性，不写节点）：有助理→名字+渠道，无→无助理。 */
export function rowTip(wsPath: string, bots: BotSnap[]): string {
  const names = assistantsOf(wsPath, bots)
  if (!names.length) return '暂无助理认领'
  const channels: string[] = []
  for (const b of bots) {
    if (b.workspace !== wsPath) continue
    const c = channelName(b.channel)
    if (c && channels.indexOf(c) === -1) channels.push(c)
  }
  return '助理：' + names.join('、') + (channels.length ? '（' + channels.join('、') + '）' : '')
}
