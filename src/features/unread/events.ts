/** V2 精确事件源（永久功能 #54）：官方 sessions 快照差分 → host unread 写；SESSION_VIEWED_EVENT 为实时 backup。
 * 零新增定时器（复用 15s stream 订阅节拍）；快照缺失静默 no-op（= T4 回退，零回归）；全防御式 fail-soft。
 * 定序天然成立：completed 边与 running 取自同一快照（#50-E 陈旧点 vs open 竞争在快照源下不存在）。
 * RPC 信封同 RpcMetaStore（ok:true 取值，5s 超时）；ctx.rpc 为空即 no-op；同 tick 内 observe 先于 viewed 发出（顺序反了也收敛，见 #50-H）。 */
import { SESSION_VIEWED_EVENT } from '../../client/data/header-overlay'
import type { RpcCall } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'

const PREFIX = '[unread]'
const CHANNEL = '/im-companion'
const RPC_TIMEOUT_MS = 5000

interface SnapItem {
  sessionId?: unknown
  running?: unknown
  completed?: unknown
}

interface Snap {
  items?: unknown
  current?: unknown
}

export interface UnreadCall {
  endpoint: string
  payload: Record<string, unknown>
}

function cleanId(v: unknown): string {
  try {
    if (typeof v !== 'string') return ''
    const s = v.trim()
    return s && s.length <= 256 ? s : ''
  } catch {
    return ''
  }
}

/** 归档排除（用户裁定：归档不在 V2 宇宙内）：读 workspaces 快照 archivedSessionIds。
 * 缺失/异常=空集（不过滤，fail-open 展示；归档列表只会(clone)只增过滤精度）。 */
export function readArchivedIds(ctx: FeatureCtx): Set<string> {
  const out = new Set<string>()
  try {
    const svc = ctx.get('workspaces') as { list?: { getSnapshot?: () => unknown } } | null
    const snap = svc?.list?.getSnapshot?.() as { archivedSessionIds?: unknown } | null
    const arr = snap && Array.isArray(snap.archivedSessionIds) ? snap.archivedSessionIds : []
    for (const v of arr) {
      try {
        const id = cleanId(v)
        if (id) out.add(id)
        if (out.size >= 5000) break
      } catch { /* 单项跳过 */ }
    }
  } catch { /* 服务缺失=不过滤 */ }
  return out
}

function readSnapshot(ctx: FeatureCtx): Snap | null {
  try {
    const svc = ctx.get('sessions') as { list?: { getSnapshot?: () => unknown } } | null
    const snap = svc?.list?.getSnapshot?.()
    return snap && typeof snap === 'object' ? (snap as Snap) : null
  } catch {
    return null
  }
}

async function callUnread(rpc: RpcCall | null, endpoint: string, payload: Record<string, unknown>): Promise<void> {
  try {
    if (!rpc) return
    let raw: unknown = null
    try {
      raw = await rpc(CHANNEL, endpoint, payload, AbortSignal.timeout(RPC_TIMEOUT_MS))
    } catch {
      return
    }
    const res = raw as { ok?: unknown } | null
    if (!res || res.ok !== true) return
  } catch {
    /* 调用失败静默（下轮重写，自愈） */
  }
}

export interface UnreadEventsState {
  prevRunning: Map<string, boolean>
  prevCompleted: Map<string, boolean>
  prevIds: Set<string>
  prevCurrent: string
}

export function freshEventsState(): UnreadEventsState {
  return { prevRunning: new Map(), prevCompleted: new Map(), prevIds: new Set(), prevCurrent: '' }
}

/** 纯差分（可单测）：completed 上升沿（前 running→现 !running && completed）且当时非 current → observe；
 * current 切换 → viewed；成员消失 → prune（全量 id 集）；同 tick 先 observe 后 viewed。
 * excluded（归档 id 集）：三者全跳过；prune 的 keep 集剔除归档（存量条目一并清除，解档后从零开始，与官方首轮不补提醒一致）。 */
export function diffSnapshots(prev: UnreadEventsState, snap: Snap, nowMs: number, excluded?: Set<string>): { calls: UnreadCall[] } {
  const calls: UnreadCall[] = []
  try {
    const rawItems = snap && Array.isArray(snap.items) ? (snap.items as SnapItem[]) : []
    const cur = cleanId((snap as { current?: unknown } | null)?.current)
    const byId = new Map<string, { running: boolean; completed: boolean }>()
    const ids = new Set<string>()
    for (const it of rawItems) {
      try {
        const id = cleanId(it?.sessionId)
        if (!id || ids.has(id)) continue
        if (excluded && excluded.has(id)) continue
        ids.add(id)
        byId.set(id, { running: it?.running === true, completed: it?.completed === true })
      } catch {
        /* 单行失败跳过 */
      }
    }
    for (const [id, st] of byId) {
      try {
        const wasRunning = prev.prevRunning.get(id) === true
        /* 官方 arming 镜像：仅非 selected 会话的 running→idle 边建候选（选中即看，不建）。 */
        if (wasRunning && !st.running && st.completed && id !== cur) {
          calls.push({ endpoint: 'im-companion.unread.observe', payload: { sessionId: id, at: nowMs } })
        }
      } catch {
        /* 单会话失败不影响其他 */
      }
    }
    if (cur && cur !== prev.prevCurrent && !(excluded && excluded.has(cur))) {
      calls.push({ endpoint: 'im-companion.unread.viewed', payload: { sessionId: cur, at: nowMs } })
    }
    let vanished = false
    try {
      for (const old of prev.prevIds) {
        if (!ids.has(old)) {
          vanished = true
          break
        }
      }
    } catch {
      vanished = false
    }
    if (vanished) {
      calls.push({ endpoint: 'im-companion.unread.prune', payload: { keep: [...ids] } })
    }
    try {
      prev.prevRunning = new Map([...byId].map(([id, st]) => [id, st.running] as [string, boolean]))
      prev.prevCompleted = new Map([...byId].map(([id, st]) => [id, st.completed] as [string, boolean]))
      prev.prevIds = ids
      prev.prevCurrent = cur
    } catch {
      /* 状态推进失败下轮重建（宁可重复 observe——幂等——不丢边） */
    }
  } catch {
    /* 差分整体失败即本轮无调用 */
  }
  return { calls }
}

function info(msg: string): void {
  try {
    console.info(PREFIX + ' ' + msg)
  } catch {
    /* 日志失败忽略 */
  }
}

/** 挂载：stream 节拍差分 + viewed 事件 backup；返回卸载函数。 */
export function mountUnreadEvents(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  try {
    const st = freshEventsState()
    const fire = (snap: Snap): void => {
      try {
        let now = 0
        try {
          now = Date.now()
        } catch {
          /* 时间取失败用 0（store 层判非法 no-op） */
        }
        let excluded: Set<string> | undefined
        try {
          excluded = readArchivedIds(ctx)
        } catch {
          excluded = undefined
        }
        const { calls } = diffSnapshots(st, snap, now, excluded)
        for (const c of calls) {
          try {
            info(c.endpoint + ' ' + String((c.payload as { sessionId?: unknown }).sessionId ?? '').slice(0, 8))
          } catch {
            /* 日志失败不影响发送 */
          }
          try {
            void callUnread(ctx.rpc, c.endpoint, c.payload)
          } catch {
            /* 单发失败忽略 */
          }
        }
      } catch {
        /* 单轮失败下轮 */
      }
    }
    let unsub: (() => void) | null = null
    try {
      unsub = ctx.subscribe(() => {
        try {
          const snap = readSnapshot(ctx)
          if (snap) fire(snap)
        } catch {
          /* 快照缺失=回退（静默） */
        }
      })
    } catch {
      unsub = null
    }
    let onViewed: ((ev: Event) => void) | null = null
    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        onViewed = (ev: Event): void => {
          try {
            const sid = cleanId((ev as CustomEvent<{ sessionId?: unknown }> | null)?.detail?.sessionId)
            if (!sid) return
            let now = 0
            try {
              now = Date.now()
            } catch {
              /* 时间失败 store 层 no-op */
            }
            void callUnread(ctx.rpc, 'im-companion.unread.viewed', { sessionId: sid, at: now })
          } catch {
            /* 事件失败不影响展示 */
          }
        }
        window.addEventListener(SESSION_VIEWED_EVENT, onViewed as EventListener)
      }
    } catch {
      onViewed = null
    }
    return () => {
      try {
        unsub?.()
      } catch {
        /* 清理失败忽略 */
      }
      try {
        if (onViewed && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
          window.removeEventListener(SESSION_VIEWED_EVENT, onViewed as EventListener)
        }
      } catch {
        /* 清理失败忽略 */
      }
    }
  } catch {
    return noop
  }
}
