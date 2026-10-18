/** 助理侧的「更换头像」入口（owner 2026-10-17：L2 与 L1 功能一致——铅笔就地改名、头像开**纯**换头像弹层）。
 *  自成一文件守住 `home-forms.ts` 的 300 行红线；配图行与弹层原语全部复用 `home-forms`，全仓只有一份实现。 */
import { h } from '../dom'
import { logLine, logOn } from '../log'
import { huIcon } from './home-icons'
import { closeHomePop, openHomePop, type AnchorRef } from './home-pop'
import { avatarRow, field, footBtns, type EditDeps } from './home-forms'
import { asstName } from './home-rows'

const fLog = (action: string, ok: boolean, message: string): void => { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'form', action, ok, message }) }

/** 只管头像：预设色攒进「保存」，图片格点了就落（见 avatarRow 注释）——与家侧 avatarHomePop 同口径。 */
export function avatarAsstPop(anchor: AnchorRef, deps: EditDeps & { asstId: string }): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) return
  let avatar: string | null = a.avatar ?? null
  const av = avatarRow(asstName(deps.view, a), a.id, 'assistant', avatar, (v) => { avatar = v }, () => { closeHomePop(true); deps.onDone() })
  const ok = (): void => {
    closeHomePop(true)
    if (avatar === (a.avatar ?? null)) { fLog('noop', false, '头像没变，换头像弹层直接关'); return }
    void deps.ops.updateAssistant(a.id, { avatar }).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 320, label: '更换头像', above: true,
    title: h('div', { className: 'hu-ptitle' }, huIcon('image', 15), '更换头像'),
    body: [field('头像', av.row, 'div'), ...(av.clear ? [av.clear] : [])],
    foot: footBtns(ok, undefined, '保存'),
  })
}
