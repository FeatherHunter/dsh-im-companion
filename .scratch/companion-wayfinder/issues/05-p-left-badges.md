# P1 — B1+B2 左侧徽标+呼吸灯+筛选条

Type: prototype
Status: open
Blocked by: 01, 02
Labels: wayfinder:prototype

## Question

左侧工作区列表的徽标（绿点/呼吸灯）与顶部筛选条（全部/已绑定/未绑定）用什么视觉语言能同时解决“找不到小帅的家”与“分不清在线 vs 草稿”？筛选是否影响真实左侧布局的性能？
HITL 原型：先在 `preview.html` Mock 10+ 工作区原型，再以 B1 “注入真实徽标”按钮做真机 MutationObserver 叠加验证；Blocked by R1/R2。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:prototype --blocked-by 01,02 --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
