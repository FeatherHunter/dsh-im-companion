# R5 — 10 功能挂载点 / 数据依赖 / 触碰面 / 并发隔离面

> Ticket R5 (wayfinder:research) · 2026-09-03
> 证据源（只读）：`D:\0Tools\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\*`（dsh-client-ui-*(client.js/slots 目录) + dsh-cordis-client-runner/lib/client.js 槽位目录 + dsh-workspace/dsh-api-workspace-controller）+ `D:\dsh-plugin\dsh-im\plugin-src\*` + 本仓库 `src/*`。
> 先前结论复用：`research/01-r-workspaces-rpc-findings.md`（workspaces 读/RPC）、`02-r-slots-dom-findings.md`（叠加工艺）、`03-r-session-routing-findings.md`（StateStore/sessionFor）、`04-r-host-bridge.md`（/im-companion 桥）。

## 结论表（一行一功能）

| 功能 | 挂载点 | 数据依赖 | 触碰文件（新=新建） | 可并行 |
|---|---|---|---|---|
| B1 左栏IM徽标 | `sidebar.workspaces` 已被 ui-workspace 独占（single，replaceRisk=shadows-shipped-ui）→ **不可再注册**；MutationObserver 叠加到浏览器区 `[role=treeitem][aria-expanded]` 行（= ProjectRowItem，folder+title+actions） | BotSnap.workspace（fetchBots）+ client `workspaces` 服务 items{workspaceId,title,cwd} → 绑定态；health.status 四态→HealthKind | 新 features/left-badges/{overlay.ts,badge.ts}·data/bindings.ts·theme.ts 追加 CSS·icons.ts+图标 | 组A 先导 |
| B2 左栏筛选条 | 同 B1 浏览器区：`[role=tree]` 父容器前插入 `.af-ws-filter`（宽屏显，56px rail 隐）；DSH 原生 search 激活/groupBy=flat 时自隐 | bindings.ts（绑定=workspace.cwd 命中 BotSnap.workspace，反向声明命中次之）；计数=命中数 | 新 features/left-filter/{bar.ts,filter.ts}（display:none 过滤行） | A组（B1后） |
| B3 Header浮层 | **官方 additive 槽**：`conversation.session.header.utilities`（list/session，replaceRisk none，id `im-b3`）+ 可选 `shell.overlay`（list/root，id `im-b3-float`，浮层指针自动透传）做真浮层 | 标准 props useWorkspaces/useSession(sessionId→workspace) + bindings.ts 健康聚合；动作=uiWorkspace.connectWorkspace/sessions.open | 新 features/header-banner/{actions.ts,float.ts}·React 外壳（slots 须返回 React，同 A1 工艺） | 组B |
| C1a Fleet详情抽屉 | **不用** `details`/`conversation.session.header`（均 single 被占用）；用 `shell.overlay` 条目或自绘 sheet（ui/modal.ts 扩展 side=right） | BotSnap + meta + agentPresetCatalog（connection.status 顶层）+ 写端：dsh-im 渠道 RPC `bot.preset.set`/`bot.context-enhancement.set`/`bot.workspace.set`（非 /im-companion） | 新 features/fleet-drawer/{sheet.ts,presets.ts}·入口触碰 A1（见「共享点」） | 组D（等E3 host） |
| C1b 矩阵总览 | `settings.section` 第二条目（list additive，id `im-companion-matrix`，order 23）——独立页，不挤 A1 | fetchBots + meta + workspaces → 行=Agent/列=渠道/格=状态+绑定 | 新 features/matrix/{view.ts,matrix-model.ts}（不动 A1 model.ts） | 组B |
| D1 反向声明 | `settings.section` 条目（id `im-declarations`）+ host 落盘 `~/.dsh/integrations/dsh-im-companion/declarations.json`（companion 数据目录；`<ws>/.dsh-im.json` 文件标记列为 v2，需 workspace-write，待 D1 拍板） | workspaces list + bots（只读消费 dsh-im workspaces.json）；冲突消解=正向 bot.workspace 权威（规则未决→E2 边界） | 新 src/host/declaration-store.ts·features/reverse-declare/{section.ts,model.ts}·src/host/rpc.ts+case | 组C |
| E1 呼吸灯 | B1 徽标合成层（同一 overlay + badge 元素），加 CSS animation；`settings.general.item` 行（list additive，id `im-companion-effects`，order 60）做开关；`prefers-reduced-motion` 硬关 | bindings.ts（healthy=呼吸/degraded=黄/offline=灰·衰减） | 新 features/im-presence/{presence.ts,animation.css}·settings 行组件 | A组（B1后） |
| E2 拖拽领养 | 左栏浏览器区叠加 drop 层（行高亮+顶部条）；拖源=Fleet 行（自定义 mime `application/x-im-bot`；DSH 原生用 text/plain，L668/L919，不冲突）；目标映射沿用 B1 title→workspaceId（DSH 重命名防重名 L2335） | bindings.ts 判冲突；写=dsh-im 渠道 `bot.workspace.set`，写后立即 fetchChannelStatus 刷新（R1 §5 写后立刷） | 新 features/drag-adopt/{drop-layer.ts,targets.ts}·拖源入口触碰 A1 row-actions | 组B（规则依赖D1概念） |
| E3 会话路由预览 | 弹层：驻 C1a 抽屉（seat）或独立 settings.section 条目；预览数据走 host 桥 | host 读 `~/.dsh/state/<botId>.json`（StateStore sessionFor，R3）；client 传 channel/botId/conversationKey | 新 src/host/routing-store.ts·features/routing-preview/{preview.ts}·src/host/rpc.ts+case | 组C（UI 组D） |
| E4 欢迎横幅 | MutationObserver 锚 `[data-conversation-scroll]`（chat/conversation 包稳定属性）；横幅插其容器上方 80px（R2/handoff§4 已验证）；空态判定=`[data-chat-turn]` 集合为空；关闭=localStorage | bindings.ts + meta（形象/昵称/在线态） | 新 features/welcome-banner/{banner.ts,observer.ts} | 组B |

## 关键证据（行号锚点）

- 槽位目录：`dsh-cordis-client-runner/lib/client.js` L2105+ 全目录 60 槽；`sidebar.workspaces` L3881（single，occ=WorkspaceBrowser，replaceRisk shadows-shipped-ui）；`details` L3237（single，occ=DetailsPanel）；`conversation.session.header.utilities` L3099（list）；`settings.section` L3627（list）；`settings.general.item` L3360（list）；`shell.overlay` L3699（list/root，click-through，occupants 空）。
- 左栏行结构：`dsh-client-ui-workspace/lib/client.js` ProjectRowItem L645-742（`role=treeitem`+`aria-expanded`+title span+rowActions）；SessionNodeItem L908（`aria-selected`，与工作区行可区分）；`key=workspace.workspaceId` L1436；drag text/plain=row.key L668 / node.id L919；注册 `sidebar.workspaces` L2683，inject 含 `workspaces` 服务 L2598-2606。
- conversation 槽声明：`dsh-client-ui-conversation/lib/client.js` L15810-16005（session/header/composer 家族）；settings.section 声明于 `dsh-client-ui-settings-general` 的 sidebar.settings 条目。
- 布局/浮层：`dsh-client-ui-layout/lib/client.js` AppFrame L239-279（`data-shell-overlay` L261、三栏 grid L242-244）；`ctx.layout.openDetails/closeDetails` L355-360（C1a 可择）；单槽同名 priority 冲突即抛错（`dsh-client-ui-slots/lib/index.js` L79-81）。
- 工作区数据：client `workspaces` 服务（runner L1488-1530，list/items{workspaceId,title,cwd,sessionIds}）；host `ctx.workspaceRegistry`（`dsh-workspace/lib/index.js` L309，host 侧可按 path 解析）。
- dsh-im 写端跨渠道同名：`bot.preset.set`/`bot.workspace.set`/`connection.status`（`dsh-im/plugin-src/host/channels/{feishu,qq,dingtalk}/rpc.mjs` L417/77/95 等）；RPC 信封解包见 01 研究。
- **R2 更正**：`data-workspace-list/data-workspace-id` 在 unpacked 产物中无据；稳定锚点是 `[role=tree]`/`[role=treeitem]` + `aria-expanded`/`aria-selected` + hashed 类名。空态/对话区锚：`data-conversation-scroll`、`data-chat-turn`（chat 包属性清单实证）。

## 共享文件与「先合并点」（Merge first）

1. `src/client/index.ts`（唯一入口）：每 wedge 只**追加一行** `registerXxx(ctx)`，禁改 A1 注册块（diff 冲突根源）。
2. `src/client/data/bindings.ts`（新）：workspaceId↔BotSnap 映射 + 健康聚合 + 订阅（15s 轮询单例）——B1 首建，B2/B3/E1/E2/E4 只读 import。
3. `src/client/theme.ts`：`installStyles` 拆分出 `installFeatureStyles(id, css)` 追加式样式（B1 首改；B2/E1/B3/E4 各加段落，互不重名类 `.af-*`）。
4. `src/client/icons.ts`：仅追加 IconName/PATHS（+bot/signal/pulse/drag 图标）。
5. `src/host/rpc.ts`：仅追加 `case 'im-companion.declarations.*'` / `'im-companion.routing.*'`（D1/E3，不相邻即可并行）。
6. **A1 行扩展点（唯一需触碰 A1 者）**：C1a 抽屉入口与 E2 拖源手柄——建议由 B3 胶囊/独立浮层承载（零触碰），或等 F0 裁定后一次 PR 在 `row-actions.ts`/`panel.ts` 加回调，避免 C1a/E2 双 PR 同文件。
7. `package.json`+`src/client/index.ts`：client inject 补 `"workspaces"`（现仅 slots/connection，见 package.json dsh.client.inject）——B1 先行。

## 可并发组（两两无共享触碰面）

- **组A（左栏 DOM，串行先导 B1）**：B1 →（B2 ∥ E1）。B1 先落 bindings.ts/overlay-engine/左栏锚点约定；B2、E1 随后并行（只读共享，E1 仅复用 badge 挂点+动画层）。
- **组B（零 host 改动，互相独立）**：B3 ∥ C1b ∥ E4 ∥ E2。文件域全异；仅 index.ts/theme.ts/icons.ts 追加行（先合并点 1/3/4 已隔离）。
- **组C（host 桥，互相独立）**：D1 ∥ E3。rpc.ts 不同 case、host 新文件各异（declaration-store vs routing-store）。
- **组D（C1a 承接）**：C1a ∥（E3 的 UI 驻 C1a，先做 E3 host 端点，后接抽屉 seat）——C1a 与 E3 共享 features/fleet-drawer seat，属唯一"两 wedge 显式合流"点（先合并点：routing-preview 服务接口定义）。
- **跨组顺序约束**：E2 概念上依赖 D1 冲突规则（不依赖文件）；C1a 依赖组B 的 B3 胶囊作零触碰入口；全部 10 核共享点=1/2/3/4/7，逐条先行入库即全并行。
