/** 助理搬家 / 移除渠道 / 孤儿回落纯逻辑（T6c #115 · T3 #116 语义冻结）。
 * 只做内存判定，IO 归 ops/host；类型复用 home-model（同功能内 import，零跨功能耦合）。 */
import type { Assistant, Home } from './home-model'

function trimId(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 64) : ''
}

/** 搬家判定：目标家存在、无墓碑、与现家不同；只换 homeId 其余原样（名随新家实时回落）。 */
export function applyMove(a: Assistant, targetHomeId: string, homes: Home[]): Assistant | null {
  if (!a || !a.id) return null
  const target = trimId(targetHomeId)
  if (!target || target === a.homeId) return null
  const home = (homes || []).find((h) => h && h.id === target)
  if (!home || home.tombstone) return null
  return { ...a, homeId: target }
}

/** 解绑变换：只收 bound；user 改名保留其余回落家名；bot 系头像清零；orphan 留 boundAt 供认领审计。 */
export function applyUnbind(a: Assistant, orphan: boolean): Assistant | null {
  if (!a || !a.id || a.status !== 'bound' || !a.botId) return null
  const keepUser = a.nameSource === 'user' && !!a.name.trim()
  return {
    ...a,
    botId: null,
    status: orphan ? 'orphan' : 'unbound',
    boundAt: orphan ? a.boundAt : null,
    name: keepUser ? a.name.trim() : '',
    nameSource: keepUser ? 'user' : 'home',
    avatar: a.avatarSource === 'bot' ? null : a.avatar,
    avatarSource: a.avatarSource === 'bot' ? 'default' : a.avatarSource,
  }
}

/** 孤儿判定：bound 但快照无此号；失败渠道 fail-closed（不误伤）。返回待回落 id。 */
export function findOrphans(
  assistants: Assistant[],
  bots: Array<{ channel: string; botId: string }>,
  failed: string[] = [],
): string[] {
  const bad = new Set((failed || []).map(String))
  const live = new Set(
    (bots || [])
      .filter((b) => b && b.channel && b.botId)
      .map((b) => b.channel + '' + b.botId),
  )
  return (assistants || [])
    .filter((a) => a && a.status === 'bound' && a.botId && !bad.has(a.channel) && !live.has(a.channel + '' + a.botId))
    .map((a) => a.id)
}
