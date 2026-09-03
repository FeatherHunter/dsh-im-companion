Part of #1
## Question
把 A1 面板（panel.ts 342 行，已超 300 红线）拆为 <300 行的模块，同时产出「如何拆」的范式供后续功能照抄。
## Context
红线：单源码文件 ≤300 行（lib/* 为构建产物豁免）。panel 含状态/渲染/动作三类职责。
## Done when
拆分完成、全部原功能不变、17/17 验证通过、类型检查绿；在票内记录拆分范式（如 components/panel-actions.ts 等）。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 进度：0%

下一步：可认领（AFK）：panel.ts 342→≤300 行拆分，示范拆分范式