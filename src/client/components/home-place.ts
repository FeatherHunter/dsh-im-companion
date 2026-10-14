/** 弹层几何（T7 #112 真机 bug 后抽出的纯函数）：不碰 DOM ⇒ verify 可直接断言边界情形。
 * 规则照原型 proto-studio.html：下方放不下就翻上方；左右夹在视口内；贴边改右/左对齐；顶边不小于 8px。
 * 为什么必须纯：真机上「切分段后弹层跳到窗口左上」正是定位分支在 DOM 变化下走了兜底路径，
 * 而兜底逻辑过去只藏在 DOM 函数里、任何静态断言都看不见（2026-10-14 真机实证）。 */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Size {
  w: number
  h: number
}

export interface Placement {
  left: number
  top: number
  arrowX: number
  below: boolean
}

/** 锚点与弹层之间的缝、左右留边、上下留边（与原型一致）。 */
export const POP_GAP = 9
export const POP_PAD = 10
export const POP_EDGE = 8
/** 弹层宽度下限：锚点是行内小按钮（改名铅笔/两步删除）时也不能把弹层压成一条；300＝历史默认宽。 */
export const POP_MIN_W = 300

/** 弹层宽度＝锚点宽度（下限 POP_MIN_W，上限视口 − 20）：和「＋ 新建家」这类满宽按钮等宽，
 *  弹层才像「从按钮长出来的一层」，而不是浮在中间的窄卡片（owner 2026-10-14 裁定）。 */
export function widthFor(anchorW: number, vpW: number): number {
  const max = Math.max(POP_MIN_W, Math.round(vpW) - 20)
  return Math.min(Math.max(Math.round(anchorW), POP_MIN_W), max)
}

/** 视口 + 锚点矩形 + 弹层尺寸 ⇒ 弹层落位（纯函数，输入相同输出必相同）。
 *  `limitBottom`＝弹层下边不许越过的界（缺省视口下沿）。锚点在面板里时必须传面板下沿：
 *  否则贴底的「＋ 新建家」按钮会把弹层放到按钮下方、半截挂在设置面板外（2026-10-14 第二次目验实证）。
 *  `preferAbove`＝强制开在锚点上方（贴底主操作专用，owner 2026-10-15 裁定「弹窗要在按钮上面」）。
 *  上方落位时 wantTop ≤ maxTop 恒成立（anchor.top ≤ vp.h），故下面那个 maxTop 夹取不会把它推回按钮下方。 */
export function computePlacement(vp: Size, anchor: Rect, size: Size, limitBottom?: number, preferAbove?: boolean): Placement {
  const bound = typeof limitBottom === 'number' && isFinite(limitBottom) ? Math.min(limitBottom, vp.h - POP_EDGE) : vp.h - POP_EDGE
  const below = preferAbove ? false : anchor.bottom + POP_GAP + size.h <= bound
  const wantTop = below ? anchor.bottom + POP_GAP : anchor.top - POP_GAP - size.h
  const maxTop = Math.max(POP_EDGE, Math.round(vp.h - size.h - POP_EDGE))
  const top = Math.min(Math.max(POP_EDGE, Math.round(wantTop)), maxTop)
  const maxL = Math.max(POP_PAD, vp.w - size.w - POP_PAD)
  const centered = anchor.left + anchor.width / 2 - size.w / 2
  let want = centered
  if (centered > maxL) want = anchor.right - size.w
  else if (centered < POP_PAD) want = anchor.left
  const left = Math.min(Math.max(POP_PAD, Math.round(want)), maxL)
  const arrowMax = Math.max(12, size.w - 22)
  const arrowX = Math.min(Math.max(12, Math.round(anchor.left + anchor.width / 2 - left - 6)), arrowMax)
  return { left, top, arrowX, below }
}
