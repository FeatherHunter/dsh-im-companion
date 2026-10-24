/** left-badges 助理脸：家表助理 avatar 标记 → 悬浮卡行首脸（面板同款视觉语言）。
 * 优先级：助理上传图（img: + avatar.get 已到）> 归属图标＋归属色板（家=房子/助理=小机器人，见 panel-identity）> 渠道机器人头像 > 首字灰底。
 * 家/助理两套图标与色板是 components/home-identity.ts / home-icons.ts 的只读镜像（feature 禁引 A1 私有）；verify 钉 parity，漂移即红。
 * 无自有轮询：home.list/avatar.get 只在 view.ts 快照里调；图未到先画归属色脸（与面板 avatarSrc 同款回落）。
 * 取图韧性（#190 验收问题二）：宿主明确无图＝负缓存不再问；调用失败（超时/异常）最多重试 3 次并落 warn 证据。 */
import type { Assistant, Home } from '../../client/data/home-model'
import type { BotSnap, RpcCall } from '../../client/data/fleet-api'
import { botDisplayLabel } from '../../client/data/fleet-api'
import { logLine, logOn } from '../../client/log'
import { avatarStyleFor, glyphSvg, initialsOf, type GlyphName } from './panel-identity'

export type { GlyphName }
export { initialsOf }
export interface FaceDesc { img: string | null; tint: string; initial: string; icon?: GlyphName }
export interface FaceHit { desc: FaceDesc; name: string }
export type FaceOf = (b: BotSnap) => FaceHit

/** 面板同款家色板（home-identity.avatarStyle 同字面量，见文件头 parity 说明；旧口径保留）。 */
export function faceStyle(id: string, avatar: string | null = null): string {
  return avatarStyleFor('home', id, avatar)
}
/** 图片标记（与宿主 AVATAR_PREFIX 同字面量 `img:`，跨端各持一份）。 */
export function hasFaceImage(avatar: string | null | undefined): boolean {
  return typeof avatar === 'string' && avatar.startsWith('img:') && avatar.length > 4
}
function normPath(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}

/** bot → 助理：已绑精确配（渠道+botId 优先，botId 兜底，与面板 botOf 同序）→ 同路家首助理 → null。
 *  注：卡片实体分类不再用这里的长兜底（Q4：botId 无匹配即游离机器人），此函数保留给旧调用/回归。 */
export function matchAssistant(assistants: Assistant[], homes: Home[], bot: BotSnap, wsPath: string): Assistant | null {
  const list = assistants || []
  if (bot?.botId) {
    const byKey = list.find((a) => a && a.botId === bot.botId && (!a.channel || a.channel === bot.channel))
    if (byKey) return byKey
    const byId = list.find((a) => a && a.botId === bot.botId)
    if (byId) return byId
  }
  const home = (homes || []).find((h) => h && !h.tombstone && normPath(h.path) === normPath(wsPath))
  if (!home) return null
  return list.find((a) => a && a.homeId === home.id) ?? null
}

/** 行脸（纯函数可单测）：用户改名优先作名；图只认已到缓存（未到画归属色脸，不等）。 */
export function faceFor(bot: BotSnap, assistants: Assistant[], homes: Home[], wsPath: string, images: ReadonlyMap<string, string>): FaceHit {
  const label = botDisplayLabel(bot)
  const asst = matchAssistant(assistants, homes, bot, wsPath)
  const user = asst && asst.nameSource === 'user' && asst.name.trim() ? asst.name.trim() : ''
  const shown = user || label
  if (asst) {
    const hit = hasFaceImage(asst.avatar) ? images.get(asst.id) : undefined
    if (hit) return { desc: { img: hit, tint: '', initial: '' }, name: shown }
    return { desc: { img: null, tint: avatarStyleFor('assistant', asst.id, asst.avatar), initial: initialsOf(shown), icon: 'bot' }, name: shown }
  }
  const url = (bot.avatarUrl || '').trim()
  if (url) return { desc: { img: url, tint: '', initial: '' }, name: shown }
  return { desc: { img: null, tint: '', initial: initialsOf(shown) }, name: shown }
}

/** 顶栏工作区脸（纯函数可单测）：同路家的 avatar → 上传图（已到）/归属色脸（家＝房子图标＋家色板）；无家回名首字灰底。 */
export function homeFaceFor(wsPath: string, agentName: string, homes: Home[], images: ReadonlyMap<string, string>): FaceHit {
  const shown = String(agentName ?? '').trim() || '?'
  const home = (homes || []).find((h) => h && !h.tombstone && normPath(h.path) === normPath(wsPath)) ?? null
  if (!home) return { desc: { img: null, tint: '', initial: initialsOf(shown) }, name: shown }
  const hit = hasFaceImage(home.avatar) ? images.get(home.id) : undefined
  if (hit) return { desc: { img: hit, tint: '', initial: '' }, name: shown }
  return { desc: { img: null, tint: avatarStyleFor('home', home.id, home.avatar), initial: initialsOf(shown), icon: 'home' }, name: shown }
}

/** 脸格渲染（hover-card 行内调用；有图挂 img，有归属图标挂 svg，否则色脸首字）。 */
export function paintFace(desc: FaceDesc): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    const d = document.createElement('span')
    d.setAttribute('class', 'left-badges-card-avatar')
    if (desc.img) {
      const img = document.createElement('img')
      for (const [k, v] of [['src', desc.img], ['alt', ''], ['width', '16'], ['height', '16'], ['draggable', 'false']]) img.setAttribute(k, v)
      d.appendChild(img)
    } else {
      if (desc.tint) d.setAttribute('style', desc.tint)
      if (desc.icon) {
        try { d.innerHTML = glyphSvg(desc.icon, 12) } catch { d.textContent = desc.initial || '?' }
      } else {
        d.textContent = desc.initial || '?'
      }
    }
    return d as unknown as HTMLElement
  } catch { return null }
}

const BRIDGE = '/im-companion'
/** 桥偶发慢/超时（#190 验收问题二：8s 取图超时被静默丢弃 ⇒ 头像永不出现，且旧实现失败后不再重试）；取图给足 12s。 */
const RPC_TIMEOUT_MS = 12000
/** 家表 TTL：家表只在过期时重读，避免每次快照都打一次 home.list。 */
const HOMES_TTL_MS = 60000
/** 调用失败最多重试次数（超时/异常）；宿主明确答复「没有图」则永久不再问。 */
const MAX_IMAGE_TRIES = 3

export interface FaceSnapshot {
  homes: Home[]
  assistants: Assistant[]
  images: ReadonlyMap<string, string>
}

/** 家表 + 上传图缓存（view.ts 每次 stream 快照里 refresh；resolve 只纯读，不等）。 */
export function mountAssistantFaces(rpc: RpcCall | null): {
  faceOf: (b: BotSnap, wsPath: string) => FaceHit
  homeFaceOf: (wsPath: string, agentName: string) => FaceHit
  snapshot: () => FaceSnapshot
  refresh: () => Promise<void>
} {
  let homes: Home[] = []
  let assistants: Assistant[] = []
  const images = new Map<string, string>()
  /** 宿主明确答复无图（key=id+头像标记）：永久负缓存，不反复问。 */
  const denied = new Set<string>()
  /** 调用失败次数（key=id+头像标记）：可重试，最多 MAX_IMAGE_TRIES 次。 */
  const misses = new Map<string, number>()
  let homesAt = 0
  let inflight: Promise<void> | null = null
  const faceOf = (b: BotSnap, wsPath: string): FaceHit => faceFor(b, assistants, homes, wsPath, images)
  const homeFaceOf = (wsPath: string, agentName: string): FaceHit => homeFaceFor(wsPath, agentName, homes, images)
  const snapshot = (): FaceSnapshot => ({ homes, assistants, images })
  const cacheKey = (id: string, avatar: string | null): string => id + '\u0000' + String(avatar ?? '')
  /** 待取图清单：key 带头像标记 ⇒ 面板换了头像会重新取；失败超限的跳过。 */
  const pending = (): Array<{ key: string; id: string }> => {
    const out: Array<{ key: string; id: string }> = []
    const seen = new Set<string>()
    const push = (id: string, avatar: string | null): void => {
      if (!id || seen.has(id) || !hasFaceImage(avatar)) return
      seen.add(id)
      const key = cacheKey(id, avatar)
      if (images.has(id) || denied.has(key) || (misses.get(key) ?? 0) >= MAX_IMAGE_TRIES) return
      out.push({ key, id })
    }
    for (const a of assistants) if (a) push(a.id, a.avatar)
    for (const h of homes) if (h) push(h.id, h.avatar)
    return out
  }
  const loadHomes = async (): Promise<void> => {
    if (!rpc) return
    try {
      const raw = await rpc(BRIDGE, 'home.list', {}, AbortSignal.timeout(RPC_TIMEOUT_MS)) as { ok?: boolean; value?: { homes?: unknown; assistants?: unknown } } | null
      if (raw?.ok !== true) return
      const v = raw.value
      homes = Array.isArray(v?.homes) ? v.homes as Home[] : []
      assistants = Array.isArray(v?.assistants) ? v.assistants as Assistant[] : []
      homesAt = Date.now()
    } catch (e) {
      /* 家表读不到就留旧表（脸回落渠道/首字），下次快照再试。 */
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-badges', action: 'faces.home-fail', ok: false, message: String((e as Error)?.message ?? e) })
    }
  }
  const loadImages = async (): Promise<void> => {
    if (!rpc) return
    const items = pending()
    if (!items.length) return
    const ids = [...new Set(items.map((i) => i.id))]
    let ok = false
    let got: Record<string, string> | null = null
    try {
      const raw = await rpc(BRIDGE, 'avatar.get', { ids }, AbortSignal.timeout(RPC_TIMEOUT_MS)) as { ok?: boolean; value?: { images?: Record<string, string> } } | null
      ok = raw?.ok === true
      got = ok && raw ? (raw.value?.images ?? null) : null
    } catch (e) {
      for (const it of items) misses.set(it.key, (misses.get(it.key) ?? 0) + 1)
      /* 取图失败＝「点开卡看不到头像」的直接证据：落 warn（resident），带原文与重试余地。 */
      logLine('warn', 'ui.action', { area: 'left-badges', action: 'faces.avatar-fail', ok: false, message: String((e as Error)?.message ?? e), count: items.length, limit: MAX_IMAGE_TRIES })
      return
    }
    for (const it of items) {
      const u = got?.[it.id]
      if (typeof u === 'string' && u.startsWith('data:image/')) {
        images.set(it.id, u)
        misses.delete(it.key)
      } else if (ok) {
        denied.add(it.key) /* 宿主明确说没有这张图，不再重问 */
      } else {
        misses.set(it.key, (misses.get(it.key) ?? 0) + 1)
      }
    }
    if (!ok) {
      logLine('warn', 'ui.action', { area: 'left-badges', action: 'faces.avatar-fail', ok: false, message: 'avatar.get 未成功', count: items.length, limit: MAX_IMAGE_TRIES })
    } else if (logOn('debug')) {
      logLine('debug', 'ui.action', { area: 'left-badges', action: 'faces.images', ok: true, asked: items.length, got: Object.keys(got ?? {}).length })
    }
  }
  const refresh = (): Promise<void> => {
    if (!rpc) return Promise.resolve()
    if (inflight) return inflight
    const run = async (): Promise<void> => {
      if (!homesAt || Date.now() - homesAt >= HOMES_TTL_MS) await loadHomes()
      await loadImages()
    }
    inflight = run().catch(() => {}).finally(() => { inflight = null })
    return inflight
  }
  return { faceOf, homeFaceOf, snapshot, refresh }
}
