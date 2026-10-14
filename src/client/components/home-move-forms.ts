/** T6c #115 搬家/移除弹层（锚定 popover；写管道走 MoveOps，本模块不直接碰 rpc）。 */
import { h } from '../dom'
import { huIcon } from './home-icons'
import { closeHomePop, openHomePop, type AnchorRef } from './home-pop'
import { homeName, type RowView } from './home-rows'
import type { MoveOps } from './home-move-ops'
import { logLine, logOn } from '../log'

export interface MoveDeps {
  view: RowView
  ops: MoveOps
  asstId: string
  onDone: () => void
}

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { className: 'hu-fld' }, h('span', {}, label), control)
}

function foot(okLabel: string, onOk: () => void): HTMLElement[] {
  const cancel = h('button', { className: 'hu-pbtn-s', type: 'button' }, '取消')
  cancel.addEventListener('click', () => closeHomePop())
  const ok = h('button', { className: 'hu-pbtn-s go', type: 'button' }, okLabel)
  ok.addEventListener('click', onOk)
  return [cancel, ok]
}

/** 换工作区：选一家 ⇒ 助理整户搬过去（已绑机器人远端跟随，失败回滚）。 */
export function moveAsstPop(anchor: AnchorRef, deps: MoveDeps): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'move', action: 'open-move', ok: false, message: '助理不在表里，搬家弹层不开：' + deps.asstId }); return }
  const homes = deps.view.homes.filter((x) => !x.tombstone && x.id !== a.homeId)
  const sel = h('select', { 'aria-label': '目标家' }) as HTMLSelectElement
  homes.forEach((x) => {
    const o = document.createElement('option')
    o.value = x.id
    o.textContent = homeName(deps.view, x)
    sel.appendChild(o)
  })
  const body = [
    homes.length
      ? field('搬到哪家', sel)
      : h('p', { className: 'hu-fhint' }, '没有别家可搬：先新建一家再回来。'),
    h('p', { className: 'hu-fhint' }, a.status === 'bound'
      ? '已绑的机器人会一起跟过去；如果跟随失败，这次换家会取消，两边都保持原样。'
      : '还没绑定，直接换家即可。'),
  ]
  const ok = (): void => {
    if (!sel.value) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'move', action: 'confirm-move', ok: false, message: '没选目标家，不搬' }); return }
    closeHomePop(true)
    void deps.ops.moveAssistant(a.id, sel.value).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '换工作区',
    title: h('div', { className: 'hu-ptitle' }, huIcon('move', 15), '换工作区'),
    body, foot: foot('搬过去', ok),
  })
}

/** 移除渠道：把绑定解开（不断连接，机器人回到空闲池可重绑；失败回滚）。 */
export function unbindAsstPop(anchor: AnchorRef, deps: MoveDeps): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a || a.status !== 'bound') { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'move', action: 'open-unbind', ok: false, message: a ? '还没绑定，无需移除渠道' : '助理不在表里：' + deps.asstId }); return }
  const body = [
    h('p', { className: 'hu-fhint' }, '移除后机器人连接不会断；它可以再绑给别的助理。'),
  ]
  const ok = (): void => {
    closeHomePop(true)
    void deps.ops.unbindAssistant(a.id).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '移除渠道',
    title: h('div', { className: 'hu-ptitle' }, huIcon('unlink', 15), '移除渠道'),
    body, foot: foot('确认移除', ok),
  })
}
