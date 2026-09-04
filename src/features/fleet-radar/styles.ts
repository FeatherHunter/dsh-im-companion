/** FleetRadar 矩阵样式（fleet-radar-* 命名空间：fleet-radar = fleet-radar 缩写，全局唯一；颜色直引 --dsw-alias-* 令牌 + 浅色回退，深浅主题免费跟随，仿 DetailDrawer）。 */
export const CSS = `
.fleet-radar-root { padding: 6px 4px 12px; }
.fleet-radar-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,.45); }
.fleet-radar-modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(1120px,96vw); max-height: 88vh; overflow: auto; z-index: 1200; background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-primary,#1c1c1e); border: 1px solid var(--dsw-alias-separator,#ddd); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); padding: 16px 18px; }
.fleet-radar-close { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 9px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary,#6e6e73); cursor: pointer; }
.fleet-radar-close:hover { color: var(--dsw-alias-brand-primary,#0a84ff); }
.fleet-radar-hd { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; flex-wrap: wrap; }
.fleet-radar-title { margin: 0; font-size: 17px; line-height: 22px; font-weight: 700; color: var(--dsw-alias-label-primary,#1c1c1e); }
.fleet-radar-meta { font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); font-variant-numeric: tabular-nums; }
.fleet-radar-hd .fleet-radar-sp { flex: 1; }
.fleet-radar-logo { display: inline-flex; width: 18px; height: 18px; border-radius: 5px; flex: none; align-items: center; justify-content: center; color: #fff; border: 1px solid var(--dsw-alias-separator,#e5e6eb); overflow: hidden; }
.fleet-radar-logo svg { display: block; }
.fleet-radar-logo:not([data-ch="feishu"]):not([data-ch="wecom"]) svg path { fill: #fff; stroke: #fff; }
.fleet-radar-logo:not([data-ch="feishu"]):not([data-ch="wecom"]) svg circle { fill: #fff; stroke: #fff; }
.fleet-radar-refresh { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 9px; border: 1px solid var(--dsw-alias-separator,#dfe1e5); background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-secondary,#6e6e73); cursor: pointer; margin-left: 6px; }
.fleet-radar-refresh:hover { color: var(--dsw-alias-brand-primary,#0a84ff); border-color: var(--dsw-alias-brand-primary,#0a84ff); }
.fleet-radar-scroll { overflow-x: auto; border: 1px solid var(--dsw-alias-separator,#e5e6eb); border-radius: 12px; background: var(--dsw-alias-bg-base,#fff); }
.fleet-radar-table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 760px; font-size: 12px; }
.fleet-radar-table th, .fleet-radar-table td { padding: 7px 8px; border-bottom: 1px solid var(--dsw-alias-separator,#eef0f3); border-right: 1px solid var(--dsw-alias-separator,#eef0f3); text-align: center; white-space: nowrap; }
.fleet-radar-table thead th { background: var(--dsw-alias-fill-secondary,rgba(127,127,127,.08)); font-size: 11px; color: var(--dsw-alias-label-secondary,#6e6e73); position: sticky; top: 0; }
.fleet-radar-table thead tr th:first-child { left: 0; z-index: 2; }
.fleet-radar-rowbtn { font: inherit; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; }
.fleet-radar-table tbody th { position: sticky; left: 0; background: var(--dsw-alias-bg-base,#fff); text-align: left; min-width: 148px; z-index: 1; }
.fleet-radar-table tbody tr:hover td, .fleet-radar-table tbody tr:hover th { background: rgba(127,127,127,.08); }
.fleet-radar-agent { display: flex; align-items: center; gap: 8px; }
.fleet-radar-av { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 13px; flex: none; }
.fleet-radar-nm { font-weight: 700; color: var(--dsw-alias-label-primary,#1c1c1e); }
.fleet-radar-bs { font-size: 10px; color: var(--dsw-alias-label-tertiary,#98989d); font-family: ui-monospace, Menlo, Consolas, monospace; }
.fleet-radar-cell { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dsw-alias-separator,#dfe1e5); background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-primary,#1c1c1e); cursor: pointer; }
.fleet-radar-cell:hover { border-color: var(--dsw-alias-brand-primary,#0a84ff); color: var(--dsw-alias-brand-primary,#0a84ff); }
.fleet-radar-cell.unbound { border-style: dashed; }
.fleet-radar-cell.ghost { border-style: dashed; opacity: 0.55; cursor: pointer; }
.fleet-radar-cell.ghost:hover { border-color: var(--dsw-alias-separator,#dfe1e5); color: var(--dsw-alias-label-primary,#1c1c1e); }
.fleet-radar-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.fleet-radar-dot.online { background: var(--dsw-alias-state-success-primary,#30d158); }
.fleet-radar-dot.warn { background: var(--dsw-alias-state-warn-primary,#ff9f0a); }
.fleet-radar-dot.offline { background: var(--dsw-alias-state-error-primary,#ff453a); }
.fleet-radar-dot.empty { background: transparent; border: 1.5px dashed var(--dsw-alias-label-tertiary,#98989d); width: 7px; height: 7px; }
.fleet-radar-agg { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary,#6e6e73); }
.fleet-radar-loading, .fleet-radar-foot { padding: 14px; font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); text-align: center; }
`;
