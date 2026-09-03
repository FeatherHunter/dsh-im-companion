Part of #1
## Question
从 A1 行打开 Agent 详情抽屉（右侧 sheet）：预设、上下文增强、绑定工作区、会话路由摘要、渠道管理；哪些进抽屉、哪些留在行内？
## Context
R3 会话路由事实可用；A1 缺口表已把身份配置划给本卡。
## Done when
抽屉可开合、编辑经 dsh-im RPC（bot.preset.set 等）、状态刷新一致；真机验收。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 进度：0%

下一步：可认领（D 线）：shell.overlay 抽屉 + 身份配置