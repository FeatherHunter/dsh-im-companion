# RESULTS · 任务 B：会话持久化取证（sessions 落盘 / 注入可判定性）（T6 #166）

- 日期：2026-10-22 19:10–19:31（Asia/Shanghai）
- 环境：Windows 10.0.26200、Node v24.19.0、DSH_HOME = `C:\Users\辰辰洋洋\.dsh`（desktop profile；DSH 0.2.1-rc.2 / dsh-im 5.1.0）。
- 只读取证：未改动 `~/.dsh` 下任何文件，未重启 DSH。
- 脚本：`prototypes/persona-inject/inspect-session.mjs` v1.0.0（零依赖 ESM；输入 sessionId，输出事件统计与 J1/J2/J3 判定；`--json` 机器可读）。
- 主证据快照时刻：2026-10-22T11:30:30Z（会话仍在写入，数字会继续增长，判定不变）。

## 0. 结论速览

| 待证 | 判定 | 关键证据 |
| --- | :---: | --- |
| ① 某 IM 会话每一步的 system prompt 都注入了人设文本 | **成立（直接证据）** | 该会话第 2 条 `system/message`（seq 1012、turn 34 step 2、chars 7781）含 146 字符人设段（sha8 `326941a4`）；按「每个 assistant/message 取其 seq 之前最近一条 system/message」归属，其后 **15** 个 assistant 步骤全部以该 prompt 为生效系统提示词（159 步中 144 步在注入前） |
| ② 会话历史里没有多出 user 角色的注入快照 | **成立（按判定口径）** | 真实用户消息 = `source.kind==='user'` 的 **38** 条、distinct rpcId **38**；另 94 条是宿主合成上下文（vision-router 77、time-context 12、runtime-context 2、skill-catalog 1、agent-instructions 1、model-selection 1），挂载前就存在；`agent/inbox/spliced` 里 inserted user id 38 个与 user/message 的 38 个 **100% 重合** |
| ③ 注入文本未落进会话历史 | **成立** | 人设 marker `## 助理身份：` 全事件扫描只命中 `system/message` 1 次；`user/message` 与 `agent/inbox/spliced` 命中 **0**；助手回复里的效果标记 `[PERSONA-PROTO ok]` 也只在 system/message 出现 1 次（即注入正文本身），assistant 文本 0 次 |

> 注意：以上是**事后只读磁盘**的判定。system prompt 本身只在「渲染文本发生变化」时落盘一条（见 §4），所以「每步都注入」不是「每步一条 system/message」，而是「一条新 system/message 之后的每个 step 都继承它」。

## 1. 落盘布局与定位

### 1.1 路径规则

```text
<DSH_HOME>/sessions/<cwd 编码目录>/<session 目录>/session.v4.jsonl.zstd
```

- 读时 `<DSH_HOME>/sessions` 下有 **14** 个 cwd 编码目录、**1423** 个 session 目录；文件名统一 `session.v4.jsonl.zstd`。
- cwd 编码：反斜杠/冒号变 `-`，例如 `D:\dsh-plugin\dsh-opencode-palette` → `--D-dsh-plugin-dsh-opencode-palette--`；含非 ASCII 的 cwd 会出现 `~8FB0` 形态的转义片段（推测 UTF-8 字节十六进制）。**不要按 cwd 猜目录**——IM 会话的 cwd 未必是本仓库，直接全盘按 sessionId 搜。
- session 目录名两种形态：`session-<uuid>`（IM 会话）与裸 `<uuid>`（本地 web 会话也可能裸名）。

### 1.2 全盘定位命令（只读）

```powershell
# 全盘找 sessionId 出现在哪个会话目录名里（最快）
Get-ChildItem C:\Users\<you>\.dsh\sessions -Recurse -Directory -Filter '*3d394605*' | Select-Object FullName

# 全部会话文件（含大小/时间）
Get-ChildItem C:\Users\<you>\.dsh\sessions -Recurse -Filter session.v4.jsonl.zstd | Select-Object FullName,Length,LastWriteTime

# 正文里搜 sessionId（找绑定真源/用量记账/工作区引用）
rg -l 'session-3d394605' C:\Users\<you>\.dsh
```

本机 4 个 IM 会话（各唯一命中）：

| sessionId | 落点（相对 <DSH_HOME>/sessions） | 读时大小 |
| --- | --- | ---: |
| session-3d394605-d1ab-4088-8f05-ac9f746e7993 | `--D-3DeepSeekHarness-agents-xiaowan--/session-3d394605-d1ab-4088-8f05-ac9f746e7993/` | 965,533 B |
| session-3ca14842-bfa6-4cd3-b5b0-c03021422841 | `--D-dsh-plugin-dsh-opencode-palette--/…/` | 36,649 B |
| session-4063298f-74e2-4768-9256-d84eb4abed1f | `--D-3DeepSeekHarness-agents-xiaoyan--/…/` | 52,250 B |
| session-5f607d71-17d3-4879-a1cf-2761a2b5e2e1 | `--D-dsh-plugin-dsh-opencode-palette--/…/` | 46,209 B |

全盘正文命中只有 3 处：`integrations/dsh-feishu/bots/bot_caf…/state.json`（绑定真源）、`storages/usage_history.json`（用量记账）、`storages/workspace.json`（workspace xiaowan 的 sessionIds）。`storages/session_projcache/sessions/<uuid>.json` 与 `storages/vision_router_session_policy/policies/<uuid>.json` 用裸 uuid 命名，本 4 会话无对应文件。

## 2. 文件格式（关键：多帧 zstd，不是单帧）

- 每个文件是**多段 zstd 帧首尾拼接**（每帧 magic `28 B5 2F FD`）。Node 的 `zstdDecompressSync` 默认只解第一帧（实测只出 217 B / 1 行）⇒ 必须按 magic 切帧逐帧解压、拼成一个文本、再按换行切行、逐行 JSON.parse。
- 第一行是会话头；其余每行一个事件。
- 事件封套：`{ type, seq, time, data, surfaceOp? }`；`seq` 单会话内单调递增，`time` 为 epoch 毫秒。只有 `user/message`、`assistant/message`、`tool/result`、`system/message` 带 `surfaceOp: 'append'`。
- 会话头字段：`type:'session', version:4, id, createdAt(epoch ms), cwd, isSeeded, delegationDepth, agentPreset`；**无 seq/time**。

解码片段（inspect-session.mjs 的实现口径，可直接抄）：

```js
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
function splitFrames(buf) {
  const offs = []; let i = buf.indexOf(MAGIC, 0);
  while (i >= 0) { offs.push(i); i = buf.indexOf(MAGIC, i + 4); }
  return offs.map((o, k) => buf.subarray(o, k + 1 < offs.length ? offs[k + 1] : buf.length));
}
const text = splitFrames(fs.readFileSync(file))
  .map((f) => zlib.zstdDecompressSync(f).toString('utf8')).join('');
const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
```

本机 4 个会话用该口径解出 0 个 decode error、0 个 parse error。理论风险：压缩体内部若恰好出现 4 字节 magic 会误切；生产脚本可加「解压失败则与下一帧合并重试」兜底。

## 3. 事件类型清单（本会话实际观测，读时快照）

观测到 27 种：`step/start 160、assistant/message 159、step/end 159、tool/call 147、tool/result 147、user/message 132、agent/inbox/spliced 114、turn/start 38、turn/end 37、assistant/attempt 5、llm/retry 5、llm/retry-started 5、request/header 4、job/registered 3、job/settled 3、system/message 2、request/context 2、session/title 2、session 1、permission/preset 1、sandbox/mode 1、approval/policy 1、subagent/model-selection-policy 1、session/title-llm-request 1、session/end-seed 1、model/selection 1、developer/message 1`。

宿主 known-event-types 全集 62 种（含 compaction/*、goal/change、todo/write、team/*、schedule/change、working-directory/change 等本会话未触发项），取证脚本对未知 type 一律忽略、只做统计。

## 4. 判定方法（可执行规则）

### J1「每一步 system prompt 都注入了人设文本」

1. 取所有 `system/message` 事件，按 seq 排序；每条 `data.message.content` 里 `type==='text'` 的 text 拼起来即该时刻的完整渲染 system prompt。
2. 对每条 `assistant/message`，取 **seq 小于它且最近的那条 system/message** 作为该步生效的系统提示词（同一 system prompt 会覆盖其后所有 step）。
3. 判定：含人设 marker（`## 助理身份：`）的步数 = 注入后所有 assistant 步数。本会话 159 步中 **15** 步带 marker（seq 1012 之后），144 步在注入前（seq 1012 之前）。
4. 若事件日志里看不到 system prompt（理论上本版本会落盘，已实测），替代证据优先级：① `system/message` 序列变化点（文本 chars/sha8 变化即可证明注入生效）；② `evidence.jsonl` 的逐次 render 记录（本原型每 render 记一条 `persona.text`，含 sessionId/channel/botId/chars/sha8）；③ 助手行为标记 `[PERSONA-PROTO ok]`（本次**未观察到**，不能作为单独证据）。

### J2「会话历史没有多出 user 角色的注入快照」

1. 遍历 `user/message`，按 `data.source.kind` 分类：只有 `kind==='user'` 才是用户真实发送；其他 kind（`agent-instructions` / `runtime-context` / `time-context` / `skill-catalog` / `model-selection` / `plugin:*`）是宿主既有合成上下文，**挂载前就存在**，不是注入快照。
2. 真实用户消息 = `kind==='user'` 的条数（并去重 rpcId，两者应相等）；再与 `agent/inbox/spliced` 的 `inserted` 里 `kind==='user'` 的 distinct id 集合比对，应 100% 重合。
3. 判定：真实用户条数与收到的用户消息一致，且这些消息的文本不含人设注入正文 ⇒ 历史里没有注入快照。本会话：user/message 132 条中真实 38 条（38 个 distinct rpcId），spliced 的 38 个 user id 全部重合。

### J3「注入文本未落进会话历史」

1. 对全部事件做字符串扫描：人设 marker（`## 助理身份：`）与注入正文 sha8（`326941a4`）只应出现在 `system/message`。
2. 单独检查 `user/message` 与 `agent/inbox/spliced` 的 content 文本命中数 = 0。
3. 可选：把注入段 sha8 与 history 里所有 user/assistant/tool 文本做比对。本会话：persona marker 命中 `system/message:1`、其余类型 0；效果标记命中 `system/message:1`、assistant 文本 0。

## 5. 一段真实样例（脱敏；路径保留、文本截断）

```jsonl
{"type":"session","version":4,"id":"session-3d394605-d1ab-4088-8f05-ac9f746e7993","createdAt":1792518640085,"cwd":"D:\\3DeepSeekHarness\\agents\\xiaowan","isSeeded":false,"delegationDepth":0,"agentPreset":"standard"}
{"type":"user/message","seq":9,"time":1792518644363,"data":{"content":[{"type":"text","text":"hello"}],"source":{"kind":"user","rpcId":"feishu-26f8a1d4-…","clientTimeZone":"Asia/Shanghai"},"role":"user","id":"ff711cfa-…"},"surfaceOp":"append"}
{"type":"agent/inbox/spliced","seq":10,"data":{"target":"next-turn","start":0,"inserted":[{"content":[{"type":"text","text":"hello"}],"source":{"kind":"user","rpcId":"feishu-26f8a1d4-…"},"role":"user","id":"ff711cfa-…"}]}}
{"type":"step/start","seq":11,"data":{"turn":1,"step":1}}
{"type":"system/message","seq":8,"data":{"turn":1,"step":1,"message":{"role":"system","content":[{"type":"text","text":"You are an AI agent powered by DeepSeek Harness. …（全 7633 字符，sha8 c8f45020）"}]}},"surfaceOp":"append"}
{"type":"system/message","seq":1012,"time":1792667603478,"data":{"turn":34,"step":2,"message":{"role":"system","content":[{"type":"text","text":"… The Lead must wait …\n\n## 助理身份：飞书原型助理\n\n你是 T6 注入链路最小原型（飞书渠道）的验证助理。…\n\n始终以该身份回应\n\nTokens prefixed by @ …（全 7781 字符，sha8 b18ff0de）"}]}},"surfaceOp":"append"}
{"type":"assistant/message","seq":1013,"data":{"turn":34,"step":2,"message":{"role":"assistant","content":[{"type":"tool-call","id":"call_…","name":"bash","arguments":"{…}"}],"source":{"kind":"model","provider":"deepseek","model":"…"},"id":"…"},"usage":{"inputTokens":…,"outputTokens":…}}}
{"type":"tool/call","seq":1014,"data":{"turn":34,"step":2,"callId":"call_…","name":"bash","arguments":"{…}"}}
```

第 2 条 system/message 是**注入生效的直接证据**：整体 7633 → 7781 字符（+148），其中注入段 146 字符（sha8 `326941a4`），插在 system prompt 中部（宿主团队说明之后、@ 前缀说明之前）。

## 6. 4 个 IM 会话判定表（读时快照；3d394605 仍在写入）

| 会话（短 id） | 大小/事件 | steps/turns/assistant | system/message | 真实用户 | 人设命中的步 | J1 | J2 | J3 |
| --- | ---: | ---: | ---: | ---: | ---: | :---: | :---: | :---: |
| 3d394605（飞书 bot_caf，活跃） | 965,533 B / 522 帧 / 1133 行 | 160/38/159 | **2**（7633 c8f45020；7781 b18ff0de） | 38 | **15** | **成立** | 成立 | 成立 |
| 3ca14842（飞书 bot_253f，web 早会话） | 36,649 B / 7 帧 / 25 行 | 1/1/1 | 1（7633 c8f45020，无人设） | 1（user/message 5 中） | 0 | 未观察到（早于挂载） | 成立 | 不适用 |
| 4063298f（飞书 bot_7e34，web 早会话） | 52,250 B / 28 帧 / 65 行 | 7/2/7 | 1（无人设） | 2（user/message 7 中） | 0 | 未观察到 | 成立 | 不适用 |
| 5f607d71（微信 wx_d3c3，web 早会话） | 46,209 B / 15 帧 / 40 行 | 3/2/3 | 1（无人设） | 2（user/message 6 中） | 0 | 未观察到 | 成立 | 不适用 |

三个旧会话的首条 system/message 完全一致（7633 字符 sha8 `c8f45020`），这说明基线 prompt 稳定，注入带来的差异可精确归因。

## 7. step 间隔观察（供 §4/负缓存 TTL 交叉验证）

对 3d394605 的 159 个相邻 step 间隔（ms）：

| 口径 | n | mean | p50 | p95 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 全部 | 159 | 943,234.99 | 18,465 | 160,965.8 | **2,333** | 142,845,193 |
| 同 turn 内 | 122 | 49,798.97 | 24,032.5 | 155,978.65 | **2,333** | 444,784 |
| 跨 turn | 37 | 3,889,159.16 | 13,193 | 171,719.4 | 8,262 | 142,845,193 |

结论：**最小相邻 step 间隔 2333 ms > 2000 ms**，2 s 负结果缓存（T4 决议）与真实 step 间隔相容；跨 turn 最大值来自隔夜空档（约 39.7 h），不影响 TTL 语义。

## 8. 与原型 evidence.jsonl 交叉印证（第二证据源）

- `prototypes/persona-inject/evidence.jsonl`：19:11:31.680Z `plugin.load`；19:12:33 / 19:14:16 热重载（`plugin.dispose` + `plugin.load`）；19:13:23.455Z `personas.loaded`。
- 19:13:23–19:21:26 共 **13 条** `persona.text`（session-3d394605、channel feishu、bot_caf120…、length 146、sha8 `326941a4`，callIndex 1…8）；另有 127 条 `skip-unowned`（其他 web 会话）与 20 条 `session.shape`。
- 与日志侧交叉：evidence 的 146 字符 / sha8 326941a4 与会话日志第 2 条 system/message 中的注入段**完全一致** ⇒ 磁盘日志（会话）与插件证据（evidence）互证「注入内容就是这段人设文本」。
- 行为层：注入后 4 条含文本的助手回复（422/466/565/446 字符）**均未出现** `[PERSONA-PROTO ok]`；模型可能未遵从标记要求（或回复被渠道截断），这条不能作为 J1 的证据，只能作为「注入后行为是否变化」的观察项。

## 9. inspect-session.mjs 用法

```powershell
# 人读摘要（默认取最新一个会话文件；也可传 sessionId）
node prototypes/persona-inject/inspect-session.mjs session-3d394605-d1ab-4088-8f05-ac9f746e7993

# 机器可读 JSON（落文件；stdout 只打印一行提示）
node prototypes/persona-inject/inspect-session.mjs session-3d394605-d1ab-4088-8f05-ac9f746e7993 --json --out D:\Temp\session-3d394605.json

# 列出全部会话文件（按 mtime 倒序）
node prototypes/persona-inject/inspect-session.mjs --list

# 别的机器 / 别的 DSH_HOME
node prototypes/persona-inject/inspect-session.mjs <sessionId> --home C:\Users\<you>\.dsh

# 自定义 marker（换人设文本时）
node prototypes/persona-inject/inspect-session.mjs <sessionId> --persona-marker '## 助理身份：' --effect-marker '[PERSONA-PROTO ok]'
```

输出字段：`meta`（文件、字节、帧数、行数、0 decode/parse error）、`typeCounts`、`steps`、`turns`、`assistantMessages`、`systemMessages[]`（seq/turn/step/chars/sha8/是否含 marker）、`userMessages`（total/byKind/realUserMessages/distinctRpcIds）、`spliced`（events/inserted/kind/crossCheck）、`stepIntervalsMs`、`promptCoverage`、`injectedSections[]`（chars/sha8/preview）、`postInjection`（首个含 marker 的 system seq、其后 assistant 步与文本回复、含效果标记数）、`markerScan`、`judgments`（J1/J2/J3 判定 + evidence）。

## 10. 局限与注意

- 会话是**多帧拼接**，不要用单次 `zstdDecompressSync` 的输出来判断「文件坏了」；帧切分按 magic，理论上有误切风险（本机 0 次）。
- system prompt 只在「渲染文本变化」时落盘一条（同文本跨 step 复用）；因此「每步都注入」的证明是「新 system/message 覆盖其后所有步」，不是「每步一条」。
- 若某会话的 system prompt 从未落盘（版本差异），退到 §4 J1 的替代证据链；`evidence.jsonl` 是插件侧自证，不能单独当宿主侧证据。
- 会话文件持续写入（本会话读时 965 KB，仍在增长）：取证应在采集时刻记录 `meta.bytes/generatedAt`，判定对增长不敏感。
- `user/message` 总数不能当「用户发了多少条」：本机合成上下文占多数（132 中仅 38 条真实），必须按 `source.kind` 与 rpcId 判。
- `--list` 用 mtime 排序，只是定位辅助，不参与判定。

## 11. 复现命令（一条链）

```powershell
cd D:\dsh-plugin\dsh-im-companion
node prototypes/persona-inject/inspect-session.mjs --list | Select-Object -First 5
node prototypes/persona-inject/inspect-session.mjs session-3d394605-d1ab-4088-8f05-ac9f746e7993 --json --out D:\Temp\s.json
Get-Content D:\Temp\s.json -Raw | ConvertFrom-Json | Select-Object -ExpandProperty judgments | Format-List
Get-Content prototypes\persona-inject\evidence.jsonl | Select-String '"persona.text"' | Measure-Object
```