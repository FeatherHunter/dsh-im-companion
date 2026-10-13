/** FleetPanel：A1 设置面板编排器（装配 数据/视图/动作 三模块；唯一有状态组件）。
 * 本文件只负责静态骨架、模块接线与生命周期；状态逻辑在 panel-data，渲染在 panel-body，手势在 panel-actions。
 * #26 赢家变体（D 拼装）：标题助理 + 副标、雷达说清语义、星标 P2 + 底部关联卡；轮询 / RPC / 数据语义一律不动。 */
import { h } from '../dom'
import type { RpcCall } from '../data/fleet-api'
import { extractRpcV2 as extractRpc } from '../data/rpc'
import type { ViewMode } from '../data/model'
import { ADOPT_VIEW_EVENT, FLEET_VIEW_EVENT, UPDATE_CENTER_HOST_EVENT, type FleetViewDetail, type UpdateCenterHostDetail } from '../data/config'
import { icon } from '../icons'
import { makeIconButton } from '../ui/button'
import { makeSearchField } from '../ui/field'
import { makeSegmented, type SegHandle } from '../ui/segmented'
import { toast } from '../ui/toast'
import { firstViewCopy } from './first-view-copy'
import { installFirstViewStyles } from './first-view-styles'
import { installHomeUiStyles } from './home-ui-styles'
import { createPanelBody } from './panel-body'
import { createPanelData } from './panel-data'
import type { WorkspaceRef } from '../data/home-model'
import { createDrillOps } from './home-ops'

/* #56：构建注入的插件版本（tsdown define __PLUGIN_VERSION__，package.json 唯一真相）。 */
declare const __PLUGIN_VERSION__: string | undefined
/* #78：构建注入的 dsh-im 兼容信息（tsdown define __DSH_IM_COMPAT__，package.json.dshImCompat 唯一真相）。 */
declare const __DSH_IM_COMPAT__: { verified?: string; range?: string } | undefined

function pluginVersion(): string {
  try {
    if (typeof __PLUGIN_VERSION__ === 'string' && __PLUGIN_VERSION__) return __PLUGIN_VERSION__
  } catch {
    /* 无注入环境（单测直引源码）回退空串，调用方隐藏版本位 */
  }
  return ''
}

/** #78 已验证 dsh-im 版本（无注入环境回退空，chip 隐藏；绝不硬编码版本号）。 */
function pluginCompat(): { verified: string; range: string } {
  try {
    const c = typeof __DSH_IM_COMPAT__ === 'object' && __DSH_IM_COMPAT__ !== null ? __DSH_IM_COMPAT__ : undefined
    if (c) return { verified: String(c.verified ?? ''), range: String(c.range ?? '') }
  } catch {
    /* 同上 */
  }
  return { verified: '', range: '' }
}

export function FleetPanel(ctx: unknown): HTMLElement {
  const rpc: RpcCall | null = extractRpc(ctx)
  const data = createPanelData(rpc)
  const copy = firstViewCopy()
  const stopFirstView = installFirstViewStyles()
  const stopHomeStyles = installHomeUiStyles()

  /* ---------- 静态骨架 ---------- */
  const title = h('h1', { className: 'af-title' }, copy.title)
  /* #82：副标（IM COMPANION · 辅助插件）整行删除——548px 宽实测单行塞不下，让位给标题与两色版本胶囊。 */
  /* D 标题不独占行：计数行收起（计数看分段后缀），元素保留隐藏位供 body 兼容。 */
  const titleMeta = h('div', { className: 'af-title-meta' }, '')
  titleMeta.hidden = true
  /* 旧面板遗留的工具栏 ＋ 已退场（T6a 重做）：绿框自带页头 ＋（随层新建家/新建助理）
   * 与底部上下文主操作，同一个动作不再有第三个入口。 */
  /* #56 右上组（对标 deck SettingsPage：版本小字可点跳仓库 + Star/Issue 双按钮）。
   * #78 版本组：自家版本 + 兼容标记（dsh-im）同行成组；
   * #82 改「两色胶囊」——颜色即身份（用户裁定）：紫=自家 / 蓝白=兼容的 dsh-im，
   * 文案只留轴名 + 版本号（前缀「兼容 / IM Companion」进悬停）。
   * 宿主 dsh 胶囊已删（用户裁定 2026-10-01）：宿主兼容口径只留 README 兼容性小节与市场徽章（engines.dsh），面板不再标。
   * 宽度实测（548px 内容宽）：中 497px / 英 522px，余量 ≥26px → 顶部单行零省略。 */
  const ver = pluginVersion()
  const compat = pluginCompat()
  const verLink = h('a', {
    className: 'af-cap af-cap--self',
    href: copy.starHref,
    target: '_blank',
    rel: 'noopener',
    title: copy.versionTitle(ver),
    'aria-label': copy.versionTitle(ver),
  }, ver)
  verLink.hidden = ver === ''
  const compatNote = compat.verified ? copy.compatTitle(compat.verified, compat.range) : ''
  const compatChip = compat.verified
    ? h('a', {
        className: 'af-cap af-cap--im',
        href: copy.compatHref,
        target: '_blank',
        rel: 'noopener',
        title: compatNote,
        'aria-label': compatNote,
      }, copy.compatChip(compat.verified))
    : null
  const verBox = h('div', { className: 'af-verbox' }, verLink, compatChip)
  /* T6（#89）更新中心挂载点：A1 只暴露一个空容器 + 广播（不引 update-center 特性，T8 自挂自管）。
   * 类名走契约 §6 前缀约定（<feature>-*，故 update-center-host）。
   * id 必须保留（R8 P0-b）：该事件**无重放**，热重载 / 事件顺序倒置时会漏掉 {host}；
   * 故面板每次渲染都产出这个稳定 id，T8 可在 mount 末尾用 document.getElementById('imc-update-center')
   * **主动认领**已存在的容器——id 就是那个认领把手，删了 T8 只能靠猜。
   * owner 2026-10-10 裁定：从「工具栏之后、撰写条之前」挪到**页头右上组、star 左侧**
   * （原 2026-09-12 位置作废）。仍只挪这一个空容器节点：类名 / id / 派发 / 特性侧零改。 */
  const updateCenterHost = h('div', { id: 'imc-update-center', className: 'update-center-host', style: 'min-width:0' })
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
  /* 页头是**防御性布局**：标题是身份（不许被压），徽标带是可伸缩区（放不下就整组换行）。
   * 真机事故（2026-10-13）：更新失败横幅 + 两枚版本胶囊把「IM机器人增强」压成「IM 机器人⋯」——
   * 附加信息有能力破坏主内容 ⇒ 这里反过来：标题 flex:0 0 auto，右侧组 flex:0 1 auto + 可换行。 */
  const hdRight = h('div', { className: 'af-hd-right', style: 'flex:0 1 auto;min-width:0;margin-left:auto' }, verBox, updateCenterHost, starLink, feedbackLink)
  const hd = h('div', { className: 'af-hd', style: 'flex-wrap:wrap;row-gap:6px' },
    h('div', { className: 'af-hd-left', style: 'flex:0 0 auto;min-width:0' }, title, titleMeta), hdRight)

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
  const refreshBtn = makeIconButton({ iconName: 'refresh', label: copy.refresh, title: copy.refresh, onClick: () => void refreshAll() })
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
  /* 工具栏只留「船 / 串门搬家 / 刷新」：＋ 已退场（绿框页头 ＋ 与底部主操作接管建单）。 */
  const toolbar = h('div', { className: 'af-toolbar' }, search.el, seg.el, h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '12px' } }, radarBtn, adoptBtn, refreshBtn))
  /* T6a 钢线：＋ 按当前钻取层级开建单（L1 建家选已有区 / L2 建助理选绑机器人）；
   * 旧 compose 新建条（LocalAgent）退役，文件保留供 connect-qr 回归钉。 */
  const body = h('div', { className: 'af-body' })
  /* P2 底部关联卡：名 + 一句话 + 右箭头，新开页（常驻；点击不记数）。 */
  const promo = h('div', { className: 'af-promo' },
    h('h4', { className: 'af-promo-title' }, copy.promoTitle),
    promoItem(copy.promoDeck, copy.promoDeckDesc, 'https://github.com/FeatherHunter/dsh-mattpocock-skills-deck'),
    promoItem(copy.promoPal, copy.promoPalDesc, 'https://github.com/FeatherHunter/dsh-opencode-palette'),
  )
  /* T6（#89）更新中心挂载点原位置（工具栏之后、撰写条之前）已作废：容器改建在页头右上组里（见上）。
   * root 序列回归 hd → toolbar → body → promo，A1 对本特性仍是零感知。 */
  const root = h('div', { className: 'af-root' }, hd, toolbar, body, promo)

  emitUpdateCenterHost(updateCenterHost)

  /* ---------- 模块接线 ---------- */
  /* 宿主工作区全名单（adopt/panel.ts listHomes 同款 ctx.get 惰性读法；取不到按空名单，种子跳过）。 */
  const getWorkspaces = (): WorkspaceRef[] => {
    try {
      const get = (ctx as { get?: (n: string) => unknown } | null)?.get
      if (typeof get !== 'function') return []
      const svc = get('workspaces') as { list?: { getSnapshot?: () => { items?: { workspaceId?: unknown; path?: unknown; title?: unknown }[] } } } | null
      const items = svc?.list?.getSnapshot?.()?.items
      if (!Array.isArray(items)) return []
      const out: WorkspaceRef[] = []
      for (const it of items) {
        const workspaceId = String(it?.workspaceId ?? '')
        const path = String(it?.path ?? '')
        const title = String(it?.title ?? '')
        if (workspaceId && path && !out.some((w) => w.workspaceId === workspaceId)) out.push({ workspaceId, path, title })
      }
      return out
    } catch {
      return []
    }
  }
  async function refreshAll(): Promise<void> {
    await data.load(true)
    await data.loadHomes(getWorkspaces)
  }
  /* 旧动作层（panel-actions：改名/选家/移除/头像）文件冻结保留供 connect-qr 回归；
   * 绿框写管道（建家/建助理绑机器人/接入）下沉 home-ops（本文件只接线，单真相源＝家表）。 */
  const bodyModule = createPanelBody({
    state: data.state,
    bodyEl: body,
    titleMetaEl: titleMeta,
    seg,
    relayout: () => seg.relayout(),
    getWorkspaces,
    ops: createDrillOps({
      ctx,
      getRpc: () => rpc,
      getWorkspaces,
      getHome: (id) => data.state.homes.find((x) => x.id === id),
      getBot: (channel, botId) => data.state.bots.find((b) => b.channel === channel && b.botId === botId),
      refresh: () => data.load(true),
      reloadHomes: () => data.loadHomes(getWorkspaces),
    }),
    onRetry: () => void refreshAll(),
  })
  data.setRender(() => bodyModule.render())

  /* ---------- 生命周期（#17：轮询归共享 stream，面板只订阅 + dispose 退订） ---------- */
  /* 顺序化首屏：先 load（拿到 bots+meta）再 loadHomes（种子一次到位，助理行不等下一轮 15s 轮询）。
   * 两者并发会造出「有家无助理」的空窗（T6a 验证抓到）。 */
  void data.load()
    .then(() => data.loadHomes(getWorkspaces))
    .then(() => bodyModule.render())
    .catch(() => bodyModule.render())
  ;(root as unknown as { __afDispose?: () => void }).__afDispose = () => {
    emitUpdateCenterHost(null)
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
    try {
      stopHomeStyles()
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

/* T6（#89）挂载点：事件名单点真相在 data/config.ts（feature 只读该导出，不引本私有文件）；
 * detail.host 非空＝可挂载容器（面板骨架建好即广播），host＝null＝面板已卸载，特性须回收（退订／清定时器／清 DOM）；
 * detail 形状见 UpdateCenterHostDetail（config.ts），与 FLEET_VIEW_EVENT 处同款写法给 CustomEvent 带上类型参数。 */
function emitUpdateCenterHost(host: HTMLElement | null): void {
  try {
    if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent<UpdateCenterHostDetail>(UPDATE_CENTER_HOST_EVENT, { detail: { host } }))
    }
  } catch { /* 派发失败不影响面板 */ }
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

/* T5（#77 终审返工 F1）：本地 extractRpc 副本已删，直引 data/rpc.extractRpcV2（as 别名，调用点签名零动）；
 * 无循环依赖——data/rpc 值依赖为零（仅 type 引 fleet-api，编译期擦除），本文件复用既有 ../data/rpc 边，无新增模块边。 */
