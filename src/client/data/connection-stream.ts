/** 单份 15s 轮询 + 多消费者订阅（B1 首建，A1 迁入）：client 唯一轮询源。
 * 失败渠道保留上一轮快照并标 stale（时间冻结、按未知展示），绝不谎报离线；
 * ok:false（渠道未配置）是权威空，不保留。feature 只经 subscribe 读快照，禁自开轮询。 */
import { fetchBots, mergeStaleBots, type AgentPresetCatalog, type BotSnap, type RpcCall } from './fleet-api'

export const CONNECTION_POLL_MS = 15000

export interface StreamSnapshot {
  bots: BotSnap[]
  failed: string[]
  updatedAt: number
  /** A' 追加：每渠道预设目录（只加字段，老消费者忽略即可）。 */
  catalogs: Record<string, AgentPresetCatalog>
}

export interface ConnectionStream {
  get(): StreamSnapshot
  subscribe(fn: (snap: StreamSnapshot) => void): () => void
  refresh(): Promise<void>
  dispose(): void
}

export function createConnectionStream(rpc: RpcCall | null, now: () => number = Date.now): ConnectionStream {
  let bots: BotSnap[] = []
  let failed: string[] = []
  let catalogs: Record<string, AgentPresetCatalog> = {}
  let updatedAt = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const subs = new Set<(snap: StreamSnapshot) => void>()
  const snap = (): StreamSnapshot => ({ bots, failed, updatedAt, catalogs })
  const emit = (): void => {
    const s = snap()
    for (const fn of [...subs]) {
      try {
        fn(s)
      } catch {
        /* 单个消费者失败不影响其他 */
      }
    }
  }
  const poll = async (): Promise<void> => {
    if (!rpc || disposed) return
    try {
      const result = await fetchBots(rpc)
      if (disposed) return
      bots = mergeStaleBots(bots, result.bots, result.failed)
      failed = result.failed
      catalogs = result.catalogs ?? catalogs
      updatedAt = now()
      emit()
    } catch {
      /* 静默失败保留旧快照 */
    }
  }
  try {
    if (typeof setInterval !== 'undefined') timer = setInterval(() => void poll(), CONNECTION_POLL_MS)
  } catch {
    /* 无定时器就只靠手动 refresh */
  }
  void poll()
  return {
    get: snap,
    subscribe(fn) {
      subs.add(fn)
      try {
        fn(snap())
      } catch {
        /* 首拍失败忽略 */
      }
      return () => {
        subs.delete(fn)
      }
    },
    refresh: () => poll(),
    dispose: () => {
      disposed = true
      try {
        if (timer !== undefined) clearInterval(timer)
      } catch {
        /* 清理失败忽略 */
      }
      subs.clear()
    },
  }
}
