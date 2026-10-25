# 取证 · 助理人设载体：dsh-im 上下文增强（guidance）的真语义与机器人级身份表

> 日期：2026-10-22 · 性质：只读取证（唯一写入＝本文件；未改源码/其它 docs、未跑构建、未 git 操作、未写真机数据）
> 上游基线：**dsh-im 5.1.0**，`C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@xmanrui\dsh-im`（下称「包根」；`package.json:3` 实读版本）
> 宿主基线：DSH 0.2 系 asar，`D:\DeepseekHarness\resources\app.asar\dsh\node_modules\@deepseek-ai\*`（本笔记引用的宿主源码已抽出到 `D:\Temp\ctx-research\{system-prompt,agent-loop,presets,persona}\`）
> 本仓基线：`dsh-im-companion` 0.2.19（本仓 `package.json:3`），`dshImCompat.verified=4.39.0`（`package.json:4-7`）
> 一句话：**guidance 是「用户消息内容里的增强提示词」，不是系统提示词、不是人设槽位**；机器人级唯一能装自由文本的就是它。真要 system-prompt 级人设，载体是 `agentPreset` 里挂的 `@deepseek-ai/dsh-persona`，不是上下文增强。

## 结论先行（12 条）

1. **新版配置是双层 scope**：`contextEnhancement = { group:{enabled,fields,guidance}, direct:{…} }`，两个 scope 各三个**精确键**、群聊/私聊互不共用 —— 源码 `src/channels/shared/context-enhancement.mjs:39-54,100-108`；官方 `docs/上下文增强.md`（v5.1.0）原文「两个场景互不共用配置」。
2. **legacy 平铺四键只在「读盘装载」时被迁移，RPC 不做迁移**：`groupEnabled/directEnabled/fields/guidance` 会被复制成 group+direct 两份（`context-enhancement.mjs:110-126`），但只由 `normalizeContextEnhancementConfig`（`:129-139`）在 store 装载时调用（`src/channels/shared/bot-workspace-store.mjs:289-298`）；写入端点用**严格校验**，legacy 直接拒（`plugin-src/host/channels/shared/context-enhancement-rpc.mjs:5-17`）。
3. **guidance 不是系统提示词**：官方文档原文「来源与提示词都属于**用户消息内容**，不修改 Harness、系统提示词或权限」（`docs/上下文增强.md`，v5.1.0 tag）；源码侧 Host 只把它注册成 `systemPrompt.context`（order 125），最终落地为模型历史里一条 **`runtime-context` 来源的 user 角色消息**（包根 `plugin-src/host/injected-context.mjs:72-78`；宿主 `dsh-system-prompt/lib__index.js:136-155`；`dsh-agent-loop/lib__index.js:334-349`）。
4. **消息内联块与快照双轨，靠文本相等去重**：渠道把 guidance 包成 `<dsh_im_source_guidance>…</dsh_im_source_guidance>` 内联在用户消息前（`context-enhancement.mjs:336-342,356-373`）；Host pre-step 若 registry 里该会话的 guidance 与内联块**逐字相等**就把内联块删掉（`plugin-src/host/injected-context.mjs:93-111` + `src/channels/shared/injected-context.mjs:414-417`），拆分失败则保留内联块（同上 `:104-108`）。
5. **快照只在文本变化时追加，旧快照不删**：只有该会话的 guidance 渲染文本改变才 append 一条新 user 消息，清空时 append CLEARED 文案（`dsh-agent-loop/lib__index.js:219,334-349`；注册表空文本即清会话：`src/channels/shared/im-source-guidance.mjs:26-41`）⇒ 改人设是「往后追加覆盖声明」，压缩前旧人设仍在历史。
6. **本仓写路径对 5.1.0 必失败（源码确证，非推断）**：`applyPersonality` 发的是 legacy 四键（`src/features/detail-drawer/actions.ts:22-33`），上游 RPC 载荷校验要求恰好 `{botId, config:{group,direct}}`，失败即回「请提交有效的上下文增强设置。」（`rpc.mjs:96-99`）；同理开关写 `ctxPayloadFor`（`data.ts:166-177` → `drawer.ts:166`）。
7. **本仓读路径对 5.1.0 也失真**：`normalizeUpstreamCtx` 只读平铺 `groupEnabled/directEnabled/fields/guidance`（`src/client/data/fleet-api.ts:92-102`），而上游 `decorateStatus` 返回新形状（`bot-workspace-store.mjs:541-546,1308-1325`）⇒ 抽屉恒显示「双关、字段空、引导词空」，`personalityPrefill` 恒空（`data.ts:101-104`），读守卫（`undefined` 才禁写）被「全 false」绕过。
8. **机器人级身份表共 9 张，全部以 botId 为键、跟机器人走不跟目录走**：workspaces / agentPresets / models / aliases / busyMessageModes / contextEnhancement / deliveryTargets / accessPolicies / conversationWorkspaces（`bot-workspace-store.mjs:405-429`，落盘参数 `:1405-1413`）；`bot.delete`/退出活跃账号集合时 9 张全删（`:1354-1392`，`reconcile` `:1289-1306`）⇒ **人设写进 dsh-im bot 表不随助理身份迁移**。
9. **bot 级唯一能装自由文本的字段是 `contextEnhancement.guidance`**（上限 8000 字符，`context-enhancement.mjs:26,78-97`；其余 9 个字段是白名单枚举，`:2-5,86-88`；其它表都是路径/枚举/结构化 config：`agent-preset.mjs:4,18-27`、`bot-alias.mjs:2,4-10`、`model-setting.mjs:26-46`、`access-policy.mjs:107-145`）。
10. **真正 system-prompt 级的机器人级载体是 `agentPreset`**：dsh-im 把 bot 的 `agentPreset` 作为 `session.prompt` 的 `payload.agentPreset` 传给 DSH（`src/channels/shared/harness-client.mjs:1344-1353`）；preset 是 Cordis YAML 的插件行列表（`@deepseek-ai/dsh-agent-preset/README.zh.md:28-48`），可在其中挂 `@deepseek-ai/dsh-persona`（`config.prefix` 必填、`suffix`、`complete`、`includeRuntimeContext`，`README.zh.md:30-49`；`lib/index.js:23-48`），它按 order 0 / 10200 遮蔽部署 persona 段落 ⇒ 每个 bot 选不同 preset＝每个助理不同 system-prompt 人设。
11. **preset 路线的三个硬约束**：preset 注册表不扫描目录、**没有 YAML 写回接口**，新增/覆盖只能 bundle patch（`dsh-agent-preset-registry/README.zh.md:48`）；改动**只影响之后创建的 Agent**，已有 Agent 保留旧组合（`README.zh.md:60,93`；`dsh-agent-preset/README.zh.md:12`）⇒ 人设改完「新会话才生效」。
12. **工作区级另有文本载体**：DSH 默认加载 `$DSH_HOME/AGENTS.md` + 工作区 AGENTS.md/CLAUDE.md 指令链，作为「带来源 `user/message` 持久基线」注入（`@deepseek-ai/dsh-agent-instructions/README.zh.md:12,30,34,88`），per workspace **不 per bot** ⇒ 同工作区多机器人共享，做不了机器人级人设。

## 证据与细节

### 1. 上游实体：字段白名单、双层 scope、8000 上限、精确键校验

- 字段白名单（9 个，5.1.0 源码）：`channel, conversationType, senderId, senderName, conversationTitle, chatId, threadId, botId, sentAt`（包根 `src/channels/shared/context-enhancement.mjs:2-5`）。注意官方文档仍写「八个可选字段」且不含 `sentAt`（`docs/上下文增强.md`），而 UI 已提供 `sentAt`（`plugin-src/client/context-enhancement.js:23,43-45,144`）——文档滞后，以源码/UI 为准。
- 默认值：group/direct 各 `{enabled:false, fields:['senderId'], guidance:''}`（`:39-50`）。
- 校验：scope 必须**恰好** `enabled/fields/guidance` 三键（`:78-81`），`enabled` 布尔（`:83-85`）、`fields` 每项必须在白名单（`:86-88`）、`guidance` 字符串且 `length<=8000`（`:89-91`）；`guidance.trim()` 为假则归零为 `''`（`:95`），fields 会按白名单顺序重排去重（`:94`）。
- 配置必须**恰好** `group+direct` 两键（`:100-108`）；旧四键只有迁移函数认（`:110-126`）。
- 语义上限：guidance 是「当前场景非空才包裹」；字段全部取消时不生成来源块（`enhanceContextContent` `:356-373`，官方文档同句）。

### 2. guidance 从「消息前缀」到「会话快照」的完整链路

1) 采集：每渠道 `#preparePrompt` 在**消息被接收时**抓 `captureContextEnhancement`（`context-enhancement.mjs:142-158`；队列消息保留接收时的配置，`:225-231` 注释原文），只读当前会话类型的开关；关即返回 null。
2) 内联：`enhanceContextContent` 把 `<dsh_im_source>` 来源块 + `<dsh_im_source_guidance>` 引导块用 `\n\n` 拼在用户内容前，字符串或 content 数组都支持，异常吞掉退回原内容（`:356-373`）。
3) 发布：`harness-client` 在 `session.prompt` 前调用 `imSourceGuidance.publish(sessionId, options.sourceGuidance)`（包根 `src/channels/shared/harness-client.mjs:2011-2016`；注释明说「让 Host 每 Session 物化一次，而不是每条用户消息都带」）。
4) 会话注册表：模块级单例，按 sessionId 存，非字符串/空文本都会先 delete（`im-source-guidance.mjs:31-41`），超过 1024 会话淘汰最旧（`:20,38-40`）；`agent/disposed` 时 forget（`plugin-src/host/injected-context.mjs:88-91`）。
5) 宿主注册：`systemPrompt.context({name:'dsh-im:source-guidance', order:125, text:(assembly)=>registry.get(assembly?.agent?.session?.id) ?? ''})`（`plugin-src/host/injected-context.mjs:11,14,72-78`）——注释「follows the policy facts」。
6) 宿主渲染：`renderContextSections` 逐条取文本、`joinContextSections` 非空时加固定前缀 `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.`（`dsh-system-prompt/lib__index.js:136-155`）；consume 时 `RuntimeContextProjection.project` 文本不变→不产消息，变了→`createUserMessage({source:{kind:'runtime-context',form:'snapshot',sections}})`（`dsh-agent-loop/lib__index.js:334-349`）；清空→CLEARED 文案（`:219`）。
7) 去重：pre-step 全局监听在 `next()` 后调 `rewriteInjectedContextMessages`，把 `form==='instructions' && value===ownedGuidance` 的内联块过滤掉（`plugin-src/host/injected-context.mjs:93-111`；splitter `src/channels/shared/injected-context.mjs:241-256,400-424`）；异常只 warn、保留内联块（`:104-108`）。

**由此得到的真语义**：guidance 是「发在用户消息里的指令文本」；Host 为了省 token 把它收敛成每会话一份的运行时快照（仍是 user 角色、带来源），并删掉每条消息里的重复内联块。它既不进 system prompt，也不改工具/权限；官方文档与源码一致。

### 3. 官方文档怎么说（v5.1.0，仓库 tag；包内未随发 `docs/上下文增强.md`）

- 「点击保存后**原子生效**」「两个场景**互不共用**配置」「插件只发送当前场景勾选且当前消息已有的值，不查询平台 API 补全」「微信当前只支持私聊」。
- 「升级前已经保存的共用字段与增强提示词会自动复制到群聊、私聊两份配置……**升级后的首次读取不会改写配置文件**；之后任意一次机器人设置成功保存时，会随现有设置写入机制自动落盘为新结构」——与源码 `normalizeContextEnhancementConfig` + 保存时写新形状完全对应。
- 最关键一句：「来源与提示词都属于**用户消息内容**，不修改 Harness、系统提示词或权限……关闭只停止后续附加，不删除已经写入的历史。」
- README 定位：「上下文增强 | 从机器人卡片打开设置，分别决定群聊、私聊是否增强；两个开关默认均关闭，旧机器人升级后也不会自动开启」（`README.md:175`）；另 `README.md:302` 提到 v4 的 `plugin:dsh-im` 来源与「会话级引导词去重沿用原有机制」。

### 4. 落盘与 RPC：为什么本仓的 legacy 写法不再等价

- 路径：每渠道一份 `<DSH_HOME>/integrations/dsh-<channel>/workspaces.json`（`plugin-src/host/channels/shared/production.mjs:35,39`；feishu `:89,95` 等同构）。本机抽查 `C:\Users\辰辰洋洋\.dsh\integrations\dsh-feishu\workspaces.json`：3 个 bot、`version:2`、**没有 contextEnhancement 段**（缺席＝默认全关），故未能观察真实新形状落盘样本。
- RPC 端点：`bot.context-enhancement.set`（`context-enhancement-rpc.mjs:3`）；载荷必须恰好两键 `{botId, config}`，`botId: /^[A-Za-z0-9_-]{1,128}$/`，`config` 过 `validateContextEnhancementConfig`（同文件 `:5-17`）。宿主分发表 `shared/rpc.mjs:29`（映射）、`:96-99`（校验 + 中文错误）、`:200-202`（转 `controller.updateContextEnhancement`）；飞书 `feishu/rpc.mjs:471-474,793-798` 同构。
- 控制器/存储：`updateContextEnhancement` 先 `validateContextEnhancementConfig(value)`（`bot-workspace-store.mjs:2324`），成功后 `setContextEnhancement` 再校验一次（`:936`）、incarnation 校验（`:938`）、`await #persist` 成功后才改内存（`:943-947`）；`projectStatus` 在提交前算完（`:2344-2347`），失败不发布新运行配置。
- **结论**：legacy 四键过不了 RPC 的严格校验。上游 5.1.0 对「读旧盘」容忍、对「写旧形状」不容忍；本仓两条写路径（性格 `actions.ts:30-33`、开关 `drawer.ts:157-166`）都走旧形状 ⇒ 均被拒。版本门也帮不上：本仓 `dshImCompat.range = ">=4.17.1 || <=4.17.0"`（`package.json:7`）是一个**恒真**表达式，不会挡 5.1.0。

### 5. 本仓现状逐条对照（均读自本仓工作区）

| 位置 | 现在做什么 | 对 5.1.0 的实际结果 |
|---|---|---|
| `src/features/detail-drawer/actions.ts:22-35` | 性格文本 `.trim().slice(0,8000)`，读 `b.ctx` 平铺值，写 `{groupEnabled,directEnabled,fields,guidance}` | RPC 拒收（见 §4）；toast 报「写入失败：请提交有效的上下文增强设置。」 |
| `src/features/detail-drawer/data.ts:166-177` | 开关读-改-写，仍是四键全量回填 | 同上被拒；修好形状前「防盲写」守卫形同虚设 |
| `src/client/data/fleet-api.ts:24-29,92-102` | `UpstreamCtx` 平铺；只读 `groupEnabled/directEnabled` | 上游新形状下恒为 `false/false/[]/''`，抽屉/欢迎横幅全部误判为「未开启」 |
| `src/client/data/fleet-api.ts:142` | 状态回流时归一 | 同一条快照：`contextEnhancement` 是 `{group,direct}` 对象被当平铺读 |
| `src/features/welcome-banner/data.ts:236-240` | 用 `groupEnabled`/`directEnabled` 判「增强开着吗」 | 恒 false ⇒ 相关引导/横幅逻辑失效（只读展示，危害较小） |
| `src/features/detail-drawer/data.ts:101-104` | prefill：各渠道 guidance 去重后唯一才回填 | 恒空，用户每次重打性格；且「读不到就不写」的守卫被「假 false」绕过 |
| `src/client/data/rpc.ts:62-88,123-129` | 载荷原样转发（`/api` + `dsh-im<channel>`） | 本仓不改写载荷，确认 legacy 直达上游 |

### 6. 机器人级身份表（9 张表，botId 为键；「能否承载人设文本」列是本笔记的判断）

出处：`bot-workspace-store.mjs:405-429`（字段）、`:1405-1425`（落盘九段）、`:1308-1325`（status 装饰）。

| 字段 | 值形状/校验 | 承载人设文本 | 生命周期要点 |
|---|---|---|---|
| `workspaces` | 绝对路径（`:250-256`） | 否（路径） | `ensure()` 给新 bot 补默认；`bot.delete` 删 |
| `agentPresets` | preset id `/^[a-z0-9][a-z0-9-]*$/`（`agent-preset.mjs:4,18-27`） | **间接可**：preset 里挂 `dsh-persona` 才有文本 | `bot.delete` 删；改 preset 只影响之后创建的 Agent |
| `models` | `{provider,model,reasoningEffort?}`（`model-setting.mjs:26-46`） | 否 | `bot.delete` 删 |
| `aliases` | ≤80 字符、无控制字符（`bot-alias.mjs:2,4-10`） | 否（展示名） | `bot.delete` 删 |
| `busyMessageModes` | 枚举（`:536-539`） | 否 | `bot.delete` 删 |
| `contextEnhancement` | `{group,direct}×{enabled,fields,guidance}`（`:39-54,100-108`） | **是**：guidance ≤8000 字符 | `bot.delete` 删；不随助理/工作区迁移 |
| `deliveryTargets` | 结构化路由（`normalizeDeliveryTarget:134-172`） | 否 | `bot.delete` 删 |
| `accessPolicies` | 严格 `{direct,group}` 访问策略（`access-policy.mjs:107-145`） | 否 | `bot.delete` 删 |
| `conversationWorkspaces` | 会话级工作区覆盖（`:111-132`） | 否 | 改绑不清（既有笔记 §7 已证） |

补充：bot 名/头像来自平台账号（不在 store）；aliases 可覆盖展示名。**结论**：只有 `contextEnhancement.guidance` 与 `agentPreset→preset 内 dsh-persona` 两条机器人级「人设」通道，前者是用户消息内容、后者是系统提示词。

### 7. system-prompt 级载体选项（宿主源码确证部分）

- `@deepseek-ai/dsh-persona`：**只能挂在 preset 组装内**（agent scope），`config.prefix` 必填、`suffix` 默认空、`complete` 可用前缀替代完整系统提示词、`includeRuntimeContext:false` 可关可选运行时上下文（`README.zh.md:12,28-49,65,95-99`；`lib/index.js:19-48`）。它遮蔽 `deployment:persona-prefix`（order 0）与 `deployment:persona-suffix`（order 10200）（宿主 `dsh-system-prompt/README.zh.md:48-49,140`；`lib__index.js:279-281` 注册接口）。挂全局会与注册表自带 persona 冲突并报错（`README.zh.md:28,69`）。
- `@deepseek-ai/dsh-agent-instructions`：默认 `maxBytes=65536`，加载 `$DSH_HOME/AGENTS.md` → `<agentsHome>/AGENTS.md` → 项目根到 cwd 的 AGENTS.md/CLAUDE.md 链（`README.zh.md:30,34,38-40`）；「工作区指令是持久的对话内容，按 agent 与会话分别归属……普通带来源 `user/message` 事件」（`:88`）⇒ 也不是 system prompt，且 per workspace。
- 部署级 persona：`dsh-system-prompt` 自己的 `personaPrefix/personaSuffix` 配置（`README.zh.md:48-49`），全局唯一，做不到 per bot。
- 宿主侧快照机制再确认：`systemPrompt.context` 的值变化才 append（`dsh-agent-loop/lib__index.js:334-349`），快照消息排在 claimed 用户消息之后、每步最多一条（`:1043-1074`）；压缩是唯一遮蔽旧快照的机制（推断见 §9-7）。

### 8. 复用仓内既有笔记（只记路径＋一句话，不粘全文）

- `docs/research/排查-上游工作区归属模型与解绑语义.md` —— botId 为键的 9 张表跟机器人走、`bot.delete` 彻底删；本次源码复核仍成立（并补：`reconcile` 在 bot 退出活跃账号集合时就地删，`:1289-1306`）。
- `docs/research/T3-家助理数据模型与命名回落规格.md` —— 助理是 companion 自有稳定身份（id 与 botId 解耦），故「人设」若绑定助理，必须显式同步到某个上游载体，否则 bot 删除/换号即丢。
- `docs/research/T1-工作区创建绑定取证.md` —— 工作区真源是 DSH workspace registry，bot.workspace 只是上游指针；人设若走 AGENTS.md 属于「家/工作区」而非「机器人」。
- 未发现既有笔记对上述结论构成反证；`docs/research/INDEX.md` 未改动。

## 未证实 / 边界

1. **未真机调用 RPC**：§4「legacy 必被拒」来自源码严格校验与错误文案，未实际发一次 `bot.context-enhancement.set` 验证回包；建议真机用一次旧载荷复现（应见「请提交有效的上下文增强设置。」）。
2. **未读 4.39.0 源码**（本机只装 5.1.0）：本仓 `dshImCompat.verified=4.39.0`，推断 4.x 接受 legacy 四键（否则本仓写路径当年不可能工作），但没有 4.39.0 包可比对。
3. **新形状真实落盘样本缺失**：本机 feishu `workspaces.json` 无 `contextEnhancement` 段（默认全关），未观察到 group/direct 双段落的实际 JSON。
4. **文档与源码字段数不一致**：官方文档说 8 字段（不含 `sentAt`），5.1.0 源码/UI 有 9 字段且 `sentAt` 仅微信提供（UI 说明 `context-enhancement.js:43-45`）；以源码为准，文档可能滞后。
5. **排队/跨设置变更的共存**：消息接收时抓旧 guidance 内联、派发时 publish 新 guidance，则同一请求里可能同时出现「旧内联块」（不等新 registry 值，不会被去重）与「新快照」；为源码推断，未实测对模型的实际影响。
6. **preset 内挂 `dsh-persona` 未实机验证**：本机 profile 是否已有可用 preset 定义、bundle patch 的具体写法未取证；已证的是「preset 行列表可挂任意插件行、persona 行要求 agent scope」。
7. **压缩后快照 repatriation 未实测**：`RuntimeContextProjection` 从最新会话事件恢复 retained，若旧快照被压缩移出 surface 则 retained 为空、下步会重新 append 当前快照（推断）；实际压缩行为需真机。
8. **关闭增强的「清除」只在下一次 prompt 派发时发生**：`publish` 只在 prompt 前调用；关闭后若无新消息，旧快照仍在历史里（源码路径确定；「模型是否继续照做」未实测）。

## 对「助理人设载体」决策的含义

**被排除的选项**
- 把 `guidance` 当 system prompt / 当助理「身份」：官方语义＋快照落地均证明它是用户消息内容，不能改系统提示词、权限、工具（§1-3、§7）。它只能做「IM 消息里的行为引导」。
- 继续以 legacy 四键写上游：5.1.0 RPC 必拒（§4-5），且读法会误判为「全关」导致 prefill 空、守卫失效。
- 只把性格存 companion 自己的 `meta.json`：不落到任何模型可见载体＝不生效；若同时写上游又自持一份，则违反本仓「dsh-im 是唯一真源、不自持第二账本」的第一性原则（`data.ts:1-5` 自述）。

**被支持的选项（按语义强度排序）**
1. **要「真·助理人设」（进 system prompt、稳前缀、可区分群聊/私聊以外维度）** → 用 `agentPreset` 选择 + preset 里 `dsh-persona` 行。dsh-im 已有 per-bot `agentPreset` 写端点（`setAgentPreset`，store `:830`；本仓 `presetPayloadFor` `data.ts:157-163`）。代价：一人设一 preset、preset 只能 bundle patch（无写回 API）、只影响新 Agent（§7）。
2. **要「IM 内即时可改的轻量引导」** → `contextEnhancement.guidance`，但必须：① 改成新形状 `{group:{enabled,fields,guidance},direct:{…}}` 并**同时**决定两 scope（一段文本＝两 scope 同值，会拉平群聊/私聊，与「互不共用」的产品语义有张力）；② 明确告知用户「这是用户消息级引导，不是系统提示词」；③ 写入前确保对应 `enabled` 为真，否则保存成功但不生效；④ 读路径同步支持新形状，恢复 prefill 与防盲写；⑤ UI 文案「新会话生效」应改为「下一条消息生效」（`actions.ts:40`；guidance 快照在下次 prompt 即追加，preset 才是新会话生效）。
3. **人设属于「家/工作区」而非机器人** → 工作区 `AGENTS.md`（`dsh-agent-instructions`），用户可读可编辑、DSH 原生加载；代价：同工作区多 bot 共享、所有会话（含非 IM）都带，不是 bot 级（§7）。
4. **companion 侧展示/编排层**：人设文本可留在 companion 的助理记录里作为「编辑草稿/展示」，但必须单向落盘到上面某一个真源；不新增第二份可写账本。

**下一步取证（若要落地）**：真机发一次新形状 RPC（确认 5.1.0 接受与回包形状）→ 跑一条飞书私聊看快照消息是否出现在会话历史（`Current runtime context...` 前缀 + guidance 原文）→ 再发一条看内联 guidance 块是否被删（去重生效）。这是本笔记唯一没做的真机验证。

## 参考来源清单

**上游 dsh-im 5.1.0（包根 `C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@xmanrui\dsh-im\`）**
- `package.json:3`（version 5.1.0）
- `src/channels/shared/context-enhancement.mjs`（字段/默认/校验/迁移/采集/内联）
- `src/channels/shared/bot-workspace-store.mjs`（9 张表、getter/setter、decorateStatus、retire、RPC 控制器）
- `src/channels/shared/im-source-guidance.mjs`（会话注册表、order 125、8000/1024）
- `src/channels/shared/injected-context.mjs`（标签拆分、instructions 去重）
- `src/channels/shared/harness-client.mjs:1344-1353,2011-2016`（agentPreset → prompt；guidance publish）
- `plugin-src/host/channels/shared/context-enhancement-rpc.mjs`、`shared/rpc.mjs:29,96-99,200-202`、`shared/workspace-rpc.mjs:28`、`feishu/rpc.mjs:471-474,793-798`
- `plugin-src/host/channels/shared/production.mjs:35,39`（workspaces.json 路径）
- `plugin-src/host/injected-context.mjs:11,14,72-78,88-91,93-111`（宿主 context 注册与去重）
- `plugin-src/client/context-enhancement.js:23,43-45,144,183,192,272-288,391-415`（UI/校验/8000 输入框）
- `src/channels/shared/{agent-preset,bot-alias,model-setting,access-policy}.mjs`（校验器）
- `docs/上下文增强.md`（仓库 tag v5.1.0，包内未随发；本文引用原文均来自该版本）
- `README.md:175,210-212,302`

**宿主 DSH 0.2 系（asar `D:\DeepseekHarness\resources\app.asar\dsh\node_modules\@deepseek-ai\`）**
- `dsh-system-prompt/README.zh.md:48-49,56,68,100,140,154,177`；`lib__index.js:117-119,136-155,279-281,324-346,356-406`
- `dsh-agent-loop/lib__index.js:219,264-282,297-350,902-927,1043-1074`
- `dsh-persona/README.zh.md:12,28-49,65,69,95-99`；`lib/index.js:19-48`
- `dsh-agent-instructions/README.zh.md:12,30,34,38-40,88`
- `dsh-agent-preset/README.zh.md:12,28-48,74`；`dsh-agent-preset-registry/README.zh.md:48,60,93`
- 抽出副本（可复现）：`D:\Temp\ctx-research\{system-prompt,agent-loop,persona,presets}\`；抽取脚本 `D:\Temp\ctx-research\extract-*.mjs`（asar 8MB 头 + JSON 目录；包内文件 rel 用 `path.split('/').slice(3)` 避免不同包同名覆盖）

**本仓（`D:\dsh-plugin\dsh-im-companion\`）**
- `package.json:3-7`（0.2.19、dshImCompat verified 4.39.0、range 恒真）
- `src/features/detail-drawer/actions.ts:22-35,38-75`、`data.ts:1-5,101-104,157-163,166-177`
- `src/features/detail-drawer/drawer.ts:157-166,231`
- `src/client/data/fleet-api.ts:24-29,92-102,142`
- `src/client/data/rpc.ts:34-44,62-88,123-129`
- `src/features/welcome-banner/data.ts:236-240`
- 既有笔记：`docs/research/排查-上游工作区归属模型与解绑语义.md`、`T3-家助理数据模型与命名回落规格.md`、`T1-工作区创建绑定取证.md`
