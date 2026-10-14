# T9 遗留缺口取证：客户端 traceId 贯通自有桥（只读取证，不改代码）

> 取证日期：2026-10-15 · 取证者：dsh-im-companion T9 后续调研（只读）
> 背景事实（已成立）：T9（#123，已关闭）把 `dsh-log@0.3.1` 接进全插件——客户端事件经 `dsh-log/client` 只入队、走自有桥 `/api/im-companion` 转给宿主落盘（宿主是唯一落盘者），两端行进同一个文件 `C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\YYYY-MM-DD.log`。
> 本文件只做取证与方案（含证据）；不改任何代码、不改 issue、不动 INDEX。

---

## 结论（先给裁决）

1. **缺口确认成立，且形状已钉死**：客户端行**恒定**带 `traceId`/`spanId`/`seq`（包的客户端写路径自动建链），宿主行**恒定不带**——因为 `dsh-log` 的宿主侧写路径（`createLogStore`）**根本没有追踪上下文概念**，`store.log(level, event, fields)` 把 `fields` 原样入队。实证：`2026-10-15.log` 里 77 行中，宿主行（`host.start` / `home.create` / `host.rpc.fail` / `host.update.tap`）**一行都没有** `traceId`。
2. **`traceId` 只活在客户端进程内**：客户端取当前链的 API 是 `log.why().traceId`（`ClientLog.why()`）；`log.child(ctx)` 可显式继承/开子链。业务 RPC 与 dsh-log **两条路完全独立**——`src/client/log.ts` 走桥发 `logBatch` 电话，业务调用走 `RpcCall`，**没有任何代码把 traceId 塞进业务请求**（全仓 `src/**` grep `traceId` 零命中）。
3. **加字段这件事不属于 DSH/A1 的契约变更**：DSH 传输层只校验**外层信封** `{type:'client-request', rpcId, method, payload}`（`rpcId` 由 DSH 自己生成），内层 `payload` 是**不经检查的 JSON 载荷**（`JSON.stringify(message)`，返回侧同样只校验 `type`/`rpcId`/`result.ok|error`）。A1（`@xmanrui/dsh-im`）的校验同样只认 `call.method` 与 `call.payload` 的存在性——**多键被忽略**。⇒ 「加一个可选键」是**本仓内的 Added-only 改动**，不是契约变更。
4. **推荐最小方案 = (a) 客户端在自有桥的 RPC `payload` 里带可选 `traceId`，宿主读到后并入日志行 `fields`**。改动面：客户端 1 个注入点（`src/client/data/rpc.ts:104` 的 `extractRpcV2` 闭包）+ 1 个取值导出（`src/client/log.ts`），宿主 1 处透传（`src/host/rpc.ts` 的 `dispatch` + `withRpcLog`）；**只在两个仓内文件里加，不新增端点、不改回包形状、不动 A1、不动 DSH**。诚实性红线（不新增契约条款）**不触碰**——但按军规 §9「契约先行」，仍**建议在 `docs/features-contract.md` 追加一行**把「桥 payload 允许携带 `traceId`（Added-only、宿主必须忽略未知键）」写成文字（见 §4）。
5. **必须显式知道的反向不对称**：客户端 `dsh-log` 对 `traceId/spanId/seq` 是**保留字**（误传会被搬进 `fields._shadow` 并另落一行 `log.trace.shadow` warn）；**宿主侧写路径不做这个搬迁**（`dist/engine/pipeline.js` 里没有 `relocateReservedFields`），所以宿主可以把 `traceId` **原样**写进行里，查询侧 `fields.traceId` 可被 `logQuery({traceId})` 命中（`dist/host/query.js:194-200`）。这是方案 (a) 能成立的**关键前提**，也是不要走「让客户端明文传 `traceId` 到 `logLine` fields」的原因。
6. **既有线索 `logCtx` 与 traceId 无关**：它是更新包 `dsh-plugin-update` 的事件口 `{ fire(level, event, fields) }`，本仓在 `src/index.ts:92-98` 接成 `host.update.tap` 一行（实证落盘行 `2026-10-15.log:28`）。`docs/research/更新系统-0.2.0升级与发布侧自动跟随.md:67` 列的「logCtx 落点」待办指的是**「宿主侧日志实际落点未在真机核过」**，不是「traceId 贯通两端」。**线索排除**。

---

## 现状：信封与 traceId 的确切形状

### 1) 请求链（客户端 → 宿主）

| 层 | 形状 | 生成位置（证据） |
|---|---|---|
| 客户端 API | `rpc.call(channel, endpoint, payload, signal) → Promise<unknown>`；`channel` 已被 `assertTarget` 钉成 `/^\/[A-Za-z0-9._~-]+$/` | 类型 `D:\dsh-plugin\dsh-im-companion\src\client\data\fleet-api.ts:11-16`「`export type RpcCall = (channel: string, endpoint: string, payload: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>`」；句柄取出 `src\client\data\rpc.ts:99-104`「`return (channel, endpoint, payload, signal) => dualTransportCallV2(raw, channel, endpoint, payload, signal)`」 |
| 双传输翻译（本仓） | 自有桥 `'/im-companion'` → `call('/api', 'im-companion', { method: endpoint, payload }, s)` | `src\client\data\rpc.ts:40-42`「`return channel === '/im-companion' ? 'im-companion' : 'dsh-im' + channel`」；`src\client\data\rpc.ts:64-65`「`const fresh = (s: AbortSignal): Promise<unknown> => call('/api', newCarrierEndpoint(channel), { method: endpoint, payload }, s)`」 |
| DSH 传输（**信封真正生成处**） | `{ type: "client-request", rpcId, method: endpoint, payload }`；`rpcId = RpcId(randomUuid())` | DSH 单文件 bundle `D:\DeepseekHarness\resources\app.asar` 第 370635-370649 行「`async call(channel, endpoint, payload, signal) { assertTarget(channel, endpoint); const rpcId = RpcId(randomUuid()); const message = { type: "client-request", rpcId, method: endpoint, payload }; const response = await send(\`${channel}/${endpoint}\`.slice(1), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(message), ...signal === void 0 ? {} : { signal } });`」 |
| 回包校验（DSH 侧，只认外层+`ok`） | `parseConnectionResponse`：`type === "server-response"`、`rpcId`、`result.ok===true → {value}` / `ok===false → error{code,message,details}` | 同文件 370711-370736 行；`result` 校验 `api[channel]` 无其余约束 |
| 宿主路由（本仓注册） | `ctx.connection.fetch.register({ path: '/api/im-companion', methods: ['POST'], requestBody: 'buffered' })` | `src\index.ts:20-21`「`const ENDPOINT = 'im-companion'; const ROUTE_PATH = '/api/' + ENDPOINT`」；`src\index.ts:40-43`；宿主精确路由分发见同 bundle 371533-371547 行「`const route = this.fetchRoutes.get(pathname); if (route?.methods.has(request.method) === true) return route.fetch(request);`」 |
| 宿主入参形状（本仓） | `message.{type,rpcId,method,payload}`，`payload` 即内层 `call = { method, payload }` | `src\index.ts:50-57`「`const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'; const call = message?.payload; if (message?.type !== 'client-request' \|\| typeof message.rpcId !== 'string' \|\| message.method !== ENDPOINT \|\| !call \|\| typeof call.method !== 'string' \|\| !Object.hasOwn(call, 'payload')) { … }`」→「`return reply(rpcId, await handler(call.method, call.payload, request.signal))`」 |
| 宿主分发器 | `(endpoint, payload, signal) => Promise<RpcResult>` | `src\host\rpc.ts:62-63`「`export function createAgentFleetHandler(store: AgentMetaStore, opts: AgentFleetHandlerOptions = {}): (endpoint: string, payload: RpcPayload \| null \| undefined, signal?: AbortSignal \| null) => Promise<RpcResult>`」；`src\host\rpc.ts:296`「`return withRpcLog(dispatch, opts.log)`」 |
| 日志电话（客户端→宿主的落盘路，**独立于业务**） | 客户端把电话名当 `endpoint` 发：`rpc('/im-companion', name, (args ?? {}) as Record<string, unknown>, signal)`；宿主在业务开关**之前**命中：`if (opts.logPhones?.has(endpoint)) return ok(await opts.logPhones.get(endpoint)!(p as never))` | `src\client\log.ts:29-34`；`src\host\rpc.ts:66-67` |

### 2) 回包/错误形状（本仓，单一来源）

```ts
// src\host\rpc.ts:16-18
export type RpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }
// src\host\rpc.ts:38-39
const ok = (value: unknown): RpcResult => ({ ok: true, value })
const fail = (code: string, message: string): RpcResult => ({ ok: false, error: { code, message, details: {} } })
// src\index.ts:37-38
const reply = (rpcId: string, result: unknown): Response =>
  Response.json({ type: 'server-response', rpcId, result })
```
客户端解包：`src\client\components\home-ops.ts:20-31`「`type BridgeOk<T> = { ok?: boolean; value?: T; error?: { code?: string; message?: string } } | null`」+ `raw.ok !== true || raw.value === undefined` 即抛；`src\client\data\fleet-api.ts:146-150`「`function unwrap(raw: unknown): unknown { const r = raw as { ok?: boolean; value?: unknown } | null; if (r && r.ok === true && r.value !== undefined) return r.value; return raw }`」。
⇒ **无任何位置出现 id/追踪字段**（`rpcId` 只在宿主入口当回带用，见 `src\index.ts:50`、`tools\verify\host-entry.ts:161`「`assert.equal(body.rpcId, 'x1', 'rpcId 必须原样回带')`」）。

### 3) traceId 从哪来（`dsh-log@0.3.1` 出库产物）

| 事实 | 证据（`D:\dsh-plugin\dsh-im-companion\node_modules\dsh-log\**`） |
|---|---|
| 版本/入口 | `package.json`「`"name": "dsh-log", "version": "0.3.1"`」，exports `.` / `./host` / `./client` / `./node` |
| `traceId` 只在 `fields` 里，落盘行恒五键 | `README.md:326`「落盘恒为**五键**（`v`/`ts`/`level`/`event`/`fields`）；`traceId`（16 位十六进制）、`spanId`（8 位）、`seq` 都住在 `fields` 里，不额外加顶层键。」 |
| 自动建链（客户端，`error`/`warn`/`info`/`debug` 一律建） | `dist\client\trace.js:19-27`「`if (traceState.traceId) return traceState.traceId; traceState.traceId = genHex(16); ensureSpanId(); return traceState.traceId;`」；`README.md:498`「**自动建链**：没传 `traceId` 时 SDK 自己建（16 位十六进制）。`error`/`warn`/`info`/`debug` **一律建链**」 |
| 客户端写行时把三件套写进 `fields` | `dist\client\write.js:115-127`「`out.traceId = traceState.traceId; out.spanId = traceState.spanId; … out.seq = traceState.seq; traceState.seq += 1;`」 |
| **显式继承 = `child(ctx)`**（不用 `async_hooks`；漏传就是新链） | 签名 `dist\client\types.d.ts:83-87`「`export interface ClientLogFn { (level, event, fields?): LogOutcome; child: (ctx?: ChildCtx) => ClientLog; why: () => TraceWhy }`」；实现 `dist\client.js:221-245`（`c.traceId` 为串 → `tsrc='explicit'`；否则继承父 `traceId`，`spanId` 刷新、子实例 `seq` 从 0）；`README.md:499`「**显式继承**：`log.child(ctx)` 继承父链的 `traceId`、刷新 `spanId`、子实例 `seq` 从 0 重起。不用 `async_hooks`（DSH 双端都跑不动它）——**漏传 `child` 就是新链**，不做隐式合并。」 |
| **取当前 traceId = `why()`** | `dist\client.js:247-262`「`return { traceId: traceState.traceId, spanId: traceState.spanId, seq: traceState.seq, sources: {…}, shadowWarns: …, detail }`」；顶层同样有 `ClientLog.why()`（`client.d.ts:12` 导出 `TraceWhy`/`TraceState`/`ChildCtx`） |
| 保留字冲突（**客户端**）：永不整行拒收，搬进 `fields._shadow` + 另落 `log.trace.shadow` | `dist\core\trace.d.ts:1`「`export declare const RESERVED_TRACE_FIELDS: readonly ["traceId", "spanId", "seq"]`」；`dist\client\write.js:83-101`「`const relocated = relocateReservedFields(userFields); … logQueue.push({ … level: 'warn', event: 'log.trace.shadow', fields: { event, shadowed: Object.keys(shadow) } … })`」；`README.md:352-359`、`README.md:501` |
| **宿主侧无追踪**：`store.log` 把 fields 原样入队，不建链、不搬迁 | `dist\store.js:94`「`const { log, isEnabled, flush, handleLogBatch, … } = pipeline;`」（直接复用 pipeline）；`dist\engine\pipeline.js:261/328-334`「`queue.push({ ts: Date.now(), level, event: String(event \|\| ''), fields: fields && typeof fields === 'object' ? fields : {}, isDiagnostic: … })`」——**全文无 `relocateReservedFields`（只有客户端 write.js 有）** |
| 查询/追链按 `fields.traceId` 命中，跨两端同源 | `dist\host\query.js:194-200`「`if (traceId) { const fTid = typeof fl.traceId === 'string' ? fl.traceId : (typeof row.traceId === 'string' ? row.traceId : null); if (fTid !== traceId) continue; }`」；`dist\host\query.js:231-234`（traceChain 排序 `(seq, ts)`，`seq` 缺省 0，见 `:213-227`）；`README.md:83`「`traceId` 查询走 `traceChain` 通道：整链一次给全，不受 `limit` 截断」 |
| 宿主 logger 怎么建（本仓） | `src\host\log.ts:41-50`「`const hostLog: HostLog = createHostLog({ fs: createNodeFileService(), timer: createNodeTimer(), getCacheDir: () => cacheDir, DEFAULT_CWD: process.cwd() }, { pluginId: LOG_PLUGIN_ID, prefix: LOG_PLUGIN_ID, logDirName: LOG_PLUGIN_ID, switchFileName: 'log-switch-' + LOG_PLUGIN_ID + '.json', eventList: LOG_EVENT_LIST })`」；句柄方法 `log(level, event, fields)`（`src\host\log.ts:59-61`，try/catch 吞错） |
| 宿主逐调用日志点（要并 traceId 的两个事件） | `src\host\log.ts:84-87`「`if (detail) handle.log(detail.level, detail.event, detail.fields); const code = result.ok ? '' : String(result.error?.code ?? ''); handle.log(result.ok ? 'debug' : 'error', result.ok ? 'host.rpc.call' : 'host.rpc.fail', { method: endpoint, ok: result.ok, latencyMs: Date.now() - started, code })`」 |
| 宿主事件清单（字段白名单，改埋点必同步） | `src\log-events.ts:30`「`'host.rpc.call': { level: 'debug', kind: 'ondemand', fields: ['method', 'ok', 'latencyMs', 'code'] }`」；`src\log-events.ts:31`「`'host.rpc.fail': { level: 'error', kind: 'resident', fields: ['method', 'code', 'message'] }`」 |
| 客户端出口（要加「取当前 traceId」的地方） | `src\client\log.ts:47-53`（`logLine`）、`:56-58`（`logOn`）、`:12`「`import { createClientLog, type ClientLog } from 'dsh-log/client'`」、`:18`「`let log: ClientLog \| null = null`」 |
| 客户端唯一出口点 | `src\client\index.ts:22`「`const rpc = extractRpcV2(ctx)`」；`src\client\components\panel.ts:6`「`import { extractRpcV2 as extractRpc } from '../data/rpc'`」+ `:48`「`const rpc: RpcCall \| null = extractRpc(ctx)`」——**两处都走 `extractRpcV2`，注入点因此唯一** |
| 全仓现状：traceId 零贯通 | `src/**` grep `traceId|why\(\)|\.child\(|withTrace` → **无匹配**；`tools/verify/**` grep `traceId` → **无匹配** |

---

## 契约约束原文

| # | 条款（原文） | 出处 |
|---|---|---|
| C1 | 「`host/rpc.ts` \| 只追加 case；端点命名 `im-companion.<feature>.<action>`」 | `docs\features-contract.md:47` |
| C2 | 「theme.ts / dom.ts / icons.ts / config.ts / fleet-api.ts / meta.ts \| **只加导出**（新增函数/CSS 类/图标），禁止改既有签名与行为」 | `docs\features-contract.md:44` |
| C3 | 「自有桥**只**经 `connection.fetch.register` 挂到 DSH 公开 `/api` 载体（路径 `/api/im-companion`）；**禁止** `connection.rpc.handle`」 | `docs\features-contract.md:49` |
| C4 | 「**写路径**：一律 dsh-im 渠道 RPC 或 host 桥端点；写后立刷（触发 stream.refresh()）。」 | `docs\features-contract.md:60` |
| C5 | 「**Added-only 定性**：「`AgentMetaDoc` 追加 `update` 字段 + `host/rpc.ts` 追加一个 `meta.update.set` case」落在 §3 明列的**共享层 Added-only 许可**内（只加导出 / 只追加 case），**不属于契约变更**」 | `docs\features-contract.md:62` |
| C6 | 「契约变更先行：改共享协议前先更新本契约并在地图 Decisions 记录，再改码。」 | `docs\features-contract.md:97` |
| C7 | 「**不设任何代码检查/自动扫描解耦问题**…常驻自动检查仅限：构建、类型检查、功能断言、300 行红线」 | `docs\features-contract.md:101,103` |
| C8 | 「装配点夹具的必要追加（added-only · T7 #90）…属"夹具追加"而非"改他人分区"：既有断言一字未改。」 | `docs\features-contract.md:89`（同旨 `:90` #99 那条） |
| C9 | 「**D4 · 信封**：沿用 DSH 双向信封（`client-request` → `server-response`），内层 `{ method, payload }` 沿用 `im-companion.<feature>.<action>` 命名（契约 §3 不变）」；「端点命名与信封语义不变」 | `docs\adr\0002-host-bridge-carrier.md:35`、`:5` |
| C10 | 「**D7 · 旧语义退役**：`/im-companion/<endpoint>` 前缀路由语义**不保留兼容**」 | `docs\adr\0002-host-bridge-carrier.md:41` |
| C11 | 「**证伪条件**…宿主提供官方「插件自有 RPC 通道」API…宿主改变 `/api` 派发语义（例如对 exact 路由不再按 `methods` 过滤）…上游 `@xmanrui/dsh-im` 改回前缀注册或改换载体」 | `docs\adr\0002-host-bridge-carrier.md:54-56` |
| C12 | 「**已知债务（记录事实，不写成「豁免」）**：该通道**不在**「rpc / subscribe / meta / slots」四种契约通道白名单内（AGENTS.md 解耦九律 §1③）」；「它**不在**契约 §3/军规③ 的 rpc/subscribe/meta/slots 白名单里 → 这是**契约文本与代码事实的长期漂移，非 T6 首创**」 | `docs\features-contract.md:63`；`docs\research\审查-R7-T6-A1触碰合规.md:33` |
| C13 | 桥诚实性约束（与形状相关）：桥失败**绝不**被渲染成「已是最新」；「成功信封缺 `value`」→ `unavailable`；失败信封 `{ok:false,error}` 按 token 分档 | `docs\research\验证-V3-T8桥诚实性与档位白名单.md:15-26,74` |

**推断（非原文）**：C12 的「白名单漂移」不影响本方案——本方案不新增通道（仍是 `rpc`），只是在 `rpc` 的载荷里多一个可选键；C3/C9 说的是**载体与信封外层**，本方案**不动外层**（外层 `{type,rpcId,method,payload}` 一个字节不改），因此**不构成 C6 意义上的「共享协议变更」**。但按 C6 的精神与军规「契约先行」，仍建议落一行文字（见 §5 第 0 步）——**这是一条记录，不是一次变更审批**。

---

## 候选方案对比

| # | 方案 | 改动面 | 契约影响 | Added-only？ | 风险 | 可否独立回退 |
|---|---|---|---|---|---|---|
| **a** | 自有桥 RPC 的**内层** `payload` 加可选 `traceId`；宿主读到后并入 `host.rpc.*` 的 `fields`（**推荐**） | 客户端 2 文件（`src/client/log.ts` 加 `currentTraceId()`；`src/client/data/rpc.ts:104` 的 `extractRpcV2` 闭包注入）+ 宿主 2 文件（`src/index.ts:57` 透传、`src/host/rpc.ts`/`src/host/log.ts` 并入 fields）+ 清单 `src/log-events.ts` + 断言 | 无（外层信封不动、回包不动、无新端点）；仅"内层载荷多一个可选键" | **是**（只加导出 + 只加字段 + 只追加 case/行） | ① 业务 `payload` 多一把键，宿主端点必须**忽略未知键**（今天全部 `<Type>(p.x ?? '')` 读取法天然忽略，见 `src\host\rpc.ts:75-290`）；② 客户端若把 `traceId` 打进 `logLine` 的 fields 会被搬 `_shadow`（**别这么做**）；③ traceId 是**页面会话级**、非动作级（要动作级需 `child()`，见 §6） | ✅ 删注入处 + 删 fields 键即复原；老宿主对多余键零感知 |
| **b** | 把 traceId 塞进现有 payload 的**保留键**（如 `payload.__trace` / `payload.meta.traceId`） | 同 a 的注入面 | 无；但占的是业务命名空间 | 是 | 与端点入参校验互相干扰的风险更高（未来某个端点若改成严格模式即误判）；遮蔽效应比 a 大；**客户端日志侧若同名还会撞保留字** | ✅ |
| **c** | 维持现状的弱关联（按时间 + method 对齐） | 0 | 无 | — | 精度不足且**已被实证打脸**：见下节三条错序/倒挂（同一动作里客户端行 ts **晚**于宿主行 8ms；`update.action attach` 与 `host.rpc.fail imc.updateStatus` 同毫秒） | — |
| **d** | 让 A1 侧支持（改 `@xmanrui/dsh-im` / 改 DSH 传输层加 correlation） | 本仓 0；第三方包/宿主 | **是**，跨仓契约变更 | 否 | A1 不在本仓（`C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\@xmanrui\dsh-im`），改不动也发不了版；且会影响 A1 全部渠道与上游验收 | ❌（等上游） |

**每条方案需先改哪个契约文档 / verify 该加什么断言**

- **(a)** 先改：`docs/features-contract.md` §3 表内 `host/rpc.ts` 行或 §4「写路径」行**追加一句**（源头/载荷键名/宿主忽略未知键/Added-only 定性）+ §9 记一条「契约先行」引用；再改码。verify 见 §5。
- **(b)** 先改：同 (a)，但需额外写清「保留键命名空间与端点入参的边界」，verify 要加**逐端点未知键忽略**断言（面更大、收益与 (a) 相同）。**不推荐**。
- **(c)** 不改文档；verify 无需加。保持现状即接受「只能按时间对齐」。
- **(d)** 先改：ADR-0002 的**证伪条件**（`docs\adr\0002-host-bridge-carrier.md:54-56`「宿主提供官方「插件自有 RPC 通道」API」）与 A1 上游契约——**超出本仓范围**。

---

## 推荐方案与落地顺序（含 verify 断言）

### 为什么是 (a)：三层证据链

1. **载荷是不经检查的 JSON**：客户端 `payload` → `call()` 里只是 `body: JSON.stringify(message)`（asar 370638-370648）；宿主侧精确路由把原始 `request` 直接交给本仓 handler（asar 371533-371547），没有中间层校验内层键。
2. **A1 同形**：`@xmanrui/dsh-im` 的注册器只校验 `message.method !== endpoint || !isRecord(call) || typeof call.method !== 'string' || !Object.hasOwn(call, 'payload')`（`…\@xmanrui\dsh-im\plugin-src\management-rpc.mjs:63-66`），本仓 `src\index.ts:52-55` 是它的同构复刻。⇒ 内层 `call` 上多一把键，**两边都只会忽略**。
3. **宿主能原样把 `traceId` 写进行里**：`dist\engine\pipeline.js:328-334` 不搬迁保留字，`dist\host\query.js:194-200` 按 `fields.traceId` 命中。⇒ 追链能跨两端。

**为什么注入点选 `extractRpcV2` 闭包（`src\client\data\rpc.ts:99-104`）而不是 `dualTransportCallV2` 内部**：前者覆盖**所有**经 `RpcCall` 的调用（含非白名单渠道与旧前缀回退），后者只覆盖新载体白名单。

### 落地顺序（都还没做，本文件只是方案）

0. **契约先行（文字，不改行为）**：`docs/features-contract.md` §3/§4 追加一行「桥内层 `payload` 允许携带可选 `traceId`（客户端会话链 id，Added-only；宿主**必须忽略**未知键，禁止把它当业务入参）」+ §9 记一次契约先行引用；OK 后再动码。
1. **客户端取值**：`src/client/log.ts` 追加导出 `currentTraceId(): string | null`（内部 `log?.why().traceId`，try/catch 吞错、**不改既有函数签名**）。
2. **客户端注入**：`src/client/data/rpc.ts:99-104` 的 `extractRpcV2` 返回闭包里，对自有桥（`channel === '/im-companion'`）与可选地对全部渠道，`payload = tid ? { ...payload, traceId: tid } : payload`。**只加键、不改既有键**。
   - ⚠️ 注意循环依赖：`src/client/log.ts:13` 目前是 `import type { RpcCall } from './data/fleet-api'`（类型导入，运行时为零），故 `rpc.ts` 引 `../log` 的值不构成循环。实现时按此保持。
3. **宿主透传**：`src/index.ts:57` 附近把 `call.payload?.traceId`（字符串且非空才取）作为**独立参数**交给 `handler`；`src/host/rpc.ts` 的 `dispatch` 签名追加该可选参数（`src\host\rpc.ts:62-63`）并传给 `withRpcLog`（`src\host\rpc.ts:296`）。
4. **宿主并字段**：`src/host/log.ts:84-87` 把 `traceId` 并入 `host.rpc.call` / `host.rpc.fail` 的 `fields`（`host.rpc.fail` 是 `resident` ⇒ 开关关着也落盘，**贯通在默认档位下就可见**）。
5. **清单同步**：`src/log-events.ts:30-31` 两条事件的 `fields` 追加 `'traceId'`（**必做**，否则 `tools/verify/log-pipeline.ts` 的「调用点与清单双向不漂移」当场红）。
6. **（可选，动作级）**：需要「一次动作一条链」时，把动作入口的 `logLine` 换成 `child({ traceId })` 实例（`dist\client.js:221-245` 的 `explicit` 语义），否则 traceId 是**页面会话级**。

### verify 该加什么断言（可执行级）

| # | 断言 | 落点建议（契约 §8「夹具追加/新增注册点」，不改他人分区） |
|---|---|---|
| V1 | 客户端：`extractRpcV2` 产出的调用，第 3 参含 `traceId` 且与 `dsh-log` 当前链一致 | 客户端断言侧新增分区 |
| V2 | 宿主：`client-request` 内层 `payload.traceId` 存在时，`host.rpc.fail` 行的 `fields.traceId` 等于它（**用 `toggle` 关着开关测**，证 `resident` 恒放行） | 追加进 `tools\verify\log-pipeline.ts` 的临时 dshHome 真落盘断言（既有范式 `tools\verify\log-pipeline.ts:179,189`） |
| V3 | 宿主：内层 `call` 上多一把**未知兄弟键**时，`ping` 仍回 `{ok:true}`（**证明 A1 同形的校验会忽略它**） | 追加进 `tools\verify\host-entry.ts:145-164` 的信封用例（现用例已发 `payload: { method: 'ping', payload: {} }`） |
| V4 | 宿主：`payload.traceId` **必须不被任何端点当业务入参**（如 `home.create` 不因多键改写 `name`） | `tools\verify\features\` 家/助理分区新增注册点 |
| V5 | 读侧：`logQuery({ traceId })` 同时取回客户端行与宿主行（`traceChain: true`） | `tools\verify\log-pipeline.ts` 真落盘后读回 |
| V6 | 清单：`host.rpc.call` / `host.rpc.fail` 的 `fields` 声明含 `traceId`，且调用点实际写入的键 ∈ 声明 | 既有双向漂移断言自动覆盖（`src\log-events.ts:10` 注：「校验：tools/verify/log-pipeline.ts 用包的 lintEventFields 逐条核对」） |

**独立回退**：删掉第 1-4 步的注入/透传即复原（第 5 步清单若留着只是多声明白名单键，不写就不落）；老宿主收到多余键今天已证明无害（V3）。

---

## 现状实证：为什么需要贯通

只读 `C:\Users\辰辰洋洋\.dsh\logs\dsh-im-companion\2026-10-15.log`（77 行，全 UTF-8 JSON 行）。

**观测 1 · 同一动作里客户端行反而「晚」于它触发的宿主行（因果倒挂 8ms）**

| 时间（ts，ms） | 行 | 事件 | 追踪字段 |
|---|---|---|---|
| 1791997697126 | `:37` | `home.create`（**宿主**）`{"homeId":"78013887-…","workspaceId":"308cc55f-…","name":"_local-builds","ok":true,"message":""}` | **无 traceId/spanId/seq** |
| 1791997698118 | `:38` | `dir.adopt`（客户端）`{"dir":"D:\\dsh-plugin\\_local-builds","…","created":true,"ok":true}` | `traceId":"8d37ef4b01442ba8","spanId":"fb1c352a","seq":9` |
| 1791997698118 | `:39` | `home.action`（客户端）`{"action":"create","homeId":"78013887-…","ok":true}` | 同上 `seq:10` |

⇒ 客户端两条行都在宿主行**之后 992ms** 落，但它们的 `seq` 是 9/10；**只有 `dir.adopt` 是「用户点了采纳」的真实起点**（`dir.pick` 在 `:35`/`:36`，ts 1791997690683）。今天要判定「这条 `home.create` 是谁触发的」，只能靠「紧邻的 `dir.adopt` + 8ms 间隔」这种**时序猜法**——而时间戳本身还因客户端批量冲刷而偏晚（`src\client\log.ts:50-51` 注：「resident 行立刻冲刷：客户端批量默认约 1s，宿主侧同一操作的行会插到前面去，时间线看着是错的（真机日志实证）」）。

**观测 2 · 同一动作的第二个实例：客户端 `dir.adopt` 与宿主 `home.create` 相隔 4ms，方向相反**

| 时间（ts） | 行 | 事件 | 追踪字段 |
|---|---|---|---|
| 1792001208757 | `:63` | `dir.adopt`（客户端）`{"dir":"D:\\dsh-plugin\\wt-931-final",…,"created":true}` | `traceId":"68f916ee00473a92","spanId":"3a6ac6e0","seq":7` |
| 1792001208761 | `:64` | `home.create`（**宿主**）`{"homeId":"8656b0f8-…","name":"wt-931-final","ok":true}` | **无** |
| 1792001208764 | `:65` | `home.action`（客户端）`{"action":"create","homeId":"8656b0f8-…","ok":true}` | `seq:8` |

**观测 3 · 秒级同窗内两端行交错，弱关联彻底失效（更新中心三连）**

| 时间（ts） | 行 | 事件 |
|---|---|---|
| 1792001671478 | `:72` | `panel.mount`（客户端，`seq:15`） |
| 1792001671480 | `:73` | `update.action attach`（客户端，`seq:14`——**比上一行 seq 小，却更晚**） |
| 1792001671481 | `:74` | `host.update.tap`（**宿主**，`level:warn,event:host.call.fail,method:imc.updateStatus,errorHash:ec4e4693`） |
| 1792001671481 | `:75` | `host.rpc.fail`（**宿主**，`method:imc.updateStatus, code:unknown-profile`） |
| 1792001671649 | `:76` | `panel.load`（客户端，`seq:16`） |

⇒ 同毫秒两行分属两端、**无法从行本身判定属于哪一次动作**；`host.rpc.fail` 无 `traceId`，`update.action attach` 的 `traceId=68f916ee00473a92` 只能靠人工比对邻行。**这就是「按时间对齐」的天花板**：同一秒里同一个端点会被多次调用（`imc.updateStatus` 在 `:29`/`:42`/`:59`/`:75` 四次失败，每次都只有 `errorHash` 可做弱指纹）。

**观测 4 · `seq` 的排链语义在宿主缺席时的后果**：`traceChain` 排序用 `(fields.seq ?? 0, ts)`（`dist\host\query.js:213-232`）——宿主行没有 `seq` ⇒ 一律取 0，会与客户端的 `seq:0` 行（`client.log.init`）挤在一处。贯通后若要严格按因果排序，宿主侧至少需要 `traceId`；`seq` 是否也补，是**可选精度问题**（见 §6）。

---

## 未证实项

1. **未实测「宿主行能被 `--trace` 取回」**：`dsh-log tail --trace <id>` 与 `logQuery({traceId})` 跨两端合并，我只从 `dist\host\query.js:194-200` 与 `README.md:83` 读到语义，**没有跑过 CLI/电话实测**（本票只读取证，不建库、不写日志）。
2. **未核真机端到端**：本仓 `src/**` 与 `tools/verify/**` 里 `traceId` 零命中，注入/透传链路**尚未实现**，故没有「客户端行与宿主行同 traceId」的落盘样本。
3. **未验证 `payload.traceId` 在真实浏览器路径上不被任何中间层剥离**：只读了 DSH bundle 的 `createWebConnectionRpc` 与精确路由代码（asar 370635-370649 / 371533-371547），**没有真的抓过一次含该键的线上请求**。这是落地第一步应当实测的点。
4. **未确认 `log.why()` 在 `client.log.init` 之前调用会返回什么**：`dist\client.js:143` 初始化 `traceState = { traceId: null, … }`，首次 `log()` 才建链；若注入点在首个业务调用（可能早于首行日志）发生，`why().traceId` 可能为 `null`。**方案 (a) 对 null 的处理必须是「不加键」而不是「加空串」**——需实测确认时序。
5. **未查明 `@deepseek-ai/dsh-client-connection` 的包内类型声明**：桌面 profile 的 `node_modules\@deepseek-ai` 下**没有**该包（只有 `cosmokit`/`dsh-brand`/`dsh-storage-domain`/`schemastery`），我读的是 `app.asar` 单文件 bundle 的转译产物（行号是 bundle 内的行号，**不是包内文件行号**）。
6. **`logCtx` 与 traceId 无关——但「宿主侧 `host.update.tap` 真机落点」仍未核**（沿 `docs\research\更新系统-0.2.0升级与发布侧自动跟随.md:67` 的原话「单元层面已覆盖，宿主侧日志实际落点未在真机核过」）。观察到的 `2026-10-15.log:28`/`:41`/`:58`/`:74` 四行 `host.update.tap` 是**支持它已落盘**的正面证据，但我没有核对「是否每次 host.call 都恰好一行」。
7. **未评估 `payload` 多键对第三方/老版宿主的全部路径**：我核的是本仓 `src\index.ts:52-55` 的校验与 A1 `management-rpc.mjs:63-66`；**老版本宿主（0.2.0 之前/更旧 dsh-im）可能校验更严**，未逐版核。
8. **未做性能/体积评估**：每调用多 ~30 字节（16 位十六进制 + 键名）对 15s 轮询的影响未测（量级显然可忽略，但**这是推断，不是实测**）。
