## Resolution（R5 研究完成 2026-09-02）

结论文件：`.scratch/companion-wayfinder/research/05-r-feature-wedges.md`（48 行）

1. **左栏无官方槽**：sidebar.workspaces 为 single 已被 ui-workspace 独占（重注册抛错/遮蔽）→ B1/B2/E2 走 MutationObserver 叠加，稳定锚点 = [role=treeitem][aria-expanded]（ProjectRowItem，title→workspaceId 映射，DSH 重命名防重名）；R2 的 data-workspace-list/data-workspace-id **无源码依据，已更正**。
2. **官方 additive 槽**：B3 = conversation.session.header.utilities(list/session) 或 shell.overlay(list/root)；C1b/D1 = settings.section 独立条目；E1 开关 = settings.general.item 行；C1a 避开 details（single 被占）→ shell.overlay 或自绘 sheet。
3. **数据复用**：fetchBots/healthOf/meta/workspaces 服务复用；**新建 data/bindings.ts**（workspaceId↔BotSnap 绑定 + 健康聚合，B1 首建）；client inject 补 "workspaces"。
4. **host 新端点仅两处**：D1（declarations.*）与 E3（routing.preview，读 ~/.dsh/state/<botId>.json StateStore.sessionFor），rpc.ts 追加 case；C1a/E2 写端复用 dsh-im 渠道 RPC（bot.preset.set / bot.workspace.set，写后立刷）。
5. **并发组**：A = B1 →（B2 ∥ E1）先合并 bindings.ts + overlay-engine；B = B3 ∥ C1b ∥ E4 ∥ E2（文件域全异）；C = D1 ∥ E3；D = C1a（承接 E3 UI seat）。唯一触碰 A1 的共享点 = C1a/E2 入口（建议 B3 胶囊承载或 F0 裁定后单 PR 改 row-actions.ts）。
