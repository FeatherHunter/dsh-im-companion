<h1 align="center">dsh-im-companion
</h1>

<div align="center">

**中文** · [English](docs/README.en.md)

**dsh-im-companion 以助理和家的概念增强dsh-im的使用体验。**

你的 ⭐是我夜空中最亮的星。

*Give every agent a home — IM Companion handles the rest.*

[![版本](https://img.shields.io/npm/v/dsh-im-companion?label=版本)](https://www.npmjs.com/package/dsh-im-companion) [![下载量](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2Flast-month%2Fdsh-im-companion&query=%24.downloads&label=下载量&suffix=/月&color=brightgreen)](https://www.npmjs.com/package/dsh-im-companion) [![最近更新](https://img.shields.io/github/last-commit/FeatherHunter/dsh-im-companion?label=最近更新&color=FE7D37)](https://github.com/FeatherHunter/dsh-im-companion/commits/master) [![许可证](https://img.shields.io/badge/许可证-MIT-lightgrey.svg)](LICENSE) [![上游本体](https://img.shields.io/badge/上游-dsh--im-3370ff)](https://github.com/xmanrui/dsh-im) [![期待你参与](https://img.shields.io/badge/期待你参与-brightgreen.svg)](https://github.com/FeatherHunter/dsh-im-companion/issues)

<table>
<tr>
<td align="center" valign="top" width="50%">
<strong>👇 有助理的工作区，一目了然。</strong>
<br><img src="assets/工作区-有助理的工作区一目了然-深色.png" width="300" alt="左栏工作区：全部、有助理、无助理，在线绿灯">
</td>
<td align="center" valign="top" width="50%">
<strong>👇 额外增强DSH原生会话状态。</strong>
<br><img src="assets/工作区增强-显示工作区红色状态-内部也有执行中的会话.png" width="300" alt="工作区红色竖条，组内有异常会话">
</td>
</tr>
</table>

**装它，1 分钟（先装 dsh-im，再装辅助）。**

</div>

<h2 align="center"><sub>INSTALL</sub><br>安装</h2>

<div align="center">

前置要求：[DSH](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）+ [dsh-im](https://github.com/xmanrui/dsh-im)（IM 机器人本体）。

</div>

```bash
# 1 安装 DSH CLI（已装跳过）
npm install -g @deepseek-ai/dsh

# 2 先装本体 dsh-im（已装跳过，同样 --profile 必填）
dsh plugin --profile desktop add dsh-im
#     或者
dsh plugin --profile web add dsh-im

# 3 再装辅助（--profile 必填，装进实际使用的入口）
dsh plugin --profile desktop add dsh-im-companion
#     或者
dsh plugin --profile web add dsh-im-companion

# 锁定版本更稳（当前 0.2.3）
dsh plugin --profile desktop add dsh-im-companion@0.2.3 --registry https://registry.npmjs.org
```

<div align="center">

装完刷新页面即生效。若面板没有出现，请完全退出 DSH 后重新打开。

</div>

<details>
<summary>把安装交给你的 AI</summary>

复制下面这段发给你的 AI：

```text
请帮我安装 DeepSeek Harness 插件 dsh-im-companion（IM 辅助）。
先读仓库 README：https://github.com/FeatherHunter/dsh-im-companion
先确认我实际使用的 DSH 入口对应哪个 profile（桌面应用走 desktop，自启 web 服务走 web），
先确认 dsh-im 本体已装进同一个 profile（没装先装），再把辅助装进正确的 profile。
```

</details>

<details>
<summary>更新不生效时怎么装</summary>

下面以 desktop 为例，web 用户请把 --profile desktop 换成 --profile web：

```bash
dsh plugin --profile desktop add dsh-im-companion@0.2.3 --registry https://registry.npmjs.org
npx --yes @deepseek-ai/dsh plugin --profile desktop add dsh-im-companion
dsh plugin --profile desktop add dsh-im-companion@latest --registry https://registry.npmjs.org
```

</details>

升级 · 卸载：

```bash
dsh plugin --profile desktop update dsh-im-companion
dsh plugin --profile desktop remove dsh-im-companion
```


<a name="compat"></a>
<h2 align="center"><sub>COMPAT</sub><br>兼容性</h2>

<div align="center">

| dsh-im-companion | dsh-im | 说明 |
| --- | --- | --- |
| **0.2.x** | **4.21.1**（已验证） | 与 0.1.16+ 同传输口径；新增更新中心（面板自写 status 轮询，受契约 §4 三条约束）与 `meta.motion.set` / `meta.update.set` 两个偏好端点 |
| **0.1.16+** | **4.21.1**（已验证） | 双传输口径不变：4.17.1+ 走 `/api` 新载体，≤4.17.0 自动回退旧路由；4.21.1 的载体规则已复核与 4.17.1 一致（`dsh-im<channel>` + `{ method, payload }`） |
| 0.1.7 – 0.1.15 | 4.17.1（已验证） | 双传输：4.17.1+ 走 `/api` 新载体，≤4.17.0 自动回退旧路由——两边都能用 |
| 0.1.6 | 4.17.1 | **web profile 装配失败**（host 半走已退役的前缀路由，报 `cannot get property "webServer" without inject`）→ 请升级 0.1.7 |
| 0.1.4 | ≤4.17.0 | dsh-im 4.17.1 改道后不可用（接入向导报 HTTP 405），请升级到 0.1.7 |

宿主 `@deepseek-ai/dsh` **0.2.0-rc.2** 已验证（**0.2.2 配的就是这个宿主版本**；要求宿主提供 `connection.fetch`；更老宿主会在装配期显式报错，不静默降级）。面板右上角并列两枚版本胶囊，颜色即身份：紫=本插件版本号、蓝白=兼容的 `dsh-im` 版本（`dsh-im 4.21.1`）；宿主 dsh 胶囊已删（用户裁定 2026-10-01），宿主兼容口径只留本小节与市场徽章（`engines.dsh`）。胶囊只留轴名 + 版本号，完整口径在悬停（值来自 `package.json`，构建时注入），升级前看一眼即可。

</div>

<h2 align="center"><sub>WHY</sub><br>为什么要做 IM 辅助</h2>

<div align="center">

dsh-im 掌管接入，dsh-im-companion 以助理和家的概念增强能力。

**家**：哪个工作区有助理在管、在不在线，尽收眼底；搬家拖一下就行。

<strong>👇 点“有助理”，只看已安家的。</strong>

<img src="assets/工作区-一键过滤-有助理-深色.png" width="340" alt="一键过滤只看有助理">

</div>

<h2 align="center"><sub>IN ACTION</sub><br>真机演示</h2>

<div align="center">

<strong>👇 进设置 → IM机器人增强：助理、渠道、在线状态一屏看尽。</strong>

<img src="assets/设置-以Agent为核心-聚合视图-深色.png" width="720" alt="设置页助理聚合视图">

<strong>👇 切按渠道：同渠道助理排一排。</strong>

<img src="assets/设置-按渠道视图-深色.png" width="640" alt="设置页按渠道视图">

<strong>👇 点“添加接入”：选家后扫码即绑定。</strong>

<img src="assets/设置-添加接入-二维码弹窗-深色.png" width="640" alt="添加接入二维码弹窗">

<strong>👇 点开助理卡：模式、状态、各渠道增强开关一目了然。</strong>

<img src="assets/助理卡-详情抽屉-深色.png" width="640" alt="助理详情抽屉">

<strong>👇 舰队雷达：Agent × 渠道矩阵，全舰队谁在线一眼看清。</strong>

<img src="assets/舰队雷达-矩阵总览-深色.png" width="720" alt="舰队雷达矩阵总览">

<strong>👇 会话状态一目了然（DSH增强）。</strong>

<div align="center">
<table>
<tr>
<td align="center" valign="top" width="50%">
<strong>👇 蓝条代表有会话在执行。</strong>
<br><img src="assets/会话状态-工作区-执行中.png" width="330" alt="工作区蓝色竖条，组内有执行中会话">
</td>
<td align="center" valign="top" width="50%">
<strong>👇 橙条代表有消息等你确认。点开后自动熄灭。</strong>
<br><img src="assets/工作区增强-轻松看到待用户确认的消息.png" width="330" alt="工作区橙色竖条，有待确认消息">
</td>
</tr>
</table>
</div>

<div align="center">
<table>
<tr>
<td align="center" valign="top" width="50%">
<strong>👇 悬停看双通道 + 最后检测时间</strong>
<br><img src="assets/工作区-Header浮层-当前助理状态-呼吸感.png" width="330" alt="悬停卡与在线徽标同框">
</td>
<td align="center" valign="top" width="50%">
<strong>👇 浅色主题同样可用</strong>
<br><img src="assets/工作区-有助理-浅色.png" width="330" alt="浅色左栏同样有徽标和过滤">
</td>
</tr>
</table>
</div>

<strong>👇 点工具栏机器人脸图标，进搬家面板</strong>

<img src="assets/串门-入口-左栏图标.png" width="380" alt="左栏工具栏串门入口图标">

<strong>👇 串门搬家：把照片拖到另一家，二次确认。绿灯在岗，黄灯打盹，灰灯睡着。</strong>

<img src="assets/搬家面板-以家为核心-机器人可以自由搬到其他家庭.png" width="720" alt="串门搬家面板">

<strong>👇 卡片拖到另一家上空，目标家高亮</strong>

<img src="assets/串门-拖拽中-目标家高亮.png" width="640" alt="拖拽中目标家高亮">

<strong>👇 搬家前二次确认</strong>

<img src="assets/串门-二次确认.png" width="330" alt="搬家二次确认框">

</div>

<h2 align="center"><sub>CAPABILITIES</sub><br>能力地图：四种颗粒度</h2>

同一份能力，按你想介入的深度分四层：**装完就用** → **面板里点** → **程序化调用** → **自己加功能**。AI 读者可直接跳 L2 / L3 取接口清单。

| 颗粒度 | 你想做的事 | 入口 | 要写代码吗 |
| --- | --- | --- | --- |
| **L0 零配置** | 看在线状态、过滤、搬家、装更新 | 装完刷新页面即生效 | 不用 |
| **L1 面板内可控** | 配模式 / 渠道增强 / 绑定 / 自动检查 | 设置 → IM机器人增强 | 不用 |
| **L2 程序化集成** | 让 AI 或别的插件读写状态、触发检查与安装 | 宿主桥 `POST /api/im-companion` ＋ 客户端契约四通道 | 只调用，不改本仓 |
| **L3 二次开发** | 加一个新功能或新端点 | `FeatureManifest` ＋ `rpc` case | 要 |

<h3 align="center">L0 · 零配置（装完就有）</h3>

| 能力 | 在哪看 | 说明 |
| --- | --- | --- |
| 左栏在线徽标 | 工作区列表每行 | 绿＝在岗、黄＝打盹、灰＝睡着；悬停看双通道与最后检测时间；未绑定不画 |
| 左栏筛选 | 列表顶部条 ＋ 表头漏斗 | 全部 / 有助理 / 无助理（带计数）；漏斗点击循环三态，另有一键收起分组 |
| 组行状态竖条 | 工作区分组行与会话行 | 蓝＝有会话执行中（呼吸）、红＝异常（402／中断／未知错误）、黄＝等你查看或选择 |
| 工作区 Header 浮层 | 会话头状态点 | 点开看助理 / 渠道 / 在线状态；可发测试消息（渠道·机器人·会话三级选择器） |
| 舰队雷达 | 面板工具栏「扬帆远航！」 | Agent × 渠道矩阵；点格子钻取详情 |
| 更新中心 | 设置面板顶部区块 | 检查更新 / 一键安装 / 待重启横幅 / 版本说明；桥不可用时显式报「宿主桥不可用」 |
| 在场感动效 | 左栏筛选条左侧绿点 | 点一下开/关呼吸动效（默认开），偏好落盘宿主 `meta.json`，尊重系统「减少动态效果」 |

<h3 align="center">L1 · 面板内可控（设置 → IM机器人增强）</h3>

| 想调什么 | 在哪 | 粒度 |
| --- | --- | --- |
| 视图与搜索 | 面板顶部分段 ＋ 搜索框 | 聚合视图（按助理）/ 按渠道视图 |
| 添加接入 | 工具栏「新建助理」→ 选家 | 二选一：**扫码创建**（一步直达）或**手动填写**（Slack Manifest / Discord Intent / Telegram 代理 / 企微 Bot ID 提示；密钥掩码回显、密文不回显） |
| 助理详情 | 点助理卡（或点左栏徽标） | 沟通模式（预设，写入真系统、新会话生效）、上下文增强（**每渠道两个开关**：群聊增强 / 私聊增强）、性格、工作区路径（原生目录选择器）、会话路由摘要、渠道管理（解绑需确认）、测试发送 |
| 搬家 | 工具栏「串门搬家」 | 拖到另一个家 → 二次确认「确认换绑」→ 5 秒内可撤销 |
| 更新偏好 | 更新中心 | 自动检查开关 ＋ 间隔 6 / 12 / 24（默认）/ 168 小时 |
| 动效偏好 | 左栏筛选条绿点 | 开 / 关 |

写保护：渠道真值未读到时写操作禁用并提示「本渠道真值尚未读到，稍后再试（防覆盖已有配置）」；破坏性动作一律二次确认（`再次点击确认` / `确认换绑` / `解绑`）。

<h3 align="center">L2 · 程序化集成（给 AI、给别的插件）</h3>

**宿主桥**（本插件唯一的 HTTP 面，注册在 DSH 公开 `/api` 载体上）：

```text
POST /api/im-companion
请求：{ "type":"client-request", "rpcId":"<你的id>", "method":"im-companion",
        "payload": { "method":"<端点名>", "payload": { … } } }
回包：{ "type":"server-response", "rpcId":"<同一个id>",
        "result": { "ok":true, "value": … } }
失败：{ "ok":false, "error": { "code":"bad-request", "message":"…", "details":{} } }
```

端点清单：

| 端点 | 载荷 | 返回 |
| --- | --- | --- |
| `ping` | `{}` | `{ pong }` |
| `meta.get` | `{}` | `AgentMetaDoc` 全量快照 |
| `meta.rename` | `{ key, name }` | `{}` |
| `meta.avatar.set` / `meta.avatar.clear` | `{ key, dataUrl }` / `{ key }` | `{}` |
| `meta.preset.set` | `{ key, preset }` | `{}` |
| `meta.ctx.set` | `{ key, enabled, level }` | `{}` |
| `meta.motion.set` | `{ manualReduced: boolean }` | `{}` |
| `meta.update.set` | `{ autoCheckEnabled: boolean, intervalHours }`（间隔只收 6 / 12 / 24 / 168 小时） | `{}` |
| `meta.welcomed.set` | `{ workspace, seen }` | `{}` |
| `meta.local.add` / `meta.local.remove` | `{ name }` | `{}` |
| `meta.local.rename` | `{ from, to }` | `{}` |
| `meta.local.workspace` | `{ name, workspace }` | `{}` |
| `routes.list` | `{ bots: [{ channel, botId }] }` | `{ routes, skipped }` 会话路由摘要 |
| `activity.snapshot` | `{}` | `{ entries, scannedAt }` 会话活动 |
| `fs.defaultRoot` / `fs.roots` | `{}` | `{ path }` / `{ roots }` |
| `fs.list` | `{ path }`（绝对路径） | `{ path, parent, entries }` |
| `imc.updateStatus` / `imc.updateCheck` | `{}` | 更新快照（`snapshot` / `manual` / `autoCheck`） |
| `imc.updateInstall` | `{ checkId, requestId }` | 安装回执 |

落盘真相：`~/.dsh/integrations/dsh-im-companion/meta.json`（`DSH_HOME` 或插件 `config.dshHome` 可改）；`AgentMetaDoc` 字段＝`names` `avatars` `locals` `presets` `ctxEnhance` `welcomed` `motion` `update`。

**客户端契约四通道**（写别的插件 / 特性时用）：

| 通道 | 你能拿到 | 规则 |
| --- | --- | --- |
| `rpc` | `RpcCall`，走 dsh-im 渠道 RPC | 写后必须 `refresh()` |
| `subscribe(fn)` | `StreamSnapshot = { bots, failed, updatedAt, catalogs }` | 唯一轮询源（15 秒、进程内单例），**禁开第二份轮询** |
| `meta` | `MetaStore`（`loadMeta()` ＋ 写方法） | host `meta.json` 是权威；桥不可用时降级 localStorage `af-fleet-*` |
| `slots` | 槽位：`settings.section`（本插件占 `id=dsh-im-companion`、`order=22`、标题「IM机器人增强」）、`workspace-rail`、`session-header`、`conversation-session` | 只注册，不越权改别人的 DOM |

辅助面：`window` 事件前缀 `dsh-im-companion:*`（组件间总线，**不在四通道白名单内、无重放**）；宿主服务出口 `ctx.provide('agentFleet', { version, meta })`，别的插件可读 `meta.snapshot()`。

**包出口**（`npm i dsh-im-companion` 之后）：`.` → 宿主入口 `lib/index.js`（导出 `name` / `inject` / `apply`）；`./client` → 浏览器包（走 `__ModuleLoader__`，不是 Node 可 import 的包）；`./package.json`。

<h3 align="center">L3 · 二次开发（加功能 / 加端点）</h3>

1. 新功能 = 建 `src/features/<id>/manifest.ts`，再在 `src/features/index.ts` 加一行。
2. `FeatureManifest = { id, name, order, slots[], installStyles? }`；特性上下文 `FeatureCtx = { rpc, subscribe, refresh, meta, slots, get, pickDirectory? }`——特性只经它拿能力，不直连宿主、不引别的特性。
3. 新端点 = 在 `src/host/rpc.ts` 追加一个 `case`（命名 `im-companion.<feature>.<action>`），既有 case 不改。
4. 红线与自检：单文件 ≤300 行；共享层只加不改；`npm run check`（构建 ＋ 类型 ＋ 功能断言 ＋ 红线）全绿才算数。
5. 契约权威：`docs/features-contract.md`；领域词汇：`CONTEXT.md`。

给 AI 的用法提示：改状态走 `meta.*`；读状态走 `meta.get` ＋ `activity.snapshot`；装更新走 `imc.updateCheck` → `imc.updateInstall`；加功能走 L3。

<h2 align="center"><sub>FAQ</sub><br>常见问题</h2>

<details open>
<summary>更新之后还是旧版本？</summary>

这是桌面端的应用市场缓存策略导致的：刚发布的版本几小时内更新会静默跳过。等几小时再更新；等不及就显式指定官方源装一次：

```bash
dsh plugin --profile desktop add dsh-im-companion@latest --registry https://registry.npmjs.org
```

</details>

<h2 align="center"><sub>MORE</sub><br>作者的其他作品</h2>

<div align="center">

**[dsh-opencode-palette](https://github.com/FeatherHunter/dsh-opencode-palette)** —— 34 款 opencode 经典配色，一键换装

**[dsh-mattpocock-skills-deck](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck)** —— Matt Pocock 技能面板：25 个工程与效率技能即装即用

**[dsh-chinese-skill-patch](https://github.com/FeatherHunter/dsh-chinese-skill-patch)** —— 中文技能名直达，不必改英文名

**[dsh-prompt](https://github.com/FeatherHunter/dsh-prompt)** —— Prompt 工具箱：24 条深度模板随手点

---

有问题？[提交 ISSUE](https://github.com/FeatherHunter/dsh-im-companion/issues)，认领前先读 docs/agents 标签纪律。

MIT © FeatherHunter

</div>

<h2 align="center"><sub>THANKS</sub><br>致谢</h2>

<div align="left">

感谢每一位提交 Issue、PR 与参与讨论的朋友。

首个公开版（v0.1.0）尚无外部贡献名单，虚位以待——第一个提 Issue 的朋友，你的名字会写在这里。

也感谢上游 [dsh-im](https://github.com/xmanrui/dsh-im)：没有本体，就没有辅助。

</div>

<h2 align="center"><sub>CONNECT</sub><br>加入我们</h2>

<div align="center">

Bug 与需求请直接提 ISSUE，更高效可追溯。

[提交 ISSUE](https://github.com/FeatherHunter/dsh-im-companion/issues) · [上游 dsh-im](https://github.com/xmanrui/dsh-im)

<sub>话题群二维码待补——有群后这里放永久有效二维码。</sub>

</div>