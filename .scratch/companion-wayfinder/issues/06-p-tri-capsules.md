# P2 — A1 三态聚合胶囊

Type: prototype
Status: open
Blocked by: 01, 05
Labels: wayfinder:prototype

## Question

A1 的三胶囊（按 Agent / 渠道 / 工作区）哪个为主视图？空态、单 Agent 多渠道、单渠道多 Agent 的分组与计数如何展示？
HITL 原型：在IM机器人辅助以三胶囊可点切换的聚合视图做 Mock→真数据（`connection.status` 重分组）演进；Blocked by P1 的数据源验证。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:prototype --blocked-by 01,05 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收