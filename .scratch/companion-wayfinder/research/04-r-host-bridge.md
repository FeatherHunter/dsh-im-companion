# R4 · 非渠道插件 client→host RPC 桥：可行（官方通用机制）

> 只读核查结论：**可以**。`ctx.connection.rpc` 不是渠道插件专属能力——它是 dsh-client-connection 的通用「浏览器↔Node host」RPC 桥，任意插件（含 dsh-im-companion 这类非渠道插件）host 侧注册任意前缀 channel、client 侧同源 fetch 调用即可。

## 结论表

| 问题 | 结论 | 证据（文件:行） |
|---|---|---|
| 非渠道插件 client 能否调自己 host 的服务 | 能。任何插件走同一条 `ctx.connection.rpc` 通道 | dsh-client-connection/lib/index.js:500-604（宿主注册机）；dsh-im client/feishu/api.js:13 仅是把 channel 常量定为 '/feishu' |
| '/feishu' 是「渠道插件注册」还是「任意插件可注册」 | 任意插件可注册：channel 只须 `^\/[A-Za-z0-9._~-]+$` 且非保留的 '/api'；前缀注册即 webServer prefix 路由 | index.js:497,572-589,660-662；dsh-host-webserver/lib/index.js:176-181,321-328；dsh-im 自己就注册了非渠道前缀 '/dsh-im'（update-rpc.mjs:4）、'/dsh-im-delivery'（delivery-rpc.mjs:3） |
| client 调用签名 | `ctx.connection.rpc.call(channel, endpoint, payload, signal)` → 返回 `{ok:true,value}` / `{ok:false,error:{code,message,details}}` | dsh-im lib/client.js:13871-13882（feishuRpcCall 等 11 个封装）；dsh-client-connection/lib/client.js:4505-4524,4532-4557 |
| client 底层传输 | `POST <origin>/<channel>/<endpoint>`，JSON body `{type:'client-request',rpcId,method:endpoint,payload}`；rpcId 必须原样回传 | client.js:4502-4531,4565-4568；`ctx.provide("connection", handle)` 于 client.js:4594-4676 |
| host 侧注册 | host 插件 `inject:['connection']` 后 `ctx.connection.rpc.handle(channel, handler)` → `webServer.register({kind:'prefix',path:channel})`（最长前缀匹配） | index.js:517-523,572-589;dsh-im host/index.mjs:19-23;feishu/rpc.mjs:711-721 |
| handler 契约 | `async (endpoint, payload, signal) => ({ok:true,value})` 或 `({ok:false,error:{code,message,details:{}}})`；仅 POST+JSON；`message.method` 必须等于 URL 中的 endpoint | index.js:479-492,605-631；createFeishuRpcHandler 同形（dsh-im host/channels/feishu/rpc.mjs:503-517） |
| 安全 | 自动过 Host/Origin fence（loopback/trustedHosts）+ browser 会话认证（401/403），与 /api 同款 | index.js:530-533,578-586 |
| 第 3 参 `{authority}`（dsh-im 传入） | 宿主忽略——rpc.handle 只收 (channel, handler) 两参 | index.js:520 |
| client 侧前置条件 | client bundle `inject` 必须声明 'connection'（客户端运行器守卫拒绝未声明服务访问）；dsh-client-connection 的 dsh.client `immediately:true` 保证先提供 | dsh-cordis-client-runner/lib/client.js:322；dsh-client-connection/package.json:32-38 |
| `@deepseek-ai/dsh-client-runtime`（线索 3） | 本构建**不存在**该包；实际链：dsh-client-modules（`__ModuleLoader__` 队列/组合脚本）+ dsh-client-connection + dsh-cordis-client-runner | package 列表；dsh-client-modules/lib/index.js:390-400；companion package.json:19-25 的 inject 引用需改为 dsh-client-connection |
| `ctx.provide` 正式用法 | cordis Service：构造 `super(ctx,name)`（反射注册、随 fiber 卸载移除）或 `ctx.provide(name,value)`；dsh-im host 确实 `ctx.provide('dshIm',{send,listTargets})` | cordis/src/service.ts:42-59；dsh-im host/index.mjs:65-72 ✅ |
| `ctx.storage` | 存在：dsh-storage/host 服务 `super(ctx,'storage')`（domain 表） | dsh-storage/lib/index.js:109 |
| `ctx.workspaces` | host 侧**无**（工作区域服务名 `workspaceRegistry`，dsh-workspace/lib/index.js:309）；client 侧有：dsh-api-workspace-controller client `super(ctx,'workspaces')`，dsh-im client `inject` 含 'workspaces' 且新宿主优先 `ctx.get('uiWorkspace')` | dsh-api-workspace-controller/lib/client.js:320；dsh-im client/index.js:61-72 |

## 最小可用代码

Host 侧（`lib/index.js`）：
```js
export const name = "dsh-im-companion-host"
export const inject = ["connection"]            // 声明后才能访问 ctx.connection
export function apply(ctx, config = {}) {
  const CHANNEL = "/im-companion"               // ^\/[A-Za-z0-9._~-]+$ ，/api 保留
  const handler = async (endpoint, payload, signal) => {
    if (signal?.aborted) return { ok: false, error: { code: "cancelled", message: "cancelled", details: {} } }
    if (endpoint === "ping") return { ok: true, value: { pong: Date.now(), echo: payload } }
    return { ok: false, error: { code: "bad-request", message: `unknown endpoint ${endpoint}`, details: {} } }
  }
  const dispose = ctx.connection.rpc.handle(CHANNEL, handler)
  ctx.effect(() => () => dispose(), "im-companion: rpc channel cleanup") // 卸载即净（handle 注册挂在 client-connection fiber，不会自动摘）
  ctx.provide("agentFleet", { version: "0.0.2" })                        // 亦可顺带向其他 host 插件提供服务
}
```

Client 侧（`lib/client.js`，`__ModuleLoader__` factory 内）：
```js
module.exports.inject = ["slots", "connection"]
// ... apply(ctx) 内部：
const result = await ctx.connection.rpc.call("/im-companion", "ping", { hello: "world" }, new AbortController().signal)
if (!result.ok) throw new Error(result.error.code + ": " + result.error.message)
console.log("[im-companion] host says", result.value)   // { pong: …, echo: {hello:"world"} }
```

## 注意

- endpoint 段仅 `[A-Za-z0-9_$.-]+`（禁空/./..）；payload 须 JSON 可序列化；请求体上限 ~300 MiB。
- 若需与 dsh-im 交互：host 侧 `inject:['dshIm']`（若 dsh-im host 已 apply）存在才算；不要从 client 直接打 dsh-im 的内部 channel（'/dsh-im'、'/dsh-im-delivery'、'/feishu' 无公开契约保障）。
- 无「不可行」替代方案：这就是官方路径（dsh-im 自身即范例），companion 只需照抄。
