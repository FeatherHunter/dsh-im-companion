/** 家/助理新表宿主薄封装（T3 #116 · 契约 §3 家/助理新表行：新表新名、旧 Agent 码不动、映射隔离）。
 * 存储：与 meta.yaml 同目录的 homes.yaml（{version:2,homes[],assistants[]}，T12 #129 起 YAML；旧表一字不动）。
 * T6a 范围：list / createHome（选已有区，幂等键=规范路径）/ createAssistant（同时绑，严格一对一）。
 * 不做：头像文件化、未绑定占位、搬家、迁移（旧 names/avatars/locals 封存只读，迁移归 T6c/后续）。
 * 语义冻结遵 src/features/home-assistant/model.ts（形状一致，字段名同速记， host/client 分构建各持一份）。
 *
 * 分层（2026-10-15 事故复盘后拆开）：**跟盘打交道**的活（读回/判态/写闸/行清洗/留痕）在
 * `home-store-io.ts`；本文件只放**家的领域动作**（建家/建助理/seed 批量）与进程内写串行队列。
 * 拆的直接原因：行数红线 300 与数据保护闸撞在一起（见 home-store-io.ts 顶部的事故复盘口径）。 */
import path from 'node:path'
import { configDirFor } from './config-yaml.js'
import { pickAssistantFields, stripEmptyFields, validateAssistantFields } from '../assistant-fields.js'
import {
  assertWritable, cleanAssistant, cleanHome, isAvatarCode, loadHomesDocState, writeGuarded,
  type AssistantRow, type HomeRow, type HomesDoc, type HomesLoadState,
} from './home-store-io.js'

export {
  ConfigReadFailedError, isAvatarCode, loadHomesDoc, loadHomesDocState, setHomeStoreLog, writableFrom,
} from './home-store-io.js'
export type { AssistantRow, HomeRow, HomesDoc, HomesLoadState } from './home-store-io.js'

export function homesFileFor(dshHome: string): string {
  return path.join(configDirFor(dshHome), 'homes.yaml')
}

/** 进程内写串行（meta-store.ts 同款 writeQueue 口径）：读-改-写跨 await，
 * 并发 create 若交错会丢一次写入；单用户连点由视图 creating 守卫挡，宿主侧再串行一道。 */
let writeQueue: Promise<unknown> = Promise.resolve()

function normPath(p: string): string {
  return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}

function genId(now: number): string {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  } catch { /* 回落 */ }
  return 'h-' + Math.floor(now).toString(36) + '-' + Math.floor(Math.random() * 36 ** 8).toString(36)
}

function sanitize(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/** 读-改-写串行口（T6b #114：改名/配图/占位/绑定/删除共用；与下同队列防交错）。
 *  两道闸见 home-store-io.ts：**fail-closed**（读回不可信 ⇒ 抛错拒写）＋ **dirty 守卫**（文本没变不写）。 */
export async function modifyHomesDoc<T>(file: string, fn: (doc: HomesDoc) => T | Promise<T>): Promise<T> {
  let out!: T
  const job = writeQueue.then(async () => {
    const { doc, state, original } = await loadHomesDocState(file)
    assertWritable(file, state)
    out = await fn(doc)
    await writeGuarded(file, doc, state, original)
  })
  /* 队列自身必须挂兜底 catch：`job` 会被存回 writeQueue，而调用方 try/catch 接走的是**另一条**
   * await 链（`await job`）。若不加这行，拒绝会同时以「无人接管的 writeQueue」形态冒成
   * unhandledRejection —— 拒写这道闸本意是**保护数据**，不能反过来把进程搞崩。
   * （2026-10-15 探针实测：不加则 `node` 直接以 ConfigReadFailedError 退出码 1 崩掉。） */
  writeQueue = job.catch(() => {})
  await job
  return out
}

async function persistDoc(file: string, doc: HomesDoc, state: HomesLoadState = 'ok', original: string | null = null): Promise<void> {
  const job = writeQueue.then(() => writeGuarded(file, doc, state, original))
  writeQueue = job.catch(() => {})
  await job
}

export async function createHomeRow(
  file: string,
  input: { workspaceId: string; path: string; title: string },
): Promise<{ ok: true; home: HomeRow } | { ok: false; code: string; message: string }> {
  const wsId = sanitize(input.workspaceId, 256).trim()
  const p = sanitize(input.path, 2048).trim()
  const title = sanitize(input.title, 256).trim()
  if (!wsId || !p) return { ok: false, code: 'bad-request', message: 'workspaceId 与 path 必填' }
  const { doc, state, original } = await loadHomesDocState(file)
  assertWritable(file, state)
  const np = normPath(p)
  /* T10b #127 判重口径：墓碑行（用户「删除家」）**不占名额**——否则工作区重建时会被旧墓碑挡住。 */
  const dup = doc.homes.find((h) => !h.tombstone && (normPath(h.path) === np || (h.workspaceId && h.workspaceId === wsId)))
  if (dup) return { ok: false, code: 'already-exists', message: '该工作区已有家' }
  const base = p.split(/[\\/]+/).filter(Boolean).pop() ?? p
  const name = title === 'default-workspace' ? '默认工作区' : title || base
  const now = Date.now()
  const home: HomeRow = {
    id: genId(now), workspaceId: wsId, path: p, name, nameSource: 'system',
    avatar: null, avatarSource: 'default', createdAt: now, updatedAt: now,
  }
  doc.homes.push(home)
  await persistDoc(file, doc, state, original)
  return { ok: true, home }
}

export async function createAssistantRow(
  file: string,
  input: { homeId: string; channel: string; botId: string; botName?: string; homeText?: string; description?: unknown; persona?: unknown },
): Promise<{ ok: true; assistant: AssistantRow } | { ok: false; code: string; message: string }> {
  const homeId = sanitize(input.homeId, 64).trim()
  const channel = sanitize(input.channel, 64).trim()
  const botId = sanitize(input.botId, 256).trim()
  if (!homeId || !channel || !botId) return { ok: false, code: 'bad-request', message: 'homeId/channel/botId 必填' }
  /* #169：写入口才校验（超长/非字符串诚实拒绝、CRLF 归一、trim）；账本上已有的超长值不经这里。 */
  const fields = validateAssistantFields({ description: input.description, persona: input.persona })
  if (!fields.ok) return { ok: false, code: fields.code, message: fields.message }
  const { doc, state, original } = await loadHomesDocState(file)
  assertWritable(file, state)
  if (!doc.homes.some((h) => h.id === homeId)) return { ok: false, code: 'not-found', message: '家不存在' }
  if (doc.assistants.some((a) => a.botId === botId && a.channel === channel && a.status === 'bound')) {
    return { ok: false, code: 'already-bound', message: '该机器人已被绑定（一对一）' }
  }
  const botName = sanitize(input.botName, 64).trim()
  const homeText = sanitize(input.homeText, 64).trim()
  const now = Date.now()
  const assistant: AssistantRow = {
    id: genId(now), homeId, channel, botId, status: 'bound',
    name: botName || homeText || '未命名助理',
    nameSource: botName ? 'bot' : 'home',
    avatar: null, avatarSource: 'default', createdAt: now, boundAt: now,
    ...stripEmptyFields(fields.value),
  }
  doc.assistants.push(assistant)
  await persistDoc(file, doc, state, original)
  return { ok: true, assistant }
}

/** 批量种子落盘（T3 迁移幂等口径）：客户端 temp id 直传，宿主按规范路径匹配既有家并回填 id 映射；
 * 家判重（规范路径或 workspaceId）命中即复用既有行并回映射；助理判重（channel+botId bound）命中即跳过。
 * 整批一次读盘一次落盘；可重跑；旧 Agent 表不动。 */
export async function seedDocs(
  file: string,
  input: { homes: HomeRow[]; assistants: AssistantRow[] },
): Promise<{ homes: HomeRow[]; assistants: AssistantRow[] }> {
  const { doc, state, original } = await loadHomesDocState(file)
  assertWritable(file, state)
  const idMap = new Map<string, string>()
  const outHomes: HomeRow[] = []
  for (const r of input.homes || []) {
    const wsId = typeof r.workspaceId === 'string' ? sanitize(r.workspaceId, 256).trim() : ''
    const p = sanitize(r.path, 2048).trim()
    if (!wsId || !p) continue
    const np = normPath(p)
    /* T10b #127：命中判重同样跳过墓碑——删掉的家不会被 seed 复活，重建工作区得到的是全新家。 */
    const hit = doc.homes.find((h) => !h.tombstone && (normPath(h.path) === np || (h.workspaceId && h.workspaceId === wsId)))
    if (hit) {
      if (typeof r.id === 'string' && r.id) idMap.set(r.id, hit.id)
      outHomes.push(hit)
      continue
    }
    const now = Date.now()
    const hv = (r as { avatar?: unknown }).avatar
    const havatar = isAvatarCode(hv) ? hv : null
    const home: HomeRow = {
      id: typeof r.id === 'string' && r.id ? sanitize(r.id, 64) : genId(now),
      workspaceId: wsId, path: p,
      name: sanitize(r.name, 64) || p,
      nameSource: r.nameSource === 'user' ? 'user' : 'system',
      avatar: havatar, avatarSource: havatar ? 'user' : 'default', createdAt: now, updatedAt: now,
    }
    doc.homes.push(home)
    if (typeof r.id === 'string' && r.id) idMap.set(r.id, home.id)
    outHomes.push(home)
  }
  const homeIds = new Set(doc.homes.map((h) => h.id))
  const outAssistants: AssistantRow[] = []
  for (const r of input.assistants || []) {
    const channel = sanitize(r.channel, 64).trim()
    const botId = sanitize((r.botId ?? '') as string, 256).trim() || null
    const wantUnbound = (r.status === 'unbound' || r.status === 'orphan') && !botId
    /* #138 渠道诚实性：未绑定/孤儿行的 channel 允许为空（没绑过就没有渠道，客户端不再编）。
     * **这一行必须先于「停止写假值」落地**——老写法 `if (!channel || …)` 会把空渠道行整行丢掉 = 静默数据丢失。 */
    if (!wantUnbound && (!channel || !botId)) continue
    if (botId && doc.assistants.some((a) => a.botId === botId && a.channel === channel && a.status === 'bound')) continue
    const rawHome = typeof r.homeId === 'string' ? r.homeId : ''
    const homeId = idMap.get(rawHome) ?? rawHome
    if (!homeId || !homeIds.has(homeId)) continue
    const now = Date.now()
    const botName = sanitize(r.name, 64).trim()
    const av = (r as { avatar?: unknown }).avatar
    const avatar = isAvatarCode(av) ? av : null
    if (wantUnbound) {
      outAssistants.push({
        id: typeof r.id === 'string' && r.id ? sanitize(r.id, 64) : genId(now),
        homeId, channel, botId: null, status: r.status === 'orphan' ? 'orphan' : 'unbound',
        name: botName || '未命名助理',
        nameSource: (r.nameSource === 'user' ? 'user' : 'home'),
        avatar, avatarSource: avatar ? 'user' : 'default', createdAt: now, boundAt: null,
        ...pickAssistantFields(r),
      })
      continue
    }
    outAssistants.push({
      id: typeof r.id === 'string' && r.id ? sanitize(r.id, 64) : genId(now),
      homeId, channel, botId, status: 'bound',
      name: botName || '未命名助理',
      nameSource: (r.nameSource === 'home' ? 'home' : 'bot'),
      avatar, avatarSource: avatar ? 'user' : 'default', createdAt: now, boundAt: now,
      ...pickAssistantFields(r),
    })
  }
  doc.assistants.push(...outAssistants)
  await persistDoc(file, doc, state, original)
  return { homes: outHomes, assistants: outAssistants }
}

/* 行清洗（cleanHome / cleanAssistant）从 io 层再导出：`rpc.ts` 与若干验证物按老路径引用它们。 */
export { cleanAssistant, cleanHome }
