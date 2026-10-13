/** FleetPanel 视图层（T6a）：家→助理→单渠道机器人**三级钻取**，绿框真相源 = homes.json 新表。
 *
 * 结构照 T4 认可款原型 `prototypes/home-assistant/proto-studio.html`（owner 裁定 2026-10-13）：
 *   页头（返回 / 层级图标 / 标题副标 / ⋯ / ＋）→ 三级 chip 面包屑（液签）→ 行列表 → 底部主操作随层。
 * 导航＝钻取（点行进下一级），不是展开树；TAB/面包屑可向前钻取（跟随悬停或聚焦行）。
 * 旧 buildModel 列表退役（data/model.ts 保留：抽屉/徽标/会话头仍读它，verify 照旧）。
 * T6a 只做「建家选已有区 + 建助理选绑机器人 + 三级呈现」；T6b/T6c 的钮照原型画出但禁用。 */
import { h, clear } from '../dom'
import { OPEN_DRAWER_EVENT, type OpenDrawerDetail } from '../data/config'
import type { WorkspaceRef } from '../data/home-model'
import { crumbsEl, footEl, headEl, slideTab, type Level } from './home-frame'
import { newAsstPop, newHomePop, type FormOps } from './home-forms'
import { closeHomePop } from './home-pop'
import { skeletonRows, viewOf, type RowView } from './home-rows'
import { stageCrumbOpts, stageHead, stageList, type StageCtx } from './home-stage'
import type { PanelState } from './panel-data'

export interface PanelBodyDeps {
  state: PanelState
  bodyEl: HTMLElement
  getWorkspaces(): WorkspaceRef[]
  ops: FormOps & { connect(homeId: string, anchor: HTMLElement): void }
  onRetry(): void
  titleMetaEl?: HTMLElement
  /** 面板级动作簇（船 / 串门搬家 / 刷新）由装配层交进来，放进绿框页头右侧与 ＋ 同行。 */
  headActions?: HTMLElement | null
}

export interface PanelBodyHandle {
  render(): void
  openCreate(): void
  dispose(): void
}

function emitDrawer(key: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    const detail: OpenDrawerDetail = { key }
    window.dispatchEvent(new window.CustomEvent(OPEN_DRAWER_EVENT, { detail }))
  } catch { /* 派发失败静默 */ }
}

export function createPanelBody(deps: PanelBodyDeps): PanelBodyHandle {
  const state = deps.state
  let level: Level = 'L1'
  let selHome = ''
  let selAsst = ''
  let selChannel = ''
  let focusId = ''
  let flashId = ''
  /** L1「N 个空家」折叠态（呈现策略：0 助理的家收在尾部，默认不展开）。 */
  let showEmpty = false
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  const view = (): RowView => viewOf(state.homes, state.assistants, state.bots, deps.getWorkspaces())
  const channelMode = (): boolean => state.mode === 'channel'

  function flash(id: string): void {
    flashId = id
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashId = '' }, 320)
  }

  /** 选中的家若是空家 ⇒ 自动展开折叠段（否则刚建的家/刚钻进去的家看不见）。 */
  function revealHome(id: string): void {
    if (id && !state.assistants.some((a) => a.homeId === id)) showEmpty = true
  }

  function go(next: Level, id?: string): void {
    if (next === 'L1') { level = 'L1'; focusId = '' }
    else if (next === 'L2') {
      if (channelMode()) selChannel = id ?? selChannel
      else { selHome = id ?? selHome; revealHome(selHome) }
      selAsst = ''
      level = 'L2'
      focusId = ''
    } else if (next === 'L3' && id) {
      const a = state.assistants.find((x) => x.id === id)
      if (!a) return
      selAsst = id
      selHome = a.homeId
      level = 'L3'
      focusId = ''
    }
    closeHomePop(true)
    render()
  }

  /** 舞台上下文：把状态机当前值交给 home-stage（页头/面包屑/列表都是纯函数）。 */
  const stage = (v: RowView): StageCtx => ({
    view: v,
    level,
    selHome,
    selAsst,
    selChannel,
    focusId,
    flashId,
    showEmpty,
    query: String(state.query ?? ''),
    channelMode: channelMode(),
    onGo: (next, id) => go(next, id),
    onOpen: (id) => go(level === 'L1' ? 'L2' : 'L3', id),
    onAct: (kind, id, anchor) => act(kind, id, anchor),
    onToggleEmpty: () => { showEmpty = !showEmpty; render() },
  })

  /** 行动作：接入（dsh-im 渠道 RPC）/ 详情（抽屉事件，key=工作区路径）。 */
  function act(kind: string, id: string, anchor: HTMLElement): void {
    const v = view()
    if (kind === 'connect-a' || kind === 'connect') {
      const a = v.assistants.find((x) => x.id === id)
      deps.ops.connect(a ? a.homeId : selHome, anchor)
    } else if (kind === 'detail-a') {
      const a = v.assistants.find((x) => x.id === id)
      const home = a ? v.homes.find((x) => x.id === a.homeId) : undefined
      emitDrawer(home ? home.path : '')
    }
  }

  function setFocus(id: string): void {
    if (focusId === id) return
    focusId = id
    const box = deps.bodyEl.querySelector('.hu-crumbs') as HTMLElement | null
    if (!box || !box.parentNode) return
    const fresh = crumbsEl(stageCrumbOpts(stage(view())))
    box.parentNode.replaceChild(fresh, box)
    /* 焦点只改 chip 文案，当前层没变 ⇒ 液签目标同点，FLIP 起止重合 ⇒ 零位移不抖（见 home-frame.slideTab）。 */
    slideTab(fresh, fresh.querySelector('.hu-tablk') as HTMLElement | null)
  }

  function openCreate(): void {
    if (level === 'L3') return
    const v = view()
    const anchor = (deps.bodyEl.querySelector('.hu-pbtn') as HTMLElement | null) ?? null
    const form = { view: v, ops: deps.ops, selHome, onDone: (next: 'L2' | 'L3', homeId: string, workspaceId?: string) => {
      const fresh = view()
      if (next === 'L2') {
        const created = fresh.homes.find((x) => x.workspaceId && x.workspaceId === workspaceId)
        selHome = created ? created.id : homeId
        showEmpty = true
        flash(selHome)
      } else {
        selHome = homeId
        const list = fresh.assistants.filter((a) => a.homeId === homeId)
        const newest = list.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]
        selAsst = newest ? newest.id : ''
        if (selAsst) flash(selAsst)
      }
      level = next
      render()
    } }
    if (channelMode() || level === 'L2') newAsstPop(anchor, form)
    else newHomePop(anchor, form)
  }

  function render(): void {
    const v = view()
    clear(deps.bodyEl)
    const root = h('div', { className: 'home-ui' })
    deps.bodyEl.appendChild(root)
    /* 首屏（家表未就绪）＝**同一副框架 + 等比例骨架行**：页头/面包屑/底部主操作照画，
     * 只有列表区是灰条 ⇒ 数据到位后只换列表，几何零跳动（owner 要求 2026-10-13）。
     * 曾经的「家表读取失败」横条会一闪而过：`state.failed` 是**失败端点数组**（空数组也 truthy），
     * 只要家表还没读完就会命中错误分支；现在未就绪一律骨架，读失败也不再往顶部塞横条。 */
    if (!state.homesReady) {
      const info = { title: '家', sub: '正在读取家表…' }
      root.appendChild(headEl({
        level: 'L1', title: info.title, sub: info.sub,
        onBack: () => go('L1'), onMore: () => undefined,
        actions: deps.headActions,
      }))
      root.appendChild(crumbsEl(stageCrumbOpts(stage(v))))
      root.appendChild(skeletonRows())
      root.appendChild(footEl({ level: 'L1', bound: false, onPrimary: () => openCreate() }))
      return
    }
    if (level !== 'L1' && !channelMode() && !v.homes.some((x) => x.id === selHome)) { level = 'L1'; selAsst = '' }
    if (level === 'L3' && !v.assistants.some((x) => x.id === selAsst)) level = 'L2'
    const sc = stage(v)
    const info = stageHead(sc)
    root.appendChild(headEl({
      level, title: info.title, sub: info.sub,
      onBack: () => go(level === 'L3' ? 'L2' : 'L1'),
      onMore: () => undefined,
      actions: deps.headActions,
    }))
    const crumbs = crumbsEl(stageCrumbOpts(sc))
    root.appendChild(crumbs)
    if (state.volatile) {
      const warn = h('div', { className: 'hu-err' }, '家表未落盘（宿主半尚未重载）：当前为临时呈现，重载插件后即持久化。')
      const retry = h('button', { type: 'button' }, '重试')
      retry.addEventListener('click', () => deps.onRetry())
      warn.appendChild(retry)
      root.appendChild(warn)
    }
    const list = stageList(sc)
    root.appendChild(list)
    root.appendChild(footEl({
      level,
      bound: level === 'L3' && (v.assistants.find((x) => x.id === selAsst)?.status === 'bound'),
      onPrimary: () => {
        if (level === 'L3') { go('L2'); return }
        openCreate()
      },
    }))
    slideTab(crumbs, crumbs.querySelector('.hu-tablk') as HTMLElement | null)
    const rowEls = list.querySelectorAll('.hu-row')
    for (let i = 0; i < rowEls.length; i += 1) {
      const row = rowEls[i] as HTMLElement
      const id = row.getAttribute('data-id') ?? ''
      row.addEventListener('pointerover', () => setFocus(id))
      row.addEventListener('focusin', () => setFocus(id))
    }
    if (flashId && flashTimer) { /* 闪光由 class 表达，定时器只负责清除 */ }
  }

  return {
    render,
    openCreate,
    dispose: () => { closeHomePop(true); if (flashTimer) clearTimeout(flashTimer) },
  }
}
