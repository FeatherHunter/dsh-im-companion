# R1 — dsh-im workspaces 与 RPC 通路事实

Type: research
Status: open
Blocked by: —
Labels: wayfinder:research

## Question

dsh-im 的 `workspaces.json`（多渠道 `.dsh/integrations/*/workspaces.json`）与 `connection.rpc.call('/feishu','bot.workspace.set')` / `connection.status` / `health.status` 在 companion 进程中的真实可读/可写路径是什么？是否需 `danger-full-access`？轮询 vs 推送的实时性如何？
AFK 研究：读 `D:\dsh-plugin\dsh-im/plugin-src/host/channels/feishu/production.mjs: pluginPaths()`、`src/channels/shared/bot-workspace-store.mjs`、`lib/index.js` 的 `ctx.get('dshIm')` 暴露面，产出最小可验读盘/RPC 代码片段。

## Context

- Map: `.scratch/companion-wayfinder/map.md`
- Handoff: `C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-handoff-2026-09-02.md` §3/§4
- Tracker mirror: GitHub Issues 时以 `gh issue create --label wayfinder:research  --parent <map#>` 创建

## Done when

- 决策有记录（废弃/优化/换新均需一句话 rationale）并在 Map Decisions so far 留 gists+link
- 若保留，实现在 `lib/client.js` + `preview.html` 可预览，且 DSH Desktop 重启后可真机验收

## Research Findings

- **Findings**: [.scratch/companion-wayfinder/research/01-r-workspaces-rpc-findings.md](../research/01-r-workspaces-rpc-findings.md)
- **Summary**: workspaces.json = `~/.dsh/integrations/dsh-<channel>/workspaces.json` (BotWorkspaceStore v1/2); companion 可直读盘（需 danger 但已全局放行）但权威读写应走 `ctx.connection.rpc.call('/feishu','connection.status'|'bot.workspace.set')` (需补 `@deepseek-ai/dsh-client-connection` 注入，无需 danger)；health 为 `bots[].health.status` 四态；无推送，15s 轮询唯一实时性，写后应立刷。 (see full note for 最小可验代码 & P1/P2 解阻)
- **Decisions gist for Map**: `- [R1 workspaces/RPC 决策](.scratch/companion-wayfinder/research/01-r-workspaces-rpc-findings.md): workspaces.json 为 \`~/.dsh/integrations/dsh-<channel>/workspaces.json\` （BotWorkspaceStore v1/2），可直读但权威读写走 client RPC；health 四态；15s 轮询。`
