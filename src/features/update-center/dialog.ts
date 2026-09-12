/** 检查结果弹窗（owner 2026-09-12 裁定：仿 dsh-im —— 面板上只留一个「检查更新」按钮，点完直接出弹窗）。
 * 设计要点：
 * ① 弹窗是 store 的**第二个视图**（与面板行同源）：安装中 / 待重启 / 装不了都在同一个窗口里就地变化，不另开窗；
 * ② 说明是懒加载的（只有真查到新版才去拉 CHANGELOG），失败也不阻塞主信息；
 * ③ 命令块照旧只认回包 `manual` 非空时展示，绝不自行拼命令（档案 §9）。 */
import { h } from '../../client/dom'
import { fetchNotes, notesMessage } from './changelog'
import type { UpdateStore, UiState } from './data'
import { notesList } from './markdown'
import { snapshotOf, type PhoneResult, type UpdateSnapshot } from './phone'
import { commandOf, noCommandOf, reasonText } from './reasons'
import { lastCheckText } from './text'

const v = (x: string | null): string => (x ? 'v' + x : '未知版本')
const span = (cls: string, text: string): HTMLSpanElement => {
  const node = h('span', { className: cls })
  node.textContent = text
  return node
}
function button(label: string, cls: string, disabled = false): HTMLButtonElement {
  const b = h('button', { className: 'update-center-btn ' + cls, type: 'button' })
  b.textContent = label
  if (disabled) b.disabled = true
  return b
}

export interface DialogHandlers {
  check(): void
  install(): void
  openNotes(version: string | null): void
}

/** 说明缓存：同一版本在一个会话里只拉一次（点开再关、或重画时不重复打网络）。 */
const notesCache = new Map<string, string[] | null>()

function titleOf(state: UiState, snap: UpdateSnapshot | null): string {
  if (state === 'installing') return '正在安装 ' + v(snap?.job?.targetVersion ?? snap?.latestVersion ?? null) + '…'
  if (state === 'restart') return '新版 ' + v(snap?.latestVersion ?? snap?.installedVersion ?? null) + ' 已装好'
  if (state === 'blocked') return '装不了'
  if (state === 'update') return '发现新版本 ' + v(snap?.latestVersion ?? null)
  if (state === 'failed' || state === 'unavailable') return '检查更新失败'
  return '已是最新版本'
}

function versionLine(state: UiState, snap: UpdateSnapshot | null): HTMLElement | null {
  if (state !== 'update' && state !== 'latest') return null
  const row = h('div', { className: 'update-center-versions' },
    span('update-center-note', '当前 ' + v(snap?.runningVersion ?? snap?.installedVersion ?? null)),
    span('update-center-hint', state === 'update' ? '→' : '·'),
    span('update-center-status', state === 'update' ? '新版 ' + v(snap?.latestVersion ?? null) : '已是最新'))
  return row
}

function bodyOf(state: UiState, snap: UpdateSnapshot | null, store: UpdateStore, hd: DialogHandlers, repaint: () => void): HTMLElement {
  const box = h('div', { className: 'update-center-dialog-body' })
  if (state === 'installing') {
    box.appendChild(h('div', { className: 'update-center-bar' }, h('i', { className: 'update-center-bar-in' })))
    box.appendChild(span('update-center-note', '安装完成后需要重启宿主才会生效。'))
    return box
  }
  if (state === 'restart') {
    box.appendChild(span('update-center-note', '重启宿主后新版才会生效——这不是失败。'))
    return box
  }
  if (state === 'blocked') {
    box.textContent = reasonText(blockedOf(store))
    const cmd = commandOf(store.result())
    if (cmd !== null) {
      box.appendChild(commandBlock(cmd))
    } else {
      box.appendChild(span('update-center-hint', noCommandOf(blockedOf(store)) ? '此情况无法给出可用的重装命令' : '命令暂不可用，请稍后重试'))
    }
    return box
  }
  if (state === 'failed' || state === 'unavailable') {
    const res = store.result()
    const why = res !== null && !res.ok && res.message !== null && res.message !== '' ? res.message : '检查没能完成，请稍后重试'
    box.textContent = why
    return box
  }
  if (state === 'latest') {
    box.textContent = '官方源上没有更新的版本。' + (store.lastCheckAt() === null ? '' : '最近检查：' + lastCheckText(store.lastCheckAt(), Date.now()) + '。')
    return box
  }
  // update：说明区（懒加载 → 到位后只重画这一块，不整窗重画，避免用户正在读时闪动）
  const version = snap?.latestVersion ?? null
  const title = h('div', { className: 'update-center-section-title' }, span('', '更新说明'))
  box.appendChild(title)
  const slot = h('div', {})
  box.appendChild(slot)
  const cached = version !== null ? notesCache.get(version) : undefined
  if (cached !== undefined) {
    fillNotes(slot, version, cached)
  } else {
    slot.textContent = '正在获取更新说明…'
    void fetchNotes(version).then((out) => {
      const items = out.state === 'ok' ? out.items : null
      if (version !== null) notesCache.set(version, items)
      fillNotes(slot, version, items)
      if (out.state !== 'ok') { try { repaint() } catch { /* 视图已关 */ } }
    }).catch(() => { slot.textContent = notesMessage(version, 'unavailable') })
  }
  return box
}

function fillNotes(slot: HTMLElement, version: string | null, items: string[] | null): void {
  const list = items === null ? null : notesList(items)
  if (list === null) { slot.textContent = notesMessage(version, 'empty'); return }
  slot.replaceChildren(list)
}

function footOf(state: UiState, snap: UpdateSnapshot | null, hd: DialogHandlers, close: () => void): HTMLElement {
  const foot = h('div', { className: 'update-center-dialog-foot' })
  if (state === 'installing') { foot.appendChild(button('安装中…', 'update-center-primary', true)); return foot }
  if (state === 'update') {
    const later = button('稍后', 'update-center-link')
    later.addEventListener('click', close)
    const go = button('安装 ' + v(snap?.latestVersion ?? null), 'update-center-primary')
    go.addEventListener('click', hd.install)
    foot.appendChild(later); foot.appendChild(go); return foot
  }
  if (state === 'restart') {
    const notes = button('查看更新说明', 'update-center-secondary')
    notes.addEventListener('click', () => hd.openNotes(snap?.latestVersion ?? snap?.installedVersion ?? null))
    const ok = button('知道了', 'update-center-primary')
    ok.addEventListener('click', close)
    foot.appendChild(notes); foot.appendChild(ok); return foot
  }
  if (state === 'blocked' || state === 'failed' || state === 'unavailable') {
    const again = button('重新检查', 'update-center-secondary')
    again.addEventListener('click', hd.check)
    foot.appendChild(again); return foot
  }
  const ok = button('知道了', 'update-center-primary')
  ok.addEventListener('click', close)
  foot.appendChild(ok)
  return foot
}

function blockedOf(store: UpdateStore): string | null {
  const res = store.result()
  if (res === null) return null
  return res.ok ? res.snapshot.blockedReason : res.token
}

function commandBlock(cmd: string): HTMLElement {
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

let liveClose: (() => void) | null = null

/** 打开检查结果弹窗；返回关闭函数（重复打开会先关掉上一个，同一时刻最多一窗）。 */
export function openCheckDialog(store: UpdateStore, hd: DialogHandlers): () => void {
  if (typeof document === 'undefined') return () => undefined
  try { liveClose?.() } catch { /* 旧窗已在关 */ }
  const overlay = h('div', { className: 'update-center-overlay' })
  const card = h('div', { className: 'update-center-dialog', role: 'dialog', 'aria-label': '检查更新' })
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    liveClose = null
    try { unsub() } catch { /* ignore */ }
    try { document.removeEventListener('keydown', onKey, true) } catch { /* ignore */ }
    try { overlay.remove() } catch { /* ignore */ }
  }
  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') close() }
  overlay.addEventListener('click', (e: MouseEvent) => { if (e.target === overlay) close() })
  try { document.addEventListener('keydown', onKey, true) } catch { /* ignore */ }

  const repaint = (): void => {
    if (closed) return
    const state = store.state()
    const snap = snapshotOf(store.result())
    const head = h('div', { className: 'update-center-dialog-title' })
    head.appendChild(span('', titleOf(state, snap)))
    const x = button('✕', 'update-center-link')
    x.addEventListener('click', close)
    head.appendChild(x)
    card.replaceChildren(head)
    const vline = versionLine(state, snap)
    if (vline !== null) card.appendChild(vline)
    card.appendChild(bodyOf(state, snap, store, hd, repaint))
    card.appendChild(footOf(state, snap, hd, close))
  }
  const unsub = store.subscribe(repaint)
  repaint()
  liveClose = close
  return close
}

/** 供验证器做纯函数检查（无 DOM 也能断言标题分派）。 */
export { titleOf as checkDialogTitle }
