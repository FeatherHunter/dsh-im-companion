# 助理人设 UI 交互现状补充盘点（T5 · #165 前置）

> 任务：wayfinder 地图 #160 / 票 #165「T5 · UI 交互与旧『性格/语气』退役规格（grilling）」的前置只读盘点。
> 日期：2026-10-22 · 性质：只读取证（不改 src/、不跑 build/verify）。
> 基线：当前工作树（脏：别的 session 有 #154/#158/#159 改动）；行数按 tools/guard/check-lines.ts:32-37 口径实测。
> 口径：T3 笔记 = docs/research/盘点-人设字段落点-账本RPC与创建链路.md（实测 277 行）。与 T3 笔记的关系：只补 UI 交互粒度，不重复账本/RPC。
> 标记：【源码确证】=读源码+行号；【实测】=node 跑 countLines；【推断】=推理未验证。

## 一句话结论

- 现有三处写助理的 UI 只认 {name?, avatar?} 两键（home-forms.ts:283-290、home-ops.ts:159-168），没有任何 description/persona 位；接入全链路在绑定成功后没有「补资料」步骤（connect-flow.ts:176-199），且家级接入根本没有助理身份可写。
- 「新建助理」「助理设置」都是锚定 popover（home-pop.ts），无 sheet/confirm sheet；校验只有「主按钮禁用 + data-tip」，写失败一律 toast。
- 全仓没有 textarea + maxlength + 字数计数器先例；唯一 textarea 是抽屉性格框（view.ts:153-157，无 maxlength），唯一 8000 上限是 actions.ts:23 的静默 slice。
- 简介/人设的展示候选有四处：asstRow 副标、家行下的助理气泡、L3 详情、抽屉；抽屉打开事件只带 key=工作区路径（config.ts:21-26、panel-body.ts:141-144），一家多助理定位不到行。
- verify 会被打红的是 home-steel 的「键集合=T3」（:744-784、:1927-1937）与 detail-drawer 的文案针脚/性格用例（:248、:441-466）；render-client 假宿主宽松展开，会给出字段「存住了」的假绿。

## 1. 接入流程（扫码 + 手动）【源码确证】

- 入口：L2/L3 助理卡「更换/绑定机器人」→ panel-body.ts:133-140 → ops.connect(homeId, anchor, assistantId) → home-ops.ts:293-298 openConnectFlow({name, workspace: home.path, assistantId, menuAtTop:true}, onDone=refresh→reloadHomes→after)；未绑定助理的「新机器人」也走同一入口（home-bind-forms.ts:56-57,67）。旧 A1 冻结面板 panel-actions.ts:94-101 的 connect 不带 assistantId（家级）。
- 扫码序列：openConnectFlow（connect-flow.ts:40-296）→ 守卫：无工作区 toast（first-view-copy.ts:91）、无 rpc toast 'host 桥不可用，无法发起接入'（:49-52）→ 渠道菜单（:57-69）→ 弹层标题「接入渠道」/副标「为『name』创建 <渠道> 机器人」（:74-75）→ qr-only 直接 provision.begin {locale:'zh-CN'}（:123），dual/manual 经 dual-mode-flow.ts:45-135 选路。
- 扫码渲染 connect-flow.ts:201-238：二维码 img alt=授权二维码、倒计时「二维码有效时间…」、三步 ol、按钮「在 X 中打开」「换一个二维码」「取消」；轮询 3s 认领新机器人（:154-174）。
- 成功：modal.close() 后 commitBinding(...)（connect-flow.ts:176-199；异常 toast '绑定工作区失败：'+msg）。
- 落地 binding-commit.ts:36-104：工作区空 → toast '机器人已就绪但未绑定工作区：…'（:37-42）；bot.workspace.set 5×2s 重试（:49-69）；有 assistantId 才 assistant.bind {id,channel,botId,botName,homeText:''}（:72-86）；成功 toast '已接入并绑定工作区'（:101）→ onDone(true) → 面板刷新，用户回到原层，新机器人已挂在助理卡上。
- 手动：manual-form.ts:31-182，字段由 MANUAL_FIELDS 生成（dual-mode-capabilities.ts:54-77），bot.bind-credentials 提交（:129），认领不到新机器人 → toast '已接入但未识别新机器人：…'（:145），成功走同一 commitBinding（connect-flow.ts:269-283）。
- 现状缺口：整条链路没有「简介/人物设定」步骤；落盘的只有助理行绑定关系与名字。家级接入（无 assistantId）没有助理身份，没法在该流程里写人设。
- 加一步的候选插入点（推断）：a) connect-flow.ts:176-199 succeed 之后（modal 已关，语义=绑定后补资料，需新开弹层）；b) binding-commit.ts:100-102 成功回调（要改所有调用方签名，影响面最大）；c) home-ops.ts:293-298 onDone（最外、完全独立，推荐）；d) manual 成功分支 connect-flow.ts:269-283（同 a）。
- 影响面：若新步骤只写两字段，assistant.update 补两键即可，不必新端点；但 connect-flow.ts 296 行只剩 4 行余量，modal 生命周期/取消语义都在里面 ⇒ 新步骤必须独立文件（先例 dual-mode-flow.ts / manual-form.ts）。「新建助理」也要两字段则走 assistant.create/createUnbound 载荷（home-ops.ts:81 附近）+ 拆 home-forms.ts。

## 2. 「新建助理」弹窗 newAsstPop（home-forms.ts:129-175）

- 字段/顺序：属于哪个家（锁家时 .hu-locked 归属告知 :142-145；否则 optList :146-148）→ 绑定机器人（optList，首项「以后再绑」:149-154）→ 名字 input（placeholder '留空用默认名'，aria-label '助理名字'）:140,155 → hint「名字可以留空：…」:156。
- 默认值与参数：homeId=当前家或第一家 :134；botId=第一个空闲机器人或空串 :137；弹层 width 340、above :171。
- 保存：closeHomePop(true) 后分叉——无机器人 createUnbound(homeId,userName)，有机器人 createAssistant(homeId,channel,botId,userName)（:158-169）；成功 toast 在 home-ops（'已建好助理，还没有绑机器人' home-ops.ts:173 / '建助理并绑定成功' :139）。
- 校验：只有 homeId 非空（:159；为空时主按钮已禁用+data-tip '还没有家：先回上一层建一个家' :173）；名字可选、无长度校验；异步失败只有 toast（.then 无 catch，:163,168）。
- 取消：footBtns「取消」→ closeHomePop（home-forms.ts:78-79）；Esc/点遮罩收层由 home-pop.ts 统一。
- 行数余量：299/300，新增一块（textarea+计数器）必须拆文件（T3 建议 home-asst-form.ts）。控件层没有 textarea 样式：.hu-fld 只覆盖 input/select（home-ui-styles.ts:244）。

## 3. 「助理设置」弹窗 renameAsstPop（home-forms.ts:263-297）

- 字段/按钮顺序：名字 input（placeholder=当前展示名 asstName，aria-label '助理名字'）:267 → 「恢复默认名（跟随机器人/家）」.hu-plink :271-275 → 头像 avatarRow（10 格，图片点了就落）:270,294 → 清除图（有图时）→「删除助理（不断开机器人连接）」两步确认 :276-282 → 取消/保存 :295。
- patch 组装：只 {name?, avatar?}，与 cur/原头像对比后才进 patch（:283-290）；无改动直接关并 debug 记 noop（:288）。
- 错误提示：无行内错误位；写失败由 home-ops.updateAssistant toast '助理更新失败：'+msg（home-ops.ts:165）。因 closeHomePop(true) 在 await 之前（:287），失败时表单已关、用户只能看 toast。
- 重复/并发：保存按钮不 disable、无 single-flight；关闭先于写盘，双击第二下落在已卸载 DOM（实际风险低）。恢复默认/删除同为「先关后写」（:272-282）。
- 文案先例：主按钮「保存」（footBtns(ok, undefined, '保存') :295）；「恢复默认名」是链接态按钮 .hu-plink。
- 行数余量：299/300。若在此加简介+人物设定两块（textarea+计数器），必须拆 home-asst-form.ts（T3 已建议）。

## 4. 家页助理卡 asstRow（home-rows.ts:218-245）

- DOM：div.hu-row[role=button, data-open='L3', data-id, aria-label='助理 <名>'，未绑定加 .off]（:235-238）→ avatarButton(圆头像) → span.hu-txt（renameField 行内改名节点 [b 名 + statusPillEl + onlineTagEl] :224-226，+ span.hu-sub[渠道强/待接入 + 工作区路径弱] :241）→ span.hu-acts2（「更换机器人」/「绑定机器人」textBtn + 铅笔 rename-a + 头像 avatar-a）:227-234。
- 文案/副标：asstSubMeta 走元信息原语，渠道强、路径弱，靠间距不靠分隔符（:215-216 注释）；截断由 .hu-sub 负责（nowrap+ellipsis，11.5px，margin-top 5px，home-ui-styles.ts:86）。行本身无悬停气泡；气泡只在家行下的助理 chip（home-row-strip.ts:96-98 → home-row-tip.ts:100-157，画「名+渠道+状态」）。
- 加一行简介的落点：a) .hu-sub 后再加一行 .hu-sub/.hu-names（样式现成 home-ui-styles.ts:87）；但 home-row-strip 收放档按「名字20 + 副标17+5 + 清单17+4」的行高算（home-ui-styles.ts:184 注释）⇒ 加行必须同步改条带预算；b) 塞进 asstSubMeta 副标（与渠道/路径抢宽，不推荐）；c) 放进悬停气泡第三行（home-row-tip.ts:116-123，推断）。行数 296，只有 4 行余量。
- 动作按钮不新增：简介/人设只读展示，编辑入口仍是设置弹层（owner 2026-10-17 口径：行上只有改名/头像/绑定）。

## 5. L3 助理详情页（home-detail.ts:73-118）

- 区块顺序：.hu-detail 卡 = dhead（头像+名+来源/id metaRow+在线）:83-88 → .hu-meta chips（家 chip、渠道 chip 或「尚未接入」、状态 pill）:89-92 → chainEl 命名链 :93 → botBlock 机器人块 :94 → 三组动作 :96-115（更换/绑定+详情；改名与头像+删除助理两步；换工作区+移除渠道）。
- 可插只读人设块：dhead 的 small 行加「简介」（:87），或在 chainEl/botBlock 之后、动作之前插一段（:94-96 之间）——.hu-detail 自带 gap:10px，追加块不破布局。
- 行数 118/300（余量 182）；chip/metaRow/hint 原语现成。详情页建议只读，避免与设置弹层形成双编辑入口。

## 6. 详情抽屉（src/features/detail-drawer/）

- 打开事件：OPEN_DRAWER_EVENT='dsh-im-companion:open-drawer'（src/client/data/config.ts:22），detail = OpenDrawerDetail {key}（:24-26）；绿框唯一 emit = panel-body.ts:44-52 emitDrawer(key)，调用点 :141-144 的 'detail-a'，key=home.path（工作区路径）——家级、不是助理 id，一家多助理定位不到行（T3 已记）。旧 A1 列表 agent-row.ts:144-146 也 emit（key=旧 AgentView.key）。
- 生命周期：drawer.ts:20-37 监听事件；openDrawer :42 起；showSheet :63-77，onClose 清订阅 :67-76；8s 等不到数据 toast '未找到该 Agent 的数据，可点列表右上刷新后重试' 并关（:99-106）；同构快照不重绘 :125-127；重绘保滚动 :130-139；订阅 :278-290。
- 区块顺序（view.ts:255-275）：head（名/详情/关闭）→ sum（模式下拉+状态）→ sumNote「沟通模式…不是角色性格」:269 → ctxSection :271 → personalitySection :272 → workspaceSection → routesSection（会话路由摘要）→ channelsSection（渠道管理）。
- personalitySection 现状（view.ts:149-176）：caption '性格/语气（一框写全渠道）' :151；textarea rows=4，value=draft??prefill，placeholder '比如：说话幽默，像朋友一样；群里严肃、私聊放飞等'，aria-label '性格语气'（:153-157，change 时 onDraftPersonality，无 maxlength/计数器）；按钮「应用」title '覆盖全部渠道引导语（字段与开关不动）'，首次点击变「确认覆盖各渠道引导语？」（dataset.armed）:159-169；尾注 '应用后覆盖各渠道现有引导语，新会话生效。' :174。
- ctxSection 现状（view.ts:90-122）：每渠道 caption '上下文（<渠道>）' :102；双开关 pillSwitch「群聊增强」「私聊增强」（title '…（只写本渠道，即时生效）'；读不到时 '本渠道真值尚未读到，禁用写'）:104-109；listRow「字段」= '、'.join 或 '未设置' :112；「引导语」note 全文（无省略号，verify :301-314 钉死）:114-115；空态「尚未接入渠道。」:95；尾注 '打开后 AI 能看到消息哪来的；字段与引导语请去 dsh-im 上游改（或用性格页覆盖）。' :118。
- 回调链：DrawerCallbacks（view.ts:26-38，含 onApplyPersonality/onDraftPersonality）；drawer.ts 实参 :152-275，onApplyPersonality→actions.applyPersonality :221-238（成功后 draftPers=null+paint :232-233），onDraftPersonality :236-237，draftPers 内存态 :150；关闭不保存草稿（关=丢）。
- 关闭/回写：head 关闭按钮→cbs.onClose→closeAll :273；sheet onClose :67-76；写回只经 actions（RPC）再 paint。无 confirm sheet，二次确认靠按钮改文案（view.ts:159-169；移除渠道同款 :234-244）。
- 行数：view 275（余量 25）、drawer 291（余量 9）、data 231（余量 69）、actions 75（余量 225）。退役 personalitySection（约 29 行）+两回调+draft 后：view≈247、drawer≈271；若人设只读区放进抽屉仍有余量。
- 跨 feature 跳转先例：【源码确证】没有。只有 window CustomEvent 事件通道：常量 config.ts:22/29/32/37 与 header-overlay.ts:16；派发 panel.ts:277-295、panel-body.ts:44-52、agent-row.ts:144-146；监听 drawer.ts:32、fleet-radar/view.ts:295、adopt/view.ts:116。slots 只用于挂载 UI（manifest.ts），没有 navigate/打开弹窗/切设置面板 API。features-contract.md:64 明确该通道不在 rpc/subscribe/meta/slots 白名单、记为已知债 ⇒ 「从抽屉跳家页并打开助理设置」没有现成先例，只能新增事件常量+新监听（added-only），且按契约 §9 要先记契约/评审。

## 7. verify 现状与影响面【源码确证】

- home-steel.ts:744-784（「全程只走 T3 模型，不另发明字段」）：H/A 夹具 :134-135 就是合法键集合，新增 description/persona ⇒ :755 / :770 / :777-778 必红；同口径还有 :422-423、:987-988、:1927-1937（搬家行仍是 T3 键集合）⇒ 加字段必须同改夹具。
- detail-drawer.ts:238-258：文案针脚数组 :248 含 '性格'、'新会话生效' ⇒ 删性格区必红；:253-257 钉两个 pillSwitch（ctx 区保留则不动）；:441-447 性格预填用例、:449-466 性格应用用例 ⇒ 退役时删。:301-314「弹窗内无省略号——引导语全文换行展示」是长文本只读展示的现成先例，可改成 persona 长文针脚。
- home-create-flow.ts:420-481（建助理点击级）：夹具走真 host-store + 真分发器（:221-232）；钉 assistant.create 载荷 :443-458、弹层收掉/落 L3 :458-463、宿主多一行 :466、不得 home.seed :470-472。新建助理加可选两字段（默认不填）预计不红；若接入流程插新步骤（弹层不直接收/不直达 L3）:458-463 必红；:559-583 候选集合断言对新增字段不敏感。
- render-client.ts:70-160 假宿主 vs 真宿主：assistant.create 行固定键 :87-91、assistant.update 只处理 name/avatar 且静默忽略未知键 :126-139、home.seed 用 {...a} 宽松展开 :100/:106 ⇒ 两字段在假宿主「看起来存住了」，真宿主 seedDocs 逐字段重建（src/host/home-store.ts:181-197，T3）会丢 ⇒ 用 render-client 验收是假绿。新增端点还必须加进 :252-257 白名单，否则回 CHANNEL_NOT_CONFIGURED。
- 一句话：T5 的 verify 改动面 = home-steel 键夹具 + detail-drawer 针脚/删用例 + 可能的 home-create-flow 流程断言；假宿主不会替你抓字段丢失（真宿主白名单 cleanAssistant 在 src/host/home-store-io.ts:135-167，T3）。

## 8. 行数红线现测（countLines 口径）【实测】

- 口径：tools/guard/check-lines.ts:32-37 = text.split(/\r?\n/)，末尾空行只去一个，含注释；LIMIT=300（:15），仅 lines > 300 判红（:44）。「余量」= 300 - 行数（加行数超过它即 301 红）。
- 贴边（余量 ≤5）：home-ops.ts 300（0）、panel-body.ts 300（0）、home-ui-styles.ts 300（0）、home-forms.ts 299（1）、connect-flow.ts 296（4）、home-rows.ts 296（4）、home-model.ts 295（5）。
- 较紧（6-25）：drawer.ts 291（9）、home-pop.ts 286（14）、view.ts 275（25）。
- 中等（26-100）：panel-actions.ts 263（37）、home-row-styles.ts 246（54）、data.ts 231（69）。
- 宽裕（>100）：home-detail.ts 118（182）、home-row-tip.ts 184（116）、panel-actions 之外的小文件：binding-commit.ts 104（196）、home-bind-forms.ts 109（191）、manual-form.ts 182（118）、dual-mode-flow.ts 135（165）、dual-mode-capabilities.ts 141（159）、home-row-edit.ts 58（242）、home-toast.ts 74（226）、home-create-act.ts 26（274）、config.ts 74（226）、actions.ts 75（225）。
- 与 T3 对比：T3 的十个数字（home-model 295 / home-forms 299 / home-ops 300 / home-rows 296 / panel-body 300 / home-detail 118 / view 275 / drawer 291 / data 231 / actions 75）与本表逐项 0 差 ⇒ 同口径且这些文件基线未变；T3 笔记自身实测 277 行（任务书写 222，属任务书笔误，不是盘点差值）。

## 9. 文案/控件惯例（供规格统一口径）【源码确证】

- 字段原语 field(label, control, tag='label'|'div')（home-forms.ts:38）；装按钮类控件必须传 'div'（真机 labeled-control 坑，:37 注释）。
- 主按钮 footBtns(onOk, disabledReason?, okLabel='创建')（home-forms.ts:77-86）：取消+主按钮；禁用时 data-tip 写原因、不静默灰（:81-84）。设置类 okLabel='保存'（:295），绑定类='绑定'。
- 行内提示 .hu-fhint（home-forms.ts:111,156；样式 home-ui-styles.ts:246）；.hu-fld 只覆盖 input/select（home-ui-styles.ts:244），textarea 无现成样式。
- placeholder=「默认值/留空含义」：'留空用默认名'（:140）、设置弹层 placeholder=当前展示名（:267）；aria-label 用中文名词：'助理名字'、'工作区路径'（view.ts:129）、'性格语气'（view.ts:156）。
- 错误位置：表单级=主按钮禁用+data-tip；输入级=行内 .dm-error（manual-form.ts:47,63-76）；写失败=toast 'xx失败：'+msg（home-ops.ts:165；binding-commit.ts:59,69）。绿框自绘锚定 toast（home-toast.ts:30-36,53-74），feature 用共享 toast（drawer.ts）。
- 二次确认：无 confirm sheet，统一「同一按钮改文案、再点一次」：删除助理 home-forms.ts:276-282 / home-detail.ts:106-111、应用性格 view.ts:159-169、移除渠道 view.ts:234-244。
- 无 maxlength/字数统计先例：src 全仓 grep 空；唯一 textarea=抽屉性格框（rows=4、无 maxlength、styles.ts:52 height:96px resize:none）；唯一 8000 上限是 actions.ts:23 的静默 slice(0, 8000)。persona 的 textarea+maxlength+计数器要新做，样式按 added-only 追加。

## 留给 grilling 的问题（T3 §6 未列或需修正）

1. 「简介」展示位优先级：asstRow 副标 / 悬停气泡 / L3 / 抽屉，谁是权威？加行会动 home-row-strip 的收放预算（home-ui-styles.ts:184），T3 §6⑤ 只问了「L3 要不要显示」。
2. 接入后「填人设」若只在「从助理发起」的接入出现，家级接入（panel-actions.ts:94-101 / 无 assistantId）永远看不到该步骤——入口不对称，T3 §6③ 未列。
3. 退役抽屉性格区后「改人设」归谁：抽屉只读展示、编辑留 home 设置弹层，还是新增事件常量做跳转？跨 feature 无现成先例，契约 §4:64 已把事件通道记为已知债。
4. persona 上限 8000 与上限常量单点：现有唯一上限是宿主侧静默 slice（actions.ts:23），客户端无校验/计数器先例——要不要统一「客户端计数器 + 客户端/宿主/verify 同一常量」？
5. 「新建助理」弹层是否也给两字段（T3 §6③ 只写接入时）？给的话 home-forms 299 行必须拆，home-create-flow 点击级用例要补「留空跳过」路径。
6. 空简介/空人设在 UI 的空态：隐藏、占位（'未填写简介'）还是回落副标？T3 §6② 只定了写盘 strip，没定读侧呈现。
