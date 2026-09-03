/** left-badges 命名空间样式（经 installFeatureStyles 注入；类前缀 left-badges-*）。
 * 注意：左栏行在 .af-root 作用域之外，颜色直接取 DSH 主题别名（带 fallback），深色自动跟随。 */
export const CSS = `
.left-badges-layer { position: fixed; inset: 0; pointer-events: none; z-index: 30; overflow: hidden; }
.left-badges-layer .left-badges-badge { position: fixed; left: 0; top: 0; pointer-events: auto; margin: 0; }
.left-badges-badge { display: inline-flex; align-items: center; gap: 5px; margin-left: 6px; padding: 1px 7px 1px 5px; border-radius: 999px; font-size: 10px; line-height: 14px; font-weight: 600; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; white-space: nowrap; cursor: pointer; }
.left-badges-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.left-badges-badge.online .left-badges-dot { background: var(--dsw-alias-state-success-primary, #30d158); animation: left-badges-breathe 1.6s infinite; }
.left-badges-badge.warn .left-badges-dot { background: var(--dsw-alias-state-warn-primary, #ff9f0a); }
.left-badges-badge.offline .left-badges-dot { background: color-mix(in srgb, currentColor 35%, transparent); }
.left-badges-badge.unbound .left-badges-dot { background: transparent; border: 1.5px solid color-mix(in srgb, currentColor 35%, transparent); width: 4px; height: 4px; }
@keyframes left-badges-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-success-primary, #30d158) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`
