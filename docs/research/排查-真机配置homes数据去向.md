# 排查：真机配置 `homes.json`（16 家 / 6 助理）去向

调查时间：2026-10-15 05:20–05:50（Asia/Shanghai）
调查方式：纯只读（`Get-ChildItem` / `Get-FileHash` / `cmd /c dir` / `git log` / `node` 读文件 / grep）。本文件是本次调查**唯一**写出的文件。
DSH_HOME：`C:\Users\辰辰洋洋\.dsh`（`$env:DSH_HOME` 实测值；`src/index.ts:52` 的取值口径 `config.dshHome ?? process.env.DSH_HOME ?? join(homedir(),'.dsh')` 落到同一处；全机**不存在**第二个 `.dsh`，`D:\Users\辰辰洋洋\` 下没有）。

---

## 结论（一句话）

**这份 `homes.json` 确实存在过（8226 B / 16 家 / 6 助理），但它不是被插件删的、也不是被改名成 `.bak` 的——它是在 2026-10-15 04:19:40 前后一次「整个 DSH_HOME 级数据丢失」中被连根拔掉的，同批被拔掉的还有 `meta.json`、插件日志目录 `logs/dsh-im-companion\`、以及**全部**旧会话转录；插件随后在 05:04:10 首次落盘时，因为已经读不到 `.json`，按「空表诚实兜底」写下了那份 806 B 的空 `homes.yaml`，并且此后每 4–6 分钟用同样的空内容重写一次。**

一句话区分责任：**「清空」是插件干的（可证实的代码路径），「删除」不是插件干的（插件对配置文件根本没有 unlink 能力）**。

---

## 证据链（带绝对路径 + mtime + 字节数）

### 1. 它确实存在过（一手证据，非转述）

| 证据 | 内容 |
|---|---|
| `D:\dsh-plugin\dsh-im-companion\.scratch\t9-pin-2026-10-15\HANDOFF.md:22`（4132 B，mtime 2026-10-15 03:05 前后） | 「`panel.load` 记真值：**02:48:05** `{homes:16, assistants:6, bots:7, ok:true, latencyMs:65}`、**02:54:42** `{…, latencyMs:132}` —— 与磁盘 `C:\Users\辰辰洋洋\.dsh\integrations\dsh-im-companion\homes.json`（**16 家 / 6 助理**）逐项相同 ✓」 |
| GitHub issue #129（T12）「进度」节原文（经 `C:\Users\辰辰洋洋\.dsh\storages\session_projcache\sessions\session-390da634-90f5-48cb-9746-e74ca945240b.json` 可复核） | 「配置目录 = `<DSH_HOME>/integrations/dsh-im-companion/`，现存 `homes.json`（**8226B**）＋ `meta.json`（**35931B**）」 |

⇒ 02:48 时该文件在盘上且内容为 16 家 / 6 助理；`panel.load` 的数字取自**读回的家表**（`tools/verify/log-truth.ts` 的门禁要求，见 `src/log-events.ts:60` 的字段清单 `['homes','assistants','bots','ok','latencyMs']`），不是估算值。

### 2. 现场（2026-10-15 05:28 实测）

```
C:\Users\辰辰洋洋\.dsh\integrations\dsh-im-companion\
    2026/10/15  05:28               806 homes.yaml      ← 只剩这一个
C:\Users\辰辰洋洋\.dsh\integrations\dsh-im\
    2026/10/15  04:41:36             48 interface-language.json
```
- `homes.yaml`：**806 B**，mtime **2026/10/15 05:28:04**，sha256 `EDCE4327E9BDBB7B5C274773A6939045944ABC57817E90BCCE06DF7C79AB0438`。
- 内容 = 插件强制注入的注释块 + `version: 2` / `homes: []` / `assistants: []`（注释块本身证明**这份文件是插件写的**，不是人手搓的）。
- **没有** `homes.json`、**没有** `meta.json`、**没有**任何 `.bak` / `.bak-2` / `.tmp`（`cmd /c dir /s /b /a C:\Users\辰辰洋洋\.dsh\*.bak` 等三条通配全部零命中）。
- **`C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\` 不存在**（`logs\` 下只有 dsh-prompt 972 B、dsh-opencode-palette 1550 B、vision-router 19211 B 与一批 verify 夹具目录 `life-*` / `t-*` / `owner-*` / `custom-b`）。对 `logs\` 全树 grep `homes|assistants` ⇒ **零命中**。

### 3. 关键：整个 `.dsh` 在 04:19:40 前后被重置过

对 `C:\Users\辰辰洋洋\.dsh` 递归扫描「mtime 早于 2026-10-15 00:00」的文件，**只有 3 个**：

```
C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64-0.34.4.node   (2026-10-08)
C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@img\sharp-win32-x64\lib\libvips-42.dll               (2026-10-08)
C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@img\sharp-win32-x64\lib\libvips-cpp-42.dll           (2026-10-08)
```

其余**全部**文件的 mtime 都 ≥ `2026-10-15 04:19:40`。这一条把结论钉死了：

- **旧会话转录全没了**。`C:\Users\辰辰洋洋\.dsh\sessions\--D-dsh-plugin-dsh-im-companion--\` 下只剩 3 份，起跑时间分别是 `session-a2a75322` **04:44:47**、`session-9d1ac9d6` **05:03:00**、`session-390da634` **05:03:09** —— 全部在 04:19 之后。
- **`workspace.json` 也是新的**：`C:\Users\辰辰洋洋\.dsh\storages\workspace.json`（3658 B → 3824 B，mtime 05:31:00）里 **7 个 workspace 的 `createdAt` 全在 2026-10-14T20:33–20:45Z（＝本地 04:33–04:45）**，且没有任何历史/墓碑。而家表在 02:48 时是 **16 家** ⇒ 那 16 个旧工作区在工作区表里已经不存在了，本文件里已找不到它们。
- `C:\Users\辰辰洋洋\.dsh` 根目录 mtime `2026/10/15 05:07:46`；`session_projcache` 里最早的几条（`session-7b1ab77b` / `session-e40bd2e7` / `session-e398dae4`）mtime 恰为 **04:19:40–04:19:42**，是这次断裂的边界时间戳。

### 4. 用户自己报过这件事

父会话（`session-390da634`）的原始 prompt 末尾就是：

> 「刚才DSH出现了全部的session丢失，你能找到刚才任务进行到哪里了吗？」

另一路会话 `session-f0bdc041` 的任务书更是直接叫「取证**「DSH 全部 session 丢失」**这件事本身」。⇒ **这不是插件单点故障，是一次用户已知的 DSH 全量数据丢失**；家表只是同批受害者之一。

### 5. 排除清单（逐条已查、逐条为负）

| 落点 | 结果 |
|---|---|
| `C:\Users\辰辰洋洋\.dsh\integrations\dsh-im-companion\`（含隐藏/系统，`cmd /c dir /a`） | 只有 806 B `homes.yaml`；无 `.bak`/`.tmp`/隐藏文件 |
| Windows 回收站 `C:\$Recycle.Bin\*`（含各 SID 子目录） | 17 个 `$R*` 条目，最新 `2026/10/02`，**今天一个都没有**，无 homes/meta 同名或带序号项 ⇒ **不是 Explorer 删除** |
| `D:\Temp\**\integrations\dsh-im-companion\homes.json` | 命中**上千个**，全部是 verify 夹具（`hcf-dsh-*` / `home-steel-rpc-*` / `home-steel-shape-*` / `hs-*` / `hs-seed-*` / `hs-keep-*` / `hs-t6b-*` / `hs-t6c-*`），几百 B ~ 3.4 KB；**没有一个是 8226 B，路径全含 `temp`** ⇒ 全为夹具，非真机数据 |
| 全盘 `.bak` / `.bak-2` / `*.tmp` | `.dsh` 下**零**；`D:\dsh-plugin\dsh-im-companion` 下仅 `.scratch\root-cleanup-20260905\package.json.bak`（无关） |
| `C:\Users` 全域 `homes.json` / `homes.yaml` | 只有 `...\.dsh\integrations\dsh-im-companion\homes.yaml` 一个；`meta.json` 命中全是 WPS/微信/pi-ai 的无关同名文件 |
| 仓库快照 `.scratch\t9-pin-2026-10-15\`（`tracked-changes.patch`、`tracked-changes-latest.patch`、`untracked/`、`MANIFEST.txt`） | 只有**代码**：`join(dir,'homes.json')` 出现在夹具里（`tracked-changes.patch:4539`、`tracked-changes-latest.patch:4556/4976`），以及 `HANDOFF.md:22` 那句日志摘录。**没有任何家表数据** |
| `D:\Temp\t9-pin-2026-10-15\` | 是产物/源码 pin 快照，无家表 |
| git 历史 | `git log --all --diff-filter=A -- '*homes*'` ⇒ **空**（从没有任何一次提交添加过 homes 文件）；`git log --all -S homes` 的命中全是代码改动。各 `prototype/*`、`research/*` 分支同样无家表样例 |
| `C:\Users\辰辰洋洋\Documents\deepseek-harness\default-workspace\_incident_asar\` | 2026-09-30 的 asar 取证目录，与本次无关 |
| `C:\Users\辰辰洋洋\AppData\Roaming\dsh-desktop\` | 2026-08 的 Electron 残留，无关 |
| 备用 DSH_HOME | 不存在（`D:\Users\辰辰洋洋` 下无 `.dsh`；全机仅一个 `.dsh`） |

### 6. 旁证：这份空 `homes.yaml` 正在被持续重写

同一路径同一 sha256，mtime 却在推进：

| 观测时刻 | 字节数 | sha256 |
|---|---|---|
| 05:04:10 | 806 | `EDCE4327…0438` |
| 05:08:52 | 806 | 同上 |
| 05:15:21 | 806 | 同上 |
| 05:20:10 | 806 | 同上 |
| 05:28:04 | 806 | 同上 |

间隔约 4–6 分钟，**每次内容完全相同**（读空表 → 原样写回），且原子写很干净（不留 `.tmp`）。现场有活跃 DSH 宿主：`DeepSeek Harness` 进程起于 `2026/10/15 04:57:48`（另有多枚 05:16 / 05:22 / 05:39 起的），插件经 desktop profile 的 Junction 挂着 ⇒ 是活着的宿主在周期性落盘。

**这条很重要**：只要这个写者还在跑，任何手工放回 `homes.json` 的动作都会被「读不到 → 空表 → 写 `homes.yaml`」的循环盖掉（见下节 `readConfigText` 的回落顺序）。

---

## 可重建来源评估（逐条给可恢复程度）

| # | 来源 | 现状 | 可恢复程度 |
|---|---|---|---|
| 1 | `C:\Users\辰辰洋洋\.dsh\sessions\**`（会话转录，多帧 zstd） | 本工作区**只剩 3 份**，起跑 04:44:47 / 05:03:00 / 05:03:09，**全部在丢失之后** | **0** —— 02:48 那批日志尾巴与任何家表 dump 都在已消失的转录里 |
| 2 | `C:\Users\辰辰洋洋\.dsh\storages\session_projcache\sessions\**` | 保留了一些**丢失前**会话的投影缓存（`session-7b1ab77b` 30342 B、`session-e40bd2e7` 28053 B、`session-e398dae4` 49090 B，mtime 04:19:40–42），但实测 `homes` / `assistants` / `homes.json` 命中数**全为 0** | **0** —— 只有任务书与回复文本，没有家表 |
| 3 | `C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\`（插件日志） | **目录不存在**；`logs\` 全树 grep `homes|assistants` 零命中 | **0** |
| 4 | `C:\Users\辰辰洋洋\.dsh\storages\workspace.json` | 只剩 7 个 workspace，`createdAt` 全为本地 04:33–04:45，无墓碑/历史 | **仅能解释「为什么会有孤儿家」，不能反推 16 家内容**（那 16 个工作区本身也没了） |
| 5 | `C:\Users\辰辰洋洋\.dsh\storages\usage_history.json`（202063 B，05:33:50） / `vision_router_session_policy\**` | 会话/用量维度 | **0** —— 不含家表字段 |
| 6 | git 历史与各分支 | 从无 `*homes*` 文件入库；`-S homes` 全是代码 | **0** |
| 7 | `.scratch\t9-pin-2026-10-15\` / `D:\Temp\t9-pin-2026-10-15\` | 只有 patch 与 HANDOFF | **0**（但 `HANDOFF.md:22` 可作**计数**佐证） |
| 8 | `D:\Temp\**` 上千份夹具 | 全是测试夹具 | **0** |
| 9 | 回收站 | 无相关条目 | **0** |
| 10 | **人工记忆 + 聚合计数** | `HANDOFF.md:22` 与 #129 进度给出 **16 家 / 6 助理 / 7 机器人** 三个数字 | **仅计数可恢复；名字 / id / 路径 / 绑定关系全部需要用户重建** |

**综合判定：原文件找不回（否）。** 唯一「最靠谱」的重建来源是**用户手上的记忆 ＋ 当前 7 个存活工作区重新 seed**，而不是任何一个磁盘残留——因为磁盘上确实一个字节的家表数据都不剩了。

---

## 代码路径判定（能证实 / 只是可能，带文件:行号）

### A. 能证实：插件**不可能**删除 `homes.json`

1. **全仓唯一的 `fs.rm` 在头像目录里**：`src/host/home-avatar.ts:118`
   ```ts
   await fs.rm(path.join(avatarDirFor(homesFile), name), { force: true })
   ```
   目标被限制在 `avatars/` 之内。`src/` 全域 grep `unlink|rmdir|rm(|rmSync|truncate` 只此一处（其余命中是 UI 图标名 `unlink` 与注释）。⇒ **插件对配置文件没有任何删除原语。**
2. **迁移在旧文件缺席时什么都不做**：`src/host/config-migrate.ts:52`
   ```ts
   if (jsonText === null) return { name, migrated: false, reason: 'no-json', backup: '' }
   ```
   `:16-17` 的 `reason` 值域 `'no-json' | 'yaml-exists' | 'json-invalid' | 'migrated'`；`:63` 注释「目录不存在时逐个回 `no-json`，**不建目录**」。⇒ 迁移既不会删 `.json`，也不会在 `.json` 缺席时凭空造 `.yaml`。
3. **`.bak` 只可能由成功迁移产生**：`src/host/config-migrate.ts:39-45`（`<原名>.bak` → `-2` → `-3`…，绝不覆盖既有备份）。现场无 `.bak` ⇒ **迁移路径根本没被走过**（因为迁移发生前 `.json` 就已经不在了）。
4. **`.yaml` 已存在就跳过迁移**（`config-migrate.ts` 的 `yaml-exists` 分支）——这也排除了「迁移把 yaml 覆盖成空」的可能。

### B. 能证实：存在「静默清空」路径——但它产出的是空 `homes.yaml`，不是删除

调用链（全部在 `src/host/home-store.ts`）：

```
loadHomesDoc(file)            :134-148   ← 读不到/解析不出 ⇒ 静默回空表，且**从不创建文件**
   └─ readConfigText(file)    (config-yaml.ts:69-76)  ← 先读 .yaml，没有再回落同名 .json
      └─ parseConfigText      (config-yaml.ts:46-53)  ← 解析失败回 null
modifyHomesDoc(file, fn)      :151-160   ← 读-改-写，**无条件**落盘
   └─ writeConfigTextAtomic   (config-yaml.ts:79-84)  ← mkdir → 写 .tmp → rename
persistDoc(file, doc)         :162-165   ← 无条件落盘
seedDocs(file, input)         :222-251+  ← input.homes 为空时循环零次，随后仍落盘
```

关键行：

- `src/host/home-store.ts:131`
  ```ts
  return path.join(configDirFor(dshHome), 'homes.yaml')
  ```
- `src/host/home-store.ts:134-148`：`:138` 与 `:146` 两处 `return { ...EMPTY, homes: [], assistants: [] }`（`EMPTY` 定义在 `:42`）——**「诚实兜底」在这里就是「静默空表」**，没有任何日志/告警/副作用，也不创建文件。
- `src/host/home-store.ts:151-160`：`:156`
  ```ts
  await writeConfigTextAtomic(file, renderConfigText(doc, titleForFile(file)))
  ```
  **没有 dirty 检查**——`fn` 即使什么都没改，也会把当前（可能是空的）doc 原样写回。这就是观测到的「每 4–6 分钟重写一次同样空内容」的机制。
- `src/host/home-store.ts:222-251`：`:226` 先 `loadHomesDoc`，`:229` `for (const r of input.homes || [])` 空数组即零次迭代，末尾仍走落盘 ⇒ **`home.seed` 传空表 = 写出一份空 `homes.yaml`**。
- `src/host/config-yaml.ts:69-76` `readConfigText` 的回落顺序（先 `.yaml` 后 `.json`）是**决定性的一条**：**如果 `homes.json` 还在，插件一定读得到它**。插件读到了空 ⇒ **在插件第一次落盘（05:04:10）之前，`homes.json` 就已经不在盘上了**。⇒ 空 yaml 是**结果**，不是**原因**。

**判定**：`homes.json` → 空 `homes.yaml` 的转换**能证实**存在；但它是「读不到旧文件 ⇒ 兜底空表 ⇒ 无条件写回」，**全程没有删除动作、没有 `.bak`、没有日志**——所以它解释了「为什么现在只有空 yaml」，**不解释「为什么 `homes.json` 没了」**。

### C. 只是可能：`homes.json` 消失的机制（无一手证据，不臆断）

现场能确证的只有「04:19:40 前后 `.dsh` 大范围文件消失」这一**现象**。至于触发者，**现有残留物无法区分**，以下均为可能而非结论：

- **可能①：DSH 宿主自身的重置/重装流程**把 `sessions/`、`storages/` 旧内容、`integrations/` 一起重建（`workspace.json` 的 7 个 workspace 全新建于 04:33–04:45 支持这一路）。
- **可能②：用户或外部脚本清理/迁移 `DSH_HOME`**（但**不经回收站** ⇒ 非 Explorer 删除）。
- **可能③：`.dsh` 被整体替换/还原**（3 个 2026-10-08 的 sharp DLL 存活，说明 `profiles/desktop/node_modules` 未被重装或 mtime 被保留，与「整目录删除重建」不完全吻合）。

**能证实与不能证实的边界**：能证实「插件没删、迁移没跑、回收站没有、`.bak` 没有」；**不能证实**具体是谁在 04:19:40 抹掉了 `.dsh` 的大半个树。

---

## 建议动作

**P0 · 先止血（否则重建会被覆盖）**
1. **停掉周期性重写者**：`homes.yaml` 每 4–6 分钟被同样的空内容覆盖一次。在恢复数据之前，先让那个宿主停手（关闭/重启挂载本插件的 DSH 实例，或临时把 desktop profile 的 Junction 摘掉）。**不先做这一步，任何写回都会在几分钟内被空表盖掉。**
2. **立刻冷备现场**：把 `C:\Users\辰辰洋洋\.dsh\integrations\dsh-im-companion\homes.yaml`（806 B）与 `C:\Users\辰辰洋洋\.dsh\storages\workspace.json`（3824 B）复制到库外固定位置（如 `D:\Temp\incident-homes-2026-10-15\`）再动手，留一份「事发态」样本。

**P1 · 修代码（本次真正的产品缺陷）**
3. **`loadHomesDoc` 的「静默空表」必须变成「可观测」**：`src/host/home-store.ts:134-148` 在 `readConfigText` 返回 `null`（即 `.yaml` 与 `.json` **都不存在**）时，应当**记一条 resident 级日志**（如 `home.doc.missing`，带 `file` 原文），并把「文件从未存在」与「文件存在但解析失败」分开（后者走 warn）。理由：本次正是「家表读成 0」而**磁盘上一条日志都没有**，导致事后无法判断是「本来就没有」还是「刚丢的」——这与 #130 抓到的「日志撒谎」是同一类可观测性缺口。
4. **`modifyHomesDoc` / `persistDoc` 加 dirty 守卫**：`src/host/home-store.ts:156` 与 `:163` 无条件落盘，是「空表反复覆盖」的直接原因。建议：doc 为空**且**原文件不存在时，跳过落盘（或只在 `fn` 真改动了 doc 时写）。这条能同时消掉「每 5 分钟一次无意义写盘」。
5. **迁移加一道「旧文件缺席但 yaml 也为空」的显式告警**：`src/host/config-migrate.ts:52` 的 `no-json` 分支目前完全静默。首次运行且两文件皆无时，应当明确记一条日志（否则「首装」与「刚丢数据」在磁盘上完全无法区分）。

**P2 · 重建数据**
6. **别再指望磁盘残留**：本报告第 1–9 条已逐条证伪，`.dsh` 内**没有任何一字节**的家表数据。
7. **可行路径**：让用户在面板里对当前 7 个存活工作区重新「新建家」（`home.seed` 会把 DSH 工作区投影成家），再按记忆补回名字/头像；6 个助理需要按渠道重新绑定机器人。可用的**计数锚点**只有：**16 家 / 6 助理 / 7 机器人**（`HANDOFF.md:22`）。
8. **做一次「现在有几个」的基线**：重建前先记下当前 workspace 数（7）与家数（0），重建后再读一次 `panel.load` 日志核对，避免重演「数字与真相相反」的 #130 形态。

**P3 · 防复发**
9. 家表是**唯一的真机权威数据**且没有第二份副本。建议加一个**低频自动快照**（如每天一次把 `homes.yaml` 复制到 `<配置目录>/snapshots/homes-YYYY-MM-DD.yaml`，保留 N 份），成本极低，但能把这整类事故从「不可恢复」降级为「丢一天」。注意与本仓的「宿主唯一写者」纪律一致（快照也走宿主）。
10. 本次的取证口径（回收站 / `.bak` / `D:\Temp` 夹具甄别 / 多帧 zstd 转录解压）可复用，建议把「真机数据 vs 夹具」的判据（**8226 B 且路径不含 temp** 这类特征，或更稳妥的「路径不含 `hcf-dsh-`/`hs-`/`home-steel-` 前缀」）写进排查手册。

---

### 附：本次调查用到的可复用判据

- **多帧 zstd 转录解压**：`C:\Users\辰辰洋洋\.dsh\sessions\<workspace-key>\session-<uuid>\session.v4.jsonl.zstd` 是 append-only 多帧；按 magic `28 B5 2F FD` 逐帧 `zstdDecompressSync` 再拼接（单次解压只得最后一帧）。现成脚本：`D:\dsh-plugin\dsh-im-companion\.scratch\recover-2026-10-15\dump-sessions.mjs`。
- **夹具甄别**：`D:\Temp\**\integrations\dsh-im-companion\homes.json` 全部来自 verify 测试（目录名前缀 `hcf-dsh-` / `home-steel-rpc-` / `home-steel-shape-` / `hs-` / `hs-seed-` / `hs-keep-` / `hs-t6b-` / `hs-t6c-`），规模几百 B ~ 3.4 KB，**无一为真机数据**。
- **删没删过的三条快速判据**：① 回收站有无同名 `$R*`（Explorer 删除才进回收站）；② 有无 `.bak`（本插件只在成功迁移时产生）；③ 代码里有无 unlink（本仓仅 `src/host/home-avatar.ts:118`，范围限 `avatars/`）。
