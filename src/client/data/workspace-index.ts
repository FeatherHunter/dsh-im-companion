/** 工作区身份索引 + 行归属解析（#154 共享层单点真相；left-filter / left-badges / presence 共用）。
 * 病根：DSH 先把工作区**标题**本地化，再渲染左栏组行（默认区显示名＝「默认工作区」），
 * 而机器人绑定记的是**绝对路径**（…\default-workspace）⇒ 按显示名做字面匹配必然对不上。
 * 治法：按**身份**解析——组行自带 data-row-key="workspace:<workspaceId>"（DSH 真身取证），
 * 用 id 去工作区注册表换回规范路径；显示名只作兜底（注册表标题 → 老口径字面匹配）。
 * 硬规矩：解析不出 ⇒ 空串（未解析哨兵），**绝不把显示名当工作区标识传下去**。
 * 本层只读注册表快照（ctx.get('workspaces')），无自有轮询、不新增 RPC。 */
import type { BotSnap } from './fleet-api'
import type { WorkspaceRef } from './home-model'

/** 解析依据（诊断用；不进日志噪声，只作返回值语义标注）。 */
export type WorkspaceResolveSource = 'id' | 'title' | 'bot' | 'none'

export interface WorkspaceResolution {
  /** 规范 workspace 路径（绑定真相键）；未解析 ⇒ ''。 */
  path: string
  source: WorkspaceResolveSource
}

export interface WorkspaceIndex {
  /** workspaceId → 规范路径。 */
  byId: Map<string, string>
  /** 归一化标题 → 规范路径。 */
  byTitle: Map<string, string>
}

/** 空索引（取不到注册表时的占位；解析会一路落到老口径字面匹配）。 */
export const EMPTY_WORKSPACE_INDEX: WorkspaceIndex = { byId: new Map(), byTitle: new Map() }

/** 行身份键前缀（DSH 组行：data-row-key="workspace:<workspaceId>"）。 */
export const WORKSPACE_ROW_KEY_PREFIX = 'workspace:'

/** 路径归一（斜杠统一 + 小写 + 去尾杠）：只作比较键，不作标识。 */
export function normPathKey(s: string): string {
  return String(s ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}

/** 标题归一（大小写/空白不敏感）。 */
export function normTitleKey(s: string): string {
  return String(s ?? '').trim().toLowerCase()
}

function basenameOfPath(p: string): string {
  const parts = normPathKey(p).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** 行身份键 → workspaceId（不是工作区行 ⇒ ''）。 */
export function workspaceIdFromRowKey(rowKey: string | null | undefined): string {
  const k = String(rowKey ?? '').trim()
  if (!k.startsWith(WORKSPACE_ROW_KEY_PREFIX)) return ''
  return k.slice(WORKSPACE_ROW_KEY_PREFIX.length).trim()
}

/** 组行元素 → workspaceId（读不到属性 ⇒ ''，静默降级到标题/字面匹配）。 */
export function workspaceIdOfRow(row: Element | null | undefined): string {
  try {
    const get = (row as { getAttribute?: (n: string) => string | null } | null | undefined)?.getAttribute
    if (typeof get !== 'function') return ''
    return workspaceIdFromRowKey(get.call(row, 'data-row-key'))
  } catch {
    return ''
  }
}

/** 注册表快照 → 索引（id 与标题两把钥匙；后者覆盖普通/改名工作区）。 */
export function buildWorkspaceIndex(refs: readonly WorkspaceRef[]): WorkspaceIndex {
  const byId = new Map<string, string>()
  const byTitle = new Map<string, string>()
  for (const r of refs ?? []) {
    const id = String(r?.workspaceId ?? '').trim()
    const path = String(r?.path ?? '').trim()
    if (!path) continue
    if (id && !byId.has(id)) byId.set(id, path)
    const title = normTitleKey(r?.title ?? '')
    if (title && !byTitle.has(title)) byTitle.set(title, path)
  }
  return { byId, byTitle }
}

/** 宿主工作区注册表（ctx.get('workspaces') 惰性读；读不到 ⇒ 空名单）。 */
export function readWorkspaceRefs(get: (name: string) => unknown): WorkspaceRef[] {
  try {
    if (typeof get !== 'function') return []
    const svc = get('workspaces') as {
      list?: { getSnapshot?: () => { items?: { workspaceId?: unknown; path?: unknown; title?: unknown }[] } }
    } | null
    const items = svc?.list?.getSnapshot?.()?.items
    if (!Array.isArray(items)) return []
    const out: WorkspaceRef[] = []
    for (const it of items) {
      const workspaceId = String(it?.workspaceId ?? '')
      const path = String(it?.path ?? '')
      const title = String(it?.title ?? '')
      if (workspaceId && path && !out.some((w) => w.workspaceId === workspaceId)) out.push({ workspaceId, path, title })
    }
    return out
  } catch {
    return []
  }
}

let cachedSig = ''
let cachedIndex: WorkspaceIndex = EMPTY_WORKSPACE_INDEX

/** 索引（按注册表内容签名缓存；注册表不变就不重算）。 */
export function workspaceIndexOf(get: (name: string) => unknown): WorkspaceIndex {
  const refs = readWorkspaceRefs(get)
  const sig = refs.map((r) => r.workspaceId + '|' + r.path + '|' + r.title).join('\n')
  if (sig !== cachedSig) {
    cachedSig = sig
    cachedIndex = buildWorkspaceIndex(refs)
  }
  return cachedIndex
}

/** 对齐到机器人侧的原样路径串（下游是精确相等比较：b.workspace === wsPath）。 */
function alignToBot(path: string, bots: BotSnap[]): string {
  if (!path) return ''
  const k = normPathKey(path)
  for (const b of bots ?? []) {
    const w = String(b?.workspace ?? '')
    if (w && normPathKey(w) === k) return w
  }
  return path
}

/** 老口径字面匹配（注册表读不到时的兜底）：路径全等 / basename / 机器人名。 */
function matchByBot(text: string, bots: BotSnap[]): string {
  const k = normPathKey(text)
  if (!k) return ''
  for (const b of bots ?? []) {
    const w = String(b?.workspace ?? '')
    if (w && (normPathKey(w) === k || basenameOfPath(w) === k)) return w
    const n = normPathKey(b?.botName ?? '')
    if (n && n === k && w) return w
  }
  return ''
}

/** 行 → 规范 workspace 路径（#154 治法：身份优先，标题次之，字面兜底）。
 *  解析不出 ⇒ path:''（未解析哨兵），绝不返回显示名。 */
export function resolveRowWorkspace(
  text: string,
  workspaceId: string,
  index: WorkspaceIndex,
  bots: BotSnap[],
): WorkspaceResolution {
  const id = String(workspaceId ?? '').trim()
  if (id) {
    const p = index.byId.get(id)
    if (p) return { path: alignToBot(p, bots), source: 'id' }
  }
  const title = normTitleKey(text)
  if (title) {
    const p = index.byTitle.get(title)
    if (p) return { path: alignToBot(p, bots), source: 'title' }
  }
  const byBot = matchByBot(text, bots)
  if (byBot) return { path: byBot, source: 'bot' }
  return { path: '', source: 'none' }
}

/** 搜索结果行 → 规范 workspace 路径（含匹配：行文本含标题/路径/basename/机器人名）。 */
export function resolveResultWorkspace(
  fullText: string,
  index: WorkspaceIndex,
  bots: BotSnap[],
): WorkspaceResolution {
  const hay = normPathKey(fullText)
  if (!hay) return { path: '', source: 'none' }
  const titles = [...index.byTitle.entries()].sort((a, b) => b[0].length - a[0].length)
  for (const [t, p] of titles) {
    const k = normPathKey(t)
    if (k && hay.includes(k)) return { path: alignToBot(p, bots), source: 'title' }
  }
  for (const b of bots ?? []) {
    const w = String(b?.workspace ?? '')
    if (!w) continue
    if (hay.includes(normPathKey(w)) || hay.includes(basenameOfPath(w))) return { path: w, source: 'bot' }
    const n = normPathKey(b?.botName ?? '')
    if (n && hay.includes(n)) return { path: w, source: 'bot' }
  }
  return { path: '', source: 'none' }
}
