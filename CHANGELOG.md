# CHANGELOG

## v0.1.11 — 2026-09-12

主题：**真机复验靶子**——与 0.1.10 无功能差异，只为让「面板里点安装」这一步有新版可装。

提炼：

- package.json / package-lock.json 0.1.10 → 0.1.11；**无功能性代码变更**。
- 用途：0.1.10（含安装链路修复）已用命令行装进 web profile；本版作为它「检查更新 → 一键安装」的目标版本，用来验收修复是否真的生效。

验证与影响：

- `npm run check` 全链通过。
- 无新增契约通道、无共享层改动。

## v0.1.10 — 2026-09-12

主题：**修「装不了」**——面板此前**永远装不了任何版本**；顺带把更新中心改成「一个按钮 + 弹窗」。

修正：

- **安装必然失败（严重）**：客户端调 `updateInstall` 时**漏传 `requestId`**，更新包在 `dist/service.js:299` 直接抛 `check-expired` ⇒ 无论哪个版本、什么网络，点安装都不可能成功。现每次点安装都带一枚新凭证（该字段是更新包的幂等键）。
- **原因码文案缺口**：更新包的 known 码表共 13 条，面板只译了 8 条；真机命中的 `check-expired` 因此显示成「遇到未知的安装阻塞（check-expired）」兜底句，用户无从下手。现补齐五条：`check-expired` / `update-busy` / `check-failed` / `invalid-release` / `install-failed`。

改动：

- 更新中心收成**一个「检查更新」按钮 + 一行状态**（owner 裁定，仿 dsh-im）：点击即检查，结果**直接出弹窗**——查到新版就在弹窗里看说明并一键安装；已最新 / 失败 / 安装中各有对应弹窗。自动检查开关与档位留在原位置。
- 版本说明的行内 Markdown **就地渲染**（粗体 / 行内代码 / 链接），不再露裸 `**`。
- 更新中心在设置面板里的位置：从「列表之后」挪到「页头 / 工具栏之后」。

验证与影响：

- `npm run check` 全链通过；新增回归断言：原因表必须恰好 13 条、install 必须带非空 `requestId`。
- 无新增契约通道；更新中心仍是自包含 feature（整块移除后其余功能不受影响）。

## v0.1.9 — 2026-09-12

主题：**更新系统真机验收版**——版本号推进，用于在 web profile（按版本号安装的 0.1.8）上跑通「发现新版 → 一键安装 → 待重启提示 → 版本说明」全链。

提炼：

- package.json / package-lock.json 0.1.8 → 0.1.9；**无功能性代码变更**——本次要交付的就是「更新的那一版」本身。
- 版本说明：说明源取 GitHub 上的本文件，**缺节会走降级文案**；因此本节同时是证据链的一环。

验证与影响：

- `npm run check` 全链通过（build / typecheck / verify / guard）。
- 无新增契约通道、无共享层改动；更新中心仍是自包含 feature，整块移除后其余功能不受影响。

## v0.1.8 — 2026-09-12

主题：**更新中心**——插件自己会看新版、能一键装上、装完提醒你重启；顺手把设置面板顶部收紧为三色版本胶囊。

提炼：

- package.json / package-lock.json 0.1.7 → 0.1.8。
- **更新中心（新）**：设置面板里点一下就检查更新，发现新版可一键安装。装不上时不打哑谜——按八种情况分别说清卡在哪；能给出手工命令的附一条命令（可复制），给不出就直说「此情况无法给出可用的重装命令」，绝不自行拼一条命令糊弄。
- **自动检查（新）**：默认开启、默认每 24 小时一次；宿主启动 60 秒后做首次检查（首查失败会在 5 分钟后补一次）。面板里可随时关掉，也可改档位：6 / 12 / 24 小时、每周；关掉立即生效（不再排下一次检查）。
- **待重启提示（新）**：新版装好后，面板常驻一条醒目提示，点名「新版本 x.y.z 已装好，重启宿主后生效」，并说明这不是失败；该状态下不再显示安装按钮，手工命令入口仍保留。
- **版本说明（新）**：发现新版就能在面板里查看该版本的更新说明（即本节文字）；取不到时如实说「暂时取不到更新说明」，不假装这个版本没有说明、也不谎称是你断网。
- 设置面板顶部收紧为**三色版本胶囊**——紫＝本插件、蓝白＝兼容的 dsh-im、黑白＝宿主 dsh（颜色即身份，胶囊只留轴名 + 版本号），窄窗口不再把顶部挤成省略号；副标已删。
- 修复：宿主冷启动时插件可能整块不加载（设置面板与左侧标记一起消失）。

验证与影响：

- `npm run check` 全绿（build / typecheck / verify 全过（node --test 308 项，渲染断言全 PASS）/ guard 116 文件 ≤300 行）。
- 无新增契约通道：更新中心的三条 RPC（状态 / 检查 / 安装）走既有宿主桥载体，自动检查一律用宿主受管定时器。
- 共享层只新增：meta 档案新增 `update` 段（旧档案缺该段自动落默认），面板文案与样式类均在 `update-center-` 命名空间内。
- 更新中心是自包含 feature：整块移除后其余功能不受影响（`npm run check` 仍全绿）。

## v0.1.7 — 2026-09-11

主题：**web profile 装配失败修复**（#79 host 半改道 DSH 公开 `/api` 载体）+ 工具链可移植（#80）+ 记录同步（#81）。

**兼容宿主 `@deepseek-ai/dsh` 0.1.5-rc.2（已验证）；要求宿主提供 `connection.fetch`，更老宿主装配期显式报错、不静默降级。**

提炼：

- package.json / package-lock.json 0.1.6 → 0.1.7；README 中英版本锁与兼容矩阵同步到 0.1.7。
- **宿主兼容声明（新）**：`package.json.dshCompat = { verified: "0.1.5-rc.2", requires: "connection.fetch" }` 为单点真相，构建时注入 → 面板右上角在 dsh-im 轴旁再标一枚「宿主 dsh 0.1.5-rc.2」，悬停给「已验证 + 依赖的宿主能力」，点击跳 README 兼容性。宿主是**会打破插件**的那条轴（#79 即宿主侧装配失败），故与 dsh-im 轴并列标出。
- **修复（#79）**：host 半从 `ctx.connection.rpc.handle('/im-companion')`（前缀路由）改到 `ctx.connection.fetch.register({ path: '/api/im-companion', methods: ['POST'], requestBody: 'buffered' })`。前缀路由注册的最后一步是 `owner.webServer.register(route)`，而那个 Context 是 connection 服务自己的（无 `webServer` 注入）→ 装配期必抛 `cannot get property "webServer" without inject`，整个插件被 loader 丢弃。`inject` 保持只声明 `connection`（补 `webServer` 声明无效，已实测推翻）。决策、根因出处与证伪条件见 `docs/adr/0002`。
- **工具链（#80）**：verify 脚本去掉全部机器路径硬编码——react 走模块解析（本仓 devDependencies），产物按仓库根解析；`npm run check` 恢复整链全绿（此前 verify 首步即 `MODULE_NOT_FOUND` 即断）。顺带堵掉 harness 构建默认清空 `outDir` 会静默删除同目录手写脚本（`tools/preview/welcome-panels.ts`）的坑。
- **记录（#81）**：契约 §3 增「host 入口（载体）」行、CONTEXT 术语表 Contract 行改述、`src/index.ts` 注释与日志（改说真路径 `fetch route /api/im-companion`）、preview mock 补新载体翻译（两代都认）。
- 回归钉：`tools/verify/host-entry.ts` 6 断言（新增「方法守卫 405」与「重装配退让只 warn 不抛不重复注册」）；`render-client` 新增「宿主兼容标记」断言（按 `package.json` 推导，测试里不抄版本号）。

验证与影响：

- `npm run check` 全绿（build / typecheck / verify 17/17 / guard 101 文件 ≤300 行）。
- 运行中宿主实测：`POST /api/im-companion` 的 ping / meta / fs / activity → **200 且回真实数据**；对照未注册路径 → **404**；旧前缀 `/im-companion/ping` → **405**（已退役）；六个边界与异常分支行为不变。
- 三方 bundle hash 一致（本仓 = web 挂载 = desktop 挂载）：`lib/index.js` `F2F72C536331147B`、`lib/client.js` `40A6A01FE71FFEDE`。
- **0.1.6 在 web profile 不可用**（宿主半装配失败）；web 用户请升级到 0.1.7。
- 无新增契约通道；共享层只新增（`rpc.ts` 既有行为改为随载体迁移，理由见 ADR-0002）。

## v0.1.6 — 2026-09-09

主题：dsh-im 4.17.1 管理 RPC 改道兼容（#77 双传输）+ 面板版本兼容标记（#78）——接入向导、舰队列表与在线徽标全线恢复，版本组合一眼可自查。

提炼：

- package.json / package-lock.json 0.1.4 → 0.1.6（0.1.5 只打过 tag、未发布，内容并入本版）；README 中英文版本锁同步到 0.1.6。
- 双传输适配（#77 T5）：渠道管理 RPC 优先打新载体 `/api` + `dsh-im<channel>` + `{ method, payload }`（dsh-im 4.17.1 起），仅传输 reject 回退旧前缀直调（≤4.17.0）；`ok:false` 与 Abort 永不回退；per-channel 方向记忆，环境升级方向回正。接入向导（扫码 `provision.begin` / 手动 `bot.bind-credentials`）、舰队列表、在线徽标、详情抽屉经同一 `RpcCall` 零改动受益。
- 面板版本标记（#78）：右上角并排标出自家版本 `IM Companion v0.1.6` 与 `兼容 dsh-im 4.17.1`（来源 `package.json.dshImCompat` 单点真相，构建时注入）；悬停给「已验证 + 兼容范围」，点击跳 README 兼容性；顶部硬单行（不换行、右组不压缩、左块先省略）。
- README 中英新增「兼容性」小节（版本矩阵 + `#compat` 锚点）。
- 旧 `extractRpc` 冻结保留：回滚 = 调用点切回旧函数即复原。
- 对应提交：见 GitHub Release v0.1.6 附件与提交历史。

验证与影响：

- `npm run check` 全绿（build/typecheck/verify/guard；guard 101 文件 max≤300）；`rpc-dual-transport` 11/11、`render-client` 24/24、`first-view` 14/14。
- tag `v0.1.5` 独立 worktree 重打 `lib/client.js` SHA256 `213393C3…`（= #77 活体验收包逐字节一致）；本版重打后本仓 / web / desktop 三方 hash 一致。
- 无新增契约通道；共享层 Added-only（`rpc.ts` 只新增导出 + 两处调用点 opt-in）。

## v0.1.4 — 2026-09-08

主题：接入双模式（扫码/手动二选一，按渠道能力隐藏）落地；一键收起与串门搬家入口随包；Wayfinder Map #65 收尾关闭。

提炼：

- package.json / package-lock.json 0.1.3 → 0.1.4；README 中英文版本锁同步到 0.1.4。
- 接入双模式（#65 map T1–T4 全关）：9 渠道能力矩阵单点（4 双支持 feishu/dingtalk/qq/wecom、2 仅扫码 weixin/whatsapp、3 仅手动 slack/telegram/discord）；双支持渠道弹窗内二选一（扫码创建 / 手动填写），可来回切换；单支持渠道一步直达；手动走各渠道 `bot.bind-credentials`、成功复用绑定落定编排，失败留表单脱敏可重试；8 键中英文案，扫码页既有行为一字未动。
- 一键收起左栏可见工作区分组（#64）：筛选条旁同行按钮，只收当前可见展开组。
- 舰队面板工具栏「串门搬家」入口：事件制派发，adopt 特性自开面板。
- 配置页右上版本小字自动变为 v0.1.4（package.json 唯一真相，构建时注入）。
- 对应提交：见 GitHub Release v0.1.4 附件与提交历史。

验证与影响：

- `npm run check` 全绿（connect-qr 30/30、first-view 12/12、guard 101 文件 max≤300）；本仓 / web / desktop 三方 bundle sha256 一致。
- 手动绑定走既有 rpc 通道调上游 `bot.bind-credentials`，无新增契约通道；共享层 Added-only。

## v0.1.3 — 2026-09-09

主题：创建时强制选家断裂修复与新建空工作区红虚线修复随包；README 版式（ hero 双图 + 三色竖条）同步。

提炼：

- package.json / package-lock.json 0.1.2 → 0.1.3；README 中英文版本锁同步到 0.1.3。
- 修复 BUG · 新建工作区左侧出现红色虚线：已匹配但无会话数据不再用红色告警表达，与平静一致无条。
- 修复 BUG · 飞书绑定后取消工作区选择导致 Agent 无法关联：创建时强制选 HOME，扫码直绑不断裂；创建表单双行、选家行醒目化、缺件原因直说、成功即收单失败留单。
- README：hero 双图并排 + 蓝橙双栏、三色竖条接线、折叠态截图资源。
- 配置页右上版本小字自动变为 v0.1.3（package.json 唯一真相，构建时注入）。
- 对应提交：见 GitHub Release v0.1.3 附件与提交历史。

验证与影响：

- `npm run check` 全绿。
- 无新增契约通道与行为契约变更；纯修复 + 文档随包。

## v0.1.2 — 2026-09-08

主题：版本号 +1 并在配置页右上角显示版本；命名统一为 IM机器人增强；修复展开态工作组蓝条 lingering。

提炼：

- package.json / package-lock.json 0.1.1 → 0.1.2；README 中英文版本锁同步到 0.1.2。
- 配置页标题行右上新增版本小字 v0.1.2（package.json 唯一真相，构建时注入；点跳仓库首页）。
- 新增 Issue 反馈按钮（跳 `/issues/new`），与 Star 同组右对齐；右组 `margin-left: auto` + 窄窗换行，对标 dsh-mattpocock-skills-deck SettingsPage。
- 命名统一：面板大标题与设置侧栏入口均称 IM机器人增强（英文 IM Companion）。
- 修复展开态工作组蓝条 lingering（#57）：零归因行时不再恢复收起缓存旧蓝（entry-exec tiebreaker）；design-preview 转正并正名。
- 对应提交：见 GitHub Release v0.1.2 附件与提交历史。

验证与影响：

- `npm run check` 全绿。
- 无新增契约通道与行为契约变更。

## v0.1.1 — 2026-09-05

主题：许可证换 MIT、README 打磨定稿、换绑修复随包。

提炼：

- 许可证 BSD-3-Clause 换 MIT（声明文件、包元数据、中英文落款同步）。
- README：标语与 WHY 定稿（助理和家）、14 图 14 引导、去实现细节、用户视角、英文一比一对译。
- 修复 adopt 换绑成功后巷子口暂存不清理（#39）。
- 修复重装配时路由重复注册抛错：让路已注册实例（fail-closed）。
- 对应提交：见 GitHub Release v0.1.1 附件与提交历史。

验证与影响：

- npm pack --dry-run 仅含白名单，无密钥与多余文档。
- `npm run check` 全绿。
- 纯文档＋元数据＋单行修复，无破坏契约。

## v0.1.0 — 2026-09-04

主题：首个公开版：README 全量对齐 Deck 版式与发布通道打通。

提炼：

- README 仿 dsh-mattpocock-skills-deck 版式重写（INSTALL / WHY / IN ACTION / FAQ / ARCHITECTURE / DEVELOPMENT / MORE / THANKS / CONNECT），4 张现货截图 + 首屏图全部落位。
- 发布阻断项修复：cordis.patch.yml 空数组补 insert（id: dsh-im-companion），files 白名单补 cordis.patch.yml，private 设 false，description 与 GitHub About 同源，keywords 补 dsh / dsh-plugin。
- 新增发布向导 scripts/wizard-release.sh（6 段，只扫码）与 scripts/publish-interactive.ps1（Windows 交互窗口发布）。
- 对应提交：见 GitHub Release v0.1.0 附件与提交历史。

验证与影响：

- npm pack --dry-run 仅含白名单（lib + cordis.patch.yml + README + package.json），无密钥与多余文档。
- 卸载即净：dsh plugin remove 自动移除 bundle 条目与面板行为。
- 本体零侵入：不改 dsh-im 一行代码。
