/** 组行状态竖条（#57 转正，原 TEMP 演示）：组行左缘竖条（聚合态）＋ 会话行标题状态色（个体态）。徽标位不动，卸载即净。
 * 2026-09-07 固化（用户拍板：V1+V2 组合，V3/V4/V5/V6 淘汰）：
 * 分级语言——组行竖条回答"哪组要看"，会话行标题色回答"哪条要看"；原生点图标位由官方 CSS 变量
 * 显式控制，不受行级 color 污染；平静会话保持官方灰（彩色=有信号，正相关非噪音）。 */
export const CSS = [
/* —— 组行竖条（聚合态） —— */
'div[role=treeitem][aria-expanded][data-dp-act]{position:relative}',
'div[role=treeitem][aria-expanded][data-dp-act]::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:1px;background:#98a2ad;pointer-events:none}',
'div[role=treeitem][aria-expanded][data-dp-act=need]::before{background:#d92d20;animation:dp-blink 1s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=exec]::before{background:#1677ff;animation:dp-breathe 1.6s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=seen]::before{background:#dc6803}',
'div[role=treeitem][aria-expanded][data-dp-act=nosig]::before{background:transparent;border-left:3px dotted #b0b6bd;width:0}',
/* #61 修复（Q1 锁定：nosig0 与平静一致无条）：陈旧 data-dp-act=nosig0（热重载旧 DOM/首刷前）
 * 兜底不渲染任何竖条，永不使用异常红；新 paint 已不再产出 nosig0 act，诊断只留 tip。 */
'div[role=treeitem][aria-expanded][data-dp-act=nosig0]::before{display:none}',
'@keyframes dp-breathe{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}',
'@keyframes dp-blink{0%,100%{opacity:1}50%{opacity:.25}}',
'@media (prefers-reduced-motion:reduce){div[role=treeitem][aria-expanded][data-dp-act]::before{animation:none}}',
/* —— 会话行标题状态色（个体态；无竖条，原生点保留官方语义） —— */
'[data-dp-sess=exec]{color:#7ab8ff}',
'[data-dp-sess=seen]{color:#f5b26b}',
'[data-dp-sess=done]{color:#f5b26b}',
'[data-dp-sess=red]{color:#ff8a80}',
].join(String.fromCharCode(10));
