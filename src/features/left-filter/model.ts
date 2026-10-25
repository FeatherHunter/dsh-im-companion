/** left-filter 纯逻辑（可单测）：筛选三态 + 行数口径计数 + 绑定判定。
 * 无 DOM；视图只做“按结论藏/显节点”。绑定真相唯一来源 stream 快照。 */
import type { BotSnap } from '../../client/data/fleet-api'
import { channelLabel } from '../../client/data/config'
import { t } from '../../client/i18n'
import { EMPTY_WORKSPACE_INDEX, resolveRowWorkspace, type WorkspaceIndex, type WorkspaceResolution } from '../../client/data/workspace-index'

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

/** 行可见文本 + 行身份（data-row-key 的 workspaceId）→ bots 中的规范 workspace 路径（#154）。
 * 真相顺序（共享层单点：left-filter / left-badges / presence 共用同一口径）：
 * ① 行身份 → 注册表路径 ② 注册表标题 ③ 老口径字面匹配（路径全等/basename/机器人名）。
 * 解析不出 ⇒ ''（未解析哨兵）：绝不把「无法解析的显示名」当工作区标识传下去。 */
export function resolveWorkspaceKey(
  rowText: string,
  bots: BotSnap[],
  workspaceId = '',
  index: WorkspaceIndex = EMPTY_WORKSPACE_INDEX,
): string {
  return resolveWorkspaceRow(rowText, bots, workspaceId, index).path
}

/** 同上，但把**解析依据**一并给出（身份/标题/字面/未解析）：视图据此留痕，
 *  事后只看磁盘日志就能判定「这行为什么没绑上」（#154 诊断取证纪律）。 */
export function resolveWorkspaceRow(
  rowText: string,
  bots: BotSnap[],
  workspaceId = '',
  index: WorkspaceIndex = EMPTY_WORKSPACE_INDEX,
): WorkspaceResolution {
  return resolveRowWorkspace(rowText, workspaceId, index, bots)
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

/** 三段条 UI 文案（#184 起走词条表）；诊断日志仍用 FILTER_LABEL 的中文口径，不随语言漂移。 */
export function filterLabel(filter: FilterId): string {
  return t('left-filter', 'filters.' + filter)
}

export function segLabel(filter: FilterId, n: number): string {
  return filterLabel(filter) + ' ' + n
}

/** 渠道中文名：共用 9 渠道表（client/data/config.ts 的 channelLabel），不再自建局部表——
 * 旧的 feishu/qq/wechat 三行表把微信的 weixin 写成 wechat，且另 6 个渠道全露英文 id。 */
export function channelName(ch: string): string {
  return channelLabel(String(ch ?? '').toLowerCase())
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
  const sep = t('common', 'list.sep')
  if (!names.length) return t('left-filter', 'row.tip.empty')
  const channels: string[] = []
  for (const b of bots) {
    if (b.workspace !== wsPath) continue
    const c = channelName(b.channel)
    if (c && channels.indexOf(c) === -1) channels.push(c)
  }
  const base = t('left-filter', 'row.tip.assigned', { names: names.join(sep) })
  return channels.length ? base + t('left-filter', 'row.tip.channels', { channels: channels.join(sep) }) : base
}
