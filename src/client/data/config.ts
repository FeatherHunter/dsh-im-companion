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