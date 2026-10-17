/** left-badges 助理脸：家表助理 avatar 标记 → 悬浮卡行首脸（面板同款视觉语言）。
 * 优先级：助理上传图（img: + avatar.get 已到） > 助理预设/默认色脸（id 派生色相 + 名首字） > 渠道机器人头像 > 名首字。名：用户改名优先。
 * 色相/字形是 components/home-identity.ts 的只读镜像（feature 禁引 A1 私有）；verify 钉 parity，漂移即红。
 * 无自有轮询：home.list/avatar.get 只在 view.ts 快照 gate 里调；图未到先画色脸（与面板 avatarSrc 同款回落）。 */
import type { Assistant, Home } from '../../client/data/home-model'
import type { BotSnap, RpcCall } from '../../client/data/fleet-api'
import { botDisplayLabel } from '../../client/data/fleet-api'

export interface FaceDesc { img: string | null; tint: string; initial: string }
export interface FaceHit { desc: FaceDesc; name: string }
export type FaceOf = (b: BotSnap) => FaceHit

const HUE = [174, 205, 262, 32, 340, 150]
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
function hueOf(id: string, avatar: string | null = null): number {
  const i = avatar == null ? -1 : Number.parseInt(avatar, 10) - 1
  if (Number.isInteger(i) && i >= 0 && i < HUE.length) return HUE[i]
  return HUE[hash32(String(id ?? '')) % HUE.length]
}
function initialsOf(name: string): string {
  const s = String(name ?? '').trim()
  if (!s) return '?'
  if (!/^[\x20-\x7e]+$/.test(s)) return Array.from(s)[0] ?? '?'
  const words = s.split(/[-_\s.]+/).filter(Boolean)
  if (words.length >= 2) return ((words[0][0] ?? '') + (words[1][0] ?? '')).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}
/** 面板同款底色（home-identity.avatarStyle 同字面量，见文件头 parity 说明）。 */
export function faceStyle(id: string, avatar: string | null = null): string {
  const hue = hueOf(id, avatar)
  const bg = `color-mix(in srgb, hsl(${hue} 62% 50%) 28%, var(--hu-panel))`
  const fg = `color-mix(in srgb, hsl(${hue} 66% 44%) 62%, var(--hu-ink))`
  return `background:${bg};color:${fg}`
}
/** 图片标记（与宿主 AVATAR_PREFIX 同字面量 `img:`，跨端各持一份）。 */
export function hasFaceImage(avatar: string | null | undefined): boolean {
  return typeof avatar === 'string' && avatar.startsWith('img:') && avatar.length > 4
}
function normPath(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}

/** bot → 助理：已绑精确配（渠道+botId 优先，botId 兜底，与面板 botOf 同序）→ 同路家首助理 → null。 */
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

/** 行脸（纯函数可单测）：用户改名优先作名；图只认已到缓存（未到画色脸，不等）。 */
export function faceFor(bot: BotSnap, assistants: Assistant[], homes: Home[], wsPath: string, images: ReadonlyMap<string, string>): FaceHit {
  const label = botDisplayLabel(bot)
  const asst = matchAssistant(assistants, homes, bot, wsPath)
  const user = asst && asst.nameSource === 'user' && asst.name.trim() ? asst.name.trim() : ''
  const shown = user || label
  if (asst) {
    const hit = hasFaceImage(asst.avatar) ? images.get(asst.id) : undefined
    if (hit) return { desc: { img: hit, tint: '', initial: '' }, name: shown }
    return { desc: { img: null, tint: faceStyle(asst.id, asst.avatar), initial: initialsOf(shown) }, name: shown }
  }
  const url = (bot.avatarUrl || '').trim()
  if (url) return { desc: { img: url, tint: '', initial: '' }, name: shown }
  return { desc: { img: null, tint: '', initial: initialsOf(shown) }, name: shown }
}

/** 脸格渲染（hover-card 行内调用；有图挂 img，无图色脸首字）。 */
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
      d.textContent = desc.initial || '?'
    }
    return d as unknown as HTMLElement
  } catch { return null }
}

const BRIDGE = '/im-companion'

/** 家表 + 上传图缓存（view.ts 快照 gate 里 refresh；resolve 只纯读，不等）。 */
export function mountAssistantFaces(rpc: RpcCall | null): {
  faceOf: (b: BotSnap, wsPath: string) => FaceHit
  refresh: () => Promise<void>
} {
  let homes: Home[] = []
  let assistants: Assistant[] = []
  const images = new Map<string, string>()
  const asked = new Set<string>()
  const faceOf = (b: BotSnap, wsPath: string): FaceHit => faceFor(b, assistants, homes, wsPath, images)
  const refresh = async (): Promise<void> => {
    if (!rpc) return
    try {
      const raw = await rpc(BRIDGE, 'home.list', {}, AbortSignal.timeout(8000)) as { ok?: boolean; value?: { homes?: unknown; assistants?: unknown } } | null
      const v = raw?.ok === true ? raw.value : null
      homes = Array.isArray(v?.homes) ? v.homes as Home[] : []
      assistants = Array.isArray(v?.assistants) ? v.assistants as Assistant[] : []
    } catch { /* 家表读不到就留旧表（脸回落渠道/首字） */ }
    const need = assistants.filter((a) => a && hasFaceImage(a.avatar) && !images.has(a.id) && !asked.has(a.id)).map((a) => a.id)
    if (!need.length) return
    for (const id of need) asked.add(id)
    try {
      const raw = await rpc(BRIDGE, 'avatar.get', { ids: need }, AbortSignal.timeout(8000)) as { ok?: boolean; value?: { images?: Record<string, string> } } | null
      const got = raw?.ok === true ? raw.value?.images : null
      for (const id of need) {
        const u = got?.[id]
        if (typeof u === 'string' && u.startsWith('data:image/')) images.set(id, u)
      }
    } catch { /* 图未到留色脸 */ }
  }
  return { faceOf, refresh }
}
