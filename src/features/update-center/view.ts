/** update-center 视图（owner 2026-09-12 二次裁定：仿 dsh-im —— 面板上只留**一个「检查更新」按钮** + 一行状态；
 * 点击即检查，结果**直接出弹窗**（版本 / 更新说明 / 安装 / 手工命令都在 dialog.ts 那一窗里）。
 * 自动检查开关与档位（settings.ts）按 owner 要求留在原位置。
 * 三条硬约束原样保留：P0-a mount() 不读 ctx.meta；P0-b 事件无重放 ⇒ 末尾主动认领容器；P1-c 每次 attach 重拉一次状态。 */
import { clear, h, mount } from '../../client/dom'
import { UPDATE_CENTER_HOST_EVENT, type UpdateCenterHostDetail } from '../../client/data/config'
import type { FeatureCtx } from '../protocol'
import { openChangelog } from './changelog'
import { WINDOW_TIMER, createUpdateStore, type UpdateStore, type UiState } from './data'
import { openCheckDialog } from './dialog'
import { failingOf, snapshotOf, type UpdateSnapshot } from './phone'
import { reasonText } from './reasons'
import { buildSettings } from './settings'
import { lastCheckText } from './text'

const HOST_ID = 'imc-update-center'

const v = (x: string | null): string => (x ? 'v' + x : '未知版本')
const span = (cls: string, text: string): HTMLSpanElement => {
  const node = h('span', { className: cls })
  node.textContent = text
  return node
}
const button = (label: string, cls: string, disabled = false): HTMLButtonElement => {
  const b = h('button', { className: 'update-center-btn ' + cls, type: 'button' })
  b.textContent = label
  if (disabled) b.disabled = true
  return b
}

interface Handlers {
  check(): void
  install(): void
  toggle(): void
  interval(hours: number): void
  openNotes(version: string | null): void
}

/** 待重启横幅：常驻置顶、不可关闭（关掉弹窗后它仍在）。 */
function buildBanner(state: UiState, snap: UpdateSnapshot | null): HTMLElement | null {
  if (state !== 'restart') return null
  const target = snap?.latestVersion ?? snap?.installedVersion ?? null
  return h('div', { className: 'update-center-banner', role: 'status' },
    span('update-center-banner-icon', '⚠️'),
    span('update-center-banner-text', '新版本 ' + v(target) + ' 已装好，重启宿主后生效'))
}

/** 一行状态：主状态 + 中点 + 元信息（元信息更淡；版本号不与顶部胶囊重复）。 */
function statusNodes(state: UiState, snap: UpdateSnapshot | null, store: UpdateStore): HTMLElement[] {
  const dot = (): HTMLSpanElement => span('update-center-dot', '·')
  if (state === 'installing') {
    const target = snap?.job?.targetVersion ?? snap?.latestVersion ?? null
    const txt = snap?.job?.state === 'verifying' ? '正在校验 ' + v(target) + '…' : '正在安装 ' + v(target) + '…'
    return [span('update-center-status', txt), span('update-center-spin', '')]
  }
  if (state === 'restart') {
    return [span('update-center-status', '待重启'), dot(),
      span('update-center-meta', v(snap?.latestVersion ?? snap?.installedVersion ?? null) + ' 已装好')]
  }
  if (state === 'blocked') {
    return [span('update-center-status', '装不了'), dot(), span('update-center-meta', reasonText(blockedOf(store)))]
  }
  if (state === 'update') return [span('update-center-status', '有新版本 ' + v(snap?.latestVersion ?? null))]
  if (state === 'failed') return [span('update-center-meta', '自动检查暂时不可用，可手动检查')]
  if (state === 'unavailable') return [span('update-center-meta', '暂时查不到更新状态')]
  /* latest：主状态只说"已是最新"（版本号在顶部胶囊里）；「最近检查」只在本会话真的查过时才出现——
   * checkedAt 是会话内的，刷新即归零，若无条件显示就会与"已是最新"并列成自相矛盾的一句。 */
  const out = [span('update-center-status', '已是最新')]
  const at = store.lastCheckAt()
  if (at !== null) {
    out.push(dot())
    out.push(span('update-center-meta', '最近检查 ' + lastCheckText(at, Date.now())))
  }
  return out
}
function blockedOf(store: UpdateStore): string | null {
  const res = store.result()
  if (res === null) return null
  return res.ok ? res.snapshot.blockedReason : res.token
}

/** 唯一的动作：检查更新（在途变「检查中…」并禁用）。 */
function buildCheckButton(hd: Handlers, busy: boolean): HTMLButtonElement {
  const b = button(busy ? '检查中…' : '检查更新', 'update-center-secondary', busy)
  b.addEventListener('click', hd.check)
  return b
}

/** 失败灰字：显示条件唯一来源是 autoCheck.failing === true（初值 false ⇒ 新装用户看不到它）。 */
function buildFailLine(state: UiState, store: UpdateStore, hd: Handlers): HTMLElement | null {
  const res = store.result()
  if (state === 'failed' || !failingOf(res)) return null
  const last = res !== null && res.ok && res.autoCheck ? res.autoCheck.lastFailureAt : null
  const row = h('div', { className: 'update-center-fail' },
    span('update-center-fail-text', '自动检查暂时不可用，可手动检查' +
      (last === null ? '' : '（最后尝试：' + lastCheckText(last, Date.now()) + '）')))
  const retry = button('重试', 'update-center-link')
  retry.addEventListener('click', hd.check)
  row.appendChild(retry)
  return row
}

/** 容器认领（P0-b：事件无重放 ⇒ 主动找已存在的挂载点，不依赖事件到达顺序）。 */
function claimHost(): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    return document.getElementById(HOST_ID)
  } catch {
    return null
  }
}

/** 特性挂载：注册 {host} 监听 + 同步认领既有容器；所有宿主读取都在回调里发生（P0-a）。 */
export function mountUpdateCenter(ctx: FeatureCtx): () => void {
  let store: UpdateStore | null = null
  let host: HTMLElement | null = null
  let unsub: (() => void) | null = null
  let closeDialog: (() => void) | null = null

  function paint(): void {
    if (host === null || store === null) return
    const s = store
    const snap = snapshotOf(s.result())
    const state = s.state()
    const busy = s.checking()
    const hd: Handlers = {
      check: () => {
        void s.check().then(() => {
          // 单一交互：点了就出弹窗（查到新版 / 已是最新 / 失败 都在同一窗里给结论，不再只弹说明）。
          openDialog(s, hd)
        })
      },
      install: () => { void s.install() },
      toggle: () => { void s.setPrefs({ autoCheckEnabled: s.prefs().autoCheckEnabled !== true }) },
      interval: (hours) => { void s.setPrefs({ intervalHours: hours }) },
      openNotes: (version) => { openChangelog({ version }) },
    }
    mount(host, h('div', { className: 'update-center-root' }, [
      /* 一个块（owner 2026-09-12 原型 v3 A 版）：动作行与设置行同一容器、轻分隔，不再夹在工具栏下当孤儿行。 */
      h('div', { className: 'update-center-block' }, [
        buildBanner(state, snap),
        h('div', { className: 'update-center-row' },
          h('div', { className: 'update-center-status-line' }, statusNodes(state, snap, s)),
          h('div', { className: 'update-center-row-actions' }, buildCheckButton(hd, busy))),
        buildFailLine(state, s, hd),
        buildSettings(s, hd),
      ]),
    ]))
  }

  /** 开窗（同一时刻最多一窗：dialog 内部会先关上一个）。 */
  function openDialog(s: UpdateStore, hd: Handlers): void {
    try { closeDialog?.() } catch { /* 旧窗已在关 */ }
    closeDialog = openCheckDialog(s, {
      check: () => hd.check(),
      install: () => hd.install(),
      openNotes: (version) => hd.openNotes(version),
    })
  }

  /** 先全拆（清表 / 退订 / 清 DOM）再挂；重复调用同一容器是幂等的。 */
  function detach(): void {
    try { closeDialog?.() } catch { /* ignore */ }
    closeDialog = null
    try { unsub?.() } catch { /* ignore */ }
    unsub = null
    try { store?.dispose() } catch { /* ignore */ }
    store = null
    const old = host
    host = null
    if (old) { try { clear(old) } catch { /* ignore */ } }
  }

  function attach(el: HTMLElement): void {
    if (host === el && store !== null) return
    detach()
    host = el
    store = createUpdateStore(ctx, { timer: WINDOW_TIMER })
    unsub = store.subscribe(paint)
    paint()
    void store.readStatus() // P1-c：每次 attach 后重拉一次状态，否则重开面板会永久停在「安装中」
    void store.loadPrefs() // meta 只在回调里读（P0-a）
  }

  const onHost = (e: Event): void => {
    try {
      const detail = (e as CustomEvent).detail as Partial<UpdateCenterHostDetail> | undefined
      const next = detail?.host ?? null
      if (next) {
        attach(next)
        return
      }
      detach()
      const live = claimHost() // host=null 后再复查一次是否还有 live 容器
      if (live) attach(live)
    } catch { /* 单次回调失败不留死状态：下一次 {host} 仍会走 attach/detach */ }
  }

  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined
    window.addEventListener(UPDATE_CENTER_HOST_EVENT, onHost as EventListener)
  } catch {
    return () => undefined
  }
  try {
    const live = claimHost()
    if (live) attach(live)
  } catch { /* 认领失败不致命：事件到达时仍会挂 */ }
  return () => {
    try { window.removeEventListener(UPDATE_CENTER_HOST_EVENT, onHost as EventListener) } catch { /* ignore */ }
    detach()
  }
}
