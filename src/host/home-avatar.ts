/** T11 #128 头像图片：家/助理行「图片头像」的落盘、取图与清理（**新文件，旧码不动**）。
 *
 * 为什么落盘而不是塞进表里：老 meta 流程（`meta.avatar.set`）把 data URL 直接存进配置文件——
 * 大图会把家表撑爆，每次读表都要拖着 base64 走。本票口径：图片进 `<配置目录>/avatars/`，
 * 行里只留**标记**，故数据模型零新增字段（T3 行形状一字不动）：
 *   `avatar = "img:<文件名>"` ⇒ 图片；`"1".."6"` ⇒ 预设色（T6b）；`null` ⇒ 默认（按不可变 id 派生色相）。
 * 回落链「图片 → 预设色 → 首字母」由渲染侧一处判定（`client/components/home-avatar.ts` 的 avatarSrc）；
 * 值域放行在 `home-store.ts` 的 isAvatarCode（读表清洗必须认这个标记，否则重启即丢图）。
 *
 * 口径（#128 票面五条，逐条在此定死，实施侧不另猜）：
 *   ① 落点 `<DSH_HOME>/integrations/dsh-im-companion/avatars/<stem>.<ext>`（与 homes.yaml 同目录树，
 *      T12「打开所在目录」能直接核对）；
 *   ② 只收 png/jpg/webp，**按文件内容（魔数）判定**，data URL 里声明的 mime 不作数；解码后 ≤2 MiB；
 *      超限/魔数不符 ⇒ `bad-request` 明文拒绝，且**先校验后落盘** ⇒ 拒绝路径不写半行数据；
 *   ③ 端点族 `avatar.get`（批量读，返回 data URL）/`avatar.set`/`avatar.clear`，由 rpc.ts 的 default 支
 *      一行族路由接入（rpc.ts 已顶 300 行红线，见那里注释）；
 *   ④ 改名不动图（只带 name 的补丁根本不碰 avatar 字段）；清空后回落预设色；
 *   ⑤ 只有「存新图」与「显式清空」才删旧文件；删家/解绑/换预设色**不级联删**（宁可留孤儿文件，
 *      不误删用户素材）。
 *
 * 端点回包与宿主其它端点同信封（`{ok:true,value}` / `{ok:false,error}`），且 `value.row` 带改后的行——
 * 语义日志映射（log-sites）据此判「这次是家还是助理」，调用方（客户端）也据此免二次读表。
 * 本文件不 import `rpc.ts`（避免两端互引）：回包形状用下面的结构化联合体声明，交给 TS 结构匹配。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { homesFileFor, loadHomesDoc, modifyHomesDoc, type AssistantRow, type HomeRow } from './home-store.js'

/** 图片标记前缀：行里 `avatar` 以它开头即「有图」。 */
export const AVATAR_PREFIX = 'img:'
/** 解码后字节上限（票面口径 2 MB）。桥上是 base64（体积约 4/3），落盘前先卡死。 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
/** 一次批量取图的 id 上限（渲染一屏十几行，64 足够且挡住畸形入参）。 */
const MAX_IDS = 64
/** 标记 → 文件名：只认自己写出来的形状（无斜杠、无点路径 ⇒ 读路径不可能目录穿越）。 */
const MARKER_RE = /^img:([A-Za-z0-9_-]{1,64})\.(png|jpg|webp)$/
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const REJECT = '不是有效图片：只收 png/jpg/webp 原始文件（按文件内容判定，改扩展名不作数）'

type Row = HomeRow | AssistantRow

/** 回包形状（与 rpc.ts 的 RpcResult 结构一致，但不 import 它——避免两端互引）。 */
export type AvatarRpcOk = { ok: true; value: Record<string, unknown> }
export type AvatarRpcFail = { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }

const fail = (code: string, message: string): AvatarRpcFail => ({ ok: false, error: { code, message, details: {} } })
const msgOf = (e: unknown): string => String((e as Error)?.message ?? e)

/** 图片目录：与 homes.yaml 同目录树（票面口径 ①）。 */
export function avatarDirFor(homesFile: string): string {
  return path.join(path.dirname(homesFile), 'avatars')
}

/** 文件名主干：真实 id 是 UUID（genId），本函数只为挡住手改过的表（斜杠/点/中文）。
 *  带不安全字符时补一段 id 派生的 FNV-1a 尾码 ⇒ 两个只在非法字符上不同的 id 不会撞同名文件。 */
export function stemFor(id: string): string {
  const raw = String(id ?? '')
  const slug = raw.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 56) || 'row'
  if (slug === raw) return slug
  let h = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return slug.slice(0, 48) + '-' + (h >>> 0).toString(36)
}

/** 魔数判定（唯一真相是字节）：png / jpeg / webp 三种，别的一律 null。 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** data URL → 字节（**唯一校验口**：不合规在这里就被明文拒掉，调用方保证「先校验后落盘」）。 */
export function decodeImageDataUrl(dataUrl: unknown): { ok: true; buf: Buffer; ext: string } | { ok: false; message: string } {
  const s = typeof dataUrl === 'string' ? dataUrl : ''
  const m = /^data:image\/[a-zA-Z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(s)
  if (!m) return { ok: false, message: '入参必须是 base64 图片 data URL（data:image/...;base64,...）' }
  let buf: Buffer
  try {
    buf = Buffer.from(m[1], 'base64')
  } catch {
    return { ok: false, message: REJECT }
  }
  if (!buf.length) return { ok: false, message: REJECT }
  if (buf.length > AVATAR_MAX_BYTES) return { ok: false, message: '图片太大：' + (buf.length / 1048576).toFixed(1) + ' MB，上限 2 MB' }
  const mime = sniffImageMime(buf)
  if (!mime) return { ok: false, message: REJECT }
  return { ok: true, buf, ext: MIME_EXT[mime] as string }
}

/** 标记 → 文件名（不合法一律 null）。 */
export function fileNameOf(avatar: unknown): string | null {
  const m = MARKER_RE.exec(typeof avatar === 'string' ? avatar : '')
  return m ? m[1] + '.' + m[2] : null
}

/** 行是否「有图」（客户端/日志侧的判定口径也走这里，别各写各的正则）。 */
export function hasImageAvatar(avatar: unknown): boolean {
  return fileNameOf(avatar) !== null
}

async function readDataUrl(homesFile: string, name: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(avatarDirFor(homesFile), name))
    return 'data:' + (sniffImageMime(buf) ?? 'image/png') + ';base64,' + buf.toString('base64')
  } catch {
    return null /* 文件没了/读不动：调用方按「这行没图」处理（回落预设色） */ 
  }
}

/** 删旧图：best-effort（失败只当没删——行已不指向它，多一个孤儿文件不改语义，也不许把写成功改成失败）。 */
async function dropFile(homesFile: string, name: string | null): Promise<void> {
  if (!name) return
  try {
    await fs.rm(path.join(avatarDirFor(homesFile), name), { force: true })
  } catch {
    /* 忽略：清理失败不改数据语义 */
  }
}

function findRow(doc: { homes: HomeRow[]; assistants: AssistantRow[] }, id: string): Row | null {
  return doc.homes.find((r) => r.id === id) ?? doc.assistants.find((r) => r.id === id) ?? null
}

/** 批量读图：行里带 `img:` 标记且文件真在 ⇒ 回 data URL；其余（无标记/无文件）不进结果。
 *  客户端据此做两件事：拿到图就缓存；要了没拿到 ⇒ 该标记记一次负缓存（不再每帧重试）。 */
async function avatarGet(homesFile: string, p: Record<string, unknown>): Promise<AvatarRpcOk | AvatarRpcFail> {
  const ids = (Array.isArray(p.ids) ? p.ids : []).slice(0, MAX_IDS).map((x) => String(x ?? ''))
  if (!ids.length) return fail('bad-request', 'ids 必填（非空数组）')
  const doc = await loadHomesDoc(homesFile)
  const images: Record<string, string> = {}
  for (const id of ids) {
    if (!id || images[id]) continue
    const name = fileNameOf(findRow(doc, id)?.avatar)
    if (!name) continue
    const url = await readDataUrl(homesFile, name)
    if (url) images[id] = url
  }
  return { ok: true, value: { images } }
}

/** 存图：先校验（明文拒）→ 落文件 → 再原子读改写行（改不到行就把刚落的文件收回，拒绝要干净）。 */
async function avatarSet(homesFile: string, p: Record<string, unknown>): Promise<AvatarRpcOk | AvatarRpcFail> {
  const id = String(p.id ?? '')
  if (!id) return fail('bad-request', 'id 必填')
  const dec = decodeImageDataUrl(p.dataUrl)
  if (!dec.ok) return fail('bad-request', dec.message)
  const dir = avatarDirFor(homesFile)
  const name = stemFor(id) + '.' + dec.ext
  const marker = AVATAR_PREFIX + name
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, name), dec.buf)
  } catch (e) {
    return fail('io-error', '图片落盘失败：' + msgOf(e))
  }
  let hit: { row: Row; old: string | null } | null = null
  try {
    hit = await modifyHomesDoc(homesFile, (doc) => {
      const row = findRow(doc, id)
      if (!row) return null
      const old = row.avatar
      row.avatar = marker
      row.avatarSource = 'user'
      if ('updatedAt' in row) row.updatedAt = Date.now()
      return { row: { ...row }, old }
    })
  } catch (e) {
    await dropFile(homesFile, name)
    return fail('io-error', '家表写入失败：' + msgOf(e))
  }
  if (!hit) {
    await dropFile(homesFile, name)
    return fail('not-found', '没有这行（家/助理）：' + id)
  }
  if (hit.old !== marker) await dropFile(homesFile, fileNameOf(hit.old))
  return { ok: true, value: { row: hit.row, avatar: marker } }
}

/** 清图：行回落预设色（avatarSource 回默认，与 T6b 的 update 口径一致），旧文件随之删掉。 */
async function avatarClear(homesFile: string, p: Record<string, unknown>): Promise<AvatarRpcOk | AvatarRpcFail> {
  const id = String(p.id ?? '')
  if (!id) return fail('bad-request', 'id 必填')
  let hit: { row: Row; old: string | null } | null = null
  try {
    hit = await modifyHomesDoc(homesFile, (doc) => {
      const row = findRow(doc, id)
      if (!row) return null
      const old = row.avatar
      row.avatar = null
      row.avatarSource = 'default'
      if ('updatedAt' in row) row.updatedAt = Date.now()
      return { row: { ...row }, old }
    })
  } catch (e) {
    return fail('io-error', '家表写入失败：' + msgOf(e))
  }
  if (!hit) return fail('not-found', '没有这行（家/助理）：' + id)
  await dropFile(homesFile, fileNameOf(hit.old))
  return { ok: true, value: { row: hit.row } }
}

/** 端点族入口：**只认 `avatar.` 前缀**，别的端点回 null（rpc.ts 的 default 支据此回落「未知端点」）。
 *  这样一个族三个端点，占 rpc.ts 的分发主体**零行新增**（该文件已顶 300 行红线）。 */
export async function avatarPhone(
  endpoint: string,
  homesFile: string,
  p: Record<string, unknown>,
): Promise<AvatarRpcOk | AvatarRpcFail | null> {
  if (endpoint === 'avatar.get') return avatarGet(homesFile, p)
  if (endpoint === 'avatar.set') return avatarSet(homesFile, p)
  if (endpoint === 'avatar.clear') return avatarClear(homesFile, p)
  if (endpoint.startsWith('avatar.')) return fail('bad-request', '未知端点: ' + endpoint)
  return null
}

/** 便捷出口：`dshHome` → homes.yaml（装配方与验证物都用这一个口，别各自拼路径）。 */
export function avatarPhoneFor(dshHome: string): (endpoint: string, p: Record<string, unknown>) => Promise<AvatarRpcOk | AvatarRpcFail | null> {
  const file = homesFileFor(dshHome)
  return (endpoint, p) => avatarPhone(endpoint, file, p)
}
