/** presence 动效总控样式（E1 · 方向 A，用户裁定 2026-09-04：不画点，只定档位）。
 * 跨边界只读覆盖（评审已知，见 #19）：B1 拥有全部徽标视觉（B1 文件零触碰），本文件只在
 * body 档位下调整 B1 已有呼吸的时长 / 开关；摘除本特性即恢复 B1 原生行为。选择器只读
 * B1 的 data-lb-kind 与 card-dot，不写 B1 任何属性与节点。系统偏好由 B1 自带媒体查询负责。
 * 开关样式（#98 搬家，2026-09-24 用户裁定）：右下角悬浮胶囊（position: fixed 自有图层）退役，
 * 改挂左栏筛选条内、收起钮左侧——条带是 flex 行（gap 6px），故本钮 flex:none 与收起钮 26×26 同行居中对齐。
 * **紧凑度（#98 真机反馈第 1 轮，2026-09-24）**：最初 20×20 盒 + 条带 gap 6px + 收起钮自身 6px 内边距 ⇒
 * 点两侧各约 12px 空档，看着「这点占了更大空间」。改为**盒 14×14（点 8px + 每侧 3px 余量）+ 负外边距
 * `margin: 0 -8px 0 -2px` 吃掉条带间隙**：左右视觉间距各收进 ~7px（右侧那 2px 压进收起钮的空白内边距，
 * 既遮不到它的图标、也不抢它的点击——它 DOM 在后、命中优先）。**只动盒与间隙，不动点的 8px 尺寸与位置**；
 * 想再靠近/推远只调这一行的 width/height 与 margin 两个数。
 * **禁占 .af-* 私有约定**（九律 ⑥）；一律自有 presence-* 命名空间。
 * 点色两态：绿 = 手动开（默认）／灰 = 手动关；系统 prefers-reduced-motion 与实例数自动降级**不进点色**
 * （那是环境态，不是用户的开关）。无可视气泡（用户裁定「文案不加」）⇒ 无 title、无自画卡，只有 aria-label。 */
export const CSS = `
body[data-presence-level="reduced"] div[role="treeitem"][aria-expanded][data-lb-kind="online"]::after { animation-duration: 2.8s; }
body[data-presence-level="static"] div[role="treeitem"][aria-expanded][data-lb-kind="online"]::after { animation: none; }
body[data-presence-level="reduced"] .left-badges-card-dot.online { animation-duration: 2.8s; }
body[data-presence-level="static"] .left-badges-card-dot.online { animation: none; }
.presence-motion-btn { flex: none; width: 14px; height: 14px; margin: 0 -8px 0 -2px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 0; -webkit-appearance: none; appearance: none; }
.presence-motion-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .16)); }
.presence-motion-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-success-primary, #30d158); outline-offset: 1px; }
.presence-motion-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-state-success-primary, #30d158); }
.presence-motion-btn[aria-pressed="true"] .presence-motion-dot { background: var(--dsw-alias-label-tertiary, #98989d); }
`
