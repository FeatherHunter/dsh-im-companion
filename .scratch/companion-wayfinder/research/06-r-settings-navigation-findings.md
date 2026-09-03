# 06-R 设置面板导航能力研究：有无一键打开并定位到指定节

一句话 verdict：没有——设置壳把 open 与 activeId 做成组件内 useState，不经 URL/hash、store、事件、服务或命令对外暴露；第三方浏览器插件够不到打开设置面板并选中某节的一手能力，唯一能调 openSection(id) 的是挂载条件苛刻的 settings.onboarding 引导步骤。

方法说明：只认一手源码，包根为 D:/0Tools/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/。下文每条结论后标注包路径+行号。未改任何源码，只读 glob/grep/read。

---

## 1. 设置页各节/tab 选中机制：纯内部 state，第三方不可写

Verdict：内部 useState，无 URL/hash/store/事件对外可写。

- 壳文档自述状态归属：
  - dsh-client-ui-settings-general/lib/client.js:60-70 —— Modal open state and the active section id are component-local viewing state（设置 shell 根注释，明确 open state 与 active section id 是组件局部 viewing state）。
- 状态定义与读写闭环（全部在 SettingsRoot 闭包内）：
  - dsh-client-ui-settings-general/lib/client.js:205-217 —— const [open,setOpen]=useState(false)、const [activeId,setActiveId]=useState(void 0)；close 同时 setOpen(false)+setActiveId(void 0)；openSection(id) 同时 setActiveId(id)+setOpen(true)，但该回调不导出、不进 store。
  - dsh-client-ui-settings-general/lib/client.js:126-127 —— SettingsPanel 内 active = rows.find(r=>r.id===activeId) ?? rows[0]，无 id 时回退首行，无外部输入。
  - dsh-client-ui-settings-general/lib/client.js:162-168 —— 左侧导航 onClick 进 onSelect(row.id)，onSelect 即 setActiveId（见 243-249 传参），纯内部点击。
  - dsh-client-ui-settings-general/lib/client.js:193-194 —— 内容列 renderSlot(settings.section, 仅含 close, only:active)；传给分区的 ownerProps 只有 close，没有 openSection/setActiveId。
- 导航数据源是账本投影，不是可写路由：
  - dsh-client-ui-settings-general/lib/client.js:525-549 —— shellInjected 用 ctx.slots.getVersion(settings.section)+entries 拼 rows(id,order,label)，经 resolveSlotLabel 解析 label thunk；只是读账本。
  - dsh-client-ui-settings-general/README.zh.md:54 —— 导航是 settings.section 账本的投影。
  - dsh-cordis-client-runner/lib/client.js:3627-3631 —— settings.section doc：Registrant options carry the nav identity: id (section key, drives only filtering), order, label。
  - dsh-cordis-client-runner/lib/client.js:3652 —— ownerProps 注释：The shell owns modal visibility and navigation; close is the one shell affordance a section receives。
- 无 URL/hash 驱动：
  - 全仓 grep location.hash 得 0；grep window.location 得 3，仅目录选择器读问号参数 dsh-desktop-platform（dsh-client-ui-directory-picker-browse/lib/client.js:1068,1073）与 tmux 描述；grep useHash/router/history.push 无设置相关。
- 无 store/事件驱动：
  - grep settings 在 dsh-client-ui-renderer 得 0；在 dsh-client-store 得 0；在 dsh-client-ui-workspace 得 0。
  - dsh-cordis-client-runner/lib/client.js:1551-1594 EVENT_API 仅四项 connection/reset、locale/change、slots/changed、theme/change，无 settings/open 类事件。
  - dsh-client-ui-sidebar/README.zh.md:50 —— 这里没有插件 store；侧边栏只透 wide。

不可行示例（第三方想写也无处写）：ctx.get(settings) 无此服务；ctx.slots.entries(settings.section) 只能读账本不能改壳 useState；写 location.hash 壳不订阅，无效果。

---

## 2. 有无 navigation/router 类浏览器服务可供插件调用打开设置页？

Verdict：没有。浏览器侧服务目录共 8 项，无 router/settings-navigation。

服务目录全文（dsh-cordis-client-runner/lib/client.js:1113-1550 SERVICE_API，按 key 排序）：

- layout（:1116-1135）：toggleSidebar/openDetails/closeDetails，仅侧边栏/详情列，无设置。summary 见 :1117-1118 The outward layout face: the panel transitions other plugins may trigger。
- locale（:1138-1231）：getLocale/setLocale/addLanguage/register/bind，仅语言字典。
- sessions（:1234-1314）：open/openSubagent/setSubagentCatalogOpen/refreshSubagents/search/fork/scope/binding，会话导航非设置导航。open 见 :1239 Select a session as current。
- slots（:1317-1337）：register/inject，注册面无打开语义。
- theme（:1339-1388）：getTheme/setTheme/setFontSize/register/overrideTokens，外观偏好无面板控制。setTheme 见 :1351。
- timer（:1389-1423）：timeout/interval/throttle/debounce，计时器。
- uiWorkspace（:1426-1485）：connectWorkspace/startSession/archiveSession/pickDirectory/listDirectory/createDirectory，工作区/目录无设置。startSession 见 :1441。
- workspaces（:1488-1548）：create/rename/delete/archiveSession/insertSessionBefore，工作区 CRUD。

- grep router 全仓得 7，均为模型侧 inspect 注册表跨页路由器（dsh-cordis-host-runner/lib/index.js:715）与 composer takeover router（dsh-client-ui-user-questions/lib/client.js:439），无浏览器设置路由器。
- 不可行原因：目录里根本没有 settings.open/openSection/showSettings 方法；ctx.get 读不到即 undefined，直接属性访问还会触发守卫报错（见第 6 节）。

---

## 3. 命令面板有无打开设置命令可被插件触发？

Verdict：没有命令面板概念；斜杠命令系统里也没有设置命令。

- grep settings 在 dsh-commands 得 0；在 dsh-client-ui-commands 得 0。
- dsh-client-ui-commands 不是命令面板，是 composer 内斜杠命令表面：dsh-client-ui-commands/README.zh.md:12 在 composer 中键入斜杠命令会打开匹配的表面；业务包经 ctx.commandUi 贡献 popupSelect（/model、/permission）或装饰既有宿主命令。
- dsh-client-ui-commands/lib/client.js:506,527-528,789 唯一 wire 通道是 remote.commands.list/execute，无打开设置宿主命令。
- grep palette 全仓得 16，全是颜色 palette（logger ANSI、theme palettes），无 command palette；grep keybinding 得 0；grep shortcut 得 3，仅折叠 shortcut 与 vendor 文本，无快捷键系统。
- 不可行原因：不存在可枚举可触发的打开设置命令 id；即使将来出现宿主命令，浏览器插件也只能走 remote.commands.execute(sessionId,line) 发起会话内执行，不等同于在 Header 浮层点按钮即开设置面板。

---

## 4. 官方插件有无从别处链入设置页的先例？

Verdict：没有。官方只贡献节，不从别处打开节；唯一 openSection 形参只喂给引导步骤，且现网两个步骤都没调用它。

- 四个官方节注册（都是添一页，不是跳过去）：
  - dsh-client-ui-settings-general/lib/client.js:616-626 —— name settings.section id general order 0。
  - dsh-client-ui-settings-models/lib/client.js:2843-2848 —— name settings.section id models order 10。
  - dsh-client-ui-settings-plugins/lib/client.js:1779-1790 —— name settings.section id plugins order 15。
  - dsh-client-ui-agent-preset/lib/client.js:1756-1763 —— name settings.section id agent-presets order 20，label 经 locale 绑定。
- openSection 定义与唯一投递点：
  - dsh-client-ui-settings-general/lib/client.js:214-217 —— 定义 openSection。
  - dsh-client-ui-settings-general/lib/client.js:250-256 —— 仅投给 renderSlot(settings.onboarding, 含 stepId/complete/openSection, only:onboardingStep.id)。
  - grep openSection 全仓得 5：除上两处与两处类型声明（runner :3532 onboarding props，:3652 section 注释），无外部调用点。
- 现网两个 onboarding occupant 行为（dsh-cordis-client-runner/lib/client.js:3544）：
  - dsh-client-ui-settings-models/lib/client.js:2267-2276 DeepSeekOnboardingDialog —— 就绪即 complete()，否则渲染自有 OnboardingModal，从不调 openSection。
  - dsh-client-ui-settings-models/lib/client.js:2350-2358 WelcomeNotice —— 确认即 complete()/finish()，从不调 openSection。
- 节内部只有离开设置的先例，没有进入设置的先例：dsh-client-ui-agent-preset/lib/client.js:1227-1235 创建器按钮 props.startCreatorDraft 后 props.close()（开完创建器即关设置面板）。
- 官方给第三方的指引也是注册节而非打开节：dsh-agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md:267-271 A full settings UI should usually register its own section through settings.section；Dynamic Plugins Register the UI in the appropriate settings Slot。

---

## 5. 左下角设置按钮本身调的是什么？

Verdict：调壳内 setOpen(true)，与第三方无关的本地闭包。

调用链四跳，均在壳内：
1) 侧边栏只留座不持状态：dsh-client-ui-sidebar/lib/client.js:247-250 renderSlot(sidebar.settings, wide)；:316-319 声明 sidebar.settings single slot；dsh-cordis-client-runner/lib/client.js:3857-3875 doc: sidebar passes only its column state, holds no settings state，occupant 为 SettingsRoot。
2) 壳占座并声明子 slot：dsh-client-ui-settings-general/lib/client.js:567-596 ctx.slots.inject(sidebar.settings, register 含 settings.trigger/header/action/close/section/onboarding, SettingsRoot)。
3) 按钮本体只是 setOpen(true)：dsh-client-ui-settings-general/lib/client.js:232-242 button aria-haspopup dialog aria-expanded open onClick setOpen(true)，内嵌 renderSlot(settings.trigger, wide)；dsh-cordis-client-runner/lib/client.js:3675-3679 settings.trigger doc: The shell renders the button chrome and owns open state。
4) 面板挂载条件即 open 与：dsh-client-ui-settings-general/lib/client.js:243-249 open 才渲染 SettingsPanel；关闭路径为 header 按钮/mask 点击/Escape（:122-137,:182-191）。

最小调用示例（壳内有效、第三方拿不到）：壳内 button onClick setOpen(true)；第三方包里 setOpen 不在任何 inject/store/props 里。

---

## 6. cordis-client-runner 给浏览器插件的服务目录全文

Verdict：白名单制；ctx.get(name) 可选查找，ctx.name 直接访问需 inject 声明；目录见第 2 节表，无设置导航服务。

- 白名单声明：dsh-cordis-client-runner/lib/client.js:191-203 The browser twin of the tool-cordis context facade: whitelist of lifecycle-safe verbs plus optional ctx.get lookup and declared-service property access。
- 动词白名单：:204-216 CTX_VERBS 含 effect/on/once/provide/timeout/interval/setTimeout/setInterval/throttle/debounce。
- facade 规则：:311-323 ctx.get(name) performs optional lookup; direct ctx.serviceName access is gated by fiber inject declaration。未声明读有名服务即 rejectGuard 并提示 inject 写法；连 get 都读不到则报 dynamic ctx does not expose。
- 实现：:325-348 readService，get 走 requireDeclaration=false，属性访问走 requireDeclaration=true；slots/theme 有专属守卫代理（:250-309）。
- Runner 包自身声明示例：dsh-cordis-client-runner/package.json:32-41 dsh.client.inject 含 renderer/api-remotes/modules/theme。
- 第三方白名单内最小示例：return 对象含 inject  slots，按需加 locale/theme/timer/sessions/layout/uiWorkspace/workspaces；apply 内用 ctx.get(slots) 可选查找，用 ctx.slots.inject(shell.overlay) 注册浮层；直接读未声明服务会进 rejectGuard。
- 不可行示例：inject 仅 slots 时读 ctx.settings.openSection 会报 service settings is not declared 或 dynamic ctx does not expose settings（同 :322-323）。

---

## 已知线索复核

- openSettingsDocument 是开设置文件不是开设置页：dsh-api-settings-controller/lib/index.js:487-512 prepareDocument 取 provider 本地文档路径再 openTextFile 交原生编辑器，返回 opened:true；dsh-api-settings-controller/README.zh.md:32；dsh-client-ui-settings-general/README.zh.md:58 在 loopback 页面上调用无路径参数且经浏览器认证的 settings/openSettingsDocument Remote；dsh-client-ui-settings-general/lib/client.js:430 this.remote.settings.openSettingsDocument()；dsh-client-connection/lib/client.js:4306 case settings/openSettingsDocument。
- facade 规则复核通过：见第 6 节 :311-323，与线索 ctx.get 可选查找、直接属性访问需 inject 声明一致。
- 搜 openSettings/showSettings/gotoSettings/navigateTo/activeSection/selectedSection/router 只找到 host 侧 openSettingsDocument 的线索属实：showSettings/gotoSettings/selectedSection 得 0；navigateTo 仅聊天 turn 导航（dsh-client-ui-chat/lib/client.js:2181）；activeSection 仅 trajectory（dsh-client-ui-trajectory/lib/client.js:5083,5394）。

---

## 去设置按钮的推荐做法：三选一

推荐：静态指引（不做直达，不放弃按钮）。

为什么不选直达：
- 一手能力缺失（第 1/2/5 节）：open/activeId 闭包内，服务目录无入口，命令面板无命令，官方无先例。任何直达都得走非一手 hack：DOM 合成点击左下角按钮跨 rail 状态与混淆类名不可控且违反解耦九律禁越权 DOM；抢 settings.onboarding 骗取 openSection 仅当 useSessions 为 ready 且 current 为空时才挂载（dsh-client-ui-settings-general/lib/client.js:220），正常有会话时恒为 undefined，为跳设置而造空会话是产品级破坏；发 slots/changed 或伪造注册只能改账本改不了壳 useState。
- 代价：脆弱、随时被壳重构打断、评审必挂。

为什么不选放弃：
- dsh-im-companion 的 Header 浮层天然需要低摩擦配置出口（加法座 shell.overlay 见 runner :3699-3703）；直接拿掉按钮等于把用户推回自己找左下角齿轮，发现率与转化率双输，而成本只是一个静态文案按钮。

静态指引怎么做（代价最小、可评审、可移除）：
1) 按钮保留在 shell.overlay 浮层内，文案写死操作路径，不调任何设置壳 API，例如：左下角齿轮设置 → 插件 → 找到 dsh-im-companion。
2) 如需可配置项，优先走官方加法座：小偏好进 settings.general.item，整页进 settings.section（仿 agent-preset:1756-1763 三行注册 id/order/label+inject），让用户按正常路径进设置即能看到，而不是从 Header 跳过去。
3) 如坚持点一下少找一步，最多加次级按钮复制设置路径文本，不做自动跳转；待官方未来暴露 settings.open/openSection 服务后再把静态指引替换为直达（届时以 SERVICE_API 新增 key 与 SettingsSectionOwnerProps 新增字段为升级信号）。
4) 验证口径：截图证明浮层按钮只做静态文案、无 DOM 查询、无 onboarding 注册、无新增 host RPC；stash 掉该浮层后 npm run check 仍绿。

---
研究员注：本报告所有行号取自解包后 lib 构建产物加 README.zh.md（构建产物含 sourcemap 注释，源路径如 packages/client/ui-settings/src/client/contract/slots.ts:54 仅作溯源参考，行号以 lib 为准）。