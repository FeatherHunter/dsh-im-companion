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

`dsh-im-companion` — dsh-im 解耦伴生插件（`D:\dsh-plugin\dsh-im-companion`），承接最大全集 11 项试验。详见 handoff：`C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` 及 `README.md`。

* Host: `lib/index.js`（空壳）
* Client: `lib/client.js`（React IM机器人辅助，`slots.inject('settings.section', order 22)`）
* 预览：`preview.html` (`python -m http.server 8788`)
* 挂载：`desktop` profile（Junction + bundles）
* 热更新优先（用户裁定 2026-09-04：DSH 支持动态加载）——改完重打 `lib/` 后刷新页面（Ctrl+F5）或热重载插件验证即可；**无必要绝不让用户重启 DSH**（重启是最后手段，仅 host/loader/装配结构动了且热重载吃不下时才提）

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

**解耦合规 = 评审制（用户裁定 2026-09-02：不设代码检查解耦）**：解耦正确性不靠任何自动扫描/静态检查，依靠 ① 军规自动注入（本文档）② 提审材料——改动文件清单 + 触碰面自述（对照 R5 表）+ 一次性可移除性验证结果 ③ 评审人点头。常驻自动检查仅保留：构建/类型/功能断言/300 行红线（规模红线，非解耦检查）。