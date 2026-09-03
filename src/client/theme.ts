/**
 * Apple 设计令牌 + 全部样式（唯一样式来源）。
 * 所有颜色由 DSH 主题别名（--dsw-alias-*）实时派生：深浅主题自动跟随，
 * 项目自身不出现任何硬编码 #fff / #000 等固定色值。
 */
export const STYLE_ID = 'dsh-im-companion-styles'

export const TOKEN_BLOCK = `
  --af-accent: var(--dsw-alias-brand-primary, #0a84ff);
  --af-primary: var(--dsw-alias-label-primary, #1c1c1e);
  --af-secondary: var(--dsw-alias-label-secondary, #6e6e73);
  --af-tertiary: var(--dsw-alias-label-tertiary, #98989d);
  --af-bg: var(--dsw-alias-bg-base, #ffffff);
  --af-surface: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 6%, var(--dsw-alias-bg-base, #ffffff));
  --af-surface-2: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 11%, var(--dsw-alias-bg-base, #ffffff));
  --af-hairline: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 12%, transparent);
  --af-hairline-strong: color-mix(in srgb, var(--dsw-alias-label-primary, #1c1c1e) 22%, transparent);
  --af-success: var(--dsw-alias-state-success-primary, #30d158);
  --af-warn: var(--dsw-alias-state-warn-primary, #ff9f0a);
  --af-danger: var(--dsw-alias-state-error-primary, #ff453a);
`

const CSS = `
.af-root,
.af-menu,
.af-toast {
  ${TOKEN_BLOCK}
  color: var(--af-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
    "PingFang SC", "Noto Sans SC", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  max-width: 780px;
  padding: 6px 4px 56px;
}
.af-root * { box-sizing: border-box; }

/* ---- 头部：Apple 大标题 ---- */
.af-hd { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 4px 0 0; }
.af-title { margin: 0; font-size: 30px; line-height: 36px; font-weight: 700; letter-spacing: -0.4px; }
.af-title-meta { margin: 3px 0 0; font-size: 13px; line-height: 18px; color: var(--af-tertiary); font-variant-numeric: tabular-nums; }

/* ---- 工具行：搜索 + 分段控件 ---- */
.af-toolbar { display: flex; align-items: center; gap: 10px; margin: 18px 0 14px; flex-wrap: wrap; }
.af-search { position: relative; flex: 1; min-width: 180px; }
.af-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--af-tertiary); pointer-events: none; display: inline-flex; }
.af-search input {
  width: 100%; height: 38px; padding: 0 12px 0 38px; font-size: 14px; color: var(--af-primary);
  background: var(--af-surface); border: 1px solid transparent; border-radius: 12px; outline: none;
  font-family: inherit; transition: border-color .15s, box-shadow .15s, background .15s;
}
.af-search input::placeholder { color: var(--af-tertiary); }
.af-search input:focus {
  border-color: color-mix(in srgb, var(--af-accent) 45%, transparent);
  box-shadow: 0 0 0 3.5px color-mix(in srgb, var(--af-accent) 18%, transparent);
  background: var(--af-bg);
}

/* ---- 分段控件（iOS 风格滑块） ---- */
.af-seg { position: relative; display: inline-flex; gap: 2px; padding: 3px; background: var(--af-surface); border-radius: 12px; }
.af-seg-thumb {
  position: absolute; top: 3px; bottom: 3px; left: 3px; width: 0;
  background: color-mix(in srgb, var(--af-primary) 16%, var(--af-bg));
  border-radius: 9px;
  box-shadow: 0 1px 5px rgba(0, 0, 0, .22), 0 0 0 .5px color-mix(in srgb, var(--af-primary) 8%, transparent);
  transition: width .18s cubic-bezier(.4, 0, .2, 1), left .18s cubic-bezier(.4, 0, .2, 1);
}
.af-seg-item {
  position: relative; z-index: 1; padding: 6px 14px; border: 0; background: transparent;
  border-radius: 9px; font-family: inherit; font-size: 13px; font-weight:500;
  color: var(--af-secondary); cursor: pointer; white-space: nowrap; transition: color .15s;
}
.af-seg-item.active { color: var(--af-primary); font-weight: 600; }
.af-seg-item:focus-visible { outline: 2px solid color-mix(in srgb, var(--af-accent) 60%, transparent); outline-offset: 1px; }

/* ---- 分组圆角列表（Apple grouped list） ---- */
.af-list {
  background: var(--af-surface); border: 1px solid var(--af-hairline);
  border-radius: 14px; overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
}
.af-row { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 16px; transition: background .12s; }
.af-row + .af-row::before { content: ''; position: absolute; top: 0; left: 72px; right: 0; height: 1px; background: var(--af-hairline); }
.af-row:hover { background: color-mix(in srgb, var(--af-primary) 3%, transparent); }

/* ---- 头像（44px 圆形，Apple 通讯录风格） ---- */
.af-avatar {
  position: relative; width: 44px; height: 44px; flex: none; border-radius: 50%; overflow: hidden;
  display: grid; place-items: center; color: #fff; font-size: 17px; font-weight: 600;
  user-select: none; cursor: pointer;
  border: 1px solid color-mix(in srgb, #fff 14%, transparent);
}
.af-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.af-av-0 { background: linear-gradient(135deg, #0a84ff, #5e5ce6); }
.af-av-1 { background: linear-gradient(135deg, #30d158, #0a84ff); }
.af-av-2 { background: linear-gradient(135deg, #ff9f0a, #ff375f); }
.af-av-3 { background: linear-gradient(135deg, #ff375f, #bf5af2); }
.af-av-4 { background: linear-gradient(135deg, #bf5af2, #5e5ce6); }
.af-av-5 { background: linear-gradient(135deg, #64d2ff, #30d158); }
.af-av-6 { background: linear-gradient(135deg, #ffd60a, #ff9f0a); }
.af-av-7 { background: linear-gradient(135deg, #8e8e93, #3a3a3c); }

/* ---- 行内主体 ---- */
.af-row-main { flex: 1; min-width: 0; }
.af-name { display: flex; align-items: center; gap: 6px; font-size: 16px; line-height: 22px; font-weight: 590; letter-spacing: -0.15px; }
.af-rename {
  opacity: 0; transition: opacity .12s; margin-left: 2px; color: var(--af-tertiary);
  border: 0; background: transparent; padding: 2px; border-radius: 6px; cursor: pointer; display: inline-flex;
}
.af-row:hover .af-rename, .af-rename:focus-visible { opacity: 1; }
.af-rename:hover { color: var(--af-accent); background: color-mix(in srgb, var(--af-accent) 12%, transparent); }
.af-sub { font-size: 12px; line-height: 17px; color: var(--af-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.af-name-input {
  font-family: inherit; font-size: 16px; font-weight: 590; color: var(--af-primary);
  background: var(--af-surface-2); border: 1px solid var(--af-hairline-strong); border-radius: 8px;
  padding: 2px 8px; width: min(240px, 62%); outline: none;
}
.af-name-input:focus {
  border-color: color-mix(in srgb, var(--af-accent) 55%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--af-accent) 18%, transparent);
}

/* ---- 状态点 ---- */
.af-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; color: var(--af-secondary); white-space: nowrap; }
.af-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.af-dot.online { background: var(--af-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--af-success) 18%, transparent); }
.af-dot.warn { background: var(--af-warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--af-warn) 18%, transparent); }
.af-dot.offline { background: color-mix(in srgb, var(--af-primary) 35%, transparent); }

/* ---- 按钮 ---- */
.af-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  border: 1px solid transparent; border-radius: 11px; padding: 6px 14px;
  font-family: inherit; font-size: 13px; line-height: 18px; font-weight: 590;
  color: var(--af-primary); background: var(--af-surface-2); cursor: pointer; user-select: none;
  transition: background .12s, filter .12s, transform .05s;
}
.af-btn:hover { background: color-mix(in srgb, var(--af-primary) 16%, var(--af-surface-2)); }
.af-btn:active { transform: scale(.97); }
.af-btn.primary { background: var(--af-accent); color: #fff; }
.af-btn.primary:hover { filter: brightness(1.1); background: var(--af-accent); }
.af-btn.tinted { background: color-mix(in srgb, var(--af-accent) 13%, transparent); color: var(--af-accent); }
.af-btn.tinted:hover { background: color-mix(in srgb, var(--af-accent) 20%, transparent); }
.af-btn.ghost { background: transparent; color: var(--af-secondary); }
.af-btn.ghost:hover { background: var(--af-surface-2); color: var(--af-primary); }
.af-btn.sm { padding: 3px 11px; font-size: 12px; border-radius: 9px; }
.af-btn:disabled { opacity: .45; cursor: default; filter: none; }
.af-icon-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: none;
  border: 0; border-radius: 12px; background: color-mix(in srgb, var(--af-accent) 12%, transparent);
  color: var(--af-accent); cursor: pointer; transition: background .12s; font-family: inherit;
}
.af-icon-btn:hover { background: color-mix(in srgb, var(--af-accent) 20%, transparent); }

/* ---- 新建 Agent 内联表单 ---- */
.af-compose { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 12px; background: var(--af-surface); border: 1px solid var(--af-hairline); border-radius: 12px; }
.af-compose input {
  flex: 1; height: 34px; padding: 0 12px; font-size: 14px; color: var(--af-primary);
  background: var(--af-bg); border: 1px solid var(--af-hairline-strong); border-radius: 9px; outline: none; font-family: inherit;
}
.af-compose input:focus { border-color: color-mix(in srgb, var(--af-accent) 55%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--af-accent) 16%, transparent); }

/* ---- 空态 / 加载 / 错误 ---- */
.af-empty { display: grid; place-items: center; gap: 10px; padding: 56px 16px; text-align: center; }
.af-empty-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--af-surface); color: var(--af-tertiary); }
.af-empty-title { font-size: 15px; font-weight: 590; color: var(--af-primary); }
.af-empty-sub { font-size: 13px; color: var(--af-secondary); max-width: 280px; }
.af-loading-row { display: flex; align-items: center; gap: 10px; padding: 16px; color: var(--af-secondary); font-size: 13px; }
.af-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--af-accent) 22%, transparent); border-top-color: var(--af-accent); animation: afSpin .8s linear infinite; flex: none; }
@keyframes afSpin { to { transform: rotate(360deg); } }
.af-error { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: color-mix(in srgb, var(--af-danger) 9%, var(--af-bg)); border: 1px solid color-mix(in srgb, var(--af-danger) 30%, transparent); border-radius: 12px; font-size: 13px; color: var(--af-primary); }
.af-error .retry { margin-left: auto; }
.af-skel { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.af-skel .c { width: 44px; height: 44px; border-radius: 50%; background: var(--af-surface-2); animation: afPulse 1.2s infinite; }
.af-skel .lines { flex: 1; display: grid; gap: 6px; }
.af-skel .b { height: 12px; border-radius: 6px; background: var(--af-surface-2); animation: afPulse 1.2s infinite; }
.af-skel .b.short { width: 55%; }
@keyframes afPulse { 0%, 100% { opacity: .55; } 50% { opacity: .25; } }

/* ---- 弹出菜单（头像 / 行操作） ---- */
.af-menu {
  position: fixed; z-index: 1000; min-width: 190px; padding: 5px;
  background: color-mix(in srgb, var(--af-primary) 14%, var(--af-bg));
  border: 1px solid color-mix(in srgb, var(--af-primary) 30%, transparent); border-radius: 13px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, .4), 0 2px 10px rgba(0, 0, 0, .22);
}
.af-menu-item {
  display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px;
  border: 0; border-radius: 9px; background: color-mix(in srgb, var(--af-primary) 8%, transparent); font-family: inherit;
  font-size: 13px; color: var(--af-primary); cursor: pointer; text-align: left;
}
.af-menu-item:hover { background: color-mix(in srgb, var(--af-primary) 14%, transparent); }
.af-menu-item + .af-menu-item { margin-top: 1px; }
.af-menu-item.danger { color: var(--af-danger); }
.af-menu-item svg { color: var(--af-tertiary); flex: none; }
.af-menu-item.danger svg { color: var(--af-danger); }

/* ---- 渠道胶囊 + 工作区行 ---- */
.af-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.af-chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px 1px 6px;
  font-size: 11px; line-height: 16px; border-radius: 999px;
  color: var(--af-secondary); background: var(--af-surface-2);
}
.af-chdot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.af-ws-line {
  font-size: 11px; line-height: 15px; color: var(--af-tertiary); margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-variant-numeric: tabular-nums; max-width: 520px;
}

/* ---- 渠道分区头 ---- */
.af-section { display: flex; align-items: baseline; justify-content: space-between; padding: 20px 4px 9px; font-size: 13px; font-weight: 600; color: var(--af-tertiary); }
.af-section + .af-list { margin-top: 0; }
.af-section-count { font-weight: 500; color: var(--af-tertiary); font-variant-numeric: tabular-nums; font-size: 12px; }

/* ---- 弹层 Modal（Apple sheet 风格） ---- */
.af-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(0, 0, 0, .5); display: grid; place-items: center; }
.af-modal {
  width: min(400px, calc(100vw - 48px)); max-height: 84vh; overflow: auto; padding: 20px;
  background: var(--af-bg); border: 1px solid var(--af-hairline-strong); border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, .5); color: var(--af-primary);
  font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif;
}
.af-modal-title { font-size: 17px; line-height: 22px; font-weight: 650; margin: 0 0 3px; }
.af-modal-sub { font-size: 13px; line-height: 18px; color: var(--af-secondary); margin: 0 0 12px; }
.af-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.af-qr { display: grid; place-items: center; gap: 8px; padding: 10px 0 4px; }
.af-qr-frame {
  width: 240px; height: 240px; border-radius: 14px; background: #fff;
  display: grid; place-items: center; overflow: hidden; border: 1px solid var(--af-hairline);
}
.af-qr-frame img { width: 232px; height: 232px; display: block; }
.af-qr-frame .fallback { color: #6e6e73; font-size: 13px; text-align: center; padding: 12px; }
.af-qr-timer { font-size: 12px; color: var(--af-tertiary); font-variant-numeric: tabular-nums; }
.af-qr-progress { width: 240px; height: 4px; border-radius: 999px; background: var(--af-surface-2); overflow: hidden; }
.af-qr-progress > span { display: block; height: 100%; background: var(--af-accent); width: 0; transition: width 1s linear; }
.af-qr-msg { font-size: 12px; line-height: 17px; color: var(--af-secondary); text-align: center; max-width: 280px; }
.af-steps { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 12px; color: var(--af-secondary); }
.af-steps li { display: flex; gap: 8px; }
.af-steps li::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--af-accent); margin-top: 6px; flex: none; }
.af-dirbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 10px; background: var(--af-surface); border-radius: 10px; font-size: 12px; color: var(--af-secondary); margin-bottom: 8px; max-height: 72px; overflow: auto; font-family: ui-monospace, "SF Mono", Consolas, monospace; }
.af-diritem { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 10px; cursor: pointer; font-size: 13px; color: var(--af-primary); }
.af-diritem:hover { background: var(--af-surface-2); }
.af-diritem svg { color: var(--af-tertiary); flex: none; }
.af-actions { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; flex: none; }
.af-more-btn {
  border: 0; background: transparent; color: var(--af-tertiary); width: 30px; height: 30px; flex: none;
  border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  opacity: 0; transition: opacity .12s;
}
.af-row:hover .af-more-btn, .af-more-btn:focus-visible { opacity: 1; }
.af-more-btn:hover { background: var(--af-surface-2); color: var(--af-primary); }
.af-menu-item.confirming { background: color-mix(in srgb, var(--af-danger) 16%, transparent); color: var(--af-danger); }
.af-menu-item.confirming svg { color: var(--af-danger); }
.af-menu-sep { height: 1px; background: var(--af-hairline); margin: 5px 6px; }

/* ---- 轻提示 Toast ---- */
.af-toast {
  position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%) translateY(8px); opacity: 0;
  background: color-mix(in srgb, var(--af-primary) 86%, var(--af-bg)); color: var(--af-bg);
  font-size: 13px; line-height: 18px; font-weight: 500; padding: 9px 16px; border-radius: 999px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .3); transition: opacity .18s ease, transform .18s ease;
  z-index: 1300; pointer-events: none; font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif;
}
.af-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }


/* B3 Header 浮层（C 变体；b3-header-* 命名空间；多规则同行以守 300 行红线） */
.b3-header { ${TOKEN_BLOCK} position: relative; display: inline-flex; align-items: center; color: var(--af-primary); font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; } .b3-header-dotbtn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--af-hairline-strong); background: var(--af-surface); cursor: pointer; display: inline-grid; place-items: center; padding: 0; } .b3-header-dotbtn:hover { border-color: var(--af-accent); } .b3-header-dotbtn:focus-visible { outline: 2px solid var(--af-accent); outline-offset: 1px; } .b3-header-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.b3-header-dot.online, .b3-header-dotbtn.online .b3-header-dot { background: var(--af-success); animation: b3-header-breathe 1.6s infinite; } .b3-header-dot.warn, .b3-header-dotbtn.warn .b3-header-dot { background: var(--af-warn); } .b3-header-dot.offline, .b3-header-dotbtn.offline .b3-header-dot { background: color-mix(in srgb, var(--af-primary) 35%, transparent); } .b3-header-dot.unbound, .b3-header-dotbtn.unbound .b3-header-dot { background: transparent; border: 1.5px solid color-mix(in srgb, var(--af-primary) 35%, transparent); width: 7px; height: 7px; }
.b3-header-pop { ${TOKEN_BLOCK} position: absolute; top: calc(100% + 8px); right: 0; z-index: 1200; width: 280px; background: var(--af-surface-2); border: 1px solid var(--af-hairline-strong); border-radius: 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, .25); color: var(--af-primary); font-family: -apple-system, "SF Pro Text", "PingFang SC", sans-serif; padding: 12px; font-size: 12px; line-height: 18px; } .b3-header-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; } .b3-header-sub { color: var(--af-secondary); margin-bottom: 8px; word-break: break-all; } .b3-header-row { display: flex; gap: 8px; } .b3-header-channels { display: grid; gap: 5px; margin-bottom: 8px; } .b3-header-chrow { display: flex; align-items: center; gap: 7px; font-size: 12px; } .b3-header-chbadge { width: 18px; height: 18px; flex: none; border-radius: 6px; display: inline-grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; } .b3-header-chlogo { position: relative; width: 18px; height: 18px; flex: none; display: inline-grid; place-items: center; } .b3-header-chlogo svg { display: block; } .b3-header-chlogoin { display: inline-grid; place-items: center; } .b3-header-chst { position: absolute; right: -3px; bottom: -3px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--af-surface-2); background: var(--af-success); } .b3-header-chst.warn { background: var(--af-warn); } .b3-header-chst.offline { background: color-mix(in srgb, var(--af-primary) 35%, transparent); }
.b3-header-btn { flex: 1; font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 9px; border: 1px solid var(--af-hairline-strong); background: var(--af-bg); color: var(--af-primary); cursor: pointer; } .b3-header-btn:hover { border-color: var(--af-accent); color: var(--af-accent); } .b3-header-btn.primary { background: var(--af-accent); border-color: var(--af-accent); color: #fff; } .b3-header-btn.primary:hover { color: #fff; opacity: .88; } .b3-header-btn:disabled { opacity: .6; cursor: default; } .b3-header-result { margin-top: 8px; font-size: 12px; color: var(--af-secondary); word-break: break-all; } .b3-header-result.ok { color: var(--af-success); } .b3-header-result.err { color: var(--af-danger); } @keyframes b3-header-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--af-success) 55%, transparent); } 70% { box-shadow: 0 0 0 6px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
`

/* 热重载安全：同名标签复写内容并加代戳（代际经 DOM 协调，跨 bundle 闭包也唯一）；清理函数只拆自己那代，旧 fiber 误伤不了新标签。 */
function installTag(styleId: string, css: string): () => void {
  if (typeof document === 'undefined') return () => {}
  try {
    let style = document.getElementById(styleId)
    if (!style) { style = document.createElement('style'); style.id = styleId; document.head.appendChild(style) }
    const prev = Number(style.getAttribute?.('data-gen') || 0)
    const gen = (Number.isFinite(prev) ? prev : 0) + 1
    style.textContent = css
    style.setAttribute('data-gen', String(gen))
    return () => { try { const cur = document.getElementById(styleId); if (cur && cur.getAttribute?.('data-gen') === String(gen)) cur.remove() } catch {} }
  } catch {
    return () => {}
  }
}

/** 按功能命名空间安装样式（F0 先合并点③）：各 feature 自带 CSS 经此注入，互不串色；返回清理函数。 */
export function installFeatureStyles(id: string, css: string): () => void {
  return installTag('af-feature-' + id, css)
}

/** 安装全局样式（幂等，热重载安全）；返回清理函数。 */
export function installStyles(): () => void {
  return installTag(STYLE_ID, CSS)
}