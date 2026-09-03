/** 领域模型：BotSnap + AgentMetaDoc → 两态视图（按Agent / 按渠道分组）。
 * 决策（用户拍板 2026-09-02）：1 Agent = 1 Workspace，原「按工作区」与「按Agent」语义重复 → 已砍。 */
import { HEALTH_LABELS, channelLabel, type HealthKind } from './config'
import type { AgentMetaDoc } from './meta'
import type { BotSnap } from './fleet-api'

export interface AgentBotRef {
  channel: string
  botId: string
}

export interface AgentChannelView {
  id: string
  label: string
  status: HealthKind
}

export interface AgentView {
  key: string
  base: string
  name: string
  initial: string
  avatar: string | null
  workspace: string
  channels: AgentChannelView[]
  status: HealthKind
  stateLabel: string
  isLocal: boolean
  sub: string
  workspaceLine: string
  healthDetail: string
  bots: AgentBotRef[]
}

export interface ChannelGroup {
  id: string
  label: string
  count: number
  views: AgentView[]
}

export interface FleetModel {
  agents: AgentView[]
  channelGroups: ChannelGroup[]
  counts: { agents: number; channels: number }
  totalBots: number
}

export type ViewMode = 'agent' | 'channel'

export function basenameOf(ws: string): string {
  if (!ws) return ''
  const parts = String(ws).split(/[\\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export function fallbackName(base: string): string {
  const b = (base ?? '').trim()
  if (!b) return ''
  return b.charAt(0).toUpperCase() + b.slice(1)
}

export function initialOf(name: string): string {
  const n = (name ?? '').trim()
  return n ? n.charAt(0).toUpperCase() : '?'
}

export function paletteOf(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return hash % 8
}

function mergeStatus(kinds: HealthKind[]): HealthKind {
  if (kinds.some((k) => k === 'online')) return 'online'
  if (kinds.some((k) => k === 'warn')) return 'warn'
  return kinds.length ? 'offline' : 'offline'
}

/* 家的身份键 = 工作区全路径；同名目录不再串名。读兼容旧 basename 键（先写的新键优先）。 */
export function viewName(base: string, meta: AgentMetaDoc, fallback: string, path = ''): string {
  if (!base && !path) return fallback
  if (path && meta.names[path]) return meta.names[path]
  if (base && meta.names[base]) return meta.names[base]
  return fallbackName(base || path)
}

function avatarOf(path: string, base: string, meta: AgentMetaDoc): string | null {
  if (path && meta.avatars[path]) return meta.avatars[path]
  if (base && meta.avatars[base]) return meta.avatars[base]
  return null
}

function matchQuery(view: AgentView, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const hay = [view.name, view.base, view.workspace, view.sub].join(' ').toLowerCase()
  return hay.includes(q)
}

function channelsOf(snaps: BotSnap[]): AgentChannelView[] {
  const byCh = new Map<string, BotSnap[]>()
  for (const s of snaps) byCh.set(s.channel, [...(byCh.get(s.channel) ?? []), s])
  return [...byCh.entries()].map(([id, list]) => ({
    id,
    label: channelLabel(id),
    status: mergeStatus(list.map((s) => s.healthKind)),
  }))
}

const STATUS_RANK: Record<HealthKind, number> = { online: 0, warn: 1, offline: 2 }

function healthDetailOf(channels: AgentChannelView[], bots: BotSnap[]): string {
  const parts = channels.map((c) => c.label + '·' + HEALTH_LABELS[c.status])
  const last = Math.max(...bots.map((b) => b.lastCheckedAt ?? 0), 0)
  if (last > 0) parts.push('最后检测 ' + new Date(last).toLocaleTimeString('zh-CN', { hour12: false }))
  const firstDown = bots.find((b) => b.healthKind !== 'online')
  if (firstDown?.healthSummary) parts.push(firstDown.healthSummary)
  return parts.join('；')
}

function botRefsOf(snaps: BotSnap[]): AgentBotRef[] {
  return snaps.map((s) => ({ channel: s.channel, botId: s.botId }))
}

export function buildModel(bots: BotSnap[], meta: AgentMetaDoc, mode: ViewMode, query: string): FleetModel {
  const counts = { agents: 0, channels: 0 }

  /* ---- 按Agent：按工作区分组（含本地空壳） ---- */
  const byWs = new Map<string, BotSnap[]>()
  for (const b of bots) {
    const key = b.workspace || 'unbound:' + b.botId
    byWs.set(key, [...(byWs.get(key) ?? []), b])
  }
  const locals = meta.locals.filter((l) => !(l.workspace && byWs.has(l.workspace)))
  const agents: AgentView[] = []
  for (const [wsKey, snaps] of byWs) {
    const path = wsKey.startsWith('unbound:') ? '' : wsKey
    const base = basenameOf(path)
    const status = mergeStatus(snaps.map((s) => s.healthKind))
    const name = viewName(base, meta, snaps[0]?.botName || '未命名 Agent', path)
    const avatar = avatarOf(path, base, meta) || snaps[0]?.avatarUrl || null
    const channels = channelsOf(snaps)
    agents.push({
      key: wsKey,
      base,
      name,
      initial: initialOf(name),
      avatar,
      workspace: path,
      channels,
      status,
      stateLabel: channels.length ? HEALTH_LABELS[status] : '未接入',
      isLocal: false,
      sub: channels.length ? channels.map((c) => c.label).join('·') : '尚未接入渠道',
      workspaceLine: path ? '工作区·' + path : '未绑定工作区',
      healthDetail: healthDetailOf(channels, snaps),
      bots: botRefsOf(snaps),
    })
  }
  for (const l of locals) {
    const name = l.name
    agents.push({
      key: 'local:' + name,
      base: '',
      name,
      initial: initialOf(name),
      avatar: null,
      workspace: l.workspace,
      channels: [],
      status: 'offline',
      stateLabel: '未接入',
      isLocal: true,
      sub: '尚未接入渠道',
      workspaceLine: '未绑定工作区',
      healthDetail: '本地 Agent，尚未接入渠道',
      bots: [],
    })
  }
  agents.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name, 'zh'))
  counts.agents = agents.length

  /* ---- 按渠道：渠道分区头 + 组内 Agent 列表（头像与 dsh-im 一致=渠道头像；不提供改名/头像菜单） ---- */
  const byCh = new Map<string, BotSnap[]>()
  for (const b of bots) byCh.set(b.channel, [...(byCh.get(b.channel) ?? []), b])
  const channelGroups: ChannelGroup[] = [...byCh.entries()].map(([ch, snaps]) => {
    const inner = new Map<string, BotSnap[]>()
    for (const s of snaps) {
      const k = s.workspace || 'unbound:' + s.botId
      inner.set(k, [...(inner.get(k) ?? []), s])
    }
    const views: AgentView[] = [...inner.entries()].map(([wsKey, list]) => {
      const path = wsKey.startsWith('unbound:') ? '' : wsKey
      const base = basenameOf(path)
      const first = list[0]
      const status = mergeStatus(list.map((s) => s.healthKind))
      const name = viewName(base, meta, first.botName || '未命名 Agent', path)
      const avatar = list.map((s) => s.avatarUrl).find(Boolean) ?? null
      return {
        key: 'ch:' + ch + ':' + wsKey,
        base,
        name,
        initial: initialOf(name),
        avatar,
        workspace: path,
        channels: [{ id: ch, label: channelLabel(ch), status }],
        status,
        stateLabel: HEALTH_LABELS[status],
        isLocal: false,
        sub: base || '未绑定工作区',
        workspaceLine: path ? '工作区·' + path : '未绑定工作区',
        healthDetail: healthDetailOf([{ id: ch, label: channelLabel(ch), status }], list),
        bots: botRefsOf(list),
      }
    })
    views.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    return { id: ch, label: channelLabel(ch), count: views.length, views }
  })
  for (const g of channelGroups) g.views = g.views.filter((v) => matchQuery(v, query))
  channelGroups.sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  const usedGroups = channelGroups.filter((g) => g.views.length > 0)
  counts.channels = usedGroups.length

  const filteredAgents = agents.filter((v) => matchQuery(v, query))
  return {
    agents: mode === 'agent' ? filteredAgents : agents,
    channelGroups: mode === 'channel' ? usedGroups : channelGroups,
    counts,
    totalBots: bots.length,
  }
}