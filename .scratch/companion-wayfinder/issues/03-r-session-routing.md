# R3 — 飞书会话→Harness session 路由事实

Type: research
Status: open
Blocked by: —
Labels: wayfinder:research

## Question

飞书侧私聊/群聊如何经 `StateStore.sessionFor` 路由到 Harness `sessionId`？`session.workspace` 与 health 的关联在哪里可读？E3 卡所需最小数据字段是什么？
AFK 研究：追 `dsh-im` 的 StateStore / sessionFor 调用链，产出 “飞书私聊@张三 → sess-aaa” 的真实 ID 样例与脱敏展示规则。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:research  --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
