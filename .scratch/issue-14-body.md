Part of #1

## Question

路由预览：给定 Agent 与渠道会话，预览会路由到哪个 DSH session（状态/会话落点/未识别时的兜底）；放 C1a 抽屉或独立页？

## Context

R3 sessionFor 事实。

## Done when

预览结果与真机路由一致；决策落点。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 原型（抛弃式，不进 main）

分支判定：LOGIC（单文件可分享 HTML）；落点只记 verdict，UI 三变体待 #9 关闭后另起。

文件：prototypes/routing-preview/prototype-e3-routing-preview.html（工作区未提交，决议后归档 throwaway 分支）。

Grilling 共识（2026-09-03）：兜底=未绑定→占位（映射归 dsh-im，companion 只读）；脱敏=昵称 + sess 截断 8 位；mock=单 Agent × 5 会话；落点=逻辑先行。

源码级发现：R3 写 direct:<openId>，飞书真机是 p2p:<senderId>（message-utils.mjs:10-20），原型 T3 已外显。

## 实现（砍完形态，commit e459b89，不求上游）

决议：不给 dsh-im 提任何需求；做不到的砍掉。保留=已绑定映射只读投影（渠道·种类·脱敏 ID → sess 截断 8 位）+ 飞书 direct: 幽灵 key 告警，进 C1a 抽屉“会话路由摘要”区；砍掉=未绑定卡（无聊天名单，不可知）/ stale 预警（够不着 session.list）/ 一切写动作；降级=昵称→脱敏 ID（现状无昵称来源）、在中间打开→复制 sess-id。

改动（7 文件 +346/-27）：src/host/routes.ts（新建，读盘+脱敏+幽灵判定，123 行）；src/host/rpc.ts（纯追加 routes.list case，构造注入 dshHome）；c1a/data.ts（fetchRoutes 经自有通道 + RouteEntry.ghost/channel）；c1a/drawer.ts（每轮快照跟随重读，变才重绘，294 行）；c1a/view.ts（渠道前缀行 + 幽灵行 + 复制按钮）；c1a/styles.ts（+2 类）；verify c1a-drawer.ts（+7 用例，22/22）。

触碰面自述：共享全加法（rpc 只追加 case，FEATURES/契约不动）；c1a 自有目录内改动；host 新增文件无反向依赖（feature 不引 host，host 不引 feature，纯函数各自一份是架构所迫）；单文件最大 294 行。

评审（双轴 2026-09-03）：Standards 硬违规 0（7 smell 全 judgement call，已修 #1 复用 RpcCall/#4 dshHome 注入/#5 合并序注释/#6 行内样式进 CSS；#2 去重键两份与 #3 chat 展示串为刻意解耦/脱敏边界，保留）；Spec 5 条全修（a1 行缺渠道已补；b1 测试后门移出端点；b2 文案去“等上游”；c1 幽灵误伤他渠道——ghost/mask 按 channel 判定；c2 投影不跟随——改每轮重读）。

证据：build + typecheck + verify 全绿（含 c1a 22/22）；可移除性验证通过（stash 本功能 7 路径后基线 15/15 全绿，已恢复）；全量 check 唯一红线是并行 session 的 left-badges/hover-card.ts（328 行），非本功能触碰面。

## 体验修复4（用户决议 2026-09-03）：行改单行横向滚动——不许换行，不断尾；超宽整行可左右拖。手册样例此前误带省略号，已纠为足尺假 id。

## 体验修复3（用户决议 2026-09-03，commit 18d72a1）：自展面板全显——聊天 id 与 sess-id 完整显示，行改双层堆叠（聊天一行、会话+复制一行，换行不断尾）；mask 正名为 format（撒谎命名消除）；R3 脱敏口径正式让位，权衡（完整 id 进面板与截图）用户已知悉。验收手册同步改全显口径。

## 体验修复2（真机反馈 2026-09-03）：聊天号头部 6→12 位（ou_ 前缀噪音大，6 位行行雷同；自展面板内可辨识即可）。另确认：反馈截图中的 session-… 与大留白系旧构建（8 位口径 + space-between），新构建为 session-16位 + 左对齐顶满，重测须在本次构建后重启+Ctrl+F5。

## 体验修复（真机反馈 2026-09-03，commit 6f078a0）

两处全改：① 复制出 session-…：真机 sess-id 为 session- 长串，旧 8 位口径恒得无区分度的 session-…，改 16 位截断（短 id 明文，显示即所得，完整 id 不出 host）；② 行太丑：实线分隔 + 行内居中 + 会话号提亮等宽 + 长 id 省略。行样式与 B 列表风重排（01899d4）共存，routesSection 未被重设计触碰。

并行污染记录：842d38f（b1）与 01899d4 把本票 review-fix hunks 卷入自家 commit（内容无损，§9 成立）；b1 的 hover-card.ts 类型错误拖红全仓 verify（含本票验证文件转译），待 b1 自修，本票隔离验证（10 文件类型零错 + E3 断言原样全绿）已过。

## 收尾（2026-09-03，用户真机确认全显后 close）

 verdict：砍完形态成立并交付——只读 bound 投影 + 飞书幽灵 key，住 C1a 抽屉摘要区；独立页判死刑（无槽位能力）；R3 脱敏口径让位给用户全显决议。

原型归档：throwaway/e3-routing-proto（单文件推演 + 验收手册；另有一份被并行快照 d0c2bc7 扫进 master，属树现状，不另删）。

待确认（关前核销）：① 真机全显——用户确认通过；② 落点抽屉——用户接受；③ 全量 verify 红线系 b1 hover-card，不属本票——已隔离验证替代，close 不等它。

## 进度：100%

下一步：请做真机验收（完全退出 DSH 重开 + Ctrl+F5：开某 Agent 详情抽屉 → 会话路由摘要区应列出已绑定映射；无绑定时显示空席位文案；点复制应变“已复制”）。

待确认：① 真机验收结果（未验收不 close）；② 空投影在你机器上的表现（有无 state 文件、有无权限拒绝导致的空席位）；③ 原型归档 throwaway 分支的时机（与 verdict 一起）。
