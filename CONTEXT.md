# CONTEXT

> dsh-im-companion 的领域词汇表。工程技能在命名、重构、测试时必须使用此处的规范词，避免同义词漂移。

## Glossary

| Term | Definition |
|------|------------|
| **Agent** | 拟人化的助理实体（如“小帅”），1 Agent 对应 1 Workspace（D1 约束），拥有跨渠道身份。 |
| **Workspace** | DSH 的左侧工作区单元，用户日常切换的容器。1 Workspace = 1 Agent，不做 1 人多家。 |
| **Bot** | dsh-im 中对接 IM 渠道的机器人实例（Feishu/WeChat/QQ），由 `botId` 标识，关联 `workspace` 通过 `workspaces.json` 与 `bot.workspace.set` RPC 维护。 |
| **Channel** | 渠道类型：`feishu` / `wechat` / `qq` 等，单插件多渠道（`FeatherHunter/dsh-im`）的抽象。 |
| **Session** | Harness 会话（`sessionId`），对话区中间的会话流单位。飞书会话（私聊/群聊）通过 `StateStore.sessionFor` 路由到 Session。 |
| **Health** | Bot 的在线状态（`connection.status` / `health.status`），决定左侧徽标呼吸灯与 Header 浮层文案（在线 vs 草稿）。 |
| **Binding** | “已绑定/未绑定”关系，指 Bot 是否已声明归属某 Workspace（原“已托管”歧义已废）。通过 `connection.rpc.call('/feishu','bot.workspace.set',{botId,workspace})` 落地。 |
| **Fleet** | IM机器人辅助中的总览视图：按 Agent/渠道/工作区聚合的卡片（详情抽屉）与矩阵（舰队雷达）。 |
| **首屏** | 设置-IM机器人辅助第一眼面板整体（FleetPanel：标题栏 + 工具栏 + 新建条 + 主体列表 + 加载 / 空 / 错误态）。 |
| **Feature（功能模块）** | 一个票=一个功能=一个自包含开发单元（src/features/<feature>/），可独立 session 开发；模块间只经契约交互。 |
| **Contract（契约）** | 模块间唯一交互面：共享包导出接口（theme/ui 原语/data 层）、挂载点（slot/左栏 DOM）、host 桥端点前缀（/im-companion 下按功能隔离）。 |
| **红线（300 行）** | 任何源文件 ≤300 行；lib/* 为构建产物豁免；由 T0 守卫脚本机械执行。 |
| **Feature（功能模块）** | 一个票=一个功能=一个自包含开发单元（src/features/<feature>/），可独立 session 开发；模块间只经契约交互。 |
| **Contract（契约）** | 模块间唯一交互面：共享包导出接口（theme/ui 原语/data 层）、挂载点（slot/左栏 DOM）、host 桥端点前缀（/im-companion 下按功能隔离）。 |
| **红线（300 行）** | 任何源文件 ≤300 行；lib/* 为构建产物豁免；由 T0 守卫脚本机械执行。 |
| **Map** | Wayfinder 的目的地索引 issue，本文档对应的规划图谱。 |

## Boundaries

- 本上下文仅覆盖 companion 辅助插件（`dsh-im-companion`），不含 `dsh-im` 上游实现。
- 术语 “托管” 禁用，一律使用 “绑定”。

## Open Questions

- Workspace 重命名/删除对 Binding 的级联影响（待 D1 验证）。
- 多渠道 Health 聚合规则（Feishu 在线但 WeChat 离线时 Fleet 如何着色？待 A1 验证）。