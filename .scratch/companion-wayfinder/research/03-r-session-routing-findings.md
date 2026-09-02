# R3 — 飞书会话→Harness session 路由事实 研究

> Ticket: 03-r-session-routing.md (wayfinder:research)
> Map: .scratch/companion-wayfinder/map.md
> Date: 2026-09-03
> Sources: D:\dsh-plugin\dsh-im src/channels/shared/conversation-state-store.mjs + src/channels/feishu/state-store.mjs + test/agent-preset-session-lifecycle.test.mjs (133 StateStore hits, 126 sessionFor hits) + plugin-src/host/channels/feishu/production.mjs

## 摘要回答

| 问题 | 结论 |
|---|---|
| 存储位置 | `StateStore` 每 bot 实例化：`new StateStore(statePath(botId)).load()`，落盘为 `~/.dsh/state/<botId>.json` 的 `sessionFor(conversationKey)` 映射 |
| conversationKey 形态 | `direct:<userOpenId>`（私聊） / `group:<chatId>`（群聊），见 `sessionFor('direct:one')` 用例 |
| 获取 sessionId | `state.sessionFor(conversationKey)` → `sessionId` 或 `null`（未绑定）；有则 `mx(harness, sessionId)` 得 `workspaceSession` |
| session.workspace | `harness.workspaceSession(sessionId)` 可得 `session.workspace`，用于判断已绑定/未绑定 |
| 创建新会话 | `state.setSession(conversationKey, newSessionId)` 经 `workspace-session.mjs: Bi()` 的 `eg()` 锁保证并发安全 |
| 权限 | 读 `StateStore` 需 host 侧文件读（需 danger-full-access 兜底），但 client 侧应通过 `connection.rpc` 问 host，避免直读盘 |

## 最小可验

```js
// host 侧（或 via rpc 暴露）
const store = await new StateStore(statePath(botId)).load();
const sid = store.sessionFor('direct:ou_xxx'); // → 'sess-aaa' 或 null
// client 侧跳转
if(sid) harness.openSession(sid); // “[在中间打开]” 按钮动作
```

## 展示脱敏

- 私聊显示: `小帅·飞书私聊@张三 → sess-aaa`（张三为飞书昵称，sess-aaa 截断 8 字符）
- 群聊显示: `小帅·飞书群聊@群名 → sess-bbb`
- 未绑定: 显示 `未绑定 → [去绑定]`
- 真实 `userOpenId/chatId` 不在 UI 明文展示

## 阻塞解除

- P6(E3) 的 “[在中间打开]” 跳转路径已明确，可进入原型。
- 需注意: `StateStore` 为每 channel 各自实现（Feishu/WhatsApp/DingTalk 均继承 ConversationStateStore），E3 初版先做 Feishu，再扩展。

## 备注

- 本研究替代了因 token 超限而中断的 AFK 子智能体 ec48179b，原票保持 open，需在关闭时引用本 findings。
