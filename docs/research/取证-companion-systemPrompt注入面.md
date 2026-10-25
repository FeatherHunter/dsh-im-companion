# 取证：companion 宿主侧 systemPrompt 注入面（T1 · #161）

> 票：wayfinder research #161「companion 宿主侧 systemPrompt 注入面取证」· 只读取证，无代码改动
> 日期：2026-10-22 · 机器：Windows / Node v24.19.0
> 一手来源：DSH 单档 asar `D:\DeepseekHarness\resources\app.asar`（内部 `dsh/node_modules/@deepseek-ai/...`，抽出副本在 `D:\Temp\r-t1-asar\`）、本机 desktop profile `C:\Users\辰辰洋洋\.dsh\profiles\desktop\`、dsh-im 5.1.0 安装体、本仓源码。
> 证据等级：**源码确证**（直接读到实现）／**实测**（本机跑真实 cordis 4.0.5 + 抽出的 system-prompt + dsh-scope harness）／**推断**（未直接验证，不得当事实用）。

## 一句话结论

在本仓宿主插件里注册 `systemPrompt.context` 可行且**不需要改 package.json / manifest**：用**后置** `ctx.inject(['systemPrompt'], …)`（**不可**写进模块级 `inject`，否则没有该服务的宿主上整个插件变哑）注册，落点是 **global 层**，preset 内的 agent 也能看到；未命中返回 `''` 是安全路径（`required` 只决定 suppress 时是否保留，空段在渲染时被丢弃，agent-loop 在「从未有快照」时不产消息）。**但 `context()` 落的是 user 角色的运行时快照，不是系统提示词**——人设若要进 system prompt，应改用 `systemPrompt.section()`。与 dsh-im 5.1.0 同进程共存只需名字带 `dsh-im-companion:` 前缀且避开 `dsh-im:source-guidance`(125)／`dsh-im:return-file`(115)；同层同名注册会抛错。`tools/verify/host-entry.ts` 的 `makeCtx` 目前既无 `inject` 也无 `systemPrompt` 分支，实现接线时必须同步扩展它，否则 `check` 会当场红。

## 0. 决策速览

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| 1) 本仓现在注入了什么？加 systemPrompt 要声明什么？ | 宿主入口模块级 `inject=['connection']`（src/index.ts:22）；`package.json` 的 `dsh` 字段只有 **client** 侧 `inject` 与 `bundle.patch`，无宿主 inject/manifest；profile 的 `cordis.patch.yml` 条目也没有 `inject`/`isolate`。**加 systemPrompt 什么都不用声明**，代码里后置 `ctx.inject` 即可 | 源码确证（见第 1 节） |
| 2) `ctx.inject(['systemPrompt'])` 可用吗？共存有无冲突？ | 可用（cordis 4.0.5 有 `Context#inject`，dsh-im 同进程已这么用）；注册落 **global 层**，preset agent 可见（实测 `assemble({scope:'agent-1'})` 看到 root 注册项）；无 realm 隔离（两个配置文件均无 `isolate`）；唯一冲突源是**同层同名**，用命名空间前缀规避 | 源码确证＋实测（见第 2 节） |
| 3) order/required/interpolate 精确语义？空文本安全吗？ | `order` 必须有限数（否则注册期 TypeError）；`required` 只在 suppress 时保命、**不保证空文本出现**；`interpolate` 默认 `true` 严格解析 `{{var}}`，未知变量**抛错中断组装**；`text` 同步、每 step 约 2 次、抛错中断 turn；空串→渲染过滤→快照 `''`→无历史不产消息 | 源码确证＋实测（见第 3 节） |
| 4) verify 能断言吗？ | 能，但要先给 `host-entry.ts` 的 `makeCtx` 补 `inject`/`systemPrompt` 假件；新文件还得手工加进 `package.json:63` 的 verify 链（逐条列、无 glob）。仓内无真实 cordis 宿主先例，全是 stub | 源码确证（见第 6 节） |

## 1. 本仓宿主入口现状

### 1.1 装配链（谁把本插件装进来）

- 本仓 `cordis.patch.yml:4-7` 只有一条 insert：`id: dsh-im-companion / name: dsh-im-companion / config: {}` —— **无 `inject`、无 `isolate`**（源码确证）。
- desktop profile `package.json` 的 `dsh.profile.bundles`（共 25 项）里同时含 `@xmanrui/dsh-im`（index 19）与 `dsh-im-companion`（index 21）；`:4-26` 的 dependencies 钉 `dsh-im-companion 0.2.19`、`@xmanrui/dsh-im 5.1.0`（源码确证）。
- profile 的 `cordis.yml` entry 列表为空（仅注释 + `[]`）；`cordis.patch.yml`（186 行）全文 grep `isolate` 零命中（源码确证）⇒ loader 不会为这两个插件建 Realm，它们的 fiber 都不带 `kScope` 标记（loader 只在 `entry.options.isolate` 时建隔离，cordis-plugin-loader/lib/index.js:498-528）。

### 1.2 现有注入面

- `package.json:19` `main: ./lib/index.js`；`:55-65` scripts：`build:host = tsc -p tsconfig.json`、`build:client = tsdown`、`:63 verify` 逐条列 35 个命令（33 个 `node --test` + 2 个纯 `node`，**手工链，无 glob**）、`:65 check = build + typecheck + verify + guard`（源码确证）。
- `package.json:67-80` 的 `dsh` 字段：只有 `client.inject` 四项（`dsh-client-runtime`/`ui-slots`/`connection`/`ui-workspace`）、`client.platform: web`、`bundle.patch: ./cordis.patch.yml` —— **没有宿主 inject 声明**（源码确证）。
- `src/index.ts`（174 行）：`:14` name、`:22 export const inject = ['connection']`、`:51 export function apply(ctx:any, config:any={})`、`:73-99` 注册 `/api/im-companion` fetch 路由、`:100` `ctx.effect` 清理、`:101-111` 「already registered」让位分支、`:168-171` `ctx.provide?.('agentFleet', …)`（源码确证）。src 全量 grep `systemPrompt|prompt|persona|人设|性格` 只命中客户端 detail-drawer 的「性格」文案，**宿主侧零提示词代码**（实测 grep）。
- `src/host/rpc.ts:67` 的 `createAgentFleetHandler` switch 端点表（`ping`/`routes.list`/`activity.snapshot`/`fs.*`/`home.*`/`assistant.*`/`imc.update*`/`config.*`/`log*`）**没有任何提示词端点**（源码确证）。
- 构建面：`tsdown.config.ts:45-72` 只导出 `clientBundle`（entry `src/client/index.ts` → `lib/client.js`），宿主半走 tsc；`package.json:81-85` dependencies 只有 `dsh-log`/`dsh-plugin-update`/`yaml`，devDependencies 无任何 `@deepseek-ai/*`（源码确证）⇒ **实现只能 duck-typing**（与 dsh-im 同法：`typeof promptCtx?.systemPrompt?.context === 'function'`）。

### 1.3 结论：加 systemPrompt 需要什么

- **不需要**改 `package.json` 的 `dsh` 字段、不需要给 `cordis.patch.yml` 加 `inject`、不存在额外 manifest 文件（宿主 inject 只来自 `lib/index.js` 的模块导出，当前 `lib/index.js:20` 即 `export const inject = ['connection']`）。
- **不要**把 `'systemPrompt'` 塞进模块级 `inject`：实测（run2）在无该服务的 Context 上，模块级 inject 的插件 `apply` 根本不执行（0 次），而有服务时执行（1 次）⇒ 老宿主上整插件会静默变哑。正确姿势是 `ctx.inject(['systemPrompt'], cb)`（后置门控，dsh-im 5.1.0 同款）。

## 2. 服务可用性、作用域与共存

### 2.1 服务确实在 root 上（同进程单例）

`dsh-base` bundle 的 `cordis.patch.yml:504-507`：`- id: system-prompt / name: '@deepseek-ai/dsh-system-prompt' / config: personaPrefix: ''`（源码确证，抽出副本 base-patch.yml）。`SystemPrompt extends Service`，构造器 `super(ctx,'systemPrompt')`（sp-index.js:213-244，`:226`），按 cordis 服务注册规则挂到 root，所有同进程插件可 `ctx.get('systemPrompt')` / 声明 inject 后读。

### 2.2 profile 插件的 ctx 能力范围

- `ctx.inject` 在 cordis 4.0.5 存在：`Context#inject(inject, callback)` 返回 `this.plugin({inject, apply: callback, name: callback.name})`（cordis lib/index.js:1600，源码确证）⇒ **新建子 fiber**，注册的 effect/监听随该 fiber 卸载释放。
- profile 插件拿到的 ctx 是普通 Context（无 isolate），**能力范围=root 服务全集**；能否读某服务只看 `inject` 声明（未声明的属性访问抛 `cannot get property "X" without inject`，实测）。
- `ctx.inject(['systemPrompt'], cb)` 在服务缺失时不抛、cb 永不执行（实测 run2：`gated_inject_called = 0`，`bare.get('systemPrompt') === undefined`）——正是「老宿主不炸、新宿主自动生效」的门控形态。

### 2.3 注册落点与 preset agent 可见性（本票最关键实测）

- `ScopedLayers.effect(ctx, …)`：`scopeOf(ctx) === undefined` 就落 `this.global`（scope-index.js:189-218，`:195`）；`merge(scope,pick)` **先铺 global，再按 scope 链覆盖同名**（scope-index.js:177-181，源码确证）。
- 我们的注册发生在 `ctx.inject` 子 fiber 的 ctx 上，仍无 `kScope` 标记 ⇒ **global 层**。
- 实测（run.mjs）：从 root 注册 `x:identity`(order 130) 后，`assemble()` 得 `[x:identity, IDENT]`；`assemble({scope:'agent-1'})` **同样**得 `[x:identity, IDENT]`（全局项对任意 scope 可见）；在 `agent-1` 的 scope.ctx 上注册同名项后才遮蔽为 `AGENT`。
- 官方 invariant 自证同一路径：`dsh-agent-preset-registry/lib/types/invariant.js:36-45` 在 `system-prompt/assemble` 上读 `const agent = context.agent`，若 `presets.composedPreset(agent.ctx) === undefined` 就 fail，文案明说「its tools, **prompt sections**, and skill catalog resolve against the empty **global layer**」⇒ global 层对 preset 内 agent 生效（源码确证）。preset 侧 `mountPreset` 要求 `scopeOf(ctx) !== undefined`（apr-index.js:219-237，`:220` 抛 `agent-preset: mounting requires a scope`），与「agent 另打 scope」不矛盾：assemble 时 global 永远先铺。
- agent 侧装配实参：`assembleContextFor(agent, signal) = { agent, scope: agent, ...signal }`（dsh-agent/lib/index.js:291-297，源码确证；注释「agent and scope set together, so agent-scoped prompt and tool contributions cannot be silently omitted」）⇒ `text(context)` 里 `context.agent.session.id` 拿得到（实测 run2：收到的实参含 `{agent:{id:'A1',session:{id:'S1'}}, scope:'S1'}`）。

### 2.4 与 dsh-im 5.1.0 共存

- dsh-im 的注册（源码确证）：
  - `plugin-src/host/injected-context.mjs:72-86`：`startGuidanceContext(promptCtx)` → `:73` 先 duck-type 判 `typeof promptCtx?.systemPrompt?.context !== 'function'` 就 `return null`；`:80-86` 有 `ctx.inject` 就 `ctx.inject(['systemPrompt'], startGuidanceContext)`，否则直调。
  - 注册项 `name: 'dsh-im:source-guidance'`、`order: 125`（`src/channels/shared/im-source-guidance.mjs:11,14`），`text: assembly => registry.get(assembly?.agent?.session?.id) ?? ''`。
  - `src/channels/shared/semantic/artifact.mjs:739` 另有 `order: 115` 的 `dsh-im:return-file`（同文件 `:722-744` 三重 guard `tools.register`/`systemPrompt.context`/`on`）。
- 本 profile 全量 grep（实测，仅 `node_modules` 的 `*.mjs`/`*.js`）：注册 `systemPrompt.context` 的只有 dsh-im 上述两处 ⇒ **不存在既有第三方上下文名**。
- 冲突判据：`PromptLayer.insert` 在同一层内同名抛错，global 层文案含「for a per-agent override, register through that agent's `agent.ctx` instead」（sp-index.js:203-205，源码确证；实测 J：`prompt context "x:identity" is already registered …`）。
- 结论：名字用 `dsh-im-companion:*`、order 避开 115/125（建议 126）即可共存；**没有 realm/scope 可见性问题**——两边都落 global 层，preset agent 两边都看得到。唯一的间接风险是第三方 `system-prompt/assemble` waterfall 监听器可能改写 assembly（本 profile 存在 `dsh-vision-router/lib/session-vision-mode-boundary.js:315-320`，其注释只描述裁 tools，未见处理 contexts；**未逐行审，推断风险低**）。

## 3. PromptContext 语义（order / required / interpolate / text / 生命周期）

### 3.1 字段定义

`PromptContext`（api-catalog.js:6479-6481，源码确证）：

```ts
readonly name: string
readonly order: number
readonly text: string | ((context: AssembleContext) => string)
readonly interpolate?: boolean   // 默认 true
readonly required?: boolean      // 默认 false
```

注册入口 `systemPrompt.context({name, text, order, …})`（sp-index.js:279-282）：`order` 非有限数**注册期**抛 `TypeError: prompt context "X" order must be a finite number`（实测 run3：`order=NaN` 与 `order='130'` 均抛同一句）；返回 `layers.effect` 的 disposer（可手动注销）。

### 3.2 排序

`assemble()` 对 contexts：`[...contextByName.values()].filter(…).sort((a,b)=>a.order-b.order)`（sp-index.js:394）；JS `sort` 稳定 ⇒ **同 order 按注册插入顺序**（不是按名字；README.zh.md:56 的「同名再按名字」只适用于 `section` 的 `comparePromptSections`）。外部贡献可用任意有限 order（README.zh.md:56 明说）。

### 3.3 required 与空文本（决定「未命中返回空」是否安全）

- `assemble`：`filter(entry => !runtimeContextSuppressed || entry.required === true)`（sp-index.js:394）；`refreshContext` 同样 `:332 if (suppressed && provider?.required !== true) continue`（:324-346）。
- README.zh.md:86：「`suppressRuntimeContext()` 移除调用作用域的可选动态上下文……**标记为 `required` 的贡献仍然可见**」。
- **实测 F**：`required:true` 且 `text` 返回 `''` 时，`assemble().contexts` 里**仍有** `{name:'x:req-empty', text:''}`，但 `renderContextSections` 把它过滤掉（sp-index.js:151-156，`:155 filter(section => section.text.length > 0)`）；`renderContextSnapshot` 因此只剩其它非空项。
- **实测 G**：root 上 `suppressRuntimeContext()` 后，`contexts` 只剩两条 `required`（含空文本那条），渲染仍只剩非空那条 ⇒ **`required` 只保「不被 suppress」，不保「空文本出现」，也不会报错**。
- 空文本的落盘语义（agent-loop/lib/index.js，源码确证）：`RuntimeContextProjection.project`（:334-349）——从未有快照且 `current===''` ⇒ `undefined`（不产消息，`:335`）；曾有快照且 `''` ⇒ `CLEARED`（`'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'`，`:219,336`）；文本相同 ⇒ 不产消息（`:337`）。
- ⇒ **未命中返回 `''` 是安全路径**：不抛、不产生空快照消息，最多把上一份快照清成 CLEARED。`required` 是否设，只影响「宿主/预设开 suppress 时还能不能看到」，与空文本无关。

### 3.4 interpolate

- 默认 `true`：`renderContextSections` 调 `interpolate(context, assembly.variables, 'context')`（sp-index.js:151-158），严格替换 `{{name}}`；未知变量抛 `unknown prompt variable "{{x}}" in context "<name>"; registered variables: …`，畸形抛 `malformed prompt variable reference … in context "<name>"`（sp-index.js:157-182，源码确证；实测 H 复现 unknown）。
- `interpolate: false`：原样保留字面 `{{…}}`（sp-index.js:154；README.zh.md:66；实测 I）。
- ⇒ 人设文本若可能含 `{{`（模板、代码、变量示例），**必须显式 `interpolate: false`**，否则组装期抛错中断。

### 3.5 text 的调用时机/性能约束

- `assemble()` 每次只调一次 `resolveContext`（sp-index.js:394、`:184-190` 同步 `entry.text(context)`）；agent-loop 每个 step 调一次 `assemble(assembleContextFor(this,signal))`（loop-index.js:907），**每个 attempt 再 `refreshContext` 一次**（`:1053`），而 `refreshContext` 对 `assembly.contexts` 里每个 provider 仍存的条目重新 `resolveContext`（sp-index.js:333）⇒ **同一 step 内 text 约被调 2 次**（实测 K：N 次 `assemble` = N 次调用；K 只覆盖 assemble 侧的线性）。
- 不是 token 级/流式调用；但 text **同步执行在 step 关键路径**，必须零 I/O、零 await（异步返回实测 L 会抛 `text.indexOf is not a function`）、必须兜底 try/catch。

### 3.6 错误传播（为什么 text 必须永不抛）

- 实测 run3：`text` 抛 `Error('BOOM')` → `assemble()` 直接 reject `BOOM`（resolveContext 无 try/catch）；`text` 返回 `undefined` → `renderContextSections` 抛 `Cannot read properties of undefined (reading 'indexOf')`。
- `assemble` 在 agent-loop `preStep` 里 await（loop-index.js:907），`refreshContext` 在 `step` 里调用（`:1053`）⇒ 抛错会打断该 step/turn，且没有插件级兜底（源码确证：两处调用均无 try/catch）。
- ⇒ `text` 必须 `try { … } catch { return '' }`，且只返回 `string`（不返回 `undefined`/`null`/Promise）。

### 3.7 生命周期与 change 事件

- `context()` 返回的是 Cordis effect disposer（sp-index.js:281，`layers.effect(this.ctx, …)`）；`ScopedLayers.effect` 卸载时 undo、层空删层、`onChange()`（scope-index.js:211-216，源码确证）。
- 实测（run2）：注册一次 `system-prompt/change` +1，dispose 后 +1（共 2）且 `contexts` 归零；实测 M：dispose 后条目从 `assemble` 消失。
- 插件热重载/卸载：注册发生在 `ctx.inject` 子 fiber 的回调里，`this.ctx` 是被 cordis 重绑过的**调用方 ctx**（`createTraceable`：读 `.ctx` 时返回访问方 ctx，cordis lib/index.js:123-158，`:128`）⇒ effect 挂在子 fiber 上，随插件 fiber 树卸载自动释放，**无需手工 forget**。
- 风险（推断）：若同一进程内新实例在旧 fiber 释放前 `apply`，同层同名会抛 `already registered`。该错误发生在 `ctx.inject` 的子 fiber 内，是否冒泡到宿主 `apply` 未实测；实现应在回调内自兜底（try/catch + resident 日志），不要假设注册必然成功。

## 4. 部署门禁：includeRuntimeContext

- `Config`（sp-index.js:214-219）：`includeRuntimeContext` 默认 `true`；构造器 `:243 if (!(config.includeRuntimeContext ?? true)) this.suppressRuntimeContext()`（源码确证）。
- 本机实测口径：`dsh-base` 的 `cordis.patch.yml:504-507` 只配了 `personaPrefix: ''`，**未设 `includeRuntimeContext`**；desktop profile 的 `cordis.patch.yml` 全文无 `system-prompt`/`includeRuntimeContext`/`persona`/`suppress` 命中 ⇒ **当前部署运行时上下文未被 suppress**（源码确证＋实测 grep）。
- ⇒ 在本机默认配置下，非 `required` 的 context 正常可见；但该开关属部署/用户配置，插件不能假定永远为 `true`。若人设「必须在任何配置下出现」，要么 `required: true`（suppress 时仍进 assembly），要么改用 `section()`（不受 `suppressRuntimeContext` 影响）。

## 5. 落点差异：context ≠ 系统提示词（决策关键）

- `systemPrompt.context` 产出的是 **user 角色的运行时快照**：`RuntimeContextProjection.project` 用 `createUserMessage(...)`（loop-index.js:338-348，源码确证）；而 `SystemPromptProjection.project`（`:264-282`）才产 `system/message`。README.zh.md:100 也直说「上下文在循环下成为模型历史中带来源的 **user 角色快照**」。
- 因此：
  - 要「每会话动态、可清空、像 dsh-im 引导语」→ 用 `context`（本票研究面）。
  - 要「稳定的助理人设进系统提示词」→ 用 `section({name, text, order, …})`（sp-index.js:253-256；同样支持函数 text 与 `interpolate`），落 system prompt，不随 snapshot 清除。
- 两者都可按 agent scope 覆盖；`section` 的同 order 排序按名字（`comparePromptSections`），且 `complete: true` 的段会独占（多段 complete 抛错，sp-index.js:380-382）。

## 6. verify 可行性

### 6.1 现有结构

- `tools/verify/host-entry.ts`（213 行）是本仓唯一「真编译 + 真 import 宿主入口」的假宿主：`:33-42` 用仓库 tsc 把 `src` 编到临时目录、`:46` junction 回 `node_modules`、`:47` `import(tmp/index.js)`（源码确证）。
- `makeCtx(declared, opts)`（`:54-114`）是 Proxy：未声明读 `webServer`/`connection` 抛 `cannot get property "X" without inject`（`:86-90`），timer 抛 `cannot get property "timer" without inject`（`:76-80`）；**没有 `inject` 方法、没有 `systemPrompt` 分支**（源码确证）。
- ⇒ 若实现里直接 `ctx.inject([...])`，现有 fixture 会 `TypeError: ctx.inject is not a function`（好事：check 立刻红）；若直接读 `ctx.systemPrompt`，Proxy fallback 会静默给 `undefined`（坏事：抓不到漏声明）。
- 其它假件全是手写 stub，无第二套真实 cordis 宿主：`theme-install.ts` 的 `stubDocument`、`log-pipeline.ts` 的 fake logger、`features/a17-panel-linkage.ts` 的 `fakeRpc`、`features/update-host.ts` 的 `fakeRegistry`、`features/home-parity.ts` 的 `fakeBtn`（源码确证）。
- 新文件进 verify 必须手工改 `package.json:63`（逐条 `node --test`，无 glob）。

### 6.2 建议的断言（可实施）

1. `makeCtx` 增补：`inject(list, cb)` 记录 `list`，并在 opts 提供的假服务存在时以假 promptCtx 调 `cb`；`systemPrompt` 分支返回一个记录 `context()/section()` 入参的对象，`context()` 返回可计数 disposer。
2. 宿主 `apply` 后断言：**模块级 `inject` 仍只有 `connection`**（不把 systemPrompt 塞进模块声明）；`ctx.inject` 被调用且参数含 `'systemPrompt'`。
3. 断注册项：`name` 以 `dsh-im-companion:` 开头、`order` 为有限数且 ≠115/125、`interpolate === false`；`text({agent:{session:{id:'S1'}}})` 返回字符串；未知 session 返回 `''`。
4. 断 text 永不抛：喂一个会抛的渲染依赖 → `text` 仍返回 `''`（不抛）。
5. 断降级：opts 不给 systemPrompt 时，`ctx.inject` 的 cb 不执行、`apply` 不抛、路由照常注册。
6. 断 disposer：调用注册返回的 disposer 后，假 systemPrompt 的记录清零（或计数 -1）。
7. 若拆出纯函数（推荐）：`src/host/prompt-context.ts` 导出 `installCompanionPrompt(promptCtx, deps)`，单测不需要 cordis，verify 只需假 `promptCtx`；`apply` 里仅做 `ctx.inject` 接线。

## 7. 推荐实施规格（供实施票）

1. **新增纯模块** `src/host/prompt-context.ts`：导出 `installAssistantContext(promptCtx, deps): (() => void) | null` —— duck-type 判 `promptCtx?.systemPrompt?.context`，注册 `{ name: 'dsh-im-companion:assistant-identity', order: 126, interpolate: false, required: <按需求>, text: (assembly) => deps.resolve(assembly?.agent?.session?.id) ?? '' }`，`text` 内 try/catch 返回 `''`，返回 disposer。
2. **接线**（`src/index.ts` 的 `apply` 内、路由注册之后）：`if (typeof ctx?.inject === 'function') ctx.inject(['systemPrompt'], (promptCtx) => { try { installAssistantContext(promptCtx, …) } catch (e) { log.warn(...) } })`；**不改模块级 `inject`**。
3. **数据源**：按 session id 的内存表（与 dsh-im 同构），由现有 RPC 写入；未命中返回 `''`，不要在这里读盘。
4. **名字/order 纪律**：`dsh-im-companion:` 前缀、order 126（避开 115/125；同 order 会按注册顺序隐性竞态）。
5. **人设若要求 system 角色**：同一模块再提供 `installAssistantSection(...)`（`section({name, text, order, interpolate:false})`），不要让 context 承担系统提示词职责。
6. **verify**：扩展 `tools/verify/host-entry.ts`（或新建 `tools/verify/features/assistant-identity.ts` 并加进 `package.json:63`），按 6.2 七条断言。

## 8. 未证实 / 未覆盖（别当事实用）

1. **热重载竞态**：旧 fiber 是否总在新 `apply` 前释放（cordis loader 正常 dispose，但极端并发未实测）；同名重复注册的错误是否冒泡到宿主 `apply` 未实测。→ 实现须自兜底。
2. **真实 DSH 会话内的端到端**：harness 是抽出的 system-prompt + dsh-scope + cordis，未在运行中的 DSH 进程里验证；`includeRuntimeContext` 若被用户/预设关闭的实际行为只按源码/README 推断。
3. **`context.agent.session` 恒存在性**：subagent/冷启动早期是否已有 session 未实测；实现按可选链兜底。
4. **第三方 assemble 监听器**：`dsh-vision-router` 只在注释里描述裁 tools，未逐行确认它不动 `contexts`；理论上 waterfall 可改写/过滤我们的条目。
5. **dsh-prompt 等其它已装插件**是否以别的 API（如直接 `systemPrompt.section`）占用 order 未全量审；本票只 grep 了 `systemPrompt.context`。
6. **token 成本**：未测算上下文快照与 section 两种落法的 token/缓存影响。

## 9. 复现

- 抽出副本：`D:\Temp\r-t1-asar\{sp-index.js, sp-readme.md, scope-index.js, loop-index.js, agent-index.js, apr-index.js, base-patch.yml, cordis-lib-index.js}`（asar 解析脚本 `D:\Temp\r-t1-asar\extract.cjs`；要点：`dataStart = 8 + u32(4)`，用 `indexOf('{"files"')` 定位 JSON 头）。
- harness：`D:\Temp\r-t1-asar\nm\run.mjs`（全局层/遮蔽/空文本/required/suppress/interpolate/同步 text/change 计数/子插件注册）、`run2.mjs`（服务缺失门控、模块级 inject 变哑、注册/释放各 +1 change、空快照长度）、`run3.mjs`（text 抛错、undefined、order 非法）。运行：`node D:\Temp\r-t1-asar\nm\run.mjs`（依赖同目录 `node_modules\@deepseek-ai\{cordis,dsh-system-prompt,dsh-scope,cosmokit}`）。
- 本仓 verify 现状：`node --test tools/verify/host-entry.ts`（需先 `npm run build:host`，fixture 自己会再编一次）。
