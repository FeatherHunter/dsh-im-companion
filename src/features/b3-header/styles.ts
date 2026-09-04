/** b3-header 命名空间样式（经 installFeatureStyles 注入；类前缀 b3-header-*）。
 * 主题色-scroll 全走 DSH 别名（--dsw-alias-*，带 fallback），深浅色自动跟随；
 * 内容原样迁自共享 theme.ts（#18 收编），样式零改。 */
import { TOKEN_BLOCK } from '../../client/theme'

export const CSS = `
.b3-header { ${TOKEN_BLOCK} position: relative; display: inline-flex; align-items: center; color: var(--af-primary); font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; }
.b3-header-dotbtn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--af-hairline-strong); background: var(--af-surface); cursor: pointer; display: inline-grid; place-items: center; padding: 0; }
.b3-header-dotbtn:hover { border-color: var(--af-accent); }
.b3-header-dotbtn:focus-visible { outline: 2px solid var(--af-accent); outline-offset: 1px; }
.b3-header-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.b3-header-dot.online, .b3-header-dotbtn.online .b3-header-dot { background: var(--af-success); animation: b3-header-breathe 1.6s infinite; }
.b3-header-dot.warn, .b3-header-dotbtn.warn .b3-header-dot { background: var(--af-warn); }
.b3-header-dot.offline, .b3-header-dotbtn.offline .b3-header-dot { background: color-mix(in srgb, var(--af-primary) 35%, transparent); }
.b3-header-dot.unbound, .b3-header-dotbtn.unbound .b3-header-dot { background: transparent; border: 1.5px solid color-mix(in srgb, var(--af-primary) 35%, transparent); width: 7px; height: 7px; }
.b3-header-pop { ${TOKEN_BLOCK} position: absolute; top: calc(100% + 8px); right: 0; z-index: 1200; width: 280px; background: var(--af-surface-2); border: 1px solid var(--af-hairline-strong); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, .25); color: var(--af-primary); font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; padding: 12px; font-size: 12px; line-height: 18px; }
.b3-header-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.b3-header-sub { color: var(--af-secondary); margin-bottom: 8px; word-break: break-all; }
.b3-header-row { display: flex; gap: 8px; }
.b3-header-channels { display: grid; gap: 5px; margin-bottom: 8px; }
.b3-header-chrow { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.b3-header-chbadge { width: 18px; height: 18px; flex: none; border-radius: 6px; display: inline-grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; }
.b3-header-chlogo { position: relative; width: 18px; height: 18px; flex: none; display: inline-grid; place-items: center; }
.b3-header-chlogo svg { display: block; }
.b3-header-chlogoin { display: inline-grid; place-items: center; }
.b3-header-chst { position: absolute; right: -3px; bottom: -3px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--af-surface-2); background: var(--af-success); }
.b3-header-chst.warn { background: var(--af-warn); }
.b3-header-chst.offline { background: color-mix(in srgb, var(--af-primary) 35%, transparent); }
.b3-header-btn { flex: 1; font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 9px; border: 1px solid var(--af-hairline-strong); background: var(--af-bg); color: var(--af-primary); cursor: pointer; }
.b3-header-btn:hover { border-color: var(--af-accent); color: var(--af-accent); }
.b3-header-btn.primary { background: var(--af-accent); border-color: var(--af-accent); color: #fff; }
.b3-header-btn.primary:hover { color: #fff; opacity: .88; }
.b3-header-btn:disabled { opacity: .6; cursor: default; }
.b3-header-result { margin-top: 8px; font-size: 12px; color: var(--af-secondary); word-break: break-all; }
.b3-header-result.ok { color: var(--af-success); }
.b3-header-result.err { color: var(--af-danger); }
@keyframes b3-header-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--af-success) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`