/** FleetPanel：A1 设置面板编排器（装配 数据/视图/动作 三模块；唯一有状态组件）。
 * 本文件只负责静态骨架、模块接线与生命周期；状态逻辑在 panel-data，渲染在 panel-body，手势在 panel-actions。 */
import { h } from '../dom'
import type { RpcCall } from '../data/fleet-api'
import type { AgentView, ViewMode } from '../data/model'
import { makeIconButton } from '../ui/button'
import { makeSearchField } from '../ui/field'
import { makeSegmented, type SegHandle } from '../ui/segmented'
import type { RowCallbacks } from './agent-row'
import { makeComposeBar } from './compose-bar'
import { createPanelActions } from './panel-actions'
import { createPanelBody } from './panel-body'
import { createPanelData } from './panel-data'

const TABS = [
  { id: 'agent', label: '按Agent' },
  { id: 'channel', label: '按渠道' },
] as const

export function FleetPanel(ctx: unknown): HTMLElement {
  const rpc: RpcCall | null = extractRpc(ctx)
  const data = createPanelData(rpc)

  /* ---------- 静态骨架 ---------- */
  const title = h('h1', { className: 'af-title' }, 'Agent')
  const titleMeta = h('div', { className: 'af-title-meta' }, '')
  const plusBtn = makeIconButton({ iconName: 'plus', label: '新建 Agent', title: '新建 Agent' })
  const hd = h('div', { className: 'af-hd' }, h('div', null, title, titleMeta), plusBtn)

  const search = makeSearchField((v) => {
    data.state.query = v
    bodyModule.render()
  })
  let seg: SegHandle
  seg = makeSegmented([...TABS], 'agent', (id) => {
    data.state.mode = id as ViewMode
    bodyModule.render()
  })
  const refreshBtn = makeIconButton({ iconName: 'refresh', label: '刷新', title: '立即刷新', onClick: () => void data.load(true) })
  const toolbar = h('div', { className: 'af-toolbar' }, search.el, seg.el, h('div', { style: { marginLeft: 'auto' } }, refreshBtn))
  const compose = makeComposeBar((name) => void actions.create(name))
  const body = h('div', { className: 'af-body' })
  const root = h('div', { className: 'af-root' }, hd, toolbar, compose.el, body)

  /* ---------- 模块接线 ---------- */
  const rowCallbacks = (): RowCallbacks => ({
    rename: (view: AgentView, next: string) => void actions.rename(view, next),
    connect: (view: AgentView, anchor: HTMLElement) => actions.connect(view, anchor),
    avatarMenu: (view: AgentView, anchor: HTMLElement) => actions.avatarMenu(view, anchor),
    pickWorkspace: (view: AgentView) => void actions.pickWorkspace(view),
    removeBot: (view: AgentView, channel: string, botId: string) => void actions.removeBot(view, channel, botId),
    deleteLocal: (view: AgentView) => void actions.removeLocal(view),
  })
  const actions = createPanelActions({
    ctx,
    rpc,
    getStore: data.store,
    getMeta: () => data.state.meta,
    refresh: () => data.load(true),
    loadMeta: data.loadMeta,
    render: () => bodyModule.render(),
  })
  const bodyModule = createPanelBody({
    state: data.state,
    bodyEl: body,
    titleMetaEl: titleMeta,
    seg,
    relayout: () => seg.relayout(),
    rowCallbacks,
    onRetry: () => void data.load(),
  })
  data.setRender(() => bodyModule.render())
  plusBtn.onclick = () => compose.setVisible(true)

  /* ---------- 生命周期 ---------- */
  let pollTimer: ReturnType<typeof setInterval> | undefined
  if (typeof setInterval !== 'undefined') {
    pollTimer = setInterval(() => void data.load(true), 15000)
  }
  void data.load()
  ;(root as unknown as { __afDispose?: () => void }).__afDispose = () => {
    if (pollTimer) clearInterval(pollTimer)
  }
  return root
}

function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  return (channel, endpoint, payload, signal) =>
    (call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>)(channel, endpoint, payload, signal)
}
