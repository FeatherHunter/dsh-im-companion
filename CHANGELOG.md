# CHANGELOG

> 体例说明（2026-10-11）：自 0.2.8 起版本节改用 Keep-a-Changelog 子集（`## [x.y.z] - 日期` ＋ `### Added/Fixed/Changed/Security`），
> 因为更新面板第 02 章「更新日志」按这套格式读**包内** `CHANGELOG.md`。旧节（`## vX.Y.Z — 日期` ＋ 中文小节）保留原文不动，
> 面板读不出版本节即忽略，不影响展示。附带效应：`validateChangelog()`（更新包导出的发布前校验，本仓未接门禁）会对旧节
> 报 `E_BULLET_ORPHAN`——旧节条目本就不在 `### 分类` 下，属预期，不是发布门禁红灯。

## [Unreleased]

主题：**i18n 双语地基 + first-view / left-filter 试点**（#184）——插件 UI 文案改由 YAML 词条单一来源（同一份文件内 zh/en 两棵），按 DSH 语言服务当前语言查词，切换即时生效（无需刷新页面）；宿主诊断日志仍保持中文。

### Added
- **i18n 共享层**（`src/client/i18n/`）：`core.ts` 纯逻辑（词条三层表 ns→语言→键、查词回退链「当前→en→zh→键名」、`{name}` 插值、语言切换订阅与修订号）；`install.ts` 接线 DSH `locale` 服务（`ctx.get('locale')` 的 `getSnapshot().active` 与 `subscribe`，缺失时回退 `documentElement.lang` → `navigator.language` → 中文）；`index.ts` 只导出 core（不把构建期虚拟模块拖进普通导入）。
- **YAML 词条单一来源＋构建期注入**：`scripts/i18n-locales.mjs` 扫描 `src` 下所有 `locales.yaml`（ns 唯一、zh/en 键集一致、值非空）并校验；`tsdown.config.ts` 经 `virtual:imc-locales` 把词条注入客户端包（校验失败＝构建直接失败）。本次落三份：`common`（3 键）、`first-view`（38 键）、`left-filter`（11 键）。
- **门禁**：新增 `tools/verify/i18n.ts`（词条校验 / 查词回退插值 / zh↔en 键集一致 / 订阅语义）；`first-view`、`left-filter` 门禁补中英切换断言（三段条、行悬停、空提示、收起钮、面板标题）。

### Changed
- **first-view 文案**：`first-view-copy.ts` 内联的 ZH/EN 字典改为查词条（导出与接口不变；`firstViewLang()` 跟随当前语言，显式传 doc 的老测试形态保留）；`dual-mode-copy.ts` 未改，经 `firstViewLang()` 自动跟随。
- **left-filter 文案**：三段条 / 漏斗悬停 / 行悬停 / 空提示 / 收起钮改查词条；`view.ts` 在语言切换时强制重绘（重绘签名并入词条修订号）。
- **设置面板**：标题与挂载失败文案走词条；换语时面板重挂（订阅 `locale` 服务）。

### Fixed
- **英文三段条标签被截断**：切 English 后全称（With assistants / Without assistants）在三段等宽（每段约 90px）里必被 ellipsis；英文词条改短词 **All / Assigned / Unassigned**（12px 粗体含计数约 80px 内可读），漏斗与行悬停仍是完整英文句；中文词条不动。
- **换语言后左栏头两枚插件钮消失**：DSH 换语重建左栏头时节点被带走——漏斗钮因「重绘签名只记头栏找得到」永久短路（看着像要重启 DSH），串门入口只靠 ≤15s 快照兜底。修法：头节点身份变化强制重绘、重绘签名并入「头内有无漏斗钮」位并按**挂后真值**重记，串门入口用 MutationObserver 盯 body 下一帧补挂（零新增轮询/订阅）。

### 升级回归钉子（发版时随整节改名，钉子不得丢）
- 兼容声明不变：dsh-im **5.1.0**（范围 `>=5.1.0 <6`）；**6.0** 发布前必须重跑 **T1/T2** 两份取证（`bots/` 与 `accounts/` 双路径），#170 的 persona 注入 verify 同轮复跑——#175 升级回归钉子照旧有效。
### 说明（不在本次范围）
- 其余 feature 文案分批迁移（每批自带 `locales.yaml`）；渠道名（飞书 / 微信 / QQ 等品牌名）不迁；宿主日志保持中文（诊断口径）；不引入第三方 i18n 库。
## [0.2.25] - 2026-10-24

主题：**条带/气泡助理头像归位 + 更新包跟进 0.18.39**——家列表下每条 item 底部的助理小圆点与悬停气泡头像，之前还停留在"首字＋底色"老画法（行/详情已图标化）；本版收拢到共用 `paintAvatarFace`，与行/详情同一规则（有照片铺图、有 kind 归属图标＋归属色板）；更新包 pin 跟进官方最新 0.18.39。

### Fixed
- **条带/气泡助理头像还是文字版**：`home-row-strip.ts` 芯片（`.hu-cav`）与 `home-row-tip.ts` 气泡（`.hu-tav`）改调共用 `paintAvatarFace(..., 'assistant', ...)`——规则实现只活 `home-avatar-view.ts` 一处；`avatarEl` 内部改走同一函数（签名不变）；T13 #135 样式单表门禁仍严（`paintAvatarFace` 不装表，装表只走 `avatarEl` 入口）。

### Changed
- 更新包 pin：`dsh-plugin-update` 0.18.38 → 0.18.39（官方源最新，`check:update-pkg` 全绿）。
- `package.json` / `package-lock.json` 版本号 0.2.24 → 0.2.25；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.25。

### 说明
- 兼容声明不变：dsh-im **5.1.0**（范围 `>=5.1.0 <6`）；#175 升级回归钉子照旧有效（6.0 之前重跑 T1/T2 两份取证、`bots/` 与 `accounts/` 双路径，#170 的 persona 注入 verify 同轮复跑）。
- 功能上与 0.2.24 的差别只有上述条带/气泡两处调用点；家表数据形状/字段不变，无需迁移。

## [0.2.24] - 2026-10-24

主题：**头像图标化 + 机器人行真头像**（owner 2026-10-23 原型认可）——家/助理换头像弹层不再是首字九宫格：家＝房子图标＋沉稳 9 档，助理＝小机器人图标＋暖亮 9 档；助理详情机器人行删旧副标、第二行加渠道 LOGO、有渠道真头像直接用真的。

### Added
- **两套头像图标＋双色板**：新增 `AvatarKind`（`'home' | 'assistant'`）/ `ASST_PRESETS`（助理暖亮 9 档，与家 `PRESETS` 沉稳系岔开）/ `presetFor` / `avatarStyleFor` / `avatarIconFor`（`src/client/components/home-identity.ts`，既有导出一字不动）；渲染与样式收拢进新模块 `src/client/components/home-avatar-view.ts`（`avatarEl` 从 home-rows 原样搬入签名不变、`avatarOptButton`、`AVATAR_CSS` 独立样式表 `home-avatar`）——home-rows（311→287）/ home-ui-styles（304→299）双双退回 300 行红线内。
- **机器人行真头像优先**：`botBlock` 先读 `BotSnap.avatarUrl`（有就铺满圆显示），没有回落小机器人图标，永不空着；`avatarUrl` 缺键（老宿主／旧固件不下发）用 `?? ''` 兜底再 trim。

### Changed
- **机器人行第二行**：删旧副标废话句，只剩「渠道 LOGO＋渠道名」（LOGO 走 `icons.ts` 的 `channelGlyphSvg` 唯一源，13px 就地渲染）。
- **助理色板终版调优**：对抗式审查发现初版 7 对底色距离 <60（本仓家色板同标准：字底对比 ≥4.3、两两底色 RGB 距离 ≥60），迭代 5 版后全项达标；原型 `prototype-avatar-refresh.html` 已同步终版色值。
- **T11 #128 接线钉子跟随搬家**：单点（`avatarSrc` 调用）现住 `home-avatar-view.ts`，行／弹层／详情仍只调 `avatarEl`／`avatarOptButton`、仍禁自建取图（`home-avatar.ts` 钉子已同步）。
- `package.json` / `package-lock.json` 版本号 0.2.23 → 0.2.24；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.24。

### Fixed
- **机器人行空指针**：`bot.avatarUrl.trim()` 在无该键数据（旧宿主／测试固件）上崩溃，改为缺键兜底（T6b／绿框／面包屑／T6c 四处回归已复绿）。

### 说明
- 兼容声明不变：dsh-im **5.1.0**（范围 `>=5.1.0 <6`）；#175 升级回归钉子照旧有效（6.0 之前重跑 T1/T2 两份取证、`bots/` 与 `accounts/` 双路径，#170 的 persona 注入 verify 同轮复跑）。
- 功能上与 0.2.23 的差别只有上述头像两套件；家表数据形状/字段不变，无需迁移。

## [0.2.23] - 2026-10-23

主题：**master 分支收敛 + #154 修复首发**——0.2.22 发版线（T8 #168 全量 + 0.2.20/0.2.21/0.2.22 热修）已整体合入 `master`；本版把此前只在开发态生效、从未进入 npm 包的两条修复首次交付：#154（左栏「有助理」漏掉默认工作区行）与 #158（绑定前挡下非绝对工作区路径）。

### Fixed
- **左栏「有助理」漏默认工作区行（#154）**：DSH 先把工作区标题本地化再渲染左栏组行（默认区显示名「默认工作区」），而机器人绑定记的是绝对路径 ⇒ 按显示名字面匹配必失配、失配又原样返回显示名，被下游当工作区标识。改为按行身份解析：行 `data-row-key="workspace:<id>"` 经注册表换规范路径、注册表标题兜底、老口径字面匹配最后兜；解析不出返回空哨兵，绝不把显示名当路径传下去。新增 `src/client/data/workspace-index.ts` 与共享单点 `src/workspace-default.ts`，`left-filter` / `left-badges` / `presence` / `home-model` / `home-store` 同步改口，验证器补「默认工作区按行身份解析」用例。
- **绑定前挡下非绝对工作区路径（#158）**：宿主管家端点补语义日志行；客户端绑定动作先校验路径为绝对路径，避免把显示名/相对路径写进绑定表。

### Changed
- **master 收敛**：`hotfix/0.2.22-persona`（T8 #168 全量 + 0.2.20/0.2.21/0.2.22 热修）与 PR #180（#154）已合入 `master`；`#154` 与 T8 同位置的三处冲突按「两边都保留」解决。本版从 `master` 构建，产物与后续发布基线一致。
- `package.json` / `package-lock.json` 版本号 0.2.22 → 0.2.23；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.23。

### 说明
- 兼容声明不变：dsh-im **5.1.0**（范围 `>=5.1.0 <6`）；#175 升级回归钉子照旧有效（6.0 之前重跑 T1/T2 两份取证、`bots/` 与 `accounts/` 双路径，#170 persona verify 同轮复跑）。
- 功能上与 0.2.22 的差别只有上述两条修复 + 文档；家表数据形状/字段不变，无需迁移。

## [0.2.22] - 2026-10-23

主题：**人设首条消息漏注入根治**——刚绑定/刚改完助理资料的会话，第一条消息可能读不到人物设定（两条懒刷新索引的异步落地晚于系统提示词装配）。

### Fixed
- **首条消息人设漏注入（#178）**：`section.text` 是同步的，只能读 250ms 节流的内存快照；归属索引（dsh-im 写的 `state.json`）与人设目录（家表）的懒刷新都是异步的 ⇒ 新会话/刚保存资料后的第一条消息可能拿到空人设（复现：QQ 工作区设人物设定后首问「你是谁」未注入，第二条起正常）。修法两层：① **宿主装配期补救**——在 `system-prompt/assemble` waterfall 上挂 prepend 监听（sections 求值之后、唯一可 await 的位置），本段为空时 await 重扫两索引后重算；只补自己这段、其余 section 原样返回，刷新失败/任何异常退回原 assembly，同会话 2 秒节流（新增 `src/host/persona-assemble.ts`）；② **写侧刷新**——`home.*` / `assistant.*` 写成功后主动刷新人设目录，关掉「保存资料后 250ms 内到达的消息」的旧人设残影窗口。`persona-inject` verify 扩三例：装配前一刻才落盘也命中、失败软退且留常驻日志、TTL 节流与 dispose 摘监听。
- 说明：0.2.21 的家页卡「正在加载」与骨架过窄热修不受影响；兼容声明**不变**（dsh-im 5.1.0 / `>=5.1.0 <6`）。**#175 的升级回归钉子照旧有效**——6.0 之前必须重跑 T1/T2 两份取证（`bots/` + `accounts/` 双路径），#170 的 persona 注入 verify 亦须同轮复跑。

### Changed
- `package.json` / `package-lock.json` 版本号 0.2.21 → 0.2.22；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.22。

## [0.2.21] - 2026-10-23

主题：**0.2.20 线上故障热修**——修复会话头「自定义名表」读取紧循环打爆 RPC 桥、导致设置-家页一直卡在「正在加载」，以及家页首屏骨架缺少两段式家行样式被挤成左侧窄条。

### Fixed
- **会话头元数据紧循环（线上故障）**：`session-header` 槽包装原先把 `SessionHeaderAction` 当普通函数直接调用，hooks 挂在包装组件上；其内部 `setNames` 触发包装重渲染，每次渲染生成新的 `subscribe` / `loadCustomNames` 回调身份 ⇒ `useEffect([sessionId, subscribe])` 每渲染重订阅、订阅时同步回放快照又发 `meta.get`、返回新对象继续触发渲染，形成每秒数百次的 RPC 紧循环（单页面累计 170 万+ 次 `host.rpc.call`，面板加载被拖到 9~20 秒）。改为 `React.createElement` 渲成子组件 + 依赖回调只建一次 + 名表浅比较后才 setState。
- **家页首屏骨架被挤成左窄条**：两段式家行样式（`.hu-row.hrow` / `.hu-btop` / `.hu-sstrip`）原本只由真行渲染时装配；家表未就绪的首帧骨架先出现 ⇒ 落进基表三列 grid，占位全挤在左侧。骨架渲染前先装配该样式表。
- 新增回归钉子：`session-header-render` 断言渲染期间 `meta.get` 调用有界（≤12 次，防订阅身份不稳复发）；`home-steel` 首屏骨架用例先摘样式标签再断言骨架自行装回两段式家行样式表。

### 说明
- 兼容声明**不变**：仍为 dsh-im **5.1.0**（范围 `>=5.1.0 <6`）；#175 的升级回归钉子照旧有效——**6.0 之前**必须重跑 T1/T2 两份取证（`bots/` + `accounts/` 双路径），#170 的 persona 注入 verify 亦须同轮复跑；口径与 [0.2.20] 节同源。

### Changed
- `package.json` / `package-lock.json` 版本号 0.2.20 → 0.2.21；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.21。

## [0.2.20] - 2026-10-23

主题：**T8 助理简介与人物设定**（spec #168，实施票 #169–#176）——助理不再只有名字和头像：新增「简介」（列表展示）与「人物设定」（注入系统提示词的助理身份），人设由宿主按会话归属注入、改完下一条消息生效；旧「性格/语气」区块整体退役、用词统一「详情面板」；dsh-im 兼容声明收口到实际验证过的 5.1.0。

### Added
- **助理简介与人物设定（数据面 · #169）**：家表助理行新增两个可选字符串字段 `description`（简介，≤200 码点，只展示）与 `persona`（人物设定，≤8000 码点，进系统提示词）；唯一真源仍是家表，随助理编号跨迁移/换绑保留、删除随删。空串与缺失等价（读归一空串、落盘剔除空键）；**不 bump `homes.yaml` version、不做迁移**，旧账本读后写回逐字节不变（仅空值剔除差异），超长历史值读取不截断。新增共享字段模块 `src/assistant-fields.ts`（上限、Unicode 码点计数、CRLF 归一、trim、错误文案单点）；创建助理、创建未绑定助理、更新助理三个既有 RPC 各追加两个可选字段（旧载荷行为不变）；更新助理必填闸放宽为「名字/头像/简介/人物设定至少一个」。
- **宿主注入（#170）**：以 DSH 系统提示词 section 通道注入（`name: dsh-im-companion:persona`、`order: 650`、`interpolate: false`，与上游 dsh-im 的 115/125 共存）；渲染 `## 助理身份：<名字>\n\n<人物设定>\n\n始终以该身份回应`，名字去换行/截 64 码点/空则「未命名助理」；空、无归属、无助理、超 8000 码点或任何异常一律空串（超长不截半）；只缓存会话归属不缓存渲染文本；注册项 disposer 挂 `ctx.effect`，热重载不残留，注册失败只记常驻日志、不打断 `apply`；模块级 `inject` 仍只有 `connection`。
- **会话归属索引（#170）**：唯一数据源是各渠道 `<DSH_HOME>/integrations/dsh-<channel>/{bots|accounts}/<botId>/state.json` 的 `sessions[conversationKey] = sessionId`（飞书 `bots/`、微信 `accounts/` 双路）；缓存戳（路径/mtime/大小）懒刷新、负结果 TTL ≤2s、1:N 取文件 mtime 最新且仅结果变化时记歧义、删除清绑定、读失败保留上次、全程 fail-soft；禁文件监听与常驻轮询，首条消息允许 miss。
- **日志（#170）**：新增五条 `persona.*` 事件（解析/刷新 debug+按需、刷新失败与归属歧义 warn+常驻、换绑同步 info+常驻）；「更新助理」语义扩展为人设资料变更、只记变更键名；人设/简介正文永不进日志（只记长度、sha8、定位字段）。
- **创建弹窗两栏（#171）**：新建助理弹窗名字后内嵌两栏——简介单行、人物设定多行（实时码点计数）；可留空跳过，超限当场禁用主按钮并给字段定位提示，随创建一次写入。
- **编辑入口与家页第三行（#172）**：助理列表行第 4 个图标「编辑简介与人物设定」打开只含两栏的小弹窗；保存中双按钮禁用并显示「保存中…」且不能中途关闭，成功先关窗再提示「已保存助理资料」，失败不关窗、保留输入并显示宿主错误原文，8 秒超时按失败；trim 后无改动直接关窗、不发写请求；家页助理卡第三行有简介才显示（单行省略、悬停全文、空不占位，行高 +21px）。
- **详情面板「助理人设」块（#173/#174）**：详情面板新增只读块（名字/简介/人物设定；人物设定 3 行折叠可展开、可复制、空态文案）；「编辑」按助理 id 派发跨功能事件 `OPEN_ASSIST_EDIT_EVENT` 后关闭面板（契约已在 `docs/features-contract.md` 按「已知债务」登记）；找不到助理时只提示并隐藏编辑/复制；超长历史值完整显示并提示去编辑修正。
- **兼容收口与门禁（#175）**：dsh-im 兼容声明由 `verified: 4.39.0` / `range: >=4.17.1 || <=4.17.0` 收口为 **`verified: 5.1.0`** / **`range: >=5.1.0 <6`**；面板胶囊与悬停文案（中英）同步；新增 `tools/verify/features/compat-claim.ts` 版本门禁（声明字段、构建注入、产物含值、范围语义、词面基线）；与上游 `dsh-im` order 115/125 的共存、`section` 注册契约、`bots/`+`accounts/` 双路径由 persona 注入 verify 钉住。
- 新增验证：`assistant-fields` / `persona-inject` / `home-asst-profile` / `compat-claim` 四个功能验证器（已接进 `npm run verify`），`tools/verify/fixtures/fake-ctx.ts` 抽出假宿主上下文；`home-store` / `home-create-flow` / `home-steel` / `detail-drawer` 等既有钉子同步扩展。

### Changed
- 旧「性格/语气」区块整体退役：写路径（宿主 RPC/客户端动作/预填）、读展示、旧文案、死样式与两段旧验证全部删除；`src/` 与 `tools/verify/` 中「性格」为 0，产品用词统一「详情面板」（原「详情抽屉/详情页」全部改口）。
- 4.x 回退代码（≤4.17.0 旧路由直调、`/api` 传输方向记忆）保留在运行期，但不再对外声明兼容 4.x——未验证过的范围不再宣称；运行期仍不做版本分支（诚实性落在声明与门禁上）。dsh-im **6.0 之前必须重跑 T1/T2 两份取证**（系统提示词注入面 + 会话归属落盘映射）再决定是否扩大范围。
- `package.json` / `package-lock.json` 版本号 0.2.19 → 0.2.20；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.20。

### Fixed
- 发布前独立只读评审发现的边界问题（已修复并补断言）：`state.json` 解析失败不再把输入片段带进常驻日志（只记固定文案）；同一文件内重复 sessionId 不再误报归属歧义；助理目录读失败不再永久冻结（按缓存戳自愈重试）；保存进行中不能被遮罩/Esc 关闭（避免误以为已保存）；两栏计数改按 Unicode 码点（不再被 UTF-16 `maxlength` 提前截停）；家页第三行行高补足设计值 21px。

### 说明
- 旧账本无需迁移：旧版读到的两栏为空即等价「未填写」，写回时自动剔除空键、其余字节不变；升级后首次保存任一人设资料才会写入新键。
- **长历史会话**：存量长上下文会话由第三方层中途改写未定位，本版承诺「新会话生效」（首条消息允许 miss，之后必须命中），不声称所有存量会话立即改写。
- spec #168 的 60 条 User Stories 由实施票 #169–#176 覆盖（矩阵见 #176）；真机验收 A/B/C/D 在安装本版后执行，验收通过后由规格详情页「完成」按钮收口。

## [0.2.19] - 2026-10-20

主题：**更新包跟随到官方源最新 0.18.37**（纯依赖跟随发版，本仓产品代码零改）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.33 跟到 **0.18.37**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）。0.18.34～0.18.37 是一整条「更新链路真机缺陷」修复线：①#236 管理器路移除失败后不再把在册状态弄丢——移除前探到在册就按「已恢复在册 / 恢复在册未成功 / 无法确认」三档如实补偿并复探，装前未在册的不二次改拓扑；②#237 CLI 路改认官方桌面运行时布局（`@deepseek-ai/dsh-desktop-host/lib/cli.js`），`dsh web` 首次安装不再 2ms `spawn-failed`；③#241 recovery-required 死锁——集成方注入的占位运行版 `0.0.0` 归一为「未知」，中断任务允许一次恢复重试，不再「想恢复必须重试、重试被恢复态挡住」；④#238 目标从未装过时不再先渲染上一次失败账本（首装前不再弹旧失败横幅）；⑤#239 队列整写瞬时 EPERM/EACCES/EBUSY 小步重试，不再误判「上次安装异常中断」；⑥#240 批量面板高度契约（失败横幅不再被压扁、复制按钮不越框）；⑦#242 批量入口按钮在关掉弹窗后自己刷回，不再永远卡在「正在安装…」；⑧#243 批量自动续跑加 10 分钟新鲜度门限，两小时前的旧会话不再被静默续跑。另含上游开发工具加法（`scripts/release.mjs` 一键发版、`scripts/panel-layout-probe.mjs` 布局探针），只在更新包内。**公开面不变**（快照字段、verify 事件字段、码值、手工命令安全政策），**本仓产品代码零改**（宿主五电话与快照透传原样全绿）。
- `package.json` / `package-lock.json` 版本号 0.2.18 → 0.2.19（锁文件 `resolved` 指向官方 registry 源）；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.19；`CONTEXT.md` 更新包术语行同步到 0.18.37；致谢榜不动（仍 Shimmernight ×4、vk-liu-cn-1 ×1，中英一致）。

## [0.2.18] - 2026-10-20

主题：**更新包跟随到官方源最新 0.18.33**（纯依赖跟随发版，本仓产品代码零改）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.32 跟到 **0.18.33**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）。要点：0.18.33 是上游「发布线并入 master」后的**首个合体版**——包含 0.18.26～0.18.32 的修复线（#215 缺席目标不再被旧失败任务拦成 recovery-required；#216 批量面板三处显示缺陷；#208 批次日志对齐（三条批量行共享 `sessionHash`，停下的原因/阶段说得清）；#217 批次停下时自家排队占位不再造成全局 `update-busy`（僵尸占位）；#218 批量续跑换号重提，不再假成功（账本记「已安装完成」而磁盘其实没装）；#219 批量在装按钮只留一枚转圈、本体可排批量面板第一行；#231 批量面板先渲染旧批次账本的误导帧；#232 忙时未轮到的行改说「已在队列 · 会自动依次安装」等）＋ 一次**内部目录拆分重构**（`src/` 拆进 `core/` `host/` `panel/` `shared/` 域目录，旧路径留兼容壳）。该重构只动内部布局，**公开面零变**（11 个导出子路径、导出名、事件契约、日志行字段、诊断键一字未动），运行时行为与 0.18.32 相同；按包名/子路径解析的代码不受影响。**本仓接线代码零改**（宿主五电话与快照透传原样全绿）。
- `package.json` / `package-lock.json` 版本号 0.2.17 → 0.2.18（锁文件 `resolved` 指向官方 registry 源）；`README.md` / `docs/README.en.md` 安装示例同步到 0.2.18；`CONTEXT.md` 更新包术语行同步到 0.18.33；致谢榜不动（仍 Shimmernight ×4、vk-liu-cn-1 ×1，中英一致）。

## [0.2.17] - 2026-10-19

主题：**更新包跟随到官方源最新 0.18.32**（纯依赖跟随发版，本仓产品代码零改）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.25 升到 **0.18.32**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）。要点：0.18.26～0.18.32 这一段把批量更新面板的显示缺陷与批次日志补齐——#215 缺席目标不再被旧失败任务判成 recovery-required（诊断不再漏出占位版号 0.0.0）；#216 批量面板三处显示缺陷（待重启误判已最新、占位版号不进版本列、档案卷主按钮与在装按钮不可见，在装按钮加动效）；#217 批次停下时自家排队占位不再造成全局 update-busy；#218 假成功（已装待重启不再被说成「已是最新」）；#219 批量在装按钮只留一枚转圈、本体可排批量面板第一行（`selfOrder: 'first'`）；#231 批量面板先渲染旧批次账本的误导帧（改为「正在查询版本信息」／「正在按最新版本重新检查…」）；#232 批量进行中未轮到的行不再说「加入队列」，改说「已排队 · 前方还有 N 项」。日志侧新增 `update.batch.run.start`、`update.install.retry`，总账改活跃时长（`activeMs`／`sessionAgeMs`／`resumed`），`update.check.done` 增 `pendingRestart`／`jobState`，`update.log.degraded` 带被丢事件名。0.18.32 与 0.18.31 代码相同，只是把这条已验收的修复线钉成可依赖的版本号。
- 0.18.31 起的公开面加法（`logContract`／`logHealth` 字段、CHANGELOG `cached` 语义）同步进本仓更新宿主校验用例 `tools/verify/features/update-host.ts`；**本仓产品代码零改**（宿主五电话与快照透传原样全绿）。
- `package.json` / `package-lock.json` 版本号 0.2.16 → 0.2.17；`README.md` / `docs/README.en.md` 安装示例同步；`CONTEXT.md` 更新包术语行同步到 0.18.32；致谢榜不动（仍 Shimmernight ×4、vk-liu-cn-1 ×1，中英一致）。

## [0.2.16] - 2026-10-18

主题：**更新包跟随到官方源最新 0.18.25**（纯依赖跟随发版，本仓产品代码零改）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.24 升到 **0.18.25**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）。要点：#174 失败之后「还剩不剩路」不再平铺——新增纯派生模块 `last-resort.ts` 给出四态 `last-resort` / `salvageable` / `dead-end` / `unknown`，单插件失败块、批量失败行与槽位安装按钮三处同形（红轨＋行内警示图标＋「最后手段」徽标＋状态短语，`data-last-resort` 是统一钩子），只有「没有救援且当帧命令可信」才高亮，没命令也不画空高亮；#177 失败回包沿用的旧手工命令按帧判可信度（`manualSource`：`frame` / `carried-over` / `null`），carried-over 一律 fail-closed（不展示、不复制、不高亮）并在失败帧后静默补读一次 `updateStatus`；复制成功反馈移到按钮外气泡（按钮文案与图标不再跳变）；#204 宿主内使用范围解析改走 DSH 权威身份链（显式覆盖 → `ctx.profileContext` → 第三方 Desktop 的 `ctx.desktopProfiles.current` → `env.DSH_PROFILE_DIR` → 目标包反推兜底），只有全无 profile 上下文才 `unknown-profile`，开发态挂载的 `dev-source` 语义不变；#92 手工命令为空按五类原因分因话术（源码安装 / 开发态 / 范围认不出 / 运行版未知 / 没有安全候选）。**快照字段、verify 事件字段、`src/codes.ts` 码值与手工命令安全政策全部不变**（公开面只增可选入参与类型转出），故本仓宿主五电话与快照透传代码零改（`update-center.ts` / `update-host.ts` 用例原样全绿）。
- `package.json` / `package-lock.json` 版本号 0.2.15 → 0.2.16；`README.md` / `docs/README.en.md` 安装示例同步；`CONTEXT.md` 更新包术语行同步到 0.18.25；致谢榜不动（仍 Shimmernight ×4、vk-liu-cn-1 ×1，中英一致）。

## [0.2.15] - 2026-10-18

主题：**头像选择器 10 格重做（#152 追修）＋ 更新包跟随到官方源最新 0.18.24**。

### Changed
- 头像选择器 10 格重做（#152 追修）：照片入口移到首位并改成相机 SVG 图标（不再是黄色图片＋文字）；9 档预置实色按高级感重排（墨黑 `#17181C` 首位、DeepSeek 蓝 `#4D6BFE` 次位打底，另 7 档墨绿/雾蓝/梅紫/燕麦/砖红/电紫/正绿）；默认 null 色退场（不再出现在选择器）；5 列布局，cell 46px。
- 依赖 `dsh-plugin-update` 由 0.18.11 升到 **0.18.24**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过；registry 上 0.18.12～0.18.23 未单独发布，本次一次带走）。要点：#197 安装身份三态（`identity`：update / first-install / up-to-date，首次安装不再被说成换版）＋ #190 在册格（`registered`，未登记时待重启横幅改说「重启不会加载」）——快照字段七变九属包有意的公开形状加法扩展，verify `update-host.ts` T7-2 跟随到九字段；#198 带凭据 URL 只遮 userinfo 不丢详情；#182 运行版本未知不再伪造 `0.0.0`；#183 stable 通道撞上预发布 latest 时回退全量包文档；#185 CLI 超时三态；`engines.dsh` 不满足提前拦（`incompatible-dsh`）。**本仓接线代码零改**（宿主五电话与快照透传逐字不变）。
- `package.json` / `package-lock.json` 版本号 0.2.14 → 0.2.15；`README.md` / `docs/README.en.md` 安装示例同步；`CONTEXT.md` 更新包术语行同步到 0.18.24；致谢榜无新增（仍 Shimmernight ×4、vk-liu-cn-1 ×1，中英不动）。

## [0.2.14] - 2026-10-18

主题：**升级链路验证版本**——内容与 0.2.13 完全一致，仅版本号递增，供更新中心升级功能实测（升级后看面板 build 号变为 0.2.14 即证明新包在跑）。

### Changed
- 版本号 0.2.13 → 0.2.14；`README.md` / `docs/README.en.md` 安装示例同步；其余代码、依赖 pin（`dsh-plugin-update@0.18.11`）、致谢榜均不动。

## [0.2.13] - 2026-10-18

主题：**主题 token 第一性原理映射（#151，DSH 37 别名）＋ 更新包跟随到官方源最新 0.18.11 ＋ 家行/助理行交互收尾（#150/#152）**。

### Added
- 主题 token 第一性原理映射（#151，asar 实证 bundle）：新增 `--af-business`（执行中蓝）/ `--af-idle`（无信号灰）/ `--af-link` / `--af-warn-label` 四个别名；在线/离线/执行中/待看四态全部收敛到 DSH 37 token，项目内硬编码色退役（`--af-success`/`--af-warn`/`--af-danger` fallback 同步 DSH 静态真值 `#22c55e`/`#f59e0b`/`#ec1313`）。
- 离线语义纠正：离线/未绑定不再用红色（红只给需处理），统一走 `idle-primary #d4d4d4`（徽标/雷达/详情圆点/欢迎横幅四处一致）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.7 升到 **0.18.11**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过；registry 从 0.18.7 直跳 0.18.11，中间号段未单独发布，四段一次带走）。要点：0.18.8 HMR 守卫 `already-installed` 改“如实移除再装”（#167）；0.18.9 scoped 包 tarball 取 basename ＋ registry 归一 ＋ 全量包文档 4MB 墙 ＋ stable 遇预发布 latest 报 `channel-mismatch` ＋ 12 个宿主拒绝码中文下一步（#178/#183）；0.18.10 任务落盘 `state.json` ＋ 新增可选 `job.previousVersion`（#179/#186）；0.18.11 批量失败横幅双复制按钮 ＋ 安装锁 TTL 自愈与原子建锁（#176/#181）。**本仓接线代码零改**（宿主五电话与七字段快照逐字不变，`update-center.ts` 7/7、`update-host.ts` 10/10）。
- 家行/助理行交互收尾（#150）：L2 助理行与 L1 家行同形（去掉「更多」，改名进输入态就地改，头像开纯换头像弹层）；改名锚定提示 ＋ 焦点只亮边框（`inset` 环不断裁）＋ 成功提示浮到列表顶部；操作令牌作用域收紧。
- 头像预置配色重做（#152）：7 档显式实色（含 DeepSeek 蓝白/黑白两档），色块 34→46px。
- DSH 别名跟随：`separator`→`separator-primary`、`fill-secondary`→`fill-tertiary`（与宿主真实别名对齐）；设计稿竖条/标题色走 `error/business/warn/idle` 四 token（`tools/verify/features/design-preview.ts` 断言同步）。
- `README.md` / `docs/README.en.md` 安装示例同步到 0.2.13；`CONTEXT.md` 更新包术语行同步到 0.18.11。
- AGENTS.md：junction 常驻（desktop 仍是 Junction→本仓）＋ 真假安装切换配方（owner 2026-10-17 订正）。

### Fixed
- `nosig0` 兜底规则不再引用旧异常红（断言改走 `state-error-primary` 缺席检查，#151 token 化）。
- 改名输入框焦点环被容器裁断、成功提示在底部不易察觉（#150：盒内 `inset` 环 ＋ 顶部 toast）。

## [0.2.12] - 2026-10-17

主题：**更新包跟随到官方源最新 0.18.7（安装失败翻译官 ＋ 合规版降级）＋ 家行/助理行交互重做与显示规范收口**。

### Added
- 家行 ITEM（#148）：去掉「更多」，改名进输入态**就地改**（Enter 存 / Esc 撤 / 失焦存），「更换头像」拆成独立纯弹层（**点头像本身**也能开）。
- 助理行两档（#147）：已绑＝「更换机器人」琥珀档、未绑＝「绑定机器人」红档（「接入」按钮退场）；未绑定 pill 与副标走 `bad` 档；渠道菜单设计化（九行带渠道 LOGO ＋ 一行注解，菜单自弹窗顶部往下展开）。
- 显示规范（#139）：新增共享原语 `src/client/components/home-meta.ts`（元信息行＝节点数组 ＋ gap ＋ 主次色阶）；面包屑改「层级名次级色 ＋ 对象名主色」两段；规范落 `docs/display-spec.md`。
- 全仓门禁 `tools/verify/separator-retired.ts`：剥注释后 `src/**/*.ts` 内 U+00B7 零命中（唯一豁免 `src/host/config-yaml.ts` 的注释头——它落进用户磁盘的 YAML，不是渲染文案）。
- 舰队雷达单元格浮层：首行加渠道 LOGO（未知渠道只留文字）＋ 表格画完即预热全格头像（首悬即见真图，全命中时零请求）。
- 左栏徽标顶栏工作区脸：改取该家真实头像 / 色脸（无家回落名首字灰底）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.3 升到 **0.18.7**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）。四版要点：0.18.4 安装失败摘要**真因前置**（不再被省略号吃掉）；0.18.5 **安装失败翻译官**（已知签名识别 ＋ 三值诚实归因 ＋ 解封时刻以报文自述窗口为准，`diag` 只增可选三键 `causeKind/causePackage/causeUnlockAt`，顶层码仍 `install-failed`）；0.18.6 **合规版降级**（年龄门拦住更新目标时给「满门限的最新版」，新增 `updateCheckFallback` / `updateInstallCandidate` 两条电话，老宿主缺电话自动退化「只呈现」）；0.18.7 批量面接上同一套降级 ＋ 失败归因改走机读 `diag`。**本仓接线代码零改**（宿主/面板仍走包自带 entry，快照形状逐字不变）。
- dsh-im 兼容声明由 4.21.1 升到 **4.39.0**（#149）：`package.json` 的 `dshImCompat.verified`（构建注入面板胶囊）＋ `tools/verify/features/home-parity.ts` 夹具；上游载体规则按 4.39.0 源码复核，与 4.17.1 一致（端点 / authority / 电话名不变，无需改码）。
- README（中英）：按 owner 指示**删除「兼容性」与「能力地图：四种颗粒度」两节**；收尾句改为「有任何问题、建议、意见、想法、IDEA、交流、吐槽，都欢迎提交 ISSUE！🌹」；安装示例同步到 0.2.12；致谢榜中英同步。
- `CONTEXT.md` 更新包术语行同步到 0.18.7。

### Fixed
- 改名输入框焦点环右侧被容器（`.hu-nm` 的 `overflow:hidden`）裁断——焦点环改盒内 `box-shadow: inset 0 0 0 3px`。
- 改名成功提示出现在列表底部不易察觉——改浮到列表顶部（`.home-ui.hu-toast-top`）。
- 未绑定助理不再编造渠道（#138：`status=unbound ⇒ 渠道不显示`；宿主侧丢弃 bound 却缺 channel/botId 的脏行）。
- 在线状态色统一同一绿档（#142：胶囊 / 圆点 / 气泡状态字 / 候选副标四处一致，离线与未绑定不绿）。
- 接入抢跑（#141）：从助理空态接入新机器人不再丢助理身份、也不再补出同名助理行；对账不再替「无主机器人」补行、不复活已删的绑定助理。
- 无空闲机器人时的绑定死胡同（#137）：空态出口直接在卡片本体上开渠道菜单，去掉假可点的「创建」。

## [0.2.11] - 2026-10-16

主题：**更新包跟随到官方源最新 0.18.3（开发态挂载独立码 `dev-source` ＋ 无快照失败页补回复制诊断）**。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.2 升到 **0.18.3**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）：junction / 源码链接 / 显式外部目录不再报 `unknown-profile`，改走新增 `dev-source` 阻塞码（取值可增、向后兼容；包真找不到仍报 `unknown-profile`，行为一字不动）；面板给开发态口径文案且不提供手工命令。本仓跟随一处：宿主只读预检的触发码由 `unknown-profile` 扩到 `dev-source`（`src/host/update.ts` 一行；失败仍原样透传，红字语义一字不动），其余接线零改（宿主/面板仍走既有五电话与七字段快照）。
- `README.md` / `docs/README.en.md` 安装示例同步到 0.2.11；`CONTEXT.md` 更新包术语行同步到 0.18.3。

### Fixed
- 首帧即失败（`unknown-profile` / `dev-source` 类不写快照的失败）时「复制诊断」按钮不再缺席（`copy-diag` 门放宽为有快照或失败横幅或失败引用即画；首帧 loading 仍不画）。

## [0.2.10] - 2026-10-16

主题：**更新包跟随到官方源最新 0.18.2（检查后置条件收敛：陈旧目标版不再被卖成「有新版本」）**。

### Changed
- 依赖 `dsh-plugin-update` 由 0.18.1 升到 **0.18.2**（npm 官方源 `latest`，exact pin；`npm run check:update-pkg` 复核通过）：面板自动查（`batchCheck`）成功查出的结论现在按与驱动预查同一口径收敛进会话——会话里的陈旧目标不再永生（远端曾是 `0.3.55`、今天跑 `0.3.60` 时不再把「降级」画成「有新版本」）；渲染层另加数字守卫「目标版不比当前版新，永不画箭头」。本仓接线代码零改（宿主/面板仍走既有五电话与七字段快照）。
- `README.md` / `docs/README.en.md` 安装示例同步到 0.2.10；`CONTEXT.md` 更新包术语行同步到 0.18.2。

### Fixed
- 更新面板可能把**陈旧目标版本**显示成「有新版本」（0.18.2 上游修复随包进入本插件客户端产物：检查成功后落盘再重读，端出去的和盘上是同一份）。

## [0.2.9] - 2026-10-16

主题：**更新包跟随到官方源最新 0.18.1（第五电话接线入库）＋ 家行 L1 信息层级与悬停气泡 ＋ 头像/孤儿链收口**。

### Added
- L1 家行两段式卡片 ＋ 助理条带（三级降级、放不下用「N 助理」徽章报总数）＋ 孤儿置顶（T13/T14 #135/#136）。
- 助理悬停气泡（A 横排：头像 ＋ 名字 ＋ 渠道状态行；进 top layer；悬停落 `assistant.action/tip-show` 自证几何）。
- 头像图片回归链（T11 #128）：家/助理设置上传头像（png/jpg/webp 魔数认、2 MiB 单闸）→ 落盘 `avatars/` → 列表详情一致显示 → 清除回落预设色。
- 孤儿家两动作（T10b #127）：「选择工作区」重绑走 T8 收养链、「删除家」两步确认进 tombstone（seed 不复活）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.13.0 升到 **0.18.1**（npm 官方源 `latest`，exact pin；#132 跟随代码本版入库）。
- 宿主接第五电话 `imc.logAppend`（面板日志通道：包回 `{accepted,dropped}` 无 ok 包裹，按成功信封进 `value`，不走失败通道）；快照断言六字段 → 七字段（0.17.0 起新增 `installed`）。
- `README.md` / `docs/README.en.md` 安装示例同步到 0.2.9；`CONTEXT.md` 电话术语行同步到五电话、更新包术语行同步到 0.18.1。
- 致谢：首批两位外部贡献者上榜（Issue #78、#97）。

### Fixed
- 头像上传后列表不立刻显示（写后必须重读家表；T11 #128 真机前阻断，已修）。
- 悬停气泡左下角裸字（收起即拆盒 ＋ 每画必扫旧盒 ＋ 进 top layer；面板日志通道高频成功不再记 error 落盘）。
- 真机竖排卡（宿主环境给 column 方向：主轴/状态行/渠道节点方向全部写死 row）。
- L1 孤儿按钮无悬停反馈；页头左右边距与上下对齐；气泡状态字仅「未绑定」走红色档。

## [0.2.8] - 2026-10-11

主题：**更新包升到 0.13.0 ＋ 更新说明首次随包发布**。本版同时把 0.2.4–0.2.7 期间**从未提交**的工作树成果一次补记入库（那四个版本是从未进 git 的工作树直接发出去的，仓库侧无 commit / 无 tag，下面 0.2.4–0.2.7 四条是按公开 tarball 逐版复核后的补记）。

### Changed
- 依赖 `dsh-plugin-update` 由 0.10.0 升到 **0.13.0**（npm 官方源 `latest`，exact pin）：进本插件客户端产物的更新内核随之更新——0.13.0 的面板字号参数化（`themeTokens` 新增 5 个字号语义键 `panelFontSize` / `panelChapterFontSize` / `panelBannerTitleFontSize` / `panelLogFontSize` / `panelSmallFontSize`，不传零回归）；0.12.0 的日志中文分类、档案卷版式收紧、横幅副行出框、宿主样式隔离；0.11.0 的 `channel-mismatch` 阻塞原因码与「手工命令不猜版本」。本仓宿主侧与面板侧接线代码零改（本仓不传 `themeTokens`，一律走默认外观）。
- `package.json` 的 `files` 白名单加 `CHANGELOG.md`：本版起发出去的包自带更新说明，更新面板第 02 章能读到本包自己的日志（此前包内没有这个文件，面板只能显示「作者未提供更新说明」）。
- `README.md` / `docs/README.en.md` 安装示例版本号同步到 0.2.8；`CONTEXT.md` 的「更新包」术语行同步到 0.13.0。

### Fixed
- `scripts/sync-update-pkg.mjs`（发布前升级工具）：`--apply` 不再调用已随 T5 #110 M6 退役的 `scripts/gen-update-constants.mjs`（删链后的漏网引用，会让升级在装完包之后报 ENOENT）；同时修 Windows 上 `execFileSync('npm')` 必 ENOENT 的问题（Windows 只有 `npm.cmd`，Node 的 execFile 不做 PATHEXT 解析）——改用 `execSync` 单字符串调用，顺带消掉 DEP0190 弃用警告。

## [0.2.7] - 2026-10-10

主题（补记）：更新中心挂载点搬到页头右上组、⭐ 左侧（owner 2026-10-10 裁定；原「工具栏之后、撰写条之前」作废）。

### Changed
- `src/client/components/panel.ts`：`#imc-update-center` 容器改建在页头右上组，`af-hd-right` 顺序为 verBox → updateCenterHost → starLink → feedbackLink，`af-root` 回归 hd → toolbar → compose → body → promo。id / 类名 / 事件派发一律未动，A1 对特性仍零感知。

## [0.2.6] - 2026-10-10

主题（补记）：解信封回归修补——面板不再永远停在「正在读取更新状态…」（真机实证后定位）。

### Fixed
- `src/features/update-center/view.ts` 新增 `toPackageReply()`：把宿主 `RpcResult` 信封拆成更新包认的扁平回包（成功拆 `value`；失败从 `error.details.update` 还原包载荷；成功信封缺 `value` 落失败而不空转；已是扁平回包一律直通）。薄挂载重写时丢掉了旧自画实现的这层解码 ⇒ 包只看到 `{ok:true,value:{…}}`，快照与错误恒 null、面板永远空转。

## [0.2.5] - 2026-10-09

主题（补记）：更新中心交互定稿 #118 U1/U2——一颗「检查更新」按钮，点开总是完整五章 dialog。

### Changed
- 更新入口件挂载参数：`openOn` 由 `has-update` 改为 `always`（有无新版点开都有完整五章，避免「没内容」错觉），主题显式 `default`（最小可用深色，不用 archive 皮肤）。

## [0.2.4] - 2026-10-09

主题（补记）：T5 #110 落地——更新中心薄层化，自画 11 文件整体删除，改挂更新包自带入口件。

### Changed
- `src/features/update-center/`：删除自画 11 文件（data / phone / dialog / reasons / text / settings / changelog / markdown / styles / constants / derived），只留 `manifest.ts`（order 24 / settings.section）与 `view.ts`（薄挂载 `mountUpdateEntry`，事件制容器 `#imc-update-center` 与主动认领原样保留）。
- 宿主侧：`src/host/update.ts` 收缩为「四电话接线 ＋ 信封翻译」；删除自建自动检查调度器（`src/host/update-schedule.ts`）与派生常量链（`scripts/gen-update-constants.mjs` / `src/features/update-center/derived.ts` / 手写 `src/host/dsh-plugin-update.d.ts`）；`src/index.ts` 的 `inject` 去掉 `timer`（不再有受管定时器）。
- 更新包 0.2.0 → 0.10.0；新增第四通电话 `imc.updateChangelog`（电话名由包内按前缀自拼，本仓只建表）。

## v0.2.3 — 2026-10-05

主题：**文档版**——把 README「能力地图」刷到 npm 页面。0.2.2 的 tarball 里 README 还是发布前那一版（npm 页仍写着「当前 0.1.8」），本版只同步文档，功能零变更。

改动：

- `README.md` / `docs/README.en.md`：能力地图（L0 零配置 / L1 面板可控 / L2 程序化集成 / L3 二次开发）随包发布；安装示例与兼容表版本号同步到 0.2.3。
- 无功能代码变更：`lib/` 与 0.2.2 一致，仅 README / CHANGELOG 变动。

验证与影响：

- 发布门禁 `npm run check`（build ＋ typecheck ＋ verify ＋ guard）全绿。
- tarball 自验：`package/README.md` 含「能力地图」且 `package.json` 版本为 0.2.3。

## v0.2.2 — 2026-10-02

主题：**投稿门禁修复**（第三方清单 `awesome-ai-plugins` PR #571 的集中扫描，[#100](https://github.com/FeatherHunter/dsh-im-companion/issues/100)）——清掉扫描器点名的高危草稿文件、补齐两个低危缺项，让集中扫描从 73 分抬到 85 分（零严重、零高危）。另：README 增补「能力地图：四种颗粒度」，把 L0 零配置 / L1 面板可控 / L2 程序化集成 / L3 二次开发四级用法一次讲清。

改动：

- `git rm` 两个误提交的调试草稿 `.scratch/dbg-e.cjs`、`.scratch/e2-logic-check.cjs`（含 `eval`，触发 `DANGEROUS_DYNAMIC_EXECUTION` 高危）；删前全仓 grep 确认零引用。
- 新增 `SECURITY.md`（漏洞披露指引 + 支持版本）与 `.github/dependabot.yml`（npm + GitHub Actions，月更）。
- 新增 `scripts/publish-token.ps1`：token 无人值守发布链（写权限探针 → `npm run check` 门禁 → 发布 → 可见性复核；受理≠可见与 E409 语义见脚本头注）。
- `README.md` / `docs/README.en.md`：新增能力地图（四级颗粒度 ＋ 宿主桥端点清单 ＋ 契约四通道 ＋ 扩展点），安装示例与兼容表版本号同步到 0.2.2。

验证与影响：

- `plugin-scanner scan . --ecosystem deepseek-harness --min-score 80 --fail-on-severity high`（已跟踪树视角，等价远端）：73 → 79 → **85/100（B），零高危，exit 0**。
- `npm run check`（build ＋ typecheck ＋ verify ＋ guard）全绿；其余 205 个已跟踪 `.scratch` 草稿与全部功能代码一字未动。
- 已知边界：3 处 `RISKY_APPROVAL_DEFAULT`（medium，`.scratch/companion-wayfinder/` 下 3 个 md）与本地未跟踪文件噪声未处理，留待后续专项。
- 功能行为零变更，本版消耗在门禁纪律、发布链与文档上。

## v0.2.1 — 2026-10-01

主题：**宿主兼容声明升 `dsh 0.2.0-rc.2` ＋ 面板宿主胶囊删除**（用户裁定 2026-10-01；宿主口径只留 README 兼容性小节与市场徽章）＋ **升级链路测试靶子**（0.2.0 面板「检查更新 → 一键安装」拿它当目标）。

改动：

- `package.json.dshCompat.verified` 0.1.5-rc.2 → **0.2.0-rc.2**；`range` / `engines.dsh` 同步放宽到 `>=0.1.2-alpha.2 <0.3.0-0`（下界不动：仍是 `fetch.register` 引入版；旧上限 `<0.2.0-0` 会把 0.2.0-rc.2 挡在外面）。
- 面板删黑白宿主胶囊：`panel.ts` 渲染块 + `hostCompat()` + `__DSH_COMPAT__` 注入 + `first-view-copy` 两套文案 + `.af-cap--host` 样式 + `#79` 测试全删；`dshCompat` 真相源保留（市场徽章读 `engines.dsh`，`host-entry` 同字断言保留）；向导体检/复核改查“无 `af-cap--host` 残留”；README 中英改为两枚胶囊。
- 验收判据：0.2.0 面板查到 `v0.2.1` → 安装 → `pending-restart` 横幅 → 重启后胶囊只剩 `v0.2.1` + `dsh-im 4.21.1` 两枚。

验证与影响：

- `npm run check` 全链通过；更新包 pin 仍是 `dsh-plugin-update@0.2.0`（= 官方源 latest）；dsh-im 轴不动（4.21.1）。

## v0.2.0 — 2026-09-30

主题：**更新系统升 `dsh-plugin-update@0.2.0` + 发布侧自动跟随**（#99）——用户装到/更新到的插件一定带最新更新系统；另含 presence 动效开关搬家（#98）。

改动：

- 更新包 pin `0.1.1 → 0.2.0`（exact，官方源）：包自己按包名解析目标包并反推使用范围，`installation-changed` 假阳性与 `unknown-profile` 根因由包原生接管。
- 解耦：删除自持的 `src/host/update-reader.ts`（194 行）与 `src/host/update-paths.ts`（92 行）；宿主侧只传 `homeDir` 取值，不再传 `runningVersion` / `profileDir` / `readInstalled`；客户端电话名与轮询间隔不再手抄，改为构建期从已安装包派生（`scripts/gen-update-constants.mjs`，双侧交叉核对，不一致构建直接红）。
- 发布侧三闸门：`npm run build` 前置派生比对、`npm run check:update-pkg` 比对官方源 latest、`wizard-release.sh` 阶段 1 内置（落后即 ✗）；升级动作用 `npm run sync:update-pkg`（装 latest + 重生成常量）。
- presence（#98）：动效开关从右下角悬浮胶囊搬进左栏筛选条（收起钮左侧 14×14 绿点）；偏好经 `meta.motion.set` 落盘、读走既有 `meta.get` 快照；条带缺席 fail-closed 不画。

验证与影响：

- `npm run check` 全链通过；`update-host` 14 pass / `update-center` 18 pass（含零解析类 override 真布局夹具）；`sync-update-pkg` 确认 pin = 官方源 latest = 0.2.0。
- 真机验收与 0.1.18 发布（浏览器授权）见发布记录；`gh` token 失效期间 Release 需补建。

## v0.1.17 — 2026-09-17

主题：**更新中心「装不了」不再无声无息**（#96）——安装失败后既不静默翻回"发现新版本"，也不再把人困在没有出口的状态里。

改动：

- `src/features/update-center/phone.ts`：`blockedTokenOf` 在**成功信封**里补兜底——任务已死（`failed` / `interrupted`）但 `blockedReason` 为空时，用 `job.message` 作原因代号扶正为 token（`failed→install-failed`、`interrupted→recovery-required`，文案沿用 `reasons.ts`）。原先这种情况快照"看起来可装"，状态机会悄悄画回"发现新版本"。
- `src/features/update-center/dialog.ts`：新增 `wantsInstallRetry`，`install-failed` / `recovery-required` 等阻塞态给「重试安装 + 稍后」而不是只有「重新检查」（失败任务不清除旧 job，只给检查会把用户困在"装不了"里）。
- `tools/verify/features/update-center.ts`：补 39 行断言覆盖上述两条。

验证与影响：

- `npm run check` 全链通过；无契约通道改动、无共享层改动。

## v0.1.16 — 2026-09-17

主题：**dsh-im 兼容声明 4.17.1 → 4.21.1**（#95）——面板胶囊/悬停/README 同步，上游载体规则复核无变化。

提炼：

- `package.json.dshImCompat.verified` 4.17.1 → 4.21.1（`range` 语义不变：≥4.17.1 走 `/api` 新载体、≤4.17.0 自动回退旧路由）。
- `README.md` / `docs/README.en.md` 兼容表同步（新增 `0.1.16+ → 4.21.1（已验证）` 行）；悬停文案由构建注入跟随，「4.17.1+ 走 `/api` 新载体」为历史事实陈述、保留。

验证与影响：

- `npm run check` 全链通过；上游 4.21.1 载体规则与 4.17.1 一致（`dsh-im<channel>` + `{ method, payload }`）；无契约通道改动、无共享层改动。

## v0.1.15 — 2026-09-12

主题：**真机复验靶子（三）**——与 0.1.14 无功能差异，只为让「面板里点安装」这一步有新版可装。

提炼：

- package.json / package-lock.json 0.1.14 → 0.1.15；**无功能性代码变更**。
- 用途：0.1.14（弹窗间距修复版）已装进 web profile；本版作为它「检查更新 → 一键安装」的目标版本，供 owner 亲眼确认安装链路。

验证与影响：

- `npm run check` 全链通过；无契约通道改动、无共享层改动。

## v0.1.14 — 2026-09-12

主题：**弹窗底部按钮间距**——owner 反馈：两个按钮贴得太近。

改动：

- `.update-center-dialog-foot` 补 `gap: 10px` 与 `align-items: center`（原实现只有 `justify-content: flex-end`，两个按钮直接相邻）。
- 弹窗底部的次要按钮（`update-center-link`）水平内边距 8px → 10px，与主按钮同高对齐。

验证与影响：

- `npm run check` 全链通过；无契约通道改动、无共享层改动。

## v0.1.13 — 2026-09-12

主题：**真机复验靶子（二）**——与 0.1.12 无功能差异，只为让「面板里点安装」这一步有新版可装。

提炼：

- package.json / package-lock.json 0.1.12 → 0.1.13；**无功能性代码变更**。
- 用途：0.1.12（外观修正版）已用命令行装进 web profile；本版作为它「检查更新 → 一键安装」的目标版本。

验证与影响：

- `npm run check` 全链通过。
- 无新增契约通道、无共享层改动。

## v0.1.12 — 2026-09-12

主题：**更新中心外观收拾**——把上一版看起来"丑"的地方按原型 v3（A 版）改掉。

改动：

- **配平**：动作行改成「左状态 · 右动作」，右侧不再空掉一半（上一版按钮在左、文字不右对齐，整行重心偏左、尾部空旷）。
- **成块**：动作行与「自动检查更新」行合成**一个块**，轻分隔替代原先那根硬线——不再是夹在工具栏与分隔线之间的孤儿行。
- **文案层级**：主状态与元信息用中点 `·` 分层、元信息更淡更小；状态句里去掉与顶部版本胶囊重复的版本号。
- **修两个文案 bug**：`下次检查` 剩余不足 30 秒显示「马上」（旧实现把它四舍五入成「0 分钟后」，而宿主首查排在启动后 60 秒，刷新页面常撞上）；`最近检查` 只在本会话真的查过时才显示（刷新后不再与「已是最新」并列成自相矛盾的一句）。
- **配色**：自动检查开关改为**品牌蓝**，与主按钮同源，绿色不再在紫/琥珀三色同屏里最跳。

验证与影响：

- `npm run check` 全链通过；新增 `nextCheckText` 回归断言（锁死「0 分钟后」不再出现）。
- 无新增契约通道、无共享层改动。

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
