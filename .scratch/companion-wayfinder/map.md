# Wayfinder Map — dsh-im-companion 最大全集

## Destination

将 handoff §3 的最大全集 **11 项方案（A1 三态聚合 / B1 左侧徽标+呼吸灯 / B2 筛选条 / B3 Header 浮层 / C1a Fleet 大卡详情抽屉 / C1b Fleet 矩阵总览 / D1 反向声明 / E2 拖拽领养 / E3 会话路由预览 / E4 欢迎横幅）** 在 `dsh-im-companion` 中逐一尝试并开发到可真机验收状态；尝试中不可行则废弃并记录原因，可优化则优化，需改变则换新方案。完成时每个保留项均可在 DSH Desktop（desktop profile，Junction 已挂载）重启后于 设置→IM机器人辅助 或 真实左侧/对话区 演示，且 `D:\dsh-plugin\dsh-im` 零改动。

> 判定标准：用户按“一次一卡”在真机逐卡验收通过；不可行项有废弃记录与替代提案。

## Notes

- **Domain**: `CONTEXT.md`（Agent/Workspace/Bot/Channel/Session/Health/Binding/Fleet）+ `docs/agents/*.md`（GitHub Issues 为主，本地 `.scratch/companion-wayfinder` 为临时镜像）+ handoff `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md`
- **Skills per ticket**: 见各票 `Type` 标注；通用必读 `dsh-plugin-ui-debug`（真机左侧/顶部验证）、`cordis-plugin-development`（host/client 双构建与 `connection.rpc`）、`domain-modeling`（术语对齐）、`prototype`（便宜可视化）、`research`（链路事实）
- **Execution in map**: 本 effort 在 Notes 中覆盖默认 “Plan, don't do” — Wayfinder 闭环包含 **决策 + 实现 + 预览/注入验证**，每票闭环后用户真机验收再进入下一票（一次一卡）
- **Preferences**: 单插件零改动、desktop 双 Junction 挂载、`lib/client.js` React `slots.inject('settings.section',22)`、16210B 预览 `preview.html` (`python -m http.server 8788`)、Mock→真数据两阶段、呼吸灯/80px 横幅等样式需经真图校准
- **Tracker**: 首选 GitHub Issues（`gh` CLI，`FeatherHunter/dsh-im-companion` 待建仓），当前以 `.scratch/companion-wayfinder` 为本地镜像；建仓后以 `gh issue create --label wayfinder:map` 等平移，本地票标题与 body 保持一致以便 `gh` 批量导入

## Decisions so far

<!-- 已关闭票的一行 gists，指向票详情；当前为空，首个闭环后开始填充 -->

<!-- 示例: - [B1 左侧徽标+呼吸灯 决策](link): 采用 MutationObserver 叠加 + 绿色呼吸点，已在真机左侧验证 -->

## Not yet specified

<!-- 雾中：范围内的预见但尚不能精确提问，随 Frontier 推进逐个毕业为新票 -->

- **多渠道矩阵扩展**: 飞书之外微信/QQ 的 Health 与 Binding 数据源是否同构？若 WeChat/QQ 的 `workspaces.json` 路径或 RPC 前缀不同，C1b 列动态如何处理？（待 R2、A1 后明确）
- **Fleet 右 Dock 搬运**: C1b IM机器人辅助总览 Tab 搬到右侧 Dock 的 Slot 可用性与尺寸约束（待 dsh-plugin-ui-debug 探针后明确）
- **呼吸灯可访问性与性能**: 左侧全量展开时几十绿点呼吸动画的 CPU/对比度/深色主题表现（待 B1 原型后量化）
- **轮询 vs 事件订阅**: `workspaces.json` 读盘与 `connection.status` 的实时性（轮询间隔 vs RPC 推送），对 B1/B2/A1 自动刷新策略的影响（待 R2 后决策）
- **Drop 区防误触**: E2 拖拽领养的撤销/二次确认与多人协作冲突（待 D1、G-E2 后明确）

## Out of scope

<!-- 已明确不在本 Destination 范畴，永不毕业；若改 Destination 则另起 effort -->

- **Ctrl+K 命令面板** — handoff §2 已砍：与 DSH 原生快捷键冲突，改为对话区横幅（E4）承载
- **根 README 欢迎页** — 已砍：点文件夹不切中间的真图证明落点应在对话区，而非 README
- **1 workspace = N Agent（1人多家）** — 已砍：与 D1 的 1:1 约束冲突，另起 effort 再议
- **“已托管” 自动化语义 / “托管” 一词** — 已废：一律称 “已绑定/未绑定”
- **xmanrui/dsh-im 上游合入** — 本 effort 零改动 `D:\dsh-plugin\dsh-im`，合入由独立 PR 处理

---

> 本 Map 为 GitHub 友好 Markdown；建仓后执行：
> `gh issue create --title "Wayfinder Map — dsh-im-companion 最大全集" --label wayfinder:map --body-file .scratch/companion-wayfinder/map.md`
> 子票以 `--parent <map-number>` 关联，阻塞以 `--blocked-by` / 原生 dependencies 关联。