# T1 — 构建/注入/预览基座硬化

Type: task
Status: open
Blocked by: —
Labels: wayfinder:task

## Question

为每卡 Mock→真数据提供可重复的验证基座：`bash scripts/build.sh` / `dev_build_plugin` / `dev_install_package --profile desktop` 双 Junction / `preview.html` :8788 / `dev_plugin_status`。当前 `lib/client.js` 16210B 去 BOM 状态是否可热重载？缺什么补什么。
AFK task：跑通 build→inject→Ctrl+F5 链路，记录 desktop/web 差异与重启要求，产出 “一次一卡” 验证清单。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:task  --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收
