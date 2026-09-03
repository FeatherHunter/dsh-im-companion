# 05 · E4 未读来源调研：欢迎横幅今日 N 个会话 / M 条未读从哪里来

> 状态：research（只读，不改产品代码） · 日期：2026-09-03 · 仓库：dsh-im-companion
> 关联票：E4 issue #15 · E3 issue #14 · 地图 #1（R1-R4 传统续 05 号）
> 原型：prototypes/e4-welcome/prototype-e4-welcome.html（mock） · E3 原型：prototypes/routing-preview/prototype-e3-routing-preview.html
> 约束：docs/features-contract.md §4 单份轮询——不得新开第二份轮询，必须复用 connection-stream

## 1. 问题（一句话）
E4 对话区欢迎横幅要显示今日 N 个会话 / M 条未读，但原型数字是 mock 的，本调研回答 M 在 dsh-im / DSH harness 里有无现成来源，若无则最小可行自算方案是什么（轮询什么、存什么水位、精度与代价）。

## 2. 结论先行
1. 没有现成未读事实可读。三处都没有：dsh-im 无未读计数/水位 API；DSH harness 无 session 级未读数字段；本仓现状只有健康与绑定快照。
2. dsh-im 里最像已读的 seenMessageIds 只是入站去重集合，不是阅读水位。
3. 飞书通道只调发送/撤回/表情/资源下载接口，从未调消息列表/已读接口，无可借用的飞书已读概念。
4. 唯一可复用的现成历史事实是 harness 的 session.history（按 seq 分页），未读只能基于它自算差值。
5. 单份 15s 约束下最小可行是 B 方案：复用 connection-stream 节拍，内存记每 key 的 lastSeenSeq，用 session.history 最新 seq 做差值；meta.json 持久化列二期，渠道直调否决。
6. 附带发现：上游真机私聊 key 是 p2p:，不是 R3 记载的 direct:，旧 key 会造成幽灵未绑定。

## 3. 方法（只读）
- 只读源码与文档；不装依赖、不跑服务；不在 src/ 下写产品代码。
- dsh-im 看 message-utils.mjs、conversation-state-store.mjs、feishu state-store.mjs、workspace-session.mjs、RPC surface；搜 unread/read/seen/watermark/lastRead/mention/count/badge/notification/history。
- DSH 本体看 app.asar.unpacked 搜 session 未读/badge/unread/notification。
- 本仓看 CONTEXT.md、features-contract.md §4、connection-stream 与 bindings、E3/E4 原型、workspaces.json、issue 14/15。
## 4. 事实清单（一手资料为准）

### 4.1 dsh-im：无未读计数/水位，只有路由映射与去重集合
F1. conversationKey 是路由键。src/channels/feishu/message-utils.mjs:10 export function conversationKey(event)，:15 返回 p2p: 加 senderId，:19 返回 group: 加 chatId。无 direct:/unread/watermark。
F2. sessionFor 只是查表。src/channels/shared/conversation-state-store.mjs:46 sessionFor(key) 返回 sessions[key] 或 null；src/channels/feishu/state-store.mjs 同名 sessionFor 亦然。无计数/时间/已读标志。issue #14 Context 的 R3 sessionFor 事实即指此。
F3. workspace-session 只是解析-建会话-ask。src/channels/shared/workspace-session.mjs:39 askInWorkspaceSession，:52 state.sessionFor(key)，:53 workspaceSession(harness, sessionId)，:56 state.setSession(key, sessionId)。无 unread/lastRead/watermark。
F4. seenMessageIds 是去重。conversation-state-store.mjs:4 EMPTY_STATE 含 seenMessageIds 空数组，:65 hasSeen 为 includes，:69 markSeen 为 push 上限 1000；feishu/state-store.mjs 同构。bridge.mjs:602 入口去重，:770-771、:850-851、:995-996、:1029-1030、:3579-3580、:3806-3807 均为先 hasSeen 则 return 否则 markSeen。无阅读水位写入点，无 per-key lastSeq。
F5. 全局 cursor 非水位。conversation-state-store.mjs:22 cursor 字段，:78 cursor()，:82 setCursor(cursor)。无 per-conversation 语义。
F6. harness-client 只有 list/history/create。src/channels/shared/harness-client.mjs:818 listWorkspaces 经 workspace.list，:823 listWorkspaceSessions 经 workspace.list 加 session.list，:932 readSessionHistory 经 session.history（含 maxMessages/beforeSeq），:945 sessionExists 经 session.history 取 maxMessages 1。全文件无 unread/lastRead/watermark/badge（dingtalk-controller.mjs:202 unreadable 为英文注释）。
F7. RPC 无未读端点。plugin-src/client/channels/feishu/api.js:13 FEISHU_RPC_CHANNEL 为 /feishu，:16 起 FEISHU_ENDPOINTS 含 status/beginProvisioning/beginCallbackRepair/beginGroupMessagePermission/pollProvisioning/cancelProvisioning/bindCredentials/reconnectBot/disconnectBot/deleteBot/setWorkspace/setAgentPreset/setContextEnhancement/setGroupResponseMode；host 侧 plugin-src/host/channels/feishu/rpc.mjs:23-29 端点并集、:519 未知拒绝。shared/rpc.mjs TOKEN_BOT_ENDPOINTS 仅七个，无 history/unread。
F8. 飞书通道未调拉历史/查已读。src/channels/feishu/feishu-channel.mjs 命中均为 send/reply/delete（:330-331、:368）、reaction（:457、:467）、messageResource.get（:308-322），无 message.list、无 is_read。bridge.mjs 的 list 命中仅 showWatchList（:1104、:1845、:1897、:2963）。
F9. mention 是回包门控。bridge.mjs:580-583 isAddressed，:598 MENTION 模式群聊非 @ 不回；message-utils.mjs:44 withoutMentions 仅清洗；dingtalk:985/discord:105 requiresMention 同理。无计数累加。
F10. 唯一可借用的是 session.history 加 seq。bridge.mjs:331-332 orderedHistoryEvents 按 seq 升序；:3066-3072 经 harness.rpc 取 session.history（maxMessages 20）；harness-client.mjs 多处同 rpc。history-command.mjs:7-9 默认 3 最多 5，:121 sessionFor 取绑定，:137 起 readHistory 校验 seq 后取 visibleMessages。
F11. 路径勘误：conversation-state-store.mjs 在 src/channels/shared/ 下，不在 feishu 下；feishu 下为 state-store.mjs（含 watches）。

### 4.2 DSH 本体：无 session 级未读数
H1. 桌面壳 unread 均为 unreadable。app.asar.unpacked/lib/main.js:76、:78、:86、:128、:144、:4446 均指 run marker/JSON 解析失败；全 lib 搜 session.history 零命中（harness core 在 node_modules @deepseek-ai 下）。
H2. 桌面壳 badge 均为设置徽标。lib/client.js:657 Choice、:710 ToggleRow、:1089 beta、:3448 起 lucide badge- 图标，无 session 语义。
H3. session 包无 unread。dsh-session/lib 零命中；dsh-api-session-controller/lib 零命中；dsh-session-query/lib/index.js:83 唯一命中为 history unreadable 注释；dsh-client-ui-conversation 零命中。
H4. session.list 返回 blank/lastPromptAt/updatedAt/running。dsh-api-session-controller/lib/types/list.js 含 sessionListMetadataSchema（blank、lastPromptAt）、applySessionListMetadata、summaryFor。无 unread/count/lastRead/watermark。
H5. history 返回 seq/cursor/records/hasMore。history.js SessionHistoryController page（throughSeq/beforeSeq/maxMessages）与 follow（cursor 快照加 gap-free 帧）。服务端不存 per-user 阅读态，需调用方自持 lastSeenSeq。
H6. 插件可读仅 workspace.list、session.list、session.history。无可直接读的未读数。

### 4.3 本仓：现状无未读字段，原型数字是 mock
C1. CONTEXT.md:13 Session 为 Harness 会话，飞书会话经 sessionFor 路由；:11 Bot 由 botId 标识；:15 Binding。无未读词条。
C2. 单份轮询硬约束。docs/features-contract.md:53-57 connection-stream 唯一轮询源（15s 加手动广播），feature 经 subscribe 读，不新开轮询；写走 dsh-im RPC 或 host 桥，写后 refresh()。
C3. 轮询即 15s。src/client/data/connection-stream.ts:6 CONNECTION_POLL_MS 15000，:57 setInterval，:42-54 poll/emit，:75 refresh。新增源必须 piggyback 进同一次 poll。
C4. BotSnap 无未读。src/client/data/fleet-api.ts:24-41 BotSnap 无 unread/count/lastSeq/watermark；:157 fetchChannelStatus、:167 fetchBots 只调 connection.status；:192 mergeStaleBots 仅保留失败快照标 stale。
C5. 绑定层无未读。src/client/data/bindings.ts:42 badgeForWorkspace 仅算 online/warn/offline/unbound；config.ts:3-5 CHANNEL_ORDER、:28 healthOf。
C6. host 桥无未读端点。src/host/rpc.ts:38-43 仅 ping/meta.*/fs.*/__badgeDebug，:122 默认拒绝；src/host/meta-store.ts:1 companion meta.json，:15-23 AgentMetaDoc 仅 names/avatars/locals/presets/ctxEnhance。水位需 Added-only 追加。
C7. E4 数字是 mock。prototypes/e4-welcome/prototype-e4-welcome.html:132-136 DIGEST 三行（3/12/1），:142 totalUnread 求和，:168/:177/:191 三变体拼串，:154 digestRows，:139/:144-146 内存关闭态。issue #15 亦写结论回填后定稿。
C8. E3 纯模块可复用。prototypes/routing-preview/prototype-e3-routing-preview.html:121-150 buildP2pKey/buildGroupKey/keyForEvent/sessionFor/previewRoute/onIncomingMessage；:170 幽灵 direct key；:336-344 T3。E4 应复用同套 key，不另发明。

### 4.4 映射与票面
L1. 映射在 dsh-feishu workspaces.json。HOME 下 .dsh/integrations/dsh-feishu/workspaces.json 含 version/workspaces（bot_ 到绝对路径）/agentPresets/contextEnhancement；companion meta.json 仅 names/avatars，两份勿混。
L2. issue #14 即 R3/sessionFor 锚点。Context 为 R3 sessionFor 事实；共识为映射归 dsh-im、companion 只读、真绑定在下一条真消息；对照为 conversationKey/sessionFor/askInWorkspaceSession；已记录 direct/p2p 不一致。
L3. issue #15 卡点即本文件。下一步写明未读来源调查即 docs/research/05-e4-unread-source.md，回填 A 变体后定稿。

### 4.5 R3 矛盾（必须指出）
R3（.scratch/companion-wayfinder/research/03-r-session-routing-findings.md:13）写 direct: 加 userOpenId；上游真机 message-utils.mjs:10-19 为 p2p: 加 senderId / group: 加 chatId。E3 原型 :105、:170、T3 与 issue #14 均已确认。E4 若按 direct: 对账会把同一私聊算成两个会话，水位主键必须用 p2p:/group:，存量 direct: 做迁移或双 key 回退。

## 5. 候选方案对比（N/M 定义先行）
原型 N 等于 DIGEST.length（3），M 等于求和（16）。真机需先定：N 是今日有新事件的已绑定数还是全部映射数？M 是横幅已读位后新增可见事件数还是飞书红点？本节 M 按 DSH 对话区视角（per-session 自 lastSeenSeq 后新增可见消息数），N 按今日有新增的会话数。

### A · 纯读现成态
- 数据源：connection-stream 快照 bots 加 workspaces.json 映射，必要时 session.list 的 blank/updatedAt/lastPromptAt 粗筛。不读 history，不存水位。
- 15s 挂法：零新增调用，同 subscribe 派生；需今日则同 poll 内 piggyback 一次 session.list，不另起 timer。
- 精度：M 给不出，只能 N 占位或 M 置灰；硬把在线当未读属谎报，违 B1 不谎报原则。
- 触碰面：零。共享层/host/dsh-im 均不动，feature 自包含，可移除最优。
- 代价：最小，作 Phase 0 占位。

### B · 自己记水位（推荐，内存优先，meta.json 二期）
- 数据源：E3 key（p2p:/group:）加 sessionFor 得 sessionId，以 session.history 最新 seq 为真值，本地 lastSeenSeq 为已读位，M 为差值按 visibleMessages 过滤；N 为今日有 M 或 latestSeq 落今日的数。主键禁 direct:。
- 15s 挂法：复用同一次 poll，对绑定集合有界并发拉 history（首期 maxMessages 1 取 seq，或 20 对齐 bridge 基线；beforeSeq 传水位）。禁新 setInterval；首屏先 N 占位，回包后二次 emit（同 refresh 延续）。
- 精度损失：首轮无基线（记基线标建立中）；seq 含系统事件需过滤；跨端不同步；关闭/切会话是否算已读待定义（原型仅内存态）；stale 剔除；今日按 event.time 落日。
- 触碰面：共享层 Added-only（StreamSnapshot 加可选字段或 feature 本地派生更优）；二期 AgentMetaDoc 加 readWater 表加 host 新 case，经 FeatureCtx.meta 读写，不直写 localStorage；上游零触碰。
- 代价：中。K 路 history（K 大封顶加增量），每 key 一条 seq/time，O(N) 可移除。

### C · 渠道历史直调（不推荐）
- 数据源：飞书 message.list 等按 chat 拉取再折算。dsh-im 现无封装，需新增。
- 15s 挂法：O(N 乘 pages) 易超时，污染单轮询 stale 语义；另起 timer 则违 §4。
- 精度：飞书已读非会话事实，仍需自定水位，不高于 B；多渠道分裂。
- 触碰面：最大，跨仓连环改，违第一原则。
- 代价：最大（权限/配额/分页/脱敏）。仅 B 被证伪才备选，先上游立项。

| 维度 | A | B（推荐） | C |
| --- | --- | --- | --- |
| 数据源 | status 加 list | history seq 减水位 | 渠道消息列表 |
| 15s | 零新增 | 同 poll piggyback | 易撑爆 |
| 精度 | M 缺失 | 近似 | 不高于 B |
| 触碰面 | 零 | Added-only | 跨仓 |
| 代价 | 最小 | 中 | 最大 |

## 6. 推荐与最小验证
推荐 A 占位先行，加 B-内存为首版，C 否决，meta.json 列二期。
- Phase 0（A）：按已绑定数/待接水位占位，A 变体先定稿 UI 与关闭/深色/空态叠加，不卡 M。
- Phase 1（B-内存）：feature 内 read-water 单文件（不超 300 行）：复用 keyForEvent/sessionFor，水位 Map（key 到 lastSeenSeq），history 首期 maxMessages 1，超阈再翻页过滤。已读首期定为横幅渲染即已读（只少报不谎报）；点开算已读需等 harness.openSession shape 确认（issue #14 待确认）。
- Phase 2：水位进 meta.json（加 readWater 表加新 case），N 按 event.time 落日。
最小验证（只读，不进 src/）：
1. N：fetchBots 加映射非空；session.list 的 blank/updatedAt/lastPromptAt 可粗筛今日。
2. seq：任一 sessionId 调 history（1 条）含单调 seq/time/type；20 条排序稳定，否则 B 不成立。
3. 差值：两次 history 夹一条真消息，增量等于肉眼增量；首轮只建基线不报 M。
4. 合规：一次 poll 内并发 K 路计时，15s 内完成且失败标 stale；无第二 setInterval。
5. key：p2p 双 key 查 sessionFor 只命中 p2p，水位锁定 p2p:/group:。
6. 回填 A 变体数据源注释后实现验收（横幅可见/不挡输入/可关/深色）。

## 7. 术语缺口（补 CONTEXT.md 建议）
- 今日：按 event.time 落日的自然日；跨天重算 N。
- 未读 M：自 lastSeenSeq 后可见消息数，已读首期为渲染即已读。
- 会话 N：今日有新增的已绑定数，stale/未绑定不计。待裁定。

## 8. 出处索引
dsh-im：message-utils.mjs:10/:15/:19；conversation-state-store.mjs:4/:46/:65/:69/:78/:82；feishu state-store.mjs；workspace-session.mjs:5/:39/:52/:56；harness-client.mjs:818/:823/:932/:945；feishu api.js:13/:16；feishu rpc.mjs:23-29/:519；shared rpc.mjs；feishu-channel.mjs:330-331/:368/:457/:467/:308-322；bridge.mjs:331-332/:602/:770 等/:3066-3072/:580-583/:598；history-command.mjs:7-9/:121/:137。
本体：lib/main.js:76 等 unreadable；lib/client.js:657 等 badge；dsh-session/dsh-api-session-controller 零命中；session-query index.js:83；list.js/history.js。
本仓：CONTEXT.md:11/:13/:15；contract §4（:53-57）；connection-stream.ts:6/:57/:42-54/:75；fleet-api.ts:24-41/:157/:167/:192；bindings.ts:42；config.ts:3-5/:28；rpc.ts:5；host/rpc.ts:38-43/:122；meta-store.ts:1/:15-23；E4:132-136/:142/:168/:177/:191/:154；E3:105/:121-150/:170；R3:13；workspaces.json/meta.json；issue 14/15。

## 9. 未决与风险
- 口径待裁定，否则评审判谎报；过滤口径须同 history-command；direct: 迁移同 R3 修订；K 大降级为仅候选拉 history。

---
方法声明：只读 research，未改 src/，未装依赖跑服务；二手说法已按上游证伪指出。