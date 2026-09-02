# P5 — B3 Header 浮层 与 E4 欢迎横幅

Type: prototype
Status: open
Blocked by: 02, 05
Labels: wayfinder:prototype

## Question

B3 的对话区顶部 80px Header 浮层（`●小帅·飞书在线`）与 E4 的 `👋小帅的家` 欢迎横幅（可收起，仅已绑定）是否合并为同一横幅？何时显示、点 x 收起后是否持久化？
HITL 原型：对话区顶部双态横幅 Mock（在线/离线/未绑定），80px 可收起，真机验证点 xiaoshuai 会话才切中间的落点正确性；Blocked by R2/P1。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:prototype --blocked-by 02,05 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
