/** T10b #127 孤儿家两个动作的 UI 层：重绑（「选择工作区」）＋ 删除家（两步确认）。
 *
 * 为什么单独开文件：`home-ops.ts`/`panel.ts` 已 300/300 顶格（单文件红线），`home-forms.ts` 的余量留给 #128 的头像格
 * ⇒ 新动作自成一文件，只向 `panel-body` 暴露**一个**入口（那边只剩 1 行余量）。
 * 宿主侧的 `home.rebind`/`home.remove`（墓碑＋判重＋级联清助理行）与客户端编排（`home-move-ops`）都已落地，
 * 本文件只负责「用户点得到」与「失败原因留在弹层里」——正常家永远没有这两个入口（验收④：
 * 按钮由 `home-rows` 只在 `isOrphanHome(...)===true` 时画出来）。 */
import { h } from '../dom'
import { normPath } from '../data/home-model'
import { takeDirError } from './home-dir'
import { dirField } from './home-dir-form'
import { huIcon } from './home-icons'
import { closeHomePop, homePopOpen, openHomePop, updateHomePop, type AnchorRef } from './home-pop'
import { hLog, msgOf } from './home-ops'
import { homeName, type RowView } from './home-rows'
import type { FormOps } from './home-forms'
import type { MoveOps } from './home-move-ops'

export interface OrphanDeps {
  view: RowView
  ops: FormOps & MoveOps
  onDone: () => void
}

/** 这个目录已经是「别人的家」吗（返回那家的显示名；没有返回空串）。
 *  与宿主同一把尺（该工作区 id 已有家 **或** 同 normPath 已有家 ⇒ 宿主回 `already-exists`、一行不写），
 *  这里只做**提前**提醒；权威判据仍在宿主，故它多嘴也不会写坏数据。 */
function ownerNameOf(view: RowView, homeId: string, dir: string): string {
  const target = normPath(dir)
  if (!target) return ''
  const ws = view.workspaces.find((w) => normPath(w.path) === target)
  if (!ws) return ''
  const owner = view.homes.find((x) => !x.tombstone && x.id !== homeId
    && (x.workspaceId === ws.workspaceId || normPath(x.path) === target))
  return owner ? homeName(view, owner) : ''
}

/** 孤儿家动作分发（panel-body 的一行入口）：认识返回 true，其余动作交回那边的链。 */
export function orphanHomeAct(kind: string, id: string, anchor: HTMLElement, deps: OrphanDeps): boolean {
  if (kind === 'rebind-home') { rebindHomePop(anchor, deps, id); return true }
  if (kind === 'remove-home') {
    hLog('remove-home', id, true, '两步确认通过，交给删家管道（先清远端、再打墓碑）')
    /* 与重绑同一条纪律：失败一律 throw 带原文（`home-move-ops` 已经 toast 了原因，这里只记一条日志，
     * 且**不**刷新——删家没成时界面必须停在原地，不能让用户以为删掉了）。 */
    void deps.ops.removeHome(id).then(() => deps.onDone(), (e: unknown) => {
      hLog('remove-home', id, false, msgOf(e))
    })
    return true
  }
  return false
}

/** 「选择工作区」弹层：选目录 → 收养（DSH 建区/等投影）→ 家改指新工作区。
 *  与 T8 新建家同一条收养链（`home-dir` 是唯一实现），差别只在最后一步是 `home.rebind` 而不是落新行；
 *  失败一律留在弹层里（`.hu-err` 灰字原文＋按钮恢复可点＝可重试），成功才关弹层。 */
function rebindHomePop(anchor: AnchorRef, deps: OrphanDeps, homeId: string): void {
  let picked = ''
  let busy = false
  let err = ''
  let opened = false
  hLog('rebind-home', homeId, true, '打开「选择工作区」弹层')

  const fail = (message: string): void => {
    busy = false
    err = message
    hLog('rebind-home', homeId, false, message)
    if (homePopOpen()) open()
  }

  function ok(): void {
    if (busy || !picked) return
    const owner = ownerNameOf(deps.view, homeId, picked)
    if (owner) { err = `这个目录已经有家了：${owner}。请另选一个目录。`; open(); return }
    busy = true
    err = ''
    open()
    void deps.ops.adoptDirectory(picked).then((ws) => {
      if (!ws) { fail(takeDirError() || 'DSH 建工作区没成，请重试'); return }
      void deps.ops.rebindHome(homeId, ws.workspaceId, ws.path).then(() => {
        hLog('rebind-home', homeId, true, '家已重绑到 ' + ws.path)
        closeHomePop(true)
        deps.onDone()
      }, (e: unknown) => fail(msgOf(e)))
    })
  }

  function open(): void {
    const body = [
      h('p', { className: 'hu-fhint' }, '这个家原来指向的工作区已经不在 DSH 里了。选一个目录把家重绑过去；DSH 里还没有该工作区就先建一个。'),
      h('div', { className: 'hu-fld' }, h('span', {}, '工作区目录'),
        dirField(picked, () => deps.ops.pickDirectory(), (d) => { picked = d; err = ''; open() }, err)),
      h('p', { className: 'hu-fhint' }, '家名仍跟随工作区；这个家下面的助理，机器人会一起跟到新目录。'),
    ]
    const cancel = h('button', { className: 'hu-pbtn-s', type: 'button' }, '取消')
    cancel.addEventListener('click', () => closeHomePop())
    const go = h('button', { className: 'hu-pbtn-s go', type: 'button' }, '重绑')
    if (busy || !picked) {
      go.disabled = true
      go.setAttribute('disabled', '')
      go.setAttribute('data-tip', busy ? '正在建工作区，请稍候' : '先选一个目录')
    } else go.addEventListener('click', ok)
    const opts = {
      width: 340, label: '选择工作区', above: true,
      title: h('div', { className: 'hu-ptitle' }, huIcon('move', 15), '选择工作区'),
      body, foot: [cancel, go],
    }
    if (opened) { updateHomePop(opts); return }
    opened = true
    openHomePop(anchor, opts)
  }

  open()
}
