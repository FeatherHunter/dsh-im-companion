Part of #1

## Question

拖拽交互：把 Fleet 的 Agent/bot 拖到左栏工作区完成绑定；拖拽目标判定、冲突（已被绑定）、撤销/二次确认；依赖 D1 的反向声明形态。

## Done when

真机拖拽流畅、可撤销、冲突提示清晰。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 设计问题与分支（grilling 结论，2026-09-03）

设计问题：拖拽领养状态流转是否顺畅（目标判定、冲突换绑、撤销语义），而非像素级长相 → 走 LOGIC 分支：单文件可分享 HTML。

已定：冲突 = 二次确认后换绑（1 Bot 归属 1 Workspace）；撤销 = 两者都要（冲突换绑前置确认 + 所有绑定 toast 撤销窗口）；目标 = 仅左栏工作区行可放，空位/空白 = 不可放（不做“拖出新建”）；源 = 抽象 Bot 行，不绑定 C1a/C1b 具体控件（两者仍在开发中，verdict 落 reducer，实现时 dispatch 同一 action）；D1（#11）仍 OPEN，记开放问题，写路径假设 bot.workspace.set 直写，#11 关闭后若语义变化再回炉。

## 原型

prototypes/e2-adopt/prototype-e2-adopt.html（抛弃式，双击即开）：纯 reducer（start/over/drop/confirm/undo/tick）+ 状态面板 + 自由操作 + 4 个走查 Tab（正常绑定 / 冲突换绑+撤销 / 非法尝试 / 取消与反悔）。reducer 11 项迁移自检全绿，壳脚本 node --check 通过。

## 进度：80%

下一步：请用户双击打开原型走查确认（换绑确认文案、撤销窗口步数、空位不可放提示）；确认后把 verdict 折叠进实现，并按原型技能规则把原型 capture 到 throwaway 分支（main 只留 validated 决策）。

待确认事项：走查结论；D1（#11）语义变化时回炉。未确认前不 close。

## 走查结论（2026-09-03，用户已认可）

设计与效果认可，按现状实现：换绑确认文案、5s 撤销窗口、空位不可放提示均通过；verdict 已折叠进实现（3fa62ff，#20）。

## 进度：95%

下一步：随 #20 真机验收；你点头后关闭本票。

待确认事项（未确认不 close）：关闭确认。