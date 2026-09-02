# G2 — E2 拖拽领养交互

Type: grilling
Status: open
Blocked by: 04, 07
Labels: wayfinder:grilling

## Question

E2 的九宫格+虚线 Drop 区中，拖“飞书芯片”到 Drop 区的领养是否需要二次确认？误拖、跨 Workspace 拖、权限不足时如何提示与回滚？drop 后的 `bot.workspace.set` 失败如何反馈？
HITL grilling + prototype：先出交互稿，再做拖拽最小可验（alert 占位 → 真 RPC），产出防误触与撤销规则；Blocked by D1 声明与矩阵。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:grilling --blocked-by 04,07 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
