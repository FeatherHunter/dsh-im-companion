/** FleetPanel 视图层（T6a）：家→助理→单渠道机器人**三级钻取**，绿框真相源 = homes.json 新表。
 *
 * 结构照 T4 认可款原型 `prototypes/home-assistant/proto-studio.html`（owner 裁定 2026-10-13）：
 *   页头（返回 / 层级图标 / 标题副标 / ⋯ / ＋）→ 三级 chip 面包屑（液签）→ 行列表 → 底部主操作随层。
 * 导航＝钻取（点行进下一级），不是展开树；TAB/面包屑可向前钻取（跟随悬停或聚焦行）。
 * 旧 buildModel 列表退役（data/model.ts 保留：抽屉/徽标/会话头仍读它，verify 照旧）。
 * T6b #114／T6c #115：改名配图/占位绑定/删助理、换工作区/移除渠道已接线（删助理走 clean 版，防种子复活）。 */
import { h, clear } from '../dom'
import { OPEN_DRAWER_EVENT, type OpenDrawerDetail } from '../data/config'
import type { WorkspaceRef } from '../data/home-model'
import { crumbsEl, footEl, headEl, slideTab, topEl, type Level } from './home-frame'
import { newAsstPop, newHomePop, renameAsstPop, renameHomePop, avatarHomePop, type FormOps } from './home-forms'
import { bindAsstPop } from './home-bind-forms'
import { moveAsstPop, unbindAsstPop } from './home-move-forms'
import { orphanHomeAct } from './home-orphan-forms'
import { newAsstAct } from './home-create-act'
import type { MoveOps } from './home-move-ops'
import { closeHomePop } from './home-pop'
import { skeletonRows, viewOf, type RowView } from './home-rows'
import { hideAsstTip } from './home-row-tip'
import { stageCrumbOpts, stageHead, stageList, type StageCtx } from './home-stage'
import type { PanelState } from './panel-data'
import { logLine, logOn } from '../log'

export interface PanelBodyDeps {
  state: PanelState
  bodyEl: HTMLElement
  getWorkspaces(): WorkspaceRef[]
  ops: FormOps & MoveOps & { connect(homeId: string, anchor: HTMLElement, assistantId?: string, after?: (ok: boolean) => void): void }
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
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel.body', action: 'open-drawer', ok: false, message: '派发失败，抽屉打不开：' + String((e as Error)?.message ?? e) })
  }
}

export function createPanelBody(deps: PanelBodyDeps): PanelBodyHandle {
  const state = deps.state
  let level: Level = 'L1'
  let selHome = ''
  let selAsst = ''
  let selChannel = ''
  let focusId = ''
  let flashId = ''
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  const view = (): RowView => viewOf(state.homes, state.assistants, state.bots, deps.getWorkspaces())
  const channelMode = (): boolean => state.mode === 'channel'

  function flash(id: string): void {
    flashId = id
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashId = '' }, 320)
  }

  function go(next: Level, id?: string): void {
    if (next === 'L1') { level = 'L1'; focusId = '' }
    else if (next === 'L2') {
      if (channelMode()) selChannel = id ?? selChannel
      else selHome = id ?? selHome
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
    query: String(state.query ?? ''),
    channelMode: channelMode(),
    onGo: (next, id) => go(next, id),
    onOpen: (id) => go(level === 'L1' ? 'L2' : 'L3', id),
    onAct: (kind, id, anchor) => act(kind, id, anchor),
    /* owner 2026-10-17：铅笔**就地**改名——提交即落盘，不弹层（与家设置弹层同一条写路径）。 */
    onRenameHome: (id, value) => { void deps.ops.updateHome(id, { name: value }).then(() => render()) },
  })

  /** 锚点一律**现取**（T7 #112 真机 bug）：面板刷新会 clear 重建，捕获的元素随即游离、rect 全 0 ⇒ 弹层跳到窗口左上。
   * 底部主操作按类名现取；行动作优先用还活着的原按钮，被换掉后按 data-item-act/data-id 找回新的，找不到就收掉（绝不兜底跳位）。 */
  const live = (el: HTMLElement): boolean => (typeof el.isConnected === 'boolean' ? el.isConnected : !!el.parentNode)
  const anchorOf = (): HTMLElement | null => (deps.bodyEl.querySelector('.hu-pbtn') as HTMLElement | null) ?? null
  const actAnchor = (kind: string, id: string, btn: HTMLElement) => (): HTMLElement | null => {
    if (live(btn)) return btn
    const sel = `[data-item-act="${kind}"]` + (id ? `[data-id="${id}"]` : '')
    return (deps.bodyEl.querySelector(sel) as HTMLElement | null) ?? null
  }
  const liveAnchor = (btn: HTMLElement | null) => (): HTMLElement | null => (btn && live(btn) ? btn : null)

  /** 行动作（T6b #114＋T6c #115）：绑定 / 更换机器人 / 详情 / 改名与头像 / 删除（clean 版）/ 换工作区 / 移除渠道；
   * 状态对不上直接拒收（fail-closed）；每个前置拒收都落一条 ok:false＋原因——「点了没反应」必须能定位到被谁挡的。 */
  function act(kind: string, id: string, anchor: HTMLElement): void {
    const v = view()
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel.body', action: 'act:' + kind, ok: true, message: 'id=' + id })
    /* T10b #127 孤儿家两动作（选择工作区 / 删除家）：自成一文件，这里只留一行入口（本文件余量只剩这一行）。 */
    if (orphanHomeAct(kind, id, anchor, { view: v, ops: deps.ops, onDone: render })) return
    /* T13 #135 空家行「＋ 建助理」跨级入口：同款做法（自成一文件），新建完的落点与 L2 底部主按钮同一份。 */
    if (newAsstAct(kind, id, actAnchor(kind, id, anchor), { view: v, ops: deps.ops, onDone: createDone })) return
    if (kind === 'connect-a' || kind === 'connect') {
      const a = v.assistants.find((x) => x.id === id)
      if (a && a.status !== 'bound') {
        logLine('info', 'assistant.action', { action: 'connect', assistantId: id, ok: false, message: '助理还没绑定机器人，接入被拒收（fail-closed）' })
        return
      }
      /* #141：手上已经有 `a` 就必须把身份带下去——只传 homeId 会让接入落成「无主机器人」。 */
      deps.ops.connect(a ? a.homeId : selHome, anchor, a ? a.id : undefined)
    } else if (kind === 'detail-a') {
      const a = v.assistants.find((x) => x.id === id)
      const home = a ? v.homes.find((x) => x.id === a.homeId) : undefined
      emitDrawer(home ? home.path : '')
    } else if (kind === 'bind-a' || kind === 'change-a') {
      const a = v.assistants.find((x) => x.id === id)
      /* owner 2026-10-17：行上不再有「接入」——未绑定走「绑定机器人」（红档），已绑定走「更换机器人」（琥珀档）。
       * 两者开的是**同一张弹层**（挑空闲机器人或「新机器人」走全链路），差别只在状态与文案。 */
      if (!a || (a.status === 'bound') !== (kind === 'change-a')) {
        logLine('info', 'assistant.action', { action: 'bind', assistantId: id, ok: false, message: a ? (kind === 'change-a' ? '还没绑定机器人，没什么可更换' : '已经绑过机器人，无需再绑') : '助理不在表里（可能刚被删），绑定弹层不开' })
        return
      }
      bindAsstPop(actAnchor(kind, id, anchor), { view: v, ops: deps.ops, asstId: a.id, onDone: () => render() })
    } else if (kind === 'avatar-h') {
      /* owner 2026-10-17：行上的「更换头像」图标钮与**点头像本身**都落这里——一张纯换头像弹层。
       * 铅笔（rename-h）不再走弹层：它在行内**就地**改名（home-row-edit.renameField）。 */
      if (!v.homes.some((x) => x.id === id)) {
        logLine('info', 'home.action', { action: 'update', homeId: id, ok: false, message: '家不在表里（可能刚被删），换头像弹层不开' })
        return
      }
      avatarHomePop(actAnchor(kind, id, anchor), { view: v, ops: deps.ops, homeId: id, onDone: () => render() })
    } else if (kind === 'rename-a' || kind === 'more-asst') {
      if (!v.assistants.some((x) => x.id === id)) {
        logLine('info', 'assistant.action', { action: 'update', assistantId: id, ok: false, message: '助理不在表里（可能刚被删），设置弹层不开' })
        return
      }
      renameAsstPop(actAnchor(kind, id, anchor), { view: v, ops: deps.ops, asstId: id, onDone: () => render() })
    } else if (kind === 'remove-a') {
      void deps.ops.removeAssistant(id).then(() => render())
    } else if (kind === 'move-a') {
      const a = v.assistants.find((x) => x.id === id)
      if (!a) {
        logLine('info', 'assistant.action', { action: 'move', assistantId: id, ok: false, message: '助理不在表里（可能刚被删），搬家弹层不开' })
        return
      }
      moveAsstPop(actAnchor(kind, id, anchor), { view: v, ops: deps.ops, asstId: a.id, onDone: () => render() })
    } else if (kind === 'unbind-a') {
      const a = v.assistants.find((x) => x.id === id)
      if (!a || a.status !== 'bound') {
        logLine('info', 'assistant.action', { action: 'unbind', assistantId: id, ok: false, message: a ? '还没绑定机器人，无需移除渠道' : '助理不在表里（可能刚被删）' })
        return
      }
      unbindAsstPop(actAnchor(kind, id, anchor), { view: v, ops: deps.ops, asstId: a.id, onDone: () => render() })
    }
  }

  function openHomeSettings(anchor: HTMLElement): void {
    if (!selHome || !view().homes.some((x) => x.id === selHome)) {
      logLine('info', 'home.action', { action: 'update', homeId: selHome, ok: false, message: '没有选中的家（或它已不在表里），设置弹层不开' })
      return
    }
    renameHomePop(liveAnchor(anchor), { view: view(), ops: deps.ops, homeId: selHome, onDone: () => render() })
  }

  function openBindForL3(): void {
    const a = view().assistants.find((x) => x.id === selAsst)
    if (!a || a.status === 'bound') {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel.body', action: 'bind-for-l3', ok: false, message: a ? '已绑定，退回 L2' : '助理不在表里，退回 L2' })
      go('L2')
      return
    }
    bindAsstPop(anchorOf, { view: view(), ops: deps.ops, asstId: a.id, onDone: () => render() })
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

  /* 新建完成后的落点（建家→L2 落到新建的家；建助理→L3 落到最新那一位）：L2 底部主按钮与
   * L1 空家行的「＋ 建助理」跨级入口（T13 #135）**共用这一份**，语义不许两写。 */
  const createDone = (next: 'L2' | 'L3', homeId: string, workspaceId?: string): void => {
    const fresh = view()
    if (next === 'L2') {
      const created = fresh.homes.find((x) => x.workspaceId && x.workspaceId === workspaceId)
      selHome = created ? created.id : homeId
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
  }

  function openCreate(): void {
    if (level === 'L3') return
    const form = { view: view(), ops: deps.ops, selHome, lockHome: level === 'L2' && !channelMode(), onDone: createDone }
    if (channelMode() || level === 'L2') newAsstPop(anchorOf, form)
    else newHomePop(anchorOf, form)
  }

  function render(): void {
    /* 每次重画都换掉行 DOM：悬停气泡的锚点随旧芯片一起游离，先收（#136 左下角滞留即此漏）。 */
    hideAsstTip()
    const v = view()
    clear(deps.bodyEl)
    const root = h('div', { className: 'home-ui' })
    deps.bodyEl.appendChild(root)
    /* 首屏（家表未就绪）＝**同一副框架 + 等比例骨架行**：页头/面包屑/底部主操作照画，
     * 只有列表区是灰条 ⇒ 数据到位后只换列表，几何零跳动（owner 要求 2026-10-13）。
     * 曾经的「家表读取失败」横条会一闪而过：`state.failed` 是**失败端点数组**（空数组也 truthy），
     * 只要家表还没读完就会命中错误分支；现在未就绪一律骨架，读失败也不再往顶部塞横条。 */
    if (!state.homesReady) {
      const info = { title: '家', sub: '正在加载' }
      root.appendChild(topEl(headEl({ level: 'L1', title: info.title, sub: info.sub,
        onBack: () => go('L1'), onMore: () => undefined, actions: deps.headActions }),
        crumbsEl(stageCrumbOpts(stage(v)))))
      root.appendChild(skeletonRows())
      root.appendChild(footEl({ level: 'L1', bound: false, onPrimary: () => openCreate() }))
      return
    }
    if (level !== 'L1' && !channelMode() && !v.homes.some((x) => x.id === selHome)) { level = 'L1'; selAsst = '' }
    if (level === 'L3' && !v.assistants.some((x) => x.id === selAsst)) level = 'L2'
    const sc = stage(v)
    const info = stageHead(sc)
    const crumbs = crumbsEl(stageCrumbOpts(sc))
    root.appendChild(topEl(headEl({ level, title: info.title, sub: info.sub,
      onBack: () => go(level === 'L3' ? 'L2' : 'L1'), onMore: (a) => openHomeSettings(a),
      actions: deps.headActions }), crumbs))
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
        if (level === 'L3') { openBindForL3(); return }
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
