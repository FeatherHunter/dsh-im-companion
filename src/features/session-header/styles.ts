/** session-header 命名空间样式（经 installFeatureStyles 注入；类前缀 session-header-*）。
 * 主题色-scroll 全走 DSH 别名（--dsw-alias-*，带 fallback），深浅色自动跟随；
 * 内容原样迁自共享 theme.ts（#18 收编），样式零改。 */
import { TOKEN_BLOCK } from '../../client/theme'

export const CSS = `
.session-header { ${TOKEN_BLOCK} position: relative; display: inline-flex; align-items: center; color: var(--af-primary); font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; }
.session-header-dotbtn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--af-hairline-strong); background: var(--af-surface); cursor: pointer; display: inline-grid; place-items: center; padding: 0; }
.session-header-dotbtn:hover { border-color: var(--af-accent); }
.session-header-dotbtn:focus-visible { outline: 2px solid var(--af-accent); outline-offset: 1px; }
.session-header-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.session-header-dot.online, .session-header-dotbtn.online .session-header-dot { background: var(--af-success); animation: session-header-breathe 1.6s infinite; }
.session-header-dot.warn, .session-header-dotbtn.warn .session-header-dot { background: var(--af-warn); }
.session-header-dot.offline, .session-header-dotbtn.offline .session-header-dot { background: color-mix(in srgb, var(--af-primary) 35%, transparent); }
.session-header-dot.unbound, .session-header-dotbtn.unbound .session-header-dot { background: transparent; border: 1.5px solid color-mix(in srgb, var(--af-primary) 35%, transparent); width: 7px; height: 7px; }
.session-header-pop { ${TOKEN_BLOCK} position: absolute; top: calc(100% + 8px); right: 0; z-index: 1200; width: 280px; background: var(--af-surface-2); border: 1px solid var(--af-hairline-strong); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, .25); color: var(--af-primary); font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; padding: 12px; font-size: 12px; line-height: 18px; }
.session-header-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.session-header-sub { color: var(--af-secondary); margin-bottom: 8px; word-break: break-all; }
.session-header-row { display: flex; gap: 8px; }
.session-header-channels { display: grid; gap: 5px; margin-bottom: 8px; }
.session-header-chrow { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.session-header-chbadge { width: 18px; height: 18px; flex: none; border-radius: 6px; display: inline-grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; }
.session-header-chlogo { position: relative; width: 18px; height: 18px; flex: none; display: inline-grid; place-items: center; }
.session-header-chlogo svg { display: block; }
.session-header-chlogoin { display: inline-grid; place-items: center; }
.session-header-chst { position: absolute; right: -3px; bottom: -3px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--af-surface-2); background: var(--af-success); }
.session-header-chst.warn { background: var(--af-warn); }
.session-header-chst.offline { background: color-mix(in srgb, var(--af-primary) 35%, transparent); }
.session-header-btn { flex: 1; font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 9px; border: 1px solid var(--af-hairline-strong); background: var(--af-bg); color: var(--af-primary); cursor: pointer; }
.session-header-btn:hover { border-color: var(--af-accent); color: var(--af-accent); }
/* 白字按钮底色用实色：宿主 brand 别名在真机可为白色致白底白字，见 #26（DetailDrawer 同款追改） */
.session-header-btn.primary { background: #0a84ff; border-color: #0a84ff; color: #fff; }
.session-header-btn.primary:hover { color: #fff; opacity: .88; }
.session-header-btn:disabled { opacity: .6; cursor: default; }
.session-header-result { margin-top: 8px; font-size: 12px; color: var(--af-secondary); word-break: break-all; }
.session-header-result.ok { color: var(--af-success); }
.session-header-result.err { color: var(--af-danger); }
@keyframes session-header-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--af-success) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`