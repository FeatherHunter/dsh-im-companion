/** TEMP 设计演示（定稿即删）：组行左缘竖条（保留）＋ 会话行六种视觉变体对照。徽标位不动，卸载即净。
 * 2026-09-07：数据层 data-dp-sess 六变体完全一致，仅展示路由差异（body[data-dp-variant]）。
 * v1 竖条 / v2 标题色 / v3 行尾点 / v4 整行淡底 / v5 标题前胶囊 / v6 改良竖条（加宽+对齐）。 */
export const CSS = [
/* —— 组行竖条（所有 variant 保留；用户裁定：组行竖条聚合态，是本方案的锚） —— */
'div[role=treeitem][aria-expanded][data-dp-act]{position:relative}',
'div[role=treeitem][aria-expanded][data-dp-act]::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:1px;background:#98a2ad;pointer-events:none}',
'div[role=treeitem][aria-expanded][data-dp-act=need]::before{background:#d92d20;animation:dp-blink 1s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=exec]::before{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=seen]::before{background:#dc6803}',
'@keyframes dp-breathe{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}',
'@keyframes dp-blink{0%,100%{opacity:1}50%{opacity:.25}}',
'div[role=treeitem][aria-expanded][data-dp-act=nosig]::before{background:transparent;border-left:3px dotted #b0b6bd;width:0}',
'div[role=treeitem][aria-expanded][data-dp-act=nosig0]::before{background:transparent;border-left:3px dotted #d92d20;width:0}',
'@media (prefers-reduced-motion:reduce){div[role=treeitem][aria-expanded][data-dp-act]::before,[data-dp-sess]::before{animation:none}}',
/* —— v1 默认：会话行左缘 2px 竖条 —— */
'[data-dp-sess]{position:relative}',
'[data-dp-sess]::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:1px;pointer-events:none}',
'[data-dp-sess=exec]::before{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'[data-dp-sess=seen]::before{background:#dc6803}',
'[data-dp-sess=done]::before{background:#dc6803}',
'[data-dp-sess=red]::before{background:#d92d20;animation:dp-blink 1s infinite}',
/* —— v2 标题色：整行文本状态色（原生点图标位由官方 CSS 变量显式控制，不受行级 color 污染） —— */
'body[data-dp-variant=text] [data-dp-sess]{position:static}',
'body[data-dp-variant=text] [data-dp-sess]::before{content:none}',
'body[data-dp-variant=text] [data-dp-sess=exec]{color:#7ab8ff}',
'body[data-dp-variant=text] [data-dp-sess=seen]{color:#f5b26b}',
'body[data-dp-variant=text] [data-dp-sess=done]{color:#f5b26b}',
'body[data-dp-variant=text] [data-dp-sess=red]{color:#ff8a80}',
/* —— v3 行尾点：行尾 8px 状态圆点 —— */
'body[data-dp-variant=trail] [data-dp-sess]{position:relative}',
'body[data-dp-variant=trail] [data-dp-sess]::before{content:none}',
'body[data-dp-variant=trail] [data-dp-sess]::after{content:"";position:absolute;right:2px;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;pointer-events:none}',
'body[data-dp-variant=trail] [data-dp-sess=exec]::after{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'body[data-dp-variant=trail] [data-dp-sess=seen]::after{background:#dc6803}',
'body[data-dp-variant=trail] [data-dp-sess=done]::after{background:#dc6803}',
'body[data-dp-variant=trail] [data-dp-sess=red]::after{background:#d92d20;animation:dp-blink 1s infinite}',
/* —— v4 整行淡底：行内铺 8% 状态色背景（避开 selected 高亮冲突：背景压官方层之下用 z-index 0） —— */
'body[data-dp-variant=tint] [data-dp-sess]{position:relative}',
'body[data-dp-variant=tint] [data-dp-sess]::before{content:none}',
'body[data-dp-variant=tint] [data-dp-sess]::after{content:"";position:absolute;inset:1px 4px;border-radius:4px;pointer-events:none;z-index:-1}',
'body[data-dp-variant=tint] [data-dp-sess=exec]::after{background:rgba(22,119,255,.07)}',
'body[data-dp-variant=tint] [data-dp-sess=seen]::after{background:rgba(220,104,3,.08)}',
'body[data-dp-variant=tint] [data-dp-sess=done]::after{background:rgba(220,104,3,.08)}',
'body[data-dp-variant=tint] [data-dp-sess=red]::after{background:rgba(217,45,32,.09)}',
/* —— v5 标题前胶囊：标题文字左侧 12x12 圆角色块 —— */
'body[data-dp-variant=chip] [data-dp-sess]{position:relative}',
'body[data-dp-variant=chip] [data-dp-sess]::before{content:none}',
'body[data-dp-variant=chip] [data-dp-sess]::after{content:"";position:absolute;left:6px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:4px;pointer-events:none}',
'body[data-dp-variant=chip] [data-dp-sess=exec]::after{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'body[data-dp-variant=chip] [data-dp-sess=seen]::after{background:#dc6803}',
'body[data-dp-variant=chip] [data-dp-sess=done]::after{background:#dc6803}',
'body[data-dp-variant=chip] [data-dp-sess=red]::after{background:#d92d20;animation:dp-blink 1s infinite}',
/* —— v6 改良竖条：加宽 4px + 垂直全程（top0 bottom0）+ 圆角0，治"2px 悬空贴边"的怪感 —— */
'body[data-dp-variant=bar6] [data-dp-sess]::before{width:4px;top:0;bottom:0;border-radius:0}',
/* —— 对照器面板（TEMP，定稿即删） —— */
'.dp-switch{position:fixed;right:8px;bottom:8px;z-index:9999;display:flex;gap:4px;padding:6px;border-radius:10px;background:rgba(28,28,30,.9);border:1px solid rgba(255,255,255,.12)}',
'.dp-switch-btn{appearance:none;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:transparent;color:#c9cdd4;font-size:11px;line-height:1;padding:5px 8px;cursor:pointer}',
'.dp-switch-btn:hover{background:rgba(255,255,255,.08)}',
].join(String.fromCharCode(10));
