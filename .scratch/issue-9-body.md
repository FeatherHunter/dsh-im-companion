Part of #1

## Question

从 A1 行打开 Agent 详情抽屉（右侧 sheet）：预设、上下文增强、绑定工作区、会话路由摘要、渠道管理；哪些进抽屉、哪些留在行内？

## Context

R3 会话路由事实可用；A1 缺口表已把身份配置划给本卡。

## Done when

抽屉可开合、编辑经 dsh-im RPC（bot.preset.set 等）、状态刷新一致；真机验收。

## 原型（抛弃式，不进 main）

分支判定：UI（界面应该长什么样 → 同路由多变体 + 底部悬浮切换；子形态 B：抽屉尚无既有路由，以单文件 mock DSH 壳承载 A1 行 + 右侧 sheet）。

文件：prototype-c1a-drawer.html，位于 throwaway/c1a-drawer 分支（已推送）。切到该分支后双击打开，或 python -m http.server 8788 后访问 /prototype-c1a-drawer.html?variant=A；A / B / C 切换（← / → 亦可，?prod=1 隐藏切换条）。

三变体：A 全量进抽屉（行内仅状态 + 接入 + 详情）；B 摘要 + 折叠（行内保留渠道胶囊 + 换绑快捷）；C 渠道 × 能力矩阵（行内保留全部快捷，抽屉批量运维）。

Grilling 共识（2026-09-03，四问全按推荐确认）：变体 A / B / C；mock 数据（预设下拉 + 自定义名、上下文开关 + 三档、绑定路径 + 换绑、路由 2 私聊 + 2 群聊、渠道行接入 / 解绑）；全可点 + 内存态 + 每次操作后 State 面板外显完整 JSON；落点本单文件。

自验证：HTML / JS 解析通过；A / B / C 三变体截图渲染正常，结构差异成立；实测点击上下文开关后 JSON 中 enabled true → false，?variant=A 保持。

归档：决议后赢家重写进真代码，落选变体随原型留在 throwaway/c1a-drawer 分支。

## 进度：80%

下一步：请确认变体 verdict（A / B / C 或拼装，如 B 的行 + C 的矩阵），并确认预设与上下文增强的真实 RPC shape（当前为 mock：预设单选 + 自定义名、上下文开关 + 精简 / 均衡 / 详尽三档）。

待确认：变体 verdict 未定、真 shape 未对齐——两项确认前不 close、不进实现。
