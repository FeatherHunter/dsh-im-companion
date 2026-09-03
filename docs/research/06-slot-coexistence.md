# 06 · 槽位共存调研：为什么 conversation.session 会撞车、以后怎么避

> 状态：research（只读，不改产品代码） · 日期：2026-09-03 · 仓库：dsh-im-companion
> 关联票：E4 issue #15 · 事故：welcome-banner 注册 conversation.session 导致 DSH 无法启动（对方 agent 已热修复：FEATURES 注释掉 + manifest slots 置空）
> 一手资料：app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js（槽位声明 15810-15919、渲染 13937-14427）、@deepseek-ai/dsh-client-ui-slots/lib/index.js（SlotCore 注册语义）

## 1. 根因（两条，缺一不可）

R1. conversation.session 是 single-kind 独占槽（client.js:15814-15817，scope session）。
同一 priority 只允许一个 occupant；第二个同 priority 注册直接 throw（slots/index.js register single 分支）。
报错里的 registered by Ec 就是先占者—— dsh-im-companion 先注册了 priority 0，
随后宿主自己的默认 occupant（ConversationSession，见 15884-15895）注册同 priority 抛错，
整个 conversation UI entry 加载失败 → DSH 起不来。不是“我没画出来”，是“我把宿主挤死了”。

R2. try/catch 防不住，因为注册回调是延迟执行的。
写法 slots.inject(name, () => slots.register(...)) 中回调并不在 apply 当场跑，
而是宿主渲染到该槽位时才调用（slots/index.js StaleAuthorizationError 语义可证：binding 可被 retain、事后调用）。
throw 发生在宿主渲染栈里，落在我方 try/catch 的时间窗口之外 → 启动期 fatal。
结论：对 single 槽，“小心注册”是不存在的，只有“不碰”才是安全的。

## 2. 槽位种类地图（client.js:15814-15911，全量）

SINGLE（独占， additive 功能禁入）：conversation.session、conversation.session.header、
conversation.composer.bar、conversation.hero.brand.mark、conversation.hero.workspace、
conversation.hero.agentPreset。

LIST（可共存，unique id + order 排序）：conversation.input.overlay、conversation.input.dock、
conversation.composer.dock、conversation.input.left、conversation.input.right、
conversation.session.header.actions、conversation.session.header.utilities（B3 已验证）、
conversation.view（挂在 conversation.session 条目下）。

CHAIN（接管语义，要 select，禁入）：conversation.composer。

关键细节：blank/hero 期 ConversationSession 直接 return null（14419），
conversation.view 只在非空会话渲染（14419-14427）—— hero 期 scroll 区内没有任何 list 内容槽。
header.utilities 能收到 sessionId 是 scope 注入（B3 取证），不是内联 props。

## 3. 候选 mounting 方案对比

| 方案 | 冲突面 | 结论 |
| --- | --- | --- |
| C1. single 槽换 priority | priority<0 会 shadow 掉宿主默认聊天区（抢 affirmativeắt hostile）；>0 永不渲染 | 否决（反模式归档） |
| C2. chain 槽带 select | 接管 composer， hostile | 否决 |
| C3. header.utilities 第二条目 | list-kind，可共存，sessionId 已验证；但槽位在 header 行，只装得下 chip，全卡需 overlay/popover（B3 同款），等于再改一次设计锚点 | 备选 |
| C4. DOM 叠加（零槽位） | 零注册 → 数学上不可能与任何槽位 occupant 冲突（现在 + 未来）；稳定锚点 div[data-phase="hero"]（14272，data 属性非哈希类名）+ 标题文案“探索未至之境”/Into the Unknown +“预览版”/Preview 双语三信号；hero 存在 ⟺ 空会话（14185），触发语义免费；MutationObserver + 全信号缺失静默；卸载删节点停观察 | 推荐 |

C4 的唯一代价：拿不到 scope 的 sessionId，工作区身份改走 hero 内工作区 chip 文本匹配
（left-badges 行文本匹配先例；歧义/无匹配一律不渲染，宁可缺席不许错配）。
sessionId 若后续在 DOM/URL 中发现稳定携带位，可再加一层精确匹配（增强，不前置）。

## 4. 对热修复残留的处置建议（未动手，等指令）

对方 agent 的三处未提交修改是“kill-switch”而非解法：index.ts 注释掉整特性、
manifest slots 置空 + 注释声称“由 client/index.ts 手动注入 header.utilities”（该注入并不存在）、
view.ts 改成 slots.inject(SLOT_NAME, () => comp)（inject 要的是注册闭包不是组件工厂，
调了等于没调——特性现已双重死亡，DSH 能启动纯粹因为 E4 没跑）。
建议：C4 实现合入时整体 revert 这三处（git checkout -- 那三个文件，再在新方案上改），
不要在这版残留上续写，否则注释与行为对不上会烂掉。

## 5. 给全仓的规则增补（建议进 contract §3 或军规）

- single/chain 槽位是宿主保留地：伴生功能只许进 list-kind（unique id），违者启动期连带宿主一起死，
  且 try/catch 因延迟执行兜不住。
- 新槽位使用前必须先读 bundle 声明（kind/scope/props 三件套），把行号写进代码注释（本次：15814-15911）。
- 冲突面排序：零注册 DOM 叠加 > list-kind 条目 > 一切碰 single/chain 的想法。
