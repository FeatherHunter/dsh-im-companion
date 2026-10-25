# RESULTS · 任务 A：state.json 读取成本 / 缓存命中 / 失败模式 / 缓存戳精度（T6 #166）

- 日期：2026-10-22 19:14–19:26（Asia/Shanghai）
- 环境：Windows 10.0.26200（x64）、Node v24.19.0（PATH）、C: 卷 NTFS；DSH_HOME = `C:\Users\辰辰洋洋\.dsh`（desktop profile，DSH 0.2.1-rc.2 / dsh-im 5.1.0）
- 被测真源：`<DSH_HOME>/integrations/dsh-<channel>/{bots,accounts}/<botId>/state.json` 的 `sessions` 对象；本机 4 文件、约 6.3 KB。
- 脚本：`prototypes/persona-inject/measure-state.mjs` v1.1.0（零依赖 ESM、只读；fixture 建在系统临时目录，默认清理）。
- 原始 JSON：`D:\Temp\ms-state2.json`（临时文件，可删；脚本用 `--out` 可重生成）。

## 0. 结论速览

| 问题 | 结论 | 关键数字 |
| --- | --- | --- |
| 冷读一次要多久 | stat+read+parse 均值 **0.397 ms**（p50 0.376 / p95 0.541） | 4 文件 6317 B；其中 readdir 枚举占 ~0.32 ms，read ~0.18 ms，parse ~0.03 ms |
| 缓存命中一次要多久 | 按内存文件列表只 stat 戳 **0.017 ms**（p50 0.017 / p95 0.019），约 **23×** 快于冷读 | 若每轮连 readdir 重发现一起算则 0.23–0.27 ms |
| text 调用成本 | 纯内存 Map.get **0.17 µs** + 负缓存 TTL 判定 0.30 µs，零 I/O | 满足 T4「text 零 I/O」 |
| 负结果缓存 TTL=2s 够不够 | **够**：实测最小 step 间隔 2333 ms，2000 ms < 2333 ms | 见任务 B 报告同口径 |
| fail-soft 是否成立 | **成立**：20 个坏输入 0 抛异常；17 个用例失败后沿用上次成功索引；.tmp 忽略、1:N 取 mtime 最新 | 见 §5 |
| 缓存戳 (path,mtimeMs,size) 是否够 | **真实写入路径够；理论上不完备**：本机 NTFS 上 Node 观察到的 mtime 粒度约 **1 ms**，同一 tick 内「同尺寸改写」无法靠戳区分（实测 detected=false，rename 路径同样） | 建议加可选 hash 兜底：全量 read+sha256 仅 **0.121 ms**，或 5 s 静默期二次校验 |

## 1. 落盘现状（测量时快照）

| channel / area | botId | state.json 字节 | mtime（UTC） | 绑定 |
| --- | --- | ---: | --- | --- |
| dsh-feishu / bots | bot_253f13b2887d4c21a3a44a51befcee80 | 307 | 2026-10-20T05:12:23Z | p2p:ou_fc99… → session-3ca14842-… |
| dsh-feishu / bots | bot_7e348b31a34543f284949951b4b10f9b | 522 | 2026-10-18T10:31:14Z | p2p:ou_c179… → session-4063298f-…（同目录有遗留 state.json.tmp，被忽略） |
| dsh-feishu / bots | bot_caf120923f264ee1a287ca9cf1a9f139 | 1984 → **2027**（测量期间活跃增长） | 2026-10-22T11:21:01Z | p2p:ou_981a… → session-3d394605-… |
| dsh-weixin / accounts | wx_d3c34f555e4f2542fd2db9c7 | 3504 | 2026-10-20T05:10:51Z | p2p:o9cq… → session-5f607d71-… |

合计 4 个文件 / 6317 B（19:20 采样；bot_caf 的 IM 会话当时正在被使用，19:23 复查已长到 6360 B——这正是「必须按戳/定时异步刷新」的直接现场）。

## 2. A1 冷读成本（200 次，warmup 5）

口径：`discover` = 两层 `readdirSync`（integrations → dsh-* → {bots,accounts} → botId）；`statOnly` = 发现 + 全部 `statSync`；`statParse` = 发现 + stat + `readFileSync` + `JSON.parse`。

| 组 | mean | p50 | p95 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| readdir only（仅枚举） | 0.235 | 0.2167 | 0.344 | 0.1842 | 0.6785 |
| stat only（枚举 + stat） | 0.2309 | 0.2141 | 0.3316 | 0.1884 | 0.418 |
| stat + read + parse（完整冷读） | **0.3967** | **0.3758** | **0.5406** | 0.3251 | 0.8539 |

首轮（iteration 0）stat+parse = 0.3345 ms；`parseErrors` = 0。阶段分解（20 轮均值）：readdir **0.32 ms**、stat 0.04 ms、read 0.18 ms、parse 0.03 ms。

逐文件均值（20 轮/文件）：

| 文件 | stat | read | parse |
| --- | ---: | ---: | ---: |
| 307 B | 7.39 µs | 30.1 µs | 2.57 µs |
| 522 B | 6.25 µs | 28.0 µs | 2.28 µs |
| 1984 B | 7.23 µs | 29.4 µs | 3.42 µs |
| 3504 B | 6.56 µs | 31.4 µs | 8.89 µs |

解读：成本由 **readdir 目录遍历**主导（0.32 ms，约 80%），单文件 I/O 很小；因此「缓存命中省掉 readdir + parse」才是主要收益（见下）。以上是 warm FS cache 口径（Windows 无简单清缓存手段，用 5 次 warmup 抵消首轮抖动）。

## 3. A2 缓存命中成本（只 stat 戳，未变不 parse，200 次）

| 组 | mean | p50 | p95 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 只 stat 已知文件列表（T4 语义，不 readdir/read/parse） | **0.0174** | **0.0167** | **0.0187** | 0.0163 | 0.0536 |

`changedDuringRun` = 0（测量窗口内 4 个戳均未变；随后 bot_caf 文件才增长）。相对完整冷读 0.3967 ms 约 **22.8×**。

两个口径要分清（早期 19:13 有一份 in-process 粗测，结论看起来差 20 多倍，其实是口径不同）：

| 路径 | 成本 | 说明 |
| --- | ---: | --- |
| T4 缓存命中：文件列表在内存，只 stat + 比戳 | **0.017 ms** | 本脚本实测；每秒一次 ≈ 0.0017% CPU |
| 每轮重新 readdir 发现 + stat + 重建戳（不 parse） | 0.23–0.27 ms | = readdir 0.32 主导 + stat 0.04 + 戳串构建；19:13 粗测的 0.450 ms 属于这一档（含模块级/首轮开销） |
| 完整冷读（枚举 + stat + read + parse） | 0.397 ms（200 次均值） | 19:13 粗测首次 refresh 1.426 ms = 该档 + 模块加载/JIT 一次性开销 |

结论：**每秒一次的后台 refresh 用 0.017–0.27 ms 都完全可忽略**；戳字段的收益主要是把 parse 与 read 留在「变了才做」。

## 4. A3 负结果缓存（TTL = 2000 ms）

| 项 | 实测 |
| --- | ---: |
| 负缓存命中：Map.get（纯内存） | mean **0.1715 µs**（p50 0.1 / p95 0.2 / max 8） |
| 负缓存 TTL 判定（Date.now + 比较，未命中时写缓存） | mean **0.298 µs**（p50 0.1 / max 25.1） |
| 200 次判定结果 | 199 命中（未过期）/ 1 过期重扫 |
| 过期后重扫成本 | = 冷读 stat+parse 0.3967 ms |

TTL=2 s 与真实 step 间隔的相容性：对 session-3d394605（活跃 IM 会话，157 个 step）实测相邻 step 间隔 **min 2333 ms**、p50 18245 ms、p95 144032 ms；四个 IM 会话合计最小值也是 2333 ms，**没有任何相邻 step 间隔 < 2000 ms**。⇒ 2 s 负缓存不会在同一 step 内复活「已过期未命中」的误判，也不会把「新绑定」藏过一个 step。

建议：保持 2000 ms。若担心极端（同一 step 内多段渲染跨过 TTL），可把 TTL 改为「min(2000, 最近 step 间隔的 p5)」或维持 2000 并接受最坏多一次 0.4 ms 重扫——数据表明后者代价可忽略。

## 5. A4 失败模式（20 个 fixture，同路径先健康 → 破坏 → 带 prev 重载）

fixture 全部建在系统临时目录（`os.tmpdir()/dsh-state-fixtures-*`），默认跑完即删；`--keep-fixtures` 可保留并打印路径。权限用例用 `icacls <file> /deny <user>:(R)` 构造 EPERM，随目录删除恢复。**20 个用例抛异常 = 0。**

| 用例 | 破坏方式 | fresh | withPrev | 沿用上次索引 | 备注 |
| --- | --- | ---: | ---: | :---: | --- |
| healthy-no-mutation | 无 | 1 | 1 | ✓ | 戳未变 → `stamp-unchanged` 命中 |
| missing-integrations | 删整个 integrations | 0 | 1 | ✓ | root ENOENT → `integrations-unavailable-keep-prev` |
| empty-integrations | integrations 空目录 | 0 | 0 | — | 合法空，视为无绑定 |
| missing-bots-area | 删 {bots,accounts} | 0 | 0 | — | 结构存在但无目录 → 空 |
| bot-dir-no-state | 删 state.json | 0 | 0 | — | 见下方语义说明 |
| state-json-is-dir | state.json 变成目录 | 0 | 1 | ✓ | stat 非普通文件 → 沿用该文件 prev |
| truncated-json | JSON 截断 | 0 | 1 | ✓ | parse 错误 + 沿用 |
| trailing-comma | 尾逗号 | 0 | 1 | ✓ | parse 错误 + 沿用 |
| sessions-array | sessions 是数组 | 0 | 1 | ✓ | 非普通对象 + 沿用 |
| sessions-string | sessions 是字符串 | 0 | 1 | ✓ | 同上 |
| sessions-null | sessions:null | 0 | 1 | ✓ | 同上 |
| sessions-missing | 无 sessions 字段 | 0 | 1 | ✓ | 同上 |
| sessions-empty-object | sessions:{} | 0 | 0 | — | 合法空对象 → 清空绑定 |
| zero-byte | 0 字节 | 0 | 1 | ✓ | 视为 parse 错误 + 沿用 |
| mixed-values | 值混合类型 | 1 | 1 | ✓ | 只保留字符串值（`'session-ok'`），坏值跳过 |
| bom-json | UTF-8 BOM 前缀 | 1 | 1 | ✓ | 额外鲁棒分支：strip BOM 后解析成功 |
| tmp-ignored | 同目录 state.json.tmp | 1 | 1 | ✓ | 只读 state.json，tmp 值未生效 |
| one-to-many | 同一 sessionId 两个文件 | 1 | 1 | ✓ | entries=2，winner=bot_good（mtime 新者胜，winnerIsNewest=true） |
| integrations-is-file | integrations 是普通文件 | 0 | 1 | ✓ | readdir ENOTDIR → 沿用 prev |
| permission-denied | ACL 拒绝读 | 0 | 1 | ✓ | read EPERM → 沿用该文件 prev |

错误文案样例（进 `errors[]`，不抛）：`parse:Expected ',' or '}' after property value in JSON at position 40 (line 1 column 41)`、`parse:Unexpected end of JSON input`、`sessions:sessions 不是普通对象`、`read:EPERM`、`root:ENOENT`、`stat:not-a-regular-file`。

### 建议的 fail-soft 分支清单（原型 `ownership.js` 可逐条对照）

1. **root ENOENT / ENOTDIR**（integrations 整个不在或是文件）→ 保留上次成功索引，reason `integrations-unavailable-keep-prev`；不刷 error 级日志（debug 即可）。
2. **某 bot 目录在、state.json 缺失（ENOENT）** → 跳过该文件，不沿用 prev。理由：目录在而文件被删，等价于该 bot「尚无绑定 / 已清空」，沿用 prev 会把已解绑的会话复活。这是本报告与「沿用上次成功索引」的边界（T4 文字未细分，建议按此语义实现）。
3. **stat 成功但不是普通文件 / stat 报 EACCES、EPERM** → 该文件标记不可用，沿用该文件上一次成功的 sessions，并记一次 error（含路径与 errno）。
4. **read 报 EACCES / EPERM / EBUSY** → 同上（沿用该文件 prev）。
5. **JSON.parse 失败**（截断、尾逗号、0 字节）→ 记 error，沿用该文件 prev；绝不把半截 JSON 当空表（否则会误清绑定）。
6. **JSON 根不是对象** → 同 parse 失败。
7. **sessions 缺失 / 不是普通对象**（数组/字符串/null）→ 记 error，沿用该文件 prev。
8. **sessions 是空对象** → 合法状态，清空该文件绑定（0 条），不报错。
9. **sessions 值不是非空字符串** → 跳过该条目，保留同文件其他合法条目；整个文件因此「部分替换」prev（实测 mixed-values 行为）。
10. **state.json.tmp** → 永不读取（只拼接固定文件名 state.json，发现层就不认 .tmp）。
11. **UTF-8 BOM** → parse 前 strip（额外鲁棒分支，实测有效）。
12. **同一 sessionId 出现在多个绑定文件** → 全部保留在 index（entries[]），lookup 按 fileMtimeMs 降序取第一个，并记 `ownership.ambiguity`；符合 T4「1:N 取 mtime 最新」。
13. **任何单文件异常都不得影响其他文件**：per-file try/catch；整体 refresh 永不抛；text 路径只读内存。

## 6. A5 缓存戳精度陷阱（临时目录实测，不写 DSH_HOME）

| 实验 | 结果 | 判读 |
| --- | --- | --- |
| 同尺寸改写（首写→次写间隔 0.1144 ms） | mtimeMs 相同、size 相同，**detected=false** | 同一系统时钟 tick 内两次写，戳不变 |
| 连续 5 次同尺寸改写 | 只产生 **2 个**不同戳（fullyDetectable=false） | 快写下大量碰撞 |
| 强制 1 s 精度 mtime + 同尺寸改写 | detected=false | 低精度文件系统语义下必然漏检 |
| 原生 40 次快速写 mtime 统计 | 仅 **5 个**不同 mtimeMs；最小正间隔 **1.0 ms**；35 次与上一次同值 | 本机 Node 观察到的 NTFS mtime 粒度约 **1 ms**（不是理论 100 ns） |
| tmp 写入后 rename 覆盖（dsh-im 真实写法），同尺寸连续两次 | detected=false | rename 沿用 tmp 的 mtime，同 tick 同样漏检 |

**判定**：（path, mtimeMs, size）不是严格充分的缓存戳——本机存在「<1 ms 内、内容变化但 size 不变」的漏检窗口。

但对 dsh-im 的**真实写入路径**风险可忽略，理由三条：① state.json 随 seenMessageIds / topics 单调增长，绝大多数写入 size 会变；② 写入由 IM 消息驱动，间隔是秒级（实测 step 最小间隔 2333 ms），两次写入落在同一毫秒几乎不可能；③ 即使漏检一次，下一轮（≤1 s 后）只要再有一次变化就会被发现，最坏是多用 1 s 旧索引。

**建议（二选一，都极小）**：

1. **最小改动（推荐）**：在 `ownership.js` 的 refresh 里加 `lastParseAt`；当戳相等且距上次成功 parse > 5000 ms 时，读一次并 sha256（6.3 KB 全量 **0.121 ms**，5 s 一次 ≈ 0.002% CPU）比对内容，变了就重建。既保留「text 零 I/O + 戳快路径」，又消掉理论缺口。
2. **接受残余风险**：维持纯戳，在代码注释与验收文档写明「同毫秒同尺寸改写可能漏检一轮」，依赖 1 s 周期自愈。

## 7. 对 T4 决议的逐条校验

| T4 决议 | 实测结果 | 判定 | 证据 / 改法 |
| --- | --- | :---: | --- |
| text 调用零 I/O | Map.get 0.17 µs、TTL 判定 0.30 µs，无 stat/read | **成立** | §4 |
| 内存表 + 异步刷新 | 后台 refresh 0.017–0.27 ms；text 路径纯内存 | **成立** | §3 |
| 缓存戳 (path,mtimeMs,size) | 真实路径足以区分；同 tick 同尺寸理论漏检 | **成立（加限定）** | §6；建议加 5 s 静默期 hash 校验 |
| 负结果缓存 ≤2 s | 最小 step 间隔 2333 ms；TTL 2000 ms < 2333 ms | **成立** | §4 |
| fail-soft：ENOENT/坏 JSON/sessions 非对象 → 安全空或沿用 | 20 用例 0 抛；17 例沿用 | **成立** | §5（bot-dir-no-state 的语义边界见分支 2） |
| .tmp 忽略 | 只读固定 state.json；tmp 值未生效 | **成立** | §5 |
| 1:N 取 mtime 最新 | entries=2，winnerIsNewest=true | **成立** | §5 |

唯一需要补的：**戳精度按上述加限定或加 5 s hash 兜底**；其余决议与实测一致。

## 8. 局限与注意

- 全部为 warm FS cache 口径（Windows 无简单清缓存手段）；首轮一次性开销用 warmup 5 抵消。真实宿主首次 refresh 会更高（19:13 粗测 1.426 ms，含模块加载/JIT）。
- 测量期间 IM 会话活跃（bot_caf state.json 1984→2027 B），缓存命中组内 `changedDuringRun=0` 说明该窗口恰好静止；繁忙时 refresh 会多走路由 read+parse。
- Node 版本以 PATH 的 v24.19.0 为准；DSH 桌面包内可能另带 Node，数字应在同一量级。
- 权限用例依赖 Windows ACL（`icacls /deny`）；其他平台需换 chmod 方式。
- fixture 清理后无残留；`--keep-fixtures` 保留时路径会打在 stderr/JSON `meta.fixturesDir`。

## 9. 复现命令

```powershell
# 全量（JSON 到文件 + 人读摘要到 stdout）
node prototypes/persona-inject/measure-state.mjs --json --out D:\Temp\ms-state2.json --min-step-gap-ms 2333

# 只看人读表格
node prototypes/persona-inject/measure-state.mjs --min-step-gap-ms 2333

# 覆盖 DSH_HOME（在测试机上复现）
node prototypes/persona-inject/measure-state.mjs --home C:\Users\<you>\.dsh --iters 200
```

脚本内 `t4Checks` 会自动打印 §7 的判定；`meta.realHomeBefore/After` 记录只读自证（本次 `realHomeUntouched=true`）。