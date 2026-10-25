## T5 Resolution · 助理简介/人物设定 UI 与旧「性格/语气」退役（实施规格）

拍板依据：owner 2026-10-22 两轮 grilling 逐项拍板（Q1 A、Q2 与接入无关·创建时填+列表加入口、Q3 入口由 owner 反问后定、Q4 C、Q5 认可、Q6/Q9 授权按第一性原理自定、Q10 A、Q11 A、Q12 A、Q13 A、Q16 A）。本票只交规格，不写实现。

### 0. 一句话
新增两个字段 description（简介，≤200，只展示、不注入提示词）与 persona（人物设定，≤8000，由后续实现 effort 投递）；唯一编辑口＝助理列表行第 4 个图标打开的小弹窗；创建助理弹窗可同时填写（可跳过）；家页助理卡第三行显示简介（空则隐藏）；详情面板加只读人设块＋「编辑」跳转；旧「性格/语气」整块删除。

### 1. 术语与文案（产品面，精确文本）
- 产品用词：一律「详情面板」（不再用「抽屉」）；本票不改代码标识符（detail-drawer、类前缀、verify 文件名重命名另票）。
- 字段用词：简介＝description；人物设定＝persona；旧「性格/语气」从文案中消失。
- 列表行图标 title 与 aria-label：「编辑简介与人物设定」。
- 编辑弹窗标题「编辑简介与人物设定」；按钮「保存」「取消」；提交中按钮文案「保存中…」。
- 简介 label「简介」；placeholder「一句话介绍这个助理，会显示在助理卡上」；helper「显示在助理卡与详情面板上，不写入 AI 提示词。」；只读空态「未填写简介」。
- 人物设定 label「人物设定」；helper「作为身份提示注入该助理接管的 IM 会话；留空则这些会话不注入身份设定。」；计数「n/8000」常显；只读空态「未填写人物设定」。
- 保存成功 toast「已保存助理资料」；保存失败弹窗内红字＝宿主错误原文，不关弹窗、输入保留。
- 详情面板块标题「助理人设」；无匹配「未找到关联助理：该机器人的助理信息还没有同步到。」；复制按钮「复制」；复制成功 toast「人物设定已复制」；编辑按钮「编辑」。
- 跳转失败 toast「没有找到这个助理，可能刚被删除。」
- 硬规则：可见文案零中点分隔（owner 2026-10-17），分隔靠结构/间距/括号。

### 2. 字段与上限（单点真相）
新建共享模块 src/assistant-profile.ts（仓根共享层先例：src/workspace-default.ts、src/log-events.ts；client 与 host 共用）：
- ASSISTANT_DESC_MAX = 200；ASSISTANT_PERSONA_MAX = 8000。
- charCount(s)：Array.from(s).length（与 T4 的 8000 字符口径一致，代理对按 1 个字算）。
- trimProfileText(v)：非 string → ''；string → trim（只去首尾空白，保留内部换行）。
- profileError(description, persona)：超限返回中文错误（「简介最多 200 字」/「人物设定最多 8000 字」），否则 null。
客户端计数/禁用与服务端写校验必须调同一份常量与函数，禁止两处各写 200/8000。

### 3. 宿主侧改动（按 T3 盘点的 A1–A11 落）
1) src/host/home-store-io.ts（214 行）：AssistantRow 加 description、persona 两字段（类型 string）；cleanAssistant 白名单同步加两键：非 string → ''，trim；盘上超长原样保留（读不截断、不丢数据）。读回缺键 → ''。
2) src/host/home-store.ts（205 行）：createAssistantRow 接收两字段（缺省 ''）；seedDocs 两分支原样带过；S2 落点＝唯一写盘口（writeGuarded 序列化前）：字段 trim 后为空串则删除该键再落盘，其余键与键顺序不动 ⇒ 老账本读→写逐字节不变。
3) src/host/home-edit.ts（135 行）：updateAssistantRow 的「name/avatar 至少其一」闸放宽为「name/avatar/description/persona 至少其一」；新值写前 trim；createUnboundRow 接收两字段。
4) src/host/rpc.ts（246 行）：assistant.create / assistant.createUnbound / assistant.update 三处挑键白名单加 description、persona；写校验用 §2 的 profileError，超限按现有失败形状返回中文 message，禁止静默截断；空串照传（写口 strip）。
5) src/client/data/home-model.ts（295 行）：Assistant 接口加 description、persona（string）；加载归一化缺键补 ''。
6) src/client/data/home-edit.ts（104 行）：patch 类型加两键（optional）。
7) 账本 version 不 bump（读时固定回 2）；不做迁移写（S2 已消除整片 diff）。

### 4. RPC 契约（无新端点）
- assistant.create / assistant.createUnbound / assistant.update 的 payload 可选 description?: string、persona?: string；空串或省略＝未设置（落盘时键被剔除）。
- home.list 返回的 assistants 行新增两键（有值才出现，空＝缺键）；客户端读一律 (a.description ?? '')。
- 上限以 src/assistant-profile.ts 为准；服务端拒绝超限（不截断），客户端同步禁用保存。
- 不新增端点、不改 RPC 通道 ⇒ 契约 §4 通道白名单不需要为此改动；写入沿用 im-companion 渠道。

### 5. UI 落点

#### 5.1 创建助理弹窗（home-forms.ts 299 行）
- 把创建弹窗抽到新文件 src/client/components/home-asst-form.ts（与 5.2 编辑弹窗同文件），home-forms 只留导出与改名/头像弹窗。
- 字段顺序：属于哪个家 → 绑定机器人 → 名字 → 简介（单行 input，maxlength 200，不常显计数）→ 人物设定（textarea rows=6，maxlength 8000，常显 n/8000 计数右对齐）→ 原 hint。两条 helper 按 §1。
- 保存：createAssistant(homeId, channel, botId, name, { description, persona }) 或 createUnbound(homeId, name, { description, persona })；空串原样传（宿主 strip）；成功沿用现有 toast 与落点，不再追加弹层。
- 校验：沿用主按钮 disabled＋data-tip 机制；简介超限追加红字「简介最多 200 字」；保存中禁用按钮防重复提交。
- 弹窗宽度 340 → 380（为 textarea 留可读宽度；真机视觉验收时确认）。

#### 5.2 列表行第 4 图标 + 编辑弹窗（home-rows.ts 296 行）
- asstRow 的 acts 追加第 4 个按钮：iconBtn('profile-a', '编辑简介与人物设定', 'person')（复用现有 person 图标，不动 home-icons.ts 闭集）；title 与 aria-label 用 §1 文案；由 wireRow 统一派发，点击不进入详情页。
- 行动作分支过多，抽 src/client/components/home-row-asst.ts（asstRow 整段搬出并 export，home-rows 转 re-export），或等价拆分，保持单文件 ≤300。
- 新文件 home-asst-form.ts 导出 asstProfilePop(anchor, { view, ops, asstId, onDone })：
  - openHomePop({ width: 380, label: '编辑简介与人物设定', title: 人形图标 + '编辑简介与人物设定', body: [简介 field, 人物设定 field, 两条 helper, 错误行], foot: '保存' })。
  - 初值：a.description ?? '' / a.persona ?? ''；不含名字（改名仍走铅笔就地改名与 L3「改名与头像」）。
  - 保存（Q6 第一节拍）：点击即禁用保存与取消，保存按钮文案改「保存中…」；调 ops.updateAssistant(id, { description, persona })；成功 → 先 closeHomePop(true) → toast「已保存助理资料」→ onDone()（刷新 render）；失败 → 弹窗不关，错误行显示宿主 message 原文，输入保留，按钮恢复；8s 超时按失败处理。
  - 无改动（trim 后与原值相同）→ 直接关闭，落 debug 日志 noop，不发写。
  - 保存中不允许关闭（取消禁用；Esc/遮罩由 home-pop 统一，如果它不拦，则弹窗内捕获 Esc 忽略）。
- panel-body.ts 的 act 增加 profile-a 分支；该文件 300 行顶格，见 §6 抽取计划。
- L3 助理详情页不改按钮（「改名与头像」保留）；详情面板的编辑跳转见 5.4。

#### 5.3 家页助理卡第三行（Q4 C）
- asstRow 的 hu-txt 结构：hu-nm → 简介行（a.description 非空才加：span.hu-desc，title=简介全文，文本单行）→ hu-sub（渠道＋工作区，原样）。
- 样式落 home-row-styles.ts（246 行，该文件注释明确专收追加样式、避开 home-ui-styles 300 红线）：.home-ui .hu-desc{display:block;margin-top:4px;font-size:11.5px;line-height:1.4;color:var(--hu-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}；asstRow 渲染前确保 ensureHomeRowStyles()（从 home-row-styles.ts import）。
- 几何：与骨架第三行 .hu-sline:nth-child(3)（17px + margin-top 4，home-ui-styles.ts:192）同盒 ⇒ 有简介时行高 +21px，无简介时行高不变。
- 简介为空：不渲染该元素（不占位、不出「未填写」）。

#### 5.4 详情面板（src/features/detail-drawer）
删除旧「性格/语气」（Q11 A，先删写后删读）：
- view.ts（275 行）：删 personalitySection、personalityPrefill import、renderDrawerContent 第 4 参 draftPers 及传参；DrawerCallbacks 删 onDraftPersonality/onApplyPersonality；:118 文案「（或用性格页覆盖）」改为「（字段与引导语请去 dsh-im 上游改）」。
- drawer.ts（291 行）：删 draftPers 状态、:134 第 4 参、onApplyPersonality 调用与相关代码（:221-238）。
- actions.ts（75 行）：删 applyPersonality 整段（其 writeBots/rpcOf 保留给渠道管理用）。
- data.ts（231 行）：删 personalityPrefill。
- styles.ts（54 行）：删 .detail-drawer-hero / .detail-drawer-nobox（删后若无引用即成死样式）。
新增只读块（Q12 A）：
- 新文件 src/features/detail-drawer/profile-view.ts（防 view.ts 超 300）导出 profileSection(model)，插在 ctxSection 之后、workspaceSection 之前。
- 取数：fctx.rpc('/im-companion', 'home.list', {}, AbortSignal.timeout(8000))（属契约四通道白名单，先例 fleet-radar/view.ts:215、session-header/assistants.ts:136）。用 model.bots 的 (channel,botId) 匹配 home.list 里 assistants 的 channel/botId；按 assistant id 去重：0 个 → 无匹配提示；1 个 → 显示；≥2 个 → 显示第一个＋meta「另有 n 个助理关联本详情面板」（编辑跳转取第一个）。
- 内容：标题「助理人设」；名字；简介（空 → 「未填写简介」）；人物设定只读 3 行（超出可「展开/收起」，空 → 「未填写人物设定」）；「复制」按钮（persona 空则禁用）；「编辑」按钮。
- 编辑：window.dispatchEvent(new CustomEvent(OPEN_ASSIST_EDIT_EVENT, { detail: { assistantId, homePath? } }))，随后 cbs.onClose() 关闭详情面板。
- 未就绪/无匹配：只显示提示，不渲染编辑与复制按钮。
- 新事件常量：src/client/data/config.ts 追加 OPEN_ASSIST_EDIT_EVENT = 'dsh-im-companion:open-assist-edit' 与 OpenAssistEditDetail { assistantId: string; homePath?: string }。

#### 5.5 编辑跳转（A1 侧）
- 新文件 src/client/components/panel-assist-edit.ts：导出 bindAssistEdit(getBody)，window 监听 OPEN_ASSIST_EDIT_EVENT → getBody()?.openAssistantEdit(detail.assistantId)；返回解绑函数（热重载安全，重复注册前先解绑）。
- panel.ts（300 行）：把 :263-297 的 promoItem/emit* 块抽到 panel-promos.ts（约 40 行），腾出空间装配 bindAssistEdit，并在 dispose 时解绑。
- panel-body.ts（300 行）：返回对象新增 openAssistantEdit(assistantId: string): void；实现：在 view().assistants 里找 id；找不到 → toast「没有找到这个助理，可能刚被删除。」＋ ok:false 日志后返回；找到 → 先 go('L2', a.homeId)（若当前 level 不匹配）再开 asstProfilePop，锚点现取 [data-open='L3'][data-id='<id>']，找不到用列表顶部；保存后 onDone=render。
- 边界：详情面板对应多个 bot/多个匹配助理时，事件只带第一个匹配的 assistantId（5.4 已说明）。

### 6. 契约与流程（实现时第一件事）
- docs/features-contract.md §4「事件制通道」追加 OPEN_ASSIST_EDIT_EVENT：detail 形状、派发方＝detail-drawer 特性、监听方＝A1 面板；明确这是第一条 feature→A1 方向的事件，沿用既有「已知债务（不在四通道白名单）」记法，不写豁免。
- §9:98 契约先行：先改契约 → 地图 Decisions 记录 → 再改码。
- §3:51 A1 私有：panel.ts / panel-body.ts / 新 panel-assist-edit.ts 的改动放同一个 PR；§10 例外通道理由随 PR 写清（详情面板是 feature，编辑弹窗在 A1，不能反向 import）。

### 7. 300 行红线拆分计划（read 工具口径：行数=文件内容行，尾换行不计）
- 新增 src/assistant-profile.ts 约 30 行（共享常量/校验）。
- 新增 src/client/components/home-asst-form.ts 约 160 行（创建弹窗＋编辑弹窗）。→ home-forms.ts 299 → 约 200。
- 新增 src/client/components/home-row-asst.ts 约 60 行（asstRow 搬出）。→ home-rows.ts 296 → 约 245。
- 新增 src/client/components/panel-asst-actions.ts 约 90 行（助手动作分支搬出）。→ panel-body.ts 300 → 约 225（再 +15 行 openAssistantEdit）。
- 新增 src/client/components/panel-promos.ts 约 40 行。→ panel.ts 300 → 约 265（再 +5 行 bridge 装配）。
- 新增 src/client/components/panel-assist-edit.ts 约 45 行。
- 新增 src/features/detail-drawer/profile-view.ts 约 70 行。→ view.ts 275 → 约 255。
- home-row-styles.ts 246 → 约 250（只加 .hu-desc）。
- home-ops.ts 300 → 抽 home-ops-assistant.ts（updateAssistant/createAssistant 写口）约 50 行 → 约 255。
- host：home-store-io 214→约 224、home-store 205→约 216、home-edit 135→约 150、rpc 246→约 264、client/data/home-model 295→约 297、client/data/home-edit 104→约 106。
- tools/verify 文件不受 300 红线约束（既有 600+/2200+ 行）。
- 拆分提交顺序：先纯搬移（行为不变、check 全绿）→ 再加功能；避免一次 diff 同时重构+改行为。

### 8. verify 与门禁改动
1) tools/verify/features/detail-drawer.ts（606 行）：删 :248 needle 数组里的「性格」（及其相关旧文案针）；删 :441-447 personalityPrefill、:449-466 applyPersonality 两段用例（函数删除后会 TypeError）；:253-257 的双开关断言保持不动；新增：mock home.list 命中时「助理人设」块出现（名字/简介/persona 只读/复制按钮）；未命中时只出提示且无编辑按钮；点「编辑」派发 OPEN_ASSIST_EDIT_EVENT（detail.assistantId 正确）且面板关闭。
2) tools/verify/features/home-steel.ts（2232 行）：home.seed 键集合用例（:744-784 一带）加 description/persona；新增：创建弹窗填两栏 → 保存载荷带两键（空 → 空串）；行内第 4 图标存在、点击开弹窗且不进入 L3；编辑弹窗保存 → assistant.update 载荷两键；失败分支：弹窗不关、输入保留、按钮恢复；无改动 → 不发写直接关；简介非空时助理行第三行 .hu-desc 出现且 title=全文，空时不出现。
3) tools/verify/features/home-create-flow.ts（702 行）：接入流程不插新步骤（Q2：与接入无关），确认既有 :443-472 断言不因新建弹层结构变化而红；若选择器受拆分影响则同步更新。
4) tools/verify/render-client.ts（549 行）：假宿主 assistant.update 接受 description/persona（:126-139 一带宽松忽略未知键，需断言真被接收/透传）；home.seed 透传两字段；无新端点需进白名单。
5) tools/verify/features/fleet-radar.ts：文案「抽屉」改「详情面板」（顺带，非打红）。
6) 退役闭包：grep -n '性格' src tools 为 0（历史 docs 不算）。
7) npm run check 全绿；行数红线按 read 口径复核。

### 9. 验收（本票只负责 UI 段）
- 源文本级：npm run check 绿＋§8 用例名齐全。
- UI 全链路（owner 只做刷新与视觉确认）：① 新建助理时填简介/人物设定 → 家页助理卡第三行显示简介，刷新后仍在；② 行第 4 图标 → 改两栏 → 保存成功关闭＋toast，刷新后仍在；清空后卡面第三行消失、详情面板显示未填写；③ 点「详情」开详情面板 → 只读块正确、旧性格/语气区消失、点「编辑」跳到列表并开同一弹窗；④ 界面用词一律「详情面板」；⑤ 300 行红线不破。
- 真机飞书注入行为属实现 effort（T4 规格＋T7 验收）；本票只保证数据可编辑、可持久、可读。
- HITL 纪律：本票为规格票，验收＝owner 对规格拍板；实现时原型/真机验收未过不关实现票。

### 10. 不做（本票 Out of scope）
- 详情面板整体重做（owner Q16 A：另立设计图，本次不建票）。
- detail-drawer 代码模块名/类前缀/verify 文件名重命名（Q13 A：另开小任务票；本票只改产品用词/aria/日志/注释）。
- 并发编辑冲突与历史版本/审计回滚（挪地图 Out of scope）。
- 上下文增强双开关（dsh-im 5.1.0 写必败的另一处死区）另票；旧 guidance 编辑链路不修不复用。
- 不改 dsh-im、不写工作区 AGENTS.md、不实现人设注入投递（T4/T7）。

### 11. 风险与回退
- 事件新增 feature→A1 方向＝既有通道债务的延伸：契约先改、A1 单 PR、监听器带解绑、跳转失败只 toast 不崩。
- S2 空值 strip：以「老账本读→写逐字节不变」断言兜底；旧版插件回退会丢两字段（可接受，记风险）。
- 双端校验漂移：常量与计数函数单点在 src/assistant-profile.ts。
- 拆分引入回归：先搬移后加功能、每步 check 全绿。