/** 组行状态竖条（#57 转正，原 TEMP 演示）：组行左缘竖条（聚合态）＋ 会话行标题状态色（个体态）。徽标位不动，卸载即净。
 * 2026-09-07 固化（用户拍板：V1+V2 组合，V3/V4/V5/V6 淘汰）：
 * 分级语言——组行竖条回答"哪组要看"，会话行标题色回答"哪条要看"；原生点图标位由官方 CSS 变量
 * 显式控制，不受行级 color 污染；平静会话保持官方灰（彩色=有信号，正相关非噪音）。
 * #151 第一性原理映射（asar 实证 bundle 182MB）：need=error-primary #ec1313（需处理）／
 * exec=business-primary #4176e6（执行中蓝）／seen=warn-primary #f59e0b（待看黄）／
 * 无信号=idle-primary #d4d4d4；行标题 exec=同蓝、seen/done=warn-secondary #f7ad31、red=error-secondary #f25a5a。
 * 旧硬编码 #d92d20/#1677ff/#dc6803/#98a2ad/#b0b6bd/#7ab8ff/#f5b26b/#ff8a80 已全部退役。 */
export const CSS = [
/* —— 组行竖条（聚合态） —— */
'div[role=treeitem][aria-expanded][data-dp-act]{position:relative}',
'div[role=treeitem][aria-expanded][data-dp-act]::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:1px;background:var(--dsw-alias-state-idle-primary,#d4d4d4);pointer-events:none}',
'div[role=treeitem][aria-expanded][data-dp-act=need]::before{background:var(--dsw-alias-state-error-primary,#ec1313);animation:dp-blink 1s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=exec]::before{background:var(--dsw-alias-state-business-primary,#4176e6);animation:dp-breathe 1.6s infinite}',
'div[role=treeitem][aria-expanded][data-dp-act=seen]::before{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
'div[role=treeitem][aria-expanded][data-dp-act=nosig]::before{background:transparent;border-left:3px dotted var(--dsw-alias-state-idle-primary,#d4d4d4);width:0}',
/* #61 修复（Q1 锁定：nosig0 与平静一致无条）：陈旧 data-dp-act=nosig0（热重载旧 DOM/首刷前）
 * 兜底不渲染任何竖条，永不使用异常红；新 paint 已不再产出 nosig0 act，诊断只留 tip。 */
'div[role=treeitem][aria-expanded][data-dp-act=nosig0]::before{display:none}',
'@keyframes dp-breathe{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}',
'@keyframes dp-blink{0%,100%{opacity:1}50%{opacity:.25}}',
'@media (prefers-reduced-motion:reduce){div[role=treeitem][aria-expanded][data-dp-act]::before{animation:none}}',
/* —— 会话行标题状态色（个体态；无竖条，原生点保留官方语义） —— */
'[data-dp-sess=exec]{color:var(--dsw-alias-state-business-primary,#4176e6)}',
'[data-dp-sess=seen]{color:var(--dsw-alias-state-warn-secondary,#f7ad31)}',
'[data-dp-sess=done]{color:var(--dsw-alias-state-warn-secondary,#f7ad31)}',
'[data-dp-sess=red]{color:var(--dsw-alias-state-error-secondary,#f25a5a)}',
].join(String.fromCharCode(10));
