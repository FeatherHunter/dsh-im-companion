/** TEMP 设计演示（定稿即删）：组行左缘竖条（保留）＋ 会话行三种视觉变体对照。徽标位不动，卸载即净。
 * 2026-09-07：图标角标/悬浮气泡已删；新增 data-dp-variant 切换器（v1 竖条/v2 标题色/v3 行尾点），
 * 数据层 data-dp-sess 三种变体完全一致，仅展示路由差异。 */
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
/* —— v1 会话行：左缘 2px 竖条（现状） —— */
'[data-dp-sess]{position:relative}',
'[data-dp-sess]::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:1px;pointer-events:none}',
'[data-dp-sess=exec]::before{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'[data-dp-sess=seen]::before{background:#dc6803}',
'[data-dp-sess=done]::before{background:#dc6803}',
'[data-dp-sess=red]::before{background:#d92d20;animation:dp-blink 1s infinite}',
'@media (prefers-reduced-motion:reduce){div[role=treeitem][aria-expanded][data-dp-act]::before,[data-dp-sess]::before{animation:none}}',
/* —— v2 会话行：标题文字状态色（无竖条；原生点图标位由官方 CSS 变量显式控制，不受行级 color 污染） —— */
'body[data-dp-variant=text] [data-dp-sess]{position:static}',
'body[data-dp-variant=text] [data-dp-sess]::before{content:none}',
'body[data-dp-variant=text] [data-dp-sess=exec]{color:#7ab8ff}',
'body[data-dp-variant=text] [data-dp-sess=seen]{color:#f5b26b}',
'body[data-dp-variant=text] [data-dp-sess=done]{color:#f5b26b}',
'body[data-dp-variant=text] [data-dp-sess=red]{color:#ff8a80}',
/* —— v3 会话行：行尾状态点（无竖条；点贴行尾时间后） —— */
'body[data-dp-variant=trail] [data-dp-sess]{position:relative}',
'body[data-dp-variant=trail] [data-dp-sess]::before{content:none}',
'body[data-dp-variant=trail] [data-dp-sess]::after{content:"";position:absolute;right:2px;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;pointer-events:none}',
'body[data-dp-variant=trail] [data-dp-sess=exec]::after{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'body[data-dp-variant=trail] [data-dp-sess=seen]::after{background:#dc6803}',
'body[data-dp-variant=trail] [data-dp-sess=done]::after{background:#dc6803}',
'body[data-dp-variant=trail] [data-dp-sess=red]::after{background:#d92d20;animation:dp-blink 1s infinite}',
/* —— 对照器面板（TEMP，定稿即删） —— */
'.dp-switch{position:fixed;right:8px;bottom:8px;z-index:9999;display:flex;gap:4px;padding:6px;border-radius:10px;background:rgba(28,28,30,.9);border:1px solid rgba(255,255,255,.12)}',
'.dp-switch-btn{appearance:none;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:transparent;color:#c9cdd4;font-size:11px;line-height:1;padding:5px 8px;cursor:pointer}',
'.dp-switch-btn:hover{background:rgba(255,255,255,.08)}',
].join(String.fromCharCode(10));
