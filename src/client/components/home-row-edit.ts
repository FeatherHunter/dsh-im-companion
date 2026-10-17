/** 家行的**行内交互件**（owner 2026-10-17 真机意见：改名就在名字处改、头像点开只换头像）。
 *  独立成文件是为了让 `home-rows.ts` 守住 300 行红线（军规只认规模红线，不认解耦自动扫描）。 */
import { h } from '../dom'

export interface RenameField {
  /** 展示态节点（`.hu-nm`：名字 ＋ 可选徽标）；进编辑时整块换成输入框，退出换回来。 */
  el: HTMLElement
  /** 进编辑（点铅笔调用）：聚焦并全选；回车/失焦保存，Esc 取消。 */
  edit: () => void
}

export interface RenameOpts {
  /** 展示态内容（`<b>` 名字 ＋ 可选「你取的名」徽标）。 */
  parts: HTMLElement[]
  /** 进编辑的初值：**只有手改过的名**才有值；空串＝跟随工作区（与家设置弹层同口径）。 */
  initial: string
  placeholder: string
  /** 值真变了才回调（空串＝回落「跟随工作区」）。 */
  onCommit: (value: string) => void
}

/** 原位改名：不重渲染、不动行结构 ⇒ 焦点与输入内容都不丢（整面板重渲染会把输入框冲掉）。
 *  `focus/select` 在假 DOM（tools/verify/dom-shim）里没有 ⇒ 逐个探一次，缺了也不炸。 */
export function renameField(o: RenameOpts): RenameField {
  const el = h('span', { className: 'hu-nm' }, o.parts)
  let editing = false
  const stop = (input: HTMLInputElement, save: boolean): void => {
    if (!editing) return
    editing = false
    const v = input.value.trim()
    el.replaceChildren(...o.parts)
    if (save && v !== o.initial.trim()) o.onCommit(v)
  }
  const edit = (): void => {
    if (editing) return
    editing = true
    const input = h('input', { className: 'hu-nminput', type: 'text', 'aria-label': '名字', placeholder: o.placeholder }) as HTMLInputElement
    input.value = o.initial
    /* 点/敲输入框不许冒泡到行——否则改名顺手把行钻取到 L2（一键两事）。 */
    input.addEventListener('click', (e) => e.stopPropagation())
    input.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key
      if (k === 'Enter') { e.preventDefault(); stop(input, true) } else if (k === 'Escape') { e.preventDefault(); stop(input, false) }
    })
    input.addEventListener('blur', () => stop(input, true))
    el.replaceChildren(input)
    if (typeof input.focus === 'function') input.focus()
    if (typeof input.select === 'function') input.select()
  }
  return { el, edit }
}

/** 头像当按钮：包一层真 `<button>` ⇒ 键盘可达，且走行级 `[data-item-act]` 统一接线（行不再顺手钻取）。
 *  act 默认家行（`avatar-h`）；助理行传 `avatar-a`——owner 2026-10-17：L2 与 L1 在这件事上功能一致。 */
export function avatarButton(av: HTMLElement, act = 'avatar-h'): HTMLElement {
  return h('button', { className: 'hu-avbtn', type: 'button', 'data-item-act': act,
    'aria-label': '更换头像', 'data-tip': '更换头像' }, av)
}
