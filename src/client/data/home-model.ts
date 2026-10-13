/** 家/助理纯逻辑单缝（T3 #116 语义冻结，共享层 Added-only 新文件；旧 data/model.ts 一字不动）。
 * 命名 + 分组 + 1:1 校验 + 种子迁移同一模块；宿主落盘与机器人归属只做薄封装。
 * 绿框真相源：homes.json（version:2）；旧账本 names/avatars/locals 只做种子回落与显示兼容，不双写。
 * T6a 钢线：建家选已有区、建助理同时绑机器人、三级钻取显示；不做图片/未绑定行/搬家/恢复默认。 */
export interface Home {
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

export interface Assistant {
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

export interface WorkspaceRef {
  workspaceId: string
  path: string
  title: string
}

export interface BotRef {
  channel: string
  botId: string
  workspace: string
  botName: string
}

/** 旧账本最小面（种子回落用；只读 names，不写回）。 */
export interface LegacyNames {
  names?: Record<string, string>
}

export function genId(now = Date.now()): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  } catch { /* 回落 */ }
  const t = Math.floor(now).toString(36)
  let r = ''
  try {
    const buf = new Uint32Array(2)
    ;(globalThis.crypto as Crypto).getRandomValues(buf)
    r = [...buf].map((n) => n.toString(36)).join('').slice(0, 10)
  } catch {
    r = Math.floor(Math.random() * 36 ** 8).toString(36)
  }
  return 'h-' + t + '-' + r
}

/** 规范路径（T1 §4.2 连接键口径）：斜杠统一 + 去尾杠 + 小写；自拼只读容错，连接以 DSH 回 canonical 为准。 */
export function normPath(p: string): string {
  return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
}

export function basenameOf(p: string): string {
  const parts = String(p ?? '').split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function defaultWorkspaceTitle(title: string): string {
  return title === 'default-workspace' ? '默认工作区' : title
}

export interface Display {
  text: string
  from: string
}

/** 家命名链（T3 Q3 / T4 verdict）：用户手改 > 工作区标题（含默认区本地化）> 目录基名 > 未命名家。
 * 注意：**不读存储快照 name**——T3 的链里没有这一级（像素对拍时与原型的 orphan 行对齐，
 * 原型对「工作区已删」的家显示目录基名）。name 只在 nameSource==='user' 时参与。 */
export function resolveHomeDisplay(home: Home, liveTitle = '', livePath = ''): Display {
  if (home.nameSource === 'user' && home.name.trim()) return { text: home.name, from: 'user' }
  const t = String(liveTitle ?? '').trim()
  if (t) return { text: defaultWorkspaceTitle(t), from: 'workspace' }
  const base = basenameOf(livePath || home.path)
  if (base) return { text: base, from: 'basename' }
  return { text: '未命名家', from: 'fallback' }
}

/** 助理命名链（T3 Q3）：用户手改 > 机器人名（已绑非空）> 所属家名 > 缺省名；同区多 bot 各立一助理。
 * 同上：不读存储快照 name（仅 nameSource==='user' 参与）。 */
export function resolveAssistantDisplay(a: Assistant, botName = '', homeText = ''): Display {
  if (a.nameSource === 'user' && a.name.trim()) return { text: a.name, from: 'user' }
  const b = String(botName ?? '').trim()
  if (a.botId && b) return { text: b, from: 'bot' }
  const h = String(homeText ?? '').trim()
  if (h) return { text: h, from: 'home' }
  return { text: '未命名助理', from: 'fallback' }
}

export interface HomeGroup {
  home: Home
  assistants: Assistant[]
}

/** 面板分组（保序：家序即入序；助理按创建时间；悬空 homeId 不渲染，fail-closed）。 */
export function groupByHome(homes: Home[], assistants: Assistant[]): HomeGroup[] {
  const byHome = new Map<string, Assistant[]>()
  for (const a of assistants || []) {
    if (!a || !a.homeId) continue
    if (!byHome.has(a.homeId)) byHome.set(a.homeId, [])
    byHome.get(a.homeId)!.push(a)
  }
  return (homes || []).map((home) => ({
    home,
    assistants: (byHome.get(home.id) ?? []).slice().sort((x, y) => x.createdAt - y.createdAt),
  }))
}

/** 严格一对一：判键 = channel + botId（仅 bound 计数；unbound 占位不占号，后续可认领）。 */
export function isBotBound(assistants: Assistant[], channel: string, botId: string): boolean {
  if (!botId) return false
  return (assistants || []).some((a) => a.botId === botId && a.channel === channel && a.status === 'bound')
}

export function validateAssistantBind(
  assistants: Assistant[],
  channel: string,
  botId: string,
): { ok: true } | { ok: false; reason: 'empty-bot' | 'already-bound' | 'empty-channel' } {
  if (!channel.trim()) return { ok: false, reason: 'empty-channel' }
  if (!botId.trim()) return { ok: false, reason: 'empty-bot' }
  if (isBotBound(assistants, channel, botId)) return { ok: false, reason: 'already-bound' }
  return { ok: true }
}

/** 建家（T6a 只选已有区；幂等键 = 规范路径，重复由宿主 already-exists 拒绝）。 */
export function createHome(input: { workspaceId: string; path: string; title: string }, now = Date.now()): Home | null {
  const wsId = String(input.workspaceId ?? '').trim()
  const p = String(input.path ?? '').trim()
  if (!wsId || !p) return null
  const title = String(input.title ?? '').trim()
  return {
    id: genId(now), workspaceId: wsId, path: p,
    name: title ? defaultWorkspaceTitle(title) : basenameOf(p) || p,
    nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: now, updatedAt: now,
  }
}

/** 建助理同时绑机器人（T6a：botId 必填，不做未绑定占位；头像恒默认归 T6b）。 */
export function createAssistant(
  input: { homeId: string; channel: string; botId: string; botName?: string; homeText?: string },
  existing: Assistant[],
  now = Date.now(),
): Assistant | null {
  const homeId = String(input.homeId ?? '').trim()
  const channel = String(input.channel ?? '').trim()
  const botId = String(input.botId ?? '').trim()
  if (!homeId || !channel || !botId) return null
  if (!validateAssistantBind(existing, channel, botId).ok) return null
  const botName = String(input.botName ?? '').trim()
  const homeText = String(input.homeText ?? '').trim()
  const useBot = !!botName
  return {
    id: genId(now), homeId, channel, botId, status: 'bound',
    name: useBot ? botName : homeText || '未命名助理',
    nameSource: useBot ? 'bot' : 'home',
    avatar: null, avatarSource: 'default', createdAt: now, boundAt: now,
  }
}

/** 空闲工作区（建家下拉）：已被任一家占用（id 或规范路径命中）即排除。 */
export function freeWorkspaces(workspaces: WorkspaceRef[], homes: Home[]): WorkspaceRef[] {
  const usedIds = new Set((homes || []).map((h) => h.workspaceId).filter(Boolean) as string[])
  const usedPaths = new Set((homes || []).map((h) => normPath(h.path)).filter(Boolean))
  return (workspaces || []).filter((w) => {
    if (!w || !w.path) return false
    if (usedIds.has(w.workspaceId)) return false
    if (usedPaths.has(normPath(w.path))) return false
    return true
  })
}

/** 空闲机器人（建助理下拉）：已被 bound 认领即排除；workspace 为空的未绑定机同样可认领。 */
export function freeBots(bots: BotRef[], assistants: Assistant[]): BotRef[] {
  return (bots || []).filter((b) => {
    if (!b || !b.botId || !b.channel) return false
    return !isBotBound(assistants, b.channel, b.botId)
  })
}

/* 旧账本三级键回落（与 data/model.ts viewName 同口径：精确 → basename 旧键 → 归一化；只读）。 */
function legacyName(rec: Record<string, string> | undefined, path: string, base: string): string | null {
  if (!rec || typeof rec !== 'object') return null
  if (path && typeof rec[path] === 'string' && rec[path]) return rec[path]
  if (base && typeof rec[base] === 'string' && rec[base]) return rec[base]
  const target = normPath(path)
  if (!target) return null
  for (const k of Object.keys(rec)) {
    if (k && normPath(k) === target && rec[k]) return rec[k]
  }
  return null
}

export interface SeedDoc {
  homes: Home[]
  assistants: Assistant[]
}

/** 种子迁移（T3 故事 20–22 子集＋T1 §4.3）：DSH 全集一区一家（含无人之家，序跟入序）；
 * 有归属 bot 各一 bound 助理；旧 names 命中即 nameSource=user（改名优先），否则 system；
 * 未绑定 bot 不建行（T6a 不做未绑定行；经 freeBots 在建助理时认领）；归档/置顶不动（不在本层）。
 * 纯函数；幂等由宿主 home.seed 按规范路径/bot 判重保证，可重跑。 */
export function buildSeed(
  workspaces: WorkspaceRef[],
  bots: BotRef[],
  legacy: LegacyNames | null,
  now = Date.now(),
): SeedDoc {
  const names = legacy?.names
  const homes: Home[] = []
  const assistants: Assistant[] = []
  let t = now
  const seenPath = new Set<string>()
  for (const w of workspaces || []) {
    if (!w || !w.path || !w.workspaceId) continue
    const np = normPath(w.path)
    if (seenPath.has(np)) continue
    seenPath.add(np)
    const base = basenameOf(w.path)
    const hit = legacyName(names, w.path, base)
    t += 1
    homes.push({
      id: genId(t), workspaceId: w.workspaceId, path: w.path,
      name: hit ?? (w.title.trim() ? defaultWorkspaceTitle(w.title.trim()) : base || w.path),
      nameSource: hit ? 'user' : 'system',
      avatar: null, avatarSource: 'default', createdAt: t, updatedAt: t,
    })
  }
  const homeOf = (wsPath: string): Home | null => {
    const np = normPath(wsPath)
    return homes.find((h) => normPath(h.path) === np) ?? null
  }
  const claimed = new Set<string>()
  for (const b of bots || []) {
    if (!b || !b.botId || !b.channel || !b.workspace) continue
    const k = b.channel + '' + b.botId
    if (claimed.has(k)) continue
    const home = homeOf(b.workspace)
    if (!home) continue
    claimed.add(k)
    t += 1
    const botName = (b.botName ?? '').trim()
    assistants.push({
      id: genId(t), homeId: home.id, channel: b.channel, botId: b.botId, status: 'bound',
      name: botName || home.name, nameSource: botName ? 'bot' : 'home',
      avatar: null, avatarSource: 'default', createdAt: t, boundAt: t,
    })
  }
  return { homes, assistants }
}

/** 缺口判定（每轮快照后内存比对，零 IO）：homes 为空且有工作区/bot，或有已绑 bot 无对应 bound 行。
 * T6b #114 说明：曾收窄为“只补缺家”以防删助理后复活，实测与已验收的点击级契约冲突
 * （home-create-flow 前提“缺家工作区留给手动建家”、② 顺序契约依赖自动补新号），已回退。
 * 已知局限：删掉“有工作区”的助理后，快照仍会把它当新号自动补回（复活）；真修需删行留痕
 * （tombstone）或删时解绑工作区，归 T6c/后续票（见 #114 收尾记录）。 */
export function seedGap(workspaces: WorkspaceRef[], bots: BotRef[], homes: Home[], assistants: Assistant[]): boolean {
  if (!(homes || []).length && ((workspaces || []).length || (bots || []).some((b) => b && b.workspace))) return true
  for (const b of bots || []) {
    if (!b || !b.botId || !b.channel || !b.workspace) continue
    if (!isBotBound(assistants, b.channel, b.botId)) {
      if ((homes || []).some((h) => normPath(h.path) === normPath(b.workspace))) return true
    }
  }
  return false
}
