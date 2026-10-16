# dsh-plugin-update 0.17.0 → 0.17.1 增量调查（#134 只读研究）

- 取证时间：2026-10-15（UTC+8）。
- 对比对象：`dsh-plugin-update@0.17.0`（旧） vs `dsh-plugin-update@0.17.1`（新），均为 npm 远端 tarball 解包比对；本仓 `node_modules/dsh-plugin-update` 只做“旧端”基线旁证，未写。
- 取证方法：`npm view dsh-plugin-update versions` 确认两版皆在 registry（`0.17.0`、`0.17.1` 为版本列表末两项）；`npm pack dsh-plugin-update@0.17.0 / @0.17.1 --registry=https://registry.npmjs.org` 拉包到 `D:\Temp\dsh-update-diff-134\` 解包（`0.17.0/`、`0.17.1/`），`git diff --no-index` 逐文件比对。未改本仓 `package.json / src / tools / node_modules`。
- 全包 diff 定格（来源：`git diff --no-index --stat 0.17.0/package 0.17.1/package`）：**只变 3 个文件**——`CHANGELOG.md`（+10 行新节）、`package/package.json`（版本号一行）、`package/dist/panel.js`（+34/-2 行内联渲染逻辑）。其余 `dist/*`、`README.md`、`event-list.update.json`、`derive-client-values.mjs` 皆零 diff。

## 1. 0.17.1 相对 0.17.0 的 Added / Fixed / Changed 清单

结论先行：**只有 Fixed，没有 Added，没有 Changed**（无新字段、无新文案键、无依赖变动）。

- **Added：无**。来源：新包 `package/CHANGELOG.md:7-15` 的 `## [0.17.1]` 节下只有 `### Fixed` 小节，无 `Added/Changed` 小节；门禁行亦写“本次未新增文案键”（同文件 `:15`）。
- **Fixed（2 条，全属面板失败态渲染，引用上游 `#143`）**。来源：新包 `package/CHANGELOG.md:7-15`：
  1. “失败态每秒整树重绘（#143）”——只读轮询拿到同语义 `failed / interrupted` 快照时跳过重建（除 `atMs` 外逐字一致即同一失败），“失败于 HH:MM:SS”不再随轮询漂移。
  2. “外层面板根滚动保持（#143）”——重绘时在内层滚动区之外同时保存/恢复 dialog 外层面板根的滚动位置；焦点恢复语义不变，无 DOM 查询能力的容器与 embedded 走原分支。
  - 配套说明（同节 `:9`）：语义真变（新失败、版本三元组变化、成功终态）仍即时重绘；成功态/忙态/诊断文案一字不动。
  - 门禁（同节 `:15`，发版定格自述）：“`npm test` 1167 例：1166 过 / 0 失败 / 1 跳过（新增 `tests/issue-143-failed-poll-stable.test.mjs` 与 `tests/issue-143-outer-scroll.test.mjs`，均先红后绿）；`node build.mjs`（含 `tsc --noEmit`）与 `npm run typecheck` 过；`gate:bilingual` 三道硬门禁过（字典 322 个 key 0 违规）；`npm publish --dry-run` 79 文件；第四道照旧如实红、非阻断”。
- **Changed：无**（行为面只有“修”，无形状/契约/依赖变更）。来源：同上 `CHANGELOG.md:7-15` 无 `Changed` 小节；`package/package.json` 除版本号外零 diff（见 §3）；`dist/` 除 `panel.js` 外零 diff（全包 `--stat` 为证）。

### dist 实改位置（仅 `dist/panel.js`，新包内联后体积 131573 → 132879 字节，+1306 B）

来源：`git diff --no-index 0.17.0/package/dist/panel.js 0.17.1/package/dist/panel.js`（三处 hunk）：

1. 新增 `latchSameFailure(a, b)`（新文件约 `:1678-1681`）：逐字段比对 `code/kind/detail/diag/requestId/checkId/runningVersion/installedVersion/latestVersion/targetVersion/hostKind/profileName/source/volatile/jobId`（注意比对表**不含 `atMs`**——与 CHANGELOG “除 `atMs` 外逐字一致”一致）。
2. 重绘滚动保持加 `rootScrolls[]`（新文件约 `:1722-1750`）：在原有 `.dsh-upd-body` 内层保存/恢复之外，新增对 `.dsh-upd` 外层面板根的 `querySelectorAll` 保存/恢复，try/catch 包裹。
3. 失败锁存写入加门（新文件约 `:1871-1876`）：`failed/interrupted` 分支由 `else setLatch(latchFromJob(...))` 改为先算 `next`、`if (!latchSameFailure(latch, next)) setLatch(next)`；`tripleChanged → clearLatch` 的真变路径不动。

## 2. 对本仓的影响判定（四项一句话 + 依据）

| 判定项 | 是否变 | 依据（一手来源） |
|---|---|---|
| 电话数 5 是否变 | **不变，仍 5** | 两版 `package/dist/config.js` 逐行一致：`PHONE_ACTIONS = ["updateStatus","updateCheck","updateInstall"]`（`:3`）、`CHANGELOG_PHONE_ACTION = "updateChangelog"`（`:4`）、`LOG_APPEND_ACTION = "logAppend"`（`:72`）、`buildPhoneNames` 拼出 `updateStatus/updateCheck/updateInstall/updateChangelog/logAppend`（`:73-80`）；全包 diff 未含 `config.js`。本仓侧 `src/host/update.ts:36` 的 `UPDATE_ENDPOINTS` 五端点表与之对齐，无需改名。 |
| snapshot 七字段是否变 | **不变，仍七字段** | 两版 `package/dist/ports.d.ts` 的 `UpdateSnapshot` 零 diff（`git diff --no-index ports.d.ts` 空）：字段为 `runningVersion(:54)`、`installed(:59)`、`installedVersion(:61)`、`latestVersion(:63)`、`canInstall(:65)`、`blockedReason(:67)`、`job(:69)`。`EnvironmentView.installed(:148)` 同样零 diff。本仓 `src/features/update-center/view.ts` 经 `toPackageReply` 只读顶层 `ok/snapshot/error/errorKind`，不碰锁存内部，无影响。 |
| logAppend 形状是否变 | **不变，仍 `{accepted, dropped}`** | 两版 `package/dist/host.js` 零 diff：`LOG_APPEND_MAX_ROWS = 200`（`:865`）、`function logAppendRows`（`:868`，超 200 截断计 `dropped`）、`[phoneNames.logAppend]` 挂载（`:953`）、回 `{ accepted, dropped }`（`:933`）。本仓 `src/host/update.ts:116,125` 与 `src/host/rpc.ts:211-219` 按“无 ok 包裹、按成功信封进 value、只透传”处理的方式继续成立。 |
| dsh-log 下限是否变 | **不变，仍 `^0.3.4`** | `npm view dsh-plugin-update@0.17.0 dependencies` 与 `@0.17.1` 均回 `dsh-log: ^0.3.4`；两版 `package/package.json:96` 皆为 `"dsh-log": "^0.3.4"`，diff 仅 `:3` 版本号行 `0.17.0 → 0.17.1`。本仓 `package.json:80` 的 `"dsh-log": "0.3.4"` 精确钉死满足该下限，无需动。 |

- **README 相关节**：两版 `package/README.md` 零 diff（`git diff --no-index README.md` 空）；包内无 `0.17.1` 专节。最新版本专节仍是 `README.md:448` 的 `### 5.1 快照七字段（0.17.0 起；之前是六字段）` 及其 `:454/:462/:472` 三处 `0.17.0 起` 口径——本次无需跟读新节。
- **事件清单**：两版 `package/event-list.update.json` 零 diff（26 事件口径延续，无新增客户端事件）。

## 3. 给主会话的跟随改建议（建议口径，不断言）

背景观察（只读所见，供主会话核对）：本仓 `package.json:81` 在取证过程中已显示 `"dsh-plugin-update": "0.17.1"`（此前读到的是 `0.17.0`），疑似主会话正在并行升级；以下建议按“尚未收尾”写，若已做过请按已做为准。

1. 建议只动版本 pin 两个文件：本仓 `package.json` 的 `dependencies.dsh-plugin-update` 一行（`0.17.0 → 0.17.1`，行号以主会话当前为准，本研究取证时见 `:81`）＋ `package-lock.json` 对应两处（包版本与 resolved/tarball 指纹）。建议走本仓既有通道 `npm run sync:update-pkg`（官方源 `--save-exact`）而非手改，避免 pin 与锁漂移。
2. 建议不改 `src/host/update.ts`（`:36` 端点表、`:92-116` 直通、` :125` logAppend 注释）、`src/host/rpc.ts`（`:211-219` 五电话透传）、`src/features/update-center/view.ts`（薄挂载 + `toPackageReply` 解信封）：0.17.1 无形状变更，这三处无跟随改动点；注释里若写了 `0.17.0` 字样（如 `update.ts:125`），建议保持原样（记录的是引入版本，不是当前 pin）。
3. 建议不改 `tools/verify/features/update-center.ts`（`:69-76` 五电话文本断言）与 `tools/verify/features/update-host.ts`：电话名/快照/logAppend 断言继续成立；0.17.1 的两处面板行为修（失败轮询去重、外层滚动保持）发生在包内联 `panel.js` 内部，本仓无复刻的锁存逻辑可同步。
4. 建议跑一遍 `npm run check`（构建+类型+verify+guard）即视为跟随完成；若 `check:update-pkg`（发布前比对官方源 latest vs pin）此前因落后变红，升到 0.17.1 后建议重跑确认变绿。真机验收建议仍走既有 T7 路径即可，本次无新增真机前置。
5. 可选体验验证（非必须）：进更新面板 → 造一次失败态 → 拖动滚动条并等一轮轮询，观察是否仍回顶部；“失败于 HH:MM:SS”秒数是否冻结在首次失败。这是 0.17.1 唯一可感知的变化，其余成功/忙态/诊断文案按 CHANGELOG 自述一字不动。

## 附：取证命令与版本（复现用）

- `npm view dsh-plugin-update versions --json`：末两项 `0.17.0`、`0.17.1`。
- `npm view dsh-plugin-update@0.17.1 version dist.tarball dependencies` → `version 0.17.1`、`dependencies { dsh-log: ^0.3.4 }`；`@0.17.0` 同式回 `0.17.0` / `^0.3.4`。
- `npm pack dsh-plugin-update@0.17.0 --registry=https://registry.npmjs.org` → `dsh-plugin-update-0.17.0.tgz`（292243 B，79 文件）；`@0.17.1` → `dsh-plugin-update-0.17.1.tgz`（293054 B，79 文件）。解包后 `git diff --no-index --stat` 仅 3 文件变更（见文首）。
- 本仓基线旁证（只读）：`node_modules/dsh-plugin-update/package.json` 为 `0.17.0`、`dependencies.dsh-log ^0.3.4`（主会话升级中，后续以 `package.json:81` 为准）。
- 网络均可用，无“拿不到的来源”；未编造任何条目，README 无 0.17.1 节如实记为零 diff。
