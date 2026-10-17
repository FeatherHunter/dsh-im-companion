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
/* 脸底色桥：faceStyle 与面板 avatarStyle 同字面量、引用 --hu-panel/--hu-ink；那两个变量只在面板作用域下定义，
   悬浮卡挂在左栏（宿主主题作用域之外）⇒ 在此桥到 --dsw-alias-*，否则 tint 声明无效、色脸退成灰底。 */
.left-badges-card { position: fixed; left: 0; top: 0; z-index: 60; display: none; min-width: 168px; max-width: 260px; padding: 10px 12px 8px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 6%, var(--dsw-alias-bg-base, #ffffff)); border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 12%, transparent); box-shadow: 0 12px 32px rgba(0, 0, 0, .25); color: var(--dsw-alias-label-primary, #1c1c1e); font-size: 12px; line-height: 18px; --hu-panel: var(--dsw-alias-bg-base, #ffffff); --hu-ink: var(--dsw-alias-label-primary, #1c1c1e); }
.left-badges-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.left-badges-card-name { flex: 1 1 auto; min-width: 0; font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.left-badges-card-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

.left-badges-card-dot.online { background: var(--dsw-alias-state-success-primary, #30d158); animation: left-badges-breathe 1.6s infinite; }

.left-badges-card-dot.warn { background: var(--dsw-alias-state-warn-primary, #ff9f0a); }
.left-badges-card-dot.offline { background: color-mix(in srgb, currentColor 40%, transparent); }
.left-badges-card-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 0; }
.left-badges-card-avatar { display: inline-flex; width: 16px; height: 16px; flex: none; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #6e6e73); border-radius: 50%; overflow: hidden; background: color-mix(in srgb, currentColor 12%, transparent); font-size: 10px; font-weight: 700; }
.left-badges-card-glyph { display: inline-flex; width: 16px; height: 16px; flex: none; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #6e6e73); }
.left-badges-card-avatar img { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; display: block; }
.left-badges-card-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary, #1c1c1e); }
.left-badges-card-foot { margin-top: 6px; font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-tertiary, #98989d); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .left-badges-card-dot.online, div[role="treeitem"][aria-expanded][data-lb-kind="online"]::after { animation: none; } }
@keyframes left-badges-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-success-primary, #30d158) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`

/* 悬浮卡呼吸节奏（纯函数，与 CSS 动画同源；hover-card 行内圆点用，verify 钉住旧口径）。 */
export const BREATH_BASE_MS = 1600
export const BREATH_SLOT_MS = 997 // 组内槽位步进：与 1600 互质，同渠道组内天然散开
/** 呼吸相位（#33v2）：delay 走同渠道同基 + 组内槽位（构造错开，不靠运气）；duration 按 Bot 种子（有机）；单 Bot（slot 0）= 旧口径；重渲染不跳变。 */
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
export function breathPhase(channel: string, seed = '', slotMs = 0): { delay: string; duration: string } {
  try {
    const c = String(channel || '?')
    const u = hashStr(seed ? c + '\0' + String(seed) : c)
    const slot = slotMs > 0 ? Math.round(slotMs) % BREATH_BASE_MS : 0
    return { delay: '-' + (((hashStr(c) + slot) % BREATH_BASE_MS) / 1000).toFixed(2) + 's', duration: (1.6 + ((u >> 3) % 800) / 1000).toFixed(2) + 's' }
  } catch { return { delay: '0s', duration: '1.6s' } }
}
