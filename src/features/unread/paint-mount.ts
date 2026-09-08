/** V2 染色挂载（#55）：stream 节拍取数 + MO 跟随 DOM 抖动（rAF 合并，无自有定时器）。
 * 纯逻辑见 ./paint（paintUnread）；本文件只做装配与获取。 */
import { deriveRowStates, fetchActivity, type ActivityEntry, type RowState } from '../../client/data/activity'
import type { BotSnap, RpcCall } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import { readArchivedIds } from './events'
import { callUnread } from './host-call'
import { ACT, numOrNull, paintUnread, SESS, TIP, type UnreadStoreMap } from './paint'

const PREFIX = '[unread]'
const CHANNEL = '/im-companion'
const RPC_TIMEOUT_MS = 5000
const FETCH_RACE_MS = 8000
const FETCH_STUCK_MS = 10000
/* MO 高频抖动节流：paint 只影响显示新鲜度（正确性由 15s 事件源保证），2s 内重复触发合并。 */
const MIN_REFRESH_GAP_MS = 2000
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'

/** unread 表读取（RpcMetaStore 同款信封：ok:true 取 value.unread；取不到=空表）。 */
async function fetchUnreadDump(rpc: RpcCall | null): Promise<UnreadStoreMap> {
  try {
    if (!rpc) return {}
    const raw = await rpc(CHANNEL, 'im-companion.unread.get', {}, AbortSignal.timeout(RPC_TIMEOUT_MS))
    const v = raw as { ok?: unknown; value?: { unread?: unknown } } | null
    if (!v || v.ok !== true || !v.value || typeof v.value.unread !== 'object' || !v.value.unread) return {}
    const out: UnreadStoreMap = {}
    try {
      for (const [k, e] of Object.entries(v.value.unread as Record<string, unknown>)) {
        try {
          if (!k || k.length > 256) continue
          const r = e as { seenAt?: unknown; notifyAt?: unknown } | null
          out[k] = { seenAt: numOrNull(r?.seenAt), notifyAt: numOrNull(r?.notifyAt) }
        } catch { /* 单条目跳过 */ }
      }
    } catch { /* 表遍历失败即空 */ }
    return out
  } catch { return {} }
}
function collectGroups(): Element[] {
  const out: Element[] = []
  try { document.querySelectorAll(GROUP_SEL).forEach((n) => out.push(n)) } catch { /* 无组即空 */ }
  return out
}
/** 挂载：stream 节拍取数 + MO 跟随 DOM 抖动（rAF 合并，无自有定时器）。 */
export function mountUnreadPaint(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  try {
    if (typeof document === 'undefined') return noop
    try { console.info(PREFIX + ' 行染色已挂载（等 stream 首轮快照）') } catch { /* 忽略 */ }
    let bots: BotSnap[] = []
    let hasSnap = false
    let fetching = false
    let fetchStartedAt = 0
    let disposed = false
    let rafQueued = false
    let lastOkAt = 0
    const refresh = (): void => {
      try { if (fetching && Date.now() - fetchStartedAt > FETCH_STUCK_MS) fetching = false } catch { fetching = false }
      if (disposed || !hasSnap || fetching) return
      try {
        if (Date.now() - lastOkAt < MIN_REFRESH_GAP_MS) return
      } catch { /* 时间取失败不节流 */ }
      fetching = true
      try { fetchStartedAt = Date.now() } catch { /* 忽略 */ }
      const rpc = ctx.rpc
      const raced: Promise<unknown[]> = Promise.race([
        Promise.all([fetchActivity(rpc), fetchUnreadDump(rpc)]),
        new Promise<unknown[]>(function (_, reject) { try { setTimeout(function () { reject(new Error('unread-paint-timeout')) }, FETCH_RACE_MS) } catch { reject(new Error('unread-paint-timeout')) } }),
      ])
      raced.then(function (res) {
        if (disposed) { fetching = false; return }
        try {
          const arr = res as unknown[]
          const groups = collectGroups()
          if (!groups.length) { fetching = false; return }
          const texts = groups.map(function (g) { try { return typeof g.textContent === 'string' ? g.textContent.trim() : '' } catch { return '' } })
          let states: RowState[] = []
          try { states = deriveRowStates(texts, bots, arr[0] as ActivityEntry[], new Map<string, boolean>()) } catch { states = [] }
          let excluded: Set<string> | undefined
          try { excluded = readArchivedIds(ctx) } catch { excluded = undefined }
          try {
            const d = paintUnread(groups, states, arr[1] as UnreadStoreMap, excluded)
            /* 诊断取证纪律：计数变化即落盘 diag.json（agent 直接读，用户不贴控制台）。 */
            if (d) {
              try { void callUnread(rpc, 'im-companion.unread.diag', { groups: d.groups, rows: d.rows, red: d.red, yellow: d.yellow, blue: d.blue }) } catch { /* 诊断发送失败忽略 */ }
            }
          } catch { /* 本轮绘制失败下轮 */ }
          try { lastOkAt = Date.now() } catch { /* 时间失败下轮不节流 */ }
        } catch { /* 本轮失败下轮 */ }
        fetching = false
      }).catch(function () { fetching = false })
    }
    const schedulePaint = (): void => {
      const run = (): void => { rafQueued = false; try { refresh() } catch { /* 下次再试 */ } }
      try {
        if (typeof requestAnimationFrame === 'function') {
          if (rafQueued) return
          rafQueued = true
          requestAnimationFrame(function () { run() })
        } else { run() }
      } catch { run() }
    }
    let unsub: (() => void) | null = null
    try {
      unsub = ctx.subscribe(function (snap) {
        try { bots = snap.bots; hasSnap = snap.updatedAt > 0 } catch { /* 快照异常下轮 */ }
        if (hasSnap) refresh()
      })
    } catch { unsub = null }
    let observer: MutationObserver | undefined = undefined
    try {
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(function () { schedulePaint() })
        observer.observe(document.body ? document.body : document.documentElement, { childList: true, subtree: true })
      }
    } catch { /* 无 observer 只靠快照 */ }
    return function (): void {
      disposed = true
      try { if (unsub) unsub() } catch { /* 忽略 */ }
      try { if (observer) observer.disconnect() } catch { /* 忽略 */ }
      try { document.querySelectorAll('[' + ACT + ']').forEach(function (n) { try { n.removeAttribute(ACT); n.removeAttribute(TIP) } catch { /* 忽略 */ } }) } catch { /* 忽略 */ }
      try { document.querySelectorAll('[' + SESS + ']').forEach(function (n) { try { n.removeAttribute(SESS); n.removeAttribute(TIP) } catch { /* 忽略 */ } }) } catch { /* 忽略 */ }
    }
  } catch { return noop }
}
