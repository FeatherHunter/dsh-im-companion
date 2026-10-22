/** 家表存储的 **IO 层**（T3 #116 起：读回 / 判态 / 写闸 / 行清洗）。
 * 为什么单拆一份：`home-store.ts` 的行数红线（300）与**数据保护闸**（2026-10-15 事故复盘）撞在一起——
 * 闸门、留痕、行清洗都是「跟盘打交道」的活，与「家的领域动作」（建/改/删/seed）不同轴，故按轴切开。
 *
 * 事故复盘（真机 `homes.json` 8226 B / 16 家 / 6 助理整份丢失）钉下的两条口径：
 * ① **fail-closed**：读回不可信（文件在但读不出 / 解析不出）⇒ **拒绝落盘**并抛 `config-read-failed`，
 *    原文件一字不动。原先 `loadHomesDoc` 只有「回空表」一种出口，`modifyHomesDoc` / `persistDoc`
 *    又无条件落盘 ⇒ 下一次写操作就把权威表替换成空表，且磁盘上不留任何痕迹。
 * ② **留痕**：读回状态与每一次拒写都必须落到注入的日志出口（`missing`=info / `ok`=debug /
 *    异常=warn / 拒写=error），否则事后无从判定「本来就没有」还是「刚丢的」。
 * ③ **dirty 守卫**：文本没变就不写（真机空表每 4–6 分钟被同样内容重写一次，就是这条缺位）。 */
import { promises as fs } from 'node:fs'
import { parseConfigText, readConfigText, renderConfigText, titleForFile, writeConfigTextAtomic } from './config-yaml.js'
import { stripEmptyFields } from '../assistant-fields.js'

/** 读回结果的诚实态：「文件本来就没有」与「文件在但读不回」必须在磁盘上分得开。 */
export type HomesLoadState = 'ok' | 'missing' | 'read-failed' | 'parse-failed'

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
  /* #169 两栏（简介/人物设定）：**可选**——只在非空时存在于行上（空与缺失同形，老账本零迁移）。
   * 读回原样不截断（读容忍）；写入口校验/归一，唯一落盘口摘空键。 */
  description?: string
  persona?: string
}

export interface HomesDoc {
  version: 2
  homes: HomeRow[]
  assistants: AssistantRow[]
}

const EMPTY: HomesDoc = { version: 2, homes: [], assistants: [] }

/* ── 日志出口（装配期由 `src/index.ts` 注入；未注入＝静默降级，日志绝不拖垮功能面）──────────
 * 不在本文件直接建库：库归装配层单点（让位分支不建库，见 src/host/log.ts 的三条硬约束）。 */
type LogLevel = 'error' | 'warn' | 'info' | 'debug'
let logSink: ((level: LogLevel, event: string, fields: Record<string, unknown>) => void) | null = null

export function setHomeStoreLog(sink: ((level: LogLevel, event: string, fields: Record<string, unknown>) => void) | null): void {
  logSink = sink
}

/** 读回状态一律留痕（`missing` 用 info：首装是常态，但**事后要能从磁盘上看出「家表是从哪一刻变成 0 的」**）。 */
function noteLoad(file: string, state: HomesLoadState, message: string): void {
  const level: LogLevel = state === 'ok' ? 'debug' : state === 'missing' ? 'info' : 'warn'
  try { logSink?.(level, 'config.io', { op: 'load', file, state, message }) } catch { /* 日志不许外泄到功能面 */ }
}

/** 拒写一律 error（这是**数据保护闸**真的拦下了一次写，必须事后可判）。 */
function noteReject(file: string, state: HomesLoadState, message: string): void {
  try { logSink?.('error', 'config.write.reject', { op: 'write', file, state, message }) } catch { /* 日志不许外泄到功能面 */ }
}

/** 读回不可信时拒绝落盘（`rpc.ts` 的 catch 会把它转成 `internal` + 原文回给面板）。 */
export class ConfigReadFailedError extends Error {
  readonly code = 'config-read-failed'
  constructor(file: string, state: HomesLoadState, message: string) {
    super('配置文件读回不可信（' + state + '），已拒绝落盘以免把权威表覆盖成空表：' + file + '，' + message)
    this.name = 'ConfigReadFailedError'
  }
}

/** 该态能否作为「整表覆写」的基础：`missing` ＝本来就没这文件（首装，可写）；其余一律拒写。 */
export function writableFrom(state: HomesLoadState): boolean {
  return state === 'ok' || state === 'missing'
}

/** 唯一闸门口（读-改-写各入口共用）：读回不可信 ⇒ **留痕 + 抛**。
 * 留痕与抛必须成对——只抛不留痕，事后就只剩「面板报了个错」，磁盘上仍然判不出发生了什么。 */
export function assertWritable(file: string, state: HomesLoadState): void {
  if (writableFrom(state)) return
  noteReject(file, state, '拒绝落盘（读回不可信）')
  throw new ConfigReadFailedError(file, state, '读回不可信')
}

function sanitize(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/** 头像值域（读表清洗的**唯一放行口**）：预设色码 `1`..`9`（T6b，2026-10-18 由 6 扩 9）∪ 图片标记 `img:<文件名>`（T11 #128，
 *  文件名由 `home-avatar.ts` 生成：`[A-Za-z0-9_-]{1,64}` ＋ png/jpg/webp 后缀，无斜杠 ⇒ 不可能目录穿越）。
 *  这里少认一种，重启后那张图就会被清洗成「没图」——加值域必须同时改这条。 */
export function isAvatarCode(v: unknown): v is string {
  return typeof v === 'string' && (/^[1-9]$/.test(v) || /^img:[A-Za-z0-9_-]{1,64}\.(png|jpg|webp)$/.test(v))
}

export function cleanHome(r: unknown): HomeRow | null {
  const o = r as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const id = sanitize(o.id, 64)
  const p = sanitize(o.path, 2048)
  if (!id || !p) return null
  const ws = typeof o.workspaceId === 'string' ? sanitize(o.workspaceId, 256) || null : null
  const name = sanitize(o.name, 64) || p
  const av = o.avatar
  const avatar = isAvatarCode(av) ? av : null
  const avSrc = o.avatarSource === 'user' && avatar ? 'user' : avatar === null && o.avatarSource === 'bot' ? 'bot' : 'default'
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
    avatar,
    avatarSource: avSrc as HomeRow['avatarSource'],
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    ...(tombstone ? { tombstone } : {}),
  }
}

export function cleanAssistant(r: unknown, homeIds: Set<string>): AssistantRow | null {
  const o = r as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const id = sanitize(o.id, 64)
  const homeId = sanitize(o.homeId, 64)
  const channel = sanitize(o.channel, 64)
  if (!id || !homeId || !homeIds.has(homeId)) return null
  // T6a 只建 bound（createAssistantRow 仍要求 botId 必填），但加载必须保留
  // unbound/orphan（一等状态，T6b/c 数据），否则重读会静默丢数据。
  const botId = typeof o.botId === 'string' && o.botId ? sanitize(o.botId, 256) : null
  const status = o.status === 'unbound' ? 'unbound' : o.status === 'orphan' ? 'orphan' : 'bound'
  /* #138 渠道诚实性：**未绑定/孤儿行的 channel 允许为空**——没绑过就没有渠道，旧版客户端替用户编过一个，
   * 那也不是事实。老写法把 `!channel` 与 id/homeId 并列当必填，会把这类行**整行丢掉**：
   * 上面那句注释写着「保留 unbound/orphan」，实际却被这一条静默否决——第 0 号风险就长在这一行上。
   * 绑定行反过来必须两者俱全（渠道与机器人号都是绑定那一刻的事实）。 */
  if (status === 'bound' && (!channel || !botId)) return null
  const aav = o.avatar
  const aavatar = isAvatarCode(aav) ? aav : null
  const aavSrc = o.avatarSource === 'user' && aavatar ? 'user' : aavatar === null && o.avatarSource === 'bot' ? 'bot' : o.avatarSource === 'home' ? 'home' : 'default'
  /* #169：两栏读回**原样**（不 trim / 不截断——读路径不许悄悄改写盘上文本，超长值也照原样带出），
   * 只把「非字符串 / trim 后为空」的键整键摘掉（空与缺失等价）。CRLF 归一留给 assistantFieldText。 */
  const description = typeof o.description === 'string' && o.description.trim() ? o.description : undefined
  const persona = typeof o.persona === 'string' && o.persona.trim() ? o.persona : undefined
  return {
    id,
    homeId,
    channel,
    botId,
    status,
    name: sanitize(o.name, 64) || botId || '未命名助理',
    nameSource: o.nameSource === 'user' ? 'user' : o.nameSource === 'home' ? 'home' : 'bot',
    avatar: aavatar,
    avatarSource: aavSrc as AssistantRow['avatarSource'],
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    boundAt: typeof o.boundAt === 'number' ? o.boundAt : status === 'bound' ? Date.now() : null,
    ...(description !== undefined ? { description } : {}),
    ...(persona !== undefined ? { persona } : {}),
  }
}

/** 读回家表：文档 + **诚实态**（调用方据此决定能不能写回）+ 原文（dirty 守卫要比对）。 */
export async function loadHomesDocState(file: string): Promise<{ doc: HomesDoc; state: HomesLoadState; original: string | null }> {
  const empty = { doc: { ...EMPTY, homes: [], assistants: [] }, original: null }
  let read: { text: string; legacy: boolean } | null = null
  try {
    read = await readConfigText(file) // homes.yaml；迁移没跑完时回落同名 homes.json
  } catch (e) {
    noteLoad(file, 'read-failed', String((e as Error)?.message ?? e))
    return { ...empty, state: 'read-failed' }
  }
  if (!read) {
    /* 读不到有两种成因，必须分开：文件真不存在＝首装（可写）；文件在但读不出＝权限/占用/损坏（拒写）。 */
    const exists = await fs.access(file).then(() => true).catch(() => false)
    if (exists) {
      noteLoad(file, 'read-failed', '文件存在但读不出（权限/占用/损坏）')
      return { ...empty, state: 'read-failed' }
    }
    /* 事故复盘的关键一行：`missing` 也要落盘留痕，否则「家表从哪一刻变成 0」事后无从判定。 */
    noteLoad(file, 'missing', '家表不存在（首装，或文件已丢失）——本次读回按空表兜底')
    return { ...empty, state: 'missing' }
  }
  const parsed = parseConfigText(read.text) as { homes?: unknown[]; assistants?: unknown[] } | null
  if (!parsed || typeof parsed !== 'object') {
    noteLoad(file, 'parse-failed', '解析不出对象（文件可能被截断或手改成非法 YAML）')
    return { ...empty, state: 'parse-failed' }
  }
  const homes = Array.isArray(parsed.homes) ? parsed.homes.map(cleanHome).filter((x): x is HomeRow => !!x) : []
  const ids = new Set(homes.map((h) => h.id))
  const assistants = Array.isArray(parsed.assistants)
    ? parsed.assistants.map((r) => cleanAssistant(r, ids)).filter((x): x is AssistantRow => !!x)
    : []
  noteLoad(file, 'ok', '读回 ' + homes.length + ' 家 / ' + assistants.length + ' 助理')
  return { doc: { version: 2, homes, assistants }, state: 'ok', original: read.text }
}

export async function loadHomesDoc(file: string): Promise<HomesDoc> {
  return (await loadHomesDocState(file)).doc
}

/** 唯一落盘口：先判态（fail-closed），再判脏（文本一致就不写）。 */
export async function writeGuarded(file: string, doc: HomesDoc, state: HomesLoadState, original: string | null): Promise<void> {
  assertWritable(file, state)
  /* #169 唯一落盘口的最后一道：两栏 trim 后为空的键**整键摘掉**（空串与缺失在盘上同形 ⇒ 老账本读→写
   * 不 materialize 空键）。只清洗**送渲染器的这份拷贝**：调用方手里的 doc/row 不动（RPC 回包照旧带值）。 */
  const disk: HomesDoc = { version: doc.version, homes: doc.homes, assistants: doc.assistants.map((a) => stripEmptyFields(a)) }
  const text = renderConfigText(disk, titleForFile(file))
  if (original !== null && original === text) return
  await writeConfigTextAtomic(file, text)
}