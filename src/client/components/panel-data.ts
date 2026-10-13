/** FleetPanel 数据层：面板状态容器 + 渠道/元数据加载。
 * #17 迁单份 connection-stream：静默轮询改订阅，失败渠道按 stale 未知展示（stream 内已 mergeStaleBots）；
 * 本层只读快照（bots/failed/updatedAt），不再直调 fetchBots；interval 归 stream 所有，面板只管订阅与 dispose。 */
import type { BotSnap } from '../data/fleet-api'
import type { RpcCall } from '../data/fleet-api'
import { getSharedStream } from '../data/connection-stream'
import { EMPTY_META, createMetaStore, type AgentMetaDoc, type MetaStore } from '../data/meta'
import type { ViewMode } from '../data/model'
import {
  buildSeed, seedGap,
  type Assistant, type Home, type LegacyNames, type WorkspaceRef,
} from '../data/home-model'
import { listHomes, seedHomes } from './home-ops'

export interface PanelState {
  mode: ViewMode
  query: string
  bots: BotSnap[]
  /** 本轮轮询失败的渠道（tooltip 透出“（轮询失败）”，body 层消费）。 */
  failed: string[]
  meta: AgentMetaDoc
  /** 家/助理新表（绿框真相源；旧 meta 只做种子回落，不双写）。 */
  homes: Home[]
  assistants: Assistant[]
  homesReady: boolean
  /** 家表**未落盘**：宿主半还是旧代码（端点缺失）时降级为内存呈现，三级照常可见，写操作会如实报错。 */
  volatile: boolean
  loading: boolean
  error: string
  updatedAt: string
}

export interface PanelDataHandle {
  state: PanelState
  store(): MetaStore | null
  load(silent?: boolean): Promise<void>
  loadMeta(): Promise<void>
  /** 家表读取＋缺口时种子迁移（幂等可重跑；失败保持旧表 fail-closed）。 */
  loadHomes(getWorkspaces: () => WorkspaceRef[]): Promise<void>
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
    homes: [],
    assistants: [],
    homesReady: false,
    volatile: false,
    loading: true,
    error: '',
    updatedAt: '',
  }
  let store: MetaStore | null = null
  let render: () => void = () => {}
  let unsub: (() => void) | null = null
  let disposed = false
  /* 种子互斥（快照连到时串行化：跳过并发的那次，缺口仍在则下轮快照再触发）。 */
  let seeding = false

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
      // 缺口时补种子（内存判定，零 IO 除非真有缺口；新 bot 上线时补齐助理行）。
      if (state.homesReady && !state.volatile && rpc && seedGap(lastWorkspaces, state.bots.map((b) => ({
        channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName ?? '',
      })), state.homes, state.assistants)) {
        void ensureSeeded().then(paint, paint)
      } else {
        paint()
      }
    })
  } catch {
    unsub = null
  }

  let lastWorkspaces: WorkspaceRef[] = []
  const botLites = () => state.bots.map((b) => ({
    channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName ?? '',
  }))
  /* 家表读取：失败保持旧表（fail-closed），绝不因桥抖动掀掉已渲染的三级。
   * 单出口：无论走读表还是种子，末尾一律 paint（首屏一次到位，不靠下一轮 15s 轮询补助理行）。 */
  async function loadHomes(getWorkspaces: () => WorkspaceRef[]): Promise<void> {
    try {
      lastWorkspaces = getWorkspaces() ?? []
    } catch {
      lastWorkspaces = []
    }
    if (!rpc) {
      state.homesReady = true
      paint()
      return
    }
    const got = await listHomes(rpc)
    if (got.homes.length) {
      state.homes = got.homes
      state.assistants = got.assistants
      state.homesReady = true
      /* 宿主已能读表（此前可能因旧宿主/桥抖动降级过）⇒ 降级标记必须清掉，
       * 否则提示永久挂着且 !volatile 会把后续缺口种子一起堵死。 */
      state.volatile = false
    }
    // 空表→种子；降级中（内存呈现未落盘）→重试落盘；非空→缺口判定（新 bot 上线补行；已绑齐则静默）。
    if (!state.homes.length || state.volatile
      || seedGap(lastWorkspaces, botLites(), state.homes, state.assistants)) {
      await ensureSeeded()
    }
    state.homesReady = true
    paint()
  }

  async function ensureSeeded(): Promise<void> {
    if (!rpc || seeding) return
    seeding = true
    try {
    const legacy: LegacyNames = { names: (state.meta as AgentMetaDoc)?.names ?? {} }
    const seed = buildSeed(lastWorkspaces, botLites(), legacy)
    if (!seed.homes.length && !seed.assistants.length) {
      state.homesReady = true
      return
    }
    let persisted = false
    /* 上一次是内存临时呈现（行 id 是种子临时 id）：重试落盘前先清掉，
     * 免得宿主真行与临时行并存 → 同一工作区出现两家。 */
    if (state.volatile) { state.homes = []; state.assistants = [] }
    try {
      const v = await seedHomes(rpc, seed)
      // 宿主回映射行 + 本地快照合并（幂等：已存在行复用，不翻倍）。
      const ids = new Set(state.homes.map((h) => h.id))
      for (const h of v.homes) if (!ids.has(h.id)) { state.homes.push(h); ids.add(h.id) }
      const aids = new Set(state.assistants.map((a) => a.id + '' + a.channel + '' + (a.botId ?? '')))
      for (const a of v.assistants) {
        const k = a.id + '' + a.channel + '' + (a.botId ?? '')
        if (!aids.has(k)) { state.assistants.push(a); aids.add(k) }
      }
      persisted = v.homes.length > 0
    } catch {
      /* 落盘不可用（宿主半还是旧代码 / 桥抖动）：下面统一降级为内存临时呈现，不假装已落盘。 */
    }
    if (persisted) {
      /* 本次真的落盘了（可能是宿主重载后的重试）⇒ 摘掉降级标记，让三级从此走真表。 */
      state.volatile = false
    } else if (!state.homes.length && seed.homes.length) {
      /* 宿主没给回可用的家行（端点缺失/回包空）→ 内存临时呈现：家=工作区、助理=bot 由快照即可推导，
       * 三级照常看得见；此时写操作会如实报错，L1 顶部给「未落盘」提示（volatile）。 */
      state.homes = seed.homes
      state.assistants = seed.assistants
      state.volatile = true
    }
    state.homesReady = true
    } finally {
      seeding = false
    }
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
    loadHomes,
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
