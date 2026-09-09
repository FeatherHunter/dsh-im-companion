# T3 · 根因 verdict 案卷（research, #75）

> 只读分析，不写实现、不关票。基线：本仓 `master@1d41e4c`；上游 `v4.17.1=464c0a9`（`dsh-im-main` 内全经 `git show`，未 checkout）。
> 输入：T0 #72（版本锚点）/ T1 #73（改道）/ T2 #74（DOM/标题）/ #71“症状扩展与三角定位”评论。

## 1. verdict 陈述：主因 + 贡献划分

**主因：管理 RPC 改道（`503a24a`），贡献 ~100%（数据层断裂）。DOM/标题直接贡献 = 0（已排除），仅余一项待真机裁决的间接风险。**

| 因素 | 贡献 | 证据指针 |
|---|---|---|
| RPC 改道（新传输） | 主因。Host 注册由 `rpc.handle('/feishu'…)` 切到 fetch `POST /api/dsh-im<ch>`；Client 由 `rpc.call('/feishu',…)` 切到 `rpc.call('/api','dsh-im/feishu',{method,payload})`。companion 仍旧直调 → 传输层 reject（立即拒识或 5s 超时，二选一待钉死）→ `fetchBots` 记 `failed` → `mergeStaleBots` 标 `stale warn`；九路全灭 = 满屏“待确认”，把全灭伪装成待确认 | 上游 `v4.17.1:plugin-src/management-rpc.mjs:3-6`（`rpcEndpoint`）、`:41-50`（fetch 注册表强依赖）、`:75-77`（`callManagementRpc`）；`v4.17.1:plugin-src/client/index.js:406-433`（13 个 `*RpcCall` 全经新载体，含新增 wecom-app）；提交 `503a24a`（改道）、`a56dfc0`/`2dd915d`（启动期保留）；本仓 `src/client/data/rpc.ts:5-11`（旧直调薄透传）、`src/client/data/fleet-api.ts:157,170`（旧调用点）、`:167-188`（`failed` 链）、`:229-236`（stale-warn）、`src/client/data/config.ts:38-43`（`healthOf`）、`src/client/data/connection-stream.ts:6`（15s 唯一轮询） |
| DOM/标题抢占 | 直接贡献 0。上游不渲染分组行（`plugin-src` 全 grep `treeitem` 仅 `session-channel-logos.js:22` 一处左栏相关）；装饰分层互斥（上游会话行 SPAN vs 外挂分组行 DIV，属性零重叠）；标题前缀写会话行、外挂匹配分组行（选择器互斥）；observer 单向收敛无环路 | `v4.17.1:plugin-src/client/session-channel-logos.js:22`（ROW）、`:189-192`（observer filter）、全文件 233 行；T2 案卷 `research/t2-dom-title` |
| 三角定位一锤 | #71 用户新报“面板各机器人状态也全异常”：面板与徽标同消费 `connection-stream → fetchBots` 的 `BotSnap`，面板不走左栏 DOM —— DOM 假设解释不了面板，RPC 改道同时解释两面同病 | #71“症状扩展与三角定位”评论；`settings.section` 未改名已排除 slot 分支（T1 §6） |

残余间接风险（非新变量，不推翻 verdict）：若 DSH 本体把会话行嵌套在分组行 DOM 内，组行 `textContent` 会 concat 后代会话标题 → 整组 unbound；但该假设在 4.13 下同样成立，前缀只让 concat 更长。待一次真机组行 `outerHTML` 裁决（见 §4）。

## 2. 精确适配规格（只列清单，不动手）

**新调用形态**（companion 侧目标，与上游 `callManagementRpc` 同构）：
`connection.rpc.call('/api', 'dsh-im/<ch>', { method: 'connection.status', payload: {} }, signal)` —— channel 固定 `'/api'`；endpoint = `'dsh-im'+channel`（如 `'/feishu'`→`'dsh-im/feishu'`，`management-rpc.mjs:3-6,75-77`）；回包仍是 `{ok, value|error}` 信封，`unwrap`（`fleet-api.ts:139-143`）/`extractBots`（`:145-153`）/`snapBot`（`:121-137`）语义兼容，`healthOf`（`config.ts:38-43`）不动。

**旧回退触发条件**：仅“传输缺失”信号回退 —— 未知渠道/方法类 reject 或 `AbortSignal.timeout(5000)`（`fleet-api.ts:58`）触发 abort；业务 `ok:false`（未配置等权威空）绝不回退。会话级记忆首个成功方向，避免每 15s 双打。

**verdict 拍板（比 T1 草案更进一步）**：`extractRpc` 返回的 `RpcCall` 保持旧签名 `(channel='/'+ch, endpoint='connection.status', payload)`，**新/旧翻译收敛在包装器内部**，`fleet-api.ts:157,170` 调用点零改（契约最稳，Added-only 只在 `rpc.ts` 内加分支+方向记忆+错误分类函数）。

**wecom-app 新通道处理**：上游 channel id `'wecom-app'`（`host/channels/wecom-app/index.mjs:13`），`wecomAppRpcCall` 经新载体（`client/index.js`），endpoint `'dsh-im/wecom-app'`；但上游 LABELS/GLYPHS 无覆盖（无 logo 无前缀 —— 上游缺口，只报不跟）。本仓 `CHANNEL_ORDER` 9 项缺 `wecom-app`/`office`（`config.ts:3-5`）：徽标不受影响（按 workspace 聚合），Fleet 缺列另票，不 blocking。

**要动的文件清单**：
1. `src/client/data/rpc.ts`（11 行 → 约 +40 行，必动，唯一注入点）。
2. `src/client/data/config.ts`（可选：`CHANNEL_ORDER` 追加条目，T4 定；`healthOf` 不动）。
3. 不动：`fleet-api.ts`（解包/聚合全保留）、`connection-stream.ts`（不新增轮询）、`left-badges/view.ts`+`styles.ts`（选择器无需加固）。约束：共享层 Added-only、单文件 ≤300 行、样式命名空间不变。

## 3. T4 原型范围

做什么：`rpc.ts` 双传输分支原型（新载体优先 + 旧回退 + 会话级方向记忆）+ 可选 `CHANNEL_ORDER` 追加；DOM/样式零动；不新增轮询（复用 15s 唯一轮询）。
怎么验：`lib/` 重打 → 双 profile（desktop+web）hash 一致 → Ctrl+F5/热重载 → 9 渠道抽查（行尾“在线”恢复、悬停“最后检测时间”更新）→ 面板+左栏同框截图 → hash 证据链。验证 2 轮：新传输正向轮 + 旧环境回退轮（无旧 DSH 环境则回退轮降级为单测/走读）。

## 4. 残余风险 + 活体落盘诊断建议

残余：(a) 旧直调无路由时 DSH 原生错误字面未钉死（立即 reject vs 5s 超时）；(b) 组行 `outerHTML` 未真机裁决；(c) `wecom-app`/`office` 列缺口；(d) 全灭 warn 伪装（徽标层加“传输中断”提示 vs 不动 —— 动 `stale→warn` 会破坏 B1 不谎报离线契约，T5 定）。
**建议做一次活体落盘诊断（leader 定）**：host 磁盘落盘 JSON（新/旧两种打法的 raw envelope 与失败字面、`extractBots` 长度、`health.status` 分布、`updatedAt`/hasSnap、rows/decorated 计数）+ web 同框截图（面板+左栏）。一次落盘同时钉死 (a)(b) 与波及面（Header/悬浮卡是否同病）；禁控制台，用户只做刷新+截图。低成本高收益，建议做。

## 5. 工作量估计

生产改动行数级：`rpc.ts` 约 +40 行，`config.ts` 可选 +2 行，合计 <60 行。验证轮次：2 轮真机（新正向 + 旧回退）+ 1 张同框截图 + hash 证据。T4 原型半天级（含热重载验证）。
