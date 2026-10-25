/**
 * T6 #166 原型：dsh-im 落盘归属索引（只读）。
 *
 * 唯一真源：<DSH_HOME>/integrations/dsh-<channel>/{bots,accounts}/<botId>/state.json 的 sessions 表
 * （key = 渠道会话键，value = DSH sessionId）。原型只读，不写 dsh-im 的落盘。
 *
 * 纪律（T4 #164 resolution）：
 * - text 路径零 I/O：lookup() 只读内存；数据由后台按固定间隔 refresh()；
 * - 缓存戳 = 排序后的 [path, mtimeMs, size] 列表，戳不变直接复用上一份索引；
 * - 负结果缓存 TTL 2000ms；
 * - 全程 fail-soft：ENOENT / 坏 JSON / sessions 非对象 ⇒ 记 errors、沿用上次成功索引（不抛）；
 * - 只认 state.json（.tmp 等遗留文件一律忽略）；1:N 取文件 mtime 最新者并记 ambiguity（不拼接）。
 */
import fs from 'node:fs'
import path from 'node:path'

export const NEGATIVE_TTL_MS = 2000

function round(value) {
  return Math.round(value * 1000) / 1000
}

export function createOwnershipReader(options = {}) {
  const dshHome = String(options.dshHome || '')
  const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 1000
  const log = typeof options.log === 'function' ? options.log : () => {}
  let cache = null
  let timer = null
  let lastAmbiguityKey = ''
  const misses = new Map()

  function safeDirs(target) {
    try {
      return fs.readdirSync(target, { withFileTypes: true })
    } catch {
      return []
    }
  }

  function discoverFiles() {
    const out = []
    const root = path.join(dshHome, 'integrations')
    for (const channelDir of safeDirs(root)) {
      if (!channelDir.isDirectory() || !channelDir.name.startsWith('dsh-')) continue
      const channel = channelDir.name.slice(4)
      for (const area of ['bots', 'accounts']) {
        const areaDir = path.join(root, channelDir.name, area)
        for (const botDir of safeDirs(areaDir)) {
          if (!botDir.isDirectory()) continue
          out.push({ channel, botId: botDir.name, file: path.join(areaDir, botDir.name, 'state.json') })
        }
      }
    }
    return out
  }

  function refresh(reason) {
    const statStart = process.hrtime.bigint()
    const stats = []
    for (const file of discoverFiles()) {
      try {
        const stat = fs.statSync(file.file)
        if (!stat.isFile()) continue
        stats.push({ ...file, mtimeMs: stat.mtimeMs, size: stat.size })
      } catch {
        // ENOENT / 权限拒绝：fail-soft，视作该 bot 暂无落盘
      }
    }
    stats.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    const stamp = JSON.stringify([dshHome, ...stats.map((s) => [s.file, s.mtimeMs, s.size])])
    const statMs = round(Number(process.hrtime.bigint() - statStart) / 1e6)
    if (cache && cache.stamp === stamp) {
      cache.checkedAt = Date.now()
      cache.stats = { ...cache.stats, reason, statMs, files: stats.length, cached: true }
      return cache
    }

    const parseStart = process.hrtime.bigint()
    const index = new Map()
    const errors = []
    let bytes = 0
    for (const entry of stats) {
      let text = ''
      try {
        text = fs.readFileSync(entry.file, 'utf8')
      } catch (error) {
        errors.push({ file: entry.file, phase: 'read', message: String((error && error.message) || error) })
        continue
      }
      bytes += Buffer.byteLength(text, 'utf8')
      let data = null
      try {
        data = JSON.parse(text)
      } catch (error) {
        errors.push({ file: entry.file, phase: 'parse', message: String((error && error.message) || error) })
        continue
      }
      const sessions = data && typeof data === 'object' && !Array.isArray(data) ? data.sessions : null
      if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) {
        errors.push({ file: entry.file, phase: 'sessions', message: 'sessions is not a plain object' })
        continue
      }
      for (const [key, sessionId] of Object.entries(sessions)) {
        if (typeof sessionId !== 'string' || sessionId.trim() === '') continue
        const next = { channel: entry.channel, botId: entry.botId, key, file: entry.file, fileMtimeMs: entry.mtimeMs }
        const list = index.get(sessionId)
        if (list) list.push(next)
        else index.set(sessionId, [next])
      }
    }
    const parseMs = round(Number(process.hrtime.bigint() - parseStart) / 1e6)
    const nextStats = {
      reason,
      at: Date.now(),
      statMs,
      parseMs,
      files: stats.length,
      bytes,
      sessions: index.size,
      errors,
      cached: false,
    }
    cache = { stamp, index, stats: nextStats, checkedAt: Date.now() }
    misses.clear()
    if (errors.length > 0) log('ownership.refresh.fail', { reason, files: stats.length, errors: errors.slice(0, 5) })
    log('ownership.refresh', nextStats)
    return cache
  }

  function lookup(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return { hit: false, reason: 'no-session-id' }
    if (!cache) return { hit: false, reason: 'not-ready' }
    const list = cache.index.get(sessionId)
    if (list && list.length > 0) {
      misses.delete(sessionId)
      const entries = list.slice().sort((a, b) => b.fileMtimeMs - a.fileMtimeMs || (a.file < b.file ? -1 : 1))
      const winner = entries[0]
      const ambiguous = entries.length > 1
      if (ambiguous) {
        const key = sessionId + '|' + entries.map((e) => e.botId).sort().join(',')
        if (key !== lastAmbiguityKey) {
          lastAmbiguityKey = key
          log('ownership.ambiguity', {
            sessionId,
            candidates: entries.length,
            bots: entries.map((e) => e.botId),
            winner: winner.botId,
            rule: 'newest-file-mtime',
          })
        }
      }
      return { hit: true, entry: winner, entries, ambiguous, cacheAgeMs: Math.max(0, Date.now() - cache.stats.at) }
    }
    const now = Date.now()
    const missAt = misses.get(sessionId) || 0
    const negative = now - missAt < NEGATIVE_TTL_MS
    if (!negative) misses.set(sessionId, now)
    return {
      hit: false,
      reason: negative ? 'negative-cache' : 'miss',
      cacheAgeMs: cache ? Math.max(0, now - cache.stats.at) : null,
    }
  }

  function start() {
    try {
      refresh('load')
    } catch (error) {
      log('ownership.refresh.fail', { reason: 'load', message: String((error && error.message) || error) })
    }
    timer = setInterval(() => {
      try {
        refresh('interval')
      } catch (error) {
        log('ownership.refresh.fail', { reason: 'interval', message: String((error && error.message) || error) })
      }
    }, intervalMs)
    if (timer && typeof timer.unref === 'function') timer.unref()
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function snapshot() {
    return {
      ready: cache !== null,
      sessions: cache ? cache.index.size : 0,
      stats: cache ? cache.stats : null,
      checkedAgeMs: cache ? Math.max(0, Date.now() - cache.checkedAt) : null,
    }
  }

  return { start, stop, refresh, lookup, snapshot }
}
