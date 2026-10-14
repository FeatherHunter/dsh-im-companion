/** 孤儿家宿主薄封装（T10b #127）：删除家（墓碑＋级联清助理行）/ 重绑到新工作区。
 * 与 home-edit/home-move 同队列（modifyHomesDoc）防读-改-写交错；旧 create* / update* 一字不动。
 * 判重口径（T10b 新口径）：**墓碑不挡路**——判重一律忽略墓碑行，否则「删掉的家」会把同名工作区的重建挡在门外
 * （客户端 seedGap 也已把墓碑行排除在占用之外，两侧必须同口径）。 */
import { modifyHomesDoc } from './home-store.js'
import type { HomeRow } from './home-store.js'

function sn(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/** 规范路径（与 home-store 的局部实现同口径；那里不导出，这里重复三行好过动共享层）。 */
function np(p: string): string {
  return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}

type R<T> = Promise<{ ok: true; row: T } | { ok: false; code: string; message: string }>

/** 删除家：一次写里打墓碑（**保留 workspaceId/path 供审计**）＋删掉该家名下全部助理行。
 *  为何级联：家没了，它下面的助理在视图里再也到不了，却仍以 bound 占着机器人号（一模一样对一），
 *  用户会撞上「该机器人已被绑定」而无处可解。机器人连接一律不动（不断连）——远端工作区由客户端 ops
 *  在调本端点**之前**清空（fail-closed），本模块不碰任何机器人 RPC。 */
export function removeHomeRow(file: string, input: { id: string }): R<HomeRow> {
  const id = sn(input.id, 64).trim()
  if (!id) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id 必填' })
  return modifyHomesDoc(file, (doc) => {
    const h = doc.homes.find((x) => x.id === id)
    if (!h) return { ok: false as const, code: 'not-found', message: '家不存在' }
    if (h.tombstone) return { ok: false as const, code: 'bad-request', message: '家已删除' }
    h.tombstone = { at: Date.now(), reason: '用户删除' }
    h.updatedAt = Date.now()
    doc.assistants = doc.assistants.filter((a) => a.homeId !== id)
    return { ok: true as const, row: h }
  })
}

/** 重绑（「选择工作区」）：家指向新工作区。workspaceId/path 必填；冲突只看**非墓碑行**（already-exists，不写半行）。
 *  名字：不给 `name` 就不动——nameSource 仍是 system 的家，显示按回落规则自动跟新工作区（T3 Q3 命名链）；
 *  给了 `name` 才落（"" ⇒ 恢复默认跟随）。 */
export function rebindHomeRow(
  file: string,
  input: { id: string; workspaceId: string; path: string; name?: string },
): R<HomeRow> {
  const id = sn(input.id, 64).trim()
  const wsId = sn(input.workspaceId, 256).trim()
  const p = sn(input.path, 2048).trim()
  if (!id || !wsId || !p) return Promise.resolve({ ok: false as const, code: 'bad-request', message: 'id/workspaceId/path 必填' })
  const target = np(p)
  return modifyHomesDoc(file, (doc) => {
    const h = doc.homes.find((x) => x.id === id)
    if (!h) return { ok: false as const, code: 'not-found', message: '家不存在' }
    if (h.tombstone) return { ok: false as const, code: 'bad-request', message: '家已删除，不能再重绑' }
    const dup = doc.homes.find((x) => x.id !== id && !x.tombstone
      && (np(x.path) === target || (!!x.workspaceId && x.workspaceId === wsId)))
    if (dup) return { ok: false as const, code: 'already-exists', message: '该工作区已有家' }
    h.workspaceId = wsId
    h.path = p
    if (typeof input.name === 'string') {
      const t = sn(input.name, 64).trim()
      if (t) { h.name = t; h.nameSource = 'user' } else { h.name = ''; h.nameSource = 'system' }
    }
    h.updatedAt = Date.now()
    return { ok: true as const, row: h }
  })
}
