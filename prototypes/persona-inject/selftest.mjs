import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = await import('./index.js')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-inject-selftest-'))
const dshHome = path.join(tmpRoot, 'dsh-home')
const evidenceFile = path.join(tmpRoot, 'evidence.jsonl')
const personasFile = path.join(here, 'personas.json')
const results = []
let failed = 0

function assert(condition, name, detail) {
  if (condition) {
    results.push('PASS ' + name)
  } else {
    failed += 1
    results.push('FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value), 'utf8')
}

// ---- fixture: 真实 DSH_HOME 形状（bots + accounts 双覆盖、坏 JSON、sessions 非对象、.tmp 遗留）----
const alphaState = path.join(dshHome, 'integrations', 'dsh-feishu', 'bots', 'bot_alpha', 'state.json')
writeJson(alphaState, { version: 1, sessions: { 'p2p:u1': 'session-alpha-1111' } })
writeJson(path.join(dshHome, 'integrations', 'dsh-weixin', 'accounts', 'wx_one', 'state.json'), { sessions: { 'p2p:u2@im.wechat': 'session-wx-2222' } })
writeJson(path.join(dshHome, 'integrations', 'dsh-feishu', 'bots', 'bot_broken', 'state.json'), { sessions: { 'p2p:x': 'session-broken' } })
fs.writeFileSync(path.join(dshHome, 'integrations', 'dsh-feishu', 'bots', 'bot_broken', 'state.json'), '{not-json', 'utf8')
writeJson(path.join(dshHome, 'integrations', 'dsh-feishu', 'bots', 'bot_shape', 'state.json'), { sessions: ['session-bad'] })
fs.writeFileSync(path.join(dshHome, 'integrations', 'dsh-feishu', 'bots', 'bot_alpha', 'state.json.tmp'), '{"sessions":{"p2p:tmp":"session-tmp"}}', 'utf8')

// ---- mock cordis ctx / systemPrompt service ----
const sections = []
const disposers = []
let injected = null
const ctx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
  inject(names, callback) {
    injected = { names, callback }
  },
  logger: () => ({ info() {}, warn() {}, error() {} }),
}
const fakeService = {
  section(registration) {
    sections.push(registration)
    return { dispose() {} }
  },
}

plugin.apply(ctx, {
  dshHome,
  evidenceFile,
  personasFile,
  refreshIntervalMs: 60,
})

assert(injected !== null, 'ctx.inject called')
assert(injected && JSON.stringify(injected.names) === '["systemPrompt"]', 'inject 服务名 = systemPrompt', injected && injected.names)
injected.callback({ systemPrompt: fakeService })

assert(sections.length === 1, 'section 注册一次')
const section = sections[0] || {}
assert(section.name === 'dsh-im-companion:persona-proto', 'section.name 带 dsh-im-companion: 前缀', section.name)
assert(section.order === 650, 'section.order = 650', section.order)
assert(section.interpolate === false, 'section.interpolate = false', section.interpolate)
assert(typeof section.text === 'function', 'section.text 是函数')

const agentA = { session: { id: 'session-alpha-1111', cwd: 'C:\\work', agentPreset: 'standard' } }
const contextA = { agent: agentA, scope: agentA, signal: new AbortController().signal }
const textA = section.text(contextA)
assert(typeof textA === 'string' && textA.length > 0, 'Q1 归属命中 ⇒ 注入文本非空', { length: textA && textA.length })
assert(textA.startsWith('## 助理身份：'), '模板前缀正确', textA.slice(0, 20))
assert(textA.includes('PERSONA-PROTO ok'), '模板含可辨识标记 PERSONA-PROTO')
assert(textA.endsWith('始终以该身份回应'), '模板后缀正确')
assert(!textA.includes('\\r'), 'personaNorm 无 CR 残留')

const agentB = { session: { id: 'session-unowned-0000' } }
const contextB = { agent: agentB, scope: agentB }
assert(section.text(contextB) === '', '未归属会话 ⇒ 空串（不注入）')
assert(section.text(contextB) === '', '同一未归属会话 2s 内再查 ⇒ 负结果缓存（仍空串）')
assert(section.text({}) === '', '无 agent 的 context ⇒ 空串且不抛')

// ---- 负缓存 + 首条 miss 第二条必须中（T4 同步纪律）----
const lateSessionId = 'session-late-9999'
const lateAgent = { session: { id: lateSessionId } }
const lateContext = { agent: lateAgent, scope: lateAgent }
assert(section.text(lateContext) === '', '新会话首次调用可 miss（空串）')
await new Promise((resolve) => setTimeout(resolve, 160))
writeJson(alphaState, { version: 1, sessions: { 'p2p:u1': 'session-alpha-1111', 'p2p:late': lateSessionId } })
await new Promise((resolve) => setTimeout(resolve, 160))
const lateText = section.text(lateContext)
assert(typeof lateText === 'string' && lateText.length > 0, '落盘出现绑定后，下一次 text 调用命中（第二条必须中）')

// ---- 1:N：同 session 两个 bot 归属，取 mtime 最新者 ----
const betaState = path.join(dshHome, 'integrations', 'dsh-feishu', 'bots', 'bot_beta', 'state.json')
writeJson(betaState, { sessions: { 'group:chat-42': 'session-alpha-1111' } })
const older = new Date(Date.now() - 60000)
fs.utimesSync(alphaState, older, older)
const newer = new Date()
fs.utimesSync(betaState, newer, newer)
await new Promise((resolve) => setTimeout(resolve, 160))
section.text(contextA)
section.text(contextA) // 第二次让 ambiguity 去重逻辑仍有一次记录

// ---- 收尾：dispose + 证据文件自检 ----
for (const dispose of disposers) dispose()
await new Promise((resolve) => setTimeout(resolve, 80))

const raw = fs.readFileSync(evidenceFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
const events = raw.map((row) => row.event)
assert(events.includes('plugin.load'), '证据含 plugin.load')
assert(events.includes('section.registered'), '证据含 section.registered')
assert(events.includes('session.shape'), '证据含 session.shape（Q2）')
assert(events.includes('persona.text'), '证据含 persona.text（Q1/Q3）')
assert(events.includes('ownership.refresh'), '证据含 ownership.refresh（Q3 耗时）')
assert(events.includes('ownership.refresh.fail'), '坏 JSON / sessions 非对象 ⇒ refresh.fail（fail-soft）')
assert(events.includes('ownership.ambiguity'), '1:N ⇒ ownership.ambiguity')
assert(events.includes('plugin.dispose'), 'dispose 时清掉 interval 并记 plugin.dispose')

const shape = raw.find((row) => row.event === 'session.shape' && row.sessionId === 'session-alpha-1111')
assert(!!shape, 'session.shape 命中真实会话 id')
assert(shape && shape.sessionIdType === 'string', 'Q2 session.id 是 string')
assert(shape && JSON.stringify(shape.contextKeys) === '["agent","scope","signal"]', 'Q2 context = {agent, scope, signal}', shape && shape.contextKeys)
assert(shape && Array.isArray(shape.agentKeys) && shape.agentKeys.includes('session'), 'Q2 agent.session 可用', shape && shape.agentKeys)
assert(shape && Array.isArray(shape.sessionKeys), 'Q2 记录 sessionKeys')
assert(shape && shape.scopeIsAgent === true, 'Q2 scope === agent')
assert(shape && shape.signalIsAbortSignal === true, 'Q2 signal 是 AbortSignal')
assert(shape && ['sessionCwd', 'sessionAgentPreset', 'sessionOrigin', 'sessionParentSession'].every((key) => Object.hasOwn(shape, key)), 'Q2 记录 cwd/agentPreset/origin/parentSession 字段')
assert(shape && Object.hasOwn(shape, 'sessionBotId'), 'Q2 记录 session 上有没有 botId')

const injectRows = raw.filter((row) => row.event === 'persona.text' && row.action === 'inject')
assert(injectRows.length >= 1, 'inject 事件 ≥ 1', injectRows.length)
const latestInject = injectRows[injectRows.length - 1]
assert(latestInject && latestInject.ambiguous === true, '1:N 时 inject 事件标 ambiguous')
assert(latestInject && latestInject.botId === 'bot_beta', '1:N 取 mtime 最新者（bot_beta）', latestInject && latestInject.botId)
assert(latestInject && typeof latestInject.sha8 === 'string' && latestInject.sha8.length === 8, '终稿指纹 sha8（8 位）')
assert(raw.every((row) => typeof row.t === 'string' && typeof row.seq === 'number'), '每行都有 t/seq（JSONL 可机器读）')

const skipRows = raw.filter((row) => row.event === 'persona.text' && row.action === 'skip-unowned')
assert(skipRows.some((row) => row.missReason === 'negative-cache'), '负结果缓存命中被记录（≤2s TTL）')

fs.writeFileSync(path.join(tmpRoot, 'selftest-evidence-reference.jsonl'), JSON.stringify(raw, null, 2), 'utf8')
console.log(results.join('\n'))
console.log('\nEVENTS=' + events.length + ' PATH=' + evidenceFile)
console.log(failed === 0 ? 'SELFTEST-PASS ' + results.length + '/' + results.length : 'SELFTEST-FAIL ' + failed + ' of ' + results.length)
fs.rmSync(tmpRoot, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
