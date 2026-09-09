/** FleetPanel：A1 设置面板编排器（装配 数据/视图/动作 三模块；唯一有状态组件）。
 * 本文件只负责静态骨架、模块接线与生命周期；状态逻辑在 panel-data，渲染在 panel-body，手势在 panel-actions。
 * #26 赢家变体（D 拼装）：标题助理 + 副标、雷达说清语义、星标 P2 + 底部关联卡；轮询 / RPC / 数据语义一律不动。 */
import { h } from '../dom'
import type { RpcCall } from '../data/fleet-api'
import { dualTransportCall } from '../data/rpc'
import type { AgentView, ViewMode } from '../data/model'
import { ADOPT_VIEW_EVENT, FLEET_VIEW_EVENT, type FleetViewDetail } from '../data/config'
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
import { WORKSPACE_PICKER_COPY, ctxNativePicker, openDirPicker } from '../ui/dir-picker'

/* #56：构建注入的插件版本（tsdown define __PLUGIN_VERSION__，package.json 唯一真相）。 */
declare const __PLUGIN_VERSION__: string | undefined

function pluginVersion(): string {
  try {
    if (typeof __PLUGIN_VERSION__ === 'string' && __PLUGIN_VERSION__) return __PLUGIN_VERSION__
  } catch {
    /* 无注入环境（单测直引源码）回退空串，调用方隐藏版本位 */
  }
  return ''
}

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
  /* #56 右上组（对标 deck SettingsPage：版本小字可点跳仓库 + Star/Issue 双按钮；右组 margin-left:auto，窄窗换行）。 */
  const ver = pluginVersion()
  const verLink = h('a', {
    className: 'af-version',
    href: copy.starHref,
    target: '_blank',
    rel: 'noopener',
    title: copy.versionTitle(ver),
    'aria-label': copy.versionTitle(ver),
  }, ver)
  verLink.hidden = ver === ''
  /* P2 引流星标：ghost 虚线风，新开页跳 companion 仓库点 Star（右上角，＋原位）。 */
  const starLink = h('a', {
    className: 'af-icon-btn af-star',
    href: copy.starHref,
    target: '_blank',
    rel: 'noopener',
    title: copy.starTitle,
    'aria-label': copy.starTitle,
  }, icon('star', 18))
  const feedbackLink = h('a', {
    className: 'af-icon-btn af-star',
    href: copy.feedbackHref,
    target: '_blank',
    rel: 'noopener',
    title: copy.feedbackTitle,
    'aria-label': copy.feedbackTitle,
  }, icon('feedback', 18))
  const hdRight = h('div', { className: 'af-hd-right' }, verLink, starLink, feedbackLink)
  const hd = h('div', { className: 'af-hd' }, h('div', null, title, sub, titleMeta), hdRight)

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
  /* 串门搬家入口（舰队同款事件制：只加按钮+事件派发，不引 adopt 特性；面板由 adopt 特性自管）。 */
  const adoptBtn = makeIconButton({
    iconName: 'home', label: copy.adopt, title: copy.adopt,
    onClick: () => emitAdoptView(),
  })
  /* ＋ 进工具栏按钮组最左：新增、船、串门搬家、刷新（☆ 已搬右上角）。 */
  const toolbar = h('div', { className: 'af-toolbar' }, search.el, seg.el, h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '12px' } }, plusBtn, radarBtn, adoptBtn, refreshBtn))
  /* #62 创建即选家：表单自带工作区选择器，创建编排原子落家（addLocal＋落家＋记名）。
   * 建完即收由表单按编排返回值决定（成功关、失败留单保现场）。 */
  const compose = makeComposeBar(
    (name, ws) => actions.create(name, ws),
    { pickWorkspace: () => openDirPicker(rpc, '', ctxNativePicker(ctx), WORKSPACE_PICKER_COPY).promise },
  )
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

  /* ---------- 生命周期（#17：轮询归共享 stream，面板只订阅 + dispose 退订） ---------- */
  void data.load()
  ;(root as unknown as { __afDispose?: () => void }).__afDispose = () => {
    try {
      data.dispose()
    } catch {
      /* 清理失败忽略 */
    }
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

function emitAdoptView(): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent(ADOPT_VIEW_EVENT))
  } catch {
    /* 派发失败不影响列表 */
  }
}

function extractRpc(ctx: unknown): RpcCall | null {
  const conn = (ctx as { connection?: { rpc?: { call?: unknown } } } | null)?.connection
  const call = conn?.rpc?.call
  if (typeof call !== 'function') return null
  /* T4 原型（#76）：翻译与 data/rpc.ts 合一（dualTransportCall），本副本只剩壳。 */
  const raw = call as (ch: string, ep: string, p: Record<string, unknown>, s: AbortSignal) => Promise<unknown>
  return (channel, endpoint, payload, signal) => dualTransportCall(raw, channel, endpoint, payload, signal)
}
