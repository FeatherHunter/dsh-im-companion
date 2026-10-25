/** T13 #135：空家行「＋ 建助理」的**跨级入口**（L1 直接开新建助理弹层，并把家锁死在这一行）。
 *
 * 为什么自成一文件：`panel-body.ts` 余量告急（T10b #127 的孤儿家两动作也是这么搬出去的），
 * 那边只留**一行**入口；本文件自持「家在不在表里」的守卫与日志。
 * 与 L2 底部「新建助理」共用同一套 `onDone`（panel-body 的 `createDone`）⇒ 新建完同样落到该家 L3。
 * 只认 `new-asst`，其余 kind 回 false（调用方继续往下走）。 */
import { logLine } from '../log'
import { type FormOps } from './home-forms'
import { newAsstPop } from './home-assistant-create'
import type { AnchorRef } from './home-pop'
import type { RowView } from './home-rows'

export interface NewAsstActDeps {
  view: RowView
  ops: FormOps
  onDone: (level: 'L2' | 'L3', homeId: string, workspaceId?: string) => void
}

export function newAsstAct(kind: string, homeId: string, anchor: AnchorRef, deps: NewAsstActDeps): boolean {
  if (kind !== 'new-asst') return false
  if (!deps.view.homes.some((x) => x.id === homeId)) {
    logLine('info', 'assistant.action', { action: 'create', assistantId: '', ok: false, message: '家不在表里（可能刚被删），新建助理弹层不开' })
    return true
  }
  newAsstPop(anchor, { view: deps.view, ops: deps.ops, selHome: homeId, lockHome: true, onDone: deps.onDone })
  return true
}
