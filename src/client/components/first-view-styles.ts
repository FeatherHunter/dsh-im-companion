/** 首屏赢家样式（#25 D 拼装，#26 实现票自有）：只新增 af- 类，既有规则零改动。
 * 经 installFeatureStyles('first-view') 注入（theme.ts 一字不动，防 300 行破线）；
 * 颜色全走 --af-* 别名，深浅主题自动跟随，不开新分支。 */
import { installFeatureStyles } from '../theme'

export const FIRST_VIEW_STYLE_ID = 'first-view'

export const FIRST_VIEW_CSS = `/* D 标题：中文大标题 + 英文小字副标（计数行已收起，计数看分段后缀） */
.af-title-sub { margin-top: 2px; font-size: 13px; font-weight: 400; letter-spacing: .14em; color: var(--af-tertiary); }

/* B 悬停统一：平时只留状态，整行 hover / 行内聚焦 / 触屏点行才出按钮组 */
.af-row .af-actions .af-btn, .af-row .af-actions .af-more-btn {
  opacity: 0; pointer-events: none; transform: translateX(4px);
  transition: opacity .15s ease, transform .15s ease;
}
.af-row:hover .af-actions .af-btn, .af-row:hover .af-actions .af-more-btn,
.af-row:focus-within .af-actions .af-btn, .af-row:focus-within .af-actions .af-more-btn,
.af-row.af-tap .af-actions .af-btn, .af-row.af-tap .af-actions .af-more-btn {
  opacity: 1; pointer-events: auto; transform: none;
}
.af-row:focus-visible { outline: 2px solid color-mix(in srgb, var(--af-accent) 60%, transparent); outline-offset: -2px; }

/* 长名不撑乱：单行省略 + title 见全名（ws 行既有省略，本票不动） */
.af-name { min-width: 0; overflow: hidden; }
.af-name > span:first-child { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* D 莫兰迪兜底头像（仅 Xiao 系默认渐变；用户自设头像走 img 层，不受影响） */
.af-av-m0 { background: linear-gradient(135deg, #b76e79, #8e5a6e); }
.af-av-m1 { background: linear-gradient(135deg, #7d9b8a, #4f7a6a); }
.af-av-m2 { background: linear-gradient(135deg, #6f86b8, #4a5f8f); }
.af-av-m3 { background: linear-gradient(135deg, #c2a878, #8f7448); }

/* P2 引流星标：ghost 虚线风，与详情 ghost 同级 */
.af-icon-btn.af-star { background: transparent; border: 1px dashed var(--af-hairline-strong); text-decoration: none; }

/* P2 底部关联卡：名 + 一句话 + 右箭头，新开页 */
.af-promo { margin-top: 12px; background: var(--af-surface); border: 1px dashed var(--af-hairline-strong); border-radius: 12px; padding: 10px 14px; }
.af-promo-title { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--af-secondary); }
.af-promo-item { display: flex; gap: 8px; align-items: center; padding: 8px 2px; color: var(--af-primary); text-decoration: none; font-size: 13px; border-top: 1px solid var(--af-hairline); }
.af-promo-item:first-of-type { border-top: 0; }
.af-promo-item b { font-weight: 600; }
.af-promo-item span { color: var(--af-secondary); font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.af-promo-item i { color: var(--af-accent); font-style: normal; }

@media (prefers-reduced-motion: reduce) {
  .af-row .af-actions .af-btn, .af-row .af-actions .af-more-btn { transition: none; transform: none; }
}

`;

/** 安装首屏赢家样式（幂等，热重载安全）；返回清理函数，面板卸载时调用。 */
export function installFirstViewStyles(): () => void {
  return installFeatureStyles(FIRST_VIEW_STYLE_ID, FIRST_VIEW_CSS)
}
