/** FleetPanel：A1 设置面板编排器（唯一有状态组件）。 */
import { h, mount, type ChildNode } from '../dom'
import { EMPTY_META, createMetaStore, type AgentMetaDoc, type MetaStore } from '../data/meta'
import { fetchBots, type BotSnap, type RpcCall } from '../data/fleet-api'
import { buildModel, type AgentView, type ViewMode } from '../data/model'
import { makeGroupedList, makeSkeletonRows, makeLoadingRow, makeErrorRow } from '../ui/list'
import { makeEmpty } from '../ui/empty'
import { makeIconButton } from '../ui/button'
import { makeSearchField } from '../ui/field'
import { makeSegmented, type SegHandle } from '../ui/segmented'
import { showMenu } from '../ui/menu'
import { toast } from '../ui/toast'
import { makeAgentRow } from './agent-row'
import { makeComposeBar, type ComposeBar } from './compose-bar'
import { openConnectFlow } from './connect-flow'
import { openWorkspacePicker } from './workspace-picker'
import { channelLabel } from '../data/config'

const TABS = [
  { id: 'agent', label: '按Agent' },
  { id: 'channel', label: '按渠道' },
] as const

interface PanelState {
  mode: ViewMode
  query: string
  bots: BotSnap[]
  meta: AgentMetaDoc
  loading: boolean
  error: string
  updatedAt: string
}

export function FleetPanel(ctx: unknown): HTMLElement {
  const rpc: RpcCall | null = extractRpc(ctx)

  /* ---------- 静态骨架 ---------- */
  const title = h('h1', { className: 'af-title' }, 'Agent')
  const titleMeta = h('div', { className: 'af-title-meta' }, '')
  const plusBtn = makeIconButton({ iconName: 'plus', label: '新建 Agent', title: '新建 Agent' })
  const hd = h('div', { className: 'af-hd' }, h('div', null, title, titleMeta), plusBtn)

  const search = makeSearchField((v) => {
    state.query = v
    renderBody()
  })
  let seg: SegHandle
  seg = makeSegmented([...TABS], 'agent', (id) => {
    state.mode = id as ViewMode
    renderBody()
  })
  const refreshBtn = makeIconButton({ iconName: 'refresh', label: '刷新', title: '立即刷新', onClick: () => void load(true) })
  const toolbar = h('div', { className: 'af-toolbar' }, search.el, seg.el, h('div', { style: { marginLeft: 'auto' } }, refreshBtn))
  const compose = makeComposeBar((name) => void onCreate(name))
  const body = h('div', { className: 'af-body' })
  const root = h('div', { className: 'af-root' }, hd, toolbar, compose.el, body)

  /* ---------- 状态 ---------- */
  const state: PanelState = { mode: 'agent', query: '', bots: [], meta: EMPTY_META, loading: true, error: '', updatedAt: '' }
  let store: MetaStore | null = null

  function relayout(): void {
    seg.relayout()
  }

  function renderMeta(model: ReturnType<typeof buildModel>): void {
    titleMeta.textContent = model.counts.agents + ' 个 Agent · ' + model.counts.channels + ' 个渠道 · ' + model.totalBots + ' 个机器人'
      + (state.updatedAt ? ' · 更新于 ' + state.updatedAt : '')
    seg.setLabel('agent', '按Agent (' + model.counts.agents + ')')
    seg.setLabel('channel', '按渠道 (' + model.counts.channels + ')')
  }

  function rowCallbacks() {
    return {
      rename: (view: AgentView, next: string) => void onRename(view, next),
      connect: (view: AgentView, anchor: HTMLElement) => onConnect(view, anchor),
      avatarMenu: (view: AgentView, anchor: HTMLElement) => onAvatarMenu(view, anchor),
      pickWorkspace: (view: AgentView) => void onPickWorkspace(view),
      removeBot: (view: AgentView, channel: string, botId: string) => void onRemoveBot(view, channel, botId),
      deleteLocal: (view: AgentView) => void removeLocal(view),
    }
  }

  function rowsFor(model: ReturnType<typeof buildModel>): ChildNode[] {
    if (state.mode === 'channel') {
      const out: ChildNode[] = []
      for (const g of model.channelGroups) {
        out.push(h('div', { className: 'af-section' },
          g.label,
          h('span', { className: 'af-section-count' }, g.count + ' 个 Agent'),
        ))
        out.push(makeGroupedList(...g.views.map((v) => makeAgentRow(v, rowCallbacks(), 'channel'))))
      }
      return out
    }
    return model.agents.map((v) => makeAgentRow(v, rowCallbacks(), 'agent'))
  }

  function renderBody(): void {
    if (state.loading) {
      mount(body, makeGroupedList(...makeSkeletonRows(3), makeLoadingRow()))
      relayout()
      return
    }
    if (state.error) {
      mount(body, makeErrorRow(state.error, () => void load()))
      relayout()
      return
    }
    const model = buildModel(state.bots, state.meta, state.mode, state.query)
    renderMeta(model)
    const rows = rowsFor(model)
    if (!rows.length) {
      const empty = state.query
        ? makeEmpty({ iconName: 'search', title: '没有找到匹配的 Agent', sub: '试试其他关键词' })
        : makeEmpty({ iconName: 'person', title: '还没有 Agent', sub: '点击右上角 + 新建，或接入聊天渠道' })
      mount(body, empty)
      relayout()
      return
    }
    if (state.mode === 'channel') mount(body, rows)
    else mount(body, makeGroupedList(...rows))
    relayout()
  }

  /* ---------- 数据 ---------- */
  const loadMeta = async (): Promise<void> => {
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
        renderBody()
      } catch {
        /* 静默失败保留旧数据 */
      }
      return
    }
    state.loading = true
    state.error = ''
    renderBody()
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
    renderBody()
  }

  let pollTimer: ReturnType<typeof setInterval> | undefined
  if (typeof setInterval !== 'undefined') {
    pollTimer = setInterval(() => void load(true), 15000)
  }

  /* ---------- 动作 ---------- */
  plusBtn.onclick = () => compose.setVisible(true)

  async function onCreate(name: string): Promise<void> {
    try {
      await store?.addLocal(name)
      await loadMeta()
      toast('已创建「' + name + '」', 'check')
      renderBody()
    } catch (e) {
      toast('创建失败：' + String((e as Error)?.message ?? e))
    }
  }

  async function onRename(view: AgentView, next: string): Promise<void> {
    try {
      if (view.isLocal) await store?.renameLocal(view.name, next)
      else if (view.base) await store?.rename(view.base, next)
      else {
        toast('请先接入渠道指定工作区后再命名')
        return
      }
      await loadMeta()
      toast('已改名', 'check')
      renderBody()
    } catch (e) {
      toast('改名失败：' + String((e as Error)?.message ?? e))
    }
  }

  function onConnect(view: AgentView, anchor: HTMLElement): void {
    openConnectFlow(ctx, rpc, anchor, { name: view.name, workspace: view.workspace }, () => void load(true))
  }

  async function onPickWorkspace(view: AgentView): Promise<void> {
    const picker = openWorkspacePicker(ctx, rpc)
    const ws = await picker.promise
    if (!ws) return
    for (const b of view.bots) {
      await rpc!('/' + b.channel, 'bot.workspace.set', { botId: b.botId, workspace: ws }, AbortSignal.timeout(8000))
        .catch((e: unknown) => toast('渠道 ' + channelLabel(b.channel) + ' 绑定失败：' + String((e as Error)?.message ?? e)))
    }
    await load(true)
    toast('工作区已更新', 'check')
  }

  async function onRemoveBot(view: AgentView, channel: string, botId: string): Promise<void> {
    void view
    try {
      await rpc!('/' + channel, 'bot.delete', { botId, confirm: true }, AbortSignal.timeout(8000))
      await load(true)
      toast('已移除渠道机器人', 'check')
    } catch (e) {
      toast('移除失败：' + String((e as Error)?.message ?? e))
    }
  }

  function onAvatarMenu(view: AgentView, anchor: HTMLElement): void {
    const key = view.isLocal ? localAvatarKey(view) : view.base
    const hasCustom = !!key && !!state.meta.avatars[key]
    const items: { label: string; iconName: 'camera' | 'trash'; danger?: boolean; onSelect: (() => void) | (() => Promise<void>) }[] = [
      { label: '上传图片', iconName: 'camera', onSelect: () => pickAvatar(view) },
    ]
    if (hasCustom) items.push({ label: '移除自定义头像', iconName: 'trash', onSelect: () => clearAvatar(view) })
    showMenu(anchor, items, 'bottom-right')
  }

  function pickAvatar(view: AgentView): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void applyAvatar(view, file)
    }
    input.click()
  }

  async function applyAvatar(view: AgentView, file: File): Promise<void> {
    try {
      if (file.size > 4 * 1024 * 1024) {
        toast('图片不能超过 4MB')
        return
      }
      const dataUrl = await downscaleImage(file)
      const key = view.isLocal ? localAvatarKey(view) : view.base
      if (!key) {
        toast('该 Agent 暂不支持设置头像')
        return
      }
      await store?.setAvatar(key, dataUrl)
      await loadMeta()
      toast('头像已更新', 'check')
      renderBody()
    } catch (e) {
      toast('头像设置失败：' + String((e as Error)?.message ?? e))
    }
  }

  async function clearAvatar(view: AgentView): Promise<void> {
    const key = view.isLocal ? localAvatarKey(view) : view.base
    if (!key) return
    await store?.clearAvatar(key)
    await loadMeta()
    toast('已恢复默认头像', 'check')
    renderBody()
  }

  async function removeLocal(view: AgentView): Promise<void> {
    await store?.removeLocal(view.name)
    await loadMeta()
    toast('已删除「' + view.name + '」')
    renderBody()
  }

  /* ---------- 挂载 ---------- */
  void load()
  ;(root as unknown as { __afDispose?: () => void }).__afDispose = () => {
    if (pollTimer) clearInterval(pollTimer)
  }
  return root
}

function localAvatarKey(view: AgentView): string {
  return 'local:' + view.name
}

function nowText(): string {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  return (channel, endpoint, payload, signal) =>
    (call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>)(channel, endpoint, payload, signal)
}

/** 压缩到头像尺寸（最长边 256px，JPEG 0.85）。 */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const MAX = 256
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx2d = canvas.getContext('2d')
        if (!ctx2d) throw new Error('canvas 不可用')
        ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}