# 评估：本仓 pin 的 `dsh-log@0.3.1` → npm 最新 `0.3.4` 能否直接升级

> 调查日期：2026-10-15 · 只读调查（未安装、未改 `package.json`/`package-lock.json`、未跑 `build`/`check`、未碰真机 `~/.dsh`）
> 基线：本仓 `package.json:80` 的 pin `"dsh-log": "0.3.1"`；npm 官方源 `latest` = `0.3.4`
> 一手来源：`registry.npmjs.org` packument + 两个版本的**实际 tarball 产物**（`npm pack` 后解包逐文件比对），不依赖二手叙述

## 0. 结论（TL;DR）

**可以直接升：只改版本 pin，不需要改任何 `src/` / `tools/` 代码。**

一句话判据：**0.3.1 → 0.3.4 的三个中间版本（0.3.2 / 0.3.3 / 0.3.4）全是「公共接口只增不改」**，本仓用到的四个入口的 `.d.ts` **逐字节相同**，全部格式契约与开关契约的实现文件**逐字节相同**；本仓宿主侧的真实装配形状已用 0.3.4 实跑，落盘产物与 0.3.1 等价。

- 风险等级：**低**
- 建议动作：**升级**（改 pin → 装依赖 → `npm run check` 全绿即可）
- 唯一需要「顺手处理」的是**文档口径**（`AGENTS.md` 里已失效的一条无害提示说明），不是代码

## 1. registry 事实

### 1.1 版本与发布时间（`npm view dsh-log time --registry=https://registry.npmjs.org`）

| 版本 | 发布时间（UTC） | 发布时间（Asia/Shanghai） | 相对本仓 pin |
|---|---|---|---|
| 0.2.0 | 2026-09-12T01:37:48.976Z | 2026-09-12 09:37 | 更早 |
| 0.2.1 | 2026-09-12T04:04:23.476Z | 2026-09-12 12:04 | 更早 |
| 0.2.2 | 2026-10-08T01:22:44.148Z | 2026-10-08 09:22 | 更早 |
| 0.3.0 | 2026-10-14T04:47:56.247Z | 2026-10-14 12:47 | 更早 |
| **0.3.1** | **2026-10-14T11:40:16.913Z** | **2026-10-14 19:40** | **← 本仓当前 pin** |
| 0.3.2 | 2026-10-14T17:37:04.751Z | 2026-10-15 01:37 | 中间版本 |
| 0.3.3 | 2026-10-14T20:01:34.359Z | 2026-10-15 04:01 | 中间版本 |
| 0.3.4 | 2026-10-14T21:24:40.306Z | 2026-10-15 05:24 | **npm latest** |

`dist-tags`：`{"latest": "0.3.4"}`（只有一个 tag，没有 `next`/`beta`）。

**关键观察**：0.3.2 / 0.3.3 / 0.3.4 三版在 **7 小时 44 分内**连续发出（本仓接入 0.3.1 之后约 10 小时内）。所以「升到最新」实际是**跨三个版本**的增量，不是只吃 0.3.4 那一版——下面的 diff 都是对 0.3.1 的**累积**比对。

### 1.2 包元数据（`npm view dsh-log@0.3.4 --json`）

| 项 | 0.3.1 | 0.3.4 | 判定 |
|---|---|---|---|
| `dependencies` | 无（空） | 无 | **零运行时依赖，未引入新依赖** |
| `engines` | `{"node": ">=22"}` | `{"node": ">=22"}` | **未抬高**（本机 node `v24.19.0`） |
| `exports` | `.` / `./host` / `./node` / `./client` | 同左（四项，逐字节同形状） | **未变** |
| `main` / `types` | 无 `main`；`types: ./dist/index.d.ts` | 同左 | 未变 |
| `type` | `module` | `module` | 未变 |
| `bin` | `{"dsh-log": "./dist/cli.js"}` | `{"dsh-log": "dist/cli.js"}` | 仅去掉前导 `./`，**同一文件** |
| `repository` | `git+https://github.com/FeatherHunter/dsh-log.git` | 同左 | 未变 |
| `license` | MIT | MIT | 未变 |
| `dist.shasum` | `310cc6b0008606e45550b3efabe54c1600eceb13` | `bf96adf270860bf424f86d212b3d6f9e6f8c1541` | — |
| `dist.integrity` | — | `sha512-uCG6sLTze5YjmZmLln2KAeCCepsKvzGhnpZmkym/3OKNOsMKH5sA2lunwrLoOfmLxxju3/ZkKQmLp76Fklpw2w==` | — |
| `gitHead` | — | `beec238c5bb467c0fce93f9822e69cc540e32d9f` | — |
| 包体积 / 文件数 | 155.7 kB / 103 files / 解包 464.3 kB | 170.6 kB / 109 files / 解包 502.5 kB | +6 文件（见 §2.1） |

`package.json` 整体逐行 diff 只有三处：`version`、`description`（补了新版本说明）、`bin`（去 `./`）。**没有 exports / deps / engines 的改动。**

## 2. 逐文件 diff（0.3.1 解包 vs 0.3.4 解包）

解包位置：`D:\Temp\dsh-log-probe-0.3.1\pkg031\`、`D:\Temp\dsh-log-probe-0.3.4\pkg034\`
（命令：`npm pack dsh-log@<ver> --registry=https://registry.npmjs.org` → `tar -xzf`）

### 2.1 文件集合差异

| 类别 | 文件 |
|---|---|
| **仅 0.3.4 新增**（6 个） | `dist/cli/export.d.ts`、`dist/cli/export.js`、`dist/core/log-digest.d.ts`、`dist/core/log-digest.js`、`dist/core/startup-header.d.ts`、`dist/core/startup-header.js` |
| **仅 0.3.1 有**（被删） | **无**（没有任何文件被移除） |

> 包内**没有 `CHANGELOG` 文件**；版本沿革写在 `README.md` §10「版本策略」（0.3.4 的 README 第 674–707 行逐版列了变更与升级方式），`INTEGRATION.md` 的**章节标题逐条相同**（无新增必做步骤）。

### 2.2 四个公开入口：`index` / `host` / `node` / `client`

| 入口文件 | 0.3.1 vs 0.3.4 |
|---|---|
| `dist/index.d.ts` | **IDENTICAL** |
| `dist/index.js` | **IDENTICAL** |
| `dist/host.d.ts` | **IDENTICAL** |
| `dist/host.js` | **IDENTICAL** |
| `dist/node.d.ts` | **IDENTICAL** |
| `dist/client.d.ts` | **IDENTICAL** |
| `dist/client.js` | **IDENTICAL** |
| `dist/node.js` | **DIFFERS**（唯一有改动的入口实现，见 §2.4） |

**这是「能直接用」的最强静态证据**：本仓所有 `import ... from 'dsh-log'` / `'dsh-log/host'` / `'dsh-log/node'` / `'dsh-log/client'` 的类型面（`.d.ts`）与三个入口的运行时实现**一字未改**。

公开导出的符号清单（`dist/index.d.ts`，两版相同）包含本仓可能用到的全部：`LOG_FORMAT_VERSION`、`EVENT_LEVELS`、`EVENT_KINDS`、`LOG_DEBOUNCE_MS`、`DEFAULT_MAX_QUEUE`、`DEFAULT_MAX_SIZE`、`DEFAULT_MAX_DAYS`、`CLIENT_BATCH_MAX`、`CLIENT_BATCH_INTERVAL_MS`、`CLIENT_PACKET_BYTES`、`CLIENT_QUEUE_MAX`、`LEGACY_LOG_DIR_NAME`、`LEGACY_SWITCH_FILE_NAME`、`assertPluginId`、`resolveHostLogConfig`、`resolveClientLogConfig`、`PHONE_ACTIONS`、`LOG_QUERY_ACTION_SUFFIX`、`buildPhoneName`、`buildPhoneNames`、`buildLogQueryPhoneName`、`parseLogFileName`、`listLogFiles`、`logFilesOfDate`、`matchExportFileName`、`formatDailyFileName`、`formatFourSegmentFileName`、`resolveLogFileName`、`parseEventListManifest`、`checkEventFields`、`lintEventFields`、`computeEventCounts`，以及 **`parseLogLine` / `formatRow` / `formatRows`**（类型 `ParsedLogRow` / `FormatRowOptions`）。

`dist/host.d.ts` 导出（两版相同）：`buildPhoneName`、`buildPhoneNames`、`resolveHostLogConfig`、`lintEventFields`、`computeEventCounts`、**`LOG_FORMAT_VERSION`**、`buildLogQueryPhoneName`、`LOG_QUERY_ACTION_SUFFIX`、`parseLogFileName`、`listLogFiles`、`logFilesOfDate`、`parseEventListManifest`、`checkEventFields`、`LOG_DEBOUNCE_MS`、`LOG_DIR_NAME`、`LOG_SWITCH_FILE`、`formatDailyFileName`、`formatLogFileName`、`createLogStore`、`aggregateLogQuery`、**`interface HostLog`**、**`createHostLog(deps: LogStoreDeps, configInput: HostLogConfigInput): HostLog`**、**`interface PhoneRegistry`**、`HOST_LOG_PHONE_ACTIONS`（6 项：`logBatch`/`logExport`/`logClear`/`logGetSwitch`/`logSetSwitch`/`logQuery`）、`registerHostLogPhones(registry, hostLog)`。

`dist/node.d.ts` 导出（两版相同）：**`createNodeFileService`**、**`createNodeTimer`**、`createNodeHostLog`、`createQuickLog`，类型 `NodeReadyReport`、`NodeCacheDirDeps`、`HostLog`、`HostLogConfigInput`、`PhoneNameMap`、`LogFileService`、`LogStore`、`LogStoreDeps`、`LogTimer`。

### 2.3 改动的 `.d.ts`（全部只增不改）

| 文件 | diff 内容 | 性质 |
|---|---|---|
| `dist/store.d.ts` | 新增 `trace: (input?: {traceId?; spanId?}) => HostTrace`；`writeStartupHeader()`/`getHeaderInfo()` 返回类型由 `{pid,startedAt,dir}` 换成更宽的 `StartupHeader`（加 `pluginVersion`/`os`）；`handleLogExport` 摘要里 `header` 同左 | **只增字段**（函数名/入参不变；返回类型是**加宽**，对只读 `pid`/`startedAt`/`dir` 的调用方向后兼容） |
| `dist/config/resolve.d.ts` | `HostLogConfigInput` 新增**可选** `pluginVersion?: string`；解析结果多 `pluginVersion: string` | 只增可选键 |
| `dist/core/read-row.d.ts` | 新增 `export declare function formatLocalTime(ts: number): string` | 只增导出。**`parseLogLine` / `formatRow` / `formatRows` / `ParsedLogRow` / `FormatRowOptions` 签名一字未改** |
| `dist/core/trace.d.ts` | 新增 `HostTraceInput` / `HostTrace` / `createHostTrace`；`RelocatedFields` 多一个 `reservedMoved: boolean` | 只增 |
| `dist/phones.d.ts`、`dist/host/types.d.ts`、`dist/host/files.d.ts` | 仅把内联的 `header: {pid,startedAt,dir}` 换成 `import(...).StartupHeader` | 类型等价加宽 |
| `dist/cli/args.d.ts` | `command: 'tail' \| 'export'`；`USAGE` 文本扩写 | CLI 面，见 §4 |
| `dist/cli/tail.d.ts` | 仅注释（去掉「（logs-*）」） | 注释 |

### 2.4 改动的 `.js` 实现（逐条判定对本案的影响）

| 文件 | 改动实质 | 对本仓影响 |
|---|---|---|
| `dist/node.js` | **`createNodeHostLog` 建库时自动 `await store.writeStartupHeader()`**（try/catch 包裹，写不出去不拦建库）；deps 里补 `getPlatform: () => ({ os: process.platform })` | **无影响**——本仓用的是 `createHostLog`（`dsh-log/host`），**不是** `createNodeHostLog`。已实跑证实（§5.2）：不产生额外的 `host.start` 行 |
| `dist/store.js` | ① `writeStartupHeader()` 改为**幂等**（同实例再调不写第二行）、载荷扩为 `{pid,startedAt,dir,pluginVersion?,os?}`（空值不进行）；② 新增 `trace()`（`createHostTrace` 包装） | **无影响**——本仓不调 `writeStartupHeader`，也不调 `trace()`。`store.log()` / `loadSwitch()` / `setSwitch()` / `synced()` / `getDroppedCount()` 实现未动 |
| `dist/client/write.js` | 影子行与 `shadowWarns` 计数改为只在 `relocated.reservedMoved`（调用方**真的传了**保留字）时触发；只传 `fields._shadow` 不再计数、不再多写 `log.trace.shadow`。`fields._shadow` 仍原样保留 | **无影响**——本仓客户端**刻意不**把 `traceId` 打进 `logLine` 的 fields（见 `docs/research/T9-客户端traceId贯通取证.md:15`、`:100` 方案 a 的否决理由），所以这条分支对本仓是死代码 |
| `dist/config/resolve.js` | 新增 `resolvePluginVersion()`：可选自由文本、trim、上限 64 字符、非字符串抛中文错 | **无影响**——本仓没传 `pluginVersion`，走 `undefined ⇒ ''` 分支 |
| `dist/core/read-row.js` | 仅把内部 `formatLocalTime` 改为 `export`（供目录摘要复用）。渲染逻辑未动 | **无影响**，渲染输出已实测逐字相同（§5.3） |
| `dist/core/trace.js` | `relocateReservedFields()` 只多返回 `reservedMoved`；新增 `createHostTrace()` | **无影响**——搬迁逻辑本身未改（diff 只有标记位与新增函数） |
| `dist/host/files.js` | 导出摘要的 `pluginVersion` 由硬编码 `'unknown'` 改为取 `headerInfo.pluginVersion \|\| 'unknown'` | **无影响**——本仓不调 `writeStartupHeader` ⇒ `headerInfo` 恒为 `null` ⇒ 仍是 `'unknown'`，与 0.3.1 行为一致 |
| `dist/cli.js` | 增加 `export` 子命令分发 | CLI 面，见 §4 |
| `dist/cli/args.js` | 子命令**真被识别**（修 0.3.1 的 `没找到日志目录：tail`）；`export` 拒绝筛选类选项 | CLI 面，见 §4 |
| `dist/cli/tail.js` | 仅注释：把「目录发现不要求 `logs-` 前缀」写成契约 | 行为未变（§5.3 实测） |
| 新增 `dist/core/log-digest.js`、`dist/core/startup-header.js`、`dist/cli/export.js` | 目录摘要 / 启动头形状 / `export` 子命令 | 新功能，本仓未使用 |

### 2.5 格式与契约实现：**逐字节相同**

这是「格式不变」的硬证据——下列文件在两个版本里 **hash 完全一致**：

```
dist/config/constants.js        dist/config/constants.d.ts     dist/config.js
dist/config/log-names.js        dist/config/phones.js          dist/config/validate.js
dist/config/event-list.js       dist/engine/switch-file.js     dist/engine/rotation.js
dist/engine/dir-lease.js        dist/engine/pipeline.js        dist/engine/io.js
dist/core/retention.js          dist/core/row.js               dist/core/level.js
dist/core/resident.js           dist/core/admission.js         dist/core/file-name.js
dist/core/ids.js                dist/core/outcome.js
dist/platform/fs-node.js        dist/platform/timer-node.js    dist/platform/read-node.js
dist/platform/later.js          dist/host/query.js             dist/host/aggregate.js
dist/host/context.js            dist/phones.js
dist/client/send.js             dist/client/forward.js         dist/client/switch-ops.js
dist/client/trace.js            dist/client/switch-cache.js    dist/client/transport.js
```

⇒ **行格式（`core/row.js`）、开关文件（`engine/switch-file.js`）、轮转（`engine/rotation.js`）、保留（`core/retention.js`）、目录租约（`engine/dir-lease.js`）、常量（`config/constants.js`）、宿主查询（`host/query.js`）六条契约线全部未动。**

### 2.6 常量实值（两版相同，取自 `dist/config/constants.js`）

```js
LOG_DEBOUNCE_MS = 1000            DEFAULT_MAX_QUEUE = 1000
DEFAULT_MAX_SIZE = 5 * 1024 * 1024   DEFAULT_MAX_DAYS = 14
CLIENT_BATCH_MAX = 50             CLIENT_BATCH_INTERVAL_MS = 1000
CLIENT_PACKET_BYTES = 128 * 1024  CLIENT_QUEUE_MAX = 100
LEGACY_LOG_DIR_NAME = 'logs'      LEGACY_SWITCH_FILE_NAME = 'log-switch.json'
PHONE_ACTIONS = ['logBatch','logExport','logClear','logGetSwitch','logSetSwitch']
EVENT_KINDS = ['resident','ondemand','selfmon']
```

行格式版本：`dist/core/row.js` → `export const LOG_FORMAT_VERSION = 3;`（两版**相同**，`core/row.js` hash 一致）。
`dist/store.js` 里 `LOG_DIR_NAME = LEGACY_LOG_DIR_NAME`（`'logs'`）、`LOG_SWITCH_FILE = LEGACY_SWITCH_FILE_NAME`（`'log-switch.json'`），两版相同——这两个只是**默认值**，本仓显式覆盖（见 §3）。

## 3. 本仓调用点清单逐个核对

`grep -rn "dsh-log" package.json src tools` 的全部命中（`package-lock.json` 另计）：

### 3.1 依赖声明

| 位置 | 内容 |
|---|---|
| `package.json:80` | `"dsh-log": "0.3.1"`（`dependencies` 内唯一的 dsh-log 行） |
| `package-lock.json:12` | `"dsh-log": "0.3.1",`（根依赖表） |
| `package-lock.json:1050-1056` | `node_modules/dsh-log`：`resolved` = `.../dsh-log-0.3.1.tgz`、`integrity`、`bin` |

> **注意**：`package.json` 里的 `check:update-pkg` / `sync:update-pkg` 只校验 **`dsh-plugin-update`**（`scripts/sync-update-pkg.mjs`），**没有**任何门禁要求 `dsh-log` 跟随 latest。所以这次升级是**可选**的，不是被门禁逼出来的。

### 3.2 `src/` 调用点（逐个核对 0.3.4 是否仍导出、同名同签名）

| 调用点 | 用的符号 | 入口 | 0.3.4 判定 |
|---|---|---|---|
| `src/host/log.ts:16` | `createHostLog`、`registerHostLogPhones`、`HostLog`(type)、`PhoneRegistry`(type) | `dsh-log/host` | ✅ 同名同签名（`host.d.ts` 逐字节同） |
| `src/host/log.ts:17` | `createNodeFileService`、`createNodeTimer` | `dsh-log/node` | ✅ 同名同签名（`node.d.ts` 逐字节同） |
| `src/client/log.ts:12` | `createClientLog`、`ClientLog`(type) | `dsh-log/client` | ✅ 同名同签名（`client.d.ts` 逐字节同） |
| `src/client/data/rpc.ts:6` | `buildLogQueryPhoneName`、`buildPhoneNames` | `dsh-log/client` | ✅ 同名同签名；实跑输出一致（§5.4） |
| `src/host/log.ts:41-50` | `createHostLog(deps, configInput)` 的 **deps 键**：`fs` / `timer` / `getCacheDir` / `DEFAULT_CWD` | — | ✅ `LogStoreDeps` 两版**逐字节同**（全部可选，**没有新增必填键**） |
| `src/host/log.ts:44-48` | **configInput 键**：`pluginId` / `prefix` / `logDirName` / `switchFileName` / `eventList` | — | ✅ 全部保留；0.3.4 只**新增可选** `pluginVersion` |
| `src/host/log.ts:51-64` | `store.loadSwitch()` / `store.setSwitch()` / `store.log()` / `store.synced()` / `store.getDroppedCount()` | — | ✅ 五个方法实现未动（`store.js` diff 只碰 `writeStartupHeader` 与新增 `trace`） |
| `src/log-events.ts:102-107` | `LOG_EVENT_LIST = {version, pluginId, events}` 交给包的 `eventList` | — | ✅ `parseEventListManifest` / `computeEventCounts` 两版输出一致（§5.4） |
| `src/host/rpc.ts:71` | 注释列出 6 个电话名 | — | ✅ `HOST_LOG_PHONE_ACTIONS` 两版相同（6 项） |

**`logSetSwitch` 核对**：本仓**不按名字 import** `logSetSwitch`——它走 `registerHostLogPhones(registry, hostLog)` 由包自己注册（`src/host/log.ts:62`），电话名由 `buildPhoneNames` 派生。实跑证实 6 个电话名两版逐字相同（§5.4）：`dsh-im-companion.logBatch` / `.logExport` / `.logClear` / `.logGetSwitch` / `.logSetSwitch` / `dsh-im-companion.logQuery`。

**`parseLogLine` / `formatRow` 核对**：`src/` 内**没有**调用点（`grep` 只命中 `src/host/rpc.ts:71` 的注释）；它们出现在 `tools/verify/log-truth.ts:132-136` 的「经 CLI 渲染读回」路径上。两版导出签名相同（`read-row.d.ts` 只多 `formatLocalTime`）。

### 3.3 `tools/` 调用点

| 位置 | 用法 | 0.3.4 判定 |
|---|---|---|
| `tools/verify/log-pipeline.ts:41-42` | `await import('dsh-log')` / `await import('dsh-log/client')`，用 `parseEventListManifest` / `computeEventCounts` / `createClientLog` | ✅ 全在 |
| `tools/verify/log-pipeline.ts:38` | `symlinkSync(REPO/node_modules → <tmp>/node_modules, 'junction')` | ✅ 目录级 junction，与版本无关 |
| `tools/verify/log-truth.ts:132-135` | `execFileSync(node, [<repo>/node_modules/dsh-log/dist/cli.js, 'tail', dir, '-n', '20'])` | ✅ `dist/cli.js` 路径与文件名**未变**；断言 `out.includes('build=' + realId)` 实测仍成立（§5.3） |
| `tools/verify/log-truth.ts:134` 注释 | 「首行 `没找到日志目录：tail` 是无害提示」 | ⚠️ **注释失效**（0.3.4 已修掉该行），断言本身不受影响 |
| `tools/verify/features/log-trace-bridge.ts:63` | `req('dsh-log/client')` 取 `buildPhoneNames` / `buildLogQueryPhoneName` | ✅ |
| `tools/verify/features/log-trace-bridge.ts:139` | 断言链 id 是 16 位十六进制（`core/ids.genHex(16)`） | ✅ `core/ids.js` hash 相同 |
| `tools/verify/features/update-host.ts:57`、`update-center.ts:112`、`welcome-banner.ts:36`、`presence.ts:31`、`session-header-model.ts:18` | 各把 `node_modules/dsh-log` 以 junction 链进临时产物目录 | ✅ 目录级链接，与版本无关 |

## 4. CLI 契约变化（含那条无害毛病）

### 4.1 `没找到日志目录：tail` —— **0.3.4 已修，实跑证实**

`dist/cli/args.js` 的改动（原文注释）：

> 子命令：帮助里就是这么写的，所以必须真认它——否则 `tail` 会被当成一个目录名，于是每次带子命令调用都白吐一行「没找到日志目录：tail」（2026-10-15 用户实测报的缺陷）。**只认第一个位置参数上的那一个**：`dsh-log tail tail` 里的第二个仍是目录名（可以叫 tail 的目录）。

```js
if ((arg === 'tail' || arg === 'export') && !subcommandSeen && options.paths.length === 0) {
    subcommandSeen = true;
    options.command = arg;
    continue;
}
```

**实跑对照**（同一份目录，`--no-color`）：

| 调用 | 0.3.1 | 0.3.4 |
|---|---|---|
| `dsh-log tail <dir> -n 20` | 两行渲染 + 末行 `dsh-log: 没找到日志目录：tail` | **两行渲染，stderr 干净** |
| `dsh-log <dir>`（省略子命令） | 同上（含噪声行） | 同上（无噪声行） |
| 退出码 | `0` | `0` |

⇒ 0.3.1 的「无害毛病」**已消失**；`AGENTS.md` 里那句「别当故障」的说明可以删掉。

### 4.2 新增 `export` 子命令（本仓未用，纯增量）

- `dsh-log export <目录...> [--json]`：产出「目录摘要 + 原始行」的自包含文本。
- 筛选类选项（`--follow` / `--level` / `--since` / `--trace` / `--limit`）对 `export` **当场报错**，不静默忽略。
- `--json` 输出摘要对象（多目录为 NDJSON）。

### 4.3 目录发现契约（行为未变，只是写进文档）

`dist/cli/tail.js` 的注释从「给根目录就往下看一层（logs-*）」改为「给根目录就往下看一层」，并明确：**目录名不要求带 `logs-` 前缀**，发现逻辑只认「里面有没有日志文件」。

本仓落点是 `<DSH_HOME>/logs/dsh-im-companion/`（**无** `logs-` 前缀）。**实跑证实两版都能认**（给根目录 `...\logs` 时，0.3.1 与 0.3.4 都正确渲染出了 `dsh-im-companion/` 子目录里的行）——所以这里**没有需要利用的修复**，0.3.3 只是把既有行为补了回归线。

### 4.4 `bin` 字段 `./dist/cli.js` → `dist/cli.js`

仅去掉前导 `./`，指向同一文件。`npx dsh-log` 的 shim 生成两版等价；`tools/verify/log-truth.ts:132` 用的是字面路径 `<repo>/node_modules/dsh-log/dist/cli.js`，**不受影响**。

## 5. 实证（不是只读 diff）

### 5.1 类型面：把本仓**真实源码**对 0.3.4 的 `.d.ts` 编译

用本仓自带的 `node_modules/typescript/bin/tsc`，以 `paths` 把 `dsh-log` 四个入口指向 `D:\Temp\dsh-log-probe-0.3.4\pkg034\dist\*.d.ts`，`--noEmit`：

| 目标 | 配置 | 结果 |
|---|---|---|
| 宿主：`src/index.ts` + `src/host/**/*.ts`（照 `tsconfig.json` 的 include/exclude） | `D:\Temp\dsh-log-types-probe\tsconfig.host034.json` | **exit 0** |
| 客户端：全部 `src/client`（照 `tsconfig.client.json`） | `D:\Temp\dsh-log-types-probe\tsconfig.client034.json` | **exit 0** |

**解析来源自证**（`--listFiles`）：宿主探针读到的 dsh-log 声明文件**全部**是 `D:/Temp/dsh-log-probe-0.3.4/pkg034/dist/**`（含新增的 `core/startup-header.d.ts`），**没有一条**来自 `dsh-im-companion/node_modules/dsh-log`；客户端探针同理。

> 诚实说明一个坑：单纯「跑通」不足以证明验的是 0.3.4——若 `paths` 指向不存在的目录，TS 会**静默回退**到 `node_modules`（本仓现装的 0.3.1），此时 exit 0 是假绿。故上面的结论以 `--listFiles` 的**实际读入清单**为准，不以 exit code 单独为准。

### 5.2 运行时：用本仓 `src/host/log.ts` 的**同一种装配形状**真落盘

探针 `D:\Temp\dsh-log-cli-probe\probe.mjs`（内容：以 `createHostLog` + `createNodeFileService` + `createNodeTimer` + `getCacheDir`/`DEFAULT_CWD` + `{pluginId, prefix, logDirName, switchFileName, eventList}` 建库，复刻 `src/host/log.ts:41-56` 的 `mkdir` → `loadSwitch()` → `setSwitch()` 次序，再 `log('info','host.start',{route,dshHome,build})`、`log('info','panel.load',...)`、`log('debug','host.rpc.call',...)`，最后 `synced()`），分别对 `pkg031` / `pkg034` 各跑一次：

| 检查项 | 0.3.1 | 0.3.4 | 判定 |
|---|---|---|---|
| 落点 | `<root>/logs/dsh-im-companion/2026-10-15.log` | 同左 | ✅ |
| 磁盘 JSONL | `{"v":3,"ts":…,"level":"info","event":"host.start","fields":{…}}` | **逐字同形** | ✅ 行格式未变 |
| 行数 | 2（`debug` 行按预期被开关挡下） | 2 | ✅ resident/ondemand 判定未变 |
| 是否多出自动 `host.start` | 无 | **无** | ✅ **关键**：本仓用 `createHostLog`，不走 `createNodeHostLog`，故 0.3.3 的「自动写启动头」**不触发** |
| 开关文件 | `<root>/logs/log-switch-dsh-im-companion.json` = `{"enabled":false}` | **同路径、同内容** | ✅ 文件名与形状未变 |

### 5.3 CLI 渲染：`build=` 仍读得出来

同一份 0.3.4 落盘目录，两版 CLI：

```
2026-10-15 14:49:40.217 INFO  host.start              (route=/api/im-companion, dshHome=…, build=v9.9.9@2026-10-15T06:00:00Z)
2026-10-15 14:49:40.217 INFO  panel.load              (homes=14, assistants=6, bots=3, ok=true, latencyMs=42)
```

两版**渲染逐字相同**（含 `build=…`）⇒ `tools/verify/log-truth.ts:136` 的 `out.includes('build=' + realId)` 仍成立。`--json` 输出也逐字相同（原始行原样）。

### 5.4 用本仓**真实事件清单**跑 0.3.4 的校验面

探针 `D:\Temp\dsh-log-cli-probe\events-probe.mjs`（把 `src/log-events.ts` 用本仓 tsc 转译到 `D:\Temp\dsh-log-events-probe\`，再喂给两个版本），输出**完全一致**：

| 项 | 0.3.1 | 0.3.4 |
|---|---|---|
| `parseEventListManifest(...)` → `version` / `pluginId` | `1` / `dsh-im-companion` | 同 |
| `computeEventCounts(...)` | `{"resident":36,"ondemand":8,"selfmon":0}` | 同 |
| `isEnabled('info','client.start')` | `true` | 同 |
| `isEnabled('info','not.declared.event')` | `false` | 同 |
| `isEnabled('error','not.declared.event')` | `true` | 同 |
| `isEnabled('warn','not.declared.event')` | `true` | 同 |
| `LOG_FORMAT_VERSION` | `3` | 同 |
| `PHONE_ACTIONS` | 5 项 | 同 |
| `buildPhoneNames(LOG_PLUGIN_ID)` | `.logBatch/.logExport/.logClear/.logGetSwitch/.logSetSwitch` | 同 |
| `buildLogQueryPhoneName(LOG_PLUGIN_ID)` | `dsh-im-companion.logQuery` | 同 |

⇒ `tools/verify/log-pipeline.ts` 的第 1 步（清单合法）与第 4 步（resident 三态）在 0.3.4 下**逐项成立**。

## 6. 风险点清单

### 6.1 无风险（有硬证据）

| # | 项 | 证据 |
|---|---|---|
| R0-1 | **落盘格式不变** | `core/row.js` hash 相同、`LOG_FORMAT_VERSION = 3` 相同；真落盘 JSONL 逐字同形 |
| R0-2 | **既有真机日志仍可读** | 行格式与 `host/query.js`（hash 相同）、`core/read-row.js`（仅多加一个 export）均未改 ⇒ 旧日志对新读侧完全可读 |
| R0-3 | **开关文件名与形状不变** | `engine/switch-file.js` hash 相同、`config/resolve.js` 只加 `pluginVersion`；实跑落出同一路径同一内容 |
| R0-4 | **轮转与保留策略不变** | `engine/rotation.js`、`core/retention.js`、`config/constants.js`（`5MB` / `14 天`）hash 全部相同 |
| R0-5 | **单写者租约行为不变** | `engine/dir-lease.js` hash 相同 |
| R0-6 | **无新依赖、无 node 抬高** | `dependencies` 两版皆空；`engines.node` 两版皆 `>=22`（本机 v24.19.0） |
| R0-7 | **公开 API 无删除、无改名** | 四入口 `.d.ts` 逐字节相同；无文件被移除 |
| R0-8 | **本仓门禁的 CLI 断言仍成立** | `log-truth.ts` 的 `build=` 断言实跑通过；`dist/cli.js` 路径未变 |

### 6.2 低风险 / 需顺手处理的（文档口径，不影响门禁）

| # | 项 | 影响 | 处置 |
|---|---|---|---|
| R1-1 | `AGENTS.md` 的「日志系统」段写着「0.3.1 的 CLI 每次会先打一行 `dsh-log: 没找到日志目录：tail` 的无害提示……别当故障」 | 升级后该说明**失效**（噪声已除）。**不影响任何断言**（该行走 stderr；`execFileSync` 默认只捕获 stdout） | 升级同批把这句话删掉 |
| R1-2 | `tools/verify/log-truth.ts:134` 的注释「首行 `没找到日志目录：tail` 是无害提示」 | 注释失效，断言不受影响 | 可顺手改注释（非必须） |
| R1-3 | `AGENTS.md` 记的开关形状 `{"enabled":false,"sampleRate":1}` | **与 0.3.1 就不符**：真机实际是 `{"enabled":false}`（`sampleRate` 在 0.3.0 已删，见包内 README §开关一节）。**与本升级无关**，是既有文档漂移 | 单独订正 |
| R1-4 | `dist/node.js` 起 `createNodeHostLog` 会自动写 `host.start` | 本仓不受影响（用的是 `createHostLog`）。**若将来改用 `createNodeHostLog`**，会与本仓自己那条 `host.start`（`src/index.ts:129`，带 `route`/`dshHome`/`build`）**重复**，且 0.3.4 的摘要取**最后一条** ⇒ 会读到包的启动头而丢掉 `build` | **不要**改用 `createNodeHostLog`；也**不要**调 `store.writeStartupHeader()` |
| R1-5 | 0.3.4 新增的「目录自述」对本仓目录会显示一片 `unknown` | 新功能（0.3.1 没有），**不是回归**。实跑 `dsh-log export <dir>` 输出：`启动头: pid=0 startedAt=unknown dir=unknown pluginVersion=unknown os=unknown` / `开关: unknown` / `读不出来: pid, startedAt, dir, pluginVersion, os, logSwitch`。原因两条：① 本仓不调 `writeStartupHeader`（自述行由包的 `createNodeHostLog` 自动写，本仓不用）；② 开关文件在**父目录** `<DSH_HOME>/logs/` 下，不在插件目录内，摘要只看该目录自身 | 可选改进，见 §7.3；**不影响升级** |
| R1-6 | 0.3.4 的 README 第 668 行仍写「官方源最新是 **0.3.2**」 | 上游文档陈旧（包内自述与 registry 不符），与 `dist-tags.latest = 0.3.4` 矛盾 | 记录在案；不阻塞（该行是上游发布流程说明，不影响接口） |

### 6.3 未证实项（诚实标注）

1. **`npm run check` 未在 0.3.4 下实跑过**——调查纪律禁止 `npm install` 与 `npm run build/check`（两者都会动 `lib/`，真机宿主正在用）。本报告的「全绿」推论建立在：① 四入口 `.d.ts` 逐字节相同；② 本仓真实源码对 0.3.4 类型编译 exit 0（且 `--listFiles` 证实真读了 0.3.4）；③ 两条日志门禁的关键断言面用真清单/真落盘/真 CLI 逐一实测。**真正的全绿读数需在升级动作里由 `npm run check` 给出。**
2. **未跑真机**：全程未读、未写 `C:\Users\辰辰洋洋\.dsh\`（按纪律回避），故「0.3.4 读旧日志」只在 `D:\Temp` 的合成目录上验过，未在真机既有日志目录上验过。
3. **0.3.2 相对 0.3.1 的完整改动面**未单独解包比对（只比了 0.3.1↔0.3.4 的两端）。不过 §5 的实测是**对 0.3.4 最终产物**做的，两端比对已足以回答「能不能直接用」。
4. `dsh-log` 的 `tests/` 不随包发布（tarball 里只有 `dist/` + 两份文档 + `event-list.template.json`），故未能用包自带测试反证。

## 7. 动作清单

### 7.1 必须做的（升级动作，仅 2 个文件、共 3 处）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `package.json:80` | `"dsh-log": "0.3.1"` → `"dsh-log": "0.3.4"` |
| 2 | `package-lock.json:12` | 由 `npm install dsh-log@0.3.4 --save-exact` 自动改写为 `"0.3.4"` |
| 3 | `package-lock.json:1050-1056` | 同上，`resolved` 改为 `https://registry.npmjs.org/dsh-log/-/dsh-log-0.3.4.tgz`、`integrity` 改为 `sha512-uCG6sLTze5YjmZmLln2KAeCCepsKvzGhnpZmkym/3OKNOsMKH5sA2lunwrLoOfmLxxju3/ZkKQmLp76Fklpw2w==`、`bin` 改为 `dist/cli.js` |

**`src/` 与 `tools/`：零改动。** 无需新增/删除任何导出、电话名、事件、字段。

### 7.2 验证动作

1. `npm run check` —— 期望 **exit 0**（30 段 verify，含第 18 段 `log-trace-bridge.ts`、第 29 段 `log-pipeline.ts`、第 30 段 `log-truth.ts`）。
2. 注意 `npm run check` 的第一段是 `build`（`tsc -p tsconfig.json` + `tsdown`），**会覆写 `lib/`**——而 desktop profile 是 Junction 到本仓、真机宿主正在用。按本仓纪律：要么在宿主不在验收窗口时做，要么做完按 AGENTS.md 的「验收 pin 纪律」记录 `lib/client.js` / `lib/index.js` 的 sha256。
3. 升级后**顺手订正文档口径**（§6.2 的 R1-1 / R1-2 / R1-3）——纯文字，不碰代码逻辑。

### 7.3 可选的后续（**不要塞进这次升级**）

- 若想让 `<DSH_HOME>/logs/dsh-im-companion/` 的「目录自述」不再是一片 `unknown`：**不要**去调 `store.writeStartupHeader()`（会与 `src/index.ts:129` 自己那条 `host.start` 重复，且包的摘要取最后一条、会吃掉 `build`）。更稳的做法是**把 `pid`/`startedAt`/`dir`/`pluginVersion` 并进本仓自己那一条 `host.start`**，同步扩大 `src/log-events.ts:27` 的 `fields` 声明。这是一条独立改动，须单独跑 `npm run check`。
- 若想用 `dsh-log export` 交日志：需知道本仓开关文件不在插件目录内（R1-5 ②），摘要里的 `logSwitch` 会恒为 `unknown`；日志本体不受影响。

## 8. 一手证据与可复现路径

| 物 | 位置 / 命令 | 覆盖内容 |
|---|---|---|
| registry 事实 | `npm view dsh-log dist-tags\|versions\|time --json --registry=https://registry.npmjs.org` | 版本表、发布时间、latest |
| 两版解包 | `D:\Temp\dsh-log-probe-0.3.1\pkg031\`、`D:\Temp\dsh-log-probe-0.3.4\pkg034\`（`npm pack` + `tar -xzf`） | 全部逐文件 hash / diff |
| 类型探针配置 | `D:\Temp\dsh-log-types-probe\tsconfig.host034.json`、`tsconfig.client034.json`（另有 `tsconfig.client031.json` 作对照、`tsconfig.neg.json` 作回退自证） | 本仓真实源码 × 0.3.4 类型（配 `tsc --listFiles` 自证解析来源） |
| 装配探针 | `D:\Temp\dsh-log-cli-probe\probe.mjs`（`node probe.mjs <pkgDir> <logRoot>`） | 复刻本仓 `src/host/log.ts:41-64` 的装配与落盘次序，输出落点/文件名/JSONL 原文 |
| 事件清单探针 | `D:\Temp\dsh-log-cli-probe\events-probe.mjs`（先 `tsc src/log-events.ts` → `D:\Temp\dsh-log-events-probe\`） | 本仓真实清单 × 两版的 `parseEventListManifest` / `computeEventCounts` / `createClientLog.isEnabled` / 电话名派生 |
| CLI 对照 | `node <pkg>\dist\cli.js tail <dir> [-n 20\|--json]` / `dsh-log <dir>` / `export <dir> [--json]` | 子命令识别、渲染逐字对照、`export` 摘要形态 |

---

**裁决：可直接升级。** 把 `package.json` 的 pin 改成 `0.3.4`、装依赖、`npm run check` —— 预期无需改任何代码；唯一同批该做的是订正 `AGENTS.md` 里那条已经失效的「无害提示」说明。
