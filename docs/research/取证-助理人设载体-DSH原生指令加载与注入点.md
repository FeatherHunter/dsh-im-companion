# 取证 · 助理人设载体：DSH 原生指令加载链与插件可用的 prompt 注入点

> 任务：共享任务板 `task-2`（研究 · DSH 原生指令加载链与插件可用的 prompt 注入点）
> 日期：2026-10-22 · 性质：只读取证，**不写实现**；仅新增本文件，未改 `INDEX.md` / `src/` / 其它笔记，未 git、未构建发布
> 一手来源：DSH Desktop 安装目录 `D:\DeepseekHarness\resources\app.asar`（单档 182,794,869 B；其内路径前缀 `dsh/node_modules/...`）；已装 `@xmanrui/dsh-im` **5.1.0**；本仓 `0.2.19`
> 取证方式：手写 asar 解析器（8B pickle + JSON 头 + 数据区）把命中的文本文件抽到仓库外 `D:/Temp/r-dsh-native/src/<asar 内原路径>`，下述 `lib/index.js:NN` 均指该抽取物的行号（对应 asar 内同名文件；磁盘上不存在可读的 `app.asar\dsh\` 目录）。抽取脚本不入库。

## 结论先行

1. **DSH 有原生、一等公民级的提示词注入服务**：`systemPrompt`（`dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js:213-226`），提供 `section / context / variable / tools / suppressRuntimeContext / refreshContext / assemble` 七个注册面；**profile 级插件可直接用**，已装 dsh-im 5.1.0 就是生产先例（`@xmanrui/dsh-im/plugin-src/host/index.mjs:149` `ctx.inject(['tools','systemPrompt'], …)`、`injected-context.mjs:72-79`）。
2. **两条注入面落点不同**：`section()` 进 **system 提示词正文**（按 order 拼进同一个 system 消息）；`context()` 每步渲染成一条 **user 角色快照消息**落盘，且同文本不重复追加（`@deepseek-ai/dsh-agent-loop/lib/index.js:239-350`、`:902-927`、`:1043-1074`；README.zh.md:140）。
3. **排序语义确定**：section 按 `(order 升序, name 的代码单元序)` 稳定排序（`dsh-system-prompt/lib/index.js:101-103`），context 只按 `order` 升序（同文件 `:394`）；内置位置集中在 `SECTION_ORDERS`（`:10-43`）与 `CONTEXT_ORDERS`（`:44-52`），仓库自带贡献方用 `getSectionOrder/getContextOrder` 取位，**外部贡献方可用任意有限 order**（README.zh.md:56）。
4. **文本可以是函数，且运行时能拿到当前 Agent**：`text: (context) => string`（`lib/index.js:388`、`:187`）；运行时 `AssembleContext` 带 `agent`——`dsh-agent-preset-registry/lib/types/invariant.js:36-46` 在 `system-prompt/assemble` 里读 `context.agent`，`dsh-harness-dev-context` 用 `context.agent?.session` ⇒ **可按 session/助理动态渲染人设**（公开类型 `api-catalog.js:4779-4780` 未列 `agent`，属类型面缺口，见「未证实」）。
5. **部署策略确实有门禁，但可绕过**：`includeRuntimeContext`（默认 true）/ `suppressRuntimeContext()` 决定可选 context 是否存在，`required: true` 的 context 不被抑制（README.zh.md:86；`PromptContext.required` 见 `api-catalog.js:6475-6500`）⇒ 人设若要常驻，应注册 required context。
6. **全局人设只有配置层可写，per-agent 人设靠作用域遮蔽**：`personaPrefix`/`personaSuffix` 是 `systemPrompt` 的 config（`lib/index.js:214-220`，注册为 `deployment:persona-prefix` order 0 / `deployment:persona-suffix` order 10200，`:228-243`）；专门的人设行 `@deepseek-ai/dsh-persona` **只能挂在 agent preset 内**（`dsh-persona/lib/index.js` 模块注释：全局挂会与 registry 自己的注册撞名 fail loud）。
7. **本机现行「人设」就是 preset 里的 dsh-persona**：`dsh-web-app/presets/standard.patch.yml:4-18` 在 standard preset 里挂 `@deepseek-ai/dsh-persona`，`prefix: "You are a coding agent powered by the {{model}} model."`，与本次会话系统提示词首句一致；`dsh-web-app/cordis.patch.yml:17-20` 另把同一句写进全局 `systemPrompt.personaPrefix`。
8. **用户级指令文件确实存在且被读**：`$DSH_HOME/AGENTS.md`（本机 `C:\Users\辰辰洋洋\.dsh\AGENTS.md`）与 `$DSH_AGENTS_HOME`（缺省 `~/.agents/AGENTS.md`）（`dsh-agent-instructions/lib/index.js:168-176`、`:480-497`；home 解析 `dsh-home-paths/lib/index.js:11-21/109-111/124-126`）；**本机三处（`.dsh/AGENTS.md`、`.dsh/CLAUDE.md`、`~/.agents`）全不存在** ⇒ 本会话无用户级指令。
9. **项目链＝项目根到 cwd 逐级发现**：cwd 上溯最近含 `.git` 的目录为项目根（`:574-582`），`root→cwd` 每级读 `AGENTS.md/CLAUDE.md` ＋ `AGENTS.local.md/CLAUDE.local.md`（`:17-18`、`:646-676`），缺失即跳过（`:625-645`），同候选组 trim 后同内容去重（`:197-199`）；**不 watch 文件**，首次请求一条持久 user 消息（`<system-reminder>` 包裹，`:122-143`、`:324-334`、`:897-909`），之后由 `read/write/edit` 的 touch 触发增量（`:1406-1444`）。
10. **指令有硬预算**：dsh-base 行给 `maxBytes: 65536`（`dsh-base/cordis.patch.yml:303-306`）；超预算先整份丢弃最宽泛文件、再二分截断最具体文件（`lib/index.js:361-440`），单文件源上限 `maxSourceBytes: 1048576`（`:19`）。
11. **dsh-im 的 guidance 走的正是 context 面**：`IM_SOURCE_GUIDANCE_ORDER = 125`、`text: (assembly) => registry.get(assembly?.agent?.session?.id) ?? ''`（`im-source-guidance.mjs`；`injected-context.mjs:72-79`），空串即不贡献、文本变化才产生新快照；其注释明确「部署策略仍决定这类快照是否存在」（`injected-context.mjs:49-62`）。
12. **不存在终端用户编辑提示词的 API**：部署方文本只来自配置/组合，创建方插件只能注册 agent 作用域遮蔽项（README.zh.md:177）⇒ `用户可编辑的人设` 必须由插件自持存储＋渲染，DSH 只提供注册面。

## 证据与细节

### 1. `systemPrompt` 服务：类型、注册面、作用域（源码确证）

- 包路径：`dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js`（19817 B）。服务名 `systemPrompt`，`class SystemPrompt extends Service`（`:213-226`）。
- Config：`{includeHarnessIdentity:true, includeRuntimeContext:true, personaPrefix:'', personaSuffix:'', toolOrder}`（`:214-220`）。构造器无条件注册 `harness:identity`（order -1000）、`deployment:persona-prefix`（order 0）、`deployment:persona-suffix`（order 10200）（`:228-243`）——**这就是全局 persona 只能由配置改、不能由插件再注册的原因**。
- `section(section)`（`:253-256`）：order 必须 finite（否则 `TypeError`）；同一层重名抛错；返回 disposer；注册/释放发 `system-prompt/change`。`context(context)`（`:279-282`）同构，作用域内同名遮蔽全局。
- 内置位置常量：`SECTION_ORDERS`（`:10-43`：HARNESS_IDENTITY -1000、DEPLOYMENT_PERSONA_PREFIX 0、PLAN_POLICY 500、TEAM_POLICY 600、PTC_ONLY 800、FILE_REFERENCE 900、TOOL_* 1000–3000、MCP_SERVERS 3100、TOOLS_SDK 5000、DELIVERABLE_FILE_REFERENCES 9000、STRUCTURED_OUTPUT 9900、HARNESS_SOURCE 10000、WEB_SURFACE 10100、DEPLOYMENT_PERSONA_SUFFIX 10200）；`CONTEXT_ORDERS`（`:44-52`：WORKING_DIRECTORY 100、SANDBOX_POLICY 110、APPROVAL_POLICY 115、SUBAGENT_DELEGATION 120、TEAM_IDENTITY 125、HARNESS_SOURCE 200、WEB_SURFACE 210）。
- 段文本插值 `{{var}}`，空段丢弃、以空行 join（`:117-119`）；`interpolate:false` 保留字面花括号（README.zh.md:66/178）；`complete:true` 段组装后成为**唯一**提示词段，有效 complete 段 >1 直接组装失败（README.zh.md:56）。
- 变量：`variable(name, provider)`，名字须匹配 `/[a-z][a-z0-9_]*/`；段引用未定义值 ⇒ 组装失败（`api-catalog.js:3083-3143` 服务条目文档）。自定义 persona 模板**不得依赖 `{{cwd}}`**（README.zh.md:78）。
- 服务文档（`api-catalog.js:3083-3143`）：`assemble(context={})`「合并全局与作用域 provider → 摘除工具参数 → 规范排序 → 跑 assemble waterfall；返回的 waterfall 值权威，但有效 complete 段在之后被恢复为唯一段」；`refreshContext(assembly, context={})`「只刷新已接受的运行时事实；仅由 waterfall 添加的 context 保持已接受值；抑制移除可选 context，缺失的 required 注册按注册序恢复；段/工具/插值变量保持已接受装配，其 provider 与 waterfall 不重跑」。
- 公开类型（`api-catalog.js:6475-6500`）：`PromptAssembly={sections,contexts,tools,variables}`、`PromptContext={name,order,text:string|fn,interpolate?,required?}`、`PromptSection={name,order,text:string|fn,interpolate?,complete?}`、`AssembledContext={name,text,interpolate?}`。

### 2. 组装 → 落盘：section 进 system，context 进 user 快照（源码确证）

- 每步 `preStep()` 先 `const assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))`（`dsh-agent-loop/lib/index.js:907`）；默认 `agent/pre-step` 实现把 `renderContextSections(assembly)` 投影成快照：`this.runtimeContext.project(joinContextSections(sections), sections)`，返回 `messages`（`:913-920`）。
- `RuntimeContextProjection`（`:298-350`）：构造时从最新 `source.kind==='runtime-context'` 的 user/message 恢复 retained 文本；`project` 中 `retained.text === snapshot` 则**不产生新消息**，否则 `createUserMessage({content:[text], source: sections.length===0 ? {kind:'runtime-context'} : {kind:'runtime-context', form:'snapshot', sections}})`。
- `step()`：`const renderedPrompt = renderPrompt(assembly)`（`:1049`）；每 attempt 前 `renderContextSections(systemPrompt.refreshContext(assembly, assembleContextFor(...)))` → `project`（`:1053-1054`）→ `systemPrompt.project(renderedPrompt, {inHistory: preparedCall?.systemPromptUpdate === 'in-history'})`（`:1057-1060`）→ 落 `system/message`（`:1061-1065`）→ context 以 `session.append('user/message', context, {surfaceOp:'append'})` 落盘（`:1069/:1073`）。
- 结论：**section 影响 system 前缀（每步重渲染整段文本）；context 每步重算但只在文本变化时追加一条 user 消息**（因此 guidance 型动态文本天然去重、可回放/压缩/恢复）。

### 3. 插件可用的写法与先例（源码确证）

- 最干净的一等示例：`@deepseek-ai/dsh-harness-dev-context/lib/index.js`（7357 B）——`inject=['systemPrompt','sessionProjections','webApp']`；`ctx.systemPrompt.section({name:'harness:source', order: ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'), interpolate:false, text: (context) => …})`（grep 命中 :100）；`ctx.systemPrompt.context({name:'harness:source', order: ctx.systemPrompt.getContextOrder('HARNESS_SOURCE'), interpolate:false, text: …})`（grep 命中 :112）；上下文文本还可用 `ctx.webApp.getAdvertisedUrl()` 动态取值。
- 生产第三方先例（已装，本机）：`@xmanrui/dsh-im/plugin-src/host/injected-context.mjs:72-86`——`if (typeof ctx.inject === 'function') ctx.inject(['systemPrompt'], startGuidanceContext); else startGuidanceContext(ctx);`，注册 `{name:'dsh-im:source-guidance', order:125, text:(assembly)=>registry.get(assembly?.agent?.session?.id) ?? ''}`，并 `ctx.on('agent/disposed', …, {global:true})` 清理（`:88-91`）；另有 `agent/pre-step` waterfall 改写注入消息（`:93-111`）。`host/index.mjs:29-33` 的模块级 `inject` 只含 `connection/credentials/typertGateway`，`systemPrompt` 属**可选服务、后到后注册**（`:148-156` 的 `ctx.inject(['tools','systemPrompt'], …)` 同一门禁）。
- 另一注入面：`dsh-vision-router/lib/session-vision-mode-boundary.js:420` `systemPrompt.variable(MODE_SYNC_VARIABLE, (context) => …)`（用 variable 而非 section/context）。
- 反例：`dsh-prompt` 是纯客户端插件（`lib/client.js` inject `['slots','inputTriggers']`；`lib/index.js` inject `['storageDomain','webServer']`），不碰提示词；`billion-context` 走网关/请求改写，不注册 `systemPrompt`。

### 4. per-agent / per-session 的边界（源码＋文档）

- 插件在 `apply` 拿到的 `ctx` 是**全局作用域**；要注册「只对某个 agent 可见」的段/工具，必须经 `agent.ctx`（`dsh-agent/README.zh.md:157`「通过 agent.ctx 进行的注册可以遮蔽提示词段或工具…一个 agent 看到的提示词与工具集会与其邻居不同」；`dsh-scope/README.zh.md:75`：作用域筛选「无标签监听器放行、有标签仅当标签为分发键或其祖先、`{global:true}` 绕过」；实现 `dsh-scope/lib/index.js:327-338`）。
- 拿 agent 句柄的现成事件：`agent/created`（serial，payload `{agent, source, signal}`，监听器在 creation 前 awaited；`api-catalog.js:3956-3961`）、`agent/disposed`（`:3964-3969`）。dsh-im 只用了 disposed。
- 不想做作用域也能 per-session 分流：context/section 的 `text` 函数在运行时能读到 `context.agent`（见结论 4），返回 `''` 即不贡献 context / 空段被丢弃。**第三方先例只有 context 面**（dsh-im）；section 面同样能读 `context.agent` 属推断（同一 `AssembleContext` 对象）。
- `@deepseek-ai/dsh-persona/lib/index.js`（2163 B）是全仓唯一「专门的人设行」：`inject=['systemPrompt']`，Config `{prefix 必填, suffix='', complete=false, includeRuntimeContext=true}`，注册 `PERSONA_PREFIX_SECTION`（order `getSectionOrder('DEPLOYMENT_PERSONA_PREFIX')`）与 suffix；模块注释明说它是 **scope-only**：挂 preset 内遮蔽该会话的部署 persona，挂全局会与 registry 自带注册撞名而 fail loud。`includeRuntimeContext:false` 时调 `suppressRuntimeContext()`。
- preset 侧：`@deepseek-ai/dsh-agent-preset-registry` README 明说「注册表不扫描目录，也不接受 preset 路径」「没有任何接口接受 YAML 写回」「新建/覆盖 preset 都是 bundle 补丁，再用 `plugin_manager` 安装到 profile」；preset 的服务提供/消费需同 `cordis:group` realm，激活审计会拒绝向全局泄漏的服务。⇒ **插件无法在运行时为某个助理创建/改写 preset**。

### 5. AGENTS.md / CLAUDE.md 加载链（源码确证）

- 发现顺序（`dsh-agent-instructions/lib/index.js:646-676`）：先 user-global roots 的固定 `AGENTS.md`（`:655-671`），再 `cwd → findProjectRoot → ancestorChain(root, cwd)` 逐目录 × `[instructionFileCandidates, localInstructionFileCandidates]`（`:673-674`）。
- user-global roots（`:480-497`）：`[resolveDshHome(), resolveAgentsHome()]` 的**固定 `AGENTS.md`**（`:168 USER_GLOBAL_FILE`）；显示路径 `~/.dsh/AGENTS.md` → `user-global`、`~/.agents/AGENTS.md` → `agents-global`（`:175-176`）；两者**同候选组**、trim 后同内容只渲染一次（`:197-199`）。
- 项目根：`projectRootMarkers` 默认 `['.git']`（`:16`）；从 cwd 向上找第一个含 marker 的目录，到盘根仍没有则 **返回 cwd 本身**（`:574-582`）；`ancestorChain` 返回 root→cwd inclusive 并反转成「宽泛→具体」（`:589-602`）。权限/IO 失败会停止发现并抛原错（README.zh.md:42）。
- 存在性：逐候选 `stat`，只有 present 才加入；absent/unavailable 静默跳过（`:625-645`）。文件缺失 ⇒ 不产生任何内容（README.zh.md:34）。
- 渲染：整条消息包在 `<system-reminder>` 框架内（`:122-143`、`:324-334`），每文件段 `Instructions from: <displayPath>\n\n<content>`（`:141-143`）；intro 声明「更具体优先、不覆盖 system/developer/直接用户指令」（`:124`）；变更时用「Additional instructions / Updated instructions / Instructions removed」（`:258-291`）。
- 预算（`maxBytes` 必填，dsh-base 给 65536）：先整份丢弃最宽泛文件、再二分截断最具体文件，并在消息里写明 `Workspace instruction budget … omitted/truncated …`（`:317-440`）；单源文件上限 1 MiB（`:19`）。
- 生命周期：第一次符合条件的 `agent/pre-step` 把基线折入进入步骤的批次（`:1406-1424`）；成功 `read/write/edit` 的 touch 沿父 exec 上浮，下次请求补更深目录（`:1425-1444`）；**不 watch 文件**（README.zh.md:74/88）；注入消息都是带来源的持久 `user/message`，可回放/压缩/恢复；字面 `</system-reminder>` 会被转义（`:138-140`）。
- 语义边界：只认这份候选清单；不解释 `@path` import、不读 `.claude/rules`（README.zh.md:219-226）；symlink 跟随（跨信任边界需注意）。

### 6. 本机部署组合现状（现场＋源码确证）

- dsh-base：`- id: agent-instructions / name: '@deepseek-ai/dsh-agent-instructions'`（`dsh-base/cordis.patch.yml:303-306`，`maxBytes: 65536`）；`- id: system-prompt`（`:504-507`，`personaPrefix: ''`）；`- id: agent-loop`（`:511-514`）。
- dsh-web-app 覆盖：`dsh-web-app/cordis.patch.yml:1-6` 头注「patch 替换目标行的整个 config，每行都重述它拥有的全部键」；`:17-20` 设 `personaPrefix: You are a coding agent powered by the {{model}} model.`。
- standard preset：`dsh-web-app/presets/standard.patch.yml:4-18` 声明 `@deepseek-ai/dsh-agent-preset`（id standard, order 1）及其子插件 `@deepseek-ai/dsh-persona`（prefix 同上）、`@deepseek-ai/dsh-agent-instructions`（maxBytes 65536）。
- profile：`C:\Users\辰辰洋洋\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 依次为 dsh-base、dsh-web-app、…、`@xmanrui/dsh-im`、billion-context、`dsh-im-companion`、dsh-prompt 等；`cordis.patch.yml`（181 行）含 ui/opencode-go/vision-router/permission/locale/plugin-market/agent-preset-registry，**没有 system-prompt 行** ⇒ persona 前缀来自 dsh-web-app。
- 用户级指令现场：`~/.dsh/AGENTS.md`、`~/.dsh/CLAUDE.md`、`~/.agents` 均不存在；`DSH_HOME=C:\Users\辰辰洋洋\.dsh`。

### 7. 既有笔记复用（只记路径＋一句话结论）

- `docs/research/盘点-助理身份数据模型与现有性格投递链路.md`：助理账本无人设字段、上游 per-bot 唯一自由文本载体是 guidance（≤8000）、本仓现有性格链在 dsh-im 5.1.0 上读写双失效、companion 侧无注入通道。
  - **该笔记 §7-1「DSH 宿主是否允许插件注入系统提示/人设：未证实」已被本笔记推翻**：`systemPrompt` 服务＋dsh-im 生产先例＝源码确证支持。
  - 其 §8.6-3「人设必须让 AI 看到时当前唯一现成通道是 guidance」**部分失效**：DSH 原生 `section/context` 是第二条路，且不依赖 dsh-im。
  - 其 §7-7「Agent Preset 的内容面未查」现可答：preset 子插件可挂 `dsh-persona`（order 0/10200 的 persona 段），文本在 preset 配置里。
- `docs/research/INDEX.md` 规定新增笔记须同改索引行；本任务限定只写本文件，**INDEX 未更新**，由 lead/后续会话补登。

## 未证实 / 边界（需真机或实现验证）

1. **未做运行时实测**：本会话是只读研究，没有在任何 agent 上注册 section/context 并观察落盘；结论 2/11 的「每条不同文本生成一条 user 快照」来自 agent-loop 源码推理，未抓真机会话日志验证。
2. **`AssembleContext.agent` 是运行时事实，不是公开类型**：`api-catalog.js:4779-4780` 的 `AssembleContext` 只声明 `{scope?, signal?}`；`context.agent` 仅见于第一方包内部用法与 dsh-im 生产代码。若维护者收紧契约，按 agent 分流的写法可能变成私有依赖（风险有先例、无承诺）。
3. **profile 级注册在 preset 隔离 realm 中的可见性**：preset 的插件树在独立 `cordis:group` realm（preset-registry README）；dsh-persona 能遮蔽 `systemPrompt` 说明 registry 实例是共享的，但「root 插件注册的 section/context 对挂在 preset 里的 agent 是否可见」未实测（推断：可见，因为 dsh-im 的 guidance 正常作用于 IM 会话 agent）。
4. **`required:true` 的 context 在空文本时的行为**：README 只说 required 不被抑制；`renderContextSections` 过滤空文本（`lib/index.js:151-156`）⇒ 空串是否仍算「恢复的 required」未实测。
5. **部署是否可能关掉 runtime context**：本机 dsh-web-app 未设 `includeRuntimeContext`（默认 true），其它 profile / 未来版本是否会关未查。
6. **AGENTS.md 的 cwd 语义**：链由会话工作目录决定，desktop 切换工作区后「下一次请求前重载」（README.zh.md:28）未实测；另 `.git` 缺失时根＝cwd，意味着无仓库的单目录工作区只读该目录一层。
7. **行号可复现性**：所有 `app.asar` 内文件行号来自我抽取到 `D:/Temp/r-dsh-native/src/` 的副本（用自写解析器，未安装 `@electron/asar`）；版本升级后行号会漂移，引用宜配符号名。

## 对「助理人设载体」决策的含义

### 被源码支持的选项

| 选项 | 落点 | 关键事实 | 代价/约束 |
|---|---|---|---|
| **A. companion 插件注册 `systemPrompt.context`**（推荐候选） | user 角色快照（每次变化一条） | 与 dsh-im guidance 同面（order 125）；`text` 函数可按 `context.agent.session.id` 返回当前助理人设，空串即不贡献；补发新文本只追加一条快照 | 需在宿主插件 `ctx.inject(['systemPrompt'])`；需自持「助理↔会话」映射；部署若关 runtime context 需注册 `required:true`（行为见未证实 4） |
| **B. companion 插件注册 `systemPrompt.section`**（自有 name＋有限 order，如 10） | system 提示词正文 | 进 system 前缀、最像「人设」；`text` 函数可按 agent 分流、非目标 agent 返回 `''` | 全局注册对所有 agent 生效（无作用域）；人设变化会改 system 前缀、影响 KV cache（README.zh.md:154）；不能复用 `deployment:persona-prefix` 名字（重名抛错） |
| **C. 写工作区 `AGENTS.md`** | user 角色基线消息（`<system-reminder>`） | 零 DSH 新 API；每工作区一份、持久、可回放；用户级 `$DSH_HOME/AGENTS.md` 全局生效 | 与用户仓库自带 `AGENTS.md` 争用同一候选位与 64 KiB 预算；不 watch、改文件后下一次请求才生效；不适合会话级动态人设 |
| **D. 上游 per-bot guidance**（复用现有链路） | 经 dsh-im context 125 → user 快照 | per-bot 粒度与助理 1:1 机器人天然对齐；已有校验/上限/跨渠道端点 | 仅 `scope.enabled===true` 且仅 IM 来源会话；本仓现有读写链在 5.1.0 上双失效，先修才有此选项 |
| **E. preset 内挂 dsh-persona** | system 前缀（preset 作用域遮蔽全局 persona） | 官方为此设计的行；static 文本随 preset 定义 | preset 只能由 bundle 补丁声明（registry 不扫目录、无写回接口）⇒ 不能由 companion 在运行时按助理写；只影响之后创建的 agent |

### 被排除的载体

- **终端用户编辑 DSH 全局人设文本**：不存在该 API（README.zh.md:177）；全局 persona 只能改配置行（`dsh-base`/`dsh-web-app`/profile patch）。
- **在全局直接挂 `@deepseek-ai/dsh-persona`**：与 `system-prompt` 自带 `deployment:persona-prefix` 注册撞名，模块注释明说会 fail loud。
- **把 companion 人设写进 preset 并在运行时切换**：preset registry 无 YAML 写回接口、不扫目录；「人设=预设」只能预置。
- **指望 `AGENTS.md` 做「即时生效的人设」**：不 watch、按候选组去重、预算会丢宽泛文件，且改文件不会触发新一轮（要等下一次请求）。
- **用 `alias`/`name`/`avatar` 承载人设**：均为显示字段（`bot-alias.mjs` ≤80、禁控制字符；账本字段面见既有笔记）。

### 决策上最关键的三个事实

1. **注入面存在且已被生产验证**（`systemPrompt` + `ctx.inject`），companion 不必依赖 dsh-im 的 guidance 也能让人设进模型上下文——这直接解掉既有笔记 §7-1 的「无通道」约束。
2. **section 与 context 是两种产品语义**：要「身份/人格」进 system 前缀选 section（KV cache 更敏感、全局可见）；要「会话级、可回放、可变更」选 context（每次变化一条 user 快照，天然去重）。
3. **per-assistant 粒度可以不做作用域**：在 `text` 函数里按 `context.agent.session.id` 分流、返回空串即可，避免依赖 `agent.ctx` 作用域与 `agent/created` 时序；代价是依赖未公开的 `context.agent` 事实。

## 参考来源清单

### asar 内（`D:\DeepseekHarness\resources\app.asar`，行号据 `D:/Temp/r-dsh-native/src/` 抽取副本）

- `dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js`（19817 B）：`:10-52` 常量、`:101-103`/ `:394` 排序、`:117-156` 渲染、`:213-243` 服务/Config、`:253-282` section/context、`:324-346` refreshContext、`:356-406` assemble、`:388` 函数文本
- `dsh/node_modules/@deepseek-ai/dsh-system-prompt/README.zh.md`：`:56` 排序与 complete、`:66`/`:178` interpolate、`:78` 禁用 `{{cwd}}`、`:86` suppress、`:140` 落点、`:150`/`:154` token 与 KV cache、`:177` 无终端用户 API
- `dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js`（74599 B）：`:239-296` system 投影、`:298-350` runtime-context 投影、`:902-927` preStep、`:1043-1074` step
- `dsh/node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js`（60147 B）：`:16-19` 默认、`:25-30` Config、`:122-143` 框架/转义、`:168-176` 用户级、`:197-231` 分组去重、`:258-291` 变更文案、`:317-440` 预算渲染、`:480-497`/`:574-602`/`:625-676` 发现链、`:897-909` 消息构造、`:935-948`/`:1196-1340` 基线对账、`:1406-1444` pre-step/touch；`README.zh.md`:28/30/34/38-42/72-74/88/103/107/219-226
- `dsh/node_modules/@deepseek-ai/dsh-persona/lib/index.js`（2163 B，全文）
- `dsh/node_modules/@deepseek-ai/dsh-harness-dev-context/lib/index.js`（7357 B，全文）
- `dsh/node_modules/@deepseek-ai/dsh-agent-preset-registry/README.zh.md`、`dsh-web-app/presets/standard.patch.yml:4-18`
- `dsh/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:303-306/504-507/511-514`；`dsh-web-app/cordis.patch.yml:1-6/17-20`
- `dsh/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js:11-21/83-111/124-126`
- `dsh/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js`：`:3083-3143` 服务文档、`:6475-6500` 类型、`:4779-4780` AssembleContext、`:3948-3969` agent 事件、`:4004-4009` pre-step、`:4444-4454` system-prompt 事件
- `dsh/node_modules/@deepseek-ai/cordis/src/registry.ts:164-176`（`ctx.inject` 语义）、`src/events.ts:111-117/165-175`（`global` 与作用域筛选）
- `dsh/node_modules/@deepseek-ai/dsh-scope/README.zh.md:75`、`lib/index.js:327-338`；`dsh-agent/README.zh.md:157`

### 已安装包（`C:\Users\辰辰洋洋\.dsh\profiles\desktop\node_modules\`）

- `@xmanrui/dsh-im/package.json:3`（5.1.0）；`plugin-src/host/index.mjs:28-33/143-156`；`plugin-src/host/injected-context.mjs:49-62/72-91/93-111`；`src/channels/shared/im-source-guidance.mjs`（`IM_SOURCE_GUIDANCE_ORDER=125`）
- `dsh-vision-router/lib/session-vision-mode-boundary.js:420`（variable 面先例）；`dsh-prompt/lib/client.js`、`lib/index.js`（非注入器）

### 本仓

- `docs/research/盘点-助理身份数据模型与现有性格投递链路.md`（既有结论复用与失效订正，见 §7）
- `docs/research/INDEX.md`（索引约定；本次未更新）
- `AGENTS.md`（工作区指令本身，本次被加载的一份实例）
