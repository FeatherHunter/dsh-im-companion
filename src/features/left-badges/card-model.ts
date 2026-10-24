/** 悬浮卡数据模型（纯函数可单测）：实体驱动——家 + 该家的全部助理 + 该工作区已绑定的机器人。
 * 归属分类（#190 Q4=A）：机器人行两档——匹配到别家助理=「未归属」，匹配不到=「无助理」；助理行含未绑定（「未绑定」）。
 * 无自有轮询：家表/图来自 assistant-face 的 mountAssistantFaces 快照，bots 来自唯一 connection-stream。 */
import type { Assistant, Home } from '../../client/data/home-model'
import type { BotSnap } from '../../client/data/fleet-api'
import { botDisplayLabel } from '../../client/data/fleet-api'
import { lastCheckedText } from '../../client/data/bindings'
import { channelGlyphSvg } from '../../client/icons'
import { healthOf, type HealthKind } from '../../client/data/config'
import { avatarStyleFor, initialsOf } from './panel-identity'
import { hasFaceImage, type FaceDesc } from './assistant-face'

export type RowKind = 'assistant' | 'robot'
/** 游离机器人两档：no-assistant＝botId 无匹配；other-home＝匹配到助理但助理属于别家。 */
export type RobotRole = 'no-assistant' | 'other-home'

export interface CardRow {
  kind: RowKind
  name: string
  channel: string
  /** 渠道 logo 首格：已绑助理=渠道 logo；未绑定助理=null（灰化虚线脸开头）；robot 行=渠道 logo（拿不到渲染回落机器人字形）。 */
  glyph: string | null
  /** 助理脸；robot 行 null（不用助理名/脸，Q4）。 */
  face: FaceDesc | null
  /** 右侧状态点；未绑定/无状态 null。 */
  state: HealthKind | null
  /** 右侧小标签：未绑定 / 未归属 / 无助理；无标签 ''。 */
  tag: string
  unbound?: boolean
  role?: RobotRole
  bot?: string
}

export interface CardData {
  /** 家行名（面板同款：用户改名 > 行显示名 > 家名 > 目录基名）。 */
  agent: string
  /** 家行脸（有上传图用图，否则房子图标＋家色板）。 */
  face: FaceDesc
  rows: CardRow[]
  time: string
  homeId: string
}

export interface CardSource {
  workspacePath: string
  bots: BotSnap[]
  homes: Home[]
  assistants: Assistant[]
  images: ReadonlyMap<string, string>
  displayName?: string
}

function normPath(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}
function samePath(a: string, b: string): boolean {
  return !!a && !!b && normPath(a) === normPath(b)
}
function basenameOfPath(p: string): string {
  const parts = String(p ?? '').split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}
function healthOfBot(b: BotSnap): HealthKind {
  try { return b.stale ? 'warn' : healthOf(b.healthStatus, b.connected) } catch { return 'offline' }
}

/** 同路家（墓碑家不进；规范路径口径与共享层一致）。 */
export function homeFor(homes: Home[], wsPath: string): Home | null {
  const np = normPath(wsPath)
  if (!np) return null
  return (homes || []).find((h) => h && !h.tombstone && normPath(h.path) === np) ?? null
}

/** 家行名：调用方显示名（meta 改名）> 面板用户命名 > 目录基名 > 未命名家。 */
function homeTextOf(home: Home | null, displayName: string | undefined, wsPath: string): string {
  const explicit = String(displayName ?? '').trim()
  if (explicit) return explicit
  if (home && home.nameSource === 'user' && home.name.trim()) return home.name.trim()
  return basenameOfPath(wsPath) || (home?.name ?? '').trim() || '未命名家'
}

/** 助理行名（面板同链）：用户手改 > 机器人名 > 家名 > 缺省名。 */
function assistantNameOf(a: Assistant, bot: BotSnap | null, homeText: string): string {
  if (a.nameSource === 'user' && a.name.trim()) return a.name.trim()
  const bn = bot ? botDisplayLabel(bot) : ''
  if (bn && bn !== '未命名') return bn
  return homeText || '未命名助理'
}

function homeFaceOf(home: Home | null, name: string, images: ReadonlyMap<string, string>): FaceDesc {
  if (home && hasFaceImage(home.avatar)) {
    const img = images.get(home.id)
    if (img) return { img, tint: '', initial: '' }
  }
  if (!home) return { img: null, tint: '', initial: initialsOf(name) }
  return { img: null, tint: avatarStyleFor('home', home.id, home.avatar), initial: initialsOf(name), icon: 'home' }
}

/** 助理脸（Q2：有配置头像就展示头像；无图＝助理身份＝机器人字形＋暖亮色板；未绑定走灰化虚线，不给色板）。 */
function assistantFaceOf(a: Assistant, name: string, images: ReadonlyMap<string, string>, unbound = false): FaceDesc {
  if (hasFaceImage(a.avatar)) {
    const img = images.get(a.id)
    if (img) return { img, tint: '', initial: '' }
  }
  if (unbound) return { img: null, tint: '', initial: initialsOf(name), icon: 'bot' }
  return { img: null, tint: avatarStyleFor('assistant', a.id, a.avatar), initial: initialsOf(name), icon: 'bot' }
}

/** botId → 助理（精确：渠道+botId 优先、botId 兜底；不做「同路家首助理」兜底——Q4 回落即无助理）。 */
export function matchAssistantForBot(assistants: Assistant[], bot: BotSnap): Assistant | null {
  if (!bot?.botId) return null
  const list = assistants || []
  const byKey = list.find((a) => a && a.botId === bot.botId && (!a.channel || a.channel === bot.channel))
  return byKey ?? list.find((a) => a && a.botId === bot.botId) ?? null
}

/** bot → 状态点（助理行用；快照里找不到该 bot 时按离线画）。 */
function botForAssistant(a: Assistant, bots: BotSnap[]): BotSnap | null {
  if (!a.botId) return null
  const list = bots || []
  return list.find((b) => b.botId === a.botId && (!a.channel || b.channel === a.channel))
    ?? list.find((b) => b.botId === a.botId)
    ?? null
}

/** 卡片数据（纯函数可单测）：家存在即可出卡（无绑定 bot 也出，Q3=B）；无家且无 bot 才不出。 */
export function buildCardData(src: CardSource): CardData | null {
  try {
    const ws = String(src?.workspacePath ?? '').trim()
    if (!ws) return null
    const bots = src.bots || []
    const homes = src.homes || []
    const assistants = src.assistants || []
    const bound = bots.filter((b) => b && samePath(b.workspace ?? '', ws))
    const home = homeFor(homes, ws)
    if (!home && !bound.length) return null
    const homeText = homeTextOf(home, src.displayName, ws)
    const rows: CardRow[] = []
    const homeAssistants = home
      ? assistants.filter((a) => a && a.homeId === home.id).slice().sort((x, y) => x.createdAt - y.createdAt)
      : []
    const claimed = new Set<string>()
    for (const a of homeAssistants) {
      const bot = botForAssistant(a, bots)
      const boundAssistant = a.status === 'bound' && !!a.botId
      const name = assistantNameOf(a, bot, homeText)
      if (boundAssistant) claimed.add(a.channel + '\u0000' + a.botId)
      rows.push({
        kind: 'assistant',
        name,
        channel: a.channel,
        /* 验收反馈①：未绑定助理没有渠道，不给渠道 logo（渠道只属于已绑定的机器人）。 */
        glyph: boundAssistant ? channelGlyphSvg(a.channel, 16) : null,
        face: assistantFaceOf(a, name, src.images, !boundAssistant),
        state: boundAssistant ? (bot ? healthOfBot(bot) : 'offline') : null,
        tag: boundAssistant ? '' : '未绑定',
        unbound: !boundAssistant,
        bot: a.botId ?? '',
      })
    }
    for (const b of bound) {
      if (claimed.has(b.channel + '\u0000' + (b.botId ?? ''))) continue
      const matched = matchAssistantForBot(assistants, b)
      if (matched && home && matched.homeId === home.id) continue
      const role: RobotRole = matched ? 'other-home' : 'no-assistant'
      rows.push({
        kind: 'robot',
        name: botDisplayLabel(b),
        channel: b.channel,
        /* 验收反馈③：游离机器人是真实机器人（有渠道），首格用渠道 logo；未知渠道渲染回落机器人字形。 */
        glyph: channelGlyphSvg(b.channel, 16),
        face: null,
        state: healthOfBot(b),
        tag: role === 'other-home' ? '未归属' : '无助理',
        role,
        bot: b.botId ?? '',
      })
    }
    return { agent: homeText, face: homeFaceOf(home, homeText, src.images), rows, time: lastCheckedText(bound), homeId: home?.id ?? '' }
  } catch {
    return null
  }
}
