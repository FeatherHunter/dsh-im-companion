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
@keyframes left-badges-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-success-primary, #30d158) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`
