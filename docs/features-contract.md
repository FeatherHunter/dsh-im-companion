# Features 契约（F0 决议 · v2）

> 权威依据：Wayfinder 地图 [FeatherHunter/dsh-im-companion#1](https://github.com/FeatherHunter/dsh-im-companion/issues/1) · F0 票决议（#3）。
> 第一性原理：**模块间无隐式共享**——共享只走契约；**复杂度 O(N)**——功能可独立增删/验证/替换；**触碰面无交集**——并行 session 开发的前提；**开发产物同样解耦**（用户 2026-09-02 裁定）——验证/原型/模拟数据按功能命名空间，杜绝"共享文件追加再追加"。

## 1. 目录形态（功能即模块）

```
src/
  client/            # 共享层（A1 起点，只增导出/追加，禁改既有行为）
    theme.ts dom.ts icons.ts config.ts fleet-api.ts meta.ts model.ts
    ui/              # 原语（button/field/segmented/menu/avatar/list/empty/toast/modal）
    data/
      connection-stream.ts   # NEW：单份 15s 轮询 + 多消费者订阅（B1 首建，A1 迁入）
      bindings.ts            # NEW：workspaceId↔BotSnap 绑定 + 健康聚合（B1 首建）
  features/
    <feature-id>/    # 每个功能一张票、自包含目录
      manifest.ts    # export const feature: FeatureManifest（唯一对外入口）
      view.ts data.ts styles.ts   # 按需拆分，每文件 ≤300 行
  host/
    rpc.ts           # 端点追加（只允许新增 case，禁止改既有行为）
```

## 2. FeatureManifest 协议

```ts
export interface FeatureManifest {
  id: string                     // kebab-case，如 'left-badges'
  name: string                   // 展示名
  order: number                  // 挂载顺序
  slots: { target: SlotTarget; mount(ctx: FeatureCtx): () => void }[]
  installStyles?(): () => void   // installFeatureStyles(id, css) 封装
}
```

- `FeatureCtx`（特性上下文，唯一入口）：{ rpc: RpcCall; subscribe(fn): () => void; refresh(): Promise<void>; meta: MetaStore; slots: SlotsService; get(name): unknown }（refresh 为 C1a 写后立刷追加，§4）
- 注册：client/index.ts 只做「导入 FEATURES 列表 → 循环 register」；新增功能 = 加一行 import + 一行数组项。
- 卸载即净：mount 返回 dispose；容器卸载时统一回收（同现有 ctx.effect 纪律）。

## 3. 共享层边界（触碰面规则）

| 文件 | 允许操作 |
|---|---|
| theme.ts / dom.ts / icons.ts / config.ts / fleet-api.ts / meta.ts | **只加导出**（新增函数/CSS 类/图标），禁止改既有签名与行为 |
| ui/* | 只加新原语文件；改既有原语需 F0 评审（单 PR） |
| data/connection-stream.ts / bindings.ts | B1 首建；其余功能只读其导出 |
| host/rpc.ts | 只追加 case；端点命名 `im-companion.<feature>.<action>` |
| 电话名（`host/rpc.ts` 端点的既有形态 · added-only · T7 #90，契约先行 §9） | 更新包 `buildPhoneNames(prefix)` 只产 `<前缀>.<动作>`，且前缀禁含点/斜杠/空白 ⇒ 本行上一行的三段式命名法对电话名**物理不可达**；本仓按包原样注册 `imc.updateStatus` / `imc.updateCheck` / `imc.updateInstall` 三个端点，既有 `meta.get` / `routes.list` 同为该形态（载体 `/api/im-companion` 已提供 `im-companion` 那一段）。与 `CONTEXT.md` Boundaries 的记录式说明同源——**是按事实记录，不是豁免**。 |
| host 入口 `src/index.ts`（载体） | 自有桥**只**经 `connection.fetch.register` 挂到 DSH 公开 `/api` 载体（路径 `/api/im-companion`）；**禁止** `connection.rpc.handle`——前缀路由会以 connection 服务自身的 Context 取 `webServer`，装配期即抛 `cannot get property "webServer" without inject`（沿革与证据见 ADR-0002） |
| client/index.ts | 只改 FEATURES 列表（每功能一行） |
| A1 私有（components/panel.ts、connect-flow.ts、row-actions.ts 等） | 禁止被 feature 直接引用；触碰走单 PR（C1a/E2 入口按 R5 建议由 B3 胶囊承载或单 PR 改） |

**先合并点（并行开工前单 PR 先行入库）**：① connection-stream.ts ② bindings.ts ③ theme.ts 增 installFeatureStyles(id, css) ④ icons 追加 ⑤ rpc.ts 骨架 case。

## 4. 数据流（单写多读）

- **单份轮询**：connection-stream 是唯一轮询源（15s + 手动刷新广播），feature 经 `subscribe(fn)` 读快照；不新开第二份轮询。
- **host 元数据**：RpcMetaStore 单实例（host meta.json 权威），feature 只经 FeatureCtx.meta。
- **写路径**：一律 dsh-im 渠道 RPC 或 host 桥端点；写后立刷（触发 stream.refresh()）。
- **面板 status 轮询的许可（added-only · T4 #87，契约先行 §9）**：更新中心的面板可自写 status 轮询，但仅限三条同时成立——① **上游规定**：更新包 README §3 明确要求面板自写 `setInterval(readStatus, UPD_POLL)`（上游只给常量与口径，`dsh-plugin-update` 包内零轮询）；② **状态机限定**：只在 `job.state ∈ {installing, verifying}` 期间开 1s 表，终态/离开即 `clearInterval`，客户端侧至多一个 update 定时器；③ **非同一数据源**：更新状态走本仓自有桥 `/api/im-companion`，与 15s 的 connection-stream 不同源、物理上搭不上车。三条之外的常开轮询仍属违约。
- **Added-only 定性（同上 · 非契约变更）**：「`AgentMetaDoc` 追加 `update` 字段 + `host/rpc.ts` 追加一个 `meta.update.set` case」落在 §3 明列的**共享层 Added-only 许可**内（只加导出 / 只追加 case），**不属于契约变更**；只有上面那条轮询许可才是需要先行记录的协议追加。
- **事件制通道（added-only · T6 #89，契约先行 §9）**：本仓 A1（面板等私有组件）与 feature 之间**存在既成的 window 事件通道**——事件名统一 `dsh-im-companion:*`，**常量单点声明在共享层 `src/client/data/config.ts` 并导出**，A1 派发、feature 监听（feature 只读该导出，不引 A1 私有文件）。既有先例 6 个常量：`OPEN_DRAWER_EVENT` / `FLEET_VIEW_EVENT` / `ADOPT_VIEW_EVENT` / `OPEN_AGENT_EVENT` / `SEND_TEST_EVENT` / `SESSION_VIEWED_EVENT`（后三者单点声明在 `data/bindings.ts` 与 `data/header-overlay.ts`，同为共享层导出）。**本次新增语义**：`UPDATE_CENTER_HOST_EVENT`（detail 形状 `UpdateCenterHostDetail`）是该通道**首次传递「活的 DOM 元素引用」**（`host: HTMLElement | null`：非空＝可挂载容器，`null`＝面板已卸载、特性须回收）。**已知债务（记录事实，不写成「豁免」）**：该通道**不在**「rpc / subscribe / meta / slots」四种契约通道白名单内（AGENTS.md 解耦九律 §1③）；要把「传递 DOM 的挂载点」收进 `slots`，需扩 `SlotTarget` 闭集（`protocol.ts`）与装配层，属更大范围改动，**本票不做**。附带事实：该事件**无重放**，热重载 / 事件顺序倒置时会漏掉 `{host}`，故容器保留稳定 `id="imc-update-center"`，供 T8 在 mount 末尾 `document.getElementById` **主动认领**。

## 5. 红线口径（300 行/文件）

- 计数：src/**/*.ts 全部行（含注释）。
- 豁免（仅这些目录）：lib/**（构建产物）、tools/**、.scratch/**、docs/**、features 内 json/md 资源。
- 机械执行：T0 票实现 `npm run guard`（扫描 → 超限清单 + exit 1）；CI/预提交可选。

## 6. 验证与验收

- 每功能自验证：`tools/verify/features/<id>.ts` 或分区断言；共享层改动跑 verify 全链（现 14 项，以 package.json 为准）+ 功能断言。
> 溯源（2026-09-08 #41 收尾）：原“既有 17 项”为旧数，实测 chain 14 项；改述以 package.json 为准，防止漏跑误判。
- 真机验收：功能票按地图 Notes 逐卡验收（重启 → 截图 → 用户确认）。

## 7. 并发布局（R5 输入，F0 确认）

A 线：B1（bindings/overlay 奠基）→ B2 ∥ E1；B 线：B3 ∥ C1b ∥ E4 ∥ E2；C 线：D1 ∥ E3；D 线：C1a（承接 E3 UI seat）。
四线文件域正交；每线开工前先合入 §3 先合并点。

## 8. 开发产物解耦（新增 · 用户裁定）

- 每功能自验证：`tools/verify/features/<id>.ts`（或现有验证器按功能分区）；共享验证器（render-client 等）只允许新增注册点/分区，禁止改他人分区。
- 原型资产：`prototypes/<id>/`（禁止根目录散放 prototype-*.html，既有 B1/B3 原型迁入）。
- 预览 harness：mock 数据按功能模块注册（`src/dev/features/<id>-mock.ts`），preview-host 只做装配。
- 守卫脚本：按功能归属（guard/boundaries 为契约层工具，功能自检脚本放 `<feature>/tools/`）。
- 依赖边界：feature 开发产物之间同样禁止 import 耦合（由评审把关，不设自动检查——见 §10）。
- 装配点夹具的必要追加（added-only · T7 #90）：`tools/verify/host-entry.ts` 给临时宿主目录挂一条 `node_modules` junction 指回本仓。原因：T7 起 host 半首次引入**包真身**依赖（`src/host/update.ts` 按裸模块名 `import 'dsh-plugin-update'`），而该验证器把 `src/` 转译到 `%TEMP%`，那里不在本仓 `node_modules` 解析链上（实测：去掉这条 junction 即 `ERR_MODULE_NOT_FOUND: Cannot find package 'dsh-plugin-update' imported from ...\host\update.js`）。属"夹具追加"而非"改他人分区"：既有断言一字未改。T7 自己的验证器 `tools/verify/features/update-host.ts` 同样自带这条 junction（其 25-26 行）。

## 9. 合并协议（并发正确性）

- 先合并点单 PR 先行入库（connection-stream / bindings / installFeatureStyles / icons 追加 / rpc case 骨架）。
- 追加共享文件前 `git pull`（以最新为基线再追加）。
- merge 冲突一律以"双方追加都保留"为准重做；删改他人追加 = 违约。
- 契约变更先行：改共享协议前先更新本契约并在地图 Decisions 记录，再改码。

## 10. 解耦合规 = 评审制（用户裁定 2026-09-02）

- **不设任何代码检查/自动扫描解耦问题**（静态依赖扫描、边界 linter 等一律不做）；已撤销此前 "check-boundaries 机械守卫" 方案。
- 合规靠三件事：① 军规自动注入（AGENTS.md，一切会话可见）② 提审材料：改动文件清单 + 触碰面自述（对照 R5 表）+ 一次性可移除性验证（git stash 该功能后 npm run check 仍全绿）③ 评审人（用户/AI 调度）逐票把关。
- 常驻自动检查仅限：构建、类型检查、功能断言、300 行红线（规模红线，非解耦检查，保持）。
- 例外通道保留：跨边界改动（如 C1a/E2 触碰 A1 入口）必须随票写明理由并经评审批准，不入任何自动化清单。
