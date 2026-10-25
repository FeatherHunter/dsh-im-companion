<!-- DSH-IDEMPOTENCY-KEY: wayfinder-map-assistant-persona-2026-10-22 -->

## Destination
本 effort 的终点＝一份可直接开工的实施规格：让「助理描述（简介）」与「人物设定（人设）」成为助理身份的一部分，跟随 assistant id 跨工作区、跨机器人绑定迁移；不依赖工作区 AGENTS.md，也不把真源留在任何一台机器人上。规格必须写清：

- **真源与字段**：homes.yaml 助理行新增 description（简介）与 persona（人物设定，上限 8000 字符）；随 assistant id 天然跨工作区；删除助理时随行删除；解绑/重绑/搬 home 都保留。
- **投递面**：companion 宿主侧自行注册 DSH systemPrompt 注入面，不写上游 bot 配置；必须后置 `ctx.inject(['systemPrompt'])`。T1 取证后落点待 T4 拍板：`context`（user 角色运行时快照，中档、带快照历史）还是 `section`（系统提示词正文，强档）。
- **归属识别**：读 <DSH_HOME>/integrations/dsh-<channel>/{bots|accounts}/<botId>/state.json 的 sessions 表反查 sessionId→(channel,botId)；微信在 accounts/；查不到返回空（不注入），不猜测；mtime+size 缓存 + 短 TTL + 异常吞掉。
- **生效语义**：改完下一次消息即生效；群聊＋私聊；无开关，人设空＝不注入；旧快照留在会话历史，新快照即最新覆盖。
- **UI**（T5 已拍板）：创建助理时可填（可跳过）；唯一编辑口＝助理列表行第 4 个图标「编辑简介与人物设定」小弹窗；家页助理卡第三行显示简介（空则隐藏）；详情面板只读人设块＋编辑跳转；旧「性格/语气」编辑退役并由同一份人设取代。
- **验收**：源文本级 verify 硬门禁＋真机飞书群/私聊行为级＋UI 全链路；关键日志全走 dsh-log。

规格不含业务实现；实现另起 effort。

## Notes
- 上游基线：dsh-im 5.1.0（C:/Users/辰辰洋洋/.dsh/profiles/desktop/node_modules/@xmanrui/dsh-im）；DSH asar 在 D:/DeepseekHarness/resources/app.asar；DSH_HOME=C:/Users/辰辰洋洋/.dsh；本仓当前版本 0.2.19。
- **硬约束 1（owner）**：dsh-im 5.1.0 一行不改（无权限修改上游包），所有修复只落本仓。
- **硬约束 2（owner）**：本需求所有细节的关键日志都通过 dsh-log 打印全面（解析命中/未命中、读盘失败、换绑同步、注入文本指纹），禁止要求用户开控制台。
- 旧「性格/语气」真相：guidance 在 5.1.0 上读写双坏是本仓客户端发/读旧扁平四键（src/features/detail-drawer/actions.ts、src/client/data/fleet-api.ts），上游正确拒收；正确动作是退役旧代码，不是改上游。本机从未写过 contextEnhancement，无存量数据迁移。
- 规划输入与三份研究交付（docs/research，INDEX G 段已登记）：
  - docs/research/取证-助理人设载体-dsh-im上下文增强与机器人级身份表.md
  - docs/research/取证-助理人设载体-DSH原生指令加载与注入点.md
  - docs/research/盘点-助理身份数据模型与现有性格投递链路.md
  - docs/research/取证-companion-systemPrompt注入面.md（#161 T1）
  - docs/research/取证-会话归属识别-dsh-im落盘映射.md（#162 T2）
  - docs/research/盘点-人设字段落点-账本RPC与创建链路.md（#163 T3）
- 三票研究关键结论（2026-10-22 全部关闭）：
  - T1：加 systemPrompt 零声明改动，但必须后置 `ctx.inject`（模块级 inject 会让插件在无该服务宿主上静默变哑）；注册落 global 层、preset agent 可见；dsh-im 占 order 115/125，用 order 126 + `dsh-im-companion:` 前缀；`text` 同步执行、每 step 约 2 次、必须 try/catch 且只返回 string；`interpolate:false` 防 `{{}}` 打断；**`context` 产 user 角色快照、`section` 才是系统提示词正文**。
  - T2：归属唯一真源是 state.json 的 sessions 表（weixin 在 accounts/，本仓 src/host/routes.ts:32-39 只拼 bots/ 是缺口）；rpcId/标题前缀/cwd/agentPreset/session-created 只到渠道级；读取用 (path,mtimeMs,size) 缓存戳、负结果 TTL≤2s、全程 fail-soft；`/clear` 不清绑定；宿主 node:fs 直读 DSH_HOME 不受沙箱拦。
  - T3：存储层几乎免费、写入通道才是成本；cleanAssistant/seedDocs 白名单、updateAssistantRow 的 name/avatar 闸、assistant.update 挑键等 7 个宿主单点必须同步放宽；接入流程填人设今天零入口；抽屉缺 asstId；300 行红线需拆 home-seed/home-asst-form/home-ops-assistant。
- 会话归属取证（grilling 期新查）：DSH 会话头是封闭白名单（api-catalog.js:7139），dsh-im 建会话只传 cwd/workspaceId/agentPreset（src/channels/shared/harness-client.mjs:1343-1359），会话本身不含 botId；精确映射只在磁盘 state.json 的 sessions 表（src/channels/feishu/state-store.mjs:79-86），写入先于首条 prompt（src/channels/shared/workspace-session.mjs:122-131）。工作区兜底不安全（同一 bot 可换工作区；小羊 workspace 是通用目录）。
- 非公开依赖（owner 已接受，grilling Q9=1）：① systemPrompt.context 回调里的 assembly.agent.session 不在公开类型（api-catalog.js:4779-4780），但 dsh-im 5.1.0 生产在用（plugin-src/host/injected-context.mjs:72-79）；② 读 dsh-im 私有落盘（bots/accounts 两套目录，无版本承诺）。兜底：查不到返回空、IO 异常吞掉、绝不猜测、升级回归钉子。
- 已定路线（grilling 两轮，2026-10-22，用户已逐项拍板）：终点=实施规格；companion 自注入；homes.yaml 存字段；单一编辑口；只对绑定 bot 的 IM 会话；简介+人设两字段；旧编辑退役；识别失败不注入；下一次消息即生效；创建时也收集；固定外层+名字+正文；空即关；8000 字符；只跟随；三段验收全要；接受两处非公开依赖。

## Plan
- [#161 · T1 · companion 宿主侧 systemPrompt 注入面取证（research）](https://github.com/FeatherHunter/dsh-im-companion/issues/161)（已关闭）
- [#162 · T2 · 会话归属识别的落盘契约取证（research）](https://github.com/FeatherHunter/dsh-im-companion/issues/162)（已关闭）
- [#163 · T3 · 人设字段的账本/RPC/创建链路盘点（research）](https://github.com/FeatherHunter/dsh-im-companion/issues/163)（已关闭）
- [#164 · T4 · 注入契约与日志事件规格（grilling）](https://github.com/FeatherHunter/dsh-im-companion/issues/164)（阻塞已解除）
- [#165 · T5 · UI 交互与旧「性格/语气」退役规格（grilling）](https://github.com/FeatherHunter/dsh-im-companion/issues/165)（已关闭）
- [#166 · T6 · 注入链路最小原型（prototype）](https://github.com/FeatherHunter/dsh-im-companion/issues/166)（阻塞已解除）
- [#167 · T7 · 兼容基线与验收脚手架（task）](https://github.com/FeatherHunter/dsh-im-companion/issues/167)

## Decisions so far
- [T1 · companion 宿主侧 systemPrompt 注入面取证（research）](https://github.com/FeatherHunter/dsh-im-companion/issues/161)：零声明加 systemPrompt，但必须后置 `ctx.inject`（模块级 inject 会让插件静默变哑）；落 global 层、preset agent 可见；order 126 + 前缀与 dsh-im 共存；`text` 同步且永不抛、`interpolate:false`；**`context` 是 user 角色快照、不是系统提示词，人设要进 system 正文须用 `section`**。
- [T2 · 会话归属识别的落盘契约取证（research）](https://github.com/FeatherHunter/dsh-im-companion/issues/162)：归属唯一真源＝state.json 的 sessions 表；weixin 在 accounts/（本仓 routes.ts 只拼 bots/ 是缺口）；其它信号只到渠道级；缓存戳 (path,mtimeMs,size) + 负 TTL≤2s + fail-soft；`/clear` 不清绑定；宿主 node:fs 直读不受沙箱拦。
- [T3 · 人设字段的账本/RPC/创建链路盘点（research）](https://github.com/FeatherHunter/dsh-im-companion/issues/163)：存储层几乎免费、写入通道才是成本；7 个宿主单点必须同步放宽（白名单/闸/挑键）；接入填人设今天零入口；抽屉缺 asstId；300 行红线需拆文件。
- [T4 · 注入契约与日志事件规格（grilling）](https://github.com/FeatherHunter/dsh-im-companion/issues/164)：section单通道order650+前缀global+后置inject；内存表+首条可miss；1:N取mtime最新+warn；模板冻结 hardening4条；verified=5.1.0 range>=5.1.0<6；persona.*五事件，required/快照不适用。

- [T5 · UI 交互与旧「性格/语气」退役规格（grilling）](https://github.com/FeatherHunter/dsh-im-companion/issues/165)：唯一编辑口＝助理列表行第 4 图标「编辑简介与人物设定」小弹窗（简介 ≤200 不进提示词、人物设定 ≤8000）；创建弹窗同表单可跳过；家页卡第三行单行简介（空隐藏）；详情面板加只读人设块＋编辑跳转（新事件 feature→A1，契约先行）；旧「性格/语气」整块删除（读写+verify 一起删）；空值在唯一写盘口剔除（老账本读→写逐字节不变）；保存＝成功才关、失败保留输入；产品用词「详情面板」，模块重命名与面板整体重做另票。

## Not yet specified
- 人设「复制」（从已有助理复制人设）与导出/导入 md（owner 本轮选「只跟随」）。
- 每助理开关或全局静音（owner 选「空即关」，未留开关）。
- 会话手动指定助理（owner 选「不注入」，未做手动绑定）。
- 多机器人挂同一助理（当前模型严格 1:1；若将来放开，归属与注入模板都要重估）。
- 群聊/私聊差异化文案（当前同一条人设两端都注入）。
- 上游若能给 DSH 会话传 botId（或提供 session→bot API），可去掉两处非公开依赖；向下兼容期多长、如何探测。
- 人设模板/预设库（常见人格模板一键套用）。
- 并发编辑冲突与历史版本（谁改了人设、旧版本可否回滚/审计）。
- 一次性迁移工具：把其它工作区 AGENTS.md 里的人设内容导入为 persona。

## Out of scope
- 改 dsh-im 5.1.0 任何代码或向其提交补丁。
- 把人设写进工作区 AGENTS.md/CLAUDE.md。
- 用 agentPreset→dsh-persona 存人设（无写回接口，只影响新 Agent）。
- 修复/复用旧 guidance 编辑链路；写上游 bot 配置。
- 跨机器搬运/导出（本轮只保同一 DSH_HOME 内跟随）。
- 群聊/私聊差异化、多 bot 一键切换、人设市场。
- 详情面板整体重做（T5 owner 拍板：另立设计图，本次不建票）。
- detail-drawer 代码模块/类前缀/verify 文件重命名（T5 owner 拍板另开小任务票；T5 只统一产品用词与 ariра/日志/注释文案）。
- 并发编辑冲突与历史版本、审计回滚（T5 明确本轮不做，挪出 Not yet specified）。
