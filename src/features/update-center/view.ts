/** update-center 视图（变体 A · 紧凑行内，owner 已裁决）：1–2 行状态 + 主按钮，点「详情」才展开说明/命令区。
 * P0-a：mount() 内**不读** ctx.meta（存储未就绪会同步抛错并被上层静默吞掉）；读取全在 {host} 回调/attach 里。
 * P0-b：事件无重放 ⇒ mount 末尾同步主动认领 document.getElementById('imc-update-center')；处理 host 时先全拆再挂，幂等。
 * P1-c：每次 attach 后重拉一次 UPD_STATUS（否则关掉设置再打开会永久显示「安装中」）。 */
import { clear, h, mount } from '../../client/dom'
import { toast } from '../../client/ui/toast'
import { UPDATE_CENTER_HOST_EVENT, type UpdateCenterHostDetail } from '../../client/data/config'
import type { FeatureCtx } from '../protocol'
import { openChangelog } from './changelog'
import { WINDOW_TIMER, createUpdateStore, type UpdateStore, type UiState } from './data'
import { failingOf, snapshotOf, type PhoneResult, type UpdateSnapshot } from './phone'
import { commandOf, manualFailText, noCommandOf, reasonText } from './reasons'
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
  openNotes(): void
  toggleDetail(): void
}
interface Bag { forced: boolean | null }
const detailOpen = (state: UiState, bag: Bag): boolean => (bag.forced === null ? state === 'blocked' : bag.forced)

/** 待重启横幅：常驻置顶、不可关闭（关掉版本说明对话框后它仍在）。 */
function buildBanner(state: UiState, snap: UpdateSnapshot | null): HTMLElement | null {
  if (state !== 'restart') return null
  const target = snap?.latestVersion ?? snap?.installedVersion ?? null
  return h('div', { className: 'update-center-banner', role: 'status' },
    span('update-center-banner-icon', '⚠️'),
    span('update-center-banner-text', '新版本 ' + v(target) + ' 已装好，重启宿主后生效'))
}

function statusNodes(state: UiState, snap: UpdateSnapshot | null, store: UpdateStore): HTMLElement[] {
  const running = v(snap?.runningVersion ?? null)
  if (state === 'installing') {
    const target = snap?.job?.targetVersion ?? snap?.latestVersion ?? null
    const txt = snap?.job?.state === 'verifying' ? '正在校验 ' + v(target) + '…' : '正在安装 ' + v(target) + '…'
    return [span('update-center-status', txt), span('update-center-spin', '')]
  }
  if (state === 'restart') {
    return [span('update-center-status', '已装好 ' + v(snap?.latestVersion ?? snap?.installedVersion ?? null) + '，等待重启'),
      span('update-center-hint', '当前运行 ' + running)]
  }
  if (state === 'blocked') {
    return [span('update-center-status', '装不了'), span('update-center-muted', reasonText(blockedOf(store)))]
  }
  if (state === 'update') {
    return [span('update-center-status', '有新版本 ' + v(snap?.latestVersion ?? null) + ' 可安装')]
  }
  if (state === 'failed') return [span('update-center-muted', '自动检查暂时不可用，可手动检查')]
  if (state === 'unavailable') {
    return [span('update-center-status', '暂时查不到更新状态'), span('update-center-muted', unknownText(store))]
  }
  return [span('update-center-status', '已是最新版本（' + running + '）'),
    span('update-center-hint', '最近检查：' + lastCheckText(store.lastCheckAt(), Date.now()))]
}
function blockedOf(store: UpdateStore): string | null {
  const res = store.result()
  if (res === null) return null
  return res.ok ? res.snapshot.blockedReason : res.token
}
/** 未知失败（①）的原因行：优先宿主/桥的原话（`res.message`）——用户该看到的是"桥出问题了/超时了"，
 * 不是"没有新版"。拿不到原话才兜底；**绝不**把它说成「已是最新」。 */
function unknownText(store: UpdateStore): string {
  const res = store.result()
  const msg = res !== null && !res.ok ? res.message : null
  return msg !== null && msg !== '' ? msg : '检查没能完成，请稍后重试'
}

function actionNodes(state: UiState, snap: UpdateSnapshot | null, hd: Handlers, busy: boolean): HTMLElement[] {
  /** 检查类按钮：在途（§3.2）一律变「检查中…」并禁用，结束即由 store 的再次 emit 恢复。 */
  const check = (label: string, cls: string): HTMLButtonElement => {
    const b = button(busy ? '检查中…' : label, cls, busy)
    b.addEventListener('click', hd.check)
    return b
  }
  if (state === 'installing') return [button('安装中…', 'update-center-primary', true)]
  if (state === 'restart') {
    const b = button('查看更新说明', 'update-center-secondary')
    b.addEventListener('click', hd.openNotes)
    return [b]
  }
  if (state === 'blocked') return [check('重新检查', 'update-center-secondary')]
  if (state === 'update') {
    const install = button('安装 ' + v(snap?.latestVersion ?? null), 'update-center-primary')
    install.addEventListener('click', hd.install)
    const notes = button('查看更新说明', 'update-center-secondary')
    notes.addEventListener('click', hd.openNotes)
    return [install, notes]
  }
  if (state === 'failed' || state === 'unavailable') return [check('重试', 'update-center-secondary')]
  return [check('检查更新', 'update-center-secondary')]
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

function buildCommand(res: PhoneResult | null, reason: string | null, hd: Handlers): HTMLElement {
  const cmd = commandOf(res)
  if (cmd === null) {
    const note = noCommandOf(reason) ? '此情况无法给出可用的重装命令' : '命令暂不可用，请稍后重试'
    return h('div', { className: 'update-center-note' }, span('update-center-hint', note))
  }
  const code = h('code', { className: 'update-center-code' })
  code.textContent = cmd
  const copy = button('复制', 'update-center-copy')
  copy.addEventListener('click', () => {
    try {
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(code)
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch { /* 选中失败不影响复制 */ }
    try { void navigator.clipboard?.writeText(cmd) } catch { /* 剪贴板不可用，已改为选中文本 */ }
    copy.textContent = '已复制'
  })
  return h('div', { className: 'update-center-cmd' }, copy, code)
}

function buildDetail(state: UiState, snap: UpdateSnapshot | null, store: UpdateStore, hd: Handlers): HTMLElement | null {
  if (state === 'failed' || state === 'unavailable') return null // 无可信的版本信息可展示
  const res = store.result()
  const parts: HTMLElement[] = []
  if (state === 'installing') {
    parts.push(h('div', { className: 'update-center-bar' }, h('i', { className: 'update-center-bar-in' })))
    parts.push(span('update-center-section-title', v(snap?.job?.targetVersion ?? null) + ' 安装进行中'))
  } else if (state === 'blocked') {
    // 原因文案在状态行已给（owner 表格）；这里只放手工命令块 / 「给不出命令」的小字，不重复一遍原因。
    parts.push(buildCommand(res, blockedOf(store), hd))
  } else {
    parts.push(h('div', { className: 'update-center-versions' },
      span('update-center-hint', '当前运行 ' + v(snap?.runningVersion ?? null)),
      span('update-center-hint', '磁盘已装 ' + v(snap?.installedVersion ?? null)),
      span('update-center-hint', '已发布 ' + v(snap?.latestVersion ?? null))))
    // ② §C.1 / §B `pending-restart` 行（README §10.3）：待重启态仍保留 §9 手工命令入口；
    // 命令本身照旧只在回包 `manual` 非空时展示、不自行拼、不缓存旧值；该态**仍然不得出现安装按钮**。
    if (state === 'restart') parts.push(buildCommand(res, 'pending-restart', hd))
  }
  if (state !== 'installing') {
    const notes = button('查看更新说明', 'update-center-link')
    notes.addEventListener('click', hd.openNotes)
    parts.push(h('div', { className: 'update-center-note' }, notes))
  }
  return h('div', { className: 'update-center-detail' }, parts)
}

function detailButton(state: UiState, bag: Bag, hd: Handlers): HTMLButtonElement {
  const b = button(detailOpen(state, bag) ? '收起详情' : '详情', 'update-center-link')
  b.addEventListener('click', hd.toggleDetail)
  return b
}

/** 版本说明要展示的版本：优先已发布版本（无则退到磁盘已装／运行版本），取不到就不弹细节。 */
function latestKnown(store: UpdateStore): string | null {
  const snap = snapshotOf(store.result())
  return snap?.latestVersion ?? snap?.installedVersion ?? snap?.runningVersion ?? null
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
  const bag: Bag = { forced: null }
  let store: UpdateStore | null = null
  let host: HTMLElement | null = null
  let unsub: (() => void) | null = null

  function paint(): void {
    if (host === null || store === null) return
    const s = store
    const snap = snapshotOf(s.result())
    const state = s.state()
    const busy = s.checking()
    const hd: Handlers = {
      check: () => {
        void s.check().then((r) => {
          // owner 裁定②：只在**用户主动点检查**且发现可装新版时自动弹版本说明；进待重启后不自动弹。
          const snap = snapshotOf(r)
          if (snap !== null && snap.canInstall === true && snap.latestVersion !== null) {
            openChangelog({ version: snap.latestVersion })
            return
          }
          // ③ §D.4：手动检查失败 → 瞬时 toast（复用共享层原语）。2 s 内复用上次结果是**成功**回包 ⇒ 不打提示。
          if (!r.ok) toast(manualFailText(r))
        })
      },
      install: () => { void s.install() },
      toggle: () => { void s.setPrefs({ autoCheckEnabled: s.prefs().autoCheckEnabled !== true }) },
      interval: (hours) => { void s.setPrefs({ intervalHours: hours }) },
      openNotes: () => { openChangelog({ version: latestKnown(s) }) },
      toggleDetail: () => { bag.forced = !detailOpen(state, bag); paint() },
    }
    mount(host, h('div', { className: 'update-center-root' }, [
      buildBanner(state, snap),
      h('div', { className: 'update-center-main' },
        h('div', { className: 'update-center-text' }, statusNodes(state, snap, s)),
        h('div', { className: 'update-center-actions' }, actionNodes(state, snap, hd, busy)),
        (state === 'failed' || state === 'unavailable') ? null : detailButton(state, bag, hd)),
      buildFailLine(state, s, hd),
      detailOpen(state, bag) ? buildDetail(state, snap, s, hd) : null,
      buildSettings(s, hd),
    ]))
  }

  /** 先全拆（清表 / 退订 / 清 DOM）再挂；重复调用同一容器是幂等的。 */
  function detach(): void {
    try { unsub?.() } catch { /* ignore */ }
    unsub = null
    try { store?.dispose() } catch { /* ignore */ }
    store = null
    const old = host
    host = null
    bag.forced = null
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
