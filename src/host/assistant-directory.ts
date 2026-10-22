/** 助理人设目录（T8-2 #170）：把家表里的绑定行按 `channel + botId` 摊成内存索引。
 *
 * 为什么需要它：归属索引只知道「会话属于哪个渠道的哪个机器人」，人设正文与名字在家表（homes.yaml）里。
 * 本模块是两者之间的 join：只收 `status === 'bound'` 且 channel/botId 俱全的行，取 `name` 与
 * `persona`（#169 的读侧访问器统一归一，空/坏值读成 ''）。
 *
 * 刷新口径与归属索引一致：**只由注入回调懒触发**（250ms 节流）+ 装配期 warm，无 timer / watch。
 * 文件没变（mtime+size 相同）⇒ 不重读、不落日志；读回不可信 ⇒ 保留上次快照（不把所有人设清空）。
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { assistantFieldText } from '../assistant-fields.js'
import { configDirFor } from './config-yaml.js'
import { loadHomesDocState, type AssistantRow } from './home-store-io.js'
import type { PersonaLogSink } from './session-ownership.js'

export interface AssistantRef {
  assistantId: string
  name: string
  persona: string
  description: string
}

export interface AssistantDirectory {
  lookup(channel: string, botId: string): AssistantRef | null
  warm(): Promise<void>
  refresh(reason?: string): Promise<void>
}

export interface AssistantDirectoryOptions {
  dshHome: string
  log?: PersonaLogSink | null
  now?: () => number
}

const TOUCH_MS = 250

function codeOf(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code ?? 'error')
}

function messageOf(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? error)
}

function keyOf(channel: string, botId: string): string {
  return channel + '\u0000' + botId
}

function rowRef(row: AssistantRow): AssistantRef {
  return {
    assistantId: row.id,
    name: row.name,
    persona: assistantFieldText(row, 'persona'),
    description: assistantFieldText(row, 'description'),
  }
}

/** 建目录索引。lookup 只命中 bound 行；未绑定/孤儿行即使带 channel+botId 也不注入。 */
export function createAssistantDirectory(options: AssistantDirectoryOptions): AssistantDirectory {
  const sink: PersonaLogSink = options.log ?? { log() { /* 未注入日志 */ } }
  const now = options.now ?? Date.now
  const file = path.join(configDirFor(options.dshHome), 'homes.yaml')

  let byBot = new Map<string, AssistantRef>()
  let ready = false
  let loadedAt = 0
  let lastStamp = ''
  /** 失败日志去重：同 (state,message) 只记一次（恢复成功时清空），避免失败期间每次重试都刷盘。 */
  let lastFail = ''
  let inFlight: Promise<void> | null = null

  async function stampOf(): Promise<string> {
    try {
      const stat = await fsp.stat(file)
      return stat.mtimeMs + ':' + stat.size
    } catch (error) {
      return codeOf(error) === 'ENOENT' ? 'missing' : 'stat-failed'
    }
  }

  function noteRefresh(reason: string, statMs: number, parseMs: number, errors: number, cached: boolean): void {
    try {
      sink.log('debug', 'persona.refresh', {
        reason, files: 1, changedFiles: cached ? 0 : 1, sessions: 0, assistants: byBot.size,
        statMs, parseMs, errors, cached,
      })
    } catch { /* 日志不许外泄到功能面 */ }
  }

  function fail(state: string, message: string): void {
    const key = state + '|' + message
    if (lastFail === key) return
    lastFail = key
    try {
      sink.log('warn', 'persona.refresh.fail', {
        phase: 'refresh', file, code: state, reason: 'homes-unreadable', message, sessionId: '',
      })
    } catch { /* 日志不许外泄到功能面 */ }
  }

  async function runRefresh(reason: string): Promise<void> {
    const started = now()
    const stamp = await stampOf()
    const statMs = now() - started
    /* 早返回也必须推进 loadedAt：否则 250ms 后每次 lookup 都会再 stat 一次，节流形同虚设（#170 评审 P2-4）。 */
    if (ready && stamp === lastStamp) { loadedAt = now(); return }
    lastStamp = stamp
    const loadStart = now()
    const loaded = await loadHomesDocState(file)
    const parseMs = now() - loadStart
    if (loaded.state === 'read-failed' || loaded.state === 'parse-failed') {
      fail(loaded.state, '家表读回不可信（' + loaded.state + '），保留上次人设快照')
      ready = true
      /* 不推进 lastStamp：stamp 没变也要在下次 lookup 重试——瞬时 EACCES / 半写 YAML 不能让人设快照永久冻结。
       * loadedAt 照常推进，重试频率仍受 250ms 节流约束。 */
      lastStamp = ''
      loadedAt = now()
      noteRefresh(reason, statMs, parseMs, 1, true)
      return
    }
    const next = new Map<string, AssistantRef>()
    for (const row of loaded.doc.assistants) {
      if (row.status !== 'bound' || !row.channel || !row.botId) continue
      next.set(keyOf(row.channel, row.botId), rowRef(row))
    }
    byBot = next
    ready = true
    loadedAt = now()
    lastFail = ''
    noteRefresh(reason, statMs, parseMs, 0, false)
  }

  function refresh(reason = 'manual'): Promise<void> {
    if (inFlight) return inFlight
    inFlight = runRefresh(reason)
      .catch((error) => {
        fail('refresh-error', messageOf(error))
        ready = true
      })
      .finally(() => { inFlight = null })
    return inFlight
  }

  function lookup(channel: string, botId: string): AssistantRef | null {
    const at = now()
    if (!ready || at - loadedAt >= TOUCH_MS) void refresh('lookup')
    if (!channel || !botId) return null
    return byBot.get(keyOf(channel, botId)) ?? null
  }

  return { lookup, warm: () => refresh('warm'), refresh }
}
