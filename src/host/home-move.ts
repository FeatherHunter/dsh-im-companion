/** 助理搬家/解绑宿主薄封装（T6c #115 · T3 #116）。
 * 与 home-edit 同队列（modifyHomesDoc）防读-改-写交错；只动助理行，不碰家行与机器人连接。 */
import { modifyHomesDoc } from './home-store.js'
import type { AssistantRow } from './home-store.js'

function sn(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

type R = Promise<{ ok: true; row: AssistantRow } | { ok: false; code: string; message: string }>

/** 搬家：只换 homeId；目标家须存在且无墓碑；同家搬直接拒收（不产生脏写）。 */
export function moveAssistantRow(file: string, input: { id: string; targetHomeId: string }): R {
  const id = sn(input.id, 64).trim()
  const target = sn(input.targetHomeId, 64).trim()
  if (!id || !target) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id/targetHomeId 必填' })
  return modifyHomesDoc(file, (doc) => {
    const a = doc.assistants.find((x) => x.id === id)
    if (!a) return { ok: false as const, code: 'not-found', message: '助理不存在' }
    if (a.homeId === target) return { ok: false as const, code: 'bad-request', message: '已在该家，无需搬家' }
    const home = doc.homes.find((h) => h.id === target)
    if (!home) return { ok: false as const, code: 'not-found', message: '目标家不存在' }
    if (home.tombstone) return { ok: false as const, code: 'bad-request', message: '目标家已删除' }
    a.homeId = target
    return { ok: true as const, row: a }
  })
}

/** 解绑：只收 bound；orphan=true 为孤儿回落（留 boundAt），否则为显式移除（清 boundAt）；
 * user 改名保留，其余回落家名；bot 系头像清零。机器人连接一律不动（不断连）。 */
export function unbindAssistantRow(file: string, input: { id: string; orphan?: boolean }): R {
  const id = sn(input.id, 64).trim()
  const orphan = input.orphan === true
  if (!id) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id 必填' })
  return modifyHomesDoc(file, (doc) => {
    const a = doc.assistants.find((x) => x.id === id)
    if (!a) return { ok: false as const, code: 'not-found', message: '助理不存在' }
    if (a.status !== 'bound' || !a.botId) return { ok: false as const, code: 'bad-request', message: '未绑定，无需解绑' }
    const keep = a.nameSource === 'user' && a.name.trim()
    a.botId = null
    a.status = orphan ? 'orphan' : 'unbound'
    a.boundAt = orphan ? a.boundAt : null
    if (keep) { a.nameSource = 'user' } else { a.name = ''; a.nameSource = 'home' }
    if (a.avatarSource === 'bot') { a.avatar = null; a.avatarSource = 'default' }
    return { ok: true as const, row: a }
  })
}
