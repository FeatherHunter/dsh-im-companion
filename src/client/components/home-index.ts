/** 绿框视图索引（纯逻辑）：**一次渲染建一次索引**，把视图层逐行 O(n·m)/O(n·b) 的
 * filter/find 收敛为一次 O(n+m+b) 建表；分组、计数、搜索、命名回落都读同一份索引
 * ⇒ 单一分组缝（契约：不再各写各的 filter）。
 * 呈现策略（分区/排序）也放这里：它属于「先看谁」，不属于持久化不变量。 */
import { bucketOf, type Assistant, type Home, type WorkspaceRef } from '../data/home-model'
import type { BotSnap } from '../data/fleet-api'
import { isOrphanHome } from '../data/home-orphan'

export interface FleetIndex {
  /** homeId → 该家的助理（只读，勿改） */
  byHome: Map<string, Assistant[]>
  /** 两段键：`channel\0botId` 与裸 botId —— 对应 botOf 的「先同渠道、再同名」回落 */
  byBot: Map<string, BotSnap>
  /** channel → 该渠道的助理（只读） */
  byChannel: Map<string, Assistant[]>
  /** workspaceId → 工作区 */
  byWs: Map<string, WorkspaceRef>
  /** homeId → 家（含墓碑家：命名回落要用） */
  byId: Map<string, Home>
}

export function botKey(channel: string, botId: string): string {
  return `${channel}\u0000${botId}`
}

function push<K, V>(map: Map<K, V[]>, key: K, v: V): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(v)
  else map.set(key, [v])
}

export function buildIndex(
  homes: Home[],
  assistants: Assistant[],
  bots: BotSnap[],
  workspaces: WorkspaceRef[],
): FleetIndex {
  const byHome = new Map<string, Assistant[]>()
  const byChannel = new Map<string, Assistant[]>()
  for (const a of assistants) {
    push(byHome, a.homeId || '', a)
    push(byChannel, bucketOf(a), a)
  }
  const byId = new Map<string, Home>()
  for (const hm of homes) if (hm && !byId.has(hm.id)) byId.set(hm.id, hm)
  const byBot = new Map<string, BotSnap>()
  for (const b of bots) {
    const two = botKey(b.channel, b.botId)
    if (!byBot.has(two)) byBot.set(two, b)
    if (!byBot.has(b.botId)) byBot.set(b.botId, b)
  }
  const byWs = new Map<string, WorkspaceRef>()
  for (const w of workspaces) if (w && w.workspaceId && !byWs.has(w.workspaceId)) byWs.set(w.workspaceId, w)
  return { byHome, byBot, byChannel, byWs, byId }
}

/** 呈现策略：L1 导航列表分区——**孤儿家（工作区已不在）置顶**，再是有助理的家
 *  （按 updatedAt 降序），空家在后。孤儿是唯一需要人动手的状态（重绑/删除），
 *  沉在底下等于藏起来（owner 2026-10-15）。
 *  T3「一区一家含无人之家」是持久化不变量（保历史不丢），此处不动它；这里只决定先看谁。
 *  O(n)；不原地改 state.homes（三个都是新数组）。 */
export function partitionHomes(homes: Home[], index: FleetIndex, workspaces: WorkspaceRef[] = []): { orphan: Home[]; active: Home[]; empty: Home[] } {
  const orphan: Home[] = []
  const active: Home[] = []
  const empty: Home[] = []
  for (const hm of homes) {
    if (isOrphanHome(hm, workspaces)) { orphan.push(hm); continue }
    ((index.byHome.get(hm.id)?.length ?? 0) > 0 ? active : empty).push(hm)
  }
  active.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return { orphan, active, empty }
}
