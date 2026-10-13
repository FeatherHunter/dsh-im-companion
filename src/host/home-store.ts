/** 家/助理新表宿主薄封装（T3 #116 · 契约 §3 家/助理新表行：新表新名、旧 Agent 码不动、映射隔离）。
 * 存储：与 meta.json 同目录的 homes.json（{version:2,homes[],assistants[]}），旧表一字不动。
 * T6a 范围：list / createHome（选已有区，幂等键=规范路径）/ createAssistant（同时绑，严格一对一）。
 * 不做：头像文件化、未绑定占位、搬家、迁移（旧 names/avatars/locals 封存只读，迁移归 T6c/后续）。
 * 语义冻结遵 src/features/home-assistant/model.ts（形状一致，字段名同速记， host/client 分构建各持一份）。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface HomeRow {
  id: string
  workspaceId: string | null
  path: string
  name: string
  nameSource: 'user' | 'system'
  avatar: string | null
  avatarSource: 'user' | 'bot' | 'default'
  createdAt: number
  updatedAt: number
  tombstone?: { at: number; reason: string }
}

export interface AssistantRow {
  id: string
  homeId: string
  channel: string
  botId: string | null
  status: 'unbound' | 'bound' | 'orphan'
  name: string
  nameSource: 'user' | 'home' | 'bot'
  avatar: string | null
  avatarSource: 'user' | 'bot' | 'home' | 'default'
  createdAt: number
  boundAt: number | null
}

export interface HomesDoc {
  version: 2
  homes: HomeRow[]
  assistants: AssistantRow[]
}

const EMPTY: HomesDoc = { version: 2, homes: [], assistants: [] }

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

function cleanHome(r: unknown): HomeRow | null {
  const o = r as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const id = sanitize(o.id, 64)
  const p = sanitize(o.path, 2048)
  if (!id || !p) return null
  const ws = typeof o.workspaceId === 'string' ? sanitize(o.workspaceId, 256) || null : null
  const name = sanitize(o.name, 64) || p
  const tomb = o.tombstone as { at?: unknown; reason?: unknown } | null | undefined
  const tombstone = tomb && typeof tomb === 'object' && typeof tomb.at === 'number' && typeof tomb.reason === 'string'
    ? { at: tomb.at, reason: tomb.reason.slice(0, 256) }
    : undefined
  return {
    id,
    workspaceId: ws,
    path: p,
    name,
    nameSource: o.nameSource === 'user' ? 'user' : 'system',
    avatar: null,
    avatarSource: 'default',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    ...(tombstone ? { tombstone } : {}),
  }
}

function cleanAssistant(r: unknown, homeIds: Set<string>): AssistantRow | null {
  const o = r as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const id = sanitize(o.id, 64)
  const homeId = sanitize(o.homeId, 64)
  const channel = sanitize(o.channel, 64)
  if (!id || !homeId || !channel || !homeIds.has(homeId)) return null
  // T6a 只建 bound（createAssistantRow 仍要求 botId 必填），但加载必须保留
  // unbound/orphan（一等状态，T6b/c 数据），否则重读会静默丢数据。
  const botId = typeof o.botId === 'string' && o.botId ? sanitize(o.botId, 256) : null
  const status = o.status === 'unbound' ? 'unbound' : o.status === 'orphan' ? 'orphan' : 'bound'
  if (status === 'bound' && !botId) return null
  return {
    id,
    homeId,
    channel,
    botId,
    status,
    name: sanitize(o.name, 64) || botId || '未命名助理',
    nameSource: o.nameSource === 'user' ? 'user' : o.nameSource === 'home' ? 'home' : 'bot',
    avatar: null,
    avatarSource: 'default',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    boundAt: typeof o.boundAt === 'number' ? o.boundAt : Date.now(),
  }
}

export function homesFileFor(dshHome: string): string {
  return path.join(dshHome, 'integrations', 'dsh-im-companion', 'homes.json')
}

export async function loadHomesDoc(file: string): Promise<HomesDoc> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as { homes?: unknown[]; assistants?: unknown[] } | null
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY, homes: [], assistants: [] }
    const homes = Array.isArray(parsed.homes) ? parsed.homes.map(cleanHome).filter((x): x is HomeRow => !!x) : []
    const ids = new Set(homes.map((h) => h.id))
    const assistants = Array.isArray(parsed.assistants)
      ? parsed.assistants.map((r) => cleanAssistant(r, ids)).filter((x): x is AssistantRow => !!x)
      : []
    return { version: 2, homes, assistants }
  } catch {
    return { ...EMPTY, homes: [], assistants: [] }
  }
}

async function persistDoc(file: string, doc: HomesDoc): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8')
    await fs.rename(tmp, file)
  })
  await writeQueue
}

export async function createHomeRow(
  file: string,
  input: { workspaceId: string; path: string; title: string },
): Promise<{ ok: true; home: HomeRow } | { ok: false; code: string; message: string }> {
  const wsId = sanitize(input.workspaceId, 256).trim()
  const p = sanitize(input.path, 2048).trim()
  const title = sanitize(input.title, 256).trim()
  if (!wsId || !p) return { ok: false, code: 'bad-request', message: 'workspaceId 与 path 必填' }
  const doc = await loadHomesDoc(file)
  const np = normPath(p)
  const dup = doc.homes.find((h) => normPath(h.path) === np || (h.workspaceId && h.workspaceId === wsId))
  if (dup) return { ok: false, code: 'already-exists', message: '该工作区已有家' }
  const base = p.split(/[\\/]+/).filter(Boolean).pop() ?? p
  const name = title === 'default-workspace' ? '默认工作区' : title || base
  const now = Date.now()
  const home: HomeRow = {
    id: genId(now), workspaceId: wsId, path: p, name, nameSource: 'system',
    avatar: null, avatarSource: 'default', createdAt: now, updatedAt: now,
  }
  doc.homes.push(home)
  await persistDoc(file, doc)
  return { ok: true, home }
}

export async function createAssistantRow(
  file: string,
  input: { homeId: string; channel: string; botId: string; botName?: string; homeText?: string },
): Promise<{ ok: true; assistant: AssistantRow } | { ok: false; code: string; message: string }> {
  const homeId = sanitize(input.homeId, 64).trim()
  const channel = sanitize(input.channel, 64).trim()
  const botId = sanitize(input.botId, 256).trim()
  if (!homeId || !channel || !botId) return { ok: false, code: 'bad-request', message: 'homeId/channel/botId 必填' }
  const doc = await loadHomesDoc(file)
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
  }
  doc.assistants.push(assistant)
  await persistDoc(file, doc)
  return { ok: true, assistant }
}

/** 批量种子落盘（T3 迁移幂等口径）：客户端 temp id 直传，宿主按规范路径匹配既有家并回填 id 映射；
 * 家判重（规范路径或 workspaceId）命中即复用既有行并回映射；助理判重（channel+botId bound）命中即跳过。
 * 整批一次读盘一次落盘；可重跑；旧 Agent 表不动。 */
export async function seedDocs(
  file: string,
  input: { homes: HomeRow[]; assistants: AssistantRow[] },
): Promise<{ homes: HomeRow[]; assistants: AssistantRow[] }> {
  const doc = await loadHomesDoc(file)
  const idMap = new Map<string, string>()
  const outHomes: HomeRow[] = []
  for (const r of input.homes || []) {
    const wsId = typeof r.workspaceId === 'string' ? sanitize(r.workspaceId, 256).trim() : ''
    const p = sanitize(r.path, 2048).trim()
    if (!wsId || !p) continue
    const np = normPath(p)
    const hit = doc.homes.find((h) => normPath(h.path) === np || (h.workspaceId && h.workspaceId === wsId))
    if (hit) {
      if (typeof r.id === 'string' && r.id) idMap.set(r.id, hit.id)
      outHomes.push(hit)
      continue
    }
    const now = Date.now()
    const home: HomeRow = {
      id: typeof r.id === 'string' && r.id ? sanitize(r.id, 64) : genId(now),
      workspaceId: wsId, path: p,
      name: sanitize(r.name, 64) || p,
      nameSource: r.nameSource === 'user' ? 'user' : 'system',
      avatar: null, avatarSource: 'default', createdAt: now, updatedAt: now,
    }
    doc.homes.push(home)
    if (typeof r.id === 'string' && r.id) idMap.set(r.id, home.id)
    outHomes.push(home)
  }
  const homeIds = new Set(doc.homes.map((h) => h.id))
  const outAssistants: AssistantRow[] = []
  for (const r of input.assistants || []) {
    const channel = sanitize(r.channel, 64).trim()
    const botId = sanitize((r.botId ?? '') as string, 256).trim()
    if (!channel || !botId) continue
    if (doc.assistants.some((a) => a.botId === botId && a.channel === channel && a.status === 'bound')) continue
    const rawHome = typeof r.homeId === 'string' ? r.homeId : ''
    const homeId = idMap.get(rawHome) ?? rawHome
    if (!homeId || !homeIds.has(homeId)) continue
    const now = Date.now()
    const botName = sanitize(r.name, 64).trim()
    outAssistants.push({
      id: typeof r.id === 'string' && r.id ? sanitize(r.id, 64) : genId(now),
      homeId, channel, botId, status: 'bound',
      name: botName || '未命名助理',
      nameSource: (r.nameSource === 'home' ? 'home' : 'bot'),
      avatar: null, avatarSource: 'default', createdAt: now, boundAt: now,
    })
  }
  doc.assistants.push(...outAssistants)
  await persistDoc(file, doc)
  return { homes: outHomes, assistants: outAssistants }
}
