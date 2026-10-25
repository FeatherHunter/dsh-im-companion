# 盘点 · 人设字段落点：账本 / RPC / 创建链路（T3 #163）

> 任务：wayfinder research #163「T3 · 人设字段的账本/RPC/创建链路盘点」
> 日期：2026-10-22 · 性质：只读取证（唯一写入＝本文件；未改 `src/`、未碰 dsh-im 安装目录、未 git/构建/install、未改 `docs/research/INDEX.md`）
> 基线：本仓 **0.2.19**（`package.json:3`）；上游 **dsh-im 5.1.0**；真机账本 `<DSH_HOME>/integrations/dsh-im-companion/homes.yaml`
> 口径：每条 claim 标 **源码确证** / **实测** / **推断**；行号均指本仓工作区文件（除注明「上游包根」）。真机数据只做聚合，不含名字/token/会话内容。
> 与既有笔记的关系：人设「能不能进提示词」「guidance 真语义」见 `取证-助理人设载体-DSH原生指令加载与注入点.md` 与 `取证-助理人设载体-dsh-im上下文增强与机器人级身份表.md`；数据模型现状见 `盘点-助理身份数据模型与现有性格投递链路.md`。**本文只补「新字段落在哪一行、动哪些单点、旧入口怎么退役」，不重复上述结论。**

## 一句话结论

**存储层几乎免费，写入通道才是成本**：`homes.yaml` 的助理行加 `description`/`persona` 不需要动串行写队列、fail-closed、dirty 守卫或 version（版本号读时被忽略、固定回 2，`src/host/home-store-io.ts:201`），真正要改的是 **7 个宿主单点（结构/清洗/建行/种子/改名/建占位/RPC 挑键）+ 1 个客户端模型 + 3 处写入口**；而 `updateAssistantRow` 的「name/avatar 至少其一」闸（`src/host/home-edit.ts:57`）与 `assistant.update` 的显式挑键（`src/host/rpc.ts:152-160`）必须**同一步**放宽，否则「只改人设」恒 bad-request。旧账本向后兼容是免费的（缺键⇒读回 `''`），但有个**静默副作用**：`cleanAssistant` 一旦补默认值，`renderConfigText` 的整份重写会让任意一次写操作把全部老助理行 materialize 出空字段——dirty 守卫比对的是**文本**不是语义（`home-store-io.ts:209-214`），要么接受一次迁移写，要么在唯一写出口 strip 空值。最后，**抽屉不是助理级的**：它只带工作区路径（`src/client/data/config.ts:22-26`、`src/client/components/panel-body.ts:141-144`），人设要进抽屉必须先补助理身份键，否则「一家多助理」时显示错人。

## 0. 速览：支撑结论的 5 条硬事实

| # | 事实 | 一手证据 | 标签 |
|---|---|---|---|
| F1 | 账本读回走**白名单对象字面量**，未列出的键一律丢弃（新字段不进 `cleanAssistant` ＝读一次就没了） | `src/host/home-store-io.ts:135-167`（返回字面量 154-166） | 源码确证 |
| F2 | 写盘是**整份重建**（注释块 + `stringifyYaml`），dirty 守卫按**字符串相等**跳过写 | `src/host/config-yaml.ts:41-43`、`src/host/home-store-io.ts:209-214` | 源码确证 |
| F3 | 种子落盘**逐字段重建**助理行（非 spread），两条分支都不带新字段 | `src/host/home-store.ts:181-197` | 源码确证 |
| F4 | `assistant.update` 只挑 `id/name/avatar` 三个键；`updateAssistantRow` 要求 name/avatar 至少其一 | `src/host/rpc.ts:152-160`、`src/host/home-edit.ts:55-57` | 源码确证 |
| F5 | 真机账本现为 version 2、**21 家 / 6 助理、0 处 `description`/`persona`**；助理行只有 10 个 4 空格键 | 实测：只读解析 `homes.yaml`（216 行、7120 B）统计键集合 | 实测 |

## 1. 账本层：最小改动面

### 1.1 四个文件的职责边界（现状）

| 文件 | 现在负责 | 不负责 |
|---|---|---|
| `src/host/home-store-io.ts`（214 行） | 类型定义（`AssistantRow:31-43`、`HomesDoc:45-49`）、**读回清洗白名单**（`cleanAssistant:135-167`）、读写状态机（`loadHomesDocState:170-202`：ok/missing/read-failed/parse-failed）、**唯一落盘口** `writeGuarded:209-214`（assertWritable → render → dirty 守卫 → 原子写） | 业务规则（谁可建/可否一对一）、RPC 形状 |
| `src/host/home-store.ts`（205 行） | 路径单点 `homesFileFor:24-26`、**串行写队列** `writeQueue:30` + `modifyHomesDoc:50-65`、`createHomeRow:73-97`、`createAssistantRow:99-125`、**种子** `seedDocs:130-202` | 改名/绑定语义 |
| `src/host/home-edit.ts`（135 行） | 行级编辑：`updateHomeRow:24-49`、`updateAssistantRow:52-75`、`createUnboundRow:80-95`、`bindAssistantRow:98-123`、`removeAssistantRow:126-135` | 落盘（全走 modifyHomesDoc） |
| `src/host/rpc.ts`（246 行） | 端点分发 + **逐端点显式挑键**（`home.list:111-114`、`assistant.create:124-134`、`home.seed:135-141`、`assistant.update:152-160`、`assistant.createUnbound:161-169` 等），catch 包成 `fail('internal', ...)`（`240-242`） | 任何校验（下沉到上面三层） |

**四条纪律天然继承、不需要新代码**（源码确证）：
- 串行：`modifyHomesDoc` 用 `writeQueue = writeQueue.then(job)`，且 `job.catch(()=>{})` 防 unhandledRejection（`home-store.ts:50-65`）。
- fail-closed：`assertWritable` 只放行 `ok|missing`，read/parse 失败留痕（`config.write.reject`）并抛成对错误（`home-store-io.ts:83-93`）。
- dirty：`original !== null && original === text` 即跳过写（`home-store-io.ts:209-214`）。
- 原子：写 `.tmp` 再 rename（`config-yaml.ts:79-84`）。
⇒ 新字段只要走同一条 `modifyHomesDoc`，上面四条全部免费。

### 1.2 新增两字段要动的单点（按调用链排序）

| 编号 | 位置 | 现在 | 改法 | 必须/可选 |
|---|---|---|---|---|
| **A1** | `home-store-io.ts:31-43` `AssistantRow` | 11 个必填字段，无新字段 | 加 `description: string`、`persona: string`（**类型必填、盘上可省**，见 1.3） | 必须 |
| **A2** | `home-store-io.ts:135-167` `cleanAssistant` | 白名单字面量，未列键丢弃 | 在 `nameSource` 后加两行：`description: sanitize(o.description, DESC_MAX)`、`persona: sanitize(o.persona, PERSONA_MAX)`（`sanitize` 已把非字符串归 `''`，`home-store-io.ts:95-97`） | 必须 |
| **A3** | `home-store.ts:99-125` `createAssistantRow` | input `{homeId,channel,botId,botName?,homeText?}`；行字面量 116-121 | input 加两可选；字面量加 `description: sanitize(input.description, DESC_MAX)`、`persona: ...` | 必须 |
| **A4** | `home-store.ts:166-198` `seedDocs` | 两分支**逐字段重建**，且 `createdAt`/`boundAt` 都被重置、`id` 只认字符串 | 181-189（unbound）与 191-197（bound）两支各加两字段（值直接取自 `r.description/r.persona` 过 `sanitize`） | 必须 |
| **A5** | `home-edit.ts:52-75` `updateAssistantRow` | 55-57 `hasName/hasAvatar` 闸；61-72 **原地 mutate**（不重建行） | 加 `hasDescription/hasPersona` 并纳入 57 的「至少其一」判定；mutate 分支：`a.persona = sn(input.persona, ...).trim()`（空串即清空） | 必须 |
| **A6** | `home-edit.ts:80-95` `createUnboundRow` | input `{homeId,name?}`；行字面量 87-91 | input 加两可选，字面量加两字段（未填即 `''`） | 必须 |
| **A7** | `rpc.ts:124-134 / 152-160 / 161-169` | 逐端点显式挑键（`String(p.x ?? '')` / `...(p.x !== undefined ? ...)`） | 三个 case 各加两键（create/createUnbound 用 `String(p.x ?? '')`；update 用 `p.x !== undefined` 展开） | 必须 |
| A8 | `home-model.ts:21-33` `Assistant` | 与 AssistantRow 同形 11 项 | 加两字段（客户端类型必须同步，否则 TS 报缺字段） | 必须 |
| A9 | `home-model.ts:161-180` `createAssistant`、`269-273` `buildSeed` 行字面量 | 字面量无新字段 | 两处各加两字段；**建议把 buildSeed/seedGap 整段搬到新文件**（见 4.3 行数） | 必须 |
| A10 | `client/data/home-edit.ts:42-63` `applyAssistantUpdate` | patch 类型 `{name?,avatar?}` | 加两可选键（`applyBind` 82-104 用 `{...a,...}`、`home-move.ts:10-17/20-33` 用 spread/逐字段，**新字段天然保留，不动**） | 必须 |
| A11 | 校验常量 | 无 | 新文件或 `home-store-io.ts` 顶部加 `PERSONA_MAX = 8000`（与上游 guidance 上限同值，`context-enhancement.mjs:26`）、`DESC_MAX`（**建议 200，待拍**） | 必须（值待定） |

**不需要动的**：`bindAssistantRow`（`home-edit.ts:116-120` 只改 channel/botId/status/boundAt/name，原地 mutate ⇒ 人设保留）、`moveAssistantRow`（`home-move.ts:13-27` 只改 homeId）、`unbindAssistantRow`（`31-47` 逐字段改，不重建）、`removeAssistantRow`、`config-yaml.ts`（YAML 层对未知键天然透传）、`home.list`（原样回 `doc.assistants`，`rpc.ts:111-114`）。

### 1.3 旧账本无字段时，读回默认值怎么给

**推荐：类型必填 `string`、盘上可省、读时补 `''`。** 理由（源码确证链）：
1. `loadHomesDocState` 用 YAML 解析出普通对象，缺键就是 `undefined`（`home-store-io.ts:170-202`）；
2. `sanitize(v, max)` 对非字符串返回 `''`（`:95-97`），所以 `sanitize(o.persona, 8000)` 天然把「缺键/数字/null」统一成 `''`；
3. 类型上写 `persona: string`（非可选）⇒ 客户端 UI 不需要 `?? ''` 分支，`{...a}` 的合并也不会带进 `undefined`。

**但要注意一个静默副作用（本票最容易踩的坑）**：`cleanAssistant` 补默认值后，内存里的每一行都有这两个键；写盘走 `renderConfigText(doc)` **整份 stringify**（`config-yaml.ts:41-43`），dirty 守卫比对的是**文本**（`home-store-io.ts:213`）⇒ **任意一次写操作（哪怕只改家名）都会把全部 6 条助理行补上 `description: ''` / `persona: ''`**，真机账本从 216 行涨一截。三种处理：

| 方案 | 做法 | 代价 | 评价 |
|---|---|---|---|
| **S1 接受迁移写** | 不处理，第一次写就 materialize 空值 | 一次无意义 diff；语义无害；旧版本插件读回会再丢（白名单） | 最省代码，可接受 |
| **S2 写口 strip 空值** | 在 `writeGuarded`（唯一落盘口）render 前删掉两键的空值 | +4~6 行；老账本「读→写」逐字节不变（dirty 守卫继续命中） | **推荐**：把「没设置」与「设置为空」在盘上保持同一形态 |
| **S3 读侧给 `undefined`** | 类型可选 + UI `?? ''` | 每个消费点都要兜底；`{...a}` 可能传播 `undefined` | 不推荐 |

**版本兼容**：`parsed.version` 被忽略、固定回 `version: 2`（`home-store-io.ts:201`）⇒ **不需要 bump version，也不需要迁移函数**。反向风险：新账本被**旧版插件**读会经 `cleanAssistant` 白名单静默丢字段，再保存一次即永久丢失（源码确证，属不可逆降级；无廉价解，建议在 release note 里写一句）。

### 1.4 校验放哪一层

- **写路径以宿主为准**：长度/类型在 `createAssistantRow`、`updateAssistantRow`、`createUnboundRow`、`seedDocs` 收口（单一真源，客户端只做 UX）。
- 建议语义：**写时超长直接 `bad-request`**（如 `persona 超过 8000 字符`），**读时防御性截断**（`sanitize` 已是 slice 语义）。理由：静默截断用户 9000 字人设是数据损失且无提示；读侧截断只防手改坏文件。
- 客户端镜像：`textarea maxlength=8000` + 字数计数；不用它当唯一闸。

## 2. 客户端模型与 UI 现状

### 2.1 类型

- `Assistant`（`src/client/data/home-model.ts:21-33`）：与 `AssistantRow` **同形 11 项**（id/homeId/channel/botId/status/name/nameSource/avatar/avatarSource/createdAt/boundAt）——加字段必须两边同步，否则 `bridge<{assistant?: Assistant}>` 的解包类型缺键。
- **`Kind` 不在 home-model 里**：`type Kind = 'home' | 'assistant'` 是**头像域**的命名空间（`src/client/components/home-avatar.ts:28`、`home-avatar-form.ts:27`），与助理行无关，本需求不碰（源码确证）。
- 派生/校验函数不受影响：`resolveAssistantDisplay:102-109`、`validateAssistantBind:136-145`。

### 2.2 「新建助理 / 接入绑定机器人 / 种子」谁写助理行

| 入口 | 端点 | 写行位置 | 表单字段 | 人设可填？ |
|---|---|---|---|---|
| 新建助理（家页 + 新建） | 无 botId → `assistant.createUnbound`；有 → `assistant.create` | `home-edit.ts:87-91` / `home-store.ts:116-121` | 属于哪个家、绑定机器人（含「以后再绑」）、名字（`home-forms.ts:141-157`） | **否** |
| 种子（首装/迁移/缺口） | `home.seed`，失败回落逐家 `home.create` + 逐助理 `assistant.create` | `home-store.ts:181-197`（逐字段重建）；回落走 `createAssistantRow` | 无表单（`buildSeed` 从工作区/机器人快照生成，`home-model.ts:225-276`） | **否** |
| 接入绑定机器人（扫码/手动） | `bot.workspace.set`；**带 assistantId 才**调 `assistant.bind` | `home-edit.ts:116-120`（只 mutate 既有行） | **没有助理表单**（`connect-flow.ts:176-199`、`269-292`；`binding-commit.ts:36-104`，bind 载荷 `{id,channel,botId,botName,homeText}`） | **否，且无入口** |

**关键结论**：「接入时可填人设」今天**没有任何表单落点**——连接流程要么不建助理行（家级接入），要么只 bind 一条已存在的未绑行。若本需求要它，必须先决定「新开一步」还是「绑定成功后开助理设置」（见 §6 待拍）。

种子触发链路（源码确证）：轮询回调 `seedGap(...)` 才补（`panel-data.ts:106-110`）→ `ensureSeeded`（`181+`）→ `buildSeed(lastWorkspaces, botLites(), legacy, now, 已落盘 homes)`（`:188`）→ `seedHomes`（`home-ops.ts:44-59`，失败回落 `seedByRows:62-88`）。

### 2.3 助理卡 / 编辑弹窗 / L3 详情 / 抽屉

| 界面 | 位置 | 现状 | 人设落点 |
|---|---|---|---|
| 家页助理卡 | `home-rows.ts:218-245` `asstRow` | 头像 + 名字 + 状态 pill + 在线标 + 副标（渠道 · 工作区路径）+ 动作（绑定/改名铅笔/配图）；`data-open='L3'` | **无展示位**；加一行简介约 +2 行代码 |
| 「助理设置」弹窗 | `home-forms.ts:263-297` `renameAsstPop` | 名字、头像行、恢复默认名、删除两步；patch 只组 `{name?,avatar?}`（`283-290`） | **无字段**；文件 299 行，**加字段必超红线** |
| L3 助理详情页 | `home-detail.ts:73-118` | 大头像/名/编号、meta chips（家·渠道·状态）、命名链、botBlock；动作 98-115 | **无展示位**；文件 118 行，最宽裕 |
| 详情抽屉 | `features/detail-drawer/` | 只读 `meta.loadMeta()` + `fctx.subscribe` 拿 bots + `fetchRoutes`；**从不读家账本**（`drawer.ts:42-55,278-286`） | **无助理身份键**（见下） |
| 抽屉打开事件 | `config.ts:21-26` `OpenDrawerDetail={key}` | key = `AgentView.key` = **工作区路径**；`panel-body.ts:141-144` 派发 `emitDrawer(home.path)` | 一家多助理时无法定位到行 ⇒ **必须先补 `asstId`** |

抽屉改造的两条路（决策留给 grilling）：
- **(a) 事件带 `asstId`**：`OpenDrawerDetail` 加可选 `asstId`（added-only，契约 §3:64 有先例），抽屉用 `fctx.rpc('home.list')` 自取一行（feature → host 桥，符合军规②；**不要 import `client/components/home-ops` 这个 A1 私有文件**）。+20 行左右。
- **(b) 按渠道显示**：抽屉每个 `DrawerChannel` 已经有 `botId`，用它反查助理行 ⇒ 一家多助理也正确，但「人设」会被拆到每个渠道行下（叙述成本高）。仍需要读一次 `home.list`。

## 3. 旧「性格/语气」退役清单

### 3.1 逐项处置

| 位置 | 现状 | 处置 | 理由 / 风险 |
|---|---|---|---|
| `detail-drawer/view.ts:149-176` `personalitySection` | 整段 UI（caption「性格/语气（一框写全渠道）」、textarea aria-label「性格语气」、二次确认「确认覆盖各渠道引导语？」、脚注「应用后覆盖各渠道现有引导语，新会话生效」） | **删整段** | 唯一消费 `personalityPrefill`/`onApplyPersonality` 的地方 |
| `view.ts:255,271-273` `renderDrawerContent` | 第 4 形参 `draftPers`；body 里调用 `personalitySection(personalityPrefill(model.bots), draftPers, cbs)` | **改**：删该实参与第 4 形参 | 尾部可选参数删除对少传的调用方兼容，但 verify 若传 4 参会 TS 报错，需同步改 |
| `view.ts:26-38` `DrawerCallbacks` | 含 `onApplyPersonality`/`onDraftPersonality` | **删两键** | 删后 `quietCallbacks`（`:10-24`）也要删对应空实现 |
| `view.ts:118` ctxSection 文案 | 「…字段与引导语请去 dsh-im 上游改（**或用性格页覆盖**）」 | **改**：去掉「或用性格页覆盖」 | 否则文案指向已删功能 |
| `detail-drawer/actions.ts:22-35` `applyPersonality` | 逐渠道 `bot.context-enhancement.set`，写**扁平四键**（`:29-33`） | **删整函数**（文件 75 行→约 60） | 该写法在 5.1.0 **必被拒**（上游 `validateContextEnhancementConfig` 要求恰好 group+direct，包根 `bot-workspace-store.mjs:936`）⇒ 删掉的是个已失效入口，不损失能力 |
| `detail-drawer/data.ts:100-104` `personalityPrefill` | 各渠道 guidance trim 去重，唯一才回填 | **删** | 唯一调用点是 view + verify |
| `drawer.ts:221-238` | `onApplyPersonality`（两次守卫 + apply + `draftPers=null`）、`onDraftPersonality` | **删**（`draftPers` 状态变量一并删） | — |
| `drawer.ts:11` import | 引 `applyPersonality` | **改**：只留 `rpcOf/writeBots` | — |
| `fleet-api.ts:24-29` `UpstreamCtx` + `:92-103` `normalizeUpstreamCtx` | 只读扁平四键（guidance 是其中一员） | **保留但标注**（不要顺手删） | 它是「上下文」只读区的数据源；但上游 5.1.0 返回双层 scope，本归一器读不到 ⇒ 抽屉恒显示全关/空 guidance（前序笔记结论 7）。这是**独立缺陷**，删人设不会修好它 |
| `view.ts:90-122` `ctxSection`（双开关 + fields/guidance 只读） | 上下文增强只读/盲写区 | **保留**（本需求不删），但**必须在票面承认它仍是死的** | 写入 payload `ctxPayloadFor`（`data.ts:166-177`）也是扁平四键，5.1.0 必拒 |
| `view.ts:269` `sumNote` | 「沟通模式…不是角色性格」 | **保留** | 它解释 preset，不是人设 |
| `tools/verify/features/detail-drawer.ts:83` `CTX0` / `84-89` `bot()` | 钉 legacy 扁平四键（含 `guidance:'hi'`） | **保留 CTX0 用于上下文区测试**；**删**依赖它的性格用例 | CTX0 本身是「上游旧形状」的夹具，与本仓归一器一致；删了会连带删掉上下文区的护栏 |
| `detail-drawer.ts:131-135` 归一断言、`:138-150` payload 断言 | 断 `normalizeUpstreamCtx` 缺键补默认；断 `ctxPayloadFor` 回扁平四键、键序 `['directEnabled','fields','groupEnabled','guidance']` | **保留**（上下文区仍在） | 若同时修上下文区，需换成新形状 |
| `detail-drawer.ts:238-258` 文案针脚 | 数组含 `'性格'`、`'新会话生效'`、`'沟通模式'`；断 pillSwitch 恰 2 个 | **改**：去掉 `'性格'`；pillSwitch 数不变（双开关仍在） | — |
| `detail-drawer.ts:441-447` `personalityPrefill` 用例、`:449-466` `applyPersonality` 用例 | 直接断函数行为（含 `sent[0].config.guidance === '幽默一点'`） | **删两段** | 函数已删 |
| 全仓文案 `性格|语气` | 25 处命中里除上述外，其余是 `dual-mode-copy.ts` 的英文 guidance 提示、`fleet-api` 字段名 | **保留** | 与「性格/语气」无关 |

### 3.2 退役顺序：先删写，后删读，最后清夹具

**先删写**而不是先删读，理由（源码确证）：写路径在 5.1.0 已经 100% 失败，用户点「应用」只会收到「请提交有效的上下文增强设置。」——它现在**假装修好了**；先拆掉假按钮，不会损失任何仍可用的能力，也不会让哪份数据消失（guidance 真值在上游，本仓这条路径只是把同一段文本按渠道抄过去）。反之先删读会让用户「看得到、改不了」，中间态更难受。

| 步 | 动作 | 结束条件 |
|---|---|---|
| **S1** | 加新字段全链（A1–A11）+ 入口（新建 / 助理设置 / L3 或抽屉只读） | `npm run check` 全绿；旧性格页原样并存（两入口同在） |
| **S2（删写）** | `personalitySection` + 两次确认文案 + `onApplyPersonality`/`onDraftPersonality` + `drawer.ts` 两回调 + `applyPersonality` + `personalityPrefill` + `:118` 文案 + 两段 verify 用例 | check 全绿；抽屉不再出现「应用」按钮；guidance 仍可在 dsh-im 上游设置里改（真实入口未动） |
| **S3（删读）** | `renderDrawerContent` 第 4 形参 `draftPers`、model 里若残留的 pers 字段、`:238-258` 的 `'性格'` 针脚 | check 全绿 |
| **S4（清账）** | 注释/头注释（`view.ts:2` 提到 fields/guidance 只读可留）、`features-contract` 若涉共享协议则先改契约（§9:98）、验收说明 | — |

> 注意：S2/S3 可以合一个 PR，但**不要**把「上下文增强修到新形状」混进来——那是另一张票，混进来会让 `detail-drawer.ts` 的十几条夹具一起翻修，无法判断谁坏了谁。

## 4. verify 与红线

### 4.1 现有账本夹具地图

| 文件 | 覆盖 | 与本次的关系 |
|---|---|---|
| `tools/verify/features/home-store.ts`（132 行） | missing 可写 + dirty 守卫 mtime + `config.io` 级别（53-72）；parse-failed 三写路径全拒 + 留痕（74-95）；read-failed 拒写（97-106）；sink 未注入静默（108-117）；**清单与调用点对齐**（119-130） | 新增字段的**账本断言天然落点** |
| `tools/verify/features/home-steel.ts`（2232 行，转译真宿主源码跑临时盘） | 夹具 `H`/`A`（134-135）；**键集合钉子** 422-423（改名/占位「不发明字段」）、748-755（`Object.keys(H({}))/Object.keys(A({}))`）、765-770（落盘行键集合）、**776-778（盘上未知字段必须被净化）**、780-783 | 加字段必须同步改 `H/A`；否则这几处断言会红（这正是白名单的机械执行） |
| `tools/verify/render-client.ts`（549 行，内存假宿主） | `assistant.create`（83-94，行字面量 87-91）、`assistant.update`（126-139，只认 name/avatar）、`assistant.createUnbound`（140-151）、`home.seed`（95-110，**助理行用 `{...a,...}` 展开，比真宿主宽松**） | 假宿主必须加两键；注意 seed 的宽松展开**抓不到**「真宿主逐字段重建丢字段」——该回归只能靠 home-steel |
| `tools/verify/features/home-seed-fallback.ts` | 断言 `assistant.create` 的入参与顺序（178-181、210-213） | 若 create 入参加键，确认是否用 deepEqual 全量比较 |
| `tools/verify/features/home-create-flow.ts` | 建助理链路（443-455） | 同上 |
| `tools/verify/features/config-yaml.ts` | `loadHomesDoc`/`renderConfigText` 往返（95/140） | 加字段后应仍绿（YAML 透传） |
| `tools/verify/features/home-parity.ts` | **不是断言测试**（头注释 1-9：不参与 `npm run check`，像素对拍） | 不影响门禁 |

### 4.2 新增字段的断言点（建议 10 条）

1. **缺字段读回**：`cleanAssistant({id,homeId,channel,botId,...})` → `description === ''`、`persona === ''`，且该行不被丢。
2. **超长读回截断**：`persona` 8001 字符 → 读回 8000。
3. **落盘往返**：`createAssistantRow` 带两字段 → 重读相等（home-steel 临时盘）。
4. **种子保真**：`seedDocs` 输入带两字段 → 落盘行仍带（**当前会丢，这是可写的回归断言**；只有 home-steel 的真宿主路径有意义）。
5. **只改人设**：`updateAssistantRow({id, persona})` 成功（现在 `bad-request`）；`assistant.update` 带 `persona` 不被 RPC 挑键丢掉。
6. **空串清空**：patch `persona: ''` → 落盘为空；`{...a}` 不残留旧值。
7. **未知键仍被净化**：home-steel 776-778 的脏文件行为不破（`extraField` 之类仍被丢）。
8. **dirty 守卫**：同值第二次保存不写、mtime 不变（扩 53-72 的用例）；**若采用 S2 strip**，额外断「无字段老账本读→写后文本逐字节不变」。
9. **RPC 全链**：home-steel 956 的真分发器用例加断言（`assistant.create` 带两字段 → `home.list` 读回）。
10. **退役后**：抽屉文案针脚不再含「性格」、`renderDrawerContent` 只接受 3 参（TS 直接抓）。

### 4.3 300 行红线：逐文件预算

实测行数，口径同 `tools/guard/check-lines.ts:32-37`（含注释、去尾空行、`>LIMIT` 才失败、LIMIT 默认 300）：

| 文件 | 现行数 | 本需求估算 | 判定 |
|---|---|---|---|
| `src/host/home-store-io.ts` | 214 | +2 类型 +2 清洗 +2 常量 +（S2 再加 ~6） | 安全 |
| `src/host/home-store.ts` | 205 | +2 input +2 字面量 +4 种子 +2 注释 | 安全 |
| `src/host/home-edit.ts` | 135 | +2 input +2 闸 +6 mutate +2 占位 | 安全 |
| `src/host/rpc.ts` | 246 | +8（三 case） | 安全 |
| `src/client/data/home-model.ts` | **295** | +2 类型 +2 建行 +2 种子 = **301** | **红**：必须拆。建议把 `buildSeed`/`seedGap`（225-294，约 70 行）搬到新文件 `home-seed.ts`（client/data 内，共享数据层，added-only） |
| `src/client/components/home-ops.ts` | **300** | input 类型 +2；`updateAssistant` 的 toast 三元要改（`:162` 只认 name/avatar）+2~4 | **红**：零余量。建议把 `createAssistant/createUnbound/updateAssistant`（133-179）拆到 `home-ops-assistant.ts`；或先把 drill 编排（193-300）整段搬走 |
| `src/client/components/home-forms.ts` | **299** | `newAsstPop` 加两字段 ≈ +12、`renameAsstPop` ≈ +14 | **红**：新建 `home-asst-form.ts`（两个助理表单整体搬过去，该文件留家表单）；文件末尾注释已记「占位绑定曾搬走」＝既有拆分先例 |
| `src/client/components/home-rows.ts` | 296 | 卡面加一行简介 ≈ +2~3 | 边界（299）：**只加简介、不加动作**（编辑沿用现有 rename-a 铅笔），否则红 |
| `src/client/components/panel-body.ts` | **300** | 若新增动作分支（如 `persona-a`）+2~3 | **红**：**复用 `settings-a`**（`:161-164`）把编辑放进助理设置弹层，此文件可 0 行改动 |
| `src/client/components/home-detail.ts` | 118 | 人设块 +15 | 安全（最宽裕的展示位） |
| `src/features/detail-drawer/view.ts` | 275 | 删 28；若排只读人设块 +20 | 安全 |
| `src/features/detail-drawer/drawer.ts` | 291 | 删 20；加读 `home.list` +20 | 边界，**同一 PR 内先删性格再加人设**，别两头同时加 |
| `src/features/detail-drawer/data.ts` | 231 | 删 5；加本地 `listHomes` 小助手 +10 | 安全 |
| `src/features/detail-drawer/actions.ts` | 75 | 删 14 | 安全 |

> 红线口径：`tools/guard/check-lines.ts:15`（LIMIT = `--limit` | `GUARD_LIMIT` | 300）、`:19-30`（只扫 `src/**/*.ts`）、`:44`（`lines > LIMIT` 才失败）、`docs/features-contract.md:66-70`（`tools/**` 豁免）。

## 5. 改动面表（文件 → 职责 → 本需求 → 判定）

| 文件 | 现在职责 | 本需求要做什么 | 判定 |
|---|---|---|---|
| `src/host/home-store-io.ts` | 类型 + 读回白名单 + 唯一落盘口 | A1 类型、A2 清洗、A11 常量、（可选 S2 strip） | **必须改** · 低风险 |
| `src/host/home-store.ts` | 队列/建行/种子 | A3 建行、A4 种子两支 | **必须改** · 中风险（种子漏字段是静默丢失） |
| `src/host/home-edit.ts` | 行级编辑 | A5 放宽闸 + mutate、A6 占位 | **必须改** · 高风险点：`:57` 的闸 |
| `src/host/rpc.ts` | 端点挑键 | A7 三 case | **必须改** · 低风险 |
| `src/host/config-yaml.ts` | YAML 读写 | 不动（未知键透传） | **可不动** |
| `src/host/home-move.ts` / `home-orphan.ts` | 搬家/解绑/墓碑 | 不动（原地 mutate / 逐字段改 ⇒ 人设保留） | **可不动** · 已核 |
| `src/client/data/home-model.ts` | 客户端模型 + 种子纯函数 | A8/A9；**拆出 buildSeed** | **必须改** · 红线（301） |
| `src/client/data/home-edit.ts` | 客户端纯函数 patch | A10 | **必须改** · 低风险 |
| `src/client/data/home-move.ts` | 搬家纯函数 | 不动（spread） | **可不动** |
| `src/client/data/fleet-api.ts` | 上游 ctx 归一 | 退役时保留 `guidance` 字段（上下文区仍用） | **可不动**（但票面须记「读仍失真」） |
| `src/client/components/home-ops.ts` | RPC 包装 + drill | 三个签名加可选参数、toast 文案分支 | **必须改** · 红线（300）⇒ 先拆 |
| `src/client/components/home-forms.ts` | 家/助理表单 | 助理表单加两字段 | **必须改** · 红线（299）⇒ 搬新文件 |
| `src/client/components/home-rows.ts` | 三级列表渲染 | 助理卡加一行简介（可选） | **建议改** · 299 顶格 |
| `src/client/components/home-detail.ts` | L3 详情 | 加简介/人设只读块 | **建议改** · 安全 |
| `src/client/components/panel-body.ts` | 动作分发 | 复用 settings-a，**不加分支** | **可不动** · 300 顶格 |
| `src/client/components/panel-data.ts` | 轮询/读表/种子 | 种子若带字段则无需改；若加「接入填人设」需动 | **可不动** |
| `src/client/data/binding-commit.ts` / `connect-flow.ts` | 接入/绑定 | **取决 §6 决策**：接入填人设 ⇒ 改；否则不动 | **待拍** |
| `src/client/data/config.ts` | 事件契约 | 抽屉要人设 ⇒ `OpenDrawerDetail` 加可选 `asstId`（added-only） | **待拍**（若走事件方案） |
| `src/features/detail-drawer/view.ts` | 抽屉渲染 | 删性格区；可能加只读人设 | **必须改**（退役） |
| `src/features/detail-drawer/actions.ts` | 写透 | 删 `applyPersonality` | **必须改**（退役） |
| `src/features/detail-drawer/data.ts` | 模型/写 payload | 删 `personalityPrefill`；若只读人设则加取行助手 | **必须改** |
| `src/features/detail-drawer/drawer.ts` | 容器/回写 | 删两个回调；若只读人设则加 `home.list` | **必须改** |
| `tools/verify/features/home-store.ts` | 账本门禁 | 断言 1/2/8 | **必须改**（测试） |
| `tools/verify/features/home-steel.ts` | 真宿主行为 | `H/A` 加两键；断言 3/4/5/9 | **必须改**（测试） |
| `tools/verify/render-client.ts` | 假宿主 | 三端点加两键 | **必须改**（测试） |
| `tools/verify/features/detail-drawer.ts` | 抽屉门禁 | 删性格用例、改文案针脚 | **必须改**（测试） |
| `docs/features-contract.md` | 契约 | 若改 `OpenDrawerDetail`/新事件 ⇒ 先改契约（§9:98） | **条件改** |

## 6. 未证实与待拍板（交给 grilling）

1. **`description` 上限**：本笔记建议 200（一行简介），无一手依据——需产品拍；`persona` = 8000 有上游同值可援引（`context-enhancement.mjs:26`），但本仓**不 import 上游常量**，硬编码 + 注释来源（推断：应解耦，不跨包引用）。
2. **空值写盘策略**：S1 接受迁移写 vs S2 写口 strip——影响真机账本 diff 与 dirty 守卫语义（见 1.3）。**未实测**哪种更符合 owner 预期。
3. **「接入时可填人设」的形态**：连接流程新加一步 / 绑定成功后自动开「助理设置」/ 干脆不做（先只在新建与事后编辑提供）。今天无任何入口（源码确证），所以这是**净新增工作量**，不是改造。
4. **抽屉只读人设的身份键**：`asstId`（事件加字段）vs 按渠道显示（用 `DrawerChannel.botId` 反查）。前者要改 `OpenDrawerDetail` 契约，后者叙事分散。
5. **L3 详情页要不要显示人设**：它是助理级、行数最宽裕，可能比抽屉更合适的只读位；决策说「抽屉只读」，两者可并存。
6. **上下文增强（双开关 + guidance 只读）是否并入本票修**：不修则「删掉性格页」后抽屉仍留一组**必失败**的开关（上游 5.1.0 精确键校验）。强烈建议**不并入**、另开票，但票面必须写清。
7. **人设如何真正进提示词**：本票只做存储。上游 guidance 退役后，若没有新注入面，人设就是「只存不生效」——DSH `systemPrompt` 服务对 profile 插件可用（前序笔记结论 1/2），但需要 per-session→assistant 映射，属另一张票。**这是本需求最大的产品风险，必须让 Lead 知情**。
8. **旧版插件回退丢字段**：`cleanAssistant` 白名单会把新字段静默丢弃（源码确证），回退版本再保存即丢人设。无廉价解，建议 release note 提示。
9. `description`/`persona` 的**命名**：与上游 `guidance` 不冲突；但 `description` 在 DSH agent preset 里也指「描述」（`describeAgent`），若未来要与 Agent 目录联动需确认不撞语义（**推断**，未取证）。

## 7. 给实施规格的最小 diff 清单（可当 checklist）

**宿主（7 处）**
1. `home-store-io.ts:31-43` 加两字段（类型必填 `string`）。
2. `home-store-io.ts:135-167` 返回字面量加 `description/persona`（`sanitize` 兜底）；常量 `PERSONA_MAX=8000`、`DESC_MAX=?`。
3. `home-store.ts:99-125` `createAssistantRow` input + 字面量。
4. `home-store.ts:181-197` `seedDocs` 两分支各加两字段。
5. `home-edit.ts:52-75` `updateAssistantRow`：放宽 `:57` 闸 + mutate 两字段。
6. `home-edit.ts:80-95` `createUnboundRow` input + 字面量。
7. `rpc.ts:124-134/152-160/161-169` 三 case 挑键。

**客户端（3 处 + 2 个新文件）**
8. `home-model.ts` `Assistant` + `createAssistant` + 种子行字面量；**拆 `home-seed.ts`**。
9. `client/data/home-edit.ts:42-63` patch 类型加两键。
10. `home-ops.ts` 三签名 + toast；**先拆 `home-ops-assistant.ts`**（300 行）。
11. **新文件 `home-asst-form.ts`**：新建助理（含简介/人设）+ 助理设置（名字/头像/简介/人设）；`home-forms.ts` 只留家。
12. 展示：`home-rows.ts` 卡面一行简介（可选）＋ `home-detail.ts` 只读块（推荐）。

**抽屉（退役 4 处 + 可选只读 1 处）**
13. `view.ts` 删 `personalitySection` 与两回调、改 `:118` 文案、删第 4 形参。
14. `actions.ts` 删 `applyPersonality`。
15. `data.ts` 删 `personalityPrefill`。
16. `drawer.ts` 删两回调与 `draftPers`。
17. （可选）只读人设：`config.ts` 加 `asstId?` + `drawer.ts` 读 `home.list` + `view.ts` 一块。

**verify（4 个文件）**
18. `home-steel.ts` 的 `H/A` 夹具 + 断言 3/4/5/9。
19. `home-store.ts` 断言 1/2/8。
20. `render-client.ts` 三端点加键。
21. `detail-drawer.ts` 删性格用例、改文案针脚。

> 每步结束跑 `npm run check`（= `build` + `typecheck` + `verify` + `guard`，见 `package.json` scripts）。S1 与 S2 之间必须各绿一次，否则无法定位是新字段还是退役弄坏的。
