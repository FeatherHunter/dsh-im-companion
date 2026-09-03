/** workspaceId↔BotSnap 绑定 + 健康聚合（B1 首建；其余功能只读导出）。
 * B1 结论（#6 已确认）：绿灯只承诺可达性（任一通道在线即在线）；stale（轮询失败保留）
 * = 未知 → 待确认，绝不谎报离线；tooltip 必带最后检测时间；
 * 点击只读（调用方派发 OPEN_AGENT_EVENT 事件契约，不做 mutation）。 */
import { HEALTH_LABELS, channelLabel, healthOf, type HealthKind } from './config'
import type { BotSnap } from './fleet-api'

export type BadgeKind = HealthKind | 'unbound'

/** 徽标点击事件名：detail = { workspace, agent }，只读导航意图（#agent= 锚点待定）。 */
export const OPEN_AGENT_EVENT = 'dsh-im-companion:open-agent'

export interface LeftBadge {
  kind: BadgeKind
  label: string
  tooltip: string
  workspace: string
  agent: string
}

export function basenameOfPath(ws: string): string {
  if (!ws) return ''
  const parts = String(ws).split(/[\\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function kindOf(b: BotSnap): HealthKind {
  if (b.stale) return 'warn'
  return healthOf(b.healthStatus, b.connected)
}

function timeText(ms: number): string {
  if (!ms || ms <= 0) return ''
  try {
    return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

/* nowMs 由调用方/测试注入“现在”，生产才走默认 Date.now()（默认参数读时钟，严格算副作用）。 */
export function badgeForWorkspace(workspacePath: string, bots: BotSnap[], nowMs = Date.now()): LeftBadge {
  const agent = basenameOfPath(workspacePath)
  const bound = bots.filter((b) => b.workspace === workspacePath)
  if (!bound.length) {
    return {
      kind: 'unbound',
      label: '未绑定',
      tooltip: '尚未绑定任何 Bot，去 IM机器人辅助绑定后此处点亮。',
      workspace: workspacePath,
      agent,
    }
  }
  const kinds = bound.map(kindOf)
  const kind: HealthKind = kinds.includes('online') ? 'online' : kinds.includes('warn') ? 'warn' : 'offline'
  const parts = bound.map((b) => {
    if (b.stale) return channelLabel(b.channel) + '·未知（轮询失败）'
    return channelLabel(b.channel) + '·' + HEALTH_LABELS[kindOf(b)]
  })
  const last = Math.max(...bound.map((b) => b.lastCheckedAt ?? 0))
  if (last > 0) {
    const age = Math.max(0, Math.round((nowMs - last) / 1000))
    parts.push('最后检测 ' + timeText(last) + (age > 0 ? '（' + age + ' 秒前）' : ''))
  } else {
    parts.push('最后检测 暂无')
  }
  return { kind, label: HEALTH_LABELS[kind], tooltip: parts.join('；'), workspace: workspacePath, agent }
}
