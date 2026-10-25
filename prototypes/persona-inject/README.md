# persona-inject — 注入链路最小原型（T6 / #166）

> 可丢弃原型，**不并入产品代码**（不在 `src/`、不发布、不进构建）。目的只有一条：用最小宿主插件在真实 DSH 里把
> 「宿主注册 `systemPrompt.section` → 真实 IM 会话每一步 system 提示词含注入文本」这条链路跑通并留下机器可读证据。

> **状态（2026-10-22 收尾）**：三问全部取到证据，真实 IM 会话 HITL 已由 owner 实测确认（小婉，回复第 2/3 条末尾出现
> `[PERSONA-PROTO ok]`），原型已卸载、desktop profile 已按备份恢复（`HASH-OK`×2）。完整结论见 `RESULTS-injection.md`。
> 重挂/重测见下文「挂载」「HITL 验收」，脚本幂等、全程不重启 DSH。

## 它回答的三问

| 问题 | 本原型怎么取证 |
| --- | --- |
| Q1 注入链路是否每步生效、不留历史 | `section` 的 `text(context)` 每个 step 被调用一次；每次调用写一行 `persona.text` 证据（注入/跳过、callIndex、指纹）。真实 IM 会话回复末尾须出现可辨识标记 `[PERSONA-PROTO ok]`（personas.json 要求）⇒ 证明当步 system 提示词确有注入，且历史里没有残留（历史是 user/assistant 消息，section 文本不进历史） |
| Q2 `assembly.agent.session` 的形状与可用性 | 每个会话第一次调用时写一行 `session.shape`：`contextKeys` / `agentKeys` / `sessionKeys` / `sessionHeader` / `sessionCwd` 等真实字段 |
| Q3 磁盘映射读取的耗时/失败模式/缓存 | `ownership.js`：同步枚举 `<DSH_HOME>/integrations/dsh-*/{bots,accounts}/*/state.json`，按 `(path, mtimeMs, size)` 戳缓存；每次实际刷新写 `ownership.refresh`（statMs/parseMs/bytes/errors），失败写 `ownership.refresh.fail`，1:N 写 `ownership.ambiguity` |

对齐 T4 #164 resolution：section 单通道、`order: 650`（TEAM_POLICY 600 与 PTC 800 之间）、`name` 前缀 `dsh-im-companion:`、
`interpolate: false`；text 零 I/O 只读内存；负缓存 TTL 2000ms；1:N 取文件 mtime 最新并告警不拼接；模板与截断规则在 `persona.js`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主插件：后置 `ctx.inject(['systemPrompt'])` 注册 section；`text()` 只读内存表、只返回 string、异常返回空串 |
| `ownership.js` | state.json 归属索引（同步读、戳缓存、负缓存、fail-soft、1:N 规则） |
| `persona.js` | 人设归一化与 T4 模板拼接（nameSan/trim/8000 码点/指纹） |
| `evidence.js` | JSONL 证据追加写（写失败不抛） |
| `personas.json` | 原型的（假）人设；default + 按 botId 覆盖。要求模型每步回复末尾原样输出 `[PERSONA-PROTO ok]` |
| `selftest.mjs` | 无宿主自测（mock ctx + 假 DSH_HOME），`SELFTEST-PASS 40/40` |
| `mount.ps1` / `unmount.ps1` | 挂到 desktop profile（HMR 热加载、不重启 DSH）/ 恢复备份并摘除 |
| `backup/` | 挂载前 profile 两文件的备份（含 SHA256 清单），卸载时据此恢复 |
| `evidence.jsonl` | 运行时证据（JSONL，一行一事件）；每次挂载追加 |
| `RESULTS-selftest.txt` | 自测原始输出 |
| `RESULTS-injection.md` | **随票证据汇总**：Q1/Q2/Q3 结论 + 真实 IM HITL 取证 + 风险收窄 + 复现步骤 |

## 挂载（HMR 热加载，不重启 DSH）

```powershell
powershell -NoProfile -File D:\dsh-plugin\dsh-im-companion\prototypes\persona-inject\mount.ps1
```

它做四步（前三步只改静态文件，最后一步才触发 HMR reconcile）：

1. 备份 `desktop` profile 的 `package.json` 与 `cordis.patch.yml` 到本目录 `backup/<时间戳>/`，并写 SHA256 清单；
2. `package.json` 的 `dependencies` 加 `"dsh-persona-inject-proto": "link:<本目录>"`；
3. `node_modules/dsh-persona-inject-proto` 建 Junction → 本目录（已存在则校验目标，删链接只 `Directory.Delete(p,false)`，绝不递归）；
4. `cordis.patch.yml` 末尾追加 **insert 补丁**（见下）。

> ⚠️ 新增条目必须写成 `- insert: [ { id, name, config } ]`。裸写 `- id: ... / name: ...` 会被 loader 当成
> 「修改已存在的 entry」，目标不存在时只 warn（只进宿主 console，磁盘看不见）然后跳过——实测第一次挂载就是这么
> 静默失败的。HMR 会在 patch 文件变化后 reconcile：旧实例 `plugin.dispose`、新实例 `plugin.load`，模块会被重新 import
> （所以改 `index.js` 后只要再动一下 patch 配置就能热更新，无需重启）。

挂载后 3-5 秒检查：

```powershell
Get-Content D:\dsh-plugin\dsh-im-companion\prototypes\persona-inject\evidence.jsonl | Select-Object -First 3
# 期望依次出现：plugin.load -> ownership.refresh -> section.registered
```

## 卸载

```powershell
powershell -NoProfile -File D:\dsh-plugin\dsh-im-companion\prototypes\persona-inject\unmount.ps1
```

用 `backup/` 最新一份恢复 profile 两文件并核对 SHA256，再删 Junction（只删 Junction；普通目录只警告不递归删）。
恢复 `cordis.patch.yml` 会触发 HMR 热卸载（`plugin.dispose`），全程不需要重启 DSH。

## 证据事件表（evidence.jsonl）

| event | 何时 | 关键字段 |
| --- | --- | --- |
| `plugin.load` | 实例装载 | dshHome / evidenceFile / sectionName / sectionOrder / node / pid / cwd |
| `plugin.dispose` | HMR 热卸载 | snapshot（索引规模与统计） |
| `section.registered` | section 注册成功 | name / order / interpolate |
| `section.register.fail` | 注册失败（不抛） | message / stack 前 4 行 |
| `session.shape` | 每会话首次 text 调用（Q2） | contextKeys / agentKeys / sessionKeys / sessionHeader / sessionCwd / sessionId… |
| `persona.text` | 每次 text 调用（Q1） | action=inject/skip-unowned/skip-empty/skip-no-session、callIndex、botId/channel、matchedForm、sha8 |
| `persona.text.fail` | text 内部异常（必须只返回空串） | message / stack |
| `ownership.refresh` | 戳变化后的实际刷新（Q3） | statMs / parseMs / files / bytes / sessions / errors / cached |
| `ownership.refresh.fail` | 有坏文件但已 fail-soft | errors[]（file/phase/message） |
| `ownership.ambiguity` | 同一 sessionId 命中多个 bot（1:N） | candidates / bots / winner / rule |
| `personas.loaded` / `personas.load.fail` | 首次读人设 | file / bots / hasDefault |

## HITL 验收（需要真人一侧）

1. 用飞书**私聊**任一已接入的 companion bot（实测可用的 bot：`bot_caf120923f264ee1a287ca9cf1a9f139`；微信账号同理）；
2. 连续发 2–3 条普通消息（例如「你好」「今天怎么样」「再说一句」）；
3. 预期：**每条**回复末尾都有独立一行 `[PERSONA-PROTO ok]`；
4. 同日查证据：`persona.text` 里该 sessionId 的 `action:"inject"` 次数 = 该会话 step 数（含工具步），`callIndex` 递增；
5. 历史侧写：会话历史（user/assistant 消息）里不应出现人设正文——它只进 system 提示词。

## 已知结论（2026-10-22 实测，随票回填）

- 新增本地 linked 包 + insert 条目可被 HMR **热加载**，无需重启 DSH；改插件源文件后动一下 patch 配置即可重载模块。
- 真实 `session.id` 有两套写法：GUI/工作区会话是裸 UUID，IM 会话是 `session-<uuid>`；state.json 里存的是后者。原型对未命中会做一次前缀切换（证据里 `matchedForm:"prefix-toggle"`）。
- 本机实测 `<DSH_HOME>/integrations` 有 4 个 state.json（飞书 3 bots + 微信 1 account），冷读 ~1.4ms（stat 0.7ms + parse 0.26ms、6231B），缓存命中刷新 ~0.45ms，单次 lookup 0.002–0.07ms，负缓存第二次 0.001ms。
- 遗留 `state.json.tmp` 不会被计入（只认 `state.json`）；坏 JSON / `sessions` 非对象 fail-soft 且沿用上次成功索引。

## 已知结论（2026-10-22 实测，随票回填）

- **真实 IM 会话 HITL 已过**：小婉 `/new` 后 3 条消息 —— 第 1 条 system prompt 无人设（归属索引首条 miss，T4 允许），
  第 2/3 条回复末尾出现 `[PERSONA-PROTO ok]`（owner 目视确认）；同会话 7 条 user/message 里人设正文 0 次（无 user 快照残留）。
- 中途 head 替换（`surfaceOp:{"op":"replace","startSeq":8,"endSeq":8}`）在**短历史 IM 会话**上实测送达模型；
  但在**长历史大上下文（~71KB system prompt）GUI 会话**上两次 nonce 探针均阴性（根因在第三方代理/适配器层，未定位）。
  ⇒ 规格承诺「编辑后既有会话下一条生效」需兜底，T7 作验收项。
- 注入送达的端到端自测（全新会话 + 隐藏 nonce + 模型写文件）：`b0709212-…` 会话 system/message 只有 1 条且含 nonce，
  模型正确写出 nonce（MATCH true），证明全新会话初始 system 提示词含注入并送达。

## 安全边界

- 只读 `~/.dsh/integrations`、`~/.dsh/sessions`（读日志是只读）；**不写** dsh-im 的落盘、不改 `@xmanrui/dsh-im` 一行；
- 文本本身永不进日志/证据（只记长度/指纹/人设名）；
- `text()` 铁律：只返回 string、绝不抛（异常吞掉返回空串并记 `persona.text.fail`）；
- 卸载脚本恢复备份并核对 hash；Junction 删除只删链接。
