/** adopt 纯逻辑（可单测）：放置目标判定 + 撤销口径 + 分组/展示选择器。无 DOM；判定 lift 自 #13 原型 verdict。
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

/* 在岗签名池：绿灯机器人的个性小传（botId 哈希认领，跨渲染稳定——同一人永远同一签，才像不同的人）。
 * 约束：每条 ≤6 字（含“渠道 · ”前缀后整行 ≤15 字，12px 下单行无压力；再长由省略号兜底）。 */
export const SLOGANS = ['随叫随到', '秒回达人', '全天营业', '有事吱声', '从不掉线', '消息必达', '气氛组长', '摸鱼监督', '干饭提醒', '深夜树洞', '随时开聊', '靠谱在线', '泡在网上', '蹲守本群', '有问必答', '随传随到', '全勤标兵', '从不潜水', '蹲点值班', '眼观六路', '耳听八方', '火速支援', '小棉袄', '靠谱队友', '热心肠', '老熟人', '自来熟', '捧场王', '和事佬', '出谋划策', '点子王', '行动派', '细节控', '夜猫子', '早起鸟', '永动机']

export function sloganFor(botId: string): string {
  const s = String(botId ?? '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return SLOGANS[h % SLOGANS.length]
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
