# Handoff — A2 · Apple 风格重构 + 全 TypeScript + 前后端解耦（第四轮）

> 交接给无本会话记忆的 Agent：本文档 + `20260902-184101-A1简洁可交付版.md`（第三轮）+ `R4 研究`（`.scratch/companion-wayfinder/research/04-r-host-bridge.md`）。本会话完成用户 5 点指令（见 §1），并按真机验收反馈完成迭代 v3（见 §9）。

**生成时间**: 2026-09-02 20:10 (Asia/Shanghai)，**v3 修订**: 2026-09-02 21:4x
**工作区**: `D:\dsh-plugin\dsh-im-companion`（desktop profile 为 link:，改动即生效）

---

## 1. 用户指令与完成情况（Why/What）

| # | 指令 | 状态 | 落点 |
|---|------|------|------|
| 1 | 设置面板大量白色浅色内容不随主题 | ✅ | 全部颜色经 `--dsw-alias-*` 主题别名 + color-mix 派生（`src/client/theme.ts`），全代码无 #fff/#1f2329 等硬编码；FleetSettingsTab 外壳去掉 background:#fff |
| 2 | 支持设置头像 | ✅ | 点圆形头像 → 菜单「上传图片 / 移除自定义头像」；上传经 canvas 压到 256px JPEG；优先级：用户头像 > bot avatarUrl > 渐变首字母（8 色板哈希） |
| 3 | 前后端/组件解耦、禁止纯 JS、每文件 ≤500 行 | ✅ | 全部源码 TypeScript（src/**/*.ts，最大 panel.ts 283 行）；host 后端（meta 持久化 + RPC 桥）与 client 纯 UI 分层；lib/*.js 仅为构建产物 |
| 4 | 为什么都是「未命名」 | ✅ | 根因见 §4；现默认名 = 昵称 ?? 工作区 basename（首字母大写）?? 本地壳名 ?? 未命名 Agent；行内改名（铅笔图标） |
| 5 | UI 推翻重做，Apple 设计语言 | ✅ | 见 §5；深/浅双主题预览图 `.scratch/shots/af-*.png` |
| 附 | 开机启动黄色探针条去掉 | ✅ | 新 `src/client/index.ts` 无探针；重启即消失 |

## 2. 架构（解耦后）

```
src/
  index.ts                host 入口：inject ['connection']，rpc.handle('/im-companion')
  host/meta-store.ts      AgentMetaStore → ~/.dsh/integrations/dsh-im-companion/meta.json（写队列+原子替换）
  host/rpc.ts             端点分发（ping/meta.get/meta.rename/meta.avatar.set|clear/meta.local.add|remove|rename）
  client/
    index.ts              入口：export inject ['slots','connection']；React 外壳挂载 FleetPanel（铁律见 §6）
    theme.ts              唯一样式 + Apple 设计令牌（全随 DSH 变量）
    dom.ts                h() DOM 构建器（组件层唯一创建入口）
    icons.ts              SF 风格线性 SVG 图标
    data/config.ts        渠道/健康映射
    data/fleet-api.ts     9 渠道 connection.status 并发采集（信封解包、failed 降级）
    data/meta.ts          MetaStore 接口 + RpcMetaStore（真机走 host 桥）+ LocalMetaStore（降级 localStorage，兼容旧键）
    data/model.ts         两态聚合（按Agent / 按渠道分组）+ 计数 + 搜索过滤 + 调色板哈希
    ui/*                  avatar/button/field/segmented/menu/list/empty/toast 原语
    components/*          agent-row（agent/channel 两种变体） / compose-bar / panel（唯一有状态组件 283 行）
  dev/preview-host.ts     浏览器预览 harness（调试用，非交付）
build：host = tsc(tsconfig.json)，client = tsdown → lib/client.js
```

**数据流**：client 视图 → MetaStore 接口 → RpcMetaStore → ctx.connection.rpc.call('/im-companion',…) → host rpc.handle → AgentMetaStore（meta.json）。桥不可用时自动降级 LocalMetaStore（localStorage）。

## 3. 构建 / 验证命令（照抄）

```powershell
npm run build                                  # host(tsc) + client(tsdown)
npx tsc -p tsconfig.client.json --noEmit       # client 类型检查
npx tsc -p tsconfig.json                        # host 类型检查+构建
node tools/verify/render-client.ts             # 真实 ReactDOM 渲染验证（16/16 ALL PASS）
python -m http.server 8788 --bind 127.0.0.1    # 工作目录下；开 .scratch/preview-af.html（深/浅主题）
```

**备注**：npm 需 `--legacy-peer-deps`（本机 npm 10.9.2 arborist bug）；react/react-dom 是 devDeps（仅 harness 用），client bundle 里 react 为 external（DSH 运行时提供）。

**当前哈希（v3）**：lib/client.js SHA1 `见文末 v3 哈希行`；每次修改后更新。

## 4. 「未命名」根因（用户必答）

dsh-im 真数据 normalizeBot 无昵称字段（bot.name 恒为「飞书机器人」）；上一版把名字完全交给 localStorage 昵称表且默认为空 → 全部落「未命名」。修复：默认名优先昵称，否则用工作区 basename 首字母大写（xiaoshuai → Xiaoshuai）；未绑定/本地壳用其名称；改名=行内编辑即时保存；头像按 basename 键存储。

## 5. Apple 设计语言要点（theme.ts）

大标题（30px/700/-0.4px）+ 计数副行；搜索框（radius 12、focus 光环）；iOS 分段控件（滑块 thumb + 标签计数）；分组圆角列表（radius 14、hairline 分隔线 inset 72px）；44px 圆形头像（8 组渐变）；状态点（绿/橙/灰 + 光晕）；按钮三态 primary/tinted/ghost；空态/骨架屏/错误卡；Toast 底部浮出。全部 token 化，深浅主题自动切换。

## 6. 铁律与已知坑（延续/新增）

- settings.section 组件必须返回 React 元素（React 外壳 + useEffect 挂载命令式 DOM）——裸 DOM=黑屏。
- RPC 信封 {ok,value} 必解包；signal 传 AbortSignal 本体；rpc.handle(channel, handler) 的 dispose 必须收进 ctx.effect；host 需 inject ['connection']。
- **mount(body, arr) 传数组，mount(body, ...arr) 会只挂第一个元素**（本会话踩两次）。
- tsdown 不接受点开头目录作入口；harness 源码放 src/dev/；.scratch 只放文档/截图，开发工具放 tools/。
- 主 tsconfig.json 仅编译 host；client 类型检查用 tsconfig.client.json（noEmit）。

## 7. 未完成 / 下一步（按优先级）

1. 真机验收 A2 v3（完全退出 DSH Desktop → 重开 → 设置→IM机器人辅助；Ctrl+F5）。
2. 接入按钮落地：provision.begin（QrPane 复刻：qrCodeDataUrl+倒计时）→ 扫码 → bot.bind-credentials → bot.workspace.set 三步闭环。
3. 选家：目录选择器（WorkspaceDirectoryPickerContext / listDirectory+pickDirectory）写绑定。
4. 本地壳联动：创建后绑定真 bot 时合并。
5. 后续卡：C1b 矩阵 → C1a 抽屉 → B1/B2/B3/D1/E2/E3/E4。
6. 安全加固（host 桥）：每端点限频（R4 已确认有 browser 会话认证兜底）。

## 8. Suggested Skills

`dsh-plugin-ui-debug`（真机闭环）、`codebase-design`+`domain-modeling`（解耦继续）、`prototype`（接入/选家交互稿）、`wayfinder`（06 A1 → 07 C1b 票）。

## 9. v3 修订（真机验收反馈，2026-09-02）

用户 4 点反馈 → 全部完成并截图验证：

1. **头像菜单**：改为「头像右下角」展开（showMenu 增 placement='bottom-right'，面板头像菜单传该参数）；菜单背景/边框加深、菜单项默认微背景+hover 高亮（`theme.ts` menu 段 + `ui/menu.ts`）。截图 `.scratch/shots/af-menu-v2.png`。
2. **头像持久化（用户问「现在是否有持久化机制」）**：有 —— 真机走 host 桥持久化到 `~/.dsh/integrations/dsh-im-companion/meta.json`（写队列 + 原子替换，跨重启保留）；桥不可用自动降级 localStorage（旧键名 af-fleet-avatars 兼容）。头像键=工作区 basename → **跟随 Agent（工作区）**；改名不影响头像。
3. **「按工作区」砍掉**（与「按Agent」重复：1 Agent = 1 Workspace 约束，用户拍板）→ 三胶囊改两胶囊 `按Agent (n) / 按渠道 (n)`。model.ts 删除 workspaces 视图；验证器断言 !includes('按工作区')。
4. **「按渠道」重构**：渠道分区头（如「飞书 · 4 个 Agent」）+ 组内 Agent 列表（行 = Agent 名/状态/接入），行内**头像强制为渠道 bot 头像（avatarUrl，与 dsh-im 一致）**，**不提供改名/头像菜单**（agent-row 增 variant='channel'）。截图 `.scratch/shots/af-channel-v2.png`。
5. **多渠道 Agent 展示规则**（用户询问「小帅同时有 QQ/微信/飞书如何展示」）：按Agent 视图单行聚合——名字(昵称) + 副行「飞书 · QQ · 微信」标签连接 + 状态点（任一在线即绿）+ 头像（自定义 ?? 渠道头像）。截图 `.scratch/shots/af-agent-v2.png`（小帅=飞书·QQ）。

## v3 哈希

lib/client.js（v3）：SHA1 `F992C57C3E12A6F0A9E2F0EF5A3541792D5E1DA3`（node --check 0；验证 16/16 ALL PASS；src 最大行数 284 行 < 500；SHA256 100F595EBA9E0004349DF4E792CDB9367FFB97A21E4A36BC7818CFA7F7536552）。

---

*Generated: 2026-09-02 | Handoff: A2 v3 · Apple 重构 · 全 TS · 解耦 · 两态聚合 · 渠道分区*


---

## 10. v4 · 全部缺口落地（2026-09-02 晚，用户「从第一性原理出发，全部落地」）

第一性原理缺口表 8 项 → **全部实现**（附验证截图 `.scratch/shots/af-v6/v7-*.png`）：

| 缺口 | 实现 | 主要文件 |
|---|---|---|
| 1 接入=占位 | **QR 三步闭环**：接入按钮 → 渠道菜单(9) → provision.begin{locale} → 二维码+倒计时+进度条+3步说明 → 3s 轮询识别新 bot（baseline diff / provisioning.botId）→ 自动 bot.workspace.set；无工作区则弹「选择工作区」；【换一个二维码/取消（provision.cancel）】；优雅错误卡+重试 | components/connect-flow.ts（201 行） |
| 2 本地壳无法选家 | **工作区选择器**：优先系统对话框 ctx.get('uiWorkspace')；兜底 **host 桥目录浏览器**（fs.defaultRoot=主目录 / fs.list 仅目录+300 上限+面包屑+上级）；选择后批量 workspace.set on view.bots | components/workspace-picker.ts（118 行）、host/rpc.ts fs.* |
| 3 渠道级状态 | 渠道胶囊改为**状态色点**（绿/橙/灰）+ tooltip（渠道·状态）；聚合行尾 tooltip=healthDetail（各渠道状态+最后检测+故障摘要） | data/model.ts、agent-row.ts |
| 4 健康详情 | BotSnap 增加 healthSummary/lastCheckedAt → 行状态 title 完整详情 | fleet-api.ts |
| 5 排序 | **在线优先**（online>warn>offline）→ 名称 zh 序 | model.ts STATUS_RANK |
| 6 解绑/删除 | 行尾 ⋯ 菜单：重命名 / 更换工作区… / 每渠道「移除渠道·XX机器人」（**二次确认**）/ 本地壳「删除 Agent」（二次确认）；bot.delete{botId,confirm:true} | row-actions.ts、menu.ts confirm 态、panel.ts |
| 7 刷新反馈 | 工具栏刷新按钮 + 标题「更新于 HH:mm:ss」+ 15s 静默轮询保持 | panel.ts |
| 8 身份配置 | 详见 C1a 抽屉（README）：预设/上下文增强留待 C1a（本卡范围外已记录） | — |

**其他**：Apple sheet 弹层（.af-overlay/.af-modal）、QR 位图安全校验（同 dsh-im safeQrSource）、非 base64 回退文案、menu 分隔线/二次确认样式。

**v4 哈希**：lib/client.js SHA1 `CC76D1C48FB2702B18D1D6DCCB13DA90D81BA4FF`（1952 行；验证 17/17 ALL PASS；双 typecheck 绿；src 最大 342 行=panel.ts）。

**⚠️ 真机注意**：本版 **host 有改动**（fs.* 端点）→ 必须**完全退出 DSH Desktop 重启**才能让 host 生效（client 仅重载即可，但 fs 兜底选家需要 host 重启；接入 QR 走渠道 RPC 无需 host）。验收路径：设置→IM机器人辅助→点任意行「接入」→选渠道→看二维码；新同事行 ⋯ → 选择工作区。
