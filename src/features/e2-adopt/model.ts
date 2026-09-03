/** e2-adopt 纯逻辑（可单测）：放置目标判定 + 撤销口径 + 行文本映射。无 DOM；判定 lift 自 #13 原型 verdict。
 * 上游事实（dsh-im workspace-rpc）：workspace 必须非空绝对路径 → 新绑无无损撤销，只有换绑可撤销。 */
import type { BotSnap } from '../../client/data/fleet-api'

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

/* 行文本 → 规范工作区路径（评审声明：与 left-filter/model.resolveWorkspaceKey 同语义，重复优于跨 feature 引用）。 */
export function normKey(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').toLowerCase().trim()
}

function basenameOf(ws: string): string {
  const parts = normKey(ws).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export function shortName(ws: string): string {
  return basenameOf(ws) || ws
}

/* 未知（零命中）或歧义（多命中）一律返回 null，调用方走拒绝（fail-closed：上游要求非空绝对路径，垃圾文本不发 RPC）。
 * 评审声明：首胜静默命中是歧义源，故多命中亦视为未知。 */
export function resolveRowWorkspace(rowText: string, bots: BotSnap[]): string | null {
  const k = normKey(rowText)
  if (!k) return null
  const hits: string[] = []
  for (const b of bots) {
    if (b.workspace && (normKey(b.workspace) === k || basenameOf(b.workspace) === k)) hits.push(b.workspace)
    else if (b.botName && normKey(b.botName) === k) hits.push(b.workspace)
  }
  const uniq = [...new Set(hits)]
  return uniq.length === 1 ? uniq[0] : null
}
