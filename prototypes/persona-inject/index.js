/**
 * T6 #166 wayfinder 原型（可丢弃，不并入产品代码）：最小宿主侧注入链路。
 *
 * 只做三件事的取证：
 *   Q1) 宿主插件注册 systemPrompt.section（T4 #164 定案：section 单通道、order 650、name 前缀）后，
 *       真实 IM 会话每一步 system 提示词是否都含注入文本（每 step 一次 text 调用、不留历史）。
 *   Q2) assembly.agent.session 在 companion 宿主回调里的实际形状与可用性。
 *   Q3) 磁盘映射读取（state.json）在真实 DSH_HOME 下的耗时、失败模式、缓存行为（由 ownership.js + 间隔刷新体现）。
 *
 * 挂载：mount.ps1（写 desktop profile：package.json dependencies + node_modules Junction + cordis.patch.yml insert 条目）。
 * 卸载：unmount.ps1。原型故意只在 evidence.jsonl 落证据，不改任何产品代码、不写 dsh-im 落盘。
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEvidence } from './evidence.js'
import { loadPersonas, pickPersona, renderPersona } from './persona.js'
import { createOwnershipReader } from './ownership.js'

export const name = 'dsh-persona-inject-proto'
export const SECTION_NAME = 'dsh-im-companion:persona-proto'
export const SECTION_ORDER = 650

const here = path.dirname(fileURLToPath(import.meta.url))
const PERSONAS_FILE = path.join(here, 'personas.json')
const EVIDENCE_FILE = path.join(here, 'evidence.jsonl')

function resolveDshHome(config) {
  if (config && typeof config.dshHome === 'string' && config.dshHome.trim() !== '') return config.dshHome
  if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== '') return process.env.DSH_HOME
  return path.join(os.homedir(), '.dsh')
}

function keysOf(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null
  try {
    return Object.keys(value).sort()
  } catch {
    return null
  }
}

function valueOf(value) {
  if (value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value === null) return null
  const keys = keysOf(value)
  return keys ? { __kind: typeof value, keys: keys.slice(0, 20) } : { __kind: typeof value }
}

function summaryOfKeys(value) {
  const keys = keysOf(value)
  return keys ? { count: keys.length, sample: keys.slice(0, 8) } : null
}

function describeShape(context) {
  const agent = context && context.agent ? context.agent : null
  const session = agent && agent.session ? agent.session : null
  const signal = context ? context.signal : undefined
  const shape = {
    contextKeys: keysOf(context),
    agentKeys: keysOf(agent),
    hasAgent: Boolean(agent),
    hasSession: Boolean(session),
    sessionKeys: keysOf(session),
    scopeIsAgent: Boolean(context && context.scope && context.scope === agent),
    hasSignal: signal !== undefined,
    signalIsAbortSignal: typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal,
  }
  if (agent) {
    shape.agentId = valueOf(agent.id)
    shape.agentPhase = valueOf(agent.phase)
    shape.agentOptionsKeys = keysOf(agent.options)
  }
  if (session) {
    shape.sessionId = typeof session.id === 'string' ? session.id : valueOf(session.id)
    shape.sessionIdType = typeof session.id
    shape.sessionKeysCount = Array.isArray(shape.sessionKeys) ? shape.sessionKeys.length : null
    const header = session.header || null
    shape.sessionHeaderKeys = keysOf(header)
    shape.sessionHeader = header
      ? {
          id: valueOf(header.id),
          cwd: valueOf(header.cwd),
          agentPreset: valueOf(header.agentPreset),
          origin: valueOf(header.origin),
          parentSession: valueOf(header.parentSession),
          createdAt: valueOf(header.createdAt),
        }
      : null
    shape.sessionContextFoldKeys = summaryOfKeys(session.contextFold)
    shape.sessionDerivedKeys = summaryOfKeys(session.derived)
    shape.sessionDerivedNodeKeys = summaryOfKeys(session.derivedNodes)
    shape.sessionLogKeys = summaryOfKeys(session.log)
    shape.sessionSurfaceManager = summaryOfKeys(session.surfaceManager)
    shape.sessionInheritedEventCount = valueOf(session.inheritedEventCount)
    // 兼容平铺字段（Q2 取证直接读这几个即可；真实来源一般是 header）
    shape.sessionCwd = valueOf(header !== null && header.cwd !== undefined ? header.cwd : session.cwd)
    shape.sessionAgentPreset = valueOf(header !== null && header.agentPreset !== undefined ? header.agentPreset : session.agentPreset)
    shape.sessionOrigin = valueOf(header !== null && header.origin !== undefined ? header.origin : session.origin)
    shape.sessionParentSession = valueOf(header !== null && header.parentSession !== undefined ? header.parentSession : session.parentSession)
    shape.sessionBotId = valueOf(session.botId)
  }
  return shape
}

export function apply(ctx, config = {}) {
  const dshHome = resolveDshHome(config)
  const evidenceFile = typeof config.evidenceFile === 'string' && config.evidenceFile ? config.evidenceFile : EVIDENCE_FILE
  const personasFile = typeof config.personasFile === 'string' && config.personasFile ? config.personasFile : PERSONAS_FILE
  const intervalMs = Number(config.refreshIntervalMs) > 0 ? Number(config.refreshIntervalMs) : 1000
  const evidence = createEvidence(evidenceFile)
  const ownership = createOwnershipReader({ dshHome, intervalMs, log: (event, fields) => evidence.log(event, fields) })
  const forced = config.forceMap && typeof config.forceMap === 'object' ? config.forceMap : {}
  // 送达自测开关（仅原型用）：对「挂载后新建、且未被归属」的会话也注入，用来验 fresh session 初始 system 是否送达。
  const injectUnownedAfterRaw = typeof config.injectUnownedAfter === 'string' ? config.injectUnownedAfter : null
  const injectUnownedAfterMs = injectUnownedAfterRaw !== null && Number.isFinite(Date.parse(injectUnownedAfterRaw)) ? Date.parse(injectUnownedAfterRaw) : null
  const injectUnownedBotId = typeof config.injectUnownedBotId === 'string' && config.injectUnownedBotId ? config.injectUnownedBotId : 'probe'
  const calls = new Map()
  const shapeSeen = new Set()

  function ownerFor(sessionId) {
    if (sessionId && Object.prototype.hasOwnProperty.call(forced, sessionId)) {
      const f = forced[sessionId]
      return { hit: true, forced: true, entry: { channel: String(f.channel || 'forced'), botId: String(f.botId || 'forced'), key: 'forced' } }
    }
    return ownership.lookup(sessionId)
  }

  function probeEligible(session) {
    if (injectUnownedAfterMs === null || !session) return null
    const header = session.header || {}
    let created = header.createdAt
    if (typeof created === 'string') created = Date.parse(created)
    if (typeof created !== 'number' || !Number.isFinite(created)) return null
    if (created < 1e12) created *= 1000
    return created >= injectUnownedAfterMs ? { createdAt: created } : null
  }

  function render(context) {
    try {
      const agent = context && context.agent ? context.agent : null
      const session = agent && agent.session ? agent.session : null
      const sessionId = session && typeof session.id === 'string' ? session.id : null
      if (sessionId && !shapeSeen.has(sessionId)) {
        shapeSeen.add(sessionId)
        evidence.log('session.shape', { sessionId, ...describeShape(context) })
      }
      if (!sessionId) {
        evidence.log('persona.text', { action: 'skip-no-session', callIndex: 0 })
        return ''
      }
      const callIndex = (calls.get(sessionId) || 0) + 1
      calls.set(sessionId, callIndex)
      let owner = ownerFor(sessionId)
      let matchedForm = 'exact'
      if (!owner || !owner.hit) {
        const alternate = sessionId.startsWith('session-') ? sessionId.slice('session-'.length) : 'session-' + sessionId
        const altOwner = ownerFor(alternate)
        if (altOwner && altOwner.hit) {
          owner = altOwner
          matchedForm = 'prefix-toggle'
        }
      }
      if (!owner || !owner.hit) {
        const probe = probeEligible(session)
        if (probe) {
          const personas = personasRead()
          const rendered = renderPersona(pickPersona(personas, injectUnownedBotId))
          evidence.log('persona.text', {
            action: rendered.text ? 'inject' : 'skip-empty',
            probe: true,
            sessionId,
            callIndex,
            botId: injectUnownedBotId,
            createdAt: probe.createdAt,
            personaName: rendered.name,
            personaChars: rendered.personaChars,
            length: rendered.length,
            sha8: rendered.sha8,
            error: rendered.error || null,
          })
          return rendered.text
        }
        evidence.log('persona.text', {
          action: 'skip-unowned',
          sessionId,
          callIndex,
          reason: owner ? owner.reason : 'no-owner',
          missReason: owner ? owner.reason : 'no-owner',
          triedAlternate: true,
          cacheAgeMs: owner ? owner.cacheAgeMs : null,
        })
        return ''
      }
      const entry = owner.entry || {}
      const personas = personasRead()
      const rendered = renderPersona(pickPersona(personas, entry.botId))
      if (!rendered.text) {
        evidence.log('persona.text', {
          action: 'skip-empty',
          sessionId,
          callIndex,
          botId: entry.botId,
          channel: entry.channel,
          error: rendered.error || 'empty',
          forced: Boolean(owner.forced),
        })
        return ''
      }
      evidence.log('persona.text', {
        action: 'inject',
        sessionId,
        callIndex,
        botId: entry.botId,
        channel: entry.channel,
        matchKey: entry.key,
        matchedForm,
        sessionIdInFile: matchedForm === 'prefix-toggle' ? (sessionId.startsWith('session-') ? sessionId.slice(8) : 'session-' + sessionId) : sessionId,
        forced: Boolean(owner.forced),
        ambiguity: Boolean(owner.ambiguous),
        ambiguous: Boolean(owner.ambiguous),
        personaName: rendered.name,
        personaChars: rendered.personaChars,
        length: rendered.length,
        sha8: rendered.sha8,
      })
      return rendered.text
    } catch (error) {
      evidence.log('persona.text.fail', { message: String((error && error.message) || error), stack: String((error && error.stack) || '').split('\n').slice(0, 4) })
      return ''
    }
  }

  let personasCache = null
  function personasRead() {
    if (!personasCache) {
      personasCache = loadPersonas(personasFile)
      if (personasCache && personasCache.error) evidence.log('personas.load.fail', { file: personasFile, message: personasCache.error })
      else evidence.log('personas.loaded', { file: personasFile, bots: Object.keys((personasCache && personasCache.perBot) || {}).length, hasDefault: Boolean(personasCache && personasCache.default) })
    }
    return personasCache && !personasCache.error ? personasCache : {}
  }

  evidence.log('plugin.load', {
    dshHome,
    evidenceFile,
    personasFile,
    intervalMs,
    sectionName: SECTION_NAME,
    sectionOrder: SECTION_ORDER,
    forcedSessions: Object.keys(forced).length,
    injectUnownedAfter: injectUnownedAfterRaw,
    injectUnownedBotId,
    node: process.version,
    pid: process.pid,
    cwd: process.cwd(),
  })

  ctx.effect(() => {
    ownership.start()
    return () => {
      try {
        ownership.stop()
        evidence.log('plugin.dispose', { snapshot: ownership.snapshot() })
      } catch (error) {
        evidence.log('plugin.dispose.fail', { message: String((error && error.message) || error) })
      }
    }
  })

  ctx.inject(['systemPrompt'], (serviceCtx) => {
    try {
      serviceCtx.systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, interpolate: false, text: render })
      evidence.log('section.registered', { name: SECTION_NAME, order: SECTION_ORDER, interpolate: false })
    } catch (error) {
      evidence.log('section.register.fail', {
        message: String((error && error.message) || error),
        stack: String((error && error.stack) || '').split('\n').slice(0, 4),
      })
    }
  })
}