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
import { firstViewCopy } from './first-view-copy'
import { skeletonEl, viewOf, type RowView } from './home-rows'
import { stageCrumbOpts, stageHead, stageList, type StageCtx } from './home-stage'
import type { PanelState } from './panel-data'
import type { SegHandle } from '../ui/segmented'

export interface PanelBodyDeps {
  state: PanelState
  bodyEl: HTMLElement
  getWorkspaces(): WorkspaceRef[]
  ops: FormOps & { connect(homeId: string, anchor: HTMLElement): void }
  onRetry(): void
  titleMetaEl?: HTMLElement
  seg?: SegHandle
  relayout?: () => void
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
  /** 上一次渲染的层级：只有**层级变化**才让液签滑动，重渲染/焦点变化一律瞬时落位（否则真机会抖）。 */
  let lastLevel: Level | null = null

  const view = (): RowView => viewOf(state.homes, state.assistants, state.bots, deps.getWorkspaces())
  const channelMode = (): boolean => state.mode === 'channel'
  const channels = (v: RowView): string[] => [...new Set(v.assistants.map((a) => a.channel))]

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
    slideTab(fresh, fresh.querySelector('.hu-tablk') as HTMLElement | null, true)
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
    if (!v.homes.length && state.loading) { root.appendChild(skeletonEl()); return }
    if (!v.homes.length && state.failed && !state.volatile) {
      const err = h('div', { className: 'hu-err' }, '家表读取失败：', state.error ? String(state.error) : '未知错误')
      const retry = h('button', { type: 'button' }, '重试')
      retry.addEventListener('click', () => deps.onRetry())
      err.appendChild(retry)
      root.appendChild(err)
      return
    }
    if (level !== 'L1' && !channelMode() && !v.homes.some((x) => x.id === selHome)) { level = 'L1'; selAsst = '' }
    if (level === 'L3' && !v.assistants.some((x) => x.id === selAsst)) level = 'L2'
    const sc = stage(v)
    const info = stageHead(sc)
    if (deps.seg) {
      const copy = firstViewCopy()
      deps.seg.setLabel('agent', copy.byAgent(v.homes.length))
      deps.seg.setLabel('channel', copy.byChannel(channels(v).length))
    }
    root.appendChild(headEl({
      level, title: info.title, sub: info.sub,
      onBack: () => go(level === 'L3' ? 'L2' : 'L1'),
      onAdd: () => openCreate(),
      onMore: () => undefined,
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
    slideTab(crumbs, crumbs.querySelector('.hu-tablk') as HTMLElement | null, lastLevel === null || lastLevel === level)
    lastLevel = level
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
