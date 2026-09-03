/** E3 会话路由投影（host 侧只读）：读 dsh-im 落盘 state.json → 脱敏 bound 映射 + direct 幽灵 key。
 * 路径规则照抄上游 production（改路径即跟随改此处，不碰上游源码）：
 *  integrations/dsh-<channel>/bots/<botId>/state.json；飞书另有 legacy 根 state.json。
 * 不含昵称（现状无来源）、不判存活（够不着 session.list）、不写（无端点）：砍完形态。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface RouteBot { channel: string; botId: string }

export interface RouteRow {
  channel: string
  botId: string
  /** 脱敏展示：种类 + id 头部，无昵称。 */
  chat: string
  /** sess 截断 8 位，完整 id 不出 host。 */
  session: string
  /** direct: 前缀存量（现行飞书只产 p2p:/group:）。 */
  ghost: boolean
}

export interface RouteSkip { channel: string; botId: string; reason: 'bad-bot' | 'no-state' | 'unreadable' }

const BOT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const CHANNEL_RE = /^[a-z0-9-]{1,32}$/

function dirOf(dshHome: string, channel: string): string | null {
  if (!CHANNEL_RE.test(channel)) return null
  return path.join(dshHome, 'integrations', 'dsh-' + channel)
}

/** 候选落盘路径（存在与否由调用方按 ENOENT 跳过）。 */
export function candidateStateFiles(dshHome: string, channel: string, botId: string): string[] {
  if (!BOT_ID_RE.test(botId)) return []
  const root = dirOf(dshHome, channel)
  if (!root) return []
  const files = [path.join(root, 'bots', botId, 'state.json')]
  if (channel === 'feishu') files.push(path.join(root, 'state.json'))
  return files
}

/** 落盘解析：只收 sessions 下 string→string，其余（脏数据/形状漂移）丢弃。 */
export function parseSessionsText(text: string): Record<string, string> {
  try {
    const doc = JSON.parse(text) as { sessions?: unknown }
    const s = doc && typeof doc === 'object' ? (doc as { sessions?: unknown }).sessions : null
    if (!s || typeof s !== 'object' || Array.isArray(s)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k && typeof v === 'string' && v) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function head(id: string, n: number): string {
  return id.length > n + 1 ? id.slice(0, n) + '…' : id
}

/** 会话展示脱敏：种类 + id 头部（现状无昵称来源）。 */
export function maskChat(key: string, channel = ''): string {
  const cut = key.indexOf(':')
  const pre = cut < 0 ? '' : key.slice(0, cut)
  const id = cut < 0 ? key : key.slice(cut + 1)
  if (pre === 'p2p') return '私聊 ' + head(id, 6)
  if (pre === 'group') return '群聊 ' + head(id, 6)
  if (pre === 'direct') return (channel === 'feishu' ? '旧映射 ' : '会话 ') + head(id, 6)
  return '其他 ' + (key.length > 10 ? key.slice(0, 10) + '…' : key)
}

/** sess 截断 8 位（R3 脱敏口径）。 */
export function maskSession(sessionId: string): string {
  return sessionId.length > 8 ? sessionId.slice(0, 8) + '…' : sessionId
}

/** 幽灵 key：仅飞书 direct: 存量（他渠道 direct: 现行仍在产，见上游 delivery-suggestions）。 */
export function isGhost(key: string, channel: string): boolean {
  return channel === 'feishu' && key.startsWith('direct:')
}

/** 聚合投影：缺文件/坏文件按 bot 跳过（fail-soft），绝不抛错。 */
export async function collectRoutes(
  dshHome: string, bots: RouteBot[],
): Promise<{ routes: RouteRow[]; skipped: RouteSkip[] }> {
  const routes: RouteRow[] = []
  const skipped: RouteSkip[] = []
  const seen = new Set<string>()
  for (const b of bots ?? []) {
    const channel = String(b?.channel ?? '')
    const botId = String(b?.botId ?? '')
    const files = candidateStateFiles(dshHome, channel, botId)
    if (!files.length) { skipped.push({ channel, botId, reason: 'bad-bot' }); continue }
    let merged: Record<string, string> = {}
    let touched = false
    let failed = false
    for (const f of files) {
      let text: string
      try {
        text = await fs.readFile(f, 'utf8')
      } catch (e) {
        if ((e as { code?: string })?.code !== 'ENOENT') failed = true
        continue
      }
      touched = true
      // 先读权重高：per-bot 文件先入 merged，后读的 legacy 只补缺（防旧账覆盖新绑）。
      merged = { ...parseSessionsText(text), ...merged }
    }
    if (!touched) { skipped.push({ channel, botId, reason: failed ? 'unreadable' : 'no-state' }); continue }
    for (const [k, v] of Object.entries(merged)) {
      const dedupe = channel + '\0' + botId + '\0' + k
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      routes.push({ channel, botId, chat: maskChat(k, channel), session: maskSession(v), ghost: isGhost(k, channel) })
    }
  }
  routes.sort((a, b) =>
    a.channel < b.channel ? -1 : a.channel > b.channel ? 1
    : a.botId < b.botId ? -1 : a.botId > b.botId ? 1
    : a.chat < b.chat ? -1 : a.chat > b.chat ? 1 : 0)
  return { routes, skipped }
}
