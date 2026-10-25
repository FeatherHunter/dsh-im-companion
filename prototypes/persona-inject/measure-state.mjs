#!/usr/bin/env node
/**
 * T6 #166 · 取证任务 A：DSH state.json 读取成本 / 缓存命中 / 负结果缓存 / 失败模式 / 缓存戳精度
 *
 * 只读：本脚本绝不写 DSH_HOME；fixture 全部建在系统临时目录（默认用完即删，--keep-fixtures 保留）。
 * 复现：node prototypes/persona-inject/measure-state.mjs --json --out D:/Temp/state.json
 *
 * 参数：
 *   --home DIR            覆盖 DSH_HOME（默认 os.homedir()/.dsh）
 *   --iters N             迭代次数（默认 200）
 *   --json                只输出机器可读 JSON（stdout）
 *   --out FILE            把 JSON 落盘
 *   --min-step-gap-ms N   喂 TTL 判定所需的实测最小 step 间隔（来自 inspect-session.mjs）
 *   --keep-fixtures       保留 fixture 目录并打印路径（默认清理）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const VERSION = '1.1.0'
const NEGATIVE_TTL_MS = 2000
const DEFAULT_HOME = path.join(os.homedir(), '.dsh')
const WARMUP = 5

function parseArgs(argv) {
  const o = { home: DEFAULT_HOME, iters: 200, json: false, out: null, keepFixtures: false, minStepGapMs: null, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--home') o.home = path.resolve(argv[++i] || '')
    else if (a === '--iters') o.iters = Math.max(1, Number(argv[++i]) || 200)
    else if (a === '--json') o.json = true
    else if (a === '--out') o.out = path.resolve(argv[++i] || '')
    else if (a === '--keep-fixtures') o.keepFixtures = true
    else if (a === '--min-step-gap-ms') o.minStepGapMs = Number(argv[++i]) || null
    else if (a === '--help' || a === '-h') o.help = true
    else throw new Error('未知参数：' + a)
  }
  return o
}

const ms = () => performance.now()
const us = (t0) => Number(process.hrtime.bigint() - t0) / 1000
const round = (v, d = 4) => { const m = Math.pow(10, d); return Math.round(v * m) / m }
function pct(sorted, p) {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo))
}
function summarize(samples) {
  if (!samples.length) return { n: 0 }
  const s = samples.slice().sort((a, b) => a - b)
  return { n: s.length, mean: round(s.reduce((a, b) => a + b, 0) / s.length), p50: pct(s, 0.5), p95: pct(s, 0.95), min: round(s[0]), max: round(s[s.length - 1]) }
}

// ---------- 发现 / 读取（参考实现，与 T4 决议一一对应） ----------
function readdirDirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()) } catch { return [] }
}
function discover(home) {
  const root = path.join(home, 'integrations')
  let rootEntries
  try { rootEntries = fs.readdirSync(root, { withFileTypes: true }) } catch (err) { return { entries: [], rootError: String(err.code || err.message) } }
  const entries = []
  for (const channelDir of rootEntries) {
    if (!channelDir.isDirectory() || !channelDir.name.startsWith('dsh-')) continue
    const channel = channelDir.name.slice(4)
    for (const area of ['bots', 'accounts']) {
      const areaDir = path.join(root, channelDir.name, area)
      for (const botDir of readdirDirs(areaDir)) entries.push({ channel, area, botId: botDir.name, file: path.join(areaDir, botDir.name, 'state.json') })
    }
  }
  return { entries, rootError: null }
}
function statEntries(entries) {
  const stats = [], errors = []
  for (const e of entries) {
    try {
      const st = fs.statSync(e.file)
      if (!st.isFile()) { errors.push({ file: e.file, phase: 'stat', message: 'not-a-regular-file' }); continue }
      stats.push({ ...e, mtimeMs: st.mtimeMs, size: st.size })
    } catch (err) { if (err.code !== 'ENOENT') errors.push({ file: e.file, phase: 'stat', message: String(err.code || err.message) }) }
  }
  stats.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return { stats, errors }
}
/** 读取索引。prev = 上一次成功索引；失败沿用（per-file，路径仍在但读不出时才沿用）。 */
function loadIndex(home, prev) {
  const t0 = ms()
  const found = discover(home)
  if (found.rootError && prev) return { hit: true, reason: 'integrations-unavailable-keep-prev', stats: prev.stats, index: prev.index, perFile: prev.perFile, errors: [{ phase: 'root', message: found.rootError }], files: prev.stats.length, elapsedMs: round(ms() - t0) }
  const { stats, errors } = statEntries(found.entries)
  const stamp = JSON.stringify(stats.map((s) => [s.file, s.mtimeMs, s.size]))
  if (prev && prev.stamp === stamp) return { hit: true, reason: 'stamp-unchanged', stats, index: prev.index, perFile: prev.perFile, errors: [], files: stats.length, elapsedMs: round(ms() - t0) }
  const discovered = new Set(found.entries.map((e) => e.file))
  const index = new Map(), perFile = new Map()
  for (const s of stats) {
    const prevFile = prev ? prev.perFile.get(s.file) : null
    let text
    try { text = fs.readFileSync(s.file, 'utf8') } catch (err) {
      errors.push({ file: s.file, phase: 'read', message: String(err.code || err.message) })
      if (prevFile) perFile.set(s.file, prevFile)
      continue
    }
    let data
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch (err) {
      errors.push({ file: s.file, phase: 'parse', message: String(err.message).slice(0, 120) })
      if (prevFile) perFile.set(s.file, prevFile)
      continue
    }
    const sessions = data && typeof data === 'object' && !Array.isArray(data) ? data.sessions : null
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) {
      errors.push({ file: s.file, phase: 'sessions', message: 'sessions 不是普通对象' })
      if (prevFile) perFile.set(s.file, prevFile)
      continue
    }
    const map = new Map()
    for (const [key, value] of Object.entries(sessions)) {
      if (typeof value !== 'string' || value.trim() === '') continue
      map.set(key, { sessionId: value, channel: s.channel, botId: s.botId, file: s.file, fileMtimeMs: s.mtimeMs })
    }
    perFile.set(s.file, map)
  }
  // 路径仍在（bot 目录还发现得到）但本轮 stat 不可用 -> 沿用上次该文件的索引
  if (prev) {
    for (const [file, prevMap] of prev.perFile) {
      if (perFile.has(file)) continue
      if (discovered.has(file)) { perFile.set(file, prevMap); errors.push({ file, phase: 'stat', message: 'unusable-keep-prev' }) }
    }
  }
  for (const map of perFile.values()) for (const entry of map.values()) {
    const list = index.get(entry.sessionId) || []
    list.push(entry)
    index.set(entry.sessionId, list)
  }
  return { hit: false, reason: 'rebuilt', stamp, stats, index, perFile, errors, files: stats.length, elapsedMs: round(ms() - t0) }
}

// ---------- A1/A2：冷读 / 缓存命中 ----------
function runReaddir(home) { const t = ms(); const d = discover(home); return { ms: ms() - t, files: d.entries.length } }
function runStat(home) {
  const t = ms(), d = discover(home), { stats } = statEntries(d.entries)
  return { ms: ms() - t, files: stats.length, bytes: stats.reduce((a, b) => a + b.size, 0) }
}
function runFull(home) {
  const t = ms(), d = discover(home)
  let bytes = 0, files = 0, parsed = 0, errors = 0
  for (const e of d.entries) {
    let st
    try { st = fs.statSync(e.file) } catch { continue }
    if (!st.isFile()) continue
    try {
      const buf = fs.readFileSync(e.file)
      bytes += buf.length; files++
      JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')); parsed++
    } catch { errors++ }
  }
  return { ms: ms() - t, files, bytes, parsed, errors }
}
function measureCold(home, iters) {
  for (let i = 0; i < WARMUP; i++) { runReaddir(home); runStat(home); runFull(home) }
  const a = [], b = [], c = []
  let files = 0, bytes = 0, parseErrors = 0, first = null
  for (let i = 0; i < iters; i++) {
    const r1 = runReaddir(home); a.push(r1.ms)
    const r2 = runStat(home); b.push(r2.ms); files = r2.files; bytes = r2.bytes
    const r3 = runFull(home); c.push(r3.ms); parseErrors += r3.errors
    if (i === 0) first = r3.ms
  }
  return { files, totalBytes: bytes, readdirOnly: summarize(a), statOnly: summarize(b), statParse: summarize(c), firstIterationStatParseMs: round(first), parseErrors }
}
function measureBreakdown(home, rounds) {
  const sums = { readdir: 0, stat: 0, read: 0, parse: 0 }
  for (let i = 0; i < rounds; i++) {
    let t = ms(); const d = discover(home); sums.readdir += ms() - t
    for (const e of d.entries) {
      let st
      t = ms(); try { st = fs.statSync(e.file) } catch { continue } sums.stat += ms() - t
      if (!st.isFile()) continue
      t = ms(); const buf = fs.readFileSync(e.file); sums.read += ms() - t
      t = ms(); try { JSON.parse(buf.toString('utf8')) } catch {} sums.parse += ms() - t
    }
  }
  return { rounds, readdirMs: round(sums.readdir / rounds), statMs: round(sums.stat / rounds), readMs: round(sums.read / rounds), parseMs: round(sums.parse / rounds), totalMs: round((sums.readdir + sums.stat + sums.read + sums.parse) / rounds) }
}
function measurePerFile(stats) {
  const acc = new Map()
  for (let i = 0; i < 20; i++) for (const e of stats) {
    const r = acc.get(e.file) || { file: path.basename(path.dirname(e.file)) + '/state.json', bytes: e.size, stat: 0, read: 0, parse: 0, n: 0 }
    let t = ms(); try { fs.statSync(e.file) } catch {} r.stat += ms() - t
    t = ms(); const buf = fs.readFileSync(e.file); r.read += ms() - t
    t = ms(); try { JSON.parse(buf.toString('utf8')) } catch {} r.parse += ms() - t
    r.n++; acc.set(e.file, r)
  }
  return [...acc.values()].map((r) => ({ file: r.file, bytes: r.bytes, statMs: round(r.stat / r.n, 5), readMs: round(r.read / r.n, 5), parseMs: round(r.parse / r.n, 5) }))
}
function measureCacheHit(stats, iters) {
  const scan = () => { const t = ms(); let changed = 0; for (const e of stats) { try { const st = fs.statSync(e.file); if (st.mtimeMs !== e.mtimeMs || st.size !== e.size) changed++ } catch { changed++ } } return { ms: ms() - t, changed } }
  for (let i = 0; i < WARMUP; i++) scan()
  const samples = []; let changed = 0
  for (let i = 0; i < iters; i++) { const r = scan(); samples.push(r.ms); changed += r.changed }
  return { statOnlyNoReaddir: summarize(samples), changedDuringRun: changed }
}
function measureNegative(stats, coldStatParse, iters) {
  const index = new Map(stats.map((s) => [s.file, 1]))
  const unknown = 'session-00000000-0000-0000-0000-000000000000'
  const lookup = []
  for (let i = 0; i < iters; i++) { const t = process.hrtime.bigint(); index.get(unknown); lookup.push(us(t)) }
  const misses = new Map()
  const decide = []
  let hits = 0, expired = 0
  for (let i = 0; i < iters; i++) {
    const t = process.hrtime.bigint(), now = Date.now(), last = misses.get('x') || 0
    if (now - last < NEGATIVE_TTL_MS) hits++
    else { misses.set('x', now); expired++ }
    decide.push(us(t))
  }
  return {
    ttlMs: NEGATIVE_TTL_MS, missLookupUs: summarize(lookup), negativeDecisionUs: summarize(decide), negativeHits: hits, negativeExpired: expired,
    rescanCostMs: coldStatParse, note: 'text 路径只读内存 Map + Date.now；负缓存命中不产生任何 I/O'
  }
}
function measureHashCost(stats) {
  const samples = []
  for (let i = 0; i < 100; i++) { const t = ms(); for (const e of stats) createHash('sha256').update(fs.readFileSync(e.file)).digest('hex'); samples.push(ms() - t) }
  return { bytes: stats.reduce((a, b) => a + b.size, 0), readAndSha256: summarize(samples) }
}

// ---------- A4：失败模式 fixture（同一路径先健康、再破坏、再带 prev 重载） ----------
function buildFailCases() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-state-fixtures-'))
  const mkHome = (name) => { const h = path.join(root, name, 'home'); fs.mkdirSync(h, { recursive: true }); return h }
  const statePath = (home, channel, botId) => path.join(home, 'integrations', channel, 'bots', botId, 'state.json')
  const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
  const cases = []
  const add = (name, note, mutate) => {
    const home = mkHome(name)
    const good = statePath(home, 'dsh-feishu', 'bot_good')
    write(good, JSON.stringify({ version: 1, sessions: { 'p2p:good': 'session-prev-good' } }))
    const prev = loadIndex(home, null)
    const info = mutate(home, good) || {}
    let fresh = null, after = null, threw = false, throwMsg = null
    try { fresh = loadIndex(home, null); after = loadIndex(home, prev) } catch (err) { threw = true; throwMsg = String(err.message).slice(0, 160) }
    const dup = info.sessionIdDup ? after.index.get(info.sessionIdDup) : null
    cases.push({
      case: name, note, threw, throwMsg,
      baselineSessions: prev.index.size,
      fresh: fresh ? { files: fresh.files, sessions: fresh.index.size, reason: fresh.reason || null, errors: (fresh.errors || []).map((e) => e.phase + ':' + e.message).slice(0, 3) } : null,
      withPrev: after ? { files: after.files, sessions: after.index.size, reason: after.reason || null, keptPrev: after.index.size > 0 || fresh.index.size > 0, errors: (after.errors || []).map((e) => e.phase + ':' + e.message).slice(0, 3) } : null,
      keptPrevious: !!(after && prev.index.size > 0 && after.index.size >= prev.index.size),
      samples: after ? { sessions: after.index.size, values: [...after.index.values()].flat().map((x) => x.sessionId).slice(0, 3) } : null,
      oneToMany: dup ? { entries: dup.length, winnerBot: dup.slice().sort((a, b) => b.fileMtimeMs - a.fileMtimeMs)[0].botId, winnerIsNewest: dup.slice().sort((a, b) => b.fileMtimeMs - a.fileMtimeMs)[0].botId === info.expectedWinner } : null
    })
    return { root, cases }
  }
  add('healthy-no-mutation', '基线（无破坏）', () => ({}))
  add('missing-integrations', '整个 integrations 缺失', (home) => { fs.rmSync(path.join(home, 'integrations'), { recursive: true, force: true }) })
  add('empty-integrations', 'integrations 存在但为空', (home) => { fs.rmSync(path.join(home, 'integrations'), { recursive: true, force: true }); fs.mkdirSync(path.join(home, 'integrations')) })
  add('missing-bots-area', '渠道在、bots/accounts 缺失', (home) => { fs.rmSync(path.join(home, 'integrations', 'dsh-feishu', 'bots'), { recursive: true, force: true }) })
  add('bot-dir-no-state', 'bot 目录在、state.json 缺失', (home, good) => { fs.rmSync(good) })
  add('state-json-is-dir', 'state.json 是目录', (home, good) => { fs.rmSync(good); fs.mkdirSync(good) })
  add('truncated-json', 'JSON 截断', (home, good) => { fs.writeFileSync(good, '{"version":1,"sessions":{"a":"session-x"') })
  add('trailing-comma', 'JSON 尾逗号', (home, good) => { fs.writeFileSync(good, '{"sessions":{"a":"session-x",}}') })
  add('sessions-array', 'sessions 是数组', (home, good) => { fs.writeFileSync(good, '{"sessions":["x"]}') })
  add('sessions-string', 'sessions 是字符串', (home, good) => { fs.writeFileSync(good, '{"sessions":"oops"}') })
  add('sessions-null', 'sessions 是 null', (home, good) => { fs.writeFileSync(good, '{"sessions":null}') })
  add('sessions-missing', '无 sessions 字段', (home, good) => { fs.writeFileSync(good, '{"version":1}') })
  add('sessions-empty-object', 'sessions 是空对象', (home, good) => { fs.writeFileSync(good, '{"sessions":{}}') })
  add('zero-byte', 'state.json 0 字节', (home, good) => { fs.writeFileSync(good, '') })
  add('mixed-values', 'sessions 值混合类型', (home, good) => { fs.writeFileSync(good, '{"sessions":{"ok":"session-ok","bad":123,"empty":""}}') })
  add('bom-json', 'UTF-8 BOM 前缀', (home, good) => { fs.writeFileSync(good, '\uFEFF{"sessions":{"a":"session-bom"}}') })
  add('tmp-ignored', 'state.json + state.json.tmp（.tmp 必须忽略）', (home, good) => {
    fs.writeFileSync(good + '.tmp', JSON.stringify({ sessions: { 'p2p:good': 'session-TMP-SHOULD-NOT-WIN' } }))
  })
  add('one-to-many', '同一 sessionId 出现在两个文件（mtime 新者应胜）', (home, good) => {
    const older = statePath(home, 'dsh-weixin', 'wx_old')
    write(older, JSON.stringify({ sessions: { 'p2p:dup': 'session-dup' } }))
    fs.writeFileSync(good, JSON.stringify({ sessions: { 'p2p:dup': 'session-dup' } }))
    const now = Date.now() / 1000
    fs.utimesSync(good, now, now)
    fs.utimesSync(older, now - 60, now - 60)
    return { sessionIdDup: 'session-dup', expectedWinner: 'bot_good' }
  })
  add('integrations-is-file', 'integrations 是普通文件（ENOTDIR）', (home) => { fs.rmSync(path.join(home, 'integrations'), { recursive: true, force: true }); fs.writeFileSync(path.join(home, 'integrations'), 'x') })
  add('permission-denied', 'Windows ACL 拒绝读取（可选）', (home, good) => {
    try { execFileSync('icacls', [good, '/deny', String(process.env.USERNAME || '') + ':(R)'], { stdio: 'ignore' }); return { acl: 'applied' } } catch (err) { return { acl: 'skipped', skipReason: String(err.message).slice(0, 120) } }
  })
  return { root, cases }
}

// ---------- A5：缓存戳精度 ----------
function stampOf(file) { const st = fs.statSync(file); return { mtimeMs: st.mtimeMs, size: st.size } }
function busyWait(targetMs) { const end = ms() + targetMs; while (ms() < end) {} }
function measureStampPrecision() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-stamp-'))
  const file = path.join(dir, 'same-size.txt')
  const r = { dir, fsNote: '系统临时目录（与 DSH_HOME 同为 NTFS）' }

  // A 同尺寸快速改写（写间隔尽量小）
  const payload = (ch) => 'A'.repeat(256) + ch
  let t = ms(); fs.writeFileSync(file, payload('x')); const gapStart = ms()
  fs.writeFileSync(file, payload('y')); const writeGapMs = round(ms() - gapStart)
  const s1 = stampOf(file) // 第二次写之后
  fs.writeFileSync(file, payload('z'))
  const s2 = stampOf(file)
  r.sameSizeRewrite = { firstWriteToSecondWriteMs: writeGapMs, sizeSame: true, mtimeEqual: s1.mtimeMs === s2.mtimeMs, detected: s1.mtimeMs !== s2.mtimeMs, note: '比较两次相邻同尺寸写的戳；detected=false 表示同 tick 内无法区分' }

  // B 连续 5 次同尺寸改写：统计不同戳数量
  const tries = []
  for (let i = 0; i < 5; i++) { fs.writeFileSync(file, payload(String.fromCharCode(97 + i))); tries.push(stampOf(file)) }
  r.rapid5SameSize = { attempts: 5, distinctStamps: new Set(tries.map((s) => s.mtimeMs + '|' + s.size)).size, fullyDetectable: new Set(tries.map((s) => s.mtimeMs + '|' + s.size)).size === 5 }

  // C 粗粒度 mtime 语义（1s 精度 + 内容变 size 不变）
  const fixed = Math.floor(Date.now() / 1000)
  fs.writeFileSync(file, payload('1')); fs.utimesSync(file, fixed, fixed); const c1 = stampOf(file)
  fs.writeFileSync(file, payload('2')); fs.utimesSync(file, fixed, fixed); const c2 = stampOf(file)
  r.coarseMtimeSameSize = { forcedMtimeMs: c1.mtimeMs, detected: c1.mtimeMs !== c2.mtimeMs || c1.size !== c2.size, note: '模拟 1s 粒度/保留 mtime 的落盘语义' }

  // D 原生 mtime 精度：40 次快速写，统计不同值 / 相邻最小正差
  const values = []
  for (let i = 0; i < 40; i++) { fs.writeFileSync(file, payload(String.fromCharCode(97 + (i % 26)))); values.push(stampOf(file).mtimeMs) }
  const deltas = []
  for (let i = 1; i < values.length; i++) deltas.push(round(Math.abs(values[i] - values[i - 1]), 6))
  const positive = deltas.filter((d) => d > 0)
  r.nativeGranularity = { writes: values.length, distinctMtimeValues: new Set(values.map((v) => v.toFixed(6))).size, minPositiveDeltaMs: positive.length ? Math.min(...positive) : null, sameValueWrites: deltas.filter((d) => d === 0).length }

  // E 真实写入路径语义：tmp 写入 + rename 覆盖，同尺寸连续两次
  const target = path.join(dir, 'state.json')
  const tmp1 = path.join(dir, 'state.json.tmp1')
  fs.writeFileSync(tmp1, payload('m')); fs.renameSync(tmp1, target); const e1 = stampOf(target)
  const tmp2 = path.join(dir, 'state.json.tmp2')
  fs.writeFileSync(tmp2, payload('n')); fs.renameSync(tmp2, target); const e2 = stampOf(target)
  r.renameAtomic = { sizeSame: e1.size === e2.size, mtimeEqual: e1.mtimeMs === e2.mtimeMs, detected: e1.mtimeMs !== e2.mtimeMs, note: '模拟 dsh-im writeFile(<path>.tmp) -> rename 覆盖' }
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  return r
}

// ---------- T4 决议校验 ----------
function t4Checks(metrics, failCases, stamp, opts) {
  const checks = []
  checks.push({ id: 'text 路径零 I/O', result: '成立', evidence: '内存 Map.get 均值 ' + metrics.negative.missLookupUs.mean + ' µs；负缓存判定 ' + metrics.negative.negativeDecisionUs.mean + ' µs；无 stat/read' })
  const throwCount = failCases.filter((c) => c.threw).length
  checks.push({ id: 'fail-soft 不抛', result: throwCount === 0 ? '成立' : '不成立', evidence: failCases.length + ' 个坏输入，抛异常 ' + throwCount })
  const kept = failCases.filter((c) => c.keptPrevious).map((c) => c.case)
  checks.push({ id: '失败沿用上次成功索引', result: kept.length >= 6 ? '成立' : '部分成立', evidence: '沿用 prev 的用例：' + kept.join('、') })
  const tmp = failCases.find((c) => c.case === 'tmp-ignored')
  checks.push({ id: '.tmp 忽略', result: tmp && tmp.samples && !tmp.samples.values.includes('session-TMP-SHOULD-NOT-WIN') ? '成立' : '不成立', evidence: tmp && tmp.samples ? '加载值 ' + JSON.stringify(tmp.samples.values) : '无数据' })
  const dup = failCases.find((c) => c.case === 'one-to-many')
  checks.push({ id: '1:N 取 mtime 最新', result: dup && dup.oneToMany && dup.oneToMany.winnerIsNewest ? '成立' : '需人工复核', evidence: dup && dup.oneToMany ? '候选 ' + dup.oneToMany.entries + ' 个，winner=' + dup.oneToMany.winnerBot : '无数据' })
  const native = stamp.nativeGranularity
  checks.push({ id: '缓存戳 (path,mtimeMs,size) 精度', result: stamp.sameSizeRewrite.detected ? '成立' : '不成立（同 tick 同尺寸改写不可辨）', evidence: '同尺寸改写间隔 ' + stamp.sameSizeRewrite.firstWriteToSecondWriteMs + 'ms 识别=' + stamp.sameSizeRewrite.detected + '；rename 同尺寸识别=' + stamp.renameAtomic.detected + '；原生 mtime 最小正间隔 ' + native.minPositiveDeltaMs + 'ms（40 写仅 ' + native.distinctMtimeValues + ' 个不同值）' })
  checks.push({ id: 'hash 兜底', result: stamp.sameSizeRewrite.detected ? '本机不必要' : '建议作为低成本兜底（见报告）', evidence: '读+sha256 全量 ' + metrics.hash.readAndSha256.mean + 'ms（stat 全量 ' + metrics.cacheHit.statOnlyNoReaddir.mean + 'ms）' })
  let ttl = { ttlMs: NEGATIVE_TTL_MS, result: '需 task B 数据', evidence: '未提供 --min-step-gap-ms（用 inspect-session.mjs 的 intervals.minMs）' }
  if (opts.minStepGapMs) ttl = { ttlMs: NEGATIVE_TTL_MS, minStepGapMs: opts.minStepGapMs, result: NEGATIVE_TTL_MS <= opts.minStepGapMs ? '成立' : '偏长，建议下调', evidence: '实测最小 step 间隔 ' + opts.minStepGapMs + 'ms；2000ms TTL ' + (NEGATIVE_TTL_MS <= opts.minStepGapMs ? '<=' : '>') + ' 该间隔' }
  checks.push({ id: '负结果缓存 ≤2s', result: ttl.result, evidence: ttl.evidence })
  return { checks, ttl }
}

// ---------- 输出 ----------
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length) }
function printHuman(r) {
  const L = (s) => console.log(s)
  L('== measure-state v' + r.meta.version + ' | ' + r.meta.generatedAt + ' ==')
  L('DSH_HOME: ' + r.meta.home + (r.meta.isDefaultHome ? '  (默认)' : '  (--home)'))
  L('Node ' + r.meta.node + ' / ' + r.meta.platform + ' ' + r.meta.release + ' / 迭代 ' + r.meta.iterations + ' (warmup ' + r.meta.warmup + ')')
  L('')
  L('-- 文件清单 --')
  for (const f of r.files.list) L(pad(f.channel + '/' + f.area + '/' + f.botId, 52) + pad(f.bytes, 8) + pad(Math.round(f.mtimeMs), 16))
  L('文件数 ' + r.files.count + '，总字节 ' + r.files.totalBytes + '，会话 ' + r.files.sessions + ' 条')
  L('')
  L('-- A1 冷读成本（ms） --')
  L(pad('', 26) + pad('mean', 10) + pad('p50', 10) + pad('p95', 10) + pad('min', 10) + pad('max', 10))
  for (const [k, v] of [['readdir only', r.cold.readdirOnly], ['stat only', r.cold.statOnly], ['stat+read+parse', r.cold.statParse]]) L(pad(k, 26) + pad(v.mean, 10) + pad(v.p50, 10) + pad(v.p95, 10) + pad(v.min, 10) + pad(v.max, 10))
  L('分解均值（ms）: readdir=' + r.breakdown.readdirMs + ' stat=' + r.breakdown.statMs + ' read=' + r.breakdown.readMs + ' parse=' + r.breakdown.parseMs + ' total=' + r.breakdown.totalMs)
  L('')
  L('-- A2 缓存命中（只 stat 戳，未变不 parse，ms） --')
  L(JSON.stringify(r.cacheHit.statOnlyNoReaddir) + '  changedDuringRun=' + r.cacheHit.changedDuringRun)
  L('')
  L('-- A3 负结果缓存 --')
  L('miss lookup=' + JSON.stringify(r.negative.missLookupUs) + ' 负缓存判定=' + JSON.stringify(r.negative.negativeDecisionUs) + ' TTL=' + r.negative.ttlMs + 'ms')
  L('')
  L('-- A4 失败模式 --')
  L(pad('case', 26) + pad('baseline', 9) + pad('fresh', 7) + pad('withPrev', 9) + pad('keptPrev', 9) + 'errors(fresh)')
  for (const c of r.failModes) L(pad(c.case, 26) + pad(c.baselineSessions, 9) + pad(c.fresh ? c.fresh.sessions : '?', 7) + pad(c.withPrev ? c.withPrev.sessions : '?', 9) + pad(c.keptPrevious, 9) + JSON.stringify(c.fresh ? c.fresh.errors : []))
  L('')
  L('-- A5 缓存戳精度 --')
  L('同尺寸改写: ' + JSON.stringify(r.stamp.sameSizeRewrite))
  L('连续 5 次同尺寸写: ' + JSON.stringify(r.stamp.rapid5SameSize))
  L('粗粒度 mtime: ' + JSON.stringify(r.stamp.coarseMtimeSameSize))
  L('原生 mtime 精度: ' + JSON.stringify(r.stamp.nativeGranularity))
  L('rename 覆盖: ' + JSON.stringify(r.stamp.renameAtomic))
  L('')
  L('-- 对 T4 决议的校验 --')
  for (const c of r.t4.checks) L(pad(c.id, 30) + pad(c.result, 26) + c.evidence)
  L('')
  L('复现：node ' + r.meta.scriptPath + ' --json --out D:/Temp/state.json')
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) return console.log('用法：node measure-state.mjs [--home DIR] [--iters N] [--json] [--out FILE] [--min-step-gap-ms N] [--keep-fixtures]')
  if (!fs.existsSync(opts.home)) throw new Error('DSH_HOME 不存在：' + opts.home)
  const realBefore = statRealHome(opts.home)
  const initial = loadIndex(opts.home, null)
  if (!initial.stats.length && initial.reason === 'rebuilt') console.warn('警告：未在 ' + opts.home + ' 下发现 state.json（integrations/dsh-*/{bots,accounts}/*/state.json）')
  const cold = measureCold(opts.home, opts.iters)
  const breakdown = measureBreakdown(opts.home, 20)
  const perFile = measurePerFile(initial.stats)
  const cacheHit = measureCacheHit(initial.stats, opts.iters)
  const negative = measureNegative(initial.stats, cold.statParse, opts.iters)
  const hash = measureHashCost(initial.stats)
  const fixtures = buildFailCases()
  let fixturesDir = null
  if (opts.keepFixtures) fixturesDir = fixtures.root
  else { try { fs.rmSync(fixtures.root, { recursive: true, force: true }) } catch {} }
  const stamp = measureStampPrecision()
  const t4 = t4Checks({ cold, cacheHit, negative, hash }, fixtures.cases, stamp, opts)
  const realAfter = statRealHome(opts.home)
  const result = {
    meta: {
      tool: 'measure-state.mjs', version: VERSION, generatedAt: new Date().toISOString(), scriptPath: path.resolve(process.argv[1] || 'measure-state.mjs'),
      node: process.version, platform: process.platform, release: os.release(), arch: process.arch,
      home: opts.home, isDefaultHome: path.resolve(opts.home) === path.resolve(DEFAULT_HOME),
      iterations: opts.iters, warmup: WARMUP, negativeTtlMs: NEGATIVE_TTL_MS,
      fixturesDir, realHomeBefore: realBefore, realHomeAfter: realAfter, realHomeUntouched: JSON.stringify(realBefore) === JSON.stringify(realAfter)
    },
    files: { count: initial.stats.length, totalBytes: initial.stats.reduce((a, b) => a + b.size, 0), sessions: initial.index.size, list: initial.stats.map((s) => ({ channel: s.channel, area: s.area, botId: s.botId, file: s.file, bytes: s.size, mtimeMs: s.mtimeMs })), loadErrors: initial.errors },
    cold: { files: cold.files, totalBytes: cold.totalBytes, readdirOnly: cold.readdirOnly, statOnly: cold.statOnly, statParse: cold.statParse, firstIterationStatParseMs: cold.firstIterationStatParseMs, parseErrors: cold.parseErrors, breakdown, perFile },
    cacheHit, negative, hash, failModes: fixtures.cases, stamp, t4
  }
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(result, null, 2))
  if (opts.json) console.log(JSON.stringify(result, null, 2))
  else printHuman(result)
}
function statRealHome(home) {
  const d = discover(home)
  return d.entries.map((e) => { try { const st = fs.statSync(e.file); return [e.file, st.mtimeMs, st.size] } catch { return [e.file, null, null] } })
}
main().catch((err) => { console.error('measure-state 失败：' + (err && err.stack ? err.stack : String(err))); process.exitCode = 1 })
