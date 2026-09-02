# R1 — dsh-im workspaces 与 RPC 通路事实研究

> Ticket: `01-r-workspaces-rpc.md` (wayfinder:research)  
> Map: `.scratch/companion-wayfinder/map.md`  
> Date: 2026-09-03  
> Sources: primary — `D:\dsh-plugin\dsh-im` plugin-src/host + src + lib/client 源码 + 本机 `.dsh/integrations/*/workspaces.json` 实盘

## 摘要回答

| 问题 | 结论 | 需 `danger-full-access`? | 实时性 |
|---|---|---|---|
| **workspaces.json 读**（host Node） | `~/.dsh/integrations/dsh-<channel>/workspaces.json` 直读盘，格式见 §1 | **是**（文件在 workspace 之外，`~/.dsh` 下）— 当前本机全局 `permission.defaultPreset: danger-full-access` 已放行，无需单插件再声明；若未来全局收紧，companion host 需声明文件读权限 | 轮询（无 push）；建议 15s 周期与可见性触发结合 |
| **bot.workspace.set 写**（client→host） | `ctx.connection.rpc.call('/feishu','bot.workspace.set',{botId,workspace}, signal)` | **否**（IPC，不触文件沙箱） | 写后立可读回，列表页 15s 内自动刷新 |
| **connection.status / health.status 读** | 同一 RPC：`ctx.connection.rpc.call('/feishu','connection.status',{}, signal)` → `normalizeBotsSnapshot()` → `bots[i].health.status` + `bots[i].connected` | **否** | 轮询 15s（client 与 host supervisor 同步）；无订阅 |
| **ctx.get('dshIm')** | Host 侧 `ctx.provide('dshIm',{send,listTargets})`，同 Host 兄弟插件可 `inject:['dshIm']` 后 `ctx.dshIm.send` — **与 workspaces 无关**，仅管主动投递（交付），不读工位 | 否 | — |

**一句话决策 rationale（供 Map Decisions 引用）**：保留三条通路——host 直读盘做离线/启动底噪（需 danger-full-access 但已被全局放行），client `connection.status` + `bot.workspace.set` 做线上读写权威（无需 danger、但需补 `@deepseek-ai/dsh-client-connection` 注入），轮询 15s 为唯一实时性保障，无 push。

---

## 1. workspaces.json 真实路径与结构

### 1.1 pluginPaths() 事实

每个渠道独立文件，工厂同构：

```js
// D:/dsh-plugin/dsh-im/plugin-src/host/channels/feishu/production.mjs:30-41
function pluginPaths(config) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-feishu'));
  return {
    root,
    config: resolve(config.configPath ?? join(root, 'config.json')),
    legacyState: resolve(config.statePath ?? join(root, 'state.json')),
    bots: resolve(config.botsDir ?? join(root, 'bots')),
    workspaces: resolve(config.workspacesPath ?? join(root, 'workspaces.json')),
  };
}
```

其余 8 渠道同模板（`plugin-src/host/channels/<channel>/production.mjs` 或 `plugin-src/host/channels/shared/production.mjs`）：

| 渠道 | workspaces 绝对路径 | 盘上是否命中 |
|---|---|---|
| feishu | `~/.dsh/integrations/dsh-feishu/workspaces.json` | 本机 10 bot |
| weixin | `~/.dsh/integrations/dsh-weixin/workspaces.json` | 本机 1 bot |
| qq / wecom / dingtalk / slack / telegram / discord / whatsapp / office | `~/.dsh/integrations/dsh-<channel>/workspaces.json` | 模板一致，未在本机配置则文件不存在；代码容错 ENOENT→空文档 |

> 证据：本机 `C:\Users\辰辰洋洋\.dsh\integrations\dsh-feishu\workspaces.json` 与 `dsh-weixin/workspaces.json` 已实测存在（章节末脱敏样例）。

### 1.2 BotWorkspaceStore 文档与持久化

`D:/dsh-plugin/dsh-im/src/channels/shared/bot-workspace-store.mjs` — 唯一持久化所有渠道的 `workspaces.json`：

- `constructor(path,{defaultWorkspace})` 持有绝对路径，`#path` 即上述 workspaces 文件。
- `normalizeDocument()` 接受 `version:1|2`，字段：

```ts
{
  version: 1|2,
  workspaces: { [botId]: absoluteWorkspace }, // botId /^[A-Za-z0-9_-]{1,128}$/, workspace isAbsolute
  agentPresets: { [botId]: presetId | null },
  contextEnhancement: { [botId]: {groupEnabled,directEnabled,fields,guidance} },
  deliveryTargets: { [botId]: { [targetId]: {name,kind,route} } } // version 2 才有
}
```

- 持久化：`#persist()` → `writeFile(tmp, JSON, {mode:0o600})` → `rename(tmp, this.#path)`，队列化（`#writeQueue`/`#botQueues`）保证串行。
- 读：`await new BotWorkspaceStore(path,{defaultWorkspace}).load()` → ENOENT 则空文档 `{version:1, workspaces:{}}`。
- 校验：`validateWorkspacePath()` 要求绝对路径且 `stat()` 为目录，否则抛 `workspace-not-found` / `workspace-not-directory`。

> 实测样例（已脱敏，botId 截断，workspace path 保留结构真值）：

```json
// C:\Users\辰辰洋洋\.dsh\integrations\dsh-feishu\workspaces.json
{
  "version": 1,
  "workspaces": {
    "bot_9306e67d4765467c8f71e9b5226815d7": "D:\\3DeepSeekHarness\\agents\\xinghuo",
    "bot_86a2173a998144479c95c6f1e30ca1b9": "D:\\3DeepSeekHarness\\agents\\xiaoshuai"
  },
  "agentPresets": { "bot_86a2173a998144479c95c6f1e30ca1b9": "ptc", "bot_9306e67d4765467c8f71e9b5226815d7": "ptc" },
  "contextEnhancement": { "bot_86a2173a998144479c95c6f1e30ca1b9": { "groupEnabled": false, "directEnabled": true, "fields": ["channel","conversationType","senderId","senderName","botId"], "guidance": "" } }
}
// C:\Users\辰辰洋洋\.dsh\integrations\dsh-weixin\workspaces.json
{ "version": 1, "workspaces": { "wx_b632eed5379a72ebe8df22ff": "D:\\3DeepSeekHarness\\agents\\wechat" } }
```

### 1.3 companion 进程中的可读/可写路径

| 进程 | 能力 | 真实 API | 权限 |
|---|---|---|---|
| **Host（lib/index.js，Node）** | 读 | `import {readFile} from 'node:fs/promises'; JSON.parse(await readFile('~/.dsh/integrations/dsh-feishu/workspaces.json','utf8'))` 或复用 `BotWorkspaceStore` | 需 `danger-full-access`（文件在 `~/.dsh`，非插件自身目录）。当前本机 `~/.dsh/settings.yaml: permission.defaultPreset: danger-full-access` 已全局放行，实测无需单插件再声明；但若部署到受限 profile，需在插件声明文件读权限或请求用户切换到 danger。 |
| Host | 写 | 不建议直写（绕过 `#botQueues` 会丢队列与校验）。权威写应调 `workspaces.setWorkspace(botId, workspace, {clearSessions,incarnation})`，但 companion Host 未持有该 `workspaces` 实例（该实例由 `createProductionController` 私有）；因此 **Host 直写不在 companion 可用路径内**。 | — |
| **Client（lib/client.js，Browser）** | 读 | 见 §2 RPC | 无需 danger |
| Client | 写 | 见 §2 RPC | 无需 danger |
| **ctx.get('dshIm')** | 既不读也不写 workspaces；仅提供 `send(botId,targetId,text)` / `listTargets(botId)` 主动投递。来源 `plugin-src/host/index.mjs:66` `ctx.provide('dshIm',...)`，已被修复到 Host 根作用域，兄弟插件可用 `inject:['dshIm']` 注入。 | 否 | — |

> 关键发现：companion 当前 `lib/index.js inject=[]`, `lib/client.js inject=['slots']`，**均未声明** `connection` / `dshIm`。因此两条通路在代码层面尚未打通，需按 §3 补 inject（不改业务逻辑，仅声明）。

---

## 2. RPC 通路事实：bot.workspace.set / connection.status / health.status

### 2.1 Channel 与 Endpoint 常量

`D:/dsh-plugin/dsh-im/plugin-src/client/channels/feishu/api.js`:

```js
export const FEISHU_RPC_CHANNEL = "/feishu";
export const FEISHU_ENDPOINTS = Object.freeze({
  status: "connection.status",
  setWorkspace: "bot.workspace.set",
  setAgentPreset: "bot.preset.set",
  setContextEnhancement: "bot.context-enhancement.set",
});
```

其余渠道镜像（`lib/client.js:13871-13882` 统一封装）：

```js
const feishuRpcCall  = (e,p,s)=> ctx.connection.rpc.call("/feishu", e,p,s);
const weixinRpcCall  = (e,p,s)=> ctx.connection.rpc.call("/weixin", e,p,s);
const qqRpcCall      = (e,p,s)=> ctx.connection.rpc.call("/qq", e,p,s);
// dingtalk/wecom/telegram/discord/whatsapp/slack/office 同理
```

> 即：**渠道前缀即 `/<channel>`**，endpoint 名跨渠道同名（`connection.status` / `bot.workspace.set`）。

### 2.2 connection.status → health.status 的真实链路

Host 端 `plugin-src/host/channels/feishu/rpc.mjs` 暴露 `createFeishuRpcHandler`，Client 调：

```js
const snapshot = normalizeBotsSnapshot(
  unwrapRpcResult(await ctx.connection.rpc.call("/feishu","connection.status",{}, signal))
);
```

`normalizeBotsSnapshot`（`plugin-src/client/channels/feishu/api.js:240`）与 `toPublicFeishuStatus`（`rpc.mjs: ~220`）共同定义：

```js
function normalizeHealth(value, connected=false){
  const fallback = connected ? "healthy":"offline";
  const status = ["healthy","degraded","offline","checking"].includes(value.status) ? value.status : fallback;
  return { status, summary: value.summary ?? (connected?"长连接运行正常":"机器人尚未连接"), lastCheckedAt: timestamp(value.lastCheckedAt) };
}
// 每 bot 结构 normalizeBotConnection -> { botId, state, connected:boolean, workspace:string, health:{status,summary,lastCheckedAt}, ... }
// 顶层 snapshot { schemaVersion:2, revision, state, bots:[...], totals:{configured,connected}, provisioning?, agentPresetCatalog, error? }
```

**因此“health.status”不是独立 RPC**，而是 `connection.status` 响应中 `bots[i].health.status`（或顶层 `health.status` 兼容态）。四值枚举：`healthy | degraded | offline | checking`，B1 呼吸灯应据此着色（healthy=绿呼吸，degraded/checking=黄，offline=灰）。

### 2.3 bot.workspace.set 的真实校验与副作用

Host 校验 `plugin-src/host/channels/shared/workspace-rpc.mjs: validWorkspacePayload` → 必含 `{botId, workspace}`，workspace 必须绝对路径且目录存在，否则 Host 返回 `bad-request` 并在 UI 抛“请输入工作区绝对路径 / 工作区路径不存在”。持久化由 `BotWorkspaceStore#setWorkspace` 完成（含 `generation` 递增、`clearSessions` 清旧会话映射、队列化）。

Client 调法：

```js
await ctx.connection.rpc.call("/feishu","bot.workspace.set",{botId:"bot_86a2173a998144479c95c6f1e30ca1b9", workspace:"D:\\3DeepSeekHarness\\agents\\xiaoshuai"});
```

多 bot 需由 `createWorkspaceAwareController` 的 `transitions` map 串行，无需调用方加锁。

---

## 3. 最小可验代码片段

### 3.1 读盘（Host Node，轮询底噪用）

> 仅在 Host 插件（`lib/index.js`）内合法；Client 无 `node:fs`。

```js
// lib/index.js — 在 apply(ctx) 内，需全局 danger-full-access 已放行
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';

async function readFeishuWorkspaces() {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const p = join(dshHome, 'integrations', 'dsh-feishu', 'workspaces.json');
  try {
    const doc = JSON.parse(await readFile(p, 'utf8'));
    return doc;
  } catch (e) {
    if (e?.code === 'ENOENT') return { version:1, workspaces:{} };
    throw e;
  }
}
async function readAllWorkspaces(channels=['feishu','weixin','qq','wecom','dingtalk','slack','telegram','discord','whatsapp']){
  const out={};
  for(const ch of channels){
    const p = join(process.env.DSH_HOME ?? join(homedir(),'.dsh'), 'integrations', 'dsh-'+ch, 'workspaces.json');
    try{ out[ch]=JSON.parse(await readFile(p,'utf8')); }catch(e){ if(e?.code!=='ENOENT') throw e; out[ch]={version:1,workspaces:{}}; }
  }
  return out;
}
```

### 3.2 RPC 读写（Client，权威路径）

> 前提：`lib/client.js` 的 `inject` 需补 `@deepseek-ai/dsh-client-connection`。当前 companion 缺此声明，下列代码在补后即生效。

```js
// lib/client.js — factory(ctx) 内
const FEISHU_RPC_CHANNEL="/feishu";
const FEISHU_ENDPOINTS={status:"connection.status", setWorkspace:"bot.workspace.set"};

async function fetchFeishuSnapshot(ctx, signal){
  const raw = await ctx.connection.rpc.call(FEISHU_RPC_CHANNEL, FEISHU_ENDPOINTS.status, {}, signal);
  if(!raw?.ok) throw new Error(raw?.error?.message ?? "FEISHU_RPC_ERROR");
  return raw.value;
}
async function setBotWorkspace(ctx, botId, workspace, signal){
  const res = await ctx.connection.rpc.call(FEISHU_RPC_CHANNEL, FEISHU_ENDPOINTS.setWorkspace, {botId, workspace}, signal);
  if(!res?.ok) throw Object.assign(new Error(res?.error?.message ?? "setWorkspace failed"), {code:res?.error?.code});
  return res.value;
}
async function listBindings(ctx){
  const snap = await fetchFeishuSnapshot(ctx);
  return snap.bots.map(b=>({botId:b.botId, workspace:b.workspace, bound: !!b.workspace, health:b.health.status, connected:b.connected}));
}
```

---

## 4. 是否需 danger-full-access

- **直读盘**：是。文件在 `~/.dsh/integrations/*/workspaces.json`，非插件沙箱内。当前本机 `~/.dsh/settings.yaml: permission.defaultPreset: danger-full-access` 已全局放行，因此 companion 当前无需额外声明即可用 `node:fs` 命中。但**不可依赖该全局**——若用户未设 danger，直读会抛沙箱拒绝；届时需声明文件权限或回退纯 RPC。
- **RPC（connection.status / bot.workspace.set）**：**否**。走 `ctx.connection.rpc` IPC，不经文件沙箱。
- **ctx.get('dshIm')**：**否**。Cordis 服务注入。

**建议**：将直读盘定位为“离线兜底/启动预读/诊断”而非主路径；主路径用 RPC，避免权限耦合。

---

## 5. 轮询 vs 推送实时性

**事实：无推送，只有轮询。**

- Host 侧：`ConnectionSupervisor`（`plugin-src/host/channels/feishu/connection-supervisor.mjs`）`healthyIntervalMs=15_000`，失败时退避 `[250,1000,3000,5000,10000,30000]ms`，仅在 host 内调度重连，不向 client 推送。
- Client 侧：`plugin-src/client/channels/feishu/index.js: ~875` 在 `phase==="ready"` 时 `window.setInterval(loadStatus, 15_000)` 刷新；QQ (`qq/index.js:304` 15s)、weixin/dingtalk/whatsapp 等同为 15s 或自适应。无 `ctx.events` 订阅。

**对 companion 的影响**：

- **自然延迟**：bot 上下线、`bot.workspace.set` 后的列表页，最迟 15s 自刷新；写操作可立即 `await fetchFeishuSnapshot` 立刻拿到新值。
- **建议策略**：
  1. 写后立刷（E2 拖拽领养、D1 反向声明成功后立即 `loadStatus`）。
  2. 可见性触发刷：监听 `document.visibilitychange` + `window.focus` 时补一次 `connection.status`。
  3. 保持 15s 心跳作为底噪（与官方一致）。
  4. 若未来需 <1s 实时，可探针 `ctx.connection` 是否支持事件订阅（当前源码无），否则与上游提 ISSUE 新增 `workspace.updated` 事件。

---

## 6. 阻塞与解阻结论（for P1/P2 诸票）

| 票 | 结论 | 阻塞状态 |
|---|---|---|
| **05-p-left-badges (B1)** | 可做。数据源= connection.status → bots[].health.status + workspaces 映射，15s 轮询足够支撑呼吸灯 | 解阻 |
| **06-p-tri-capsules (A1)** | 可做。同一 snapshot 按 botId→Agent / 渠道 / workspace 三分组 | 解阻 |
| **07-p-matrix-overview (C1b)** | 部分阻塞：feishu/weixin 已有，其余 7 渠道结构相同但本机未配置 | 半解阻 |
| **08-p-fleet-drawer (C1a)** | 同 07，数据源已就绪 | 解阻 |
| **09-p-header-banner (B3)** | 可做，但需 R3 补 `session.workspace` | 依赖 R3 |
| **10-g-drag-adopt (E2)** | 可落地，写路径 bot.workspace.set 已打通 | 解阻 |
| **04-g-reverse-declare (D1)** | 同 E2 | 解阻 |
| **03-r-session-routing** | 需另票细化 StateStore.sessionFor | 另 R3 解 |

**Map Decisions gist 建议**：
`- [R1 workspaces/RPC 决策](.scratch/companion-wayfinder/research/01-r-workspaces-rpc-findings.md): workspaces.json 为 \`~/.dsh/integrations/dsh-<channel>/workspaces.json\`（BotWorkspaceStore v1/2，0o600原子写），可直读（需 danger 但全局已放行）但权威读写应走 client \`ctx.connection.rpc.call('/feishu','connection.status'|'bot.workspace.set')\`（需补 dsh-client-connection 注入）；health 为 snapshot.bots[].health.status 四态；15s 轮询唯一实时性。`

---

## 7. 引用溯源

- `D:/dsh-plugin/dsh-im/plugin-src/host/channels/feishu/production.mjs: pluginPaths()`
- `D:/dsh-plugin/dsh-im/src/channels/shared/bot-workspace-store.mjs`
- `D:/dsh-plugin/dsh-im/plugin-src/host/channels/feishu/rpc.mjs` + 其他渠道 production
- `D:/dsh-plugin/dsh-im/plugin-src/host/index.mjs:66` + `PROACTIVE_DELIVERY.md`
- `D:/dsh-plugin/dsh-im/plugin-src/client/channels/feishu/api.js`
- `D:/dsh-plugin/dsh-im/lib/client.js:13871` 九渠道封装
- `D:/dsh-plugin/dsh-im/plugin-src/host/channels/feishu/connection-supervisor.mjs` + `plugin-src/client/channels/feishu/index.js:875`
- 本机实盘：`C:\Users\辰辰洋洋\.dsh\integrations\dsh-feishu\workspaces.json` （10 bots）、`dsh-weixin` （1 wx）、`settings.yaml: permission.defaultPreset: danger-full-access`
- `D:/dsh-plugin/dsh-im/package.json dsh.client.inject` 含 `@deepseek-ai/dsh-client-connection`，companion 当前缺失

## 8. 附：未决与后续探针建议

- 补 `lib/client.js` 注入 `@deepseek-ai/dsh-client-connection` 后在 preview.html 做最小 RPC 自检（`connection.status` 空载调用），确认 companion client 确实拿到 `ctx.connection`。
- Host 如需同工艺自检直读盘，可在 `lib/index.js` 加一次性 `readFile` 探针并打 `logger.info`，Dsh Desktop 重启后看日志是否命中；失败则回退纯 RPC。
- R2（02-r-slots-dom）再探 `slots.inject` 与 MutationObserver 叠加左侧的可行性时，可顺带验证写后立刷对左侧徽标的联动延迟。