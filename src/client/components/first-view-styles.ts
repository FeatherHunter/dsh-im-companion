/** 首屏赢家样式（#25 D 拼装，#26 实现票自有）：只新增 af- 类，既有规则零改动。
 * 经 installFeatureStyles('first-view') 注入（theme.ts 一字不动，防 300 行破线）；
 * 颜色全走 --af-* 别名，深浅主题自动跟随，不开新分支。 */
import { installFeatureStyles } from '../theme'

export const FIRST_VIEW_STYLE_ID = 'first-view'

export const FIRST_VIEW_CSS = `/* D 标题：中文大标题（#82：英文小字副标已删——548px 单行塞不下，让位给标题与版本胶囊） */

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

/* #56 右上组（对标 deck dsws-cfg-head：右组 margin-left:auto 推右；版本组 11px→10px 胶囊可点）。
 * #78 顶部必须单行（用户裁定）：.af-hd 不换行，右组 flex:none 不压缩，左块 min-width:0 先让位
 * （标题 ellipsis 兜底），宽度再紧也不会把右组挤到第二行。
 * #82 用户重申：仍不许换行，极窄时宁可出省略号。 */
.af-hd { flex-wrap: nowrap; }
.af-hd-left { min-width: 0; }
.af-hd-left .af-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* #82 右组收紧：间隙 8→6、右上按钮 36→32（与工具栏同尺寸）——548px 下单行余量才够英文界面 */
.af-hd-right { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; flex: none; }
.af-hd-right .af-icon-btn { width: 32px; height: 32px; border-radius: 10px; flex: none; }

/* 工具栏单行不断行：4 按钮与搜索/分段同行（搜索可压到 0，按钮 32px 不换行不缩小；theme 本体不动）。 */
.af-toolbar { flex-wrap: nowrap; }
.af-toolbar .af-search { min-width: 0; }
.af-toolbar .af-icon-btn { width: 32px; height: 32px; border-radius: 10px; flex: none; }

/* #82 三色版本胶囊（用户裁定：颜色即身份，文案只留轴名 + 版本号）：
 * 紫 = 本插件 / 蓝白 = 兼容的 dsh-im / 黑白 = 宿主 dsh（DeepSeek 黑白风）。
 * 色相固定（紫 #8b5cf6、上游蓝 #3370ff——与 icons.ts 渠道品牌色同源先例），
 * 明度与主题前景色混合 → 深浅两套主题都读得清；宿主走单色别名，天然跟随主题。 */
.af-verbox { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.af-cap { display: inline-flex; align-items: center; font-size: 10px; line-height: 15px; font-weight: 600; padding: 1px 7px; border-radius: 999px; border: 1px solid transparent; text-decoration: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
.af-cap--self { color: color-mix(in srgb, #8b5cf6 62%, var(--af-primary)); background: color-mix(in srgb, #8b5cf6 16%, transparent); border-color: color-mix(in srgb, #8b5cf6 45%, transparent); }
.af-cap--im { color: color-mix(in srgb, #3370ff 62%, var(--af-primary)); background: color-mix(in srgb, #3370ff 14%, transparent); border-color: color-mix(in srgb, #3370ff 42%, transparent); }
.af-cap--host { color: color-mix(in srgb, #8e8e93 58%, var(--af-primary)); background: color-mix(in srgb, #8e8e93 14%, transparent); border-color: color-mix(in srgb, #8e8e93 46%, transparent); }
.af-cap:hover { border-color: currentColor; }

@media (prefers-reduced-motion: reduce) {
  .af-row .af-actions .af-btn, .af-row .af-actions .af-more-btn { transition: none; transform: none; }
}

/* #62 创建表单双行：单行 5 元素在窄栏必挤折行（按钮竖排/粘连）；只新增类，.af-compose 本体不动 */
.af-compose--create { flex-wrap: wrap; row-gap: 8px; }
.af-compose--create .af-compose-row { display: flex; align-items: center; gap: 8px; flex: 1 1 100%; min-width: 0; }
.af-compose--create .af-compose-row input { min-width: 0; }
.af-compose--create .af-btn { white-space: nowrap; flex: none; }
.af-compose-home { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--af-secondary); }

/* #62 选家醒目：不选建不出——必填徽＋空态整行高亮＋空态警告色；只新增类 */
.af-required { flex: none; font-size: 11px; font-weight: 700; white-space: nowrap; color: var(--af-danger); background: color-mix(in srgb, var(--af-danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--af-danger) 35%, transparent); border-radius: 999px; padding: 2px 8px; }
.af-compose-row--attention { border: 1px dashed color-mix(in srgb, var(--af-danger) 45%, transparent); border-radius: 9px; padding: 6px 8px; background: color-mix(in srgb, var(--af-danger) 6%, transparent); }
.af-compose-home--empty { color: var(--af-danger); font-weight: 600; }

/* #62 创建可点态一目了然：禁用主按钮去色（全局仅降透明，橙底仍像可点）＋缺件原因直说
 * （选择器避开 btn＋primary 连写字面——首屏断言禁该字面回潮；三类＋伪类特异性照赢主题规则） */
.af-compose--create .primary:disabled { background: var(--af-surface-2); color: var(--af-tertiary); }
.af-compose-reason { flex: 1 1 100%; min-width: 0; font-size: 12px; color: var(--af-danger); }

/* #62 已选家整行落定：描边＋底色＋图标＋全路径加粗（整行都是重点；只新增类） */
.af-compose-row--set { border: 1px solid color-mix(in srgb, var(--af-accent) 45%, transparent); border-radius: 9px; padding: 6px 8px; background: color-mix(in srgb, var(--af-accent) 10%, transparent); }
.af-compose-home--set { color: var(--af-primary); font-weight: 600; font-size: 13px; }
.af-compose-home--set svg { flex: none; color: var(--af-accent); vertical-align: -2px; }

`;

/** 安装首屏赢家样式（幂等，热重载安全）；返回清理函数，面板卸载时调用。 */
export function installFirstViewStyles(): () => void {
  return installFeatureStyles(FIRST_VIEW_STYLE_ID, FIRST_VIEW_CSS)
}
