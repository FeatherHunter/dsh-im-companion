#!/usr/bin/env node
/**
 * T6 #166 · 取证任务 B：DSH 会话日志只读取证（inspect-session.mjs）
 *
 * 输入一个 sessionId（或 --list / --latest），在 <DSH_HOME>/sessions 下定位
 * <cwd 编码目录>/<session 目录>/session.v4.jsonl.zstd，逐帧解压 zstd、逐行解析 JSONL，
 * 输出事件统计与三条判定：
 *   J1 每步 system prompt 是否含人设注入正文（及可判定的替代证据：assistant 效果标记 / step 计数）
 *   J2 会话历史里是否多出 user 角色的注入快照（真实用户消息按 source.kind==='user' 计数）
 *   J3 注入正文是否落进会话历史
 *
 * 只读；绝不写 DSH_HOME。
 * 复现：node prototypes/persona-inject/inspect-session.mjs session-3d394605-d1ab-4088-8f05-ac9f746e7993
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'

const VERSION = '1.0.0'
const DEFAULT_HOME = path.join(os.homedir(), '.dsh')
const PERSONA_MARKER_DEFAULT = '## 助理身份：'
const EFFECT_MARKER_DEFAULT = '[PERSONA-PROTO ok]'
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

function parseArgs(argv) {
  const o = { home: DEFAULT_HOME, json: false, out: null, list: false, latest: false, sessionId: null, personaMarker: PERSONA_MARKER_DEFAULT, effectMarker: EFFECT_MARKER_DEFAULT, maxSample: 160, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--home') o.home = path.resolve(argv[++i] || '')
    else if (a === '--json') o.json = true
    else if (a === '--out') o.out = path.resolve(argv[++i] || '')
    else if (a === '--list') o.list = true
    else if (a === '--latest') o.latest = true
    else if (a === '--persona-marker') o.personaMarker = argv[++i]
    else if (a === '--effect-marker') o.effectMarker = argv[++i]
    else if (a === '--max-sample') o.maxSample = Math.max(20, Number(argv[++i]) || 160)
    else if (a === '--help' || a === '-h') o.help = true
    else if (a.startsWith('-')) throw new Error('未知参数：' + a)
    else o.sessionId = a
  }
  return o
}

const round = (v, d = 4) => { const m = Math.pow(10, d); return Math.round(v * m) / m }
function pct(sorted, p) { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo), 2) }
function summarize(nums) {
  if (!nums.length) return { n: 0 }
  const s = nums.slice().sort((a, b) => a - b)
  return { n: s.length, mean: round(s.reduce((a, b) => a + b, 0) / s.length, 2), p50: pct(s, 0.5), p95: pct(s, 0.95), min: round(s[0], 2), max: round(s[s.length - 1], 2) }
}
const sha8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)

function listSessionFiles(home) {
  const root = path.join(home, 'sessions')
  let dirs
  try { dirs = fs.readdirSync(root, { withFileTypes: true }) } catch { return [] }
  const out = []
  for (const cwdDir of dirs) {
    if (!cwdDir.isDirectory()) continue
    const cwdPath = path.join(root, cwdDir.name)
    let subs
    try { subs = fs.readdirSync(cwdPath, { withFileTypes: true }) } catch { continue }
    for (const sub of subs) {
      if (!sub.isDirectory()) continue
      const file = path.join(cwdPath, sub.name, 'session.v4.jsonl.zstd')
      try {
        const st = fs.statSync(file)
        if (!st.isFile()) continue
        out.push({ cwdDir: cwdDir.name, dirName: sub.name, file, size: st.size, mtimeMs: st.mtimeMs })
      } catch {}
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return out
}

function splitZstdFrames(buf) {
  const offsets = []
  let i = 0
  while (i <= buf.length - 4) {
    if (buf[i] === ZSTD_MAGIC[0] && buf[i + 1] === ZSTD_MAGIC[1] && buf[i + 2] === ZSTD_MAGIC[2] && buf[i + 3] === ZSTD_MAGIC[3]) { offsets.push(i); i += 4 } else i++
  }
  if (!offsets.length) return [buf]
  const frames = []
  for (let k = 0; k < offsets.length; k++) frames.push(buf.subarray(offsets[k], k + 1 < offsets.length ? offsets[k + 1] : buf.length))
  return frames
}

function decodeSessionFile(file) {
  if (typeof zlib.zstdDecompressSync !== 'function') throw new Error('当前 Node 不支持 zlib.zstdDecompressSync（需 Node >= 22.15；本机 ' + process.version + '）')
  const buf = fs.readFileSync(file)
  const frames = splitZstdFrames(buf)
  const texts = []
  let errors = 0
  if (frames.length === 1) {
    try { texts.push(zlib.zstdDecompressSync(buf).toString('utf8')) } catch (err) { throw new Error('单帧解压失败：' + err.message) }
  } else {
    for (const frame of frames) {
      try { texts.push(zlib.zstdDecompressSync(frame).toString('utf8')) } catch (err) { errors++ }
    }
    if (!texts.length) throw new Error('多帧解压全部失败（' + frames.length + ' 帧）')
  }
  return { text: texts.join(''), frames: frames.length, decodeErrors: errors }
}

function parseEvents(text) {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const events = [], errors = []
  for (let i = 0; i < lines.length; i++) {
    try { events.push(JSON.parse(lines[i])) } catch (err) { errors.push({ line: i + 1, message: String(err.message).slice(0, 120) }) }
  }
  return { events, errors }
}

const eventText = (ev) => JSON.stringify(ev)

function analyze(events, opts) {
  const header = events.find((e) => e.type === 'session') || null
  const typeCounts = {}
  for (const e of events) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])

  const userMessages = events.filter((e) => e.type === 'user/message')
  const byKind = {}
  for (const e of userMessages) {
    const kind = e.data && e.data.source && e.data.source.kind ? e.data.source.kind : '(none)'
    byKind[kind] = (byKind[kind] || 0) + 1
  }
  const realUserMessages = userMessages.filter((e) => e.data && e.data.source && e.data.source.kind === 'user')
  const userRpcIds = [...new Set(realUserMessages.map((e) => (e.data.source && e.data.source.rpcId) || ''))].filter(Boolean)
  const userMessageIds = [...new Set(userMessages.map((e) => e.data && e.data.id).filter(Boolean))]

  const spliced = events.filter((e) => e.type === 'agent/inbox/spliced')
  const insertedUserIds = new Set()
  const insertedKinds = {}
  for (const e of spliced) {
    for (const item of (e.data && e.data.inserted) || []) {
      const kind = item && item.source && item.source.kind ? item.source.kind : '(none)'
      insertedKinds[kind] = (insertedKinds[kind] || 0) + 1
      if (kind === 'user' && item.id) insertedUserIds.add(item.id)
    }
  }

  const systemMessages = events.filter((e) => e.type === 'system/message').map((e) => {
    const text = ((e.data && e.data.message && e.data.message.content) || []).map((c) => (c && c.type === 'text' ? c.text : '')).join('')
    return { seq: e.seq, turn: e.data && e.data.turn, step: e.data && e.data.step, chars: text.length, sha8: sha8(text), hasPersonaMarker: text.includes(opts.personaMarker), rawText: text, sample: text.slice(0, opts.maxSample) }
  })

  const stepStarts = events.filter((e) => e.type === 'step/start')
  const assistantMessages = events.filter((e) => e.type === 'assistant/message').map((e) => {
    const msg = e.data && e.data.message
    const content = (msg && msg.content) || []
    const text = content.filter((c) => c && c.type === 'text').map((c) => c.text).join('')
    return { seq: e.seq, turn: e.data && e.data.turn, step: e.data && e.data.step, textChars: text.length, hasEffectMarker: text.includes(opts.effectMarker), sample: text.slice(0, opts.maxSample) }
  })

  // 每步判定：对每个 assistant/message，取 seq 在它之前最近的 system/message 作为该步生效 system prompt
  let covered = 0, uncovered = 0, marked = 0, unmarked = 0
  let lastPrompt = null
  for (const am of assistantMessages) {
    const prior = systemMessages.filter((s) => s.seq < am.seq).sort((a, b) => b.seq - a.seq)[0]
    if (prior) { covered++; if (prior.hasPersonaMarker) marked++; else unmarked++ } else uncovered++
  }

  // 注入段落抽取：从含 marker 的 system/message 里截出人设正文（到「始终以该身份回应」为止）
  const injectedSections = systemMessages.filter((s) => s.hasPersonaMarker).map((s) => {
    const raw = ((s.rawText) || '')
    const i = raw.indexOf(opts.personaMarker)
    const j = raw.indexOf('始终以该身份回应', i)
    const text = i >= 0 ? raw.slice(i, j >= 0 ? j + '始终以该身份回应'.length : undefined) : ''
    return { seq: s.seq, turn: s.turn, step: s.step, chars: text.length, sha8: sha8(text), preview: text.slice(0, opts.maxSample) }
  })

  // 注入后行为观察：首个含 marker 的 system/message 之后的 assistant 步骤
  const firstMarkedSeq = injectedSections.length ? injectedSections[0].seq : null
  const postInjection = {
    firstMarkedSystemSeq: firstMarkedSeq,
    assistantStepsAfter: [],
    textReplies: 0,
    effectReplies: 0
  }
  if (firstMarkedSeq !== null) {
    for (const am of assistantMessages) {
      if (am.seq <= firstMarkedSeq) continue
      postInjection.assistantStepsAfter.push({ turn: am.turn, step: am.step, textChars: am.textChars, hasEffectMarker: am.hasEffectMarker })
      if (am.textChars > 0) postInjection.textReplies++
      if (am.hasEffectMarker) postInjection.effectReplies++
    }
  }

  // step 间隔（ms）
  const steps = stepStarts.map((e) => ({ seq: e.seq, turn: e.data && e.data.turn, step: e.data && e.data.step, time: e.time }))
  const deltas = []
  for (let i = 1; i < steps.length; i++) if (steps[i].time && steps[i - 1].time) deltas.push({ sameTurn: steps[i].turn === steps[i - 1].turn, ms: steps[i].time - steps[i - 1].time })

  // 全文 marker 扫描（按事件类型分布）
  const personaHitsByType = {}, effectHitsByType = {}
  for (const e of events) {
    const t = eventText(e)
    if (t.includes(opts.personaMarker)) personaHitsByType[e.type] = (personaHitsByType[e.type] || 0) + 1
    if (t.includes(opts.effectMarker)) effectHitsByType[e.type] = (effectHitsByType[e.type] || 0) + 1
  }
  const userHistoryMarkerCount = userMessages.filter((e) => eventText(e).includes(opts.personaMarker)).length
  const insertedHistoryMarkerCount = spliced.filter((e) => eventText(e).includes(opts.personaMarker)).length

  return {
    header,
    typeCounts: sortedTypes,
    steps: steps.length,
    turns: events.filter((e) => e.type === 'turn/start').length,
    assistantMessages: assistantMessages.length,
    systemMessages,
    userMessages: { total: userMessages.length, byKind, realUserMessages: realUserMessages.length, distinctRpcIds: userRpcIds.length, ids: userMessageIds.length },
    spliced: { events: spliced.length, insertedEntries: Object.values(insertedKinds).reduce((a, b) => a + b, 0), insertedKinds, distinctInsertedUserIds: insertedUserIds.size, crossCheckMatched: userMessageIds.filter((id) => insertedUserIds.has(id)).length },
    stepIntervalsMs: { sameTurn: summarize(deltas.filter((d) => d.sameTurn).map((d) => d.ms)), crossTurn: summarize(deltas.filter((d) => !d.sameTurn).map((d) => d.ms)), all: summarize(deltas.map((d) => d.ms)) },
    promptCoverage: { assistantWithPriorSystemPrompt: covered, without: uncovered, withPersonaMarker: marked, withoutPersonaMarker: unmarked },
    injectedSections,
    postInjection,
    markerScan: { personaHitsByType, effectHitsByType, userHistoryMarkerCount, insertedHistoryMarkerCount },
    assistantEffect: { withEffectMarker: assistantMessages.filter((a) => a.hasEffectMarker).length, samples: assistantMessages.filter((a) => a.hasEffectMarker).slice(0, 3).map((a) => ({ turn: a.turn, step: a.step, sample: a.sample })) },
    assistantSamples: assistantMessages.slice(0, 3).map((a) => ({ turn: a.turn, step: a.step, textChars: a.textChars, sample: a.sample })),
    personaMarker: opts.personaMarker,
    effectMarker: opts.effectMarker
  }
}

function judge(a) {
  const hasMarkerAnywhere = Object.keys(a.markerScan.personaHitsByType).length > 0
  const promptMarked = a.promptCoverage.withPersonaMarker
  const promptUnmarked = a.promptCoverage.withoutPersonaMarker
  const effects = a.assistantEffect.withEffectMarker
  const stepCount = a.steps

  const j1 = {
    id: 'J1 每步 system prompt 注入人设文本',
    evidence: {
      steps: stepCount, assistantMessages: a.assistantMessages, systemMessages: a.systemMessages.length,
      systemPromptWithMarker: promptMarked, systemPromptWithoutMarker: promptUnmarked,
      assistantWithEffectMarker: effects,
      systemPromptShas: a.systemMessages.map((s) => ({ seq: s.seq, turn: s.turn, step: s.step, chars: s.chars, sha8: s.sha8, hasPersonaMarker: s.hasPersonaMarker })),
      injectedSections: a.injectedSections,
      postInjection: a.postInjection,
      stepIntervalsMs: a.stepIntervalsMs.all
    }
  }
  if (promptMarked > 0) j1.verdict = '成立（直接证据）：system/message 含有 ' + a.injectedSections.map((s) => s.chars + ' 字符注入段落').join('、') + '（sha8=' + a.injectedSections.map((s) => s.sha8).join(',') + '），其后 ' + promptMarked + ' 个 assistant 步骤以该 prompt 为生效系统提示词'
    + (a.postInjection.textReplies > 0 && a.postInjection.effectReplies === 0
      ? '；但注入后 ' + a.postInjection.textReplies + ' 条含文本的助手回复均未出现效果标记 ' + JSON.stringify(a.effectMarker) + '（行为层未观察到，需复核模型是否遵从）'
      : a.postInjection.effectReplies > 0 ? '；注入后 ' + a.postInjection.effectReplies + ' 条助手回复带效果标记' : '')
  else if (a.systemMessages.length >= 2) j1.verdict = '不成立：system/message 有 ' + a.systemMessages.length + ' 条但均不含人设 marker ⇒ 注入未进入 system prompt'
  else j1.verdict = '未观察到注入：全日志仅 ' + a.systemMessages.length + ' 条 system/message 且不含 marker。若原型已挂载，说明注入尚未落在本会话（或本会话早于挂载）；以「后续新 assistant 步骤是否出现效果标记 / 新增 system/message 是否带 marker」为复测判据'

  const j2 = {
    id: 'J2 会话历史无 user 角色注入快照',
    evidence: { userMessagesTotal: a.userMessages.total, bySourceKind: a.userMessages.byKind, realUserMessages: a.userMessages.realUserMessages, distinctRpcIds: a.userMessages.distinctRpcIds, insertedUserIds: a.spliced.distinctInsertedUserIds, userMessageIds: a.userMessages.ids, crossCheckMatched: a.spliced.crossCheckMatched },
    verdict: a.userMessages.byKind['user'] !== undefined
      ? '成立（按判定口径）：真实用户消息=' + a.userMessages.realUserMessages + ' 条（source.kind==user，distinct rpcId=' + a.userMessages.distinctRpcIds + '），其余 ' + (a.userMessages.total - a.userMessages.realUserMessages) + ' 条为宿主合成上下文（' + Object.entries(a.userMessages.byKind).filter(([k]) => k !== 'user').map(([k, v]) => k + ':' + v).join('、') + '），不计为用户发送；未见人设注入快照混入 user 角色'
      : '无法判定：日志中没有 source.kind==user 的 user/message'
  }

  const markerTypes = Object.keys(a.markerScan.personaHitsByType)
  const j3 = {
    id: 'J3 注入正文未落进会话历史',
    evidence: { personaMarkerOccurrencesByType: a.markerScan.personaHitsByType, effectMarkerOccurrencesByType: a.markerScan.effectHitsByType, userMessageMarkerHits: a.markerScan.userHistoryMarkerCount, insertedMarkerHits: a.markerScan.insertedHistoryMarkerCount },
    verdict: !hasMarkerAnywhere
      ? '不适用/不可判定：日志中从未出现人设 marker（原型未注入），无法证明「未落进历史」；一旦注入发生，本项以 user/message 与 agent/inbox/spliced 的 marker 命中数=0 判定'
      : (a.markerScan.userHistoryMarkerCount === 0 && a.markerScan.insertedHistoryMarkerCount === 0)
        ? '成立：人设 marker 仅出现在 ' + markerTypes.join('、') + '，user/message 与 inbox spliced 中命中 0 次'
        : '不成立：人设正文出现在 ' + JSON.stringify({ userMessage: a.markerScan.userHistoryMarkerCount, inserted: a.markerScan.insertedHistoryMarkerCount }) + ' ⇒ 注入文本污染了会话历史'
  }
  return [j1, j2, j3]
}

function printHuman(r) {
  const L = (s) => console.log(s)
  L('== inspect-session v' + r.meta.version + ' | ' + r.meta.generatedAt + ' ==')
  L('session: ' + r.meta.sessionId)
  L('file   : ' + r.meta.file)
  L('字节 / 帧 / 解压后字符: ' + r.meta.bytes + ' / ' + r.meta.frames + ' / ' + r.meta.decodedChars + '；JSONL 行=' + r.meta.lines + '，解析失败=' + r.meta.parseErrors)
  if (r.header) L('header : id=' + r.header.id + ' cwd=' + r.header.cwd + ' preset=' + r.header.agentPreset + ' version=' + r.header.version + ' createdAt=' + new Date(r.header.createdAt).toISOString())
  L('')
  L('-- 事件类型（top 20） --')
  L(r.typeCounts.slice(0, 20).map(([t, n]) => t + ':' + n).join('  '))
  L('')
  L('-- 结构 --')
  L('steps=' + r.steps + ' turns=' + r.turns + ' assistant=' + r.assistantMessages + ' system/message=' + r.systemMessages.length)
  L('user/message: total=' + r.userMessages.total + ' realUser=' + r.userMessages.realUserMessages + ' byKind=' + JSON.stringify(r.userMessages.byKind))
  L('inbox spliced: entries=' + r.spliced.insertedEntries + ' distinctUserIds=' + r.spliced.distinctInsertedUserIds + ' 与 user/message id 重合=' + r.spliced.crossCheckMatched)
  L('step 间隔(ms): all=' + JSON.stringify(r.stepIntervalsMs.all))
  L('')
  L('-- system/message --')
  for (const s of r.systemMessages) L('seq=' + s.seq + ' turn=' + s.turn + ' step=' + s.step + ' chars=' + s.chars + ' sha8=' + s.sha8 + ' hasPersonaMarker=' + s.hasPersonaMarker)
  L('prompt 覆盖: assistant 有前置 system/message=' + r.promptCoverage.assistantWithPriorSystemPrompt + '，其中含 marker=' + r.promptCoverage.withPersonaMarker + '，不含=' + r.promptCoverage.withoutPersonaMarker)
  for (const s of r.injectedSections) L('注入段落: seq=' + s.seq + ' turn=' + s.turn + ' step=' + s.step + ' chars=' + s.chars + ' sha8=' + s.sha8 + ' preview=' + JSON.stringify(s.preview))
  L('注入后行为: assistantSteps=' + r.postInjection.assistantStepsAfter.length + '，含文本回复=' + r.postInjection.textReplies + '，带效果标记=' + r.postInjection.effectReplies)
  L('assistant 含效果标记=' + r.assistantEffect.withEffectMarker)
  L('')
  L('-- marker 扫描 --')
  L('persona marker: ' + JSON.stringify(r.markerScan.personaHitsByType) + '；effect marker: ' + JSON.stringify(r.markerScan.effectHitsByType))
  L('user/message 内 persona 命中=' + r.markerScan.userHistoryMarkerCount + '，inbox spliced 内=' + r.markerScan.insertedHistoryMarkerCount)
  L('')
  L('-- 判定 --')
  for (const j of r.judgments) L(j.id + '：' + j.verdict)
  L('')
  L('复现：node inspect-session.mjs ' + r.meta.sessionId + ' --json')
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) return console.log('用法：node inspect-session.mjs <sessionId> [--home DIR] [--json] [--out FILE] [--list] [--latest] [--persona-marker TEXT] [--effect-marker TEXT]\n       node inspect-session.mjs --list  列出会话文件（按 mtime 倒序）')
  const files = listSessionFiles(opts.home)
  if (opts.list) {
    const rows = files.slice(0, 60).map((f) => ({ mtime: new Date(f.mtimeMs).toISOString(), bytes: f.size, cwdDir: f.cwdDir, dirName: f.dirName, file: f.file }))
    if (opts.json) return console.log(JSON.stringify({ sessionsRoot: path.join(opts.home, 'sessions'), count: files.length, rows }, null, 2))
    console.log('sessions 根：' + path.join(opts.home, 'sessions') + '（' + files.length + ' 个会话文件，按 mtime 倒序，前 60）')
    for (const r of rows) console.log(r.mtime + '  ' + String(r.bytes).padStart(9) + '  ' + r.cwdDir + '/' + r.dirName)
    return
  }
  let target = opts.sessionId
  if (!target && opts.latest) {
    if (!files.length) throw new Error('sessions 下没有会话文件')
    target = files[0].dirName
    console.warn('未指定 sessionId，--latest 选取：' + target + '（' + files[0].file + '）')
  }
  if (!target) throw new Error('需要 sessionId（或 --list / --latest）')
  const norm = String(target).replace(/^session-/, '')
  const candidates = files.filter((f) => f.dirName === target || f.dirName.includes(norm) || f.dirName === 'session-' + norm)
  if (!candidates.length) throw new Error('未在 ' + path.join(opts.home, 'sessions') + ' 下找到 ' + target + '（可先 --list 查看）')
  const chosen = candidates[0]
  const decoded = decodeSessionFile(chosen.file)
  const { events, errors } = parseEvents(decoded.text)
  const analysis = analyze(events, opts)
  analysis.systemMessages = analysis.systemMessages.map(({ rawText, ...rest }) => rest)
  const judgments = judge(analysis)
  const meta = {
    tool: 'inspect-session.mjs', version: VERSION, generatedAt: new Date().toISOString(),
    home: opts.home, sessionId: target, file: chosen.file, cwdDir: chosen.cwdDir, dirName: chosen.dirName,
    bytes: chosen.size, frames: decoded.frames, decodeErrors: decoded.decodeErrors,
    decodedChars: decoded.text.length, lines: decoded.text.split('\n').filter((l) => l.trim() !== '').length, parseErrors: errors.length, parseErrorSamples: errors.slice(0, 3),
    personaMarker: opts.personaMarker, effectMarker: opts.effectMarker, candidates: candidates.length
  }
  const result = { meta, header: analysis.header, ...analysis, judgments }
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(result, null, 2))
  if (opts.json) console.log(JSON.stringify(result, null, 2))
  else printHuman(result)
}
main().catch((err) => { console.error('inspect-session 失败：' + (err && err.stack ? err.stack : String(err))); process.exitCode = 1 })
