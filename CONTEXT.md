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
| **Fleet** | IM机器人辅助中的总览视图：按 Agent/渠道/工作区聚合的卡片（C1a 抽屉）与矩阵（C1b 表）。 |
| **Map** | Wayfinder 的目的地索引 issue，本文档对应的规划图谱。 |

## Boundaries

- 本上下文仅覆盖 companion 伴生插件（`dsh-im-companion`），不含 `dsh-im` 上游实现。
- 术语 “托管” 禁用，一律使用 “绑定”。

## Open Questions

- Workspace 重命名/删除对 Binding 的级联影响（待 D1 验证）。
- 多渠道 Health 聚合规则（Feishu 在线但 WeChat 离线时 Fleet 如何着色？待 A1 验证）。