## 状态
新增 bug（2026-10-25 由 /wayfinder 建单）。**triage 完成（2026-10-25，AI 诊断；诊断 ≠ 实施）**：无实施痕迹；四项现象均以代码 + 真机家表复核成立；维护者已拍板 Q1–Q4（见文末「拍板结论」）；已写 Agent Brief（见评论）并转 `ready-for-agent`。**未动业务代码。**四项现象来自维护者真机反馈（图1 悬浮卡、图2 插件助理面板）；本票只做 intake 与初步定位，未改代码。

## 维护者原话（原话照抄）
实际（现象；影响范围）：如图1左侧工作区的HOME头像并不是当前该HOEM的头像，第二HOME这一栏也就是第一行和下面有些像没有UI体现其是HOME。如图2该工作区有助理 调色板，在左侧工作区没有显示。第四 显示的微信机器人这种无助理但是游离的（一般是通过dsh-im绑定工作区的）显示的居然像一个助理。
期望（预期；与实际差异）：需要显示正确的HOME头像。需要体现HOME和其他行的区别代表是HOME。需要显示调色板助理，但是提示未绑定。微信机器人这种需要想一种办法让用户知道这个是无助理的机器人。
复现步骤（前置条件和场景 + 编号步骤；偶发写频率）：必现
环境信息（OS 版本 + 软件版本 + 运行环境）：当前电脑环境，你自己查询任何你要的信息。

## 背景
左栏工作区行的「IM 徽标 + 悬停悬浮卡」由 left-badges feature 渲染；同一插件的助理面板（图2）自 2026-10-15～10-23 已按「家＝房子图标/沉稳色板、助理＝机器人图标/暖亮色板」重建身份（#135/#136/#148/#150/#128/#152），但左栏悬浮卡仍沿用旧头像规则；且悬浮卡可见性完全由「该工作区有没有已绑定 bot」驱动（未绑定助理没有 bot 行），造成信息错位与遗漏。

## 现象（四项）
1. **家头像不符**：图1 悬浮卡顶栏为「DO」字牌 + 工作区名 dsh-opencode-palette。当前家（homes.yaml 9875fa9d-caa8-4e99-9395-a27a4e699789，path D:\dsh-plugin\dsh-opencode-palette，avatar:null）在面板里的头像应是「房子图标 + 家色板」；悬浮卡显示的却是按家 id 派生的首字「DO」，与面板不一致。
2. **HOME 无区分**：悬浮卡第一行（头像＋名字）与下面助理行（渠道 logo＋助理脸＋名＋右绿点）观感接近，没有任何 HOME/家标识、图标或分隔；用户无法一眼看出第一行是「这个工作区的家」而不是又一位助理。
3. **未绑定助理不可见**：图2 面板显示该工作区有 2 位助理，其中「调色板🎨」未绑定/待接入；图1 左栏悬浮卡完全没有这条助理，左栏该工作区行也无任何未绑定提示。
4. **无助理的游离机器人显示成助理**：图1 第二行「微信机器人」（微信渠道 logo + 「微」字牌 + 绿点）。数据上它不是本工作区家的助理——助理 a1552b7e-58e4-4afa-b6f2-b1c17dcfc622 的 homeId=f58f1481-f539-4a0b-8f2c-e38b808e3fff（默认工作区），而 bot wx_d3c34f555e4f2542fd2db9c7 的 workspace 是 dsh-opencode-palette；悬浮卡却把它当成本工作区助理显示，观感与真实助理行无异。

## 期望
1. 家头像口径统一：悬浮卡顶栏与面板家行使用同一套「家身份」渲染（有图用图；无图＝房子图标 + 家色板），不再用首字/旧色板近似；显示的必须是当前这个家自己的头像。
2. HOME 可辨认：第一行要有明确的家语义（如房子图标 /「HOME」或「家」标记 / 与助理行不同色的底或分隔），让人知道这是工作区的家。
3. 未绑定助理在左栏可见并标注：例如悬浮卡家区内列出未绑定助理（灰化/虚线 +「未绑定」或「待接入」），或至少给徽标/行补可发现的未绑定提示；不能因为没有 bot 就整条助理消失。
4. 区分「无助理的机器人」：机器人没有匹配到本家助理（无助理 / 助理属于别的家）时，行上要有独立标识（如「机器人（无助理）」/ 游离 / 未归属徽标、不同脸规），不要用助理名与助理脸冒充助理。

## 复现
必现。
1. desktop profile 挂 dsh-im-companion（junction），打开 DSH Web（http://127.0.0.1:56532）。
2. 左栏悬停工作区 dsh-opencode-palette 行（组行 DOM：div[data-row-key="workspace:<workspaceId>"][role="treeitem"][aria-expanded]）。
3. 看图1 悬浮卡：顶栏家头像为「DO」首字；下方只有 小洋、微信机器人 两行。
4. 对照图2 插件面板：同一工作区有「调色板」（未绑定）与小洋（已绑）；对比两处的头像与助理集合。

## 环境信息
- OS：Windows 11 家庭版 中文版 10.0.26200（build 26200）
- DSH：0.2.1-rc.2（dsh --version）；Web GUI http://127.0.0.1:56532
- 插件：dsh-im-companion 0.2.25（desktop profile，junction 开发态；lib/client.js 1150172 B，mtime 2026-10-24 19:47:20）
- 依赖：@xmanrui/dsh-im 5.1.0、dsh-opencode-palette 2.1.10、dsh-plugin-update 0.18.38、dsh-vision-router 3.0.4
- 复现数据（C:\Users\辰辰洋洋\.dsh\integrations\dsh-im-companion\homes.yaml）：
  - home 9875fa9d-caa8-4e99-9395-a27a4e699789；path D:\dsh-plugin\dsh-opencode-palette；name dsh-opencode-palette；avatar null
  - 助理 调色板🎨 c2c0865a-97f0-471b-b57b-bfcc1c960ad1：homeId 9875fa9d；status unbound；channel weixin；botId null
  - 助理 小洋 ec2d1b0e-ed2e-406f-9358-c2e35ec9de37：homeId 9875fa9d；status bound；channel feishu；botId bot_253f13b2887d4c21a3a44a51befcee80
  - 助理 微信机器人 a1552b7e-58e4-4afa-b6f2-b1c17dcfc622：homeId f58f1481-f539-4a0b-8f2c-e38b808e3fff（默认工作区）；status bound；channel weixin；botId wx_d3c34f555e4f2542fd2db9c7；nameSource bot
  - 对应 bot 的 workspace = D:\dsh-plugin\dsh-opencode-palette（机器人绑在本工作区，助理却挂在默认工作区）

## 初步定位（代码事实，未改码）
- **悬浮卡是「bot 驱动」的**：src/features/left-badges/hover-card.ts:28-33 在 badgeForWorkspace(...).kind==='unbound' 或无 bound bot 时 return null；src/features/left-badges/view.ts:106-110 对未绑定行直接移除 data-lb-kind/data-lb-label/title ⇒ 未绑定助理（无 bot 行）在左栏没有任何呈现路径（现象3）。
- **家头像走旧口径**：hover-card.ts:37 header face=homeFace?.desc ?? initialsOf(agent)；homeFace 来自 assistant-face.ts 的 homeFaceFor()，用 faceStyle(home.id,home.avatar)+initialsOf(agentName)。而面板家行已改用 kind 口径（src/client/components/home-identity.ts:65-100 avatarStyleFor/avatarIconFor；home-avatar-view.ts:50-62 paintAvatarFace；home-rows.ts:173 avatarEl(...,{kind:'home'})）⇒ 悬浮卡显示首字「DO」、缺家图标/家色板（现象1；head 无 HOME 语义，现象2 的一部分）。#145 当初实现的正是旧口径 homeFaceFor，属前置漂移。
- **助理行脸/名同样旧规则**：assistant-face.ts faceFor 返回助理 name/avatar；卡行 label=(hit&&hit.name)||botDisplayLabel（hover-card.ts:39-49），不区分「本家助理 / 无助理」⇒ 现象4 的呈现面。
- **匹配不校验归属**：assistant-face.ts matchAssistant() 先按 bot.botId 命中（渠道+botId 优先→botId 兜底），**不校验 a.homeId 与当前工作区/家是否对应**，再回退「同路家首助理」⇒ 微信机器人（助理 homeId=默认工作区）被当作 dsh-opencode-palette 的助理（现象4 根因候选）。
- **门禁只钉旧口径**：tools/verify/features/left-badges.ts:520 断言 face.faceStyle(id,av)===identity.avatarStyle(id,av)（旧 avatarStyle），不含 kind/图标/ASST_PRESETS ⇒ 面板换身份规则后的漂移不会被 verify 抓到。
- 现象3 是结构性缺口：徽标/悬浮卡只消费 bots；未绑定助理不在 bots 流里，需要单独数据来源与 UI 载体；现象1/2/4 属渲染与匹配规则问题。

## 查历史（关键词：HOME 头像 / 悬浮卡 / 未绑定 助理 / 无助理 机器人 / 游离；open+closed，标题前 20 条）
结论：**未命中同题票，新增**。
- 相关已关：#145（悬浮卡顶栏工作区头像＋四段行，2026-10-17 旧口径；本票现象1 是其后面板身份改版造成的视觉漂移）；#154（组行解析改 workspaceId，0.2.23 复验通过；本票复现路径同款）；#138（未绑定助理不编造渠道，面板显示「待接入」；本票现象3 要求左栏也体现未绑定）；#147（未绑定红 pill 两档/渠道菜单）；#135/#136/#148/#150（面板 L1 家行/助理行/头像身份规则来源）；#159（左栏筛选条宽度与分段悬停，与本题无关）；#31/#33（悬浮卡多 bot 标识/呼吸灯）。
- Open 侧核对 #157（删家后家以全新身份回来）、#168（规格）、#183（搜索态筛选）、#184（i18n）、#185/#186/#187/#188/#189（发送侧/文档/杂项）均非同题。

## 已查阅笔记与资料
- docs/research/排查-左栏筛选条宽度露底与分段悬停缺失.md（untracked）：只覆盖 #159（条带宽度/悬停），不适用于本问题；仓内未见 HOME 头像/未绑定助理/游离机器人的既有研究笔记。
- **triage 复用（2026-10-25）**：`docs/research/排查-上游工作区归属模型与解绑语义.md`（untracked）——一句话结论：bot→workspace 指针唯一且对外恒非空（`workspaces.json`），上游不存在「无工作区」状态 ⇒ 本票「游离机器人」属插件侧 `assistant.homeId` 与 `bot.workspace` 不一致，不是上游指针态。该笔记能解释现象4 的归属语义，但 HOME 悬浮卡/未绑定助理呈现无既有笔记；本票剩余待定项是产品拍板而非未知事实，故 triage 不另立 /research 笔记（`docs/research/INDEX.md` 不变）。若实施阶段发现需补研究，再单独立笔记并回填路径。

## 解读假设（若与报告人不符请纠正）
1. 「HOME头像」＝图1 悬浮卡顶栏的家头像（左侧被裁的左栏里没有其他家头像 UI）；2. 「第一行」＝悬浮卡顶栏（家行），与下面助理行对比；3. 「需要显示调色板助理，但是提示未绑定」＝在左栏徽标或悬浮卡里可见并标注未绑定。

## 处理建议（triage 用）
- 现象1/2 可合为一张「悬浮卡家行身份与 HOME 标识」实施票（渲染规则统一＋视觉决策）；
- 现象3 需要新增数据来源与 UI 载体（未绑定助理可见化），单独一张；
- 现象4 先定判据（assistant.homeId 与 bot.workspace 对应的家不一致⇒游离；无匹配⇒无助理）与标识文案，再实施；
- 门禁把 parity 从旧 avatarStyle 改到 kind 口径，防同类漂移再发生。

## 进度
- 2026-10-25：/wayfinder intake，四字段完整；完成代码/数据取证与历史检索，建单待 triage。未改代码。
- 建单方式：deck_issue_create 因后端 repo.refId missing（deck preflight 超时）不可用，改用 gh CLI 建单并加原生标签 bug + needs-triage。
- 2026-10-25：triage 诊断完成（AI）——无实施痕迹（HEAD 893917c；最后触碰 `src/features/left-badges/` 的提交 0705821 早于本票；无 190 分支/提交/未提交改动）；四项现象复核成立；无既有实现、无 `.out-of-scope/` 拒绝记录；复用笔记 1 篇（见上）；Q1–Q4 待维护者拍板；标签转 `needs-info`；未动代码。
- 2026-10-25：维护者拍板 Q1=A（单票）/ Q2=A 轻量版（面板家身份 + 轻量分隔线，不加文字标签）/ Q3=B（无 bot 也出卡列未绑定）/ Q4=A（两档游离标识）；已贴 Agent Brief，标签 `needs-info` → `ready-for-agent`；未动代码。


## triage 诊断（2026-10-25，AI；诊断 ≠ 实施）

**结论：无实施痕迹；四项现象全部复核成立；维护者已拍板 Q1–Q4（见文末「拍板结论」），当前状态 `ready-for-agent`（Agent Brief 已贴评论），不动代码。**

**已实现核对（无实施痕迹）**
- HEAD `893917c`（master）；最后一次触碰 `src/features/left-badges/` 的提交是 `0705821`（2026-10-23 fix #154），早于本票；`git log --all --grep=190` 无命中、无 190 分支、相关文件 `git status --porcelain` 为空；工作区未提交改动属 #183/#184 等其它票，不触及本票。
- 结论：不存在可收口的「已实现」；四项现象按当前代码 + 真机数据均仍成立。

**复核要点（代码 + 真机数据）**
- 现象1：`hover-card.ts:37` 顶栏脸走旧 `homeFaceFor`（`faceStyle(home.id, avatar)` + `initialsOf(agentName)`）⇒「DO」；面板 `home-rows.ts:173` 用 `kind:'home'` → `paintAvatarFace` 房子图标 + 家色板。
- 现象2：`styles.ts` 卡头仅 flex+gap，无 HOME 标记/分隔线。
- 现象3：`hover-card.ts:28-33` unbound / 无 bound bot 直接不画卡；`view.ts:104-115` 对未绑定行移除 data-lb-* ⇒ 左栏无呈现路径。但 `assistant-face.ts:112-147` 的 `mountAssistantFaces` 已从 `home.list` 拿到含未绑定的 assistants 列表（只是没交给卡片）⇒ 不是「需要新数据来源」，是「数据在手里但没接出来」（对建单时初步定位的修正）。
- 现象4：`assistant-face.ts:52-63` 的 `matchAssistant` 按 botId 命中时不校验 `a.homeId`；真机 `homes.yaml` 里微信机器人助理 `a1552b7e.homeId=f58f1481`（默认工作区），其 bot `wx_d3c34f…` 的 `dsh-weixin/workspaces.json` 指针却是 `D:\dsh-plugin\dsh-opencode-palette` ⇒ 数据错配真实存在，卡片把它当本家助理行的根因成立。

**参考/门禁提醒（实施必读）**
- 300 行红线：`hover-card.ts` 已 289 行、`view.ts` 273 行 ⇒ 新增逻辑必须新模块，不能原地长。
- feature 禁引 A1 私有（`src/client/components/home-identity.ts` / `home-avatar-view.ts` / `home-icons.ts`）；共享层 `src/client/icons.ts` 只准加导出。
- 门禁只钉旧口径：`tools/verify/features/left-badges.ts:518-528` parity 仍是旧 `avatarStyle`，改身份规则必须同步升级 verify，否则同类漂移抓不到。
- 提审两闸门：原型 + 真机验收都要维护者点头；i18n #184 进行中，新增中文文案暂记债。
- 左栏筛选「有助理/无助理」现按「已绑定 bot 名」计（`left-filter/model.ts:13、:84`），本票建议不动（见 Q3 备注）。

**标签动作**：2026-10-25 维护者拍板后，`needs-info` → `ready-for-agent`；Q1=A 不拆票，#190 即实施票，Agent Brief 见评论。

## 待拍板记录（❓ Q1–Q4；**已于 2026-10-25 拍板，见文末「拍板结论」**）

❓ **Q1. 分流：四项是「一张实施票」还是拆票？**
- A. 一张票一次做完（同属 left-badges，一个 PR/一次真机验收）
- B. 拆两张：①「悬浮卡家身份 + HOME 标识」（现象1/2 + verify parity 升级）②「左栏助理可见性与归属口径」（现象3/4，共用 assistants 数据管道）
- C. 拆三张（现象1/2、现象3、现象4 各自一张）
➡️ 推荐 **B**：现象1/2 是同一渲染口径，现象3/4 共用「把 `home.list` 的 assistants 接进卡片 + 校验归属」的同一段数据管道；拆两张各 ≤300 行可控，也不用一次真机验收盯四个点。

❓ **Q2. HOME 标识用哪种视觉？**
- A. 复用面板家身份（房子图标 + 家色板）＋顶栏显式「家」小标签＋家区与助理行之间加分隔线
- B. 只把顶栏头像换成房子图标/家色板，不加文字与分隔（靠脸区分）
- C. 顶栏整体换底色块 +「HOME」文字，不加图标
➡️ 推荐 **A**：维护者原话要求「体现出 HOME 和其他行的区别代表是 HOME」；B 在 16px 头像上不够显眼；C 偏离面板已定的身份语言（房子图标是面板家的既有符号）。

❓ **Q3. 未绑定助理放哪、卡还出不出？**
- A. 只在「该工作区已有绑定 bot（卡本来会出现）」时，卡内家区列出未绑定助理（灰化/虚线 +「未绑定」）
- B. 同 A，且无任何绑定 bot 的家悬停也出卡（卡里只有「家 + 未绑定助理」；行徽标「未绑定」不变）
- C. 卡内不列，只在左栏行徽标补「N 未绑定」提示
➡️ 推荐 **B**：才能真正满足「不能因为没有 bot 就整条助理消失」；`home.list` 的数据已到手，成本主要在 UI；徽标「未绑定」仍按 bot 绑定口径，不混用。

❓ **Q4. 游离机器人如何识别与标注？**
- A. 两档：① botId 完全匹配不到助理 ⇒「机器人（无助理）」；② 匹配到助理但 `assistant.homeId ≠ 本工作区的家` ⇒「机器人（未归属）」；两档都用机器人字形/灰化，不用助理名/助理脸
- B. 不区分两档，统一一个「游离机器人」徽标
- C. 左栏不标，改为在面板里提示重绑
➡️ 推荐 **A**：两种数据情形不同（无助理 vs 助理在别家），区分后未来根治（重绑/对账）也有据可依；C 会让左栏继续把机器人当助理，不满足期望4。

（备注：若 Q3 选 B，左栏筛选「有助理/无助理」会出现「筛选说无助理、卡里却有未绑定助理」的词义缝隙；本票建议不改筛选口径、另票统一，若你要在本票一并改，请在回复里说明。）

## 拍板结论（2026-10-25，维护者）

- **Q1 = A**：不拆票，一张实施票覆盖四项（#190 即实施票）。
- **Q2 = A 轻量版**：家行按面板家身份（房子图标 + 家色板）；HOME 与助理行之间只需**轻量分隔线**，不额外加文字标签。
- **Q3 = B**：无任何绑定 bot 的家悬停也出卡（卡内只有「家 + 未绑定助理」）；行徽标「未绑定」与筛选口径不变。
- **Q4 = A**：两档——botId 无匹配＝「机器人（无助理）」；匹配到助理但 `assistant.homeId != 本家` ＝「机器人（未归属）」；均用机器人字形/灰化，不用助理名/脸。
- 备注：Q3 选 B 后的「有助理/无助理」筛选词义缝隙**本票不改**，另票统一。
- 状态：Agent Brief 已贴评论并转 `ready-for-agent`；先过原型闸门再实施。
## 复检（2026-10-25 02:19，AI；/triage 重入）

- **无实施痕迹**：HEAD 仍 `893917c`（上次 triage 后无新提交）；无 190 分支/提交；`src/features/left-badges/` 源文件最后修改时间为 2026-10-18～10-23（均早于建票），工作区未提交改动均属其它票（left-filter / i18n 等），未触碰 left-badges。
- 票面无变化：`bug` + `ready-for-agent`；评论仍为 Triage Notes 与 Agent Brief 各 1 条；无新增评论、无待回复问题。
- **结论**：无实施、无新增信息、无待拍板问题 ⇒ 保持 `ready-for-agent`（实施票），不改标签、不动代码；按 Agent Brief 先过原型闸门再实施。

## 实施进度（2026-10-25 03:15，AI；已实现，待真机验收）

- **原型闸门：已通过**（维护者 2026-10-25 回复「q1 通过，q2 助理还有配置头像的如果有头像应该展示头像」）。
- **实现完成，未提交**（HEAD 仍 `893917c`，交付以工作区为准）：
  - 新增 `src/features/left-badges/panel-identity.ts`（65 行：面板身份镜像，房子/机器人字形逐字镜像）、`card-model.ts`（168 行：实体三态 + 游离两档归属分类）、`card-render.ts`（116 行：家行 / 分隔线 / 助理行 / 机器人行 / 脚注渲染）。
  - 改 `assistant-face.ts`（128 行：kind 归属色板/图标 + snapshot 直通）、`hover-card.ts`（189 行：只留生命周期/定位/事件）、`view.ts`（268 行：snapshot → buildCardData 接线）、`styles.ts`（57 行：分隔线/虚线未绑定/机器人字形/tag）。
  - verify `tools/verify/features/left-badges.ts`（701 行）：parity 升级到 kind 口径，新增实体三态/两档归属/虚拟化/结构断言，29 测全过。
- **门禁**：`npm run check` 全绿（build + typecheck + verify + 300 行 guard）；feature 文件均 ≤300 行；无 A1 私有 import、无新增轮询/数据源（复用既有 home.list / avatar.get 数据）。
- **验收环境**：desktop profile 原为真安装 0.2.25 目录（非 junction，client hash 与仓不一致）→ 已按 AGENTS.md 配方切回 **Junction → 本仓**（原目录备份在 `D:\Temp\190-accept-2026-10-25\dsh-im-companion-real-0.2.25`）；当前 profile 的 `lib/client.js` sha256 = `D156C0E5…`（1,160,064 B）与仓一致。
- **待真机验收**（Ctrl+F5 后核对）：①家行房子图标 + 家色板（有上传图则显示图）；②家与助理行之间轻量分隔线；③「调色板🎨」未绑定灰化虚线 + 「未绑定」；④「微信机器人」显示「未归属」机器人行；⑤无绑定 bot 的家也出卡。
- **i18n 债（#184）**：新增中文 UI 文案「未绑定 / 未归属 / 无助理」三条，待 #184 统一，不新增 i18n 基础设施。
- 未提交代码；验收点头后提交（工作区可能被其它会话继续写）。

## 验收检查清单（真机）

1. 家行头像：无上传图 = 房子图标 + 家色板；有上传图 = 图片。
2. 家行与助理行之间：只有一条轻量分隔线，无新增文字标签。
3. 已绑定助理：渠道 logo + 面板助理身份（有配置头像显示头像）+ 状态点。
4. 未绑定助理：灰化虚线 + 「未绑定」，无状态点。
5. 游离机器人：机器人字形 + 「未归属」或「无助理」，不用助理名/脸。
6. 行徽标「未绑定」与「有助理/无助理」筛选口径不变。
