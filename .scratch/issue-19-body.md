Part of #1

## Question

E1 在场感动效实现：按原型 verdict（#12，winner = A 光晕扩散）落地 presence-* 独立命名空间动效 + full / reduced / static 降级 + 衰减断线语义 + 手动开关。

## Verdict 输入

winner = A（box-shadow 光晕 1.6s，keyframe presence-breathe-a 独立命名，色值 token 与 B1 同值）；断线 = 衰减静态灰；降级自动（>20 实例 → reduced 2.8s）+ 手动双轨；B1（#6）徽标不动，仅视觉叠加。原型 primary source 见分支 prototype/e1-presence。

## Done when

真机几十实例同屏不卡（卡则实现内自动降 B 手法）、深色模式对比度合格、可关（无障碍）。

## 开工建议

待 #6 关闭（B1 徽标稳定）后再动手，避免叠加返工；只写自有目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。

（#6 已关闭，本票已开工，见下。）

## 方向决策（用户裁定，两次）

① 2026-09-04 方向 A：用户真机截图指出双呼吸冗余（行首在场点 + B1 右侧呼吸 pill），冗余成立（verdict“叠加”字面实现与真机体感冲突）。E1 转为动效总控，撤掉左点，只保留档位决策 + 开关 + 系统偏好，档位作用到 B1 既有呼吸上（B1 文件零触碰）。B / C 备选归档。

② 开关位置 A：用户指出 rail 尾开关卡在两工作区之间。根因：锚点取首行上两级 + appendChild，在增量渲染下后到的分组把开关挤进中间，且父容器不变永不重搬（单测静态 DOM 测不出）。改自有图层：body 右下角悬浮小钮（fixed，z-index 50，低于悬浮卡 60），永不进入行间。设置区小节备选后置。

跨边界说明（评审已知）：E1 样式只读 B1 的 `data-lb-kind` / card-dot 选择器以施加档位，不写 B1 任何属性与节点，摘除 E1 即恢复 B1 原生行为。

## 实施（方向 A + 悬浮开关，已认领：FeatherHunter）

行为：E1 不画任何点。订阅单份 stream 计数 bound 行（未绑定不计，行与 rail 零写入）→ resolveMotion 定级 → 写 `body[data-presence-level]`（full = 不写，B1 原生 1.6s；reduced = 2.8s；static = 停）。覆盖规则只调 B1 既有呼吸的时长 / 开关（含悬浮卡渠道点），keyframe 零新增。开关为 body 悬浮钮（`aria-pressed`，内存 + 系统媒体查询双轨，dispose 清媒体监听与按钮）。

文件清单（只写自有目录，共享零改动）：`src/features/presence/motion.ts`（39 行）/ `styles.ts`（16 行）/ `view.ts`（197 行）/ `manifest.ts`（13 行）；`tools/verify/features/presence.ts` 同步覆盖悬浮断言。对照 R5 表：未引 A1 私有、未引他人 feature 实现、未动 B1 一行、未新开轮询、未直写 localStorage。

证据：自验证 10/10 全过（含悬浮不断言：开关挂 body 不在 rail 行间、fixed + z-index、翻转去 static 并恢复、dispose 全清）；`build:host` 过；`build:client` 过（E4 落 view.ts 后恢复，lib/client.js 已重打 246KB，含方向 A）；`guard` 本票四文件全绿；typecheck 零 presence 错误。

阻塞（非本票回归）：typecheck 仍红，错误只在 `e2-adopt/view.ts`（E2 会话 WIP：重复实现 + 缺名，并发修补中）与 `left-badges/hover-card.ts:272/274`（TS 7.0.2 预存错误，已上报）；guard 同因（e2-adopt/view.ts 365 行）。本票未碰这两文件。`protocol.ts` 被并发会话只加了 `conversation-session` 槽位（本票已验证兼容）。

## 进度：100%

确认记录：用户真机验收通过，明确可关闭。左点退役、pill 独呼吸、悬浮开关位置接受；全绿（E2 / hover-card 孤儿）与阈值校准、开关搬设置区转后续跟踪，不阻塞本票。本票关闭。
