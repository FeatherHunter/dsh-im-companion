/** presence 动效总控样式（E1 · 方向 A，用户裁定 2026-09-04：不画点，只定档位）。
 * 跨边界只读覆盖（评审已知，见 #19）：B1 拥有全部徽标视觉（B1 文件零触碰），本文件只在
 * body 档位下调整 B1 已有呼吸的时长 / 开关；摘除本特性即恢复 B1 原生行为。选择器只读
 * B1 的 data-lb-kind 与 card-dot，不写 B1 任何属性与节点。系统偏好由 B1 自带媒体查询负责。 */
export const CSS = `
body[data-presence-level="reduced"] div[role="treeitem"][aria-expanded][data-lb-kind="online"]::after { animation-duration: 2.8s; }
body[data-presence-level="static"] div[role="treeitem"][aria-expanded][data-lb-kind="online"]::after { animation: none; }
body[data-presence-level="reduced"] .left-badges-card-dot.online { animation-duration: 2.8s; }
body[data-presence-level="static"] .left-badges-card-dot.online { animation: none; }
.presence-toggle { position: fixed; right: 12px; bottom: 12px; z-index: 50; display: flex; align-items: center; gap: 6px; margin: 0; padding: 5px 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 14%, transparent); background: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 6%, var(--dsw-alias-bg-base, #ffffff)); box-shadow: 0 4px 16px rgba(0, 0, 0, .18); color: var(--dsw-alias-label-primary, #1c1c1e); font-size: 11px; line-height: 16px; cursor: pointer; opacity: .85; }
.presence-toggle:hover { opacity: 1; }
.presence-toggle:focus-visible { outline: 2px solid var(--dsw-alias-state-success-primary, #30d158); outline-offset: 1px; opacity: 1; }
.presence-toggle-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-success-primary, #30d158); }
.presence-toggle[aria-pressed="true"] .presence-toggle-dot { background: color-mix(in srgb, currentColor 35%, transparent); }
.presence-toggle[aria-pressed="true"] { opacity: .6; }
`
