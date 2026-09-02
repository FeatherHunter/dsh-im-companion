# P4 — C1a Fleet 大卡详情抽屉

Type: prototype
Status: open
Blocked by: 07
Labels: wayfinder:prototype

## Question

C1a 的大卡（小帅芯片+按钮）在抽屉中的信息层级与操作（绑定/解绑/进会话）如何排布？与矩阵联动的 “点矩阵行滑出” 是否必要？
HITL 原型：点击矩阵行滑出的大卡 Mock，验证芯片与按钮的可点击性；Blocked by 矩阵。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:prototype --blocked-by 07 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
