/** left-badges 命名空间样式（经 installFeatureStyles 注入；类前缀 left-badges-*）。
 * 注意：左栏行在 .af-root 作用域之外，颜色直接取 DSH 主题别名（带 fallback），深色自动跟随。 */
export const CSS = `
div[role="treeitem"][aria-expanded][data-lb-kind]::after { content: attr(data-lb-label); display: inline-block; flex: none; margin-left: 2px; padding: 1px 7px 1px 15px; border-radius: 999px; font-size: 10px; line-height: 14px; font-weight: 600; white-space: nowrap; color: inherit; background: color-mix(in srgb, currentColor 8%, transparent); }
div[role="treeitem"][aria-expanded][data-lb-kind="online"]::after { background: radial-gradient(circle at 8px 50%, var(--dsw-alias-state-success-primary, #30d158) 3px, transparent 3.8px) no-repeat, color-mix(in srgb, currentColor 8%, transparent); animation: left-badges-breathe 1.6s infinite; }
.left-badges-badge { display: inline-flex; align-items: center; gap: 5px; margin-left: 6px; padding: 1px 7px 1px 5px; border-radius: 999px; font-size: 10px; line-height: 14px; font-weight: 600; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; white-space: nowrap; cursor: pointer; }
.left-badges-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.left-badges-badge.online .left-badges-dot { background: var(--dsw-alias-state-success-primary, #30d158); animation: left-badges-breathe 1.6s infinite; }
.left-badges-badge.warn .left-badges-dot { background: var(--dsw-alias-state-warn-primary, #ff9f0a); }
.left-badges-badge.offline .left-badges-dot { background: color-mix(in srgb, currentColor 35%, transparent); }
.left-badges-badge.unbound .left-badges-dot { background: transparent; border: 1.5px solid color-mix(in srgb, currentColor 35%, transparent); width: 4px; height: 4px; }
div[role="treeitem"][aria-expanded][data-lb-kind="warn"]::after { background: radial-gradient(circle at 8px 50%, var(--dsw-alias-state-warn-primary, #ff9f0a) 3px, transparent 3.8px) no-repeat, color-mix(in srgb, currentColor 8%, transparent); }
div[role="treeitem"][aria-expanded][data-lb-kind="offline"]::after { background: radial-gradient(circle at 8px 50%, color-mix(in srgb, currentColor 40%, transparent) 3px, transparent 3.8px) no-repeat, color-mix(in srgb, currentColor 8%, transparent); }
.left-badges-card { position: fixed; left: 0; top: 0; z-index: 60; display: none; min-width: 168px; max-width: 260px; padding: 10px 12px 8px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 6%, var(--dsw-alias-bg-base, #ffffff)); border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 12%, transparent); box-shadow: 0 12px 32px rgba(0, 0, 0, .25); color: var(--dsw-alias-label-primary, #1c1c1e); font-size: 12px; line-height: 18px; }
.left-badges-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.left-badges-card-name { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.left-badges-card-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.left-badges-card-dot.big { width: 10px; height: 10px; }
.left-badges-card-dot.online { background: var(--dsw-alias-state-success-primary, #30d158); }
.left-badges-card-dot.big.online { animation: left-badges-breathe 1.6s infinite; }
.left-badges-card-dot.warn { background: var(--dsw-alias-state-warn-primary, #ff9f0a); }
.left-badges-card-dot.offline { background: color-mix(in srgb, currentColor 40%, transparent); }
.left-badges-card-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 0; }
.left-badges-card-glyph { display: inline-flex; width: 16px; height: 16px; flex: none; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #6e6e73); }
.left-badges-card-foot { margin-top: 6px; font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-tertiary, #98989d); font-variant-numeric: tabular-nums; }
@keyframes left-badges-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-success-primary, #30d158) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`
