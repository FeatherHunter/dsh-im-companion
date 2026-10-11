## 需求（owner 2026-10-10）

面板右上那颗 ⭐（`af-star`，跳仓库点 Star）的**左侧**放「检查更新」按钮（即 update-center 的挂载点）。

## 现状

A1 面板 `src/client/components/panel.ts` 里，`#imc-update-center` 空容器挂在 `hd → toolbar → updateCenterHost → compose → body → promo` 序列中（owner 2026-09-12 裁定的位置）；右上组 `af-hd-right` 当前是 `verBox, starLink, feedbackLink`。

## 改法（只挪容器节点，A1 对特性仍零感知）

`updateCenterHost` 建好后放进 `af-hd-right`，顺序 `verBox, updateCenterHost, starLink, feedbackLink`；root 里删掉原位置。类名 / id / 事件派发 / 特性侧零改（契约 §4 事件制通道不变：id 仍是 P0-b 的认领把手）。

## 触碰面

`src/client/components/panel.ts`（A1 私有 → 契约 §3 单 PR）+ `tools/verify/features/update-center.ts`（本特性命名空间断言）。共享层与特性实现零改。
