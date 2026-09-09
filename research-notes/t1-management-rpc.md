# T1 · 管理 RPC 改道深查（research，#73）

> 只读研究，不写实现。方法：未 checkout 改 `dsh-im-main` 工作树（当时 HEAD `bda4be6`=v4.13.0，T0 #72 未同步），全部上游证据取自 `git show v4.17.1:<path>` / `git show <commit> -- <path>`；`v4.17.1=464c0a9`。companion 侧为本仓 `master@1d41e4c` 现状行号。

## 0. 版本锚点

- `v4.17.0..v4.17.1` 唯一实质提交即 `503a24a "fix: adapt IM management RPC to original DSH releases"`（`git log v4.17.0..v4.17.1 --oneline`：`464c0a9` 仅 release + `503a24a` 实质）。`464c0a9` 本身只碰 `CHANGELOG/package.json/package-lock/lib/*`（`git show 464c0a9 --stat`）。
- 启动路径三连变中的两环：`a56dfc0 "fix(wecom): retain management RPC when startup fails"`（2026-09-08 23:26）→ `2dd915d "fix(channels): retain management RPC throughout startup"`（2026-09-08 23:41）→ `503a24a`（2026-09-09 04:09）把同一思想搬到新传输。

## 1. 改道事实（调用形态表）

| 面 | 旧形态（v4.13.0） | 新形态（v4.17.1，`503a24a`） | 来源 |
|---|---|---|---|
| Host 注册 | `ctx.connection.rpc.handle(rpcChannel, handler, {authority})`，缺 `rpc.handle` 即抛 `TypeError('DSH Host Connection RPC is required')` | `registerManagementRpc(ctx, rpcChannel, handler, {authority})`，缺 `ctx.connection.fetch.register` 即抛 `TypeError('DSH Host Connection Fetch registry is required')` | 旧：`git show v4.13.0:plugin-src/host/channels/shared/rpc.mjs:199-203`；新：`git show v4.17.1:plugin-src/management-rpc.mjs:41-46`；迁移：`git show 503a24a -- plugin-src/host/channels/shared/rpc.mjs`（删旧 4 行、加 `import registerManagementRpc` + `return registerManagementRpc(ctx,`）、同提交 `plugin-src/host/channels/feishu/rpc.mjs`（`installFeishuRpc` 同改）、其余 9 渠道 + `delivery-rpc/inbound-ttl-rpc/update-rpc` 同模式（`503a24a --stat` 36 文件） |
| Fetch 路由 | 无（直挂 `connection.rpc` 逻辑渠道 `/feishu` 等） | `ctx.connection.fetch.register({ path: '/api/dsh-im${channel}', methods:['POST'], requestBody:'buffered', fetch })`，如 feishu 为 `/api/dsh-im/feishu` | `git show v4.17.1:plugin-src/management-rpc.mjs:3-6`（`rpcEndpoint`=`dsh-im${channel}`）`:47-50`；测试断言同值 `git show v4.17.1:test/management-rpc.test.mjs:33-35` |
| Client 调用 | `ctx.connection.rpc.call(FEISHU_RPC_CHANNEL, endpoint, payload, signal)`（各渠道 1 行，共 ~13 行） | `callManagementRpc(ctx.connection, FEISHU_RPC_CHANNEL, endpoint, payload, signal)`，即 `connection.rpc.call('/api', 'dsh-im'+channel, {method, payload}, signal)`，由 DSH 做原生编号/响应关联 | 旧：`git show v4.13.0:plugin-src/client/index.js:388-412`；新：`git show v4.17.1:plugin-src/client/index.js:1`（import）、`:406-433`（13 个 `*RpcCall`）；定义：`management-rpc.mjs:75-77`；测试封包断言 `test/management-rpc.test.mjs:36-50`（channel=`/api`、endpoint=`dsh-im/feishu`、`{method,payload}` 原样透传、`connection.status`+`null` payload 不改义） |
| Host 入口守卫 | `plugin-src/host/index.mjs` 以 `if (ctx?.connection?.rpc)` 启 update | 改为 `if (ctx?.connection?.fetch)` | `git show 503a24a -- plugin-src/host/index.mjs`（1 行） |
| 启动期保留（相关提交） | `a56dfc0` 仅 wecom：先 `rpc.handle` 占位 `startup-error` handler，初始化失败仍可通过管理接口返回错误、其余渠道继续启动 | `2dd915d` 推广到全渠道：新增 `plugin-src/host/channels/shared/startup.mjs`（`installProductionChannel` 先注册、后 `createProduction`）+ `startup-error.mjs`（`publicChannelInitializing/initializing→startup-failed/config-invalid/permission-denied`，只出公开展示文案）；v4.17.1 最终态把该文件内的 `ctx.connection.rpc.handle` 换成 `registerManagementRpc`，语义不变 | `git show a56dfc0 --stat`；`git show 2dd915d -- plugin-src/host/channels/shared/startup.mjs`（新文件 47 行，先 `rpc.handle` 占位）；`git show v4.17.1:plugin-src/host/channels/shared/startup.mjs:1,9-16`（import + `registerManagementRpc(ctx, rpcChannel, …)` 先注册后初始化） |

## 2. 鉴权与失败分支（精确到分支）

- 物理层：注释明示“DSH applies browser authentication and Host/Origin trust before this handler”（`management-rpc.mjs:52`）；兼容记录确认 `/api` 仍走 DSH 原有浏览器认证、Host/Origin 检查、缓冲体限制（`git show v4.17.1:docs/方案/dsh-im兼容原版DSH-0.1.5实施与实测记录.md` “实现”节）。
- 逻辑层 `rpcAuthority`（默认 `loopback`，`trusted-host` 可选，非法抛）：`git show v4.17.1:plugin-src/host/rpc-authority.mjs`（`resolveRpcAuthority`）。
- `registerManagementRpc` 内部分支（`management-rpc.mjs:53-69`，测试逐条覆盖 `test/management-rpc.test.mjs:61-99,121-138`）：
  - 非 loopback 请求（host 头非 `localhost/127.*/::1`，或 origin 非 loopback/`null`/非法）→ `403 forbidden`（loopback 策略；trusted-host 则放行已过 DSH 认证的请求，`:95-98`；inbound-TTL/更新始终 loopback-only，`:128-137`）。
  - 非 POST → `405`；Content-Type 非 `application/json` → `415`；体非 JSON → `400`。
  - 信封非法（非 `client-request`/rpcId 非 string/method 不匹配 `dsh-im/<ch>`/缺 `call.method`/`payload` 键）→ `200` + `reply(ok:false, code:'gateway/bad-request')`，不进业务 handler（`:61-67`）。
  - 业务返回 `ok:false` 缺 `details` → 补 `details:{}` 后 `200` 回包（`:33-38`，`:53-59` 断言；因 Connection 客户端要求该字段）。
  - handler 抛异常 → `500 'IM management handler failed'` 且不泄漏 secret（`:68-69`，`:121-126`）。
  - abort 透传给 handler；`callManagementRpc` 自身不重试，传输抛什么（测试用 `HTTP 500`）就原样 reject（`:101-119`）。
- 兼容矩阵：`0.1.2-alpha.4 / 0.1.2-alpha.5 / 0.1.2-rc.1 / 0.1.3-alpha.1 / 0.1.5-alpha.1` 五版“14 个管理入口/原生客户端错误解析/路由生命周期/HTTP 认证与输入检查”全过；14 入口 = 11×`connection.status` + `update.status` + `settings.inbound-ttl.get` + `target.list`；CLI 层另验无认证 `401`/非信任 Origin `403`/非法 JSON `400`/错媒体类型 `415`（同文档“兼容矩阵”节）。结论：旧 DSH 也有 `/api` + fetch 注册表，新实现无版本分支（同文档“所有版本共用同一实现”）。

## 3. `connection.status` 方法名与回包字段：真未变（传输改、语义留）

- 方法名：token-bot 系 `TOKEN_BOT_ENDPOINTS.status='connection.status'`（`shared/rpc.mjs:17-18`，v4.13/v4.17 同）；feishu `FEISHU_ENDPOINTS.status="connection.status"`（`git show v4.17.1:plugin-src/client/channels/feishu/api.js:19-20` vs `v4.13.0` 同文件同值，仅 v4.17.1 追加 `stepPushMode` 相关键）；handler 分发 `if (endpoint===…status) value=await controller.status()`（`shared/rpc.mjs:144`）与参数校验 `connection.status does not accept fields`（`:57-58`）两版一致。
- 回包字段（companion 关心的 `connected/health.status/health.summary/health.lastCheckedAt/botId/workspace/bot`）未变，新增只加键：
  - feishu `publicBotEntry`（`git show v4.17.1:plugin-src/host/channels/feishu/rpc.mjs:285-312`）：`botId/state/connected/configured/…/bot/health` + 条件 `workspace`；`publicHealth`（`:229-235`）：connected→`healthy/长连接运行正常`，否则 `offline/机器人尚未连接|尚未接入`，均带 `lastCheckedAt: Date.now()`；`toPublicFeishuStatus`（`:317+`）组装 `bots/state/totals`。v4.13 同文件 `normalizeBotConnection/normalizeHealth` 同字段（`git show v4.13.0:plugin-src/client/channels/feishu/api.js` 全文 diff 仅多出 `stepPushMode` 两处，其余 `normalizeBotConnection` 字段一致）。
  - token-bot 通道 `sanitizePublic` 只删 `token/botToken/tokenRef/platformId/secret/secretRef`（`shared/rpc.mjs:24-26,83-91`），业务 `ok:true,value` 包裹不变（`:144 + return {ok:true,value:sanitizePublic(value)}`）。

## 4. 旧直调在新传输下的确切失败模式（companion 视角）

- 前提：host 侧不再 `rpc.handle('/feishu'…)`（见 §1），companion 旧式 `rpc('/'+ch,'connection.status',{},5s)`（`src/client/data/fleet-api.ts:157,170`，`RPC_TIMEOUT_MS=5000` 见 `:58`）发往的逻辑渠道已无路由。DSH 原生对此类“无 handler 渠道”的行为本仓无源码断言，保守锁定为二选一（都属传输层 reject，需真机定死其一）：(a) 立即型 `unknown-channel/method` 风格 reject；(b) 无应答直到 `AbortSignal.timeout(5000)` 触发 abort。两种都走同一下游（已用 `503a24a` 的 `callManagementRpc` 不重试、`test:101-119` 佐证传输错误直接 reject 佐证“失败只抛不掩”）。
- 下游链（行号均为本仓现状）：
  - `fetchChannelStatus`（`fleet-api.ts:156-163`）无 try：reject 直接抛给调用方（接入流程轮询）；`fetchBots`（`:167-188`）经 `Promise.allSettled`（`:168`）把 reject 记入 `failed: string[]`（`:185`），该渠道贡献 `bots=[]`。
  - 即使传输回了包：信封解包 `unwrap`（`:139-143`）只认 `ok===true && value!==undefined`，否则原样返回；字段提取 `extractBots`（`:145-153`）只认 `bots/snapshot.bots/data.bots` 三形 + 裸数组，其余回 `[]`；`fetchBots` 另把 `ok:false` 当权威空直接 `bots:[]` 且不进 failed（`:172-173`）。
  - 聚合 `healthOf`（`config.ts:38-43`）：`healthy/online/connected/ok→online`；`degraded/checking/unknown→warn`；其余看 `connected`（真→online，否→offline）。注意 `connected` 缺席即假：空对象→`offline`。
  - 保留逻辑 `mergeStaleBots`（`fleet-api.ts:229-236`）+ 唯一轮询 `connection-stream.ts:55-64`：`failed` 非空时保留上一轮该渠道快照并标 `stale:true/healthKind:'warn'`（时间冻结、按未知展示）；`failed` 为空才整体替换。
- 症状推论：单渠道直调失败→该渠道徽标变“待确认（stale）”而非离线；九渠道全失败→`fresh=[]` + 全部旧快照 `warn`，即“全灭”显示为满屏“待确认”——`stale→warn` 在此场景下确实会把“全灭”伪装成“待确认”（设计本意是不谎报离线，见 `connection-stream.ts:1-3` 与 `fleet-api.ts:190-191` B1 注释）。

## 5. companion 适配点与双传输兼容草案（不写实现）

- 适配点三处（本仓现状行号）：
  1. `src/client/data/rpc.ts:5-11`（`extractRpc`）：当前只取 `ctx.connection.rpc.call` 做 `(channel,endpoint,payload,signal)` 直透，是未来双传输分支的唯一注入点（调用方 `fetchBots/fetchChannelStatus/fetchRouteRows` 签名不动）。
  2. `src/client/data/fleet-api.ts:157,170`：把 `rpc('/'+ch,'connection.status',…)` 换成“新载体优先、旧直调兜底”的同一 `RpcCall`（`unwrap:139-143`/`extractBots:145-153`/`ok:false→[]:172-173` 语义可原样保留）。
  3. `src/client/data/config.ts:38-43`（`healthOf`）：字段语义未变，无需改映射；若要区分“未知（stale）”与“真离线”，应在徽标层读 `stale`/`lastCheckedAt` 而非动 `healthOf`。
- 新调用形态（companion 侧目标）：`connection.rpc.call('/api', 'dsh-im'+channel, { method, payload }, signal)`，其中 `channel='/feishu'` → endpoint=`'dsh-im/feishu'`（`management-rpc.mjs:3-6,75-77`）；回包仍是 `{ok, value|error}` 信封，`unwrap` 逻辑兼容。
- 双传输草案（待 T3 verdict/T5 定死其一）：
  - A（推荐）：新载体优先 + 按“传输缺失”信号回退旧直调。每渠道首次（或每轮失败时）先调新载体；仅当错误可判定为“旧 DSH/旧 dsh-im 无该载体”（如未知渠道/方法类 reject、`gateway/bad-request` 以外的传输层 404/拒识）才回退一次旧直调；业务 `ok:false`（如未配置）绝不回退。附带一次会话级记忆（首个成功者锁定后续轮询方向，避免每 15s 双打）。
  - B：特性探测定方向。流启动时用 `connection.status` 空载荷探一次 `/api` 载体，成功则全会话走新，否则走旧；15s 轮询（`connection-stream.ts:6`）方向不变。代价是旧环境每次多一次失败探测。
  - 无论哪案：`RpcCall` 类型签名不变；`mergeStaleBots` 的 stale 语义保留；全灭 `warn` 的展示问题若需修，应在徽标层加“`failed.length===CHANNEL_ORDER.length` 时如实提示传输中断”而非改 `stale→warn` 本身（动后者会破坏 B1 不谎报离线契约）。

## 6. `settings.section` 未改名复核（排除 slot 消失分支）

- `v4.13.0:plugin-src/client/index.js:419-420`（`ctx.slots.inject('settings.section', … name:'settings.section'`）→ `v4.17.1:plugin-src/client/index.js:440-441` 同名注入（行号右移 21 行系 `callManagementRpc` import + `createLoopbackAwareRpcCalls` 包裹所致，语义同）。
- 构建产物同：`v4.13.0:lib/client.js:16051-16052` → `v4.17.1:lib/client.js:17549-17550` 同名字符串。slot 消失分支排除。

## 7. 证据外未断言事项（交 T3/T5）

- 旧直调无路由时的 DSH 原生错误字面（§4 的 (a)/(b) 二选一）需 web 真机一次实测钉死（诊断只读磁盘落盘 JSON，不开控制台）。
- `connection.test/disconnect` 等遗留端点与 `office/update/delivery/global-settings` 渠道的新载体名（`dsh-im/dsh-im-delivery` 等）本票已见常量（`host/update-rpc.mjs:5`、`host/delivery-rpc.mjs:4`），徽标链路用不到，未深查。
- 本笔记分支：`research/t1-mgmt-rpc`（基于 `master@1d41e4c`，仅加本文件）。
