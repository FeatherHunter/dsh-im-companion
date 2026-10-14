# Agent Instructions

> 本文件由 setup-matt-pocock-skills 初始化生成，记录本仓库的工程技能约定。详见 `docs/agents/*.md`。

## Agent skills

### Issue tracker

Issues and specs live as GitHub Issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles map 1:1 to labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Wayfinder uses `wayfinder:map` + `wayfinder:research` / `wayfinder:prototype` / `wayfinder:grilling` / `wayfinder:task`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

---

## Project

`dsh-im-companion` — dsh-im 辅助插件（解耦外挂）（仓库根即本目录），承接最大全集 11 项试验。详见 `README.md`。

* Host: `lib/index.js`（空壳）
* Client: `lib/client.js`（React IM机器人增强，`slots.inject('settings.section', order 22)`）
* 预览：`preview.html` (`python -m http.server 8788`)
* 挂载（**2026-10-15 实测订正**）：**只有 `desktop` profile 挂本插件，且是 Junction → 本仓**（开发态，重建 `lib/` 即时同步）；`web` profile 已不挂（其 `node_modules` 下既无 `dsh-im-companion` 也无 `@xmanrui/dsh-im`）。⇒ 核对只看 desktop 一侧：重建 `lib/` 后比对 `~/.dsh/profiles/desktop/node_modules/dsh-im-companion/lib/client.js` 的 hash 与本仓是否一致（Junction 下天然一致；一旦改回真目录，就必须按版本号重装才生效）。
* 生效门（每次 `lib/` 重打后必走）：对 `~/.dsh/profiles/desktop/node_modules/dsh-im-companion/lib/client.js` 验 hash 与本仓一致 → 页面 Ctrl+F5（或热重载插件）；`dsh web` 若起过老进程先杀掉重起（14:55 坑：老进程不 serve 新 bundle）。验收前新旧只认 hash 是否一致（徽标悬停本来就带“最后检测时间”，不拿它判断新旧）。
* **开发态实装（Junction／越界目录）⇒ 更新中心必然 `unknown-profile`，这是预期不是缺陷**（T10b #126；一手取证 `docs/research/排查-更新中心unknown-profile根因.md`）：更新包 0.13.0 的 `tryInferProfileDir` 用 `marker = path.sep + 'node_modules' + path.sep + <目标包名>`、`dir.lastIndexOf(marker) > 0` 从**目标包 realpath** 反推「使用范围」（`dist/host.js:199-216`）；Junction 的 realpath 落在本仓 ⇒ 认不出范围 ⇒ 包诚实抛。判定方法：`resolveTargetPackage('dsh-im-companion').directory` 里含不含 `node_modules/<包名>` 段（含＝真安装、更新中心可用；不含＝开发态、红字是预期）。宿主侧只多留一行 resident 日志 `update.precheck`（`mode:dev-source`），**失败照旧透传**——禁止把这次失败降级成成功／隐藏红字／用「已是最新」盖过去（`docs/research/验证-V3-T8桥诚实性与档位白名单.md` 的 P0 判据）。⇒ **真机验收（含 T7 #112）必须在「按版本号安装的真目录」下跑**：① 先判链接再删（junction 用 `unlink`，绝不递归删到本仓）；② `dsh plugin --profile desktop add --save-exact dsh-im-companion@<版本>`；③ 核对 `resolveTargetPackage` 的 realpath 含 `node_modules/<包名>` 段（判据是 `lastIndexOf(marker) > 0`，**不是一个固定数**——marker 随路径长短变；实跑命令与输出见 `docs/research/排查-更新中心unknown-profile根因.md`「真目录实跑（#126）」一节，本仓同口径的自动化钉子＝`tools/verify/features/update-host.ts` 的 T7-3b）且面板红字消失；④ 记下 `lib/client.js` 指纹——开发态连产物身份都在动。
* 热更新优先（用户裁定 2026-09-04：DSH 支持动态加载）——改完重打 `lib/` 后刷新页面（Ctrl+F5）或热重载插件验证即可；**无必要绝不让用户重启 DSH**（重启是最后手段，仅 host/loader/装配结构动了且热重载吃不下时才提）
* **发布**：`bash scripts/wizard-release.sh`（自驱发布向导：发布前体检 → npm 身份/版本占用 → **发布〔唯一人工步：浏览器授权〕** → 官方源复核 → git tag → GitHub Release）。幂等，断点续跑用 `WIZARD_FROM=<阶段号>`。全自动驾驶：`bash scripts/auto-release.sh`（接管全部 y/N+回车，扫码步自动弹浏览器；前置要求 Windows 侧 `npm run check` 全绿+版本已 bump）。宿主版本与 dsh-im 兼容版本单点真相在 `package.json` 的 `dshCompat` / `dshImCompat`（`dshImCompat` 构建注入面板；`dshCompat` 只供市场兼容徽章——面板宿主胶囊已删，用户裁定 2026-10-01）。npm 新版本可能先进自动审核（npm 站显示 `Validating`，期间 registry 404 属正常，**别重发**）
* **token 无人值守发布**（有写权限 token 时优先走这条，全程无人点；旧 wizard 链留作 fallback）：`$env:NODE_AUTH_TOKEN` 只给变量名、不贴全文 → `pwsh -NoProfile -File scripts\publish-token.ps1 -Probe`（先探针，必须 PROBE-OK）→ `pwsh -NoProfile -File scripts\publish-token.ps1`（门禁 `npm run check` → 发布 → 一次采样；宣布前加 `-FullPost` 轮询到可见）。受理≠可见：`E409 previously-staged` 即已收下，等几分钟再查，别重发也别升版。发布侧到 registry 全绿即交付，安装一律用户侧做。
* **发布宿主与 auto-release 的坑（2026-09-17 实证，发 0.1.17）**：宿主用 **Git for Windows bash**（`C:\Program Files\Git\bin\bash.exe`，Windows 侧 node/npm，登录态在 Windows 的 `~/.npmrc`；WSL 那边的 npm 默认指镜像站、且没有 `gh`，**别用它发**）。调 `bash -lc` 会踩 `.bashrc`（UTF-16 带 BOM ⇒ `$'\377\376alias'` 报错），用 `--noprofile --norc`。**`auto-release.sh` 在 agent 侧边栏终端里会卡在阶段 1 的「按回车进入下一步」**（FIFO 驱动循环没读到 gate，wizard 与 driver 对着等；实测 2 分钟无进展）⇒ 别等它，直接跑 `wizard-release.sh` **由 agent 驱动**：`terminal_wait_for` 盯标记 → 每个「按回车」`terminal_send("")`、每个 `[y/N]` 送 `y`；npm 打印 `Authenticate your account at: https://www.npmjs.com/auth/cli/...` 时用 `Start-Process <url>` 替用户开浏览器，再送回车。阶段 4 复核要等最多 6 分钟（`等待 registry 可见…`），是正常的。
* **发布不许推给用户手动跑（用户裁定 2026-10-01）**：发布全程由 agent 直接运行发布脚本（代答全部回车/`y`，`D:\Temp\wizard-auto.ps1` 即现成代答器），**不允许提示用户手动执行发布脚本**。用户唯一亲手做的只有 npm 索要的一次性验证码（EOTP，按安全规范不能经任何人包括 AI 之手）。另：**禁止说出或贴出带 `--otp=` 的发布命令**（用户裁定 2026-10-01）——验证码的事一个字不提，由用户自己全权处理。
* **发布日志只认公开物**：发布完成后**拉 tarball 自己验**（`npm pack <pkg>@<ver> --registry=https://registry.npmjs.org` → 查 `package/lib/client.js` 里的本次改动标记），别只看向导自报的 ✓。
* **更新包（`dsh-plugin-update`）升级 = 改 pin 一行，但必须让发布侧自动跟随**（#99）：更新包是本插件的**运行期依赖**，用户装到的更新系统版本 = 我们发布那一版清单里 pin 的版本（包不会自更新，Node 也没有"import 最新版"这回事）。故：
  - **发布前比对**：`npm run check:update-pkg`（查**官方源** `latest` vs 本仓 pin；落后 exit 1）。`wizard-release.sh` 阶段 1 已内置这一步（落后 ⇒ ✗ 并打印修法）；确实要带旧版发用 `WIZARD_SKIP_UPDATE_PKG=1` 显式跳过。
  - **升级动作**：`npm run sync:update-pkg` = 装 latest（`--save-exact`，官方源）；跑完 `npm run check`，提交（`package.json` / `package-lock.json`）再发布。
  - **派生常量链已退役（T5 #110 M6，别再长回来）**：`scripts/gen-update-constants.mjs` / `src/features/update-center/derived.ts` / `src/features/update-center/constants.ts` / `src/host/dsh-plugin-update.d.ts` 已整体删除，`npm run build` 不再有派生比对门。原因：更新中心改挂包自带的 `dsh-plugin-update/entry`（电话名由包内按 `prefix` 自拼，本仓不再拼字符串），手写 ambient `.d.ts` 反而会**遮蔽**包的真类型（0.3.0 起类型随包分发）。改 pin 忘同步不再由构建抓——靠发布前的 `check:update-pkg` 与 `tools/verify/features/update-center.ts` 的「生成器已退役」断言。
  - **解耦基线（0.2.0）**：宿主侧**不传** `runningVersion` / `profileDir` / `readInstalled`——包自己按包名解析目标包并反推使用范围；只传 `homeDir`（那是取值，保证更新落盘与本仓 `meta.json` 同源）。`src/host/update-reader.ts` / `update-paths.ts` 已整体删除（0.2.0 原生接管），**别再长回来**。

* **日志系统（T9 #123，`dsh-log@0.3.1`，2026-10-14 接入）**：全插件关键路径都落盘，**事后只看磁盘日志就能判定 bug / 是否符合预期**（用户要求；配套诊断纪律：不许让用户开控制台）。
  - **落点**（生态惯例，与 `dsh-opencode-palette` / `dsh-prompt` 同构）：`<DSH_HOME>/logs/dsh-im-companion/YYYY-MM-DD.log`（本机 `C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\`）；开关 `log-switch-dsh-im-companion.json`；单文件超 5MB 轮转、默认留 14 天、今天的文件永不删。
  - **读法**（agent 首选，只读）：`npx dsh-log tail C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion -n 200`（人话渲染）；`--level error --since 2h` 只看故障、`--trace <traceId>` 追一条链、`--json` 机器态。程序内 `parseLogLine` / `formatRow`（`dsh-log` 根入口，浏览器也能用）。0.3.1 的 CLI 每次会先打一行 `dsh-log: 没找到日志目录：tail` 的无害提示（它把子命令名也当目录试了一遍），紧接着才是渲染结果，别当故障。
  - **要看 `debug` 明细**（轮询/每次渲染等高频行默认不落盘）：把 `<DSH_HOME>/logs/log-switch-dsh-im-companion.json` 里的 `enabled` 改成 `true`（形状 `{"enabled":false,"sampleRate":1}`，与 `log-switch-dsh-prompt.json` 同构），或走 `logSetSwitch` 电话；约 1–2s 后生效。启动时**不会**覆盖磁盘上已有的开关值（保住用户/上一次的选择）。
  - **接线**：宿主 `src/host/log.ts`（`createHostLog` + `createNodeFileService`/`createNodeTimer`；**不传 `ctx.get('fs')`**——DSH 的 fs 是沙箱实现，写家目录会被 `FS_SANDBOX_DENIED` 拒且缺 mkdir/unlink）；`src/host/rpc.ts` 把 6 个电话（`logBatch/logExport/logClear/logGetSwitch/logSetSwitch/logQuery`）并进同一张分发表；客户端 `src/client/log.ts` 用 `dsh-log/client`（只入队，宿主是唯一落盘者），经自有桥 `/api/im-companion` 转发；更新包事件口 `fire(level,event,fields)` 直落 `host.update.tap`。
  - **事件清单是单点真相**：`src/log-events.ts`（两侧共用）＋语义映射 `src/host/log-sites.ts`（纯函数：端点 → 语义事件）。`kind:'resident'` 的事件**调试开关关着也落盘**（放行＝error/warn 恒放行 ∪ 常驻事件 ∪ 开关），故状态跃迁与失败一律 resident；逐请求/逐轮询明细只 `debug` + `ondemand`。
  - **三条埋点红线**：① 高频路径（`connection-stream` 轮询、每次渲染）**只许 `debug`**——`warn`/`error` 恒放行、用户关不掉，写错会刷爆磁盘（dsh-prompt 实测 15 MiB/天）；② 失败必须带 `message` 原文 ＋ 定位字段（id / method / dir）；③ 日志绝不许抛、不许改变控制流（宿主 `store.log()` 在同目录已有写者时会抛中文错，出口已 try/catch 降级）。
  - **单写者纪律**：同一日志目录同一时刻只许一个活跃写者 ⇒ 让位分支（路由已被别的实例注册）**不建库**，只走宿主 logger；热重载让位窗口靠 dsh-log 的写盘租约自愈。
  - **门禁**：`tools/verify/log-pipeline.ts`——清单合法、调用点与清单**双向不漂移**、语义映射字段、resident 放行判定、临时 dshHome **真落盘**再读回、接缝断言。改埋点必须让它全绿。

## Labels required (GitHub)

本仓库为 GitHub Issues 模式，技能所需标签共 10 个（triage 5 + wayfinder 5），已按技能规范预定命名，不额外强制任何标签：

* triage: `needs-triage` `needs-info` `ready-for-agent` `ready-for-human` `wontfix`
* wayfinder: `wayfinder:map` `wayfinder:research` `wayfinder:prototype` `wayfinder:grilling` `wayfinder:task`

> 若已配置 `gh` 且 `git remote` 指向 GitHub，执行以下一键创建（幂等，已存在会跳过）：
>
> ```bash
> gh label create needs-triage --description "Maintainer needs to evaluate" --color BFD4F2 --force
> gh label create needs-info --description "Waiting on reporter" --color FEF2C0 --force
> gh label create ready-for-agent --description "Fully specified, ready for AFK agent" --color 0E8A16 --force
> gh label create ready-for-human --description "Requires human implementation" --color D93F0B --force
> gh label create wontfix --description "Will not be actioned" --color FFFFFF --force
> gh label create "wayfinder:map" --description "Wayfinder map issue" --color 1D76DB --force
> gh label create "wayfinder:research" --description "Wayfinder research ticket" --color 0052CC --force
> gh label create "wayfinder:prototype" --description "Wayfinder prototype ticket" --color 3B82F6 --force
> gh label create "wayfinder:grilling" --description "Wayfinder grilling ticket" --color FBCA04 --force
> gh label create "wayfinder:task" --description "Wayfinder task ticket" --color C5DEF5 --force
> ```
>
> 后续打标签严格遵循技能规则（`triage` / `wayfinder` / `to-spec` 等技能文档为准），不额外强制任何标签。

---

## 军规（认领票后必守 · 所有 session 自动注入）

**第一原则（§0）· 充分解耦，压倒一切——产品代码与开发产物都必须解耦。**
理由：未解耦的改动是 O(N²) 传染——碰一处、全线受影响、并行即冲突；解耦后每功能可独立演进/验证/整体移除，并行开发零摩擦。`docs/features-contract.md` 是解耦的载体与判据，不是独立目标：任何"为快绕过契约"的决定 = 违反第一原则。

**解耦九律（§1）**
- ① 功能自包含：`src/features/<id>/` 唯一出口 manifest.ts；feature 之间禁止 import。
- ② 单向依赖：feature → 共享层 / host 桥；禁反向、禁引他人 feature、禁引 A1 私有（panel*/connect-flow/row-actions 等）。
- ③ 契约通道白名单：rpc / subscribe / meta / slots 四种能力；禁自开轮询、直写 localStorage、越权 DOM 操作。
- ④ 共享层 Added-only：只加导出/追加样式类/追加 rpc case；禁改既有签名、行为、重排。
- ⑤ 数据单写多读：唯一轮询 `connection-stream`；写走 dsh-im 渠道 RPC / host 端点，写后 `stream.refresh()` 广播；禁第二份轮询。
- ⑥ 样式图标命名空间：`installFeatureStyles(id, css)`；类前缀 `<feature>-*`；禁占用 .af-* 私有约定。
- ⑦ 可移除性：`git stash` 掉任一功能 → `npm run check` 仍全绿（复杂度 O(N) 证明）。
- ⑧ **开发产物同步解耦**：每功能的验证/原型/模拟数据归入自己的命名空间——`tools/verify/features/<id>.ts`、`prototypes/<id>/`、preview mock 按功能注册；禁止向共享的 render-client / preview-host / 根目录原型"追加再追加"；共享开发文件同样只允许加"注册点"。
- ⑨ 合并协议（并发正确性）：先合并点单 PR 先行入库；追加共享文件前先 `git pull`；merge 冲突时以"双方追加都保留"为准重做；契约先行——改共享协议必须先更新契约再改码。

**开工四步**：① 读票 + `docs/features-contract.md`（§0/§1）② `gh issue edit <n> --add-assignee @me` 认领 ③ 只写自己的目录（开发产物同）+ 单文件 ≤300 行 ④ `npm run check` 全绿 → 提审（证据：截图/verify 输出/触碰面自述（改动清单 + 对照 R5 表））→ 用户点头后才关闭。

**提审两闸门**：原型、真机验收均需用户确认；未过不关闭、不写实现。

**诊断取证纪律（用户裁定 2026-09-07）**：禁止要求用户打开控制台、粘贴日志/输出——远程诊断证据只走磁盘文件（host 落盘诊断 JSON，agent 直接读）；用户只做两件事：刷新页面、做视觉验收（看颜色/悬停文字/截图）。凡需控制台信息的诊断设计一律打回重做。

**解耦合规 = 评审制（用户裁定 2026-09-02：不设代码检查解耦）**：解耦正确性不靠任何自动扫描/静态检查，依靠 ① 军规自动注入（本文档）② 提审材料——改动文件清单 + 触碰面自述（对照 R5 表）+ 一次性可移除性验证结果 ③ 评审人点头。常驻自动检查仅保留：构建/类型/功能断言/300 行红线（规模红线，非解耦检查）。