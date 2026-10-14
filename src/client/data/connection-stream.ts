/** 单份 15s 轮询 + 多消费者订阅（B1 首建，A1 迁入）：client 唯一轮询源。
 * 失败渠道保留上一轮快照并标 stale（时间冻结、按未知展示），绝不谎报离线；
 * ok:false（渠道未配置）是权威空，不保留。feature 只经 subscribe 读快照，禁自开轮询。 */
import { fetchBots, mergeStaleBots, type AgentPresetCatalog, type BotSnap, type RpcCall } from './fleet-api'
import { logLine, logOn } from '../log'

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

/** 进程内共享单例（#17 A线收尾：面板与特性共用同一轮询，网络只打一份）。
 * Added-only：新增导出，既有 createConnectionStream 行为零改；index 装配层负责 dispose 后 reset。 */
let sharedStream: ConnectionStream | null = null

export function getSharedStream(rpc: RpcCall | null, now: () => number = Date.now): ConnectionStream {
  if (!sharedStream) sharedStream = createConnectionStream(rpc)
  return sharedStream
}

export function resetSharedStream(): void {
  sharedStream = null
}

export function createConnectionStream(rpc: RpcCall | null, now: () => number = Date.now): ConnectionStream {
  let bots: BotSnap[] = []
  let failed: string[] = []
  let catalogs: Record<string, AgentPresetCatalog> = {}
  let updatedAt = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  /* 失败签名（失败渠道集合 / 抛错原文）：轮询路径只许在签名**变化**时记一条 stream.fail（T9 #123）。 */
  let failSig = ''
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
    const t0 = Date.now()
    try {
      const result = await fetchBots(rpc)
      if (disposed) return
      bots = mergeStaleBots(bots, result.bots, result.failed)
      failed = result.failed
      catalogs = result.catalogs ?? catalogs
      updatedAt = now()
      /* 失败渠道：集合变了才是新问题（同一批渠道一直坏只留首次那条，别 15s 刷一遍）。 */
      const sig = failed.length ? '渠道轮询失败：' + failed.join(',') : ''
      if (!sig) failSig = ''
      else if (sig !== failSig) { failSig = sig; logLine('warn', 'stream.fail', { message: sig }) }
      if (logOn('debug')) logLine('debug', 'stream.poll', { ok: !failed.length, latencyMs: Date.now() - t0, bots: bots.length })
      emit()
    } catch (e) {
      /* 整批拉取炸了（fetchBots 内部按渠道 allSettled，走到这里＝桥/rpc 层异常）：原文照记，签名去重。 */
      const message = String((e as Error)?.message ?? e)
      if (message !== failSig) { failSig = message; logLine('warn', 'stream.fail', { message }) }
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
    refresh: () => {
      /* 手动刷新（面板刷新钮 / 写后广播）走同一条 poll；这里只留一句「谁按的」，poll 明细另有 stream.poll。 */
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'stream', action: 'refresh', ok: true, message: '' })
      return poll()
    },
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
