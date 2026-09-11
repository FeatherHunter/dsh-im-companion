# ADR-0002：host 自有桥载体改道（`rpc.handle` 前缀路由 → DSH 公开 `/api` 上的 exact Fetch 路由）

- Status：**已接受（Accepted）** — 2026-09-11，#79 修复落地并经线上核验（本机原报错环境连续 6 次装配成功）
- 相关票：#79（BUG · web profile 装配失败）、#81（本决策的记录同步）、地图 #1（Decisions）
- 取代：R4「任意插件可注册非渠道前缀 → /im-companion；rpc.handle 契约」中的**载体部分**（.scratch/companion-wayfinder/research/04-r-host-bridge.md）；端点命名与信封语义不变

## Context

DSH web profile 加载本插件时，loader 直接丢弃 host 半：

```
Error: failed to apply loader entry dsh-im-companion (dsh-im-companion): cannot get property "webServer" without inject
```

**首版假设（已作废）**：以为本插件 `inject` 缺 `webServer`，遂补声明。2026-09-11 08:15 真机启动**仍报同一错误** → 假设被推翻：抛错的 Context 不是本插件的 ctx，怎么补 `inject` 都无效。

**复核结论（宿主源码级）**：旧写法 `ctx.connection.rpc.handle()` 的注册路径是
`HostConnectionService.register()`（`@deepseek-ai/dsh-client-connection/lib/index.js:602-618`），其最后一步
`owner.webServer.register(route)`（同文件 `:618`）拿的是 **connection 服务自己的 Context** —— 那个 ctx 没有
`webServer` 注入，于是被 cordis 声明守卫拒绝。即：访问点在依赖内部、用的是调用方的 ctx，本插件逐行搜
`ctx.webServer` 当然搜不到。

同环境三个插件（本插件、`dsh-calorie`、`dsh-memo-ilife`）都调了 `rpc.handle`、都没声明 `webServer`，恰好就是报
同一错误的三家 —— 相关性成立，但「补声明即可」的因果推断是错的。

## Decision

- **D1 · 载体**：自有桥改经 DSH 公开的 `/api` 载体注册 exact Fetch 路由
  `ctx.connection.fetch.register({ path: '/api/im-companion', methods: ['POST'], requestBody: 'buffered' })`。
  该路径只写 connection 服务自己的 `fetchRoutes` 内存表 + `owner.effect`（同文件 `:587-601`），**全程不碰
  `owner.webServer`**，从结构上绕开声明守卫。与上游 `@xmanrui/dsh-im` 的 `plugin-src/management-rpc.mjs` 同构。
- **D2 · 声明**：`inject` 保持只声明 `connection`（补 `webServer` 是错误方向，已实测无效）。
- **D3 · 命名**：端点名 `im-companion` 与路由路径 `/api/im-companion` 在 host 侧单点定义（`ENDPOINT` / `ROUTE_PATH`），
  杜绝两处字面量漂移；client 侧 `'/im-companion'` 并入新载体集合并取 endpoint `'im-companion'`。
- **D4 · 信封**：沿用 DSH 双向信封（`client-request` → `server-response`），内层 `{ method, payload }`
  沿用 `im-companion.<feature>.<action>` 命名（契约 §3 不变）。
- **D5 · 自洽**：handler 保留 POST 方法守卫并用断言覆盖——不依赖宿主「只在 methods 命中时才派发」这一实现细节。
- **D6 · 退让**：重装配（live patch reload / 回滚重放）遇到宿主 `already registered` 时不抛、只 warn 并放弃本实例注册，
  避免整条桥被丢弃；该分支同样有断言。
- **D7 · 旧语义退役**：`/im-companion/<endpoint>` 前缀路由语义**不保留兼容**（同一路径不可能两种语义并存；
  且旧前缀在插件入 bundled 前从未在 web profile 生效）。

## Consequences

- 回归钉：`tools/verify/host-entry.ts`（6 断言）——inject 只含 connection / 经 fetch.register 注册 / 信封往返 /
  方法守卫 / 重装配退让 / 宿主无 `fetch.register` 时必须失败。
- 装配期不再有 webServer 声明检查风险；但**代价**是依赖 DSH 提供 `connection.fetch`（0.1.2-alpha.1 起已提供；
  更老的宿主会在装配期显式失败，不静默降级）。
- 记录同步（#81）：契约 §3 增载体行、CONTEXT 术语表 Contract 行改述、`src/index.ts` 注释与日志改述
  （日志现为 `[agent-fleet] host ready, fetch route /api/im-companion`）。

## 证伪条件（任一命中即重开对应条目）

- 宿主提供官方「插件自有 RPC 通道」API（`rpc.handle` 能正确归属调用方 ctx）：D1 可回退为官方通道。
- 宿主改变 `/api` 派发语义（例如对 exact 路由不再按 `methods` 过滤）：D5 的方法守卫与其断言重新评估（守卫本身可保留）。
- 上游 `@xmanrui/dsh-im` 改回前缀注册或改换载体：D3/D7 的 endpoint 映射需重算。
