/** TEMP 设计演示（定稿即删）：左缘活性竖条（组行+会话行）。徽标位不动，卸载即净。
 * 2026-09-07：图标角标（data-dp-icon）与悬浮气泡（dp-bubble）已删——用户裁定与竖条功能重复/污染视觉。 */
export const CSS = [
'div[role=treeitem][aria-expanded][data-dp-act]{position:relative}',
'div[role=treeitem][aria-expanded][data-dp-act]::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:1px;background:#98a2ad;pointer-events:none}',
'div[role=treeitem][aria-expanded][data-dp-act=need]::before{background:#d92d20;animation:dp-blink 1s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=exec]::before{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=seen]::before{background:#dc6803}',
'@keyframes dp-breathe{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}',
'@keyframes dp-blink{0%,100%{opacity:1}50%{opacity:.25}}',
'@media (prefers-reduced-motion:reduce){div[role=treeitem][aria-expanded][data-dp-act]::before,[data-dp-sess]::before{animation:none}}',
'div[role=treeitem][aria-expanded][data-dp-act=nosig]::before{background:transparent;border-left:3px dotted #b0b6bd;width:0}',
'div[role=treeitem][aria-expanded][data-dp-act=nosig0]::before{background:transparent;border-left:3px dotted #d92d20;width:0}',
'[data-dp-sess]{position:relative}',
'[data-dp-sess]::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:1px;pointer-events:none}',
'[data-dp-sess=exec]::before{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'[data-dp-sess=seen]::before{background:#dc6803}',
'[data-dp-sess=done]::before{background:#dc6803}',
'[data-dp-sess=red]::before{background:#d92d20;animation:dp-blink 1s infinite}',
].join(String.fromCharCode(10));
