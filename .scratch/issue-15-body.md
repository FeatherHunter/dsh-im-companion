Part of #1

## Question

对话区欢迎横幅：展示 Agent 形象/在线态/今日摘要式欢迎；与 DSH 原生空态的关系、触发时机与关闭策略。

## Done when

真机横幅可见且不干扰输入、可关闭、深色适配。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 原型（2026-09-03，UI 分支）

分支判定：界面应该长什么样 → 同路由多变体 + 底部悬浮切换（sub-shape B：对话区无现有路由，mock DSH 对话区 chrome）。

抛弃式原型：prototypes/e4-welcome/prototype-e4-welcome.html（单文件，双击即开；?variant=A/B/C 可分享；本文件永不进 main）。

三变体：A 人物卡居中（拟人化最强）/ B 顶部细条可展开（最克制）/ C 左右分栏（信息密度最高）。控制台可切 Agent（小帅在线/星火部分在线/未命名未绑定）、会话（空/有消息）、主题（浅/深）；输入框常驻可用，发送即变有消息会话演示触发逻辑；状态外显每次操作重渲染；纯内存态。

Grilling 共识：叠加在原生空态上方（不动原生结构）、仅空会话显示、有消息不打扰、关闭为本会话内存态（切会话重置）、摘要为今日会话摘要 mock（3 行 + 在中间打开，E3 联动点）；Ctrl+K 不做（#1 已砍）。

验证：A/B/C 浅色截图 + A 深色截图均已通过（横幅可见、可关闭 X、输入框无遮挡、深色适配）。

## 调研（2026-09-03，未读来源）

报告：docs/research/05-e4-unread-source.md（只读 dsh-im + DSH 本体 + 本仓，断言逐条带出处）。

结论：三处均无现成未读事实（dsh-im 只有路由映射 sessionFor 与去重 seenMessageIds、无未读端点；harness 只有 session.list/history、无未读字段；飞书通道从未调拉历史/查已读）。推荐 A 占位先行 + B-内存首版（15s 同 poll 内 piggyback 有界 session.history 取 latestSeq，内存记每 key lastSeenSeq 做差值；meta.json 持久化列二期；渠道直调否决）。

附带：R3 的 direct: 记载与上游真机 p2p: 矛盾，水位主键须锁定 p2p:/group:（待 #14 一并修订）。

## 定稿（2026-09-03，A 变体 v1：只用现在能做到的事实）

未读 M 整列砍掉（无真源，不谎报）；水位不同步做（只读 list，零新增 RPC）。横幅内容全部来自现成事实：时段问候（本地时间，免费）+ Agent 名 + 呼吸灯健康（connection-stream）+ 渠道 chips；身份行（预设/上下文增强/家路径，meta 现成）；今日动态 Top3（session.list 的 lastPromptAt/updatedAt → 相对时间 + 在中间打开；空/沉寂/今日无动静各有诚实文案）；“在中间打开”真实 shape 待 #14 确认，无 shape 时置灰注明、不装可点。

快捷入口（第一性原理：随状态走、常驻最多 2 个、不与 A1 重复）：正常态 [去设置 / 打开工作区]，降级或离线态 [去设置 / 检查连接]，未绑定态 [去绑定 / 去设置]；添加接入留给 A1 卡内，横幅不重复造入口。

实现约束：src/features/welcome-banner/（manifest + view + styles，每文件 ≤300 行），只读 connection-stream/bindings/session.list，不新开轮询；verify 配套；npm run check 全绿后提审。

## 实现（2026-09-03，/implement 收尾，双轴终审：有条件通过）

提交（master 本地，未 push）：515e4d8 调研+原型 → 84acac8 数据层+视图+自验证 → bee4bb1 槽位测试 → 74ede58 槽位 keyed 兼容。文件：src/features/welcome-banner/（data/view/styles/manifest）+ fleet-api 只加 fetchRouteRows/RouteRow + protocol 联合成员 conversation-session + 注册两行 + verify 追加。

证据：自验证 16/16 全绿；自链 strict 类型干净；单文件 ≤300（view 279）；client bundle 构建通过（含横幅注册）。

评审说明：code-review 双子智能体中途失败，改由本 session 按双轴自审，结论有条件通过——标准轴全过（无跨 feature 引用、无自开轮询、wb- 命名空间、可移除）；规格轴 3 处被迫偏离待点头：① 今日动态相对时间砍掉（session.list 无源，改路由快照无时间行，不谎报）；② 打开工作区换成 Agent 详情（前者无落点，后者走 C1a 抽屉真消费者）；③ 未绑定去绑定换成静态指引（e2 无监听事件，B3 同款无死按钮原则）。

基线红（非本票，并行 session 手中）：project typecheck 卡 hover-card.ts、guard 卡 e2-adopt/view.ts 349 行；本票链均干净。

## 启动安全重做（2026-09-03，撞车事故后）

事故：welcome-banner 注册 conversation.session（single 独占槽）与宿主默认 occupant 撞车致 DSH 无法启动；另有第三方 usage-statistics-panel 的 domain 致命错叠加（见 crash-fix-handoff）。根因详见 docs/research/06-slot-coexistence.md：single 槽同 priority 单 occupant + 注册回调延迟执行、try/catch 兜不住。

重做（提交 f6e8e9a，零槽位 DOM 叠加）：永不调用 slots.inject/register（无 SlotCore 抛错面）；锚点 div[data-phase="hero"] + 双语标题徽标三信号；hero chip 文本反查工作区（歧义宁缺勿错）；X 内存关闭；无 document 环境回 noop；全链路异常内部消化。文件增 anchor.ts（70 行），单文件仍 ≤300（view 280）。

证据：自验证 19/19 全绿（含“hostile 环境永不抛错”+“DOM 挂载卸载即净”）；自链 strict 干净；client bundle 重构建通过（lib/ 忽略未入仓，Desktop link 直取）。验收手册 7 场景行为口径不变（用户视角：空态上方卡片 + X + 深色），无需重写。

## 真机首曝复盘（2026-09-03，用户截图）

好消息：零槽位挂载生效（DSH 正常启动）、深色渲染正常、真数据全通（预设/路由/健康）。

两个 bug 当场修（提交 c5be0b1）：① 有消息会话也冒横幅——宿主为保草稿常驻藏匿 display:none 的 hero，我只验属性没验可见，加可见性门（fail-closed）+ 属性观察 + 扫描节流；② 文案别扭“1 私聊”→“私聊 1”。另加：决策日志（F12 看 [dsh-im-companion] welcome-banner 即知卡在哪关）、匹配大小写不敏感、拆 overlay.ts（单文件仍 ≤300）。

证据：自验证 21/21 全绿（新增“藏 hero 零绘制”+ 文案断言）；bundle 内已实证含新代码（wb-routetitle/hidden-hero 标记在列）。

## 进度：95%

下一步：请点头 3 处偏离（见上），然后按验收手册 7 场景真机验收（本次 bundle 已就地重建：完全退出 DSH Desktop 重开 + Ctrl+F5；若横幅该出未出，F12 找本插件日志贴 issue）。过了再 close。

待确认：① 3 处偏离是否接受；② 真机验收是否通过。以上未确认前不 close。R3 修订改由 #14 跟踪。
