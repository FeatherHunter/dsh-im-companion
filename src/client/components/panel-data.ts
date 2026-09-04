/** FleetPanel 数据层：面板状态容器 + 渠道/元数据加载。
 * #17 迁单份 connection-stream：静默轮询改订阅，失败渠道按 stale 未知展示（stream 内已 mergeStaleBots）；
 * 本层只读快照（bots/failed/updatedAt），不再直调 fetchBots；interval 归 stream 所有，面板只管订阅与 dispose。 */
import type { BotSnap } from '../data/fleet-api'
import type { RpcCall } from '../data/fleet-api'
import { getSharedStream } from '../data/connection-stream'
import { EMPTY_META, createMetaStore, type AgentMetaDoc, type MetaStore } from '../data/meta'
import type { ViewMode } from '../data/model'

export interface PanelState {
  mode: ViewMode
  query: string
  bots: BotSnap[]
  /** 本轮轮询失败的渠道（tooltip 透出“（轮询失败）”，body 层消费）。 */
  failed: string[]
  meta: AgentMetaDoc
  loading: boolean
  error: string
  updatedAt: string
}

export interface PanelDataHandle {
  state: PanelState
  store(): MetaStore | null
  load(silent?: boolean): Promise<void>
  loadMeta(): Promise<void>
  setRender(fn: () => void): void
  dispose(): void
}

export function createPanelData(rpc: RpcCall | null): PanelDataHandle {
  const state: PanelState = {
    mode: 'agent',
    query: '',
    bots: [],
    failed: [],
    meta: EMPTY_META,
    loading: true,
    error: '',
    updatedAt: '',
  }
  let store: MetaStore | null = null
  let render: () => void = () => {}
  let unsub: (() => void) | null = null
  let disposed = false

  function paint(): void {
    if (disposed) return
    try {
      render()
    } catch {
      /* 渲染失败下轮再试 */
    }
  }

  try {
    const stream = getSharedStream(rpc)
    unsub = stream.subscribe((snap) => {
      if (disposed) return
      state.bots = snap.bots
      state.failed = snap.failed ?? []
      if (snap.updatedAt > 0) {
        state.loading = false
        state.error = ''
        state.updatedAt = fmtTime(snap.updatedAt)
      }
      paint()
    })
  } catch {
    unsub = null
  }

  async function loadMeta(): Promise<void> {
    if (!store) return
    try {
      state.meta = await store.loadMeta()
    } catch {
      state.meta = EMPTY_META
    }
  }

  async function load(silent = false): Promise<void> {
    if (!rpc) {
      state.loading = false
      state.error = '连接不可用'
      paint()
      return
    }
    if (!silent) {
      state.loading = state.bots.length === 0
      state.error = ''
      paint()
    }
    if (!store) store = await createMetaStore(rpc)
    await loadMeta()
    try {
      await getSharedStream(rpc).refresh()
    } catch {
      /* 刷新失败保留旧快照（stale 由 stream 标未知） */
    }
    paint()
  }

  return {
    state,
    store: () => store,
    load,
    loadMeta,
    setRender: (fn) => {
      render = fn
    },
    dispose: () => {
      disposed = true
      try {
        unsub?.()
      } catch {
        /* 清理失败忽略 */
      }
      unsub = null
    },
  }
}

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}
