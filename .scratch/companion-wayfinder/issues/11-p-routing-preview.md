# P6 — E3 会话路由预览卡

Type: prototype
Status: open
Blocked by: 03
Labels: wayfinder:prototype

## Question

E3 的路由透视卡以何种脱敏形式展示 “小帅·飞书私聊@张三 → sess-aaa [在中间打开]” 且支持一键在中间打开？私聊/群聊的区分与 ID 脱敏边界？
HITL 原型：IM机器人辅助路由卡 Mock（真实 `StateStore.sessionFor` 抽样），验证 [在中间打开] 的跳转；Blocked by R3。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:prototype --blocked-by 03 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收