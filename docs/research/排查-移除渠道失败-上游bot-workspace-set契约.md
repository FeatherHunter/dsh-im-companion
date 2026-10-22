# 排查 · 移除渠道失败：上游 `bot.workspace.set` 契约取证（只读取证）

- **取证时间**：2026-10-21 16:26–16:40（Asia/Shanghai）
- **性质**：只读取证。未改本仓任何源码 / 测试 / 其它文档（本文件除外）、未建改 issue、未提交 git、未写任何 `~/.dsh` 数据。
- **上游基线（版本读数）**：dsh-im 装在 `C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@xmanrui\dsh-im`，`package.json:3` = **5.1.0**（任务描述里的 4.39.0 与实机不符，以本读数为准）；`package.json:45-48` 入口 = `./lib/index.js`（host）+ `./lib/client.js`（client）；`package.json:58` 的 `files` 含 `plugin-src` ⇒ **未打包源码随包发布**，可直接读源码取证。下文引用的 `plugin-src/`（未打包）与 `src/`（包根共享层，`plugin-src/` 通过 `../../../../src/…` 相对引用它）即上游一手源。
- **本文只回答一个问题**：dsh-im 的「机器人 ↔ 工作区」绑定端点到底接受什么；「解绑但保留机器人、且机器人以后不再指向旧工作区」在现有契约下有哪几条可行路径。

---

## 结论速览

1. **`bot.workspace.set` 是上游唯一能改「机器人 → 工作区」指针的端点，且 `workspace` 必须是一个绝对路径字符串**。空串、相对路径一律在 **RPC 入参校验**阶段被拒：错误码 `bad-request`、文案逐字「请输入工作区绝对路径。」——这正是「移除渠道」点「确认移除」后失败的直接原因（本仓传的就是空串：`src/client/components/home-move-ops.ts:110`）。
2. **上游没有任何「清空 / 释放 / 解绑机器人工作区」的 RPC 端点**。全包穷举 `bot.*` 端点字面量，无 `bot.workspace.clear` / `bot.workspace.unset` / `bot.unbind` 之类；唯一会连带删掉工作区指针的 `bot.delete` **会把机器人本身（凭据 + 账号配置）一起删掉**，不能替代「只解绑」。
3. **「清理工作区设置」既不是 UI 动作、也不是端点**——它是**诊断面板里「失败阶段」字段的中文标签**（`plugin-src/client/connection-error.js:15` 的 `STAGE_LABELS` 表），对应的 host 侧 stage 名 `workspace.cleanup` 只出现在 `bot.delete` 的清理路径上。官方客户端 UI 里**没有**「清空工作区」入口：官方编辑器只有「选择目录」。
4. **上游唯一的「清空」语义在会话级**：`/conv clear` 斜杠命令清的是「对话专属工作区覆盖」，回落到 bot 默认工作区——既不是 bot 级指针，也不是 RPC 端点。
5. **指针落盘位置与全部写入者已查清**：`<DSH_HOME>/integrations/dsh-<channel>/workspaces.json` 的 `workspaces[botId]`；写入者只有 4 个（端点 `bot.workspace.set`、启动期 `ensure()`、`reconcile()` 删除、`bot.delete` 之后的 retire），**没有第二个端点能写它**；且读侧缺条目时回落默认工作区，**永不为空串**。
6. **因此「先把远端 workspace 置空」这一步在现有契约下做不到**（硬事实）。而本仓当前把它当成**硬前置**、失败即 fail-closed 直接 `return`（`home-move-ops.ts:110`），于是助理行永远解绑不了——**这是设计缺陷，不是偶发错误**。修法必须换语义（改绑 / 降级为尽力而为 / 或走「删机器人」），继续靠空串不可能修好。

---

## 逐条取证

### 1. `bot.workspace.set` 的完整入参契约

#### 1.1 端点常量与校验函数（一手原文）

`plugin-src/host/channels/shared/workspace-rpc.mjs`（全文 32 行）：

~~~js
3	export const SET_WORKSPACE_ENDPOINT = 'bot.workspace.set';
5	export function validWorkspacePayload(payload) {
6	  return payload !== null
7	    && typeof payload === 'object'
8	    && !Array.isArray(payload)
9	    && Object.keys(payload).every((key) => ['botId', 'workspace'].includes(key))
10	    && typeof payload.botId === 'string'
11	    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
12	    && typeof payload.workspace === 'string'
13	    && payload.workspace.length <= 4_096
14	    && isAbsolute(payload.workspace.trim());
15	}
~~~

- **字段白名单严格**：payload 只允许 `botId` 与 `workspace` 两个键，多一个键整包拒。
- **botId 形态**：`string`，必须匹配 `/^[A-Za-z0-9_-]{1,128}$/`。
- **workspace 形态**：`string`，长度 ≤ 4096，且 `isAbsolute(payload.workspace.trim())` ⇒ **必须绝对路径**（Windows 下 `isAbsolute('C:\\x')` 为真；`isAbsolute('')` 为 **false**）。
- 同文件 `:17-32` 的 `publicWorkspaceError()` 是**错误码白名单**（`workspace-not-absolute` / `workspace-not-found` / `workspace-not-directory` / `workspace-bot-not-found` / `agent-preset-*` / `model-selection-*` / `model-reasoning-unavailable` / `context-enhancement-invalid` / `access-policy-invalid`），不在白名单的错误码会被吞成 `null`。

#### 1.2 空串 / 相对路径分别得到什么

**在 RPC 入口就被拒（根本没进存储层）**，错误码 `bad-request`：

- 微信渠道 `plugin-src/host/channels/weixin/rpc.mjs:89-92`
  ~~~js
  89	  if (endpoint === WEIXIN_ENDPOINTS.setWorkspace) {
  90	    return validWorkspacePayload(payload)
  91	      ? null : '请输入工作区绝对路径。';
  92	  }
  ~~~
- 通用 token 渠道 `plugin-src/host/channels/shared/rpc.mjs:80-83`（原文同上）。
- 其余渠道同款：`whatsapp/rpc.mjs:75`、`feishu/rpc.mjs:458`、`dingtalk/rpc.mjs:104`、`wecom/rpc.mjs:85`、`wecom-app/rpc.mjs:107`、`qq/rpc.mjs:86`、`matrix/rpc.mjs:95`、`slack/rpc.mjs:84`。

失败响应形状（`weixin/rpc.mjs:119-121`，调用点 `:184-185`）：

~~~js
119	function badRequest(message) {
120	  return { ok: false, error: { code: 'bad-request', message } };
121	}
...
184	    const invalid = payloadFailure(endpoint, payload);
185	    if (invalid) return badRequest(invalid);
~~~

⇒ **错误码 `bad-request`，message 逐字「请输入工作区绝对路径。」**——与日志实测报错原文一致。

**第二道防线**（存储层，路径类错误；相对路径走到这里同样是拒）——`src/channels/shared/bot-workspace-store.mjs:381-403`：

~~~js
381	export async function validateWorkspacePath(value, { ungroupedWorkspace } = {}) {
382	  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value.trim())) {
383	    const error = new Error('工作区必须是绝对路径。');
384	    error.code = 'workspace-not-absolute';
385	    throw error;
386	  }
387	  const workspace = resolve(value.trim());
388	  await ensureImWorkspaceDirectory(workspace, ungroupedWorkspace);
389	  let info;
390	  try {
391	    info = await stat(workspace);
392	  } catch (cause) {
393	    const error = new Error('工作区路径不存在。', { cause });
394	    error.code = 'workspace-not-found';
395	    throw error;
396	  }
397	  if (!info.isDirectory()) {
398	    const error = new Error('工作区路径必须指向一个目录。');
399	    error.code = 'workspace-not-directory';
400	    throw error;
401	  }
402	  return workspace;
403	}
~~~

⇒ 三种 workspace 形态的落点：**空串/相对路径 ⇒ 入参校验失败（`bad-request`，「请输入工作区绝对路径。」）；绝对路径但不存在 ⇒ `workspace-not-found`；存在但不是目录 ⇒ `workspace-not-directory`；合法绝对目录 ⇒ 落库。**

#### 1.3 端点如何落到存储层

- `weixin/rpc.mjs:232-237`：
  ~~~js
  232	      } else if (endpoint === WEIXIN_ENDPOINTS.setWorkspace) {
  233	        if (typeof controller.updateWorkspace !== 'function') throw new Error('Workspace update is unavailable');
  234	        value = await publicStatus(
  235	          await controller.updateWorkspace(payload.botId, payload.workspace),
  236	          cachedEncode,
  237	        );
  ~~~
- 实现 `src/channels/shared/bot-workspace-store.mjs:2210-2229`：先确认机器人存在（否则 `workspace-bot-not-found`，`:2217-2221`），再 `workspaces.setWorkspace(botId, workspace, {clearSessions, incarnation})`（`:2223-2226`）。
- 落库 `src/channels/shared/bot-workspace-store.mjs:770-804`，关键行 `:795` `this.#workspaces[id] = workspace;` + `:797` `await this.#persist();`（先推进 generation、清会话映射，再写新指针；写失败回滚旧值 `:798-800`）。
- 失败时的诊断阶段映射 `weixin/rpc.mjs:281`：`'bot.workspace.set': ['workspace.write', 'workspace-save-failed']`。

---

### 2. 上游 `bot.*` 端点全表：**没有任何「清空工作区」端点**

穷举方式：对 `plugin-src/host` 全目录 grep `'bot\.[a-z0-9.-]+'`（命中即端点字面量），再对整包 grep `workspace\.(clear|unset|remove|delete|reset|unbind|null)` —— **零命中**。

| 端点 | 语义 | 出处（文件:行） |
|---|---|---|
| `bot.workspace.set` | 改「机器人 → 工作区」指针；只接受绝对路径 | `plugin-src/host/channels/shared/workspace-rpc.mjs:3`（各渠道 rpc.mjs 复用同一常量） |
| `bot.delete` | **删机器人**：停 runtime → 删凭据 → 删账号配置 → 连带 retire 工作区指针 | `plugin-src/host/channels/shared/rpc.mjs:25`、`plugin-src/host/channels/weixin/rpc.mjs:31` |
| `bot.reconnect` | 重连（绑定保留） | `shared/rpc.mjs:24`、`weixin/rpc.mjs:30` |
| `bot.disconnect` | **仅飞书有**：只停运行时，凭据/配置保留 | `plugin-src/host/channels/feishu/rpc.mjs:55`；实现 `src/channels/feishu/multi-bot-controller.mjs:734-745` |
| `bot.bind-credentials` | 绑定 token 类渠道凭据 | `shared/rpc.mjs:23`、`dingtalk/rpc.mjs:24`、`qq/rpc.mjs:24`、`matrix/rpc.mjs:23`、`slack/rpc.mjs:23`、`wecom/rpc.mjs:23` |
| `bot.bind-native` | iMessage 原生绑定 | `imessage/rpc.mjs:9-10` |
| `bot.bind` / `bot.settings.update` / `bot.callback-secret.reset` | 企微应用专有 | `wecom-app/rpc.mjs:19-21` |
| `bot.bind-mailbox` / `bot.mailbox.update` / `bot.auth.start` / `bot.auth.poll` / `bot.session-binding.get` / `bot.session-binding.set` / `bot.session.list` | 邮箱渠道专有 | `email/rpc.mjs:12-30` |
| `bot.model.set` | 改模型 | `plugin-src/host/channels/shared/model-setting-rpc.mjs:3` |
| `bot.agent-preset.set` | 改 Agent Preset | `plugin-src/host/channels/shared/agent-preset-rpc.mjs:3` |
| `bot.context-enhancement.set` | 改上下文增强 | `plugin-src/host/channels/shared/context-enhancement-rpc.mjs:3` |
| `bot.access-policy.set` | 改访问策略 | `plugin-src/host/channels/shared/access-policy-rpc.mjs:3` |
| `bot.alias.set` | 改别名 | `plugin-src/host/channels/weixin/rpc.mjs:38`（`SET_ALIAS_ENDPOINT`） |
| `bot.message-mode.set` / `bot.busy-message-mode.set` | 改消息处理方式 | `imessage/rpc.mjs:18`、`weixin/rpc.mjs:36` |
| `bot.thinking-traces.set` | 改思考留痕 | `plugin-src/host/channels/shared/thinking-traces-rpc.mjs:1` |
| `bot.sender.approve` / `bot.sender.revoke` | 钉钉发信人白名单 | `dingtalk/rpc.mjs:34-35` |
| `connection.status` / `provision.*` | 状态与接入流程（非 `bot.*`） | `weixin/rpc.mjs:25-29` |

**结论**：**没有** `bot.workspace.clear` / `bot.workspace.unset` / `bot.unbind` / `bot.detach` 之类；`bot.delete` 是唯一会连带删掉 `workspaces[botId]` 的端点，但它同时删机器人本身。

#### `bot.delete` 会把机器人本身删掉（不能替代「只解绑」）

入参：`{botId, confirm: true}` —— `plugin-src/host/channels/weixin/rpc.mjs:84-88`、`plugin-src/host/channels/shared/rpc.mjs:76-79`：

~~~js
84	  if (endpoint === WEIXIN_ENDPOINTS.deleteBot) {
85	    return exactKeys(payload, ['botId', 'confirm']) && validId(payload.botId) && payload.confirm === true
86	      ? null : 'bot.delete requires a botId and confirm=true.';
87	  }
~~~

实现 `src/channels/shared/token-bot-controller.mjs:266-293`（一手原文节选）：

~~~js
266	  async deleteBot(botId) {
...
271	        const previous = await atConnectionStage('credential.read', () => this.#credentials.resolve(config.tokenRef), 'credential-store');
272	        await this.#stopRuntime(botId);
273	        try {
274	          await atConnectionStage('credential.remove', () => this.#credentials.unset(config.tokenRef), 'credential-store');
275	          await atConnectionStage('account.remove', () => this.#configStore.remove(botId), 'account-config');
...
288	      await this.#deleteState({ botId, config }).catch(error => { warnings.push(...stage: 'state.cleanup'...)});
~~~

⇒ **凭据（`credentials.unset`）＋ 账号配置（`configStore.remove`）＋ 会话状态（`deleteState`）全删**，机器人没了、要重新扫码接入。**它不是「只解绑」。**

---

### 3. 官方客户端 UI 的「清理工作区设置」到底是什么

#### 3.1 它是诊断阶段标签，不是 UI 动作、不是端点

`plugin-src/client/connection-error.js:6-19`（`STAGE_LABELS` 表），第 15 行原文：

~~~js
15	  'workspace.write': '保存工作区设置', 'workspace.cleanup': '清理工作区设置', 'runtime.prepare': '准备消息连接',
~~~

消费点只有一处，`connection-error.js:60`：

~~~js
60	    ['失败阶段', localizeText(STAGE_LABELS[details.stage] ?? details.stage ?? '')],
~~~

⇒ 「清理工作区设置」只是把 host 报上来的 `details.stage === 'workspace.cleanup'` 翻成中文显示在诊断详情表里。

**`workspace.cleanup` 这个 stage 在上游全部出现处**（全包 grep）：

- `src/channels/shared/bot-workspace-store.mjs:1548-1549`（`observeBotWorkspaceRemovals` 包在 `configStore.remove` 上的代理）：
  ~~~js
  1548	            const cleanup = await atConnectionStage('workspace.cleanup', () => workspaces.retireAfterConfigCommit(botId), 'workspace-config');
  1549	            if (cleanup?.error) throw connectionStageError(cleanup.error, 'workspace.cleanup', 'workspace-config');
  ~~~
- `src/channels/shared/bot-workspace-store.mjs:2385`（清理失败的 warning 包装）
- `src/channels/shared/token-bot-controller.mjs:278` 与各渠道 controller 的 `bot.delete` warning：`dingtalk-controller.mjs:472`、`email-controller.mjs:355`、`qq-controller.mjs:326`、`slack-controller.mjs:238`、`wecom-controller.mjs:310`、`wecom-app-controller.mjs:321`、`whatsapp-controller.mjs:289`
- 已知阶段白名单：`src/channels/shared/diagnostic-details.mjs:12`；错误码映射 `src/channels/weixin/connection-error.mjs:87` `'workspace-cleanup-failed': ['workspace.cleanup', 'workspace-config']`

⇒ **全部落在 `bot.delete` 的清理路径上**。它不是「清理工作区设置」这个动作。

#### 3.2 官方 UI 里没有「清空 / 解绑工作区」入口

- `plugin-src/client/workspace-editor.js`（全文 69 行）：只有「当前工作区」（L45）+「选择目录」按钮（L46-52），未设置时显示「未设置」（L58）；保存回调 `onSave?.(value)`（L33），`value` 恒为**选中的目录**（`pick` 里 `if (!value || …) return;`，L24）。
- 官方调用方式 `plugin-src/client/channels/weixin/index.js:632-640`：
  ~~~js
  632	  const saveWorkspace = React.useCallback(async (account, workspace) => {
  ...
  637	      const snapshot = normalizeSnapshot(await invoke(
  638	        WEIXIN_ENDPOINTS.setWorkspace,
  639	        { botId: account.botId, workspace },
  640	      ));
  ~~~
  同款：`channels/shared/token-channel.js:366`、`feishu/index.js:1351`、`qq/index.js:519`、`wecom/index.js:550`、`wecom-app/index.js:567`、`whatsapp/index.js:527`、`dingtalk/index.js:795`；客户端常量 `plugin-src/client/channels/weixin/api.js:20` 等。
- `plugin-src/client/bot-general-settings.js`（120 行）只管 `busyMessageMode` / 飞书 `stepCardPanels`，**不含工作区**。
- 中文文案侧：`plugin-src/client/i18n.js:388`「当前工作区」、`:408`「工作区绝对路径」、`:481`「请输入工作区绝对路径。」——**i18n.js 里没有「清理工作区设置」这一条**（该词只出现在 `connection-error.js:15`；任务描述把它记在 i18n.js 下有误）。

⇒ **判定：官方没有「清空机器人工作区」这个语义（至少 5.1.0 的 RPC 层与 UI 层都没有）。**

#### 3.3 上游唯一的「清空」语义在会话级（非 RPC）

`src/channels/shared/workspace-command.mjs:447-457`：

~~~js
447	  if (/^(?:--default|clear)$/iu.test(argument)) {
448	    try {
449	      const current = await harness.clearConversationWorkspace(conversationKey);
450	      harness.assertWorkspaceScope?.();
451	      return commandResult(t('已清除对话专属工作区，当前使用 bot 默认工作区：{workspace}（之后默认工作区的变化会同步到本对话）', { workspace: current }));
~~~

落库侧 `src/channels/shared/bot-workspace-store.mjs:1003-1062`：`applyConversationWorkspaceSwitch(..., value = null, ...)` ⇒ `:1020` `const workspace = value === null ? null : await validateWorkspacePath(...)` ⇒ `:1058-1062` `delete overrides[key]`。

⇒ 它清的是 **`#conversationWorkspaces[botId][conversationKey]`（对话覆盖表）**，回落到 bot 级工作区；**完全不碰 `workspaces[botId]`**。用法是聊天里发 `/conv clear`（帮助文案见 `workspace-command.mjs:437`）。

---

### 4. 机器人的工作区指针存在哪、谁在写

#### 4.1 路径

`plugin-src/host/channels/shared/production.mjs:33-41`：

~~~js
33	export function pluginPaths(config, channel) {
34	  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
35	  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', `dsh-${channel}`));
36	  return {
37	    config: resolve(config.configPath ?? join(root, 'config.json')),
38	    bots: resolve(config.botsDir ?? join(root, 'bots')),
39	    workspaces: resolve(config.workspacesPath ?? join(root, 'workspaces.json')),
40	  };
41	}
~~~

⇒ 实机路径：`C:\Users\辰辰洋洋\.dsh\integrations\dsh-weixin\workspaces.json`。**本机实测内容**（30 行，节选）：

~~~json
{
  "version": 2,
  "workspaces": {
    "wx_d3c34f555e4f2542fd2db9c7": "D:\\dsh-plugin\\dsh-opencode-palette"
  },
  "accessPolicies": { "wx_d3c34f555e4f2542fd2db9c7": { "direct": { "mode": "allowlist" }, "group": { "mode": "allowlist" } } }
}
~~~

（形状与已有笔记 `T1-工作区创建绑定取证.md:141` 记的一致；本机是 v2 且另带 `accessPolicies`。）

#### 4.2 `workspaces[botId]` 这张表的**全部**写入者

1. **`bot.workspace.set`** → `updateWorkspace` → `setWorkspace`（`bot-workspace-store.mjs:770-804`，`:795` 写值、`:797` `#persist()`）。
2. **渠道启动期 `ensure()`**（给还没进表的机器人播种**默认工作区**）：`production.mjs:77-80` 与 `:90-93` → `bot-workspace-store.mjs:705-768`，`:736` `this.#workspaces[id] = initialWorkspace;`。
3. **`reconcile()`**（启动时把「配置里已不存在的机器人」的条目**删掉**）：`bot-workspace-store.mjs:1289-1306`，`:1304` `await this.remove(botId);`。
4. **`bot.delete` 之后的 retire**：`observeBotWorkspaceRemovals`（`:1527-1563`）→ `retireAfterConfigCommit`（`:1266-1273`）→ `#retireCurrentIncarnation`（`:1354-1392`，`:1367` `delete this.#workspaces[id];`）。

⇒ **没有第二个端点能写这张表**；会话级覆盖表 `#conversationWorkspaces` 是另一张表（`:806-828`、`:1003-1062`）。

#### 4.3 读侧：缺条目回落默认工作区，**永不为空串**

`bot-workspace-store.mjs:494-496`：

~~~js
494	  workspaceFor(botId) {
495	    return this.#workspaces[botIdOf(botId)] ?? this.#defaultWorkspace;
496	  }
~~~

`#defaultWorkspace` 来自 `src/channels/shared/default-workspace.mjs:21-25`：

~~~js
5	export function defaultImWorkspace(config = {}) {
6	  const dshHome = config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
7	  return resolve(dshHome, 'im');
8	}
...
21	export async function prepareBotWorkspace(config = {}) {
22	  const ungroupedWorkspace = defaultImWorkspace(config);
23	  const defaultWorkspace = resolve(config.workspace ?? ungroupedWorkspace);
24	  return { defaultWorkspace, ungroupedWorkspace };
25	}
~~~

⇒ 实机默认工作区 = `C:\Users\辰辰洋洋\.dsh\im`。且 `ensureImWorkspaceDirectory`（`:27-30`）在路径等于 ungroupedWorkspace 时会 `mkdir` ⇒ **把它作为「中性工作区」传过去是可行的**。

#### 4.4 手改文件这条路走不通

`bot-workspace-store.mjs:1405-1427` 的 `#persist()` 把**整个内存态**写回文件：

~~~js
1414	    await writeStoredDocument(this.#path, storedDocument({
1415	      version,
1416	      workspaces: this.#workspaces,
...
1425	    }));
~~~

落盘是「写临时文件再 rename」（`:371-379`）。⇒ 外部删掉 `workspaces[botId]` 后，**进程内的 `#workspaces` 仍是旧值，下一次 `#persist()` 会把它原样写回去**；上游也没有「从磁盘重载」的入口。

---

### 5. 本仓调用点与失败形态（与日志实测对上）

- `src/client/components/home-move-ops.ts:110`
  ~~~ts
  110	      if (!await bindBot(rpc, a.channel, a.botId, '')) { aLog('unbind', id, false, '远端工作区清空失败，移除中止：机器人连接保留，助理行未解绑'); return }
  ~~~
  ⇒ 失败即 `return`，**`assistant.unbind`（`:112`）根本没发出去**，助理行永远停在 `bound`。
- `src/client/components/home-ops.ts:105-131` `bindBot()`：`:109` 调 `rpc('/'+channel, 'bot.workspace.set', {botId, workspace}, AbortSignal.timeout(8000))`；`:112-116` 只对 `workspace-bot-not-found` 重试 5 次×2s；其它错误码（含 `bad-request`）在 `:117` 直接 toast「绑定失败：<原文>」并 `return false`。
  ⇒ 传空串 ⇒ 上游 `bad-request` / 「请输入工作区绝对路径。」⇒ `:117` toast ⇒ `:110` return。**与日志实测报错原文一致。**
- 同款空串硬前置还有三处：`home-move-ops.ts:128`（removeAssistant）、`:172`（removeHome）；反向的 `:150`（rebindHome，绑到 path，失败即 throw）。

---

## 对本插件修法的约束

### 硬事实（有一手出处，不该再讨论）

- **H1** 上游 `bot.workspace.set` 的 `workspace` 必须是绝对路径；空串/相对路径一律 `bad-request`（`workspace-rpc.mjs:5-15`；`weixin/rpc.mjs:89-92`、`:119-121`、`:184-185`）。
- **H2** 上游**没有**「清空/释放机器人工作区」的 RPC 端点（全包穷举，见 `2）。
- **H3** `bot.delete` 会删机器人本身（凭据 + 账号配置 + 会话状态），不是「只解绑」（`token-bot-controller.mjs:266-293`）。
- **H4** 指针表只有 `4.2` 那 4 处在写；手改文件会被 `#persist` 全量覆盖（`:1405-1427`）。
- **H5** 上游读侧永不返回空串工作区：缺条目回落 `~/.dsh/im`（`:494-496` + `default-workspace.mjs:5-8`）。
- **H6** 官方客户端没有「清空工作区」入口（`workspace-editor.js` 全文只有「选择目录」）；「清理工作区设置」只是诊断阶段标签（`connection-error.js:15`）。
- **H7** 上游唯一的「清空」语义是会话级 `/conv clear`（`workspace-command.mjs:447-457`），与 bot 级指针无关。

⇒ 由 **H1 + H2** 直接推出：**「把远端 workspace 置空」在现有契约下不可实现**；而它现在是硬前置（`home-move-ops.ts:110`），于是「移除渠道」在这条链上**永远失败**——是设计缺陷，不是偶发错误。

### 可行路径（按语义代价排序）

- **P1 改绑到中性工作区**（候选首选）：把 `bindBot(..., '')` 换成 `bindBot(..., <上游默认工作区> = resolve(dshHome,'im'))`。该目录会被上游自动 mkdir（`default-workspace.mjs:27-30`），所以绝对路径在盘上可行。语义：机器人保留、连接不断、**不再指向旧家**；代价：机器人此后在 `~/.dsh/im` 里跑会话，与「家」语义脱钩，且该路径对用户不可见。
- **P2 改绑到本插件选定的家路径**：把「解绑」降级为「换绑」——满足「不再指向旧工作区」，但语义不是解绑，UI 文案要区分「移除渠道」与「换绑」。
- **P3 只解绑本地、远端指针留着**：`assistant.unbind` 照做，不发 `bot.workspace.set`。满足「解绑本地绑定 + 不断连接」，**不满足**「机器人不再指向旧工作区」——机器人继续在旧家里跑会话；面板显示已解绑、机器人其实还指着旧家，存在认知分裂风险。
- **P4 走 `bot.delete`**：机器人连同凭据一起删。满足「不再指向」，但违背「保留机器人」、用户要重新扫码接入；而且删机器人账号是 dsh-im 官方 UI 的权限域，**不建议**本插件擅自触发。
- **P5 手改 `workspaces.json`**：被 **H4** 否掉。

### 待决策（需要 owner / 产品拍板）

1. 「移除渠道」的对外语义到底是「解绑本地绑定」（P3），还是「机器人也不许再指着旧工作区」（P1/P2）？这两者在当前上游契约下**不能同时满足**。
2. 若选 P1/P2，界面上「移除渠道」与「换绑到别家」要不要合并为一个动作？（P1 的中性目录对用户不可见，可能需要文案解释。）
3. 无论选哪条，**「先把远端 workspace 置空」都不应再是硬前置**：它是不可实现的，fail-closed 会把整个功能锁死。可行形状是「尽力而为 + 明确留痕」（改绑成功就改绑；失败也照常解绑本地，并在日志/提示里说明远端仍指着旧家）。这与仓库既有规格一致：T3 把「未绑定」与「孤儿」定为一等状态（`T3-…:50`），且用户故事明写「未绑定工作区的机器人升级后进暂存而不是被丢弃」（`T3-…:38`）。
4. 若坚持 fail-closed 语义，则前置动作必须从「置空」换成「改绑到 X」（P1/P2）——仍是 fail-closed，但动作是可实现的。
5. 若目标仅仅是「机器人以后能再绑别的助理」，则**根本不需要清空能力**：指针本来就随时可写，P3 + 后续「换绑」即可满足整条用户故事。需确认这句诉求是否真的包含「机器人现在就得不再指向旧工作区」（见未解问题 U4）。

### 未解问题

- **U1** 上游 `bot.disconnect` 只有飞书有（`plugin-src/host/channels/feishu/rpc.mjs:55`），语义是「只停运行时，凭据/配置保留」——源码注释原文（`src/channels/feishu/multi-bot-controller.mjs:735-737`）：「An operational pause only: credentials/config remain durable, so the bot reconnects on the next Host start unless it is explicitly deleted.」。**微信渠道没有对应端点** ⇒ 「不断连接但机器人不指向旧家」在微信上无法靠 disconnect 达成。未验证：其它渠道后续补该端点时是否同一语义。
- **U2** 若走 P1，`~/.dsh/im` 对用户不可见也不可管理。上游 `prepareBotWorkspace` 支持用 `config.workspace` 覆盖默认工作区（`default-workspace.mjs:23`），但那是 dsh-im 的启动配置，**本插件是否有权读/写未证实**。
- **U3** 本机只读了 weixin 的 `workspaces.json`；其它渠道的路径按 `production.mjs:33-41` 规则替换 `dsh-<channel>`，未逐一读取。
- **U4** 用户诉求原话「机器人以后能再绑别的助理」是否隐含「机器人现在就得不再指向旧工作区」——**未证实**（这决定 P3 是否已足够）。
- **U5** 上游 `plugin-src/` 与 `lib/`（minified）是否逐字等价：本次只对 `validateWorkspacePath` 做了抽查（`lib/index.js:259` 含同一段逻辑与同一错误码 `workspace-not-absolute`），其余结论均以 `plugin-src/` + `src/` 源码为准。
- **U6** 本仓 `src/features/adopt/model.ts:33-35` 的 `unboundBots`（过滤 `!b.workspace`）对应的是**本仓本地模型**的判空（快照来源 `src/client/data/fleet-api.ts:133` `workspace: b.workspace ?? b.workspacePath ?? ''`），**不是上游能产出的状态**——上游 `decorateStatus` 无条件写 `workspace: this.workspaceFor(bot.botId)`（`bot-workspace-store.mjs:1316`），而 `workspaceFor` 缺条目时回落默认工作区（`:494-496`），永不为空串。该分支在本仓属防御性分支，**不能**用它论证「上游支持空 workspace」。

---

## 已有笔记复用说明

- `docs/research/T1-工作区创建绑定取证.md:68-70`（`2.3`）——**已记**：绑定走 `ctx.connection.rpc.call(/+channel, bot.workspace.set, {botId, workspace})`；新机器人登记竞态码 `workspace-bot-not-found` 按 5 次×2s 重试；并点明这是 dsh-im 的 `workspaces.json`（botId→path），与 DSH 注册表是两套东西。**本笔记不重复这段**，只补它没覆盖的两点：① 入参必须绝对路径（空串被拒）② 上游无清空语义。
- `docs/research/T1-工作区创建绑定取证.md:141`（`4.1` 表）——**已记** dsh-im 绑定源形状 `{version, workspaces:{botId: wsPath}, agentPresets, contextEnhancement}`；**本笔记补**：实机 weixin 是 v2 且另带 `accessPolicies`，并给出**全部写入者**（`4.2`）。
- `docs/research/T3-家助理数据模型与命名回落规格.md:50`——**已记**助理状态含 `'unbound' | 'bound' | 'orphan'`，「未绑定」是一等合法态；`:49` 家记录含 `tombstone`（解绑时间与原因，替代真删）；`:38` 用户故事「未绑定工作区的机器人升级后进暂存而不是被丢弃」；`:57` 原子性边界「跨系统三步无事务，只要求幂等 + 孤儿态」。**本笔记据此主张**：解绑动作应能承受远端不可写，而不是像现在这样让远端步骤把本地步骤一起锁死。
- `docs/research/T1-工作区创建绑定取证.md:153`（`4.3` 第 3 条）提到「workspace 为空串的 bot 进暂存区」——见 U6：那是本仓本地模型的判空分支，**不能**当作「上游支持空 workspace」的依据。

---

## 附：本仓需连带处理的文档维护

`docs/research/INDEX.md:7` 的维护规矩是「新增或修订 `docs/research/` 里的文档时，同一次改动里更新本页对应行（一文件一行）」。本次按任务约束**只新增本文件**，未改 INDEX.md——需另行补一行指向本笔记。
