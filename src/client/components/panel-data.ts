/** FleetPanel 数据层：面板状态容器 + 渠道/元数据加载。
 * 首次加载与 15s 轮询共用 load()；静默轮询不闪骨架屏。渲染回调由编排器注入（setRender），数据层不感知视图。 */
import { fetchBots, type BotSnap, type RpcCall } from '../data/fleet-api'
import { EMPTY_META, createMetaStore, type AgentMetaDoc, type MetaStore } from '../data/meta'
import type { ViewMode } from '../data/model'

export interface PanelState {
  mode: ViewMode
  query: string
  bots: BotSnap[]
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
}

export function createPanelData(rpc: RpcCall | null): PanelDataHandle {
  const state: PanelState = {
    mode: 'agent',
    query: '',
    bots: [],
    meta: EMPTY_META,
    loading: true,
    error: '',
    updatedAt: '',
  }
  let store: MetaStore | null = null
  let render: () => void = () => {}

  async function loadMeta(): Promise<void> {
    if (!store) return
    try {
      state.meta = await store.loadMeta()
    } catch {
      state.meta = EMPTY_META
    }
  }

  async function load(silent = false): Promise<void> {
    if (silent) {
      // 静默轮询：不闪骨架屏，仅刷新数据（状态实时性）
      try {
        const result = await fetchBots(rpc as RpcCall)
        state.bots = result.bots
        state.error = ''
        state.updatedAt = nowText()
        render()
      } catch {
        /* 静默失败保留旧数据 */
      }
      return
    }
    state.loading = true
    state.error = ''
    render()
    if (!store) store = await createMetaStore(rpc)
    await loadMeta()
    try {
      const result = await fetchBots(rpc as RpcCall)
      state.bots = result.bots
      state.updatedAt = nowText()
    } catch (e) {
      state.error = '加载失败：' + String((e as Error)?.message ?? e)
    }
    state.loading = false
    render()
  }

  return {
    state,
    store: () => store,
    load,
    loadMeta,
    setRender: (fn) => {
      render = fn
    },
  }
}

function nowText(): string {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}
