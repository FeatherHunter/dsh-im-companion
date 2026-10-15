/** T10b #127 孤儿家的行内两枚动作（「选择工作区」/「删除家」）。
 *
 * 单独一文件的理由：`home-rows.ts` 贴着 300 行红线，而这两个按钮**只在孤儿家出现**（正常家一个都不画，
 * 验收④「正常家没有删除入口」由此成为结构保证而不是纪律）。弹层与分发在 `home-orphan-forms.ts`。
 * 「删除家」两步确认长在按钮自己身上：刻意**不带** `data-item-act` ⇒ 不走 wireRow 的通用派发，
 * 首点只布防、次点才上报一次（带属性的话首点就会被上报，删除无从确认）。 */
import type { RowOpts } from './home-rows'
import { h } from '../dom'

/** 行动作上报（`home-rows.RowOpts.onItemAct` 的别名；类型导入在编译期擦除，不成环）。 */
export type OrphanRowAct = NonNullable<RowOpts['onItemAct']>

/** 把两枚按钮追加进调用方给的 `.hu-acts2` 容器（容器归调用方，避免两层同名包裹）。
 * 「选择工作区」挂 `.strong`（B 原型收敛版：accent 高亮的主动作）；「删除家」保持 `.danger`。 */
export function orphanRowActs(host: HTMLElement, id: string, onAct?: OrphanRowAct): void {
  const rebind = h('button', { className: 'hu-ract strong', type: 'button', 'data-item-act': 'rebind-home', 'data-id': id }, '选择工作区')
  const del = h('button', { className: 'hu-ract danger', type: 'button', 'data-id': id }, '删除家')
  let armed = false
  del.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!armed) { armed = true; del.textContent = '再点一次确认删除'; return }
    onAct?.('remove-home', id, del)
  })
  host.appendChild(rebind)
  host.appendChild(del)
}
