# T6 / #166 · 注入链路最小原型 —— 结果（2026-10-22）

> 原型已**卸载**：desktop profile 的 `package.json` 与 `cordis.patch.yml` 已按备份恢复（`HASH-OK` ×2），
> `node_modules/dsh-persona-inject-proto` Junction 已删除，HMR 热卸载留下 `plugin.dispose`（11:52:51.103Z）。
> 本文件是随票回填的证据摘要；原始 JSONL 证据在 `evidence.jsonl`（533 行／本次挂载周期 8 次装载）。

## 0. 环境

| 项 | 值 |
| --- | --- |
| DSH_HOME | `C:\Users\辰辰洋洋\.dsh` |
| profile | `desktop`（本仓库 Junction，名义 pin `dsh-im-companion@0.2.19`） |
| 宿主版本 | DSH 运行时 `D:\DeepseekHarness\resources\app.asar`；node v24.21.0 |
| 本插件挂载方式 | `prototypes/persona-inject/` 作 linked 本地包 + `cordis.patch.yml` 的 `insert` 条目 → **HMR 热加载，全程未重启 DSH** |
| 注入落点 | `systemPrompt.section({ name: 'dsh-im-companion:persona-proto', order: 650, interpolate: false, text })`，后置 `ctx.inject(['systemPrompt'])` |
| 证据文件 | `prototypes/persona-inject/evidence.jsonl`（每次 text 调用一行） |

## 1. Q1 —— 每一步 system 提示词是否都含注入文本、是否留历史

### 1a. 全新会话：**成立（正面证据）**

自测方法：给原型加一个游离于真实归因之外的送达自测开关（`injectUnownedAfter` + `injectUnownedBotId`），
只对 `createdAt` 晚于阈值的会话注入；人设里埋一个**只存在于系统提示词**的随机 14 位十六进制 nonce，
要求模型把 nonce 写进 `D:\Temp\166-fresh-nonce.txt`（并禁止读磁盘找）。nonce 由程序生成、从未打印。

- 19:47:03（本地）改 patch 配置 → HMR 重载（`plugin.load` #8，pid 55992）；19:47:16 spawn 全新 subagent
  `b0709212-4c0f-4fbc-8ee5-86b323a92814`（`cwd=D:\dsh-plugin\dsh-im-companion`）。
- `evidence.jsonl`：该会话 `persona.text` 3 次（3 个 step），`action:"inject"`、`probe:true`、`callIndex` 1/2/3，
  `length:319`；`session.shape.createdAt=1792669639433`。
- 会话落盘证据：`C:\Users\辰辰洋洋\.dsh\sessions\--D-dsh-plugin-dsh-im-companion--\b0709212-4c0f-4fbc-8ee5-86b323a92814\session.v4.jsonl.zstd`
  （13 个 zstd 帧、38 事件、3 个 step）→ **`system/message` 只有 1 条**：seq 9 / turn 1 / step 1 / len 63984，
  `personaAt=116`、`nonceAt=382`；5 条 `user/message` 里 nonce 出现 **0 次**（人设正文也没有作为 user 快照出现）。
- 程序比对：personas 里的 nonce == 模型写出的文件内容 → **MATCH true**（len 14/14）。
- 模型自报（assistant/message，seq 34）：我的系统提示词开头确实带有「## 助理身份：注入送达自测助理F」这一段，
  其中包含一条写入口令的指令，以及一个 14 位十六进制口令 `b7f822419d9f81`。

⇒ **结论**：全新会话的初始 system 提示词含 section 注入文本并**送达模型**；注入只进 system、不进 user 快照/历史；
每个 step 的 text 都被调用（3 steps / 3 次 inject），且会话内没有重复追加 system 消息。

### 1b. 真实 IM 会话（用户 HITL 实测）：**每步生效、无历史残留**

2026-10-22 19:58（本地）用户在飞书 bot「小婉」上 `/new` 后连发 3 条消息（「你好」「今天怎么样」「再说一句」），
会话 `session-0db20ab3-d12b-4664-95e2-ab4f8448df76`（飞书 p2p，`cwd=D:\3DeepSeekHarness\agents\xiaowan`）。磁盘日志证据：

| turn | 用户消息 | system/message | 我们的 text 调用 | 回复可见文本 |
| --- | --- | --- | --- | --- |
| 1 | 你好 | seq 8，`surfaceOp:"append"`，len 7633，`personaAt=-1`（**首条 miss，符合 T4「新会话首条可 miss」**） | call#1 11:58:59.871Z `skip-unowned` | A0 21 字符，无标记；**用户反馈这条没回复**（见下） |
| 2 | 今天怎么样 | seq 28，`surfaceOp:{"op":"replace","startSeq":8,"endSeq":8}`，len 7781，`personaAt=1969` | call#2 11:59:04.325Z `inject`（bot_caf / exact / len 146） | A1 可见文本末尾 `[PERSONA-PROTO ok]`；**用户看到** |
| 3 | 再说一句 | ——（沿用替换后的 head） | call#3 11:59:24.066Z `inject` | A2 末尾 `[PERSONA-PROTO ok]`；**用户看到** |

- **用户 HITL 确认**：「2和3显示了你说的新增的这句话」。第 1 条无回复是 dsh-im 发送侧的事（会话里 A0 已生成，
  与注入无关；不改 dsh-im，超本票）。
- **无 user 快照 / 无历史残留**：该会话 7 条 `user/message` 中人设正文出现 **0 次**（其中 4 条是 DSH 自己合成的
  system-reminder / runtime-context / skills / 时间块）；`system/message` 全程只有 2 条（初版 + turn 2 的头部替换），
  没有逐 step 追加。
- 归属刷新链路：11:59:00.270Z `ownership.refresh` 捕获新绑定（files=4, bytes=6618, sessions=4, errors=[]）；
  此后 call#2/#3 全部 `matchedForm:"exact"`。
- **修正认知**：真实 IM 会话本身就是「中途 head 替换」场景（turn 2 用 `replace` 覆盖 node0），而模型**确实按新人设
  回答了**（标记出现）⇒ 小上下文的 mid-session 改写可以送达。

### 1c. 长历史 GUI 会话的「中途改写」：**未确认（风险收窄，非全盘否定）**

- 对两个**已在运行、system 提示词约 71KB、历史 260+ 条**的 GUI/agent 会话做非侵入 nonce 探针（19:25、19:27 改人设；
  队友 measure-state 会话 11:41:27Z 同样探针）：模型均回答「没有该段/口令」，无法复述 nonce ⇒ 该场景下 mid-session
  改写没进模型视野。
- 上游**确实看到了**改写：billion-context 代理日志 `[fold-reconcile] system prompt changed` 71733→71844 chars
  （11:25:29.531Z）、71844→71914（11:27:00.438Z），代理账本两次 prompt switch
  （fp `52b1f7e94de1bd72`→`211e2698613632d7`，cache hit 0.3%）。
- 旧飞书会话 `session-3d394605-…`（挂载前创建、turn 34 才被注入）同样出现 head 替换但回复无标记——与 1b 对照，
  差异可能在历史长度/会话状态，机制未定位。
- 已排除：适配器 `Gaxios.agentCache` 只是 HTTP agent 池（:9121-9138）；billion-context 的 `stableSystemAnchor`
  默认关闭、日志 0 条 anchor 行。根因落在第三方层（billion-context 折叠 / opencode-go relay），**超出本票范围**。

⇒ **结论（写进地图的风险，已收窄）**：`section` 注入在**新会话**必定生效（1a/1b）；**短历史 IM 会话的中途改写
实测生效**（1b）；但**长历史大上下文会话**的 mid-session 改写能否送达未验证（1c，两次探针阴性）。实现规格若承诺
「改完下一次消息生效」，需保留兜底/降级策略（例如编辑后若当前会话未生效则提示开新会话），并列为 T7 验收项。

## 2. Q2 —— `assembly.agent.session` 在宿主回调里的实际形状与可用性

`section.text(context)` 的入参就是 `assembleContextFor(agent, signal)` 的返回：
`context = { agent, scope, signal? }`（`agent.scope` 即 agent 自身）。

| 探测项 | 实测值 |
| --- | --- |
| `Object.keys(context)` | `["agent","scope","signal"]`；`hasSignal=true`、`signalIsAbortSignal=true`、`scopeIsAgent=true` |
| `agent.id` | 与 `session.id` **相等**（真实 IM 会话中） |
| `agent` 键（17 个） | `activityDone, assistantAttemptCounter, assistantStreamRevision, ctx, dispatch, frozenMessages, id, inbox, loopCtx, options, phase, requestHeaderLogged, requestSurfaceGeneration, runtimeContext, scope, session, systemPrompt` |
| `agent.session` 键（16 个） | `contextFold, contextFoldSeq, derived, derivedGeneration, derivedNodes, eventsSnapshot, firstLifecycleSeq, firstLiveSeq, header, headerFold, headerFoldSeq, inheritedEventCount, log, surfaceManager, toolHistoryProjection, toolHistorySeq` |
| `session.header` 键（7 个） | `agentPreset, createdAt, cwd, delegationDepth, id, isSeeded, version` |
| `session.header` 示例（IM 会话） | `{ id: 'session-3d394605-…', cwd: 'D:\\3DeepSeekHarness\\agents\\xiaowan', agentPreset: 'standard', origin: null, parentSession: null }` |
| `agent.phase` | `{ abort, kind, step, turn, wakeRequested }` |
| `agent.options` | `{ model, provider }` |
| **sessionId 形态** | IM 会话 = `session-<uuid>`（与 state.json 精确匹配）；GUI/工作区会话 = 裸 `<uuid>`（原型已做前缀切换兜底，证据 `matchedForm:"prefix-toggle"`） |
| **botId** | `session.header` / `session` 上**没有** botId（section 回调拿不到渠道身份）⇒ 必须走 state.json 反查 |
| 大对象 | `session.derived` / `session.log` 是上千数字键的对象 ⇒ 证据里只记 `{count, sample[8]}`，避免膨胀 |

⇒ **可用性**：section 回调里能稳定拿到 `context.agent.session.id`（外加 `cwd/agentPreset/createdAt/origin/parentSession`），
足以做归属反查；拿不到 botId，与 T2 结论一致。**每个 step 都会调用**（含工具步），text 必须同步、零 I/O、永不抛。

## 3. Q3 —— state.json 在真实 DSH_HOME 的读取耗时 / 失败模式 / 缓存行为

机器：`C:\Users\辰辰洋洋\.dsh\integrations` → 4 个 `state.json`（飞书 3 bots + 微信 1 account），6532 B，4 条 session 绑定；
详见 `RESULTS-state-reads.md`（200 次采样口径）。要点：

| 指标 | 实测 |
| --- | --- |
| 冷读（stat + read + parse） | mean **0.3967 ms** / p50 0.3758 / p95 0.5406；其中 readdir 约 0.32 ms（≈80%） |
| 缓存命中（只 stat 戳） | mean **0.0174 ms** / p50 0.0167 / p95 0.0187 ≈ 冷读的 **1/23** |
| 单次 lookup（0 I/O） | 0.002–0.065 ms（热身 0.17 µs 级） |
| 负缓存 | 0.17 µs/次；TTL 判定 0.30 µs |
| sha256 兜底（全量 read+hash） | 0.121 ms |
| 失败模式 | 20 个坏 fixture（ENOENT / 坏 JSON / sessions 非对象 / .tmp 残留）：**0 抛异常**；17 例沿用上次成功索引；`.tmp` 一律忽略 |
| 1:N | 同一 sessionId 命中多 bot 时按文件 mtime 最新取 winner、不拼接（`ownership.ambiguity`），实测本机未出现 |
| 戳精度限定 | `(path,mtimeMs,size)` 在「同一 ~1ms tick 内同尺寸改写」会漏检（连续 5 写只 2 个戳）⇒ 建议实现时加 `lastParseAt`：戳相等且距上次 parse >5 s 时做一次 sha256 校验（0.121 ms/5 s ≈ 0.002% CPU） |
| 负缓存 TTL ≤ 2 s | 成立：真实 IM 会话相邻 step 最小间隔 2333 ms（159 个间隔）> 2000 ms |

## 4. 证据文件

| 文件 | 内容 |
| --- | --- |
| `evidence.jsonl` | 606 行：`plugin.load`×9、`plugin.dispose`×9、`section.registered`×9、`session.shape`×49、`persona.text`×503（inject 129 / skip-unowned 374）、`ownership.refresh`×19 |
| `RESULTS-selftest.txt` | `SELFTEST-PASS 40/40`（mock ctx + 假 DSH_HOME，可离线复跑 `node selftest.mjs`） |
| `RESULTS-state-reads.md` | Q3 完整口径（200 次采样、20 个失败 fixture、戳精度实验） |
| `RESULTS-session-logs.md` | 会话日志解码方法与 IM 会话取证（system/message 归属算法、真实用户数= spliced user id 等） |
| `measure-state.mjs` / `inspect-session.mjs` | 可复跑脚本：`node measure-state.mjs --home <DSH_HOME> --json`；`node inspect-session.mjs --list` |

## 5. 目视验收（HITL）：**已完成**

- 2026-10-22 19:58 用户在小婉（`bot_caf120923f264ee1a287ca9cf1a9f139`）`/new` 后连发 3 条消息；
  **第 2、3 条回复末尾都出现独立一行 `[PERSONA-PROTO ok]`，用户当场确认**（「2和3显示了你说的新增的这句话」）。
  第 1 条无回复与首条 miss 属预期（见 1b）。
- 佐证：同会话磁盘日志显示 turn 2 起 system/message 为 head 替换且含人设（`personaAt=1969`），模型可见文本带标记；
  user/message 中人设正文 0 次 ⇒ 无 user 快照、无历史残留。
- 复现：`mount.ps1` → 飞书私聊小婉 `/new` 后发 2–3 条消息 → 看每条第 2 条起回复末尾的标记 → `unmount.ps1`（幂等，不重启 DSH）。

## 6. 结论汇总（给 T4/T7 的输入）

1. `systemPrompt.section(order 650, interpolate:false)` + 后置 `ctx.inject` 在真实 DSH 中可注册、每 step 被调用、只进 system 正文；
   真实 IM 会话 2/3 条消息实测每步生效（首条按 T4 允许 miss）。
2. section 回调可用 `context.agent.session.id` 拿会话身份；**无 botId**，渠道归属必须靠 state.json 反查（T2）。
3. state.json 同步读取成本可忽略（冷读 0.4 ms、缓存命中 0.017 ms、lookup 微秒级），fail-soft 可做到 0 抛；
   建议加「距上次 parse >5 s 时 sha256 校验」补 (mtimeMs,size) 同 tick 同尺寸改写漏检。
4. **风险（已收窄）**：注入在新会话必定生效、短历史 IM 会话中途改写实测生效；但长历史大上下文会话的 mid-session
   改写能否送达未验证（两次 nonce 探针阴性，根因在第三方层）⇒ T7 需把「编辑后既有会话生效」列为验收项，规格保留兜底/降级。
