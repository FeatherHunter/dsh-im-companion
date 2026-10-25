# 取证：会话归属识别的 dsh-im 落盘契约

- 票：wayfinder 研究票 **T2 · 会话归属识别的落盘契约取证**（GitHub issue #162）
- 取证时间：2026-10-22（Asia/Shanghai）
- 环境：Windows 11 · DSH `0.2.1-rc.2`（asar `D:\DeepseekHarness\resources\app.asar`，包 `@deepseek-ai/dsh-desktop-runtime`）· dsh-im **5.1.0**（`C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@xmanrui\dsh-im`）· 本仓 `dsh-im-companion` 0.2.19（Junction 开发态）
- 方法：dsh-im 源码逐行读；DSH 本体 asar 解包读源码（自写解析器，见 §8）；`<DSH_HOME>` 真实数据只读抽样（4 个 state.json、4 个会话日志、2 个 workspaces.json、2 个 config.json、homes.yaml）；本仓源码读
- 标注约定：**源码确证** = 读到实现并给出 file:line；**实测** = 本机真实数据/命令输出；**推断** = 由前两者推出但未直接验证
- 脱敏：botId 只留前缀、openId/accountId/sessionId 只留形态，**不含 token/密钥/消息正文**

---

## 一句话结论

dsh-im 的**精确归属**只存在于「每 bot 一个 state.json 的 `sessions[conversationKey] = sessionId`」这张表里（feishu `bots/<botId>/state.json`、微信 `accounts/<accountId>/state.json`，文档 `version:1`、无迁移），且它是**「会话↔渠道会话键」的绑定表，不是 bot 的所有权记录**：写入发生在 `createSession` 返回后、`prompt` 之前，`/new`、切工作区、换绑、删 bot 都会清空或删除，`/clear` **不**清空；因此 companion 必须以「扫全部 bot/account 的 state.json → 建 sessionId→(channel,botId) 反查索引」的方式读取，且**只做缓存 + mtime/尺寸失效 + 全程 fail-soft**，任何缺失/损坏/竞态都返回空而绝不抛错。DSH 侧没有任何一处（会话头、`session/list`、标题、`agentPreset`、`origin`、`cwd`）能给出 botId；唯一能白拿的是**渠道级**信号（`user/message` 的 `source.rpcId` 前缀、标题的「飞书 ·」前缀），dsh-im 自己也只把它当渠道级用（`plugin-src/host/session-title-prefix.mjs`）。

---

## 0. 结论速览

| # | 结论 | 证据等级 |
|---|---|---|
| 1 | feishu：`<DSH_HOME>/integrations/dsh-feishu/bots/<botId>/state.json`；另有 legacy 根 `<root>/state.json`（本机不存在） | 源码确证 `plugin-src/host/channels/feishu/production.mjs:85-97,151-155` + 实测 |
| 2 | 微信：`<root>/accounts/<botId>/state.json`（**不是** `bots/`） | 源码确证 `plugin-src/host/channels/weixin/production.mjs:40-49,118` + 实测 |
| 3 | state.json 文档 `version:1`，**当前实现只写不读**，无迁移代码；票面「CURRENT_DOCUMENT_VERSION=3」是 **workspaces.json** 的常量，不是 state.json | 源码确证 `src/channels/feishu/state-store.mjs:6,41`；`src/channels/shared/bot-workspace-store.mjs:41-43` + 实测（4 个 state.json 全为 1） |
| 4 | `sessions` 键 = channel 前缀的会话键（`p2p:<openId>` / `group:<chatId>` / `:thread:` / `:managed:`；微信只有 `p2p:<userId>`），值是 DSH sessionId | 源码确证 `src/channels/feishu/message-utils.mjs:56-84`、`src/channels/weixin/weixin-bridge.mjs:123-124` + 实测 |
| 5 | 写入时序：`createSession` → `setSession`（写盘完成）→ `prompt`；`session/created` 事件**早于**写盘 | 源码确证 `src/channels/shared/workspace-session.mjs:120-146,184`、`dsh-session/lib/index.js:1910` |
| 6 | 清空触发：`/new`、切工作区、切会话工作区、绑定覆盖、bot 移除；`/clear` 明确**不改绑定** | 源码确证 `plugin-src/host/channels/feishu/bridge.mjs:1853,2842,3018`、`src/channels/shared/clear-command.mjs:31-35,77`、`bot-workspace-store.mjs:1165-1192,1212-1232,1354-1392` |
| 7 | 落盘是 `writeFile(<path>.tmp, 0600)` → `rename` → 串行队列；读侧永远看到完整 JSON；`.tmp` 遗留文件（实测存在）必须忽略 | 源码确证 `state-store.mjs:203-213` + 实测 |
| 8 | 反查可能 1:N（同一 sessionId 可被多个 conversationKey 绑定），必须按列表处理并给确定性 tie-break | 源码确证 `bot-workspace-store.mjs:1089-1192`（`setSession` 不清理其它键）+ 推断 |
| 9 | 宿主插件用 `node:fs` 直读/直写 `<DSH_HOME>` **不受沙箱约束**；沙箱只拦模型经 `ctx.fs` 的写 | 源码确证 `dsh-fs-sandbox/README.md:12,64`；先例 `src/host/log.ts:8-9,14,42` + 实测日志文件 |
| 10 | DSH 侧无 botId：会话头只有 `{id,cwd,agentPreset,origin?,parentSession?}`，`session/list` 无 bot 字段 | 源码确证 + 实测（4 个 IM 会话头） |
| 11 | 唯一白拿的渠道级信号：`user/message.data.source.rpcId = "<channel>-<uuid>"`；标题被加「飞书 ·」「微信 ·」前缀 | 实测（4 个会话日志）+ 源码确证 `session-title-prefix.mjs:6,24,31-38` |
| 12 | 本仓**已有**读 state.json 的宿主代码 `src/host/routes.ts`（`candidateStateFiles`/`parseSessionsText`），但只覆盖 `bots/`，**读不到微信 `accounts/`**；且是 bot→session 方向 | 源码确证 `src/host/routes.ts:32-39,41-55` |

---

## 1. 精确路径与形状

### 1.1 渠道 → state.json 路径矩阵

根目录由各渠道 host 侧 `pluginPaths()` 统一推出（**源码确证** `plugin-src/host/channels/feishu/production.mjs:85-97`）：

- `dshHome = config.dshHome ?? process.env.DSH_HOME ?? homedir()/.dsh`
- `root = <dshHome>/integrations/dsh-<channel>`；`workspaces = root/workspaces.json`

| 渠道 | state.json 路径（相对 `<root>`） | 源码位置 |
|---|---|---|
| feishu | `bots/<botId>/state.json`，缺失时回落到 `<root>/state.json`（legacy） | `feishu/production.mjs:151-155` |
| weixin | `accounts/<botId>/state.json` | `weixin/production.mjs:118` |
| whatsapp / wecom / qq / wecom-app / dingtalk / slack / matrix | `bots/<botId>/state.json` | 各 `production.mjs`（whatsapp:85、wecom:78、qq:77、wecom-app:112、dingtalk:84、slack:64、matrix:70） |
| discord / imessage / email / telegram | 共用 `shared/production.mjs:95` → `bots/<botId>/state.json` | 同左 |
| office | 只有 root，无 state.json | `plugin-src/host/channels/office/production.mjs` |

**实测**（2026-10-22，只读）：`<DSH_HOME>/integrations/` 下仅 4 个目录 —— `dsh-feishu`、`dsh-im`、`dsh-im-companion`、`dsh-weixin`。feishu 3 个 bot 目录、微信 1 个 account 目录；feishu 无根级 legacy `state.json`。

> 归属键的完整形态是 **`(channel, botId)`**，不是单独的 botId —— 判据：微信的 `botId` 形如 `wx_<24hex>`（实测 27 字符），飞书为 `bot_<32hex>`（实测 36 字符），前缀不同但**不要把前缀当契约**，跨渠道唯一性只能靠 channel 目录区分（**推断**，基于两者的生成器互不相干；见 §7）。

### 1.2 state.json 形状（当前实现）

**feishu**（**源码确证** `src/channels/feishu/state-store.mjs:5-14`）：

    { version: 1, sessions: { [conversationKey]: sessionId }, seenMessageIds: string[],
      watches: {}, deferred: {}, includeArchivedSessions: false, topics: {}, mirrors: {} }

**weixin**（**源码确证** `src/channels/weixin/state-store.mjs:9-15`）额外含 `getUpdatesBuf`、`recentOutboundMessages`（**含消息正文**）、`contextTokens`（**含凭据 hash 与每用户 token**，`snapshot()` 在 `:266-269` 剔除，但磁盘上有）。

**实测尺寸/内容**（只报形态）：

| 渠道 | 目录 | 字节 | sessions 条数 | version |
|---|---|---|---|---|
| feishu | `bots/bot_253f13…` | 307 | 1 | 1 |
| feishu | `bots/bot_7e348b…` | 522（另有遗留 `state.json.tmp` 565B，比正式文件多 1 条 `seenMessageIds`） | 1 | 1 |
| feishu | `bots/bot_caf120…` | 651 | 1 | 1 |
| weixin | `accounts/wx_d3c34f…` | 3504 | 1 | 1 |

> 单文件上限的**工程含义**：`seenMessageIds` 截尾 1000（**源码确证** `:17,105-106`）、`watches` 每键上限 20（`:130`）、微信 `recentOutboundMessages` 200 条/30 天/TTL（`:17-20`）⇒ 单文件是 **KB 级、有界**，不是随消息数线性增长。实测最大 3.5KB 吻合。

### 1.3 版本号：票面的「CURRENT_DOCUMENT_VERSION=3 vs 磁盘 version 2」是**两份不同文档**

- `state.json` 的 `version` 是各渠道 state-store 里的**字面常量 1**（`feishu:6,41`；`weixin:10,101`），**没有任何读取/校验/迁移代码**（grep `version` 仅这两处）——**源码确证**。⇒ companion 不应因 `version !== 1` 拒绝解析；只按 `sessions` 形状取值（本仓 `parseSessionsText` 正是这么做的，`src/host/routes.ts:41-55`）。
- `CURRENT_DOCUMENT_VERSION = 3` 属于 **`workspaces.json`**（`src/channels/shared/bot-workspace-store.mjs:42`），同文件 `:41 DELIVERY_DOCUMENT_VERSION=2`、`:43 EMPTY_DOCUMENT={version:1}`；`normalizeDocument` 接受 1/2/3 并返回 `version = max(value.version, accessPolicies===undefined ? 1 : 2)`（`:247-337`，返回处 `:319-322`）；只有 `:680-682`（保存 contextEnhancement）才显式写 3。
- **实测**：两份 `workspaces.json` 都是 `version: 2`（feishu 1812B、weixin 677B），键为 `{version, workspaces:{botId: workspacePath}, accessPolicies:{botId:{direct,group}}}`；**没有 `agentPreset` 键**（默认不写，推断：只有非默认值才落盘）。

⇒ **对规格的意义**：归属表只认 `state.json.sessions`；`workspaces.json` 只用来解释 cwd/工作区，**不要**拿它当归属依据（见 §5.6）。

### 1.4 conversationKey 形态（源码确证）

- feishu（`src/channels/feishu/message-utils.mjs:56-84`）：
  - `conversationScope`：`p2p` → `p2p:${openId`，否则 `group:${chatId`
  - `conversationKey`：非 p2p 且有 `thread_id` → `${scope`:thread:${threadId`，否则 `scope`
  - `managedTopicKey`：`${scope`:managed:${rootMessageId`（话题/主题会话）
  - `isTopicKey`：判 `':thread:'` / `':managed:'`
- weixin（`src/channels/weixin/weixin-bridge.mjs:123-124`）：`p2p:${userId`，**只私聊**
- 本仓 `formatChat` 另认 `direct:` 前缀为 feishu 旧映射（`src/host/routes.ts:59-67,75-77`）

**实测** 4 条绑定（脱敏）：3 条 `p2p:ou_<openId>`（飞书）+ 1 条 `p2p:<userId>@im.wechat`（微信）；值均为 `session-<uuid>`。

⇒ 工程含义：key 是**渠道自定义的不透明串**，`p2p:`/`group:` 之后可能再挂 `:thread:`/`:managed:`；**不要**按 `:` 切分去推语义（切了也只能得 chat 种类，得不到 bot）。归属只需要「键=不透明字符串」。

### 1.5 多 bot、多群、1:N

- 多 bot：每个 bot 一个 `state.json`（源码确证 §1.1）；同渠道 N 个 bot 的 `sessions` 各自独立。
- 多群/多会话：同一 bot 的 `sessions` 天然多键（每个群/私聊一条）——**实测**本机每 bot 只有 1 条，属数据现状、不是结构限制。
- **1:N（同一 sessionId 被多键指向）是可能的**：`bindWorkspaceSession` 会把一个**已存在**的 session 绑到某 conversationKey（`bot-workspace-store.mjs:1089-1201`，末尾 `setSession(conversationKey, sessionId)` 在 `:1192`），而清理只针对「工作区不同」（`:1165` `clearSessions`）或「override 被清」（`:1167` `clearSession`）。⇒ 同 bot 的另一个键、或另一个 bot 的键，都可能仍指向同一 sessionId（**推断**：未构造复现，但代码路径允许）。
- ⇒ **规格必须把反查结果当数组**：`sessionId → [{channel,botId,conversationKey}]`；长度 1 才可直接认定，>1 时按「该 state.json 的 mtime 最新」tie-break 并记一条 warn（可诊断），或返回 null 走无主链路。

### 1.6 与 companion 自己的 `homes.yaml` 的 join（实测）

`<DSH_HOME>/integrations/dsh-im-companion/homes.yaml`（6681B）里 `assistants[]` 行含：`id, homeId, channel, botId, status(bound|unbound), name, nameSource, avatar, avatarSource, createdAt, boundAt`。**实测样例（脱敏）**：`channel: feishu` + `botId: bot_caf120…` + `name: 小婉` + `status: bound`；也有 `botId: null` + `status: unbound` 的行；微信侧一行 `channel: weixin` 的助理当前 `botId: null`。

⇒ **规格的接缝**：磁盘给出 `(channel, botId)`，companion 用它查自己的 assistant 行拿人设（name/avatar/homeId）。`dsh-im` 的 `config.json` 也有 `botName`（实测 feishu 为 `小婉/小研/小羊`，微信无显示名），但那是渠道侧显示名，**人设权威仍应在本仓 homes.yaml**（与既有盘点一致）。

---

## 2. 生命周期

### 2.1 写入时序（源码确证）

`src/channels/shared/workspace-session.mjs` 的 `askInWorkspaceSession`（`:92-205`）：

1. `:120` `withSessionBindingLock(state, key)`
2. `:121` `awaitPendingConversationSwitch(...)`
3. `:122` `sessionId = state.sessionFor(key)`（`state-store.mjs:79-81`，`?? null`）
4. `:126-129` 无则 `harness.createSession({conversationKey:key, ...createOptions})`
5. `:131` `if (await state.setSession(key, sessionId) === false) 放弃`
6. `:137-146` 可选 `renameTitle(initialTitle)`
7. 锁外 `prepareContent` → `:184` `session.ask(prompt, ...)`

`setSession` 先改内存再 `await #persist()`（`state-store.mjs:83-86`），`#persist` 串行队列 + `mkdir(0700)` + `writeFile(<path>.tmp, 0600)` + `rename`（`:203-213`）。

⇒ **对 companion 有利的事实**：模型开始跑（`session.ask` 引发首个 `systemPrompt.context` 渲染）发生在 `setSession` **之后** ⇒ 用 context 回调读盘时映射通常已在。**但** `session/created` 事件早于写盘（§5.1），**不能**用它触发读。

⇒ **竞态窗口的残余**：`createSession` 内部若触发一次组装（例如预设注入/种子消息），此刻磁盘还没有映射 ⇒ 回调会 miss。规格必须容忍「miss 不缓存」或极短 TTL。

### 2.2 清空/重绑矩阵

| 触发 | 动作 | 源码 |
|---|---|---|
| 聊天里发 `/new`（文本） | `clearSession(key)`；队列忙/pending interaction 时**拒绝** | `plugin-src/host/channels/feishu/bridge.mjs:1845-1853` |
| 菜单「新会话」 | `clearSession(key)` | 同文件 `:2842`（`:2848-2854` 的 `use:current` 只读 `sessionFor`） |
| 菜单新会话（另一处） | `clearSession(key)`，persist 失败也 `finish('failed')` 再抛 | 同文件 `:3017-3023` |
| 微信 `/new` | `clearSession(key)` | `weixin-bridge.mjs:822`（其他渠道同构：dingtalk:953,1339、qq:987,1203、wecom:895,1385、wecom-app:592、shared/text-harness-bridge.mjs:1128） |
| 切 bot 工作区（不同 workspace） | `clearSessions()`；同 workspace 直接 return | `bot-workspace-store.mjs:770-804`（`:786` 早退、`:790` generation、`:794` 清、`:795-801` 落盘成功才发布；persist 失败回滚 workspace 但**不回滚已清 session**） |
| 切单会话工作区 | `clearSession(conversationKey)` | `:1003-1087`（`:1065`） |
| 绑会话到工作区（workspace 变） | `clearSessions()`；仅 override 被清则 `clearSession(key)`；最后 `setSession(key, sessionId)` | `:1089-1201`（`:1165/:1167/:1192`） |
| 切模型命令 | 仅当 `state.sessionFor(key)===sessionId` 才清 | `src/channels/shared/model-command.mjs:451` |
| bot 移除/解绑 | `beginRemoval({clearSessions})` → `#retireCurrentIncarnation`；`deleteState()` 删文件 | `:1212-1232`、`:1354-1392`、`:2383-2431`；`feishu/production.mjs:287-294` |
| `/clear`（清历史） | **不清绑定**（注释与文案都明说） | `src/channels/shared/clear-command.mjs:31-35,77` |

⇒ **规格必须区分**：「归属失效」= 键被删或改指；「上下文清空」= `/clear`，**归属不变**。

### 2.3 重启 / 断连 / 解绑

- 重启：`state.json` 是唯一真相，进程内无第二份持久层（源码确证：`stateStores` 只是内存缓存，`production.mjs:150-169` 懒加载）。⇒ 重启后映射仍在（**推断**：未实测重启）。
- 连接断开：**未见**任何「断连即清 sessions」的代码路径（grep 无）；`contextTokens` 会过期但 sessions 不动 ⇒ 断连后归属应仍可按盘解析（**推断**）。风险：断连期间用户可能在 DSH 侧删了会话 ⇒ 陈旧映射，但不影响新会话（id 唯一）。
- 解绑/删 bot：`deleteState` 删 `state.json`（ENOENT 忽略）；`bots/<botId>` 目录是否整体删除未逐行确证（**未证实**，见 §7）。⇒ 扫描必须容忍「目录在、文件没了」与「目录整个没了」两种。

### 2.4 并发写

`#persist` 用 `<path>.tmp` + `rename`（源码确证 `state-store.mjs:203-213`），rename 覆盖是原子的 ⇒ 读者要么读到旧 JSON，要么读到新 JSON，**不会读到半截**。本机观察到 `state.json.tmp` 遗留（bot_7e348b…，565B）⇒ **会把 `.tmp` 当正式文件的实现是错的**；只认文件名恰好 `state.json`。

### 2.5 跨渠道差异（对本需求的净影响）

- 路径：feishu `bots/`、weixin `accounts/`、其余 `bots/`（§1.1）——**不能**用一个模板覆盖全部。
- 键：微信只有 `p2p:`；飞书有 `p2p:`/`group:`/`thread:`/`managed:`。
- 版本：两者 state.json 都是 `version:1`；weixin 文档更大且含敏感字段（token 形态），**companion 只解析 `sessions`，其余一律不读不记**。
- 显示名：飞书 `config.json.bots[].botName`；微信 `config.json.accounts[]` **无**显示名 ⇒ 名称只能来自 companion 自己的 homes.yaml。

---

## 3. 读取工程

### 3.1 扫描量（实测）

- 目录：feishu 3 个 bot + weixin 1 个 account = **4 个 state.json**；渠道根目录 4 个。
- 单文件：307–3504B；全量读 4 个文件 ≈ **5KB**（一次 `Promise.all(readFile)` 亚毫秒级，Windows 上主要成本是 4 次 syscall）。
- 结论：**每次会话组装全量重扫也不贵**，但 `systemPrompt.context` 是**每步**渲染（见规划期笔记 2），多步会话里会放大成 O(steps × 4)，且会与 dsh-im 的写盘争 I/O（小）。

### 3.2 mtime 能否作为失效依据

**能，但要 mtime+size 双键**：

- `#persist` 每次写都 `rename` 新文件 ⇒ `mtimeMs` 必变（源码确证 + 实测 `.tmp` 与正式文件 mtime 不同）。
- 风险：Windows 的 NTFS 时间戳精度足够，但 Node 返回 ms；同毫秒内两次写（同一 bot 连发两条不同会话的绑定）理论上可能同 mtime，**size 兜底**（不同绑定 size 几乎必变），再加「sessionId 命中缓存就直接返回、miss 才重扫」的短路。
- 更稳的替代：`fs.watch` 不可靠（rename 覆盖时会触发 rename 事件但跨平台语义不一）⇒ **不建议** watch，用「每步 stat 4 个文件」+ 命中缓存。

### 3.3 并发读

见 §2.4：rename 原子 ⇒ 读到的一定是完整 JSON。仍可能读到：

- `ENOENT`（删 bot/正在首次创建）→ 按空处理
- JSON 解析失败（人为编辑/未来格式）→ 按空处理
- `sessions` 非对象/值非 string（脏数据）→ 逐条过滤（本仓 `parseSessionsText` 已如此，`src/host/routes.ts:41-55`）

### 3.4 缺失/损坏必须安全返回空（源码证据）

`StateStore.load()`（`src/channels/feishu/state-store.mjs:37-57`）**只有 ENOENT 才建空文件，其他错误直接 throw** ⇒ 上游自身都会抛；companion **必须**在外层 `try/catch` 全包，`catch` 返回 `[]`，并记一条 `warn`（可诊断、不影响控制流）。

### 3.5 推荐读取算法（伪代码，供规格直接采用）

    // 进程内单例；按 (mtimeMs,size) 失效；全程 try/catch
    type Binding = { channel: string; botId: string; conversationKey: string; sessionId: string }
    let index: Map<string, Binding[]> | null = null
    let stamp: string | null = null

    async function loadIndex(dshHome): Promise<Map<string, Binding[]>> {
      const files = await listStateFiles(dshHome)      // 只列候选，自身 try/catch
      const now = stampOf(files)                       // 排序后拼 "path:mtimeMs:size"
      if (index && now === stamp) return index
      const all: Binding[] = []
      for (const f of files) {
        try { all.push(...parse(await fs.readFile(f.path, 'utf8'), f.channel, f.botId)) }
        catch { /* ENOENT/EACCES/坏 JSON 一律跳过 */ }
      }
      index = groupBySessionId(all); stamp = now
      return index
    }

    function listStateFiles(dshHome) {
      // feishu/其余：<root>/bots/*/state.json；weixin：<root>/accounts/*/state.json
      // 渠道白名单：只读 <DSH_HOME>/integrations 下确实存在的 dsh-<channel>，channel 用 /^[a-z0-9-]{1,32}$/ 过滤
      // 注意：目录枚举 + stat 本身也要 try/catch（目录可能消失）
    }

    function resolve(sessionId) { return index?.get(sessionId) ?? [] }

- 兜底：`stat` 也失败 ⇒ 沿用上一次成功的 index（stale-but-usable），不要因为一次读失败就把助理人设清空；连续 N 次失败再降级为空。
- 首次 miss 不缓存负数（或 TTL ≤ 2s）：新建会话的窗口期需要能立刻补上。
- 线程安全：Node 单线程 + `await` ⇒ 用「in-flight promise 去重」防并发重扫（多个会话同时组装）。

### 3.6 复用本仓现有件（避免第二套解析）

`src/host/routes.ts` 已有：

- `candidateStateFiles(dshHome, channel, botId)`（`:32-39`）：`bots/<botId>/state.json` + feishu legacy 根
- `parseSessionsText(text)`（`:41-55`）：只收 `sessions` 里 string→string，坏数据丢弃，**不抛**
- `collectRoutes`（`:80-119`）：fail-soft、`skipped` 原因分类（`bad-bot/no-state/unreadable`）、legacy 只补缺

**缺口（本票必须写进规格）**：`candidateStateFiles` **只拼 `bots/`** ⇒ 微信的 `accounts/<botId>/state.json` 读不到。修法有两条（择一，均属 Added-only）：

1. 在 `routes.ts` 里加 `channel === 'weixin' ? 'accounts' : 'bots'` 分支（改既有函数体，触碰面大）；
2. 新增独立模块（如 `src/host/session-ownership.ts`）用同一套路径规则 + 反向索引，`routes.ts` 不动（推荐：符合 §1-① 功能自包含，且反向索引与 routes 投影职责不同）。

---

## 4. 权限 / 沙箱

**结论：宿主插件用 `node:fs` 直读 `<DSH_HOME>` 不会被沙箱拦。**

- 沙箱是**模型侧**的 `ctx.fs` 后端：`dsh-fs-sandbox/README.md:12`「The sandbox-enforcing ctx.fs backend … confines **model** file writes and edits according to each session's sandbox mode while preserving the local filesystem's read behavior」；`:64`「The fence is a policy check in trusted code over a model-controlled path」。⇒ 约束对象是模型经工具/`ctx.fs` 的写，不是宿主插件代码里的 `node:fs`（**源码确证**）。
- 先例 1（本仓）：`src/host/log.ts:8-9` 注释「不传 `ctx.get('fs')`：DSH 的 fs 是沙箱实现（写用户家目录会被 `FS_SANDBOX_DENIED` 拒），且缺 mkdir/unlink」；`:14` `import { mkdir } from 'node:fs/promises'`；`:42` `createNodeFileService()`。**实测物证**：`C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\2026-10-15.log` 79,148B、`2026-10-16.log` 149,837B、`2026-10-17.log` 319,731B —— 宿主直接写 DSH_HOME 成功。
- 先例 2（上游）：dsh-im 的 host 侧同样直接 `node:fs/promises` 写 DSH_HOME（`src/channels/feishu/state-store.mjs:2`、`plugin-src/host/channels/feishu/production.mjs:6`、`update-service.mjs:2` 等）；两条插件都以 cordis bundle 形式**插进 DSH 主进程**（`dsh-im/package.json` 的 `dsh.bundle.patch`、本仓 `package.json` 的 `dsh.bundle.patch: ./cordis.patch.yml`）。
- DSH_HOME 解析必须与上游同链：`config.dshHome ?? process.env.DSH_HOME ?? homedir()/.dsh`（`dsh-home-paths/README.md:34-41`；本仓已有同式 `src/index.ts:53`，且 `src/host/rpc.ts:73` 另有一份 `homedir()/.dsh` 兜底 —— **两处口径不一致，规格应统一到 `src/index.ts:53`**）。

---

## 5. 其它信号能否作精确归属（否证/边界）

### 5.1 `session/created` 事件

- 事件名是**斜杠**形式 `session/created`（票面写成 `session.created` 需订正）：`dsh-session/lib/index.js:1910`，只在 `SessionStore.announce(session)` 发一次（`:1901-1923`），`callbackArgs = [session]`。
- `session` 对象带不可变 `header`（`:1340`，`get id()` `:1344-1346`；header 明确「Kept out of the event log」`:1332-1339`），header 形状 `{version, id, createdAt, cwd?, parentSession?, isSeeded, origin?, delegationDepth?, agentPreset?}`（`:1818-1828`）——**无 botId/channel/conversationKey**。
- 可见性：未加 scope 标签的监听器是全局的（cordis `src/events.ts:165-175` 的 `hook.global || !filter`；dsh-scope `README.zh.md:42,75`）⇒ `ctx.on('session/created', fn)` 能收到**所有**会话（dsh-im 自己就这么用：`session-title-prefix.mjs:105` `{global: true}`，说明它显式要全局）。
- 时机：`announce` 在 `session.create` RPC 内、`createSession` 返回**前**发出 ⇒ 此刻磁盘 state.json **还没有**该映射（dsh-im 在返回后才 `setSession`，`workspace-session.mjs:126-131`）。
- ⇒ 结论：**可以当通知，不能当归属**；若用它做触发，必须「延迟到 prompt 后」或「miss 重试」。

### 5.2 `session/list` / 会话摘要

`dsh-api-session-controller/lib/types/list.js:319-325` 的 `listFields` 只含 `parentSessionId?`、`origin?`、`cwd?`（外加 `sessionId/running/title/updatedAt/blank/depth` 等）⇒ **无 botId/channel**（源码确证）。`origin` 当前语义只有 `'subagent'`（`list.js:101,620`；`service.js:529`），dsh-im 的 `session.create` 不传 `origin` ⇒ 用它判「是不是 IM 会话」也不成立。

### 5.3 `user/message` 的 `rpcId` 前缀

- 机制：dsh-im 每个渠道 HarnessClient 构造传 `rpcIdPrefix`（feishu/weixin/dingtalk/wecom/slack/whatsapp/qq/telegram/discord/matrix/imessage/email/wecomapp/office；`src/channels/*/harness-client.mjs:5-15`，基类默认 `'im'` `:990`），rpcId 形如 `prefix-uuid`（`:1063`），steer 为 `prefix-steer-uuid`（`:1697`）。
- **实测**（4 个 IM 会话日志里 `user/message.data.source`）：
  - feishu：`{"kind":"user","rpcId":"feishu-96f268b6-…","clientTimeZone":"Asia/Shanghai"}`
  - weixin：`{"kind":"user","rpcId":"weixin-42af27d1-…",…}`
  - 对照：DSH Web 客户端发的消息 `rpcId` 是**裸 uuid**（实测本仓会话 `session-f7e47b03…`：`{"kind":"user","rpcId":"6bed82a4-…"}`）
- dsh-im 自己就靠它判「这条输入来自 IM 还是 DSH」：`plugin-src/host/session-sync-coordinator.mjs:30` `consumeDshImInputOrigin(scope, source.rpcId) ? 'im' : 'dsh'`；标题前缀模块也读它：`session-title-prefix.mjs:6,24`。
- ⇒ 边界：**只到渠道级**（`feishu-*`），永远不含 botId；且那个 `imInputOrigins` registry 是模块内 Map（`harness-client.mjs:127-169`），**未暴露成 DSH 服务**，别的插件拿不到；能拿到的只有**落盘事件**里的 `source.rpcId`（要读会话日志，成本远高于读 state.json）。
- 用途定位：可作为「这是不是某渠道的会话」的**辅助校验**（对不上就说明归属表陈旧），**不能**替代 state.json。

### 5.4 会话标题前缀

- dsh-im 5.1.0 在宿主装了标题装饰器（`plugin-src/host/index.mjs:25,138` 调 `installSessionTitlePrefix`）：读最新 `session/title`，按渠道加 `标签 · `（`session-title-prefix.mjs:31-38`，label 表 `src/channels/shared/session-channel-labels.mjs:1-14`：飞书/微信/钉钉/企业微信/QQ/…/AI Office），并**以同 source 追加一条新 `session/title` 事件**（`:77-80`，避免 `rename` 抢占用户标题）。
- **实测**：`session/title` 事件成对出现 —— `fallback:hello` → `fallback:飞书 · hello`；`provider:Greeting` → `provider:飞书 · Greeting`（微信同构「微信 ·」）。
- ❌ 不能作归属：**只有渠道、没有 bot**；标题可变（用户改名、LLM 重生成）；老会话可能没有前缀（装饰器 5.x 才有）；前缀可被用户手动加。✅ 可作「渠道级」旁证/展示用。

### 5.5 `agentPreset`

- 会话头里有 `agentPreset`（实测 4 个 IM 会话全是 `"standard"`）；dsh-im 建会话时 `agentPreset = workspaces.agentPresetFor(botId)` 再传给 `session.create`（`bot-workspace-store.mjs:1934-1962`；`harness-client.mjs:1343-1359` 仅非空才带）。
- ⇒ 是**bot 级配置**，但：默认就是 `standard`（本机 3 个 bot 都是），且用户可给多个 bot 配同一个预设 ⇒ **不唯一**。只能当「该 bot 配了什么预设」的**校验**，不能当归属键。

### 5.6 `cwd` / 工作区

- 会话头有 `cwd`（实测）；`workspaces.json.workspaces[botId]` 是 bot 的默认工作区，`conversationWorkspaces` 还能按 conversationKey 覆盖（`bot-workspace-store.mjs` 的 `conversationWorkspaceFor`）。
- **决定性反例（实测）**：feishu `bot_253f13…` 的会话 cwd = `D:\dsh-plugin\dsh-opencode-palette`，**微信 `wx_d3c34f…` 的会话 cwd 也是** `D:\dsh-plugin\dsh-opencode-palette` —— 两个不同渠道、不同 bot 共用同一 cwd。⇒ `cwd` 无法唯一确定 bot（连渠道都定不了）。

### 5.7 `origin`

见 §5.2：当前只有 `'subagent'`，dsh-im 不写 ⇒ 无信号。

---

## 6. 对实施规格的直接含义（建议契约）

1. **唯一归属来源**：`<DSH_HOME>/integrations/dsh-<channel>/{bots|accounts}/<botId>/state.json` 的 `sessions`；渠道目录白名单由「`integrations` 下真实存在 + `/^[a-z0-9-]{1,32}$/`」决定，不要硬编码全部渠道（office 无 state）。
2. **只读 `sessions`**：不解析 `contextTokens`/`recentOutboundMessages`（微信文件里有凭据与正文）；不因 `version !== 1` 拒绝；`sessions` 值必须 string 且非空。
3. **反向索引**：`sessionId → Binding[]`；缓存键 `(path, mtimeMs, size)`；命中即返回，miss 才重扫；负数短 TTL（≤2s）。
4. **fail-soft**：所有 `readdir/stat/readFile/JSON.parse` 包 `try/catch`；失败沿用上次成功索引；任何情况下**不抛**、不改控制流（与日志三条红线一致）。
5. **时机**：在 `systemPrompt.context` 回调里按 `assembly.agent.session.id` 查；**不要**依赖 `session/created`（早于写盘）。
6. **1:N**：>1 条绑定时取 mtime 最新的 state.json 所属 bot，并记 `warn`；或返回 null 走默认人设（须在规格里二选一并写明理由）。
7. **接缝**：`(channel, botId)` → homes.yaml 的 `assistants[]`（`channel`+`botId` 精确匹配，`status==='bound'`）→ 人设；botId 变了（解绑重绑）自动跟随，无需迁移。
8. **不要**：解析 conversationKey 语义、依赖标题前缀、依赖 cwd、依赖 agentPreset、读会话日志。
9. **复用**：`src/host/routes.ts` 的 `parseSessionsText`（可直接 import），但路径枚举需新增 weixin `accounts/` 分支；建议新建 `src/host/session-ownership.ts` 保持 routes 不动（§1-① 自包含 + 可移除性）。
10. **可测试**：`tools/verify` 已有「临时 dshHome 真落盘」的范式（`tools/verify/log-pipeline.ts:174-179`、`tools/verify/features/detail-drawer.ts:589-600`），归属模块应提供纯函数 `parse(text, channel, botId)` + `buildIndex(files)`，夹具写 4 个 tmp state.json 即可覆盖 feishu/weixin/legacy/坏文件。

---

## 7. 未证实 / 风险清单

1. **删 bot 是否整目录删除** `bots/<botId>/`：只确证 `deleteState()` 删文件（`feishu/production.mjs:287-294`；weixin `:190-201` 先 `state.remove()` 再 `unlink`）；目录清理未逐行读完。
2. **断连/登出是否清 sessions**：未找到代码，**推断**不清；未做断连实测。
3. **1:N 实际发生率**：代码路径允许（§1.5），未构造真实双绑定复现。
4. **重启后映射仍在**：结构上确定（唯一持久层），未真跑重启。
5. **Windows `rename` 覆盖的原子性**：Node 文档语义 + 上游依赖，未做并发压测（读到半文件的风险实测未出现）。
6. **多 profile 共用同一 DSH_HOME**：本机仅 desktop 挂 dsh-im；若 web profile 也挂，会有两个写者（`#writeQueue` 只在进程内）⇒ 潜在丢更新，本需求（只读）影响有限。
7. **feishu legacy 根 `state.json`**：本机不存在；读取顺序按本仓 `routes.ts:103-104`「per-bot 先入、legacy 只补缺」。
8. **微信账号的显示名**：`config.json.accounts[]` 无 `botName`（实测），面板名从哪来未追（可能来自 companion homes.yaml）。
9. **`LEGACY_SESSION_ID` 兜底**（`session-title-prefix.mjs:7,28`）形如 `^(channel)-.+`，而实测 IM 会话 id 是 `session-<uuid>`（由 `dsh-api-session-controller/lib/index.js:509` `session-${randomUUID()}` 铸造）⇒ 该兜底对现代会话**失效**（推断，未找到产生 `<channel>-…` id 的现路径）；不影响 companion（我们不靠 id 前缀）。
10. **state.json 未来版本**：当前 `version` 只写不读；若 dsh-im 升级改成读/迁移，语义可能变（风险，需在规格里注明「只读 sessions，宽容未知键」）。

---

## 8. 复现方法（命令与产物）

- asar 解包（自写，`D:\Temp\t2-session-ownership\asar.mjs`）：头 `offset 12` 的 `uint32LE` = header JSON 字节数；JSON 从 `offset 16` 起；**数据起点 = 16 + headerSize**（不是 8 + headerSize）；条目 `offset` 相对数据起点。本机 18,309 条。
- 已展包：`dsh-session`、`dsh-session-persistence-jsonl`、`dsh-system-prompt`、`dsh-fs-sandbox`、`dsh-home-paths`、`dsh-agent`、`dsh-fs`、`dsh-api-session-controller`、`dsh-scope`、`cordis`、`dsh-session-title`。
- 会话日志解压（`D:\Temp\t2-session-ownership\probe-sessions.mjs`）：按 zstd 魔数 `28 B5 2F FD` 切帧后逐帧 `zlib.zstdDecompressSync`；第一帧即会话头。
- 归属表枚举（`probe-ids.mjs`）：遍历 `integrations/dsh-*/{bots,accounts}/*/state.json`，打印 `{channel,botId,key,sessionId}`（脱敏）。
- 版本：`/dsh/package.json` = `@deepseek-ai/dsh-desktop-runtime 0.2.1-rc.2`；`dsh-im/package.json` = `@xmanrui/dsh-im 5.1.0`，`dsh.compatibility.dsh = 0.2.1-rc.2`。

---

## 9. 一手来源索引

| 主题 | 位置 |
|---|---|
| feishu 路径/state 存取/删除 | `dsh-im/plugin-src/host/channels/feishu/production.mjs:85-97,150-169,173-190,287-294`；`src/channels/feishu/state-store.mjs:2,5-14,37-57,79-96,203-213` |
| weixin 路径/state | `dsh-im/plugin-src/host/channels/weixin/production.mjs:40-49,118,190-201`；`src/channels/weixin/state-store.mjs:9-21,169-186,266-269` |
| 写盘时序 | `dsh-im/src/channels/shared/workspace-session.mjs:92-205`（关键 `:120-146,184`） |
| 建会话参数 | `dsh-im/src/channels/shared/harness-client.mjs:1343-1359`；`src/channels/shared/bot-workspace-store.mjs:1934-1962` |
| 清空/重绑 | `bot-workspace-store.mjs:770-804,1003-1087,1089-1201,1212-1232,1354-1392,2383-2431,1781-1929`；`feishu/bridge.mjs:1845-1853,2842,3017-3023`；`weixin-bridge.mjs:822`；`src/channels/shared/clear-command.mjs:31-35,77` |
| 文档版本常量 | `bot-workspace-store.mjs:41-43,247-337,1405-1427` |
| conversationKey | `src/channels/feishu/message-utils.mjs:25-29,56-84`；`src/channels/weixin/weixin-bridge.mjs:123-124` |
| 事件/头/列表 | `dsh-session/lib/index.js:1227-1229,1332-1346,1818-1837,1901-1923`；`dsh-api-session-controller/lib/types/list.js:101,319-325,620`；`dsh-api-session-controller/lib/index.js:509`；`cordis/src/events.ts:165-175`；`dsh-scope/README.zh.md:42,75` |
| 沙箱 | `dsh-fs-sandbox/README.md:12,64`；本仓 `src/host/log.ts:8-9,14,42`；`dsh-home-paths/README.md:34-41` |
| 渠道级信号 | `dsh-im/plugin-src/host/session-title-prefix.mjs:1-38,57-122`；`src/channels/shared/session-channel-labels.mjs:1-28`；`plugin-src/host/session-sync-coordinator.mjs:30`；`harness-client.mjs:5-15,990,1063,127-169,1697` |
| 本仓既有读盘 | `src/host/routes.ts:1-119`；`src/index.ts:53`；`src/host/rpc.ts:73`；`tools/verify/log-pipeline.ts:174-179`；`tools/verify/features/detail-drawer.ts:589-600` |
| 持久化格式 | `dsh-session-persistence-jsonl/README.md`（On-disk layout / Durability / 帧结构）；`lib/index.js:898-943` |
