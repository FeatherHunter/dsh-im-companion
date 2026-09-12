# 更新系统 · 实现开工前基线体检
取证：2026-09-12 15:0x（本机时区）；HEAD `875c8ac`（#82 三色版本胶囊，提交 2026-09-12 14:46:12）。原始日志 `%TEMP%\dsh-im-baseline\baseline-check.log`（2013 行）、`lib-before.json` / `lib-after.json` / `check-exit.txt`。
本票为只读诊断：无任何 git 写操作（未 stash / checkout / commit），未装依赖，未碰 GitHub issue。
## 基线结论
1. **`npm run check` = 绿，exit code 0，耗时 15.6s**（`npm run check *> $log` 后取 `$LASTEXITCODE`）。四个子步骤 build / typecheck / verify / guard 全过，**第一失败点：无**。
2. **基线成立** → 后续票「check 全绿」与「`git stash` 后仍全绿」两条验收前提在本 HEAD 上可成立。*（stash 可移除性验证属后续实现票，本票按要求未执行。）*
3. **`lib/` 与源码同步且构建确定**：重建后 26/26 文件逐字节不变（仅 mtime 被重写）→ 当前 `lib/` 就是 HEAD 构建，"产物不确定"风险不成立。
4. `.gitignore:2` = `lib/`，`git ls-files lib` = 0 个跟踪文件 → **`git status` 干净不能证明 `lib/` 与源码同步**（父代理判断成立）；本票用前后哈希对照补上了这个盲区。
5. 工作树：仅未跟踪文件（研究文档 + `.tmp-wayfinder/`），**无任何跟踪文件改动**。
## 逐项结果
| # | 子步骤 | 结果 |
| --- | --- | --- |
| 1 | `build:host` = `tsc -p tsconfig.json` | ✅ 重写 `lib/index.js`、`lib/host/*`、`lib/types/*`，内容不变 |
| 2 | `build:client` = `tsdown` | ✅ 重写 `lib/client.js` + `.map`，内容不变 |
| 3 | `typecheck` = `tsc -p tsconfig.client.json` | ✅ 无 `error TS` 行 |
| 4 | `verify` = 17 段链 | ✅ 15 段 `--test` 共 **278 pass / 0 fail** |
| 5 | `guard` = `node tools/guard/check-lines.ts` | ✅ `guard: 101 files, max 300 lines, limit 300 — PASS` |
**日志噪声（勿判红）**：日志第 441 行 `+ FullyQualifiedErrorId : NativeCommandError`，是 `node --test` 向 stderr 写报告被 PowerShell 包装出的误报；判红只看 exit code 与 `fail N`（日志内 `ℹ fail 0` 共 15 处，均属正常汇总）。
## lib 前后哈希对照
- 口径：`Get-ChildItem lib -Recurse -File` + `Get-FileHash -Algorithm SHA256`，前后各存 JSON 逐文件比对。
- **26 个文件全部未变**（0 变 / 0 增 / 0 删）。关键值：`lib/client.js` = `E9104B58DA721A6425D5BC227779ADB503909C5DEB25399D5279875F2D37C087`（380287 B）；`lib/index.js` = `F2F72C536331147B5790CCE10F8276B1B6BA3BF08D2EFA52B023B0D98AAEE752`（4382 B）。
- **26 个文件 mtime 全被重写**（`2026-09-12 14:34:43` → `15:05:16/17`）→ 证明 tsc/tsdown 确实重新生成了产物，只是字节相同；排除「构建被跳过所以看起来没变」，**构建是确定性的**。
- 结论：`lib/` 与源码一致，运行中的 DSH 加载到的是 HEAD 源码产物（见「挂载机制」）。
## 红线与验证链
- **300 行红线**：guard = `101 files, max 300 lines, limit 300 — PASS`（口径 `src/**/*.ts` 全行含注释，`over = lines > limit`，故 300 恰不算超）。
- **零余量警告**：`max = 300` 恰为 **`src/client/theme.ts` = 300 行**，任何加 1 行即 FAIL。次高：`299 features/left-badges/hover-card.ts`、`298 features/detail-drawer/drawer.ts`、`297 features/welcome-banner/overlay.ts`、`297 features/welcome-banner/data.ts`、`290 client/data/header-overlay.ts`、`289 client/data/fleet-api.ts`。
- **`panel.ts` 实际 253 行**（守卫口径为权威），≤300 成立，**余量 47 行**。
- ⚠️ **行数只认 `npm run guard` 或 node 的 `split(/\r?\n/)`，别用 `Get-Content`**：实测 `(Get-Content panel.ts).Count` = **246**，但 `Get-Content -Encoding utf8` = 253 = node LF 计数。根因是本机 pwsh 默认按遗留编码解码 UTF-8（同因：日志与 `package.json` 的汉字经 `Get-Content` 显示为乱码），多字节序列会吞掉紧随的 `\n`，行数偏少。用默认 `Get-Content` 会**误估 7 行余量**。
- **verify 链 = 17 段**（`node -e` 解析 `package.json`：`split(' && ').length === 17`）；票面写的「14 项」**与现状不符，属陈旧表述**。逐项如下（#1 与 #11 为纯脚本，其余为 `node --test`）：

| # | 项 | 结果 | # | 项 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 1 | `render-client.ts` | ✅ | 10 | `session-header-model.ts` | ✅ 20 |
| 2 | `first-view.ts` | ✅ 16 | 11 | `session-header-render.ts` | ✅ |
| 3 | `left-badges.ts` | ✅ 15 | 12 | `connect-qr.ts` | ✅ 30 |
| 4 | `detail-drawer.ts` | ✅ 26 | 13 | `truth-flags.ts` | ✅ 16 |
| 5 | `left-filter.ts` | ✅ 22 | 14 | `session-marks.ts` | ✅ 24 |
| 6 | `adopt.ts` | ✅ 27 | 15 | `design-preview.ts` | ✅ 6 |
| 7 | `presence.ts` | ✅ 10 | 16 | `rpc-dual-transport.ts` | ✅ 11 |
| 8 | `welcome-banner.ts` | ✅ 37 | 17 | `host-entry.ts` | ✅ 6 |
| 9 | `fleet-radar.ts` | ✅ 12 | | | |

（数字 = `ℹ pass N`；15 段合计 278 pass / 0 fail）
- **`tools/verify/features/` 现有 16 个 `.ts`**：`a17-panel-linkage` `adopt` `connect-qr` `design-preview` `detail-drawer` `first-view` `fleet-radar` `left-badges` `left-filter` `presence` `rpc-dual-transport` `session-header-model` `session-header-render` `session-marks` `truth-flags` `welcome-banner`。
- ⚠️ **`a17-panel-linkage.ts` 未挂进 verify 链**（链上只有 15 个 features 文件 + 顶层 2 个）。新增 `update-*` 的追加位置 = verify 串尾（第 18 段起）。
## 挂载机制与「是否包含 HEAD 源码」
- **运行中的宿主**：`"D:\2Study\nodejs\node.exe" …/@deepseek-ai/dsh/lib/bin.js web`（PID 13148）；43120 由 `DSH Desktop.exe --type=utility`（PID 31252）监听 → 用户走 **web profile**（与 AGENTS.md 一致）。
- **web profile（用户实际那份）**：`…\profiles\web\package.json` 声明 `"dsh-im-companion": "link:D:/dsh-plugin/dsh-im-companion"`；`node_modules\dsh-im-companion` = **Junction → `D:\dsh-plugin\dsh-im-companion`**，`package.json` 版本 **0.1.7**。重建后该路径下 26 个文件 mtime 立刻变为 `15:05:16/17` → **web 侧自动拿到新产物**（Junction 即本仓）。
- **desktop profile**：`…\profiles\desktop\package.json` 声明 **`"dsh-im-companion": "^0.1.2"`（不是 `link:`）**；`node_modules\dsh-im-companion` 是**真实目录**（`LinkType` 空），`lib\client.js` 为指向 pnpm store 的 **HardLink**（`fsutil hardlink list` 得 2 条），`package.json` 版本 **0.1.2**。
  - 但其 `lib/` 26 个文件与**本仓 HEAD 构建逐字节相同**，mtime 全为 `2026-09-12 14:34:43`；另有 **3 个孤儿** `lib\host\unread-store.js`、`lib\host\unread-store.js.map`、`lib\types\host\unread-store.d.ts`（mtime `2026-09-08 09:18:18`；本仓 `src/host` 的 7 个文件已无 `unread-store.ts`）。
  - pnpm store 里那份 blob 自身：`Length=380287`、`mtime=2026-09-12 14:34:43`、`hash=E9104B58DA72…`（= HEAD 构建）、link count = 2。
  - **对照组**：desktop 其它已装包保留安装期 mtime —— `@xmanrui\dsh-im` 09-07 15:17:59、`dshmarket` 09-07 14:14:17、`dsh-vision-router` 09-07 15:31:37。
  - → **确证**：desktop 的 `lib/` **不是** pnpm 装出来的 0.1.2 产物，而是 `2026-09-12 14:34:43` 被**外部就地覆盖**成「本仓 HEAD 构建」（就地写穿共享 inode，故 store blob 一并被改）；版本号 0.1.2 与那 3 个孤儿是 09-08 那次 npm 安装的残留。覆盖者身份**未证实**。
  - **无同步脚本 / 工作流**：`scripts/` 仅 `build.sh`、`publish-interactive.ps1`、`wizard-release.sh`；全仓（排除 node_modules/.git）搜 `profiles\desktop` 与 `junction` 无「desktop 同步」逻辑，`build.sh` 只写本仓 `lib/`。`.scratch/handoff/20260902-*` 显示 **09-02 时 desktop 还是 `link:`**（"改动即生效，无需再同步"），其后被改成 `^0.1.2`。
- **故 AGENTS.md 的「desktop + web 双 profile，两边同时生效」在 desktop 侧当前不成立（已陈旧）**：desktop **不会**自动拿到新产物，需手工复制或改依赖重装。
**父代理三问**
1. 重建后 `lib/client.js`、`lib/index.js` 哈希**未变化**（26/26）→ 本仓 `lib/` 与当前源码一致；desktop 那份也一致的原因是**被外部覆盖**，**不是**「本仓 lib 是 v0.1.2 时代的陈旧构建」。父代理原假设可否定：16 个 src/client 提交若真未构建，重建必然改变字节，而实测零变化。
2. desktop 侧加载机制 = profile `dsh.profile.bundles` 声明 + `^0.1.2` 的**真实 npm 安装**（pnpm hoisted + store hardlink），不存在指向本仓的 junction；**重建 `lib/` 后 desktop 不会自动生效**（09-02 时代曾是 `link:`，现已不是）。
3. **「用户此刻运行的那份客户端产物是否包含 HEAD 源码」→ 是，包含。** 依据：用户走 web profile → 其 `node_modules\dsh-im-companion` 是 Junction 直指本仓 → 本仓 `lib/` 经「重建前后逐字节相同」证实即 HEAD 构建。
## 环境事实
- `node -v` = **v24.19.0**；`npm -v` = **10.9.2**。
- `Test-Path node_modules\dsh-plugin-update` = **False**（预期不存在）；全仓（排除 node_modules/.git）搜 `dsh-plugin-update` 只命中 `.tmp-wayfinder\dsh-plugin-update-readme.md`（Wayfinder 草稿），无源码引用。
- 标签 `v0.1.0`…`v0.1.7`；`git rev-list --count v0.1.2..HEAD -- src/client` = **16**（父代理数字核实），同期全仓提交 35；本仓 `package.json` 版本 = **0.1.7**。
## 对后续实现票的提示
1. **基线可交付**：check 绿 + 构建确定 + 工作树无跟踪改动 → 两条验收前提在干净基线上可成立，无需先修地基。
2. `panel.ts` 253 行，余量 **47 行**；**禁用 `Get-Content` 数行**（会差 7）。
3. `src/client/theme.ts` 已 300/300 **零余量**：任何顺手动它一行的票都会把 guard 打红。
4. `update-*` 断言挂 verify 串尾（第 18 段起）；注意 `a17-panel-linkage.ts` 是**未上链的孤儿**，别以为链上已有 16 个 features 项。
5. **真机验收前必须加固**：加「重建 `lib/` → 校验 web / desktop 两侧实际加载产物的 hash」为强制步骤。web 侧自动（Junction，可直接比对 hash）；**desktop 侧不自动**，真机若走 desktop 必须先手工同步并核 hash——AGENTS.md 生效门那句「两边同时生效」不可依赖。
6. 版本升级票（0.1.8→0.1.9）：desktop 依赖范围是 `^0.1.2`；改版本号安装会按 pnpm 规则把 Junction 变真实目录（web 同理，见 `docs/research/更新系统-交付风险与真机路径核查.md`）→「升级安装」本身会破坏 web 的 Junction 免同步特性，验收清单需显式回归。
7. `npm run check` 日志含 PowerShell 对 stderr 的 `NativeCommandError` 噪声行；判红只看 exit code 与 `fail N`。
