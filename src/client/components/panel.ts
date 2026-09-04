/** FleetPanel：A1 设置面板编排器（装配 数据/视图/动作 三模块；唯一有状态组件）。
 * 本文件只负责静态骨架、模块接线与生命周期；状态逻辑在 panel-data，渲染在 panel-body，手势在 panel-actions。
 * #26 赢家变体（D 拼装）：标题助理 + 副标、雷达说清语义、星标 P2 + 底部关联卡；轮询 / RPC / 数据语义一律不动。 */
import { h } from '../dom'
import type { RpcCall } from '../data/fleet-api'
import type { AgentView, ViewMode } from '../data/model'
import { FLEET_VIEW_EVENT, type FleetViewDetail } from '../data/config'
import { icon } from '../icons'
import { makeIconButton } from '../ui/button'
import { makeSearchField } from '../ui/field'
import { makeSegmented, type SegHandle } from '../ui/segmented'
import type { RowCallbacks } from './agent-row'
import { makeComposeBar } from './compose-bar'
import { firstViewCopy } from './first-view-copy'
import { installFirstViewStyles } from './first-view-styles'
import { createPanelActions } from './panel-actions'
import { createPanelBody } from './panel-body'
import { createPanelData } from './panel-data'

export function FleetPanel(ctx: unknown): HTMLElement {
  const rpc: RpcCall | null = extractRpc(ctx)
  const data = createPanelData(rpc)
  const copy = firstViewCopy()
  const stopFirstView = installFirstViewStyles()

  /* ---------- 静态骨架 ---------- */
  const title = h('h1', { className: 'af-title' }, copy.title)
  const sub = h('div', { className: 'af-title-sub' }, copy.sub)
  /* D 标题不独占行：计数行收起（计数看分段后缀），元素保留隐藏位供 body 兼容。 */
  const titleMeta = h('div', { className: 'af-title-meta' }, '')
  titleMeta.hidden = true
  const plusBtn = makeIconButton({ iconName: 'plus', label: copy.plus, title: copy.plus })
  /* P2 引流星标：ghost 虚线风，新开页跳 companion 仓库点 Star（右上角，＋原位）。 */
  const starLink = h('a', {
    className: 'af-icon-btn af-star',
    href: copy.starHref,
    target: '_blank',
    rel: 'noopener',
    title: copy.starTitle,
    'aria-label': copy.starTitle,
  }, icon('star', 18))
  const hd = h('div', { className: 'af-hd' }, h('div', null, title, sub, titleMeta), starLink)

  const search = makeSearchField((v) => {
    data.state.query = v
    bodyModule.render()
  })
  search.input.placeholder = copy.search
  search.input.setAttribute('aria-label', copy.searchAria)
  let seg: SegHandle
  seg = makeSegmented([
    { id: 'agent', label: copy.byAgent(0) },
    { id: 'channel', label: copy.byChannel(0) },
  ], 'agent', (id) => {
    data.state.mode = id as ViewMode
    bodyModule.render()
  })
  seg.el.setAttribute('aria-label', copy.segAria)
  const refreshBtn = makeIconButton({ iconName: 'refresh', label: copy.refresh, title: copy.refresh, onClick: () => void data.load(true) })
  /* 舰队雷达入口（#10 例外单 PR：只加按钮+事件派发，不引矩阵、不改 mode 语义；弹窗由矩阵特性自管）。 */
  const radarBtn = makeIconButton({
    iconName: 'ship', label: copy.radar, title: copy.radar,
    onClick: () => emitFleetView('radar'),
  })
  /* ＋ 进工具栏按钮组最左：新增、船、刷新（☆ 已搬右上角）。 */
  const toolbar = h('div', { className: 'af-toolbar' }, search.el, seg.el, h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '12px' } }, plusBtn, radarBtn, refreshBtn))
  const compose = makeComposeBar((name) => void actions.create(name))
  const body = h('div', { className: 'af-body' })
  /* P2 底部关联卡：名 + 一句话 + 右箭头，新开页（常驻；点击不记数）。 */
  const promo = h('div', { className: 'af-promo' },
    h('h4', { className: 'af-promo-title' }, copy.promoTitle),
    promoItem(copy.promoDeck, copy.promoDeckDesc, 'https://github.com/FeatherHunter/dsh-mattpocock-skills-deck'),
    promoItem(copy.promoPal, copy.promoPalDesc, 'https://github.com/FeatherHunter/dsh-opencode-palette'),
  )
  const root = h('div', { className: 'af-root' }, hd, toolbar, compose.el, body, promo)

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
    try {
      stopFirstView()
    } catch {
      /* 样式清理失败不影响卸载 */
    }
  }
  return root
}

function promoItem(name: string, desc: string, href: string): HTMLAnchorElement {
  return h('a', {
    className: 'af-promo-item',
    href,
    target: '_blank',
    rel: 'noopener',
  }, h('b', null, name), h('span', null, desc), h('i', null, '›'))
}

function emitFleetView(view: FleetViewDetail['view']): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent<FleetViewDetail>(FLEET_VIEW_EVENT, { detail: { view } }))
  } catch {
    /* 派发失败不影响列表 */
  }
}

function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  return (channel, endpoint, payload, signal) =>
    (call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>)(channel, endpoint, payload, signal)
}
