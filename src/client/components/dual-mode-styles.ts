/** 双模式样式（dm- 命名空间 · installFeatureStyles 注入；theme.ts 一字不动）。
 * 向导步骤式（T3 A 变体）：二选一卡 + 手动表单 + 提示行；扫码页既有 af- 类不动。 */
import { installFeatureStyles } from '../theme'

export const DUAL_MODE_STYLE_ID = 'dual-mode'

export const DUAL_MODE_CSS = `/* 二选一（双支持）：两张方式卡纵排，大按钮易点 */
.dm-choice { display: grid; gap: 10px; padding: 10px 0 4px; }
.dm-opt { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left;
  padding: 12px 14px; border-radius: 12px; border: 1px solid var(--af-hairline-strong);
  background: var(--af-surface); color: var(--af-primary); font-family: inherit; cursor: pointer; }
.dm-opt:hover { background: var(--af-surface-2); }
.dm-opt b { font-size: 14px; font-weight: 650; }
.dm-opt span { display: block; font-size: 12px; color: var(--af-secondary); }
.dm-backrow { display: flex; justify-content: flex-start; margin-top: 4px; }

/* 手动表单：key 左置 + 输入 + 注记；错误行警告色；提示行次要色 */
.dm-title { font-size: 15px; font-weight: 650; margin: 2px 0 8px; }
.dm-hint { font-size: 12px; line-height: 17px; color: var(--af-secondary);
  background: var(--af-surface); border: 1px dashed var(--af-hairline-strong);
  border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; }
.dm-form { display: grid; gap: 10px; }
.dm-field { display: grid; gap: 4px; font-size: 13px; }
.dm-key { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-weight: 600; }
.dm-input { height: 34px; padding: 0 12px; font-size: 14px; color: var(--af-primary);
  background: var(--af-bg); border: 1px solid var(--af-hairline-strong);
  border-radius: 9px; outline: none; font-family: inherit; width: 100%; }
.dm-input:focus { border-color: color-mix(in srgb, var(--af-accent) 55%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--af-accent) 16%, transparent); }
.dm-note { font-size: 11px; color: var(--af-tertiary); }
.dm-error { font-size: 12px; line-height: 17px; color: var(--af-danger);
  background: color-mix(in srgb, var(--af-danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--af-danger) 30%, transparent);
  border-radius: 10px; padding: 8px 10px; margin-top: 10px; }
`

let installed = false

/** 幂等安装（对话框打开时调用；热重载安全，多次调用只装一次）。 */
export function ensureDualModeStyles(): () => void {
  if (installed) return () => {}
  installed = true
  try {
    return installFeatureStyles(DUAL_MODE_STYLE_ID, DUAL_MODE_CSS)
  } catch {
    installed = false
    return () => {}
  }
}
