/** left-filter 样式（命名空间 left-filter-*；三段复用共享 af-seg 原语，只做后代覆盖）。
 * 深色窄栏做实：轨道实色 + 滑块抬起 + 数字降级，避免裸文本感。
 * 自带干粮：--af-* 变量域只在设置面板树下存在，左栏里必须自己定义（同 theme.ts 取值）。 */
export const CSS = [
  '.left-filter-strip{position:sticky;top:0;z-index:5;box-sizing:border-box;max-width:100%;overflow:hidden;padding:6px 0 8px;margin:0 0 2px;background:var(--dsw-specific-sidebar-fill,transparent);--af-accent:var(--dsw-alias-brand-primary,#0a84ff);--af-primary:var(--dsw-alias-label-primary,#1c1c1e);--af-secondary:var(--dsw-alias-label-secondary,#6e6e73);--af-tertiary:var(--dsw-alias-label-tertiary,#98989d);--af-bg:var(--dsw-alias-bg-base,#ffffff);--af-surface:color-mix(in srgb,var(--dsw-alias-label-primary,#1c1c1e) 6%,var(--dsw-alias-bg-base,#ffffff));--af-surface-2:color-mix(in srgb,var(--dsw-alias-label-primary,#1c1c1e) 11%,var(--dsw-alias-bg-base,#ffffff));--af-hairline:color-mix(in srgb,var(--dsw-alias-label-primary,#1c1c1e) 12%,transparent);--af-hairline-strong:color-mix(in srgb,var(--dsw-alias-label-primary,#1c1c1e) 22%,transparent);}',
  '.left-filter-strip *{box-sizing:border-box;}',
  '.left-filter-strip .af-seg{display:flex;width:100%;min-width:0;gap:2px;padding:2px;background:transparent;border:none;border-radius:9px;box-shadow:none;}',
  '.left-filter-strip .af-seg-thumb{background:color-mix(in srgb, var(--af-primary) 14%, var(--af-bg));border-radius:7px;border:none;box-shadow:0 1px 2px rgba(0,0,0,.18);}',
  '.left-filter-strip .af-seg-item{flex:1 1 0;min-width:0;font-size:12px;font-weight:600;padding:5px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--af-secondary);}',
  '.left-filter-strip .af-seg-item.active{color:var(--af-primary);font-weight:700;}',
  '.left-filter-strip .left-filter-n{font-size:11px;font-weight:500;color:var(--af-tertiary);margin-left:3px;font-variant-numeric:tabular-nums;}',
  '.left-filter-strip .af-seg-item.active .left-filter-n{color:inherit;opacity:.62;}',
  '.left-filter-empty{padding:14px 8px;font-size:12.5px;line-height:18px;text-align:center;color:var(--dsw-alias-label-secondary,#6e6e73);}',
  '.left-filter-hbtn{width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#6e6e73);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none;padding:0;margin:0;}',
  '.left-filter-hbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1c1c1e);}',
  '.left-filter-hbtn.on{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#0a84ff) 16%,transparent);color:var(--dsw-alias-brand-primary,#0a84ff);}',
  '.left-filter-hbtn svg{width:14px;height:14px;display:block;}',
].join('\n')
