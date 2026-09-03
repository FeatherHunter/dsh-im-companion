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
* 挂载：`desktop` profile（Junction + bundles），需完全退出 DSH Desktop 再重开 + Ctrl+F5

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

**最高原则（§0）**：契约优先——一切实现不得违背 `docs/features-contract.md`；共享文件只增不改；模块间无隐式共享；先合并点单 PR 先行入库。

**充分解耦七律（§1）**：①功能自包含（`src/features/<id>/`，manifest 唯一出口，feature 之间禁 import）②单向依赖（feature→共享层/host 桥，禁反向、禁引 A1 私有）③契约通道白名单（rpc/subscribe/meta/slots 四种能力，禁自开轮询/直写 localStorage）④共享层 Added-only（只加导出/追加样式/追加 case）⑤数据单写多读（唯一轮询 connection-stream）⑥样式图标命名空间（installFeatureStyles + 功能前缀类）⑦可移除性（stash 掉任一功能后 npm run check 仍全绿）。

**开工四步**：① 读票（先读 `docs/features-contract.md` 再动）② `gh issue edit <n> --add-assignee @me` 认领 ③ 只写自己的目录、共享只加不改、≤300 行 ④ 完工前 `npm run check` 全绿（build+typecheck+verify+guard）→ 提审（等用户点头后才关闭）。

**提审两闸门**：原型/真机需用户确认；未过不关闭、不写实现。
