/** C1b 矩阵样式（c1bm-* 命名空间：c1bm = c1b-matrix 缩写，全局唯一；颜色直引 --dsw-alias-* 令牌 + 浅色回退，深浅主题免费跟随，仿 c1a）。 */
export const CSS = `
.c1bm-root { padding: 6px 4px 12px; }
.c1bm-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,.45); }
.c1bm-modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(1120px,96vw); max-height: 88vh; overflow: auto; z-index: 1200; background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-primary,#1c1c1e); border: 1px solid var(--dsw-alias-separator,#ddd); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); padding: 16px 18px; }
.c1bm-close { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 9px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary,#6e6e73); cursor: pointer; }
.c1bm-close:hover { color: var(--dsw-alias-brand-primary,#0a84ff); }
.c1bm-hd { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 10px; flex-wrap: wrap; }
.c1bm-title { margin: 0; font-size: 17px; line-height: 22px; font-weight: 700; color: var(--dsw-alias-label-primary,#1c1c1e); }
.c1bm-meta { font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); font-variant-numeric: tabular-nums; }
.c1bm-hd .c1bm-sp { flex: 1; }
.c1bm-logo { display: inline-flex; width: 18px; height: 18px; border-radius: 5px; flex: none; align-items: center; justify-content: center; color: #fff; border: 1px solid var(--dsw-alias-separator,#e5e6eb); overflow: hidden; }
.c1bm-logo svg { display: block; }
.c1bm-refresh { font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 9px; border: 1px solid var(--dsw-alias-separator,#dfe1e5); background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-secondary,#6e6e73); cursor: pointer; margin-left: 6px; }
.c1bm-refresh:hover { color: var(--dsw-alias-brand-primary,#0a84ff); border-color: var(--dsw-alias-brand-primary,#0a84ff); }
.c1bm-scroll { overflow-x: auto; border: 1px solid var(--dsw-alias-separator,#e5e6eb); border-radius: 12px; background: var(--dsw-alias-bg-base,#fff); }
.c1bm-table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 760px; font-size: 12px; }
.c1bm-table th, .c1bm-table td { padding: 7px 8px; border-bottom: 1px solid var(--dsw-alias-separator,#eef0f3); border-right: 1px solid var(--dsw-alias-separator,#eef0f3); text-align: center; white-space: nowrap; }
.c1bm-table thead th { background: var(--dsw-alias-fill-secondary,rgba(127,127,127,.08)); font-size: 11px; color: var(--dsw-alias-label-secondary,#6e6e73); position: sticky; top: 0; }
.c1bm-table thead tr th:first-child { left: 0; z-index: 2; }
.c1bm-rowbtn { font: inherit; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; }
.c1bm-table tbody th { position: sticky; left: 0; background: var(--dsw-alias-bg-base,#fff); text-align: left; min-width: 148px; z-index: 1; }
.c1bm-table tbody tr:hover td, .c1bm-table tbody tr:hover th { background: rgba(127,127,127,.08); }
.c1bm-agent { display: flex; align-items: center; gap: 8px; }
.c1bm-av { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 13px; flex: none; }
.c1bm-nm { font-weight: 700; color: var(--dsw-alias-label-primary,#1c1c1e); }
.c1bm-bs { font-size: 10px; color: var(--dsw-alias-label-tertiary,#98989d); font-family: ui-monospace, Menlo, Consolas, monospace; }
.c1bm-cell { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dsw-alias-separator,#dfe1e5); background: var(--dsw-alias-bg-base,#fff); color: var(--dsw-alias-label-primary,#1c1c1e); cursor: pointer; }
.c1bm-cell:hover { border-color: var(--dsw-alias-brand-primary,#0a84ff); color: var(--dsw-alias-brand-primary,#0a84ff); }
.c1bm-cell.unbound { border-style: dashed; }
.c1bm-cell.ghost { border-style: dashed; opacity: 0.55; cursor: pointer; }
.c1bm-cell.ghost:hover { border-color: var(--dsw-alias-separator,#dfe1e5); color: var(--dsw-alias-label-primary,#1c1c1e); }
.c1bm-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.c1bm-dot.online { background: var(--dsw-alias-state-success-primary,#30d158); }
.c1bm-dot.warn { background: var(--dsw-alias-state-warn-primary,#ff9f0a); }
.c1bm-dot.offline { background: var(--dsw-alias-state-error-primary,#ff453a); }
.c1bm-dot.empty { background: transparent; border: 1.5px dashed var(--dsw-alias-label-tertiary,#98989d); width: 7px; height: 7px; }
.c1bm-agg { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary,#6e6e73); }
.c1bm-loading, .c1bm-foot { padding: 14px; font-size: 12px; color: var(--dsw-alias-label-tertiary,#98989d); text-align: center; }
`;
