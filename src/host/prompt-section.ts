/** 人设系统提示词段（T8-2 #170）：DSH systemPrompt 服务里的 `dsh-im-companion:persona`。
 *
 * 注册归属（关键）：`systemPrompt.section()` 把段挂在**服务所在的 fiber**（dsh-base），不是调用方插件 fiber——
 * 消费者 fiber 被销毁后段仍留在服务上。故这里**必须接住 section() 的 disposer**，并挂到插件 ctx.effect：
 * 插件卸载/热重载时主动清掉旧段，否则同名再注册会撞 `already registered`，旧段还继续读到空归属。
 * 热重载竞态下旧段可能尚未清完 ⇒ `section()` 抛错只记一条 resident 失败（phase:'section-register'），
 * **绝不打断 apply**（systemPrompt 是可选服务，缺了也只是没有人设注入）。
 *
 * 渲染契约（探索包 §2）：`text(assembly)` 是**同步纯内存**——只读归属索引与人设目录，零 fs、零 await、
 * 绝不抛（宿主 assemble 不包 try/catch）。sessionId 缺失/非字符串、无归属、无人设、超长、任何异常 ⇒ ''。
 * 正文红线：人设原文**绝不进日志**，只记长度 / sha8 / 渠道 / 机器人 / 会话 id。
 */
import { createHash } from 'node:crypto'
import { ASSISTANT_FIELD_SPECS, assistantFieldText, countCodePoints } from '../assistant-fields.js'
import type { AssistantRef } from './assistant-directory.js'
import type { OwnershipLookup, PersonaLogSink } from './session-ownership.js'

export const PERSONA_SECTION_NAME = 'dsh-im-companion:persona'
export const PERSONA_SECTION_ORDER = 650

const MAX_PERSONA = ASSISTANT_FIELD_SPECS.persona.max

export interface PersonaPromptOptions {
  ownership: { lookup(sessionId: string): OwnershipLookup }
  directory: { lookup(channel: string, botId: string): AssistantRef | null }
  log?: PersonaLogSink | null
  now?: () => number
}

export interface PersonaSection {
  /** 在 apply 末尾调用：后置 ctx.inject(['systemPrompt'])；服务缺席时静默跳过。 */
  install(ctx: unknown): void
  /** 同步渲染（宿主 assemble 直接调用）；永不抛。 */
  text(assembly: unknown): string
  /** 主动清理（测试与卸载用）。 */
  dispose(): void
}

function messageOf(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? error)
}

/** sessionId 只认 `assembly.agent.session.id` 的非空字符串；数字/对象/缺失一律 ''（不 String() 猜）。 */
function sessionIdOf(assembly: unknown): string {
  const id = (assembly as { agent?: { session?: { id?: unknown } } } | null)?.agent?.session?.id
  return typeof id === 'string' && id.length > 0 ? id : ''
}

/** 名字清洗：String → CRLF 压成单空格 → trim → 最多 64 码点（不切坏代理对）→ 空则「未命名助理」。 */
function sanitizeName(raw: unknown): string {
  const text = raw === null || raw === undefined ? '' : String(raw)
  const flat = text.replace(/[\r\n]+/g, ' ').trim()
  if (!flat) return '未命名助理'
  const chars = Array.from(flat)
  return chars.length > 64 ? chars.slice(0, 64).join('') : flat
}

function sha8(text: string): string {
  return text ? createHash('sha256').update(text).digest('hex').slice(0, 8) : ''
}

export function createPersonaSection(options: PersonaPromptOptions): PersonaSection {
  const sink: PersonaLogSink = options.log ?? { log() { /* 未注入日志 */ } }

  let installed = false
  let disposed = false
  let disposeSection: (() => void) | null = null
  let lastFail = ''

  /** 失败留痕：resident warn；同一 (phase,reason,sessionId,长度) 只在第一次记，避免每次渲染刷盘。 */
  function fail(fields: { phase: string; reason: string; message: string; sessionId?: string; chars?: number }): void {
    const key = fields.phase + '|' + fields.reason + '|' + (fields.sessionId ?? '') + '|' + (fields.chars ?? 0)
    if (lastFail === key) return
    lastFail = key
    try {
      sink.log('warn', 'persona.refresh.fail', {
        phase: fields.phase, file: '', code: fields.reason, reason: fields.reason,
        message: fields.message, sessionId: fields.sessionId ?? '',
      })
    } catch { /* 日志不许外泄到功能面 */ }
  }

  function noteResolve(fields: Record<string, unknown>): void {
    try { sink.log('debug', 'persona.resolve', fields) } catch { /* 日志不许外泄到功能面 */ }
  }

  function resolve(sessionId: string, lookup: OwnershipLookup | null, body: string, personaChars: number, reason: string): string {
    noteResolve({
      sessionId,
      hit: body.length > 0,
      reason,
      channel: lookup?.channel ?? '',
      botId: lookup?.botId ?? '',
      ambiguous: lookup?.ambiguous ?? false,
      textChars: countCodePoints(body),
      personaChars,
      sha8: sha8(body),
      cacheAgeMs: lookup?.cacheAgeMs ?? 0,
    })
    return body
  }

  function text(assembly: unknown): string {
    let sessionId = ''
    let lookup: OwnershipLookup | null = null
    try {
      sessionId = sessionIdOf(assembly)
      if (!sessionId) return resolve('', null, '', 0, 'no-session')
      lookup = options.ownership.lookup(sessionId)
      if (!lookup || !lookup.hit) return resolve(sessionId, lookup, '', 0, lookup?.reason ?? 'miss')
      const row = options.directory.lookup(lookup.channel, lookup.botId)
      if (!row) return resolve(sessionId, lookup, '', 0, 'no-assistant')
      const persona = assistantFieldText(row, 'persona')
      if (!persona) return resolve(sessionId, lookup, '', 0, 'persona-empty')
      const personaChars = countCodePoints(persona)
      if (personaChars > MAX_PERSONA) {
        fail({
          phase: 'render', reason: 'persona-too-long', sessionId, chars: personaChars,
          message: '人物设定超过 ' + MAX_PERSONA + ' 字（' + personaChars + '），本次跳过注入',
        })
        return resolve(sessionId, lookup, '', personaChars, 'persona-too-long')
      }
      const body = '## 助理身份：' + sanitizeName(row.name) + '\n\n' + persona + '\n\n始终以该身份回应'
      return resolve(sessionId, lookup, body, personaChars, 'ok')
    } catch (error) {
      fail({ phase: 'render', reason: 'render-failed', sessionId, message: messageOf(error) })
      return resolve(sessionId, lookup, '', 0, 'render-failed')
    }
  }

  function release(): void {
    const dispose = disposeSection
    disposeSection = null
    installed = false
    if (!dispose) return
    try {
      dispose()
    } catch (error) {
      fail({ phase: 'dispose', reason: 'section-dispose', message: messageOf(error) })
    }
  }

  function failRegister(error: unknown): void {
    const message = messageOf(error)
    fail({
      phase: 'section-register',
      reason: 'section-register',
      message,
    })
  }

  function install(ctx: unknown): void {
    const host = ctx as { inject?: (list: string[], cb: (serviceCtx: unknown) => void) => unknown; effect?: (fn: () => unknown, label?: string) => unknown } | null
    if (disposed || !host || typeof host.inject !== 'function') return
    try {
      host.inject(['systemPrompt'], (serviceCtx: unknown) => {
        if (disposed || installed) return
        try {
          const service = (serviceCtx as { systemPrompt?: { section?: (spec: unknown) => unknown } } | null)?.systemPrompt
          if (!service || typeof service.section !== 'function') return
          const remove = service.section({
            name: PERSONA_SECTION_NAME,
            order: PERSONA_SECTION_ORDER,
            interpolate: false,
            text: (assembly: unknown) => text(assembly),
          })
          installed = true
          disposeSection = typeof remove === 'function' ? remove as () => void : () => { /* 服务不回 disposer */ }
          if (typeof host.effect === 'function') {
            try {
              host.effect(() => () => { release() }, 'dsh-im-companion: persona section cleanup')
            } catch (error) {
              release()
              throw error
            }
          }
        } catch (error) {
          failRegister(error)
        }
      })
    } catch (error) {
      failRegister(error)
    }
  }

  function dispose(): void {
    disposed = true
    release()
  }

  return { install, text, dispose }
}
