# G1 — D1 反向声明的落点与 1:1 约束

Type: grilling
Status: open
Blocked by: 01
Labels: wayfinder:grilling

## Question

D1 的 “飞书门牌/微信门牌” 开关应落在 Fleet 详情抽屉还是 Workspace 右键菜单？1 Workspace=1 Agent 的强约束在 UI 文案与校验上如何表达（禁止多绑、重命名/删除级联）？
HITL grilling + domain-modeling：与用户共识落点与文案，产出 D1 交互稿与校验规则，Blocked by R1（需先确认 bot.workspace.set 可写）。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:grilling --blocked-by 01 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
