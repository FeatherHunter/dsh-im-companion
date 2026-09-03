/** d1-home 纯逻辑（可单测）：换家判定 + 撤销口径 + 分组/守卫。无 DOM。
 * 判定复用 E2 verdict 口径（#13 原型 → #11 grilling 确认沿用，纯判定表）：
 * 有家换别家→确认；换回自己→无操作；空名单→空态不写；撤销窗内→回滚；过期→拒绝。
 * 上游事实（dsh-im workspace-rpc）：归属必须非空绝对路径 → 无退回大厅动作。 */
import type { BotSnap } from '../../client/data/fleet-api'

/** 撤销窗口：与 E2 同口径，秒级（5s）。 */
export const UNDO_WINDOW_MS = 5000

export type MoveTarget = { kind: 'workspace'; workspace: string }

export type MoveVerdict =
  | { kind: 'move-confirm'; botId: string; from: string; to: string }
  | { kind: 'noop'; botId: string }
  | { kind: 'reject-unbound'; botId: string }

export type MoveDesc = Pick<BotSnap, 'botId' | 'channel' | 'workspace'>

/** 换家判定：只管有家到别家；未绑定不在花名册内，出现即指引去领人（E2 门）。 */
export function resolveMove(bot: MoveDesc, target: MoveTarget): MoveVerdict {
  const cur = bot.workspace || ''
  if (!cur) return { kind: 'reject-unbound', botId: bot.botId }
  if (cur === target.workspace) return { kind: 'noop', botId: bot.botId }
  return { kind: 'move-confirm', botId: bot.botId, from: cur, to: target.workspace }
}

/** 撤销落点：换绑回到 from；from 为空无无损落点 → null（D1 只换家，恒有 from）。 */
export function undoTarget(from: string): string | null {
  return from ? from : null
}

/** 撤销是否过期：落定后撤销被明确拒绝。 */
export function isUndoExpired(startedAt: number, nowMs: number): boolean {
  return nowMs - startedAt >= UNDO_WINDOW_MS
}

/** 归属写守卫：必须非空绝对路径（上游拒空串，坏数据进不来）。 */
export function isAbsWorkspace(p: string): boolean {
  const s = String(p ?? '').trim()
  return !!s && (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s))
}

function normKey(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase().trim()
}

function basenameOf(ws: string): string {
  const parts = normKey(ws).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** 展示用短名：目录基名（与 E2 同口径，重复优于跨 feature 引用）。 */
export function shortName(ws: string): string {
  return basenameOf(ws) || ws
}

export interface HomeGroup {
  workspace: string
  name: string
  bots: BotSnap[]
}

/** 花名册分组：只收有家 Bot（未绑定不进家里），按归属聚合保序（首见顺序）。 */
export function groupHomes(bots: BotSnap[]): HomeGroup[] {
  const groups: HomeGroup[] = []
  for (const b of bots) {
    if (!b.workspace) continue
    let g = groups.find((x) => x.workspace === b.workspace)
    if (!g) {
      g = { workspace: b.workspace, name: shortName(b.workspace), bots: [] }
      groups.push(g)
    }
    g.bots.push(b)
  }
  return groups
}

/** 空态：名下没有任何机器人（未绑定不算名下）。 */
export function isEmptyRoster(bots: BotSnap[]): boolean {
  return !bots.some((b) => !!b.workspace)
}

/** 家的展示名：设置中文名优先，无则回退目录基名。 */
export function homeName(workspace: string, names: Record<string, string>): string {
  const base = basenameOf(workspace)
  return names[base] || names[workspace] || base || workspace
}
