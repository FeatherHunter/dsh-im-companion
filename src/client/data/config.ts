/** 渠道与健康状态等纯配置（无副作用）。 */

export const CHANNEL_ORDER = [
  'feishu', 'weixin', 'qq', 'slack', 'telegram', 'discord', 'whatsapp', 'dingtalk', 'wecom',
] as const

export type ChannelId = (typeof CHANNEL_ORDER)[number]

export const CHANNEL_LABELS: Record<string, string> = {
  feishu: '飞书', weixin: '微信', qq: 'QQ', slack: 'Slack',
  telegram: 'Telegram', discord: 'Discord', whatsapp: 'WhatsApp',
  dingtalk: '钉钉', wecom: '企业微信',
}

export type HealthKind = 'online' | 'warn' | 'offline'

export const HEALTH_LABELS: Record<HealthKind, string> = {
  online: '在线', warn: '待确认', offline: '离线',
}

/** C1a 抽屉打开事件名：detail = { key }（key = AgentView.key；A1 行派发，C1a 特性监听，见 OPEN_AGENT_EVENT 先例）。 */
export const OPEN_DRAWER_EVENT = 'dsh-im-companion:open-drawer'

export interface OpenDrawerDetail {
  key: string
}

/** 舰队视图切换事件名：detail = { view }（A1 船按钮/矩阵返回按钮派发，装配层监听做显隐切换；C1a 抽屉同款事件制）。 */
export const FLEET_VIEW_EVENT = 'dsh-im-companion:fleet-view'

export interface FleetViewDetail {
  view: 'list' | 'radar'
}

export function healthOf(status?: string | null, connected?: boolean): HealthKind {
  const s = String(status ?? '').toLowerCase()
  if (s === 'healthy' || s === 'online' || s === 'connected' || s === 'ok') return 'online'
  if (s === 'degraded' || s === 'checking' || s === 'unknown') return 'warn'
  return connected ? 'online' : 'offline'
}

export const CHANNEL_COLORS: Record<string, string> = {
  feishu: '#3370ff', weixin: '#07c160', qq: '#12b7f5', slack: '#4a154b',
  telegram: '#2aabee', discord: '#5865f2', whatsapp: '#25d366',
  dingtalk: '#0091ff', wecom: '#2e7cf6',
}

export function channelLabel(id: string): string {
  return CHANNEL_LABELS[id] ?? id
}

export function stateColor(kind: HealthKind): string {
  if (kind === 'online') return 'var(--af-success)'
  if (kind === 'warn') return 'var(--af-warn)'
  return 'color-mix(in srgb, var(--af-primary) 35%, transparent)'
}

export function channelColor(id: string): string {
  return CHANNEL_COLORS[id] ?? 'var(--af-tertiary)'
}