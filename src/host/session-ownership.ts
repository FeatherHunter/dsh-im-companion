/**
 * 会话 → 助理归属索引（T8-2 #170）：只读各渠道 state.json 的 `sessions` 键。
 * 扫 <DSH_HOME>/integrations/dsh-<channel>/{bots|accounts}/<botId>/state.json；
 * 只看 sessions（令牌/正文/游标一律不读不记）；缓存戳 (path, mtime, size)；
 * 读失败保留旧绑定，文件删除清旧绑定；1:N 取 mtime 最新，结果真变了才 warn；
 * 懒刷新只由注入回调 / 装配期 warm 触发（无 timer / watch），负结果 TTL 2000ms。
 * 渲染路径只读内存；fs 全在异步 refresh 里，绝不进 section.text。
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'

export type PersonaLogLevel = 'error' | 'warn' | 'info' | 'debug'

/** 日志出口：装配层注入 hostLog；未注入＝静默（日志绝不拖垮注入）。 */
export interface PersonaLogSink {
  log(level: PersonaLogLevel, event: string, fields: Record<string, unknown>): void
}

export interface OwnershipLookup {
  hit: boolean
  reason: string
  channel: string
  botId: string
  ambiguous: boolean
  candidates: string[]
  cacheAgeMs: number
}

export interface SessionOwnership {
  lookup(sessionId: string): OwnershipLookup
  warm(): Promise<void>
  refresh(reason?: string): Promise<void>
}

/** 只用到三个 fs 动作（测试注入假实现：EACCES / 删除 / 缓存戳 / 1:N）。 */
export interface OwnershipFs {
  readdir(dir: string): Promise<string[]>
  stat(file: string): Promise<{ mtimeMs: number; size: number; isFile(): boolean }>
  readFile(file: string, encoding: 'utf8'): Promise<string>
}

export interface SessionOwnershipOptions {
  dshHome: string
  log?: PersonaLogSink | null
  now?: () => number
  fs?: OwnershipFs
}

const CHANNEL_DIR = /^dsh-[a-z0-9-]{1,32}$/
const BOT_DIR = /^[A-Za-z0-9_-]{1,64}$/
const REGIONS = ['bots', 'accounts'] as const
const NEGATIVE_TTL_MS = 2000
const HIT_REFRESH_MS = 250

interface FileBinding { channel: string; botId: string; mtimeMs: number; size: number; sessions: Map<string, string> }
interface Candidate { channel: string; botId: string; path: string; mtimeMs: number }

function codeOf(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code ?? 'error')
}
function messageOf(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? error)
}
function emptyLookup(reason: string, cacheAgeMs = 0): OwnershipLookup {
  return { hit: false, reason, channel: '', botId: '', ambiguous: false, candidates: [], cacheAgeMs }
}

/** 只取 `sessions`：值须为非空字符串；其余键不看。坏结构 ⇒ 失败（保留旧绑定）。 */
function parseSessions(text: string): { ok: true; sessions: Map<string, string> } | { ok: false; message: string } {
  try {
    const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const parsed = JSON.parse(raw) as { sessions?: unknown } | null
    const sessions = parsed && typeof parsed === 'object' ? parsed.sessions : null
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return { ok: false, message: 'state.json 的 sessions 不是对象' }
    const out = new Map<string, string>()
    for (const [key, value] of Object.entries(sessions as Record<string, unknown>)) {
      if (key && typeof value === 'string' && value) out.set(key, value)
    }
    return { ok: true, sessions: out }
  } catch (error) {
    return { ok: false, message: 'state.json 解析失败：' + messageOf(error) }
  }
}

function sameCandidates(a: readonly Candidate[], b: readonly Candidate[]): boolean {
  return a.length === b.length && a.every((c, i) => c.channel === b[i].channel && c.botId === b[i].botId && c.path === b[i].path)
}

/** 建索引。装配期只调用一次；refresh 由注入回调懒触发。 */
export function createSessionOwnership(options: SessionOwnershipOptions): SessionOwnership {
  const fs: OwnershipFs = options.fs ?? (fsp as unknown as OwnershipFs)
  const sink: PersonaLogSink = options.log ?? { log() { /* 未注入日志 */ } }
  const now = options.now ?? Date.now
  const root = path.join(options.dshHome, 'integrations')

  const files = new Map<string, FileBinding>()
  let reverse = new Map<string, Candidate[]>()
  let ready = false
  let lastRefreshAt = 0
  let negativeAt = -Infinity
  let inFlight: Promise<void> | null = null
  let lastAmbiguity = new Map<string, string>()
  const failKeys = new Set<string>()

  /** resident 失败去重：同一 (phase,file,code) 只留一次，避免每次懒刷新刷盘。 */
  function fail(phase: string, file: string, code: string, message: string): void {
    const key = phase + '|' + file + '|' + code
    if (failKeys.has(key)) return
    failKeys.add(key)
    try { sink.log('warn', 'persona.refresh.fail', { phase, file, code, reason: 'ownership-' + phase, message, sessionId: '' }) } catch { /* 日志不外泄 */ }
  }

  function noteRefresh(reason: string, changedFiles: number, errors: number, statMs: number, parseMs: number, cached: boolean): void {
    try {
      sink.log('debug', 'persona.refresh', {
        reason, files: files.size, changedFiles, sessions: reverse.size, assistants: 0, statMs, parseMs, errors, cached,
      })
    } catch { /* 日志不外泄 */ }
  }

  /** 列目录：返回「state.json 路径 → 渠道/机器人」。ENOENT 当没有；其他错记下并保旧（partial）。 */
  async function discover(): Promise<{ found: Map<string, { channel: string; botId: string }>; partial: boolean }> {
    const found = new Map<string, { channel: string; botId: string }>()
    let channels: string[]
    try { channels = await fs.readdir(root) } catch (error) {
      if (codeOf(error) !== 'ENOENT') { fail('discover', root, codeOf(error), messageOf(error)); return { found, partial: true } }
      return { found, partial: false }
    }
    let partial = false
    for (const channelDir of channels) {
      if (!CHANNEL_DIR.test(channelDir)) continue
      const channel = channelDir.slice(4)
      for (const region of REGIONS) {
        const regionDir = path.join(root, channelDir, region)
        let bots: string[]
        try { bots = await fs.readdir(regionDir) } catch (error) {
          const code = codeOf(error)
          if (code !== 'ENOENT' && code !== 'ENOTDIR') { partial = true; fail('discover', regionDir, code, messageOf(error)) }
          continue
        }
        for (const botDir of bots) {
          if (!BOT_DIR.test(botDir)) continue
          found.set(path.join(regionDir, botDir, 'state.json'), { channel, botId: botDir })
        }
      }
    }
    return { found, partial }
  }

  function rebuild(): Map<string, Candidate[]> {
    const next = new Map<string, Candidate[]>()
    for (const [file, binding] of files) {
      for (const sessionId of binding.sessions.values()) {
        const list = next.get(sessionId) ?? []
        list.push({ channel: binding.channel, botId: binding.botId, path: file, mtimeMs: binding.mtimeMs })
        next.set(sessionId, list)
      }
    }
    for (const list of next.values()) list.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    return next
  }

  function noteAmbiguity(next: Map<string, Candidate[]>): void {
    const ambiguous = new Map<string, string>()
    for (const [sessionId, list] of next) {
      if (list.length > 1) ambiguous.set(sessionId, list.map((c) => c.channel + '/' + c.botId).sort().join('|'))
    }
    for (const [sessionId, key] of ambiguous) {
      if (lastAmbiguity.get(sessionId) === key) continue
      const list = next.get(sessionId) ?? []
      const winner = list[0]
      if (!winner) continue
      try {
        sink.log('warn', 'persona.ownership.ambiguity', {
          sessionId, channel: winner.channel, bots: list.map((c) => c.channel + '/' + c.botId).sort(),
          winner: winner.channel + '/' + winner.botId, rule: 'latest-mtime',
        })
      } catch { /* 日志不外泄 */ }
    }
    lastAmbiguity = ambiguous
  }

  async function runRefresh(reason: string): Promise<void> {
    const started = now()
    const { found, partial } = await discover()
    const statStart = now()
    let changedFiles = 0
    let errors = 0
    const keep = new Set<string>()

    for (const [file, meta] of found) {
      let stat: { mtimeMs: number; size: number; isFile(): boolean }
      try { stat = await fs.stat(file) } catch (error) {
        const code = codeOf(error)
        if (code === 'ENOENT') continue // 文件已删：下一步清旧绑定
        errors++; keep.add(file); fail('stat', file, code, messageOf(error)); continue
      }
      if (!stat.isFile()) continue
      const prev = files.get(file)
      if (prev && prev.channel === meta.channel && prev.botId === meta.botId
        && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
        keep.add(file)
        continue
      }
      let text: string
      try { text = await fs.readFile(file, 'utf8') } catch (error) {
        const code = codeOf(error)
        if (code === 'ENOENT') continue
        errors++; keep.add(file); fail('read', file, code, messageOf(error)); continue
      }
      const parsed = parseSessions(text)
      if (!parsed.ok) {
        errors++
        if (prev) { keep.add(file); fail('parse', file, 'parse-failed', parsed.message) }
        continue
      }
      files.set(file, { channel: meta.channel, botId: meta.botId, mtimeMs: stat.mtimeMs, size: stat.size, sessions: parsed.sessions })
      keep.add(file)
      changedFiles++
      for (const key of [...failKeys]) if (key.includes('|' + file + '|')) failKeys.delete(key)
    }

    /* 读目录部分失败时保守处理：不删任何「这次没看到」的旧文件（可能是读不到，不是删了）。 */
    if (!partial) {
      for (const file of [...files.keys()]) if (!keep.has(file)) { files.delete(file); changedFiles++ }
    }

    const next = rebuild()
    let added = 0
    let removed = 0
    let unchanged = 0
    for (const sessionId of next.keys()) if (!reverse.has(sessionId)) added++
    for (const sessionId of reverse.keys()) if (!next.has(sessionId)) removed++
    for (const [sessionId, list] of next) if (reverse.get(sessionId) && sameCandidates(reverse.get(sessionId) as Candidate[], list)) unchanged++
    const total = next.size
    if (total - unchanged > 0) try { sink.log('info', 'persona.binding.sync', { added, removed, unchanged, total }) } catch { /* 日志不外泄 */ }
    noteAmbiguity(next)
    reverse = next
    ready = true
    lastRefreshAt = now()
    noteRefresh(reason, changedFiles, errors, statStart - started, lastRefreshAt - statStart, changedFiles === 0)
  }

  function refresh(reason = 'manual'): Promise<void> {
    if (inFlight) return inFlight
    inFlight = runRefresh(reason)
      .catch((error) => { fail('refresh', root, codeOf(error), messageOf(error)); ready = true })
      .finally(() => { inFlight = null })
    return inFlight
  }

  function lookup(sessionId: string): OwnershipLookup {
    const at = now()
    const id = typeof sessionId === 'string' ? sessionId : ''
    const hitList = id ? reverse.get(id) : undefined
    if (hitList && hitList.length > 0) {
      const winner = hitList[0]
      if (!inFlight && at - lastRefreshAt >= HIT_REFRESH_MS) void refresh('hit')
      return {
        hit: true, reason: 'hit', channel: winner.channel, botId: winner.botId,
        ambiguous: hitList.length > 1, candidates: hitList.map((c) => c.channel + '/' + c.botId),
        cacheAgeMs: lastRefreshAt ? at - lastRefreshAt : 0,
      }
    }
    const negativeAge = at - negativeAt
    if (ready && id && negativeAge >= 0 && negativeAge < NEGATIVE_TTL_MS) return emptyLookup('negative-cache', negativeAge)
    if (id) negativeAt = at
    if (!inFlight) void refresh('miss')
    return emptyLookup(ready ? 'miss' : 'not-ready', lastRefreshAt ? at - lastRefreshAt : 0)
  }

  return { lookup, warm: () => refresh('warm'), refresh }
}
