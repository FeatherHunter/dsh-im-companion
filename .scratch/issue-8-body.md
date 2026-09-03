Part of #1

## Question

对话区顶部/工作区 Header 的浮层：当前 Agent 健康、绑定渠道、快捷动作（打开工作区/发测试消息）；悬浮时机与防遮挡。

## Done when

真机悬浮正常、随连接域更新、深色适配；无与 DSH 原生 Header 冲突。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 原型

分支判定：UI（同路由多变体 + 底部悬浮切换），Sub-shape B。Grilling 共识（2026-09-03）：变体 A 胶囊 / B 浮条 / C 呼吸点；时机按绑定状态显示；动作打开工作区 + 发测试消息；静态 mock；纳入深色。产物在分支 prototype/b3-header-overlay（单文件，双击即跑）。

## 结论

赢家：C · 极简呼吸点（用户 2026-09-03 选定）。平时仅圆点，点击展开详情。

## 落地

提交 8558689（feat(b3)：订阅单例 stream + 双审修复）。文件：src/client/data/header-overlay.ts（纯模块：三态/选 Bot/投递解包/runTestSend）、src/client/components/b3-header.ts（订阅纯渲染）、tools/verify/features/b3-header-model.ts、tools/verify/features/b3-header-render.ts、prototypes/b3-header/；共享追加：index 槽位块、theme b3-header-* 块、fleet-api mergeStaleBots（已被 stream 收编为单一实现）。

挂载点实证（第一性原理）：conversation.session.header.utilities 真实存在——conversation 包 renderSlot 调用点、slot 注册表 kind=list scope=session、log-export 生产用法；子组件收 sessionId；session→workspace 经 workspaces.items sessionIds 反查（官方同款语义）。

发测试消息路径：dsh-im PROACTIVE_DELIVERY——/dsh-im-delivery 上 target.list 取该 Bot 已保存目标（首个），message.send 发送；无目标/离线/待确认/失败全部如实文案，成功才派 SEND_TEST_EVENT。说明：目标按 Bot 列取故无跨渠道错发，不按 kind 过滤（kind 是目标类型 user/group，非渠道标识）。

验证证据：npm run check 全绿（build+typecheck+verify+guard，41 文件 max299）；b3-header-model 11/11；b3-header-render 10/10（含呼吸 keyframes 防回归）；worktree 一次性可移除验证全绿（删 B3 专属面 + 还原两追加块）。

双审：标准轴、规格轴已过；缺口已修（订阅制替代自轮询、补 b3-header-breathe、离线预检、import 切 bindings、render 路径 env 化）；剩余跟真机走（定位/防遮挡/order30 共存/深色目检）。

债务与转交：features/b3-header 搬迁票另立（manifest/view/data/styles + protocol 槽名对齐 + installFeatureStyles）；SEND_TEST_EVENT / OPEN_AGENT_EVENT 零消费者待联动；B1 侧 badges 垫片可删（B3 已迁 bindings），badge-model 红归 B1 迁移收尾。

## 进度：95%

下一步（待确认，未确认不 close）：真机验收——desktop profile 注入重启后 Header 呼吸点出现、随连接域更新、深色跟随、无原生 Header 冲突（多分辨率/滚动/详情展开/外部点击/Esc）、发测试消息端到端。用户点头后关闭。
