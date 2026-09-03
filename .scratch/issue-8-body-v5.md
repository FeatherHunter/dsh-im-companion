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

## 真机反馈 v2（2026-09-03，用户验收意见逐条落地，提交 d64f17a）

场景 1：删“打开工作区”（在场内自开无意义，无状态变化即无按钮）；“发测试消息”无目标不再死指引——改走 target.suggestion.list + target.test 草稿直发官方测试文案，不创建不保存任何目标；1 个建议直发，N 个弹列表自选（防误发到群），0 个指引先和机器人说一句话。

场景 3：“去设置”删按钮——全仓无官方设置页导航 API（仅 host 侧开设置文件接口），接不上就不摆死按钮；未绑定只留静态指引文案。

场景 4：hidden 改述为未就绪（服务缺失/首轮快照前），不再叫 IM 无关；确认：真机上每个会话都有归属工作区，故处处有圆点（已绑定看健康、未绑定看灰色指引），符合按绑定状态显示共识。

场景 2：跳过；如需看待确认态可停 dsh-im host 或断网（轮询失败标 stale）。

验证：check 全绿；model 13/13；render 10/10。

## 真机截图 v3（2026-09-03，场景 1 截图验尸，提交 e04a2b8）

位置 bug：详情卡未出现在右上角、飘在会话区中部——fixed 定位被对话区 transformed 祖先劫持（相对该祖先而非视口）。改 relative 包裹 + absolute 锚定按钮正下方（标准范式），待复验。

文案 bug：副标题与标题逐字重复（“agent · 在线”出现两次）。副标题改显示渠道明细 + 最后检测（tooltip 可视化）。

非问题：280px 宽为标准浮层尺寸，开卡遮挡内容属正常（外部点击/Esc 即关）；按钮橙色系主题 brand 色跟随。

去设置直达 verdict：全仓无浏览器侧设置页导航 API（仅 host 侧“打开设置文档”这种，文不对题）；DOM 模拟点击违反军规③且一改版就碎。故不做，保持静态指引；等官方导航能力或 F0 settings 形态确定后再接。

验证：check 全绿；model 13/13；render 10/10。

## 研究 06（2026-09-03，/research 独立调查，报告 .scratch/companion-wayfinder/research/06-r-settings-navigation-findings.md）

Verdict：没有一键打开设置面板并定位到指定节的一手能力。open/activeId 是设置壳内 useState（settings-general client.js:205-217），不经 URL/hash/store/事件/服务/命令对外暴露；浏览器服务目录 8 项无导航；无命令面板；官方无链入先例（openSection 只喂给 onboarding，且现网两步骤都不调）；左下角按钮只是本地 setOpen(true)。

去设置按钮定案：静态指引（与 v2 已落地一致）。直达不可做（DOM 合成点击违反九律且脆弱；抢 onboarding 需造空会话，产品级破坏）；不放弃纯文本指引（发现率）。后续升级信号：SERVICE_API 新增 settings.open 类 key，或 SettingsSectionOwnerProps 新增字段。

## 家模型与身份键（2026-09-03，用户确认“家”模型 + 命名跟踪，提交 ca0f237/8980bfe）

身份键改全路径：名/像读全路径优先、旧目录名键兼容，写全路径；同名目录隔离回归已钉住。preset 键同类问题在 C1A 家，提案转交未动。

Header 认自定义名：与面板同一套 viewName，名表走 featureCtx.meta 异步加载（mount + 每轮快照刷新，失败回退目录名）。dsh-im 卡片名是另一套体系，不管。

## 进度：95%

下一步（待确认，未确认不 close）：真机验收——desktop profile 注入重启后 Header 呼吸点出现、随连接域更新、深色跟随、无原生 Header 冲突（多分辨率/滚动/详情展开/外部点击/Esc）、发测试消息端到端。用户点头后关闭。




