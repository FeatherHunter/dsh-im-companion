# R2 — DSH Slots 与全页面 DOM 叠加安全点

Type: research
Status: open
Blocked by: —
Labels: wayfinder:research

## Question

哪些 Slot / DOM 注入点可安全叠加左侧工作区列表与对话区顶部（`settings.section order 22`、`<dsh_im_source>` 上方、better-sidebar 共存）而不被 DSH 更新冲掉？`MutationObserver` 方案在 desktop/web 双 profile 的稳定性？
AFK 研究：查 `@deepseek-ai/dsh-client-ui-slots` 与 `dsh-im/plugin-src/client/index.js` 的注入示例，结合 `dsh-plugin-ui-debug` 做活体探针，给出 B1/B3 的可用挂载点清单。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:research  --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
