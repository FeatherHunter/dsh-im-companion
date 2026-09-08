/** unread 行染色样式（命名空间 unread-*）：组行左缘竖条（聚合态）＋ 会话行标题状态色（个体态）。徽标位不动，卸载即净。
 * 由 design-preview #45 定稿视觉迁移：data-dp-* 前缀退役 → data-unread-*；竖条语义不变
 *（need 红异常 / exec 蓝执行中 / seen 黄待看）；会话标题色 exec 蓝 / seen·done 黄 / red 红；平静保持官方灰。
 * 诊断灰 nosig/nosig0 未迁：unread 未匹配组直接清色（不清即谎），不做 demo 式 entry 级诊断染色。 */
export const CSS = [
/* —— 组行竖条（聚合态） —— */
'div[role=treeitem][aria-expanded][data-unread-act]{position:relative}',
'div[role=treeitem][aria-expanded][data-unread-act]::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:1px;background:#98a2ad;pointer-events:none}',
'div[role=treeitem][aria-expanded][data-unread-act=need]::before{background:#d92d20;animation:unread-blink 1s infinite}',
'div[role=treeitem][aria-expanded][data-unread-act=exec]::before{background:#1677ff;animation:unread-breathe 1.6s infinite}',
'div[role=treeitem][aria-expanded][data-unread-act=seen]::before{background:#dc6803}',
'@keyframes unread-breathe{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}',
'@keyframes unread-blink{0%,100%{opacity:1}50%{opacity:.25}}',
'@media (prefers-reduced-motion:reduce){div[role=treeitem][aria-expanded][data-unread-act]::before{animation:none}}',
/* —— 会话行标题状态色（个体态；无竖条，原生点保留官方语义） —— */
'[data-unread-sess=exec]{color:#7ab8ff}',
'[data-unread-sess=seen]{color:#f5b26b}',
'[data-unread-sess=done]{color:#f5b26b}',
'[data-unread-sess=red]{color:#ff8a80}',
].join(String.fromCharCode(10));
