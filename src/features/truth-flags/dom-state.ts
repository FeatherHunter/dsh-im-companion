/** 原生行状态直读（DOM 真值，无像素扫描）：StateDot 把语义写在 data-state 上
 *（ongoing=svg 动画矩阵，done/warning=span 圆点；见 dsh-client-ui-primitives StateDot）。
 * 语义与 sessionStatuses(node) 同源：ongoing=执行中/子代理跑、warning=等审批/审计划/等回答、
 * done=完成或空闲。读不到一律 ''（fail-soft，走真相路径）。 */
export type NativeRowState = 'ongoing' | 'warning' | 'done' | '';

export function readNativeState(row: Element): NativeRowState {
  try {
    var el = row.querySelector('[data-state]');
    if (!el) return '';
    var s = String(el.getAttribute('data-state') || '').toLowerCase().trim();
    if (s === 'ongoing' || s === 'warning' || s === 'done') return s;
    return '';
  } catch (e) { return ''; }
}
