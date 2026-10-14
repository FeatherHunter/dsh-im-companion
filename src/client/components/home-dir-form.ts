/** T8 #121：新建家「新建工作区」支路的 UI 与编排（选目录 → DSH 注册工作区 → 落家）。
 * 从 home-forms 拆出（300 行红线）；本模块只编排，不直接碰 rpc（写管道全走注入的 ops）。 */
import { h } from '../dom'
import { toast } from '../ui/toast'
import { takeDirError } from './home-dir'
import type { Home, WorkspaceRef } from '../data/home-model'
import { logLine, logOn } from '../log'

export interface DirFlowDeps {
  adoptDirectory(dir: string): Promise<WorkspaceRef | null>
  createHome(workspaceId: string): Promise<void>
  /** 取家表快照（**每次现取**，不是建单那一刻的数组）：T10 #124 起种子会给新工作区自动补家，必须读到最新。 */
  homes(): Home[]
  onDone(workspaceId: string): void
  /** 失败就地回报（弹层不关、灰字原文留在弹层里、按钮恢复可点＝可重试）。 */
  onError(message: string): void
}

/** 「目录」字段：左侧按钮、右侧虚线输入位，两者等高同排一行（未选＝虚线灰占位，已选＝实线亮路径）。
 * 框（路径位）是控件本体：点框上任意处都能开选择器；按钮自己冒泡上来的那次跳过，避免开两次。
 * `err` 非空即在行下方留一行灰字原文（验收 5：失败原因在弹层内，不是一闪而过的 toast）。 */
export function dirField(
  picked: string, pick: () => Promise<string | null>, onPick: (dir: string) => void, err = '',
): HTMLElement {
  const run = (): void => { void pick().then((dir) => { if (dir) onPick(dir) }) }
  const btn = h('button', { className: 'hu-pbtn-s', type: 'button', 'data-act': 'pick-dir' }, '选择目录')
  btn.addEventListener('click', run)
  const line = h('span', { className: 'hu-dirpath' + (picked ? ' picked' : ''), title: picked || '' },
    h('span', { className: 'hu-dirtext' }, picked || '还没有选择目录'))
  /* 框自己就是控件本体：直接挂在框上（不靠冒泡），点框＝开选择器；按钮各有各的监听，不会开两次。 */
  line.addEventListener('click', run)
  /* 只回控件本体：外层 label/字段名由调用方 field() 提供——这里再套一层 .hu-fld 会把「目录」渲染两遍。 */
  return h('div', { className: 'hu-dirfield' }, h('div', { className: 'hu-dirrow' }, btn, line),
    err ? h('p', { className: 'hu-fhint hu-err' }, err) : null)
}

/** 创建：先收养（DSH 建区＋等投影）；该区已有家 ⇒ 直接带用户去那家（目标已达成，不写第二行、不报错）；
 * 否则落家再回上层。落家失败时再看一眼家表——T10 #124 的种子可能在毫秒级抢先补好了（那是成功，不是失败）。 */
export function runDirCreate(dir: string, deps: DirFlowDeps): void {
  const homeOf = (workspaceId: string): Home | undefined => deps.homes().find((x) => !x.tombstone && x.workspaceId === workspaceId)
  const gotoExisting = (workspaceId: string, why: string): void => {
    const row = homeOf(workspaceId)
    const name = row?.name ?? '已有家'
    toast('这个目录已经是工作区，家也在：' + name)
    logLine('info', 'home.action', { action: 'create', homeId: row?.id ?? '', ok: true, message: why + '，直接进已有家：' + dir })
    deps.onDone(workspaceId)
  }
  void deps.adoptDirectory(dir).then((ws) => {
    if (!ws) {
      const m = takeDirError() || 'DSH 建工作区没成，请重试'
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'dir', action: 'create-home', ok: false, message: '收养没成，未落家：' + dir })
      deps.onError(m)
      return
    }
    if (homeOf(ws.workspaceId)) { gotoExisting(ws.workspaceId, '该目录已是工作区且有家'); return }
    void deps.createHome(ws.workspaceId).then(() => deps.onDone(ws.workspaceId)).catch((e) => {
      /* 种子（或另一窗口）可能刚补上家：目标已达成，别报「没写成功」。 */
      if (homeOf(ws.workspaceId)) { gotoExisting(ws.workspaceId, '落家竞态但家已存在'); return }
      const m = '家的记录没写成功，可以再点一次「创建」重试：' + String((e as Error)?.message ?? e)
      toast(m)
      logLine('info', 'home.action', { action: 'create', homeId: '', ok: false, message: m })
      deps.onError(m)
    })
  })
}
