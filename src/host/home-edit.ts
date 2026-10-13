/** 家/助理改名配图/占位/绑定/删除宿主薄封装（T6b #114 · T3 #116）。
 * 与 home-store 同队列（modifyHomesDoc）防读-改-写交错；旧 create* 不动。
 * 删助理只删助理行，不碰机器人连接（不断连、不调 bot.delete，验收④）。 */
import { modifyHomesDoc } from './home-store.js'
import type { AssistantRow, HomeRow } from './home-store.js'

function sn(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}
function okAvatar(v: unknown): v is string {
  return typeof v === 'string' && /^[1-6]$/.test(v)
}
function nid(now: number): string {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  } catch { /* 回落 */ }
  return 'h-' + Math.floor(now).toString(36) + '-' + Math.floor(Math.random() * 36 ** 8).toString(36)
}

type R<T> = Promise<{ ok: true; row: T } | { ok: false; code: string; message: string }>

/** 家改名/配图：name undefined=不动，""=恢复默认；avatar undefined=不动，null=默认，"1"-"6"=选色。 */
export function updateHomeRow(file: string, input: { id: string; name?: string | null; avatar?: string | null }): R<HomeRow> {
  const id = sn(input.id, 64).trim()
  if (!id) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id 必填' })
  const hasName = input.name !== undefined
  const hasAvatar = input.avatar !== undefined
  if (!hasName && !hasAvatar) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'name/avatar 至少其一' })
  if (hasAvatar && input.avatar !== null && input.avatar !== undefined && !okAvatar(input.avatar)) {
    return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'avatar 取 1-6 或空' })
  }
  return modifyHomesDoc(file, (doc) => {
    const h = doc.homes.find((x) => x.id === id)
    if (!h) return { ok: false as const, code: 'not-found', message: '家不存在' }
    const now = Date.now()
    if (hasName) {
      const t = sn(input.name ?? '', 64).trim()
      if (t) { h.name = t; h.nameSource = 'user' }
      else { h.name = ''; h.nameSource = 'system' }
    }
    if (hasAvatar) {
      if (input.avatar === null || input.avatar === undefined) { h.avatar = null; h.avatarSource = 'default' }
      else { h.avatar = input.avatar; h.avatarSource = 'user' }
    }
    h.updatedAt = now
    return { ok: true as const, row: h }
  })
}

/** 助理改名/配图：""恢复默认（有号走bot、无号走home）。 */
export function updateAssistantRow(file: string, input: { id: string; name?: string | null; avatar?: string | null }): R<AssistantRow> {
  const id = sn(input.id, 64).trim()
  if (!id) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id 必填' })
  const hasName = input.name !== undefined
  const hasAvatar = input.avatar !== undefined
  if (!hasName && !hasAvatar) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'name/avatar 至少其一' })
  if (hasAvatar && input.avatar !== null && input.avatar !== undefined && !okAvatar(input.avatar)) {
    return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'avatar 取 1-6 或空' })
  }
  return modifyHomesDoc(file, (doc) => {
    const a = doc.assistants.find((x) => x.id === id)
    if (!a) return { ok: false as const, code: 'not-found', message: '助理不存在' }
    if (hasName) {
      const t = sn(input.name ?? '', 64).trim()
      if (t) { a.name = t; a.nameSource = 'user' }
      else { a.name = ''; a.nameSource = a.botId ? 'bot' : 'home' }
    }
    if (hasAvatar) {
      if (input.avatar === null || input.avatar === undefined) { a.avatar = null; a.avatarSource = 'default' }
      else { a.avatar = input.avatar; a.avatarSource = 'user' }
    }
    return { ok: true as const, row: a }
  })
}

/** 未绑定占位：channel 必填；botId=null；名字非空即 user 否则 home（验收③，不产生脏数据：不占号）。 */
export function createUnboundRow(file: string, input: { homeId: string; channel: string; name?: string }): R<AssistantRow> {
  const homeId = sn(input.homeId, 64).trim()
  const channel = sn(input.channel, 64).trim()
  if (!homeId || !channel) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'homeId/channel 必填' })
  return modifyHomesDoc(file, (doc) => {
    if (!doc.homes.some((h) => h.id === homeId)) return { ok: false as const, code: 'not-found', message: '家不存在' }
    const t = sn(input.name ?? '', 64).trim()
    const now = Date.now()
    const row: AssistantRow = {
      id: nid(now), homeId, channel, botId: null, status: 'unbound',
      name: t, nameSource: t ? 'user' : 'home',
      avatar: null, avatarSource: 'default', createdAt: now, boundAt: null,
    }
    doc.assistants.push(row)
    return { ok: true as const, row }
  })
}

/** 占位绑定：只收 unbound/orphan；一对一（仅 bound 占号）；user 改名保留（验收③）。 */
export function bindAssistantRow(
  file: string,
  input: { id: string; channel: string; botId: string; botName?: string; homeText?: string },
): R<AssistantRow> {
  const id = sn(input.id, 64).trim()
  const channel = sn(input.channel, 64).trim()
  const botId = sn(input.botId, 256).trim()
  if (!id || !channel || !botId) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id/channel/botId 必填' })
  return modifyHomesDoc(file, (doc) => {
    const a = doc.assistants.find((x) => x.id === id)
    if (!a) return { ok: false as const, code: 'not-found', message: '助理不存在' }
    if (a.status === 'bound') return { ok: false as const, code: 'bad-request', message: '已绑定，无需再绑' }
    if (doc.assistants.some((x) => x.id !== id && x.botId === botId && x.channel === channel && x.status === 'bound')) {
      return { ok: false as const, code: 'already-bound', message: '该机器人已被绑定（一对一）' }
    }
    const keep = a.nameSource === 'user' && a.name.trim()
    const botName = sn(input.botName ?? '', 64).trim()
    const homeText = sn(input.homeText ?? '', 64).trim()
    a.channel = channel
    a.botId = botId
    a.status = 'bound'
    a.boundAt = Date.now()
    if (keep) { a.nameSource = 'user' } else { a.name = botName || homeText || '未命名助理'; a.nameSource = botName ? 'bot' : 'home' }
    return { ok: true as const, row: a }
  })
}

/** 删助理：只删行，不调任何机器人 RPC（不断连接，验收④）；删后该号即空闲可重绑。 */
export function removeAssistantRow(file: string, input: { id: string }): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const id = sn(input.id, 64).trim()
  if (!id) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id 必填' })
  return modifyHomesDoc(file, (doc) => {
    const i = doc.assistants.findIndex((x) => x.id === id)
    if (i < 0) return { ok: false as const, code: 'not-found', message: '助理不存在' }
    doc.assistants.splice(i, 1)
    return { ok: true as const }
  })
}
