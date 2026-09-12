/** UpdateCenter 样式（update-center-* 命名空间，全局唯一；颜色直引 --dsw-alias-* 令牌 + 浅色回退，深浅主题免费跟随，仿 FleetRadar）。
 * 契约 §6：只经 installFeatureStyles('update-center', CSS) 注入；类前缀 update-center-*；不占用 .af-* 私有约定；
 * 也不匹配宿主容器（#imc-update-center / .update-center-host）——容器由 A1 建，样式只在自产内容上。 */
export const CSS = `
.update-center-root { display: flex; flex-direction: column; gap: 8px; padding: 2px 0 4px; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-primary,#1c1c1e); }
.update-center-banner { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; font-weight: 500;
  color: var(--dsw-alias-state-warn-primary,#ff9f0a); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary,#ff9f0a) 13%, var(--dsw-alias-bg-base,#fff));
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary,#ff9f0a) 35%, transparent); }
.update-center-banner-icon { font-size: 14px; line-height: 1; }
.update-center-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 0; }
.update-center-text { flex: 1 1 240px; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.update-center-status { font-weight: 500; }
.update-center-hint, .update-center-note-text, .update-center-note { font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); }
.update-center-muted { color: var(--dsw-alias-label-secondary,#6e6e73); }
.update-center-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.update-center-btn { height: 30px; padding: 0 12px; border-radius: 12px; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent); background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-primary,#1c1c1e); }
.update-center-btn:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 7%, var(--dsw-alias-bg-base,#fff)); }
.update-center-btn:disabled { opacity: .45; cursor: not-allowed; }
.update-center-primary { background: var(--dsw-alias-brand-primary,#0a84ff); border-color: transparent; color: #fff; font-weight: 500; }
.update-center-primary:hover { filter: brightness(1.06); }
.update-center-link { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary,#6e6e73); padding: 0 8px; }
.update-center-link:hover { background: transparent; color: var(--dsw-alias-brand-primary,#0a84ff); }
.update-center-fail { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); }
.update-center-detail { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent); }
.update-center-versions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.update-center-section-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary,#6e6e73); }
.update-center-cmd { position: relative; background: color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 6%, var(--dsw-alias-bg-base,#fff));
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent); border-radius: 12px; padding: 26px 10px 9px; }
.update-center-code { display: block; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary,#6e6e73); word-break: break-all; user-select: all; }
.update-center-copy { position: absolute; top: 6px; right: 6px; height: 24px; font-size: 12px; padding: 0 10px; }
.update-center-bar { height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 11%, var(--dsw-alias-bg-base,#fff)); overflow: hidden; }
.update-center-bar-in { display: block; height: 100%; width: 38%; border-radius: 3px; background: var(--dsw-alias-brand-primary,#0a84ff); transition: width .3s ease; }
.update-center-spin { display: inline-block; width: 11px; height: 11px; border-radius: 50%; vertical-align: -1px;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent); border-top-color: var(--dsw-alias-brand-primary,#0a84ff); animation: update-center-rot .8s linear infinite; }
@keyframes update-center-rot { to { transform: rotate(360deg); } }
.update-center-settings { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent); }
.update-center-switch { display: flex; align-items: center; gap: 8px; }
.update-center-switch-label { font-size: 13px; }
.update-center-track { position: relative; width: 34px; height: 20px; padding: 0; flex: none; cursor: pointer; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 11%, var(--dsw-alias-bg-base,#fff)); }
.update-center-track[aria-pressed="true"] { background: var(--dsw-alias-state-success-primary,#30d158); border-color: transparent; }
.update-center-knob { position: absolute; top: 1px; left: 1px; width: 16px; height: 16px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,.28); transition: left .12s ease; }
.update-center-track[aria-pressed="true"] .update-center-knob { left: 15px; }
.update-center-select { height: 28px; padding: 0 6px; border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary,#1c1c1e);
  background: var(--dsw-alias-bg-base,#fff); border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent); }
.update-center-select:disabled { opacity: .6; color: var(--dsw-alias-label-tertiary,#98989d); }
.update-center-next { font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); margin-left: auto; }
.update-center-greyed { color: var(--dsw-alias-label-tertiary,#98989d); opacity: .6; }
.update-center-overlay { position: fixed; inset: 0; z-index: 1200; padding: 20px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.42); }
.update-center-dialog { width: 100%; max-width: 440px; max-height: 80vh; overflow: auto; padding: 16px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px;
  background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-primary,#1c1c1e); border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary,#1c1c1e) 12%, transparent);
  box-shadow: 0 24px 64px rgba(0,0,0,.28); font-size: 13px; line-height: 1.5; }
.update-center-dialog-title { font-size: 14px; font-weight: 600; }
.update-center-dialog-body { font-size: 12.5px; color: var(--dsw-alias-label-secondary,#6e6e73); }
.update-center-dialog-foot { display: flex; justify-content: flex-end; }
.update-center-notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
`;
