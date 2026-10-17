/** 家矩阵主路径（data.ts 的降级 fallback 之外）：行＝家（墓碑过滤；悬空 homeId 不渲染）。
 * 格：同家同渠道多助理合并（online>warn>offline；全员孤儿才标失联；快照缺席按离线；
 * 任一 stale 即 stale）。行健康全家合并。counts.agents 沿用“行数”键（现为家数）。 */
import { CHANNEL_ORDER, channelLabel, type HealthKind } from '../../client/data/config'
import { basenameOf, type Assistant, type Home } from '../../client/data/home-model'
import { channelOf } from '../../client/data/home-channel'
import type { BotSnap } from '../../client/data/fleet-api'
import {
  compareRows, matrixChannelLabel,
  type CellHealth, type CellMate, type Lang, type MatrixCell, type MatrixModel,
} from './data'

/** 家矩阵格（同家同渠道多助理合并）：未绑定经 channelOf 已滤掉（不进列，计入待绑）。
 * mates 与 names 同序（createdAt），悬浮 popover 一行一位。 */
export function cellForHome(list: Assistant[], snaps: BotSnap[], channel: string): MatrixCell {
  const label = channelLabel(channel)
  const inCh = (list ?? []).filter((a) => a && channelOf(a) === channel)
  if (!inCh.length) return { channel, label, botId: '', health: 'empty', bound: false, stale: false, count: 0, names: [], mates: [] }
  let rank = 2
  let stale = false
  let liveBound = false
  let firstBot = ''
  const names: string[] = []
  const mates: CellMate[] = []
  for (const a of inCh) {
    if (a.name) names.push(a.name)
    if (a.status !== 'orphan' && a.botId) {
      const snap = snaps.find((s) => s.channel === channel && s.botId === a.botId)
      if (!firstBot) firstBot = a.botId
      if (snap?.stale === true) stale = true
      const h: HealthKind = snap ? snap.healthKind : 'offline'
      liveBound = true
      if (h === 'online' && snap?.stale !== true) rank = Math.min(rank, 0)
      else rank = Math.min(rank, 1)
      mates.push({ id: a.id, name: a.name, avatar: a.avatar ?? null, botId: a.botId, health: h, stale: snap?.stale === true })
    } else {
      /* 孤儿（机器人没了）标失联；有渠道却无 botId 的异常记录按离线（无快照可查）。 */
      const mh: CellHealth = a.status === 'orphan' ? 'orphan' : 'offline'
      mates.push({ id: a.id, name: a.name, avatar: a.avatar ?? null, botId: '', health: mh, stale: false })
    }
  }
  const health: CellHealth = !liveBound ? 'orphan' : rank === 0 ? 'online' : rank === 1 ? 'warn' : 'offline'
  return { channel, label, botId: firstBot, health, bound: true, stale, count: inCh.length, names, mates }
}

/** 家行健康（全家合并）：任一非 stale 在线即在线；否则任一有快照（含 stale 在线）即待确认；否则离线。 */
function homeStatus(list: Assistant[], snaps: BotSnap[]): HealthKind {
  let seen = false
  for (const a of list) {
    const ch = channelOf(a)
    if (!ch || a.status === 'orphan' || !a.botId) continue
    const snap = snaps.find((s) => s.channel === ch && s.botId === a.botId)
    if (!snap) {
      seen = true
      continue
    }
    if (snap.healthKind === 'online' && snap.stale !== true) return 'online'
    seen = true
  }
  return seen ? 'warn' : 'offline'
}

export function buildHomeMatrix(bots: BotSnap[], homes: Home[], assistants: Assistant[], lang: Lang = 'zh'): MatrixModel {
  const cols = CHANNEL_ORDER.map((id) => ({ id, label: matrixChannelLabel(id, lang) }))
  const alive = (homes ?? []).filter((h) => h && !h.tombstone)
  const ids = new Set(alive.map((h) => h.id))
  const byHome = new Map<string, Assistant[]>()
  for (const a of assistants ?? []) {
    if (!a || !a.homeId || !ids.has(a.homeId)) continue
    const bucket = byHome.get(a.homeId)
    if (bucket) bucket.push(a)
    else byHome.set(a.homeId, [a])
  }
  const rows = alive.map((h) => {
    const list = (byHome.get(h.id) ?? []).slice().sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0))
    const boundCount = list.filter((a) => a.status === 'bound').length
    const unboundCount = list.filter((a) => a.status === 'unbound').length
    const orphanCount = list.filter((a) => a.status === 'orphan').length
    const chBearing = list.filter((a) => channelOf(a) !== null)
    return {
      key: h.id,
      drillKey: h.path,
      name: h.name || basenameOf(h.path) || '未命名家',
      base: basenameOf(h.path),
      workspace: h.path,
      bound: list.length > 0,
      status: chBearing.length ? homeStatus(list, bots) : 'offline' as HealthKind,
      botCount: boundCount,
      assistantCount: list.length,
      boundCount,
      unboundCount,
      orphanCount,
      cells: CHANNEL_ORDER.map((ch) => cellForHome(list, bots, ch)),
    }
  }).sort(compareRows)
  const emptyColumns = rows.length
    ? cols.filter((c) => rows.every((r) => {
      const cell = r.cells.find((x) => x.channel === c.id)
      return !cell || cell.health === 'empty'
    })).map((c) => c.id)
    : []
  return {
    rows,
    cols,
    emptyColumns,
    counts: {
      agents: rows.length,
      channels: cols.length,
      bots: (bots ?? []).length,
      assistants: rows.reduce((s, r) => s + r.assistantCount, 0),
    },
  }
}
