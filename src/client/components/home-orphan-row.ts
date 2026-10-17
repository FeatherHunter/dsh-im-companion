/** T10b #127 孤儿家的行内两枚动作（「选择工作区」/「删除家」）。
 *
 * 单独一文件的理由：`home-rows.ts` 贴着 300 行红线，而这两个按钮**只在孤儿家出现**（正常家一个都不画，
 * 验收④「正常家没有删除入口」由此成为结构保证而不是纪律）。弹层与分发在 `home-orphan-forms.ts`。
 * 「删除家」走 popconfirm（要求1）：按钮只上报 `remove-home`，确认弹层在 `home-orphan-forms` 里开，
 * 不再改按钮文案（两段式已退役）。 */
import type { RowOpts } from './home-rows'
import { h } from '../dom'

/** 行动作上报（`home-rows.RowOpts.onItemAct` 的别名；类型导入在编译期擦除，不成环）。 */
export type OrphanRowAct = NonNullable<RowOpts['onItemAct']>

/** 把两枚按钮追加进调用方给的 `.hu-acts2` 容器（容器归调用方，避免两层同名包裹）。
 * 「选择工作区」挂 `.strong`（B 原型收敛版：accent 高亮的主动作）；「删除家」保持 `.danger`，
 * 两枚都带 `data-item-act` 走 wireRow 通用派发（删除的二次确认在弹层里，不在按钮上）。 */
export function orphanRowActs(host: HTMLElement, id: string, _onAct?: OrphanRowAct): void {
  const rebind = h('button', { className: 'hu-ract strong', type: 'button', 'data-item-act': 'rebind-home', 'data-id': id }, '选择工作区')
  const del = h('button', { className: 'hu-ract danger', type: 'button', 'data-item-act': 'remove-home', 'data-id': id }, '删除家')
  host.appendChild(rebind)
  host.appendChild(del)
}
