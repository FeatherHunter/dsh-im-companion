# CONTEXT

> dsh-im-companion 的领域词汇表。工程技能在命名、重构、测试时必须使用此处的规范词，避免同义词漂移。

## Glossary

| Term | Definition |
|------|------------|
| **Agent** | 拟人化的助理实体（如“小帅”），1 Agent 对应 1 Workspace（D1 约束），拥有跨渠道身份。 |
| **Workspace** | DSH 的左侧工作区单元，用户日常切换的容器。1 Workspace = 1 Agent，不做 1 人多家。 |
| **Bot** | dsh-im 中对接 IM 渠道的机器人实例（Feishu/WeChat/QQ），由 `botId` 标识，关联 `workspace` 通过 `workspaces.json` 与 `bot.workspace.set` RPC 维护。 |
| **Channel** | 渠道类型：`feishu` / `wechat` / `qq` 等，单插件多渠道（`xmanrui/dsh-im`）的抽象。 |
| **Session** | Harness 会话（`sessionId`），对话区中间的会话流单位。飞书会话（私聊/群聊）通过 `StateStore.sessionFor` 路由到 Session。 |
| **Health** | Bot 的在线状态（`connection.status` / `health.status`），决定左侧徽标呼吸灯与 Header 浮层文案（在线 vs 草稿）。 |
| **Binding** | “已绑定/未绑定”关系，指 Bot 是否已声明归属某 Workspace（原“已托管”歧义已废）。通过 `connection.rpc.call('/feishu','bot.workspace.set',{botId,workspace})` 落地。 |
| **Fleet** | IM机器人增强中的总览视图：按 Agent/渠道/工作区聚合的卡片（详情抽屉）与矩阵（舰队雷达）。 |
| **蓝（执行中）** | 会话有缺 closer 的 open turn；左栏行蓝色竖条＋闪烁（呼吸）。 |
| **红（异常）** | 需人工的终态：402 配额／未知错误未恢复／aborted 中断；红色竖条＋闪烁，与蓝黄平级。 |
| **黄（待看／待选）** | 等用户查看（官方绿点完成提醒／warning 等审批）或等用户弹窗选择（approval 未决）；橙色竖条，不闪。 |
| **首屏** | 设置-IM机器人增强第一眼面板整体（FleetPanel：标题栏 + 工具栏 + 新建条 + 主体列表 + 加载 / 空 / 错误态）。 |
| **Feature（功能模块）** | 一个票=一个功能=一个自包含开发单元（src/features/<feature>/），可独立 session 开发；模块间只经契约交互。 |
| **Contract（契约）** | 模块间唯一交互面：共享包导出接口（theme/ui 原语/data 层）、挂载点（slot/左栏 DOM）、host 桥端点（自有桥经 DSH 公开 `/api` 载体注册，路径 `/api/im-companion`，按功能命名 `im-companion.<feature>.<action>`；载体沿革见 ADR-0002）。 |
| **红线（300 行）** | 任何源文件 ≤300 行；lib/* 为构建产物豁免；由 T0 守卫脚本机械执行。 |
| **Map** | Wayfinder 的目的地索引 issue，本文档对应的规划图谱。 |
| **电话（Phone）** | 宿主对外提供的方法，由更新包按「前缀 + 点 + 动作名」拼出；本仓冻结为 `imc.updateStatus` / `imc.updateCheck` / `imc.updateInstall`，形态恒为**两段式** `<前缀>.<动作>`，与既有端点 `meta.get` / `routes.list` 同形（载体 `/api/im-companion` 已提供 `im-companion` 那一段）。与契约 §3 三段式端点命名法 `im-companion.<feature>.<action>` 的关系：更新包 `buildPhoneNames(prefix)` 只产 `<前缀>.<动作>`，且前缀禁含点/斜杠/空白、只能是 `imc` 这类单段 ⇒ 三段式命名法对电话名物理不可达；命名法规则本身见 `docs/features-contract.md` §3，此处不重复。**本行是该术语的唯一定义处。** |
| **落盘（Persist）** | 宿主统一写本地文件的动作（更新包 `state.json` / `install.lock` / `before.json` 三件）。与「真值」无涉，不得互换使用。 |
| **更新包（Update Package）** | 装着更新系统的那个 npm 包 `dsh-plugin-update@0.1.1`；本仓是集成方，只 pin 不改。 |
| **更新系统（Update System）** | 更新功能本身（引擎、对外接口、文档），由更新包提供。 |
| **更新中心（Update Center）** | 本仓新增的面板区块（设置-IM机器人增强内），承载检查更新 / 装更新 / 兜底命令 / 待重启横幅 / 版本说明。新词，勿与上述四个混用。 |
| **使用范围（Profile）** | DSH 的 profile（web / desktop），更新包里叫「使用范围」；**不是 Workspace（工作区）**，两者不可互译。 |

## Boundaries

- 本上下文仅覆盖 companion 辅助插件（`dsh-im-companion`），不含 `dsh-im` 上游实现。
- 术语 “托管” 禁用，一律使用 “绑定”。
- 「渠道」仅指 IM 渠道类型（见 Channel 行）；更新系统的下载源叫「官方源」（更新包 `registryUrl`，默认 `https://registry.npmjs.org/`），不得称渠道。
- 电话名不得为迁就三段式命名法而改名（前缀由更新包冻结为单段，改名换不来合规）；其定义与命名法关系见 Glossary 的「电话（Phone）」行，此处不重复论证。
- 「使用范围」是 Profile（web / desktop），「工作区」是 Workspace（左侧工作区单元），两者禁互译。

## Open Questions

- Workspace 重命名/删除对 Binding 的级联影响（待 D1 验证）。
- 多渠道 Health 聚合规则（Feishu 在线但 WeChat 离线时 Fleet 如何着色？待 A1 验证）。