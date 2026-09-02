# P3 — C1b Fleet 矩阵总览

Type: prototype
Status: open
Blocked by: 06
Labels: wayfinder:prototype

## Question

C1b 的 Agent×渠道 红绿矩阵需要哪些列（飞书/微信/QQ）与单元格状态（在线/离线/未绑定/呼吸）？矩阵行点后是否滑出 C1a 抽屉？
HITL 原型：IM机器人辅助总览 Tab 表格原型，支持搬到右 Dock 的预留；Blocked by A1 聚合数据。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:prototype --blocked-by 06 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收