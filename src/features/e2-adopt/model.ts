/** e2-adopt 纯逻辑（可单测）：放置目标判定 + 撤销口径 + 分组/展示选择器。无 DOM；判定 lift 自 #13 原型 verdict。
 * 上游事实（dsh-im workspace-rpc）：workspace 必须非空绝对路径 → 新绑无无损撤销，只有换绑可撤销。 */
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import { initialOf, paletteOf, viewName } from '../../client/data/model'

/** 撤销窗口：走查 verdict，5 秒。 */
export const UNDO_WINDOW_MS = 5000

export type DropTarget = { kind: 'workspace'; workspace: string } | { kind: 'empty' }

export type DropVerdict =
  | { kind: 'bind'; botId: string; to: string }
  | { kind: 'confirm-move'; botId: string; from: string; to: string }
  | { kind: 'noop'; botId: string }
  | { kind: 'reject'; reason: 'empty' }

export type DragDesc = Pick<BotSnap, 'botId' | 'channel' | 'workspace'>

export function resolveDrop(bot: DragDesc, target: DropTarget): DropVerdict {
  if (target.kind === 'empty') return { kind: 'reject', reason: 'empty' }
  const cur = bot.workspace || ''
  if (!cur) return { kind: 'bind', botId: bot.botId, to: target.workspace }
  if (cur === target.workspace) return { kind: 'noop', botId: bot.botId }
  return { kind: 'confirm-move', botId: bot.botId, from: cur, to: target.workspace }
}

/** 撤销落点：换绑回到 from；新绑（from 为空）无无损落点 → null，调用方只给普通 toast。 */
export function undoTarget(from: string): string | null {
  return from ? from : null
}

export function unboundBots(bots: BotSnap[]): BotSnap[] {
  return bots.filter((b) => !b.workspace)
}

/* 路径归一（展示与分组用；面板按分组直连归属，不再做行文本映射）。 */
function normKey(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase().trim()
}

function basenameOf(ws: string): string {
  const parts = normKey(ws).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export function shortName(ws: string): string {
  return basenameOf(ws) || ws
}

export function baseOf(ws: string): string {
  return basenameOf(ws)
}

/* 家的门牌（评审声明：展示名口径复用共享 viewName，与左栏徽标/抽屉同一套 meta.names）。 */
export interface HomePlate {
  /** 门牌大名：用户在设置里起的中文名，无则回退目录名。 */
  name: string
  /** 副名：目录基名（与大名相同时为空，不重复展示）。 */
  sub: string
  /** 头像字：大名首字。 */
  initial: string
  /** 色板序号（paletteOf，跨渲染稳定，同一家恒同色）。 */
  color: number
}

export function homePlate(workspace: string, meta: AgentMetaDoc | null): HomePlate {
  const base = basenameOf(workspace)
  const name = viewName(base, meta ?? { names: {} } as AgentMetaDoc, base || workspace, workspace)
  return {
    name,
    sub: base && normKey(base) !== normKey(name) ? base : '',
    initial: initialOf(name),
    color: paletteOf(workspace || name),
  }
}

export interface BoardGroup { workspace: string; name: string; bots: BotSnap[] }

/** 家单：有人家（机器人首见序）+ 无人之家（名单序追尾）。纯函数，视图只渲染。 */
export function homeList(bots: BotSnap[], known: string[]): string[] {
  const seen: string[] = []
  for (const b of bots || []) { const w = b?.workspace ?? ''; if (w && !seen.includes(w)) seen.push(w) }
  for (const w of known || []) { if (w && !seen.includes(w)) seen.push(w) }
  return seen
}

/** 面板分组：未分配置顶（无则省略），其余按归属聚合（保序：首见顺序）。视图只渲染，不另做映射。 */
export function boardGroups(bots: BotSnap[]): { unbound: BotSnap[]; groups: BoardGroup[] } {
  const unbound = unboundBots(bots)
  const groups: BoardGroup[] = []
  for (const b of bots) {
    if (!b.workspace) continue
    let g = groups.find((x) => x.workspace === b.workspace)
    if (!g) {
      g = { workspace: b.workspace, name: shortName(b.workspace), bots: [] }
      groups.push(g)
    }
    g.bots.push(b)
  }
  return { unbound, groups }
}
