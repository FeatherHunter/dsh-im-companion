# Handoff — dsh-im-companion · 黑屏根治 + A1 真数据全链路自验（第二轮）

> 交接给下一会话：本会话已**从第一性原理根治黑屏**（React 组件形态错配），并修复 A1 真数据链路两处 bug（RPC 信封/signal 传参），用**真实 ReactDOM + DSH 同源 React** 完成渲染级自验（ALL PASS）。下一 Agent 接手可无缝继续 A1 重构（Agent 为核心）。

**生成时间**: 2026-09-02（本会话）
**工作区**: `D:\dsh-plugin\dsh-im-companion` (`dsh-im-companion`)
**Profile**: `desktop`（`C:\Users\辰辰洋洋\.dsh\profiles\desktop`，`dsh-im-companion: link:D:/dsh-plugin/dsh-im-companion`）
**当前哈希**: `D3B2A0BDCBD3A381DB65FA81F9858FC86D631CCD`（`lib/client.js`，`node --check` 0，14/14 ALL PASS）
* **页面形态变更**：用户要求只显示 A1 —— `FleetPanel` 已重写为纯 A1 单卡（hero + A1 以Agent为核心 + 新建Agent + 按Agent/渠道/工作区切换），B1~E4/10项清单/实时统计全部移除；本地壳 localStorage `af-fleet-agents` + 真数据九渠道合并显示
* **截图审查修复（第二轮）**：① `.af-btn/.af-tab/.af-chip` 补显式 `color:#1f2329`（DSH 深色主题按钮默认白字 → 之前"按渠道/按工作区"胶囊与"选择目录/打开工作区"按钮文字隐形）、输入框补 `background:#fff;color:#1f2329`（原黑底白字）；② Agent 昵称表 `af-fleet-names`（目录名→昵称）+ 卡上 `✎ 改名` 按钮 + 头像首字母大写——解决"①人=②家=目录名"（dsh-im 真数据 `normalizeBot` 无昵称字段，`bot.name` 恒为"飞书机器人"）；③ 按钮文案去重：`① 选家 / ② 添加接入 / 打开工作区`（原"绑定入口"与 chip"＋添加接入"语义重复）

---

## 1. 黑屏根因（决定性证据链）

* 用户反馈：DSH 重启后**左上角闪过黄色条** —— 黄条即 `apply` 首行探针 `[dsh-im-companion] apply ok`，证 **apply 执行成功**（此前怀疑"未加载"被排除）。
* 第一性原理排查 `dsh-client-ui-renderer`（`D:\0Tools\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\dsh-client-ui-renderer\lib\client.js`）：
  * `renderEntry(slotKey, Comp, ...)` → `jsx(Comp, {...})`（`react_jsx_runtime.jsx`）—— **Comp 必须是 React 组件**，渲染器以 `React.createElement(Comp)` 调用。
  * 对比 `dsh-im`：`plugin-src/client/index.js` 注册 `IMSettingsTab`（React 函数组件，返回 React 元素）。
  * 我方旧代码：`FleetSettingsTab() => FleetPanel()`，`FleetPanel` 返回**裸 `HTMLElement`**（自定义 `h()` 建 DOM）→ React 抛 `Objects are not valid as a React child` → slot 边界 `reportEntryError/abdicate` → 内容区空 → **黑屏**；侧栏 label 仅读字符串不渲染组件，故能亮。`FleetPanel` 内部 try/catch 捕不到（错误在 reconciler 层）。

## 2. 黑屏修复（已落地 `lib/client.js`）

* `module.exports.inject = ['slots', 'connection']` 后新增：
  ```js
  var React = null;
  try { React = require('react'); } catch (e) { console.error(...); try { React = window.React; } catch (e2) {} }
  ```
  （与 dsh-im 产物 `require("react")` 同模式；ModuleLoader require 可解析 react。）
* `FleetSettingsTab` 重写为 **React 外壳**：`useRef` 容器 + `useEffect` 内 `mount.appendChild(FleetPanel())`（`mount.innerHTML=''` 防重挂），错误时渲染红框而非黑；返回 `React.createElement('div', {ref, style:{background:'#fff',minHeight:'400px',padding:'8px'}})`。所有既有 `h()` DOM 构建逻辑**零改动**。

## 3. A1 真数据链路两处 bug（源码级确认）

* **① signal 传参错**：`ctx.connection.rpc.call('/'+ch, 'connection.status', {}, {signal: AbortSignal.timeout(5000)})` —— 从 `dsh-client-connection/lib/client.js: createWebConnectionRpc` 确认签名 `call(channel, endpoint, payload, signal)`，第 4 参是 **AbortSignal 本身**，不是 `{signal}`。已改为 `AbortSignal.timeout(5000)`。
* **② 信封未解包**：RPC 返回 `{ok:true, value}|{ok:false,error}`（`parseConnectionResponse` → `full.result`；`dsh-im` 用 `unwrapRpcResult(result).value` 取数据）。旧代码直接读 `res.bots` 永远为空 → 永远"暂无 Bot"。已加兼容解包：
  ```js
  const res = raw && raw.ok === true && raw.value !== undefined ? raw.value : raw;
  if (res && res.ok === false) return [];
  ```
* 渠道路径 `feishu/weixin/qq/slack/telegram/discord/whatsapp/dingtalk/wecom` 与 `dsh-im` `CHANNELS` 一致；未配置渠道返回 `{ok:false}` 被降级为空数组（正确）。

## 4. 渲染级自验（新基建，可复用）

* 新增 `.scratch/verify/dom-shim.mjs`（最小 DOM shim：El/TextNode/CommentNode/ClassList/createDocument）与 `.scratch/verify/render-client.mjs`（真实链路验证器）：
  * `vm` 加载 `lib/client.js` 的 `__ModuleLoader__` 工厂，`require` 映射到 **DSH 同源真实 `react`/`react-dom/client`**（`D:\0Tools\DSH Desktop\resources\app.asar.unpacked\node_modules`）。
  * fake `ctx`（slots.register 捕获注册 / connection.rpc.call 返回真实信封 + 3 bot 样例 / 其余渠道 `{ok:false}`）。
  * `ReactDOM.createRoot(container).render(React.createElement(registered.Comp))` → 断言 DOM 文本。
* 结果：**ALL PASS（12 项）**——hero/A1/B1/C1/E4/checklist/白底容器/`3 个 Bot`/`按Agent (2)`/`xiaoshuai`/`xinghuo`/在线离线。
* 复跑：`node D:\dsh-plugin\dsh-im-companion\.scratch\verify\render-client.mjs`（退出码 0/1）。
* ⚠️ 环境要求：Node 需能读 `D:\0Tools\DSH Desktop\resources\app.asar.unpacked\node_modules`；`globalThis.window/document` 需在 require react-dom 前注入（已处理）；`globalThis.navigator` 只读已 try/catch。

## 5. 当前状态（Where）

* `lib/client.js` 35.8k+，哈希 `F623F891...`（三端一致：工作区 = desktop profile junction = `dsh-im-companion` link 目标，`same: True`）。
* 真机侧：用户已有黄条（apply 生效），**新代码需 DSH Desktop 完全退出重开 + `Ctrl+F5` 后验证主面板白卡**（React 外壳修复需 client bundle 重载）。
* 主面板预期：白底 + hero + 左侧 checklist/统计、右侧 A1（按Agent (n) 真数据）+ B1/B2/B3/C1/D1/E1/E2/E3/E4 全卡。

## 6. 下一卡（依据两份 handoff）

* **A1 重构为"以 Agent 为核心"**（`C:\Users\辰辰洋洋\AppData\Local\Temp\dsh-im-companion-A1-handoff-2026-09-02.md` + `.scratch\companion-wayfinder\issues\06-p-tri-capsules.md`）：
  1. `+ 新建 Agent` 输入"小帅" → 仅外挂 `fleet.json` 建壳 `{name, workspace:待选, botIds:[]}`；
  2. 选家：目录选择器（`ws.pickDirectory` / `ctx.workspaces`，参考 `dsh-im` `WorkspaceDirectoryPickerContext` + `plugin-src/client/workspace-editor.js`）；
  3. 挂接入：卡内抽屉 `provision.begin`（二维码 `qrCodeDataUrl` + 倒计时，复刻 `feishu/index.js QrPane`）/ `bot.bind-credentials` → 自动 `bot.workspace.set {botId, workspace}`。
  * 落点仍 `settings.section order 22` 首卡，蓝框高亮；`按渠道/按工作区` 弱化为次入口。
  * 参考 `handoff-preview.html`（新 A1 视觉已定版）。
* 当前 `lib/client.js` 的 A1 是"三 Tab 平权真数据版"（本会话已让它白屏+真数据可验），**重构前请先让用户真机验收本版**（一次一卡节奏）。

## 7. 已知坑

* `settings.section` 组件**必须返回 React 元素**（裸 DOM 返回 = 黑屏，见 §1）；DOM 构建可经 React 外壳挂载。
* RPC 必须 `{ok:true,value}` 解包；signal 直接传 AbortSignal；`AbortSignal.timeout(5000)` 在旧浏览器无则降级（当前桌面 Chromium 有）。
* `tools.read` 对超长行截断（2034 字符）——改 CSS 长行用 `Get-Content -Raw` + `[IO.File]::WriteAllText(UTF8NoBOM)`；本次全部用 `edit` 精确替换，未重写全文件。
* 手工改 `lib/client.js` 后必跑 `node --check`。
* `preview.html`（旧三 Tab 版）与 `handoff-preview.html`（新 Agent 核心版）并存；`preview.html` 应随主面板同步更新。

---
*Generated: 2026-09-02 | Workspace: D:\dsh-plugin\dsh-im-companion | Handoff for fresh session — 黑屏根治（React 形态）+ A1 真数据全链路自验*
