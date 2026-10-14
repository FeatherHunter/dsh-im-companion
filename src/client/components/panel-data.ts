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
import { findOrphans } from '../data/home-move'
import { listHomes, seedHomes } from './home-ops'
import { sweepOrphans } from './home-move-ops'
import { logLine, logOn } from '../log'

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
  /** `afterHomes`：首屏顺序化用——挂载链把「读家表」交给这里，总账在家表读完后再记。 */
  load(silent?: boolean, afterHomes?: () => Promise<void>): Promise<void>
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
  /* 本轮 load 是否全须全尾（元数据/快照任一失败即 false，随 panel.load 落盘）。 */
  let loadOk = true
  /* 上一次渲染失败原文（同一原文只在首次记：渲染在 15s 轮询里跑，error 恒落盘，不能每轮刷）。 */
  let renderErr = ''
  /* 种子互斥（快照连到时串行化：跳过并发的那次，缺口仍在则下轮快照再触发）。 */
  let seeding = false

  function paint(): void {
    if (disposed) return
    try {
      render()
      renderErr = ''
    } catch (e) {
      /* 渲染失败本轮放弃、下轮再试；原文必须留（否则只剩「界面没动」这一条线索）。 */
      const message = String((e as Error)?.message ?? e)
      if (message !== renderErr) {
        renderErr = message
        logLine('error', 'ui.render.fail', { area: 'panel.body', message })
      }
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
      // T6c #115：同拍顺带孤儿回落（bot 没了→助理变失联，失败渠道 fail-closed）。
      const lite = state.bots.map((b) => ({
        channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName ?? '',
      }))
      const needSeed = state.homesReady && !state.volatile && rpc
        && seedGap(lastWorkspaces, lite, state.homes, state.assistants)
      const needOrphan = state.homesReady && !state.volatile && !!rpc && state.bots.length > 0
        && findOrphans(state.assistants, lite, state.failed ?? []).length > 0
      if (needSeed || needOrphan) {
        const liveRpc = rpc as RpcCall
        void (async () => {
          try {
            if (needOrphan) {
              const n = await sweepOrphans(liveRpc, state.assistants, lite, state.failed ?? [])
              if (n) {
                const regot = await listHomes(liveRpc)
                if (regot.homes.length) { state.homes = regot.homes; state.assistants = regot.assistants }
              }
            }
            if (needSeed) await ensureSeeded()
          } catch (e) {
            /* best effort，下轮再试；原文留 debug（这条在轮询路径上，只许 debug 明细）。 */
            if (logOn('debug')) logLine('debug', 'ui.action', { area: 'homes', action: 'sweep-seed', ok: false, message: String((e as Error)?.message ?? e) })
          }
        })().then(paint, paint)
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
    /* T6c #115 孤儿回落（机器人没了→助理变失联）：快照有 bots 才扫（空快照 fail-closed，防误伤全表）；
     * 回落后重读一次，保证列表与详情一致。 */
    try {
      if (!state.volatile && state.bots.length && state.assistants.length) {
        const lite = botLites()
        if (await sweepOrphans(rpc, state.assistants, lite, state.failed ?? [])) {
          const regot = await listHomes(rpc)
          if (regot.homes.length) { state.homes = regot.homes; state.assistants = regot.assistants }
        }
      }
    } catch { /* best effort：扫尾失败下轮再试，不掀表 */ }
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
    } catch (e) {
      loadOk = false
      state.meta = EMPTY_META
      logLine('error', 'panel.load.fail', { message: '元数据读取失败：' + String((e as Error)?.message ?? e) })
    }
  }

  async function load(silent = false, afterHomes?: () => Promise<void>): Promise<void> {
    const t0 = Date.now()
    loadOk = true
    if (!rpc) {
      state.loading = false
      state.error = '连接不可用'
      state.homesReady = true
      logLine('error', 'panel.load.fail', { message: '连接不可用：rpc 未就绪（宿主 connection 缺失）' })
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
    } catch (e) {
      /* 刷新失败保留旧快照（stale 由 stream 标未知）；stream.fail 已另有去重行，这里只留 debug 明细。 */
      loadOk = false
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel', action: 'stream-refresh', ok: false, message: String((e as Error)?.message ?? e) })
    }
    paint()
    /* 首屏顺序化：家表读完再记总账——否则首屏这行永远记 homes=0/assistants=0，而家表里真有 N 家，
     * 事后只读日志必误判「家是空的/建家没生效」（T9 #123 真机验收实测抓到）。 */
    if (afterHomes) { try { await afterHomes() } catch { loadOk = false } }
    /* 首屏/手动刷新的总账：家/助理/机器人各几行、耗时、这一轮是否完整。 */
    logLine('info', 'panel.load', { homes: state.homes.length, assistants: state.assistants.length, bots: state.bots.length, ok: loadOk, latencyMs: Date.now() - t0 })
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
