/** 家/助理改名配图纯逻辑（T6b #114 · T3 #116 语义冻结）。
 * 家命名链：user > 工作区标题 > 目录基名；助理：user > 机器人名 > 家名 > 缺省。
 * 头像：null=默认图（首字+id派生色，弹层已不提供该选项，仅兼容旧数据），"1".."9"=用户选色（home-identity.PRESETS 第几档，实色），非法一律拒收。
 * 未绑定占位：channel 必填、botId=null、boundAt=null；绑定只收 unbound/orphan，已绑拒收。
 * 纯函数无 IO；宿主落盘见 src/host/home-edit.ts（同语义薄封装）。 */
import type { Assistant, Home } from './home-model'
import { ASSISTANT_FIELDS, normalizeFieldText } from '../../assistant-fields'

export function trimName(s: unknown, max = 64): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : ''
}

export function isAvatarCode(v: unknown): v is string {
  return typeof v === 'string' && /^[1-9]$/.test(v)
}

/** 家改名/配图预览：name undefined=不动，""=恢复默认(system)，非空=user；avatar undefined=不动，null=默认。非法返回 null。 */
export function applyHomeUpdate(
  home: Home,
  patch: { name?: string | null; avatar?: string | null },
  now = Date.now(),
): Home | null {
  if (!home || !home.id) return null
  const next: Home = { ...home }
  if (patch.name !== undefined) {
    /* 空白一律按空处理＝恢复默认（输入框全空格 Say 清空，用户意图即“不要手改名”） */
    const t = trimName(patch.name ?? '')
    if (t) { next.name = t; next.nameSource = 'user' }
    else { next.name = ''; next.nameSource = 'system' }
    next.updatedAt = now
  }
  if (patch.avatar !== undefined) {
    const a = patch.avatar
    if (a === null) { next.avatar = null; next.avatarSource = 'default' }
    else if (isAvatarCode(a)) { next.avatar = a; next.avatarSource = 'user' }
    else return null
    next.updatedAt = now
  }
  return next
}

/** 助理改名/配图/两栏预览：""恢复默认（有号走bot、无号走home）；两栏空串＝清空（删键）。 */
export function applyAssistantUpdate(
  a: Assistant,
  patch: { name?: string | null; avatar?: string | null } & { description?: string | null; persona?: string | null },
): Assistant | null {
  if (!a || !a.id) return null
  const next: Assistant = { ...a }
  if (patch.name !== undefined) {
    const t = trimName(patch.name ?? '')
    if (t) { next.name = t; next.nameSource = 'user' }
    else {
      next.name = ''
      next.nameSource = a.botId ? 'bot' : 'home'
    }
  }
  if (patch.avatar !== undefined) {
    const av = patch.avatar
    if (av === null) { next.avatar = null; next.avatarSource = 'default' }
    else if (isAvatarCode(av)) { next.avatar = av; next.avatarSource = 'user' }
    else return null
  }
  /* #169 两栏：归一（CRLF→LF、trim）后落键；给空串 / null ⇒ 删键——与宿主写入同一套规则。 */
  for (const field of ASSISTANT_FIELDS) {
    const v = (patch as Record<string, unknown>)[field]
    if (v === undefined) continue
    const t = normalizeFieldText(v)
    if (t) next[field] = t
    else delete next[field]
  }
  return next
}

/** 未绑定占位（T6b 验收③前半）：channel 必填（单渠道语义），botId=null；名字非空即user否则home。 */
export function makeUnboundAssistant(
  input: { homeId: string; channel: string; name?: string; description?: string; persona?: string },
  now = Date.now(),
): Assistant | null {
  const homeId = trimName(input.homeId)
  const channel = trimName(input.channel)
  if (!homeId || !channel) return null
  const t = trimName(input.name ?? '')
  const fields: { description?: string; persona?: string } = {}
  for (const field of ASSISTANT_FIELDS) {
    const v = normalizeFieldText(input[field])
    if (v) fields[field] = v
  }
  return {
    id: '', homeId, channel, botId: null, status: 'unbound',
    name: t, nameSource: t ? 'user' : 'home',
    avatar: null, avatarSource: 'default', createdAt: now, boundAt: null,
    ...fields,
  }
}

/** 占位绑定（T6b 验收③后半）：只收 unbound/orphan；严格一对一（仅 bound 占号）；user 改名不丢。 */
export function applyBind(
  a: Assistant,
  input: { channel: string; botId: string; botName?: string; homeText?: string },
  existing: Assistant[],
  now = Date.now(),
): Assistant | null {
  if (!a || a.status === 'bound') return null
  const channel = trimName(input.channel)
  const botId = typeof input.botId === 'string' ? input.botId.trim().slice(0, 256) : ''
  if (!channel || !botId) return null
  const clash = (existing || []).some(
    (x) => x && x.id !== a.id && x.botId === botId && x.channel === channel && x.status === 'bound',
  )
  if (clash) return null
  const keepUser = a.nameSource === 'user' && trimName(a.name)
  const botName = trimName(input.botName ?? '')
  const homeText = trimName(input.homeText ?? '')
  const name = keepUser ? trimName(a.name) : botName || homeText || '未命名助理'
  return {
    ...a, channel, botId, status: 'bound', boundAt: now,
    name, nameSource: keepUser ? 'user' : botName ? 'bot' : 'home',
  }
}