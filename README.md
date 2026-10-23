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

# 锁定版本更稳（当前 0.2.22）
dsh plugin --profile desktop add dsh-im-companion@0.2.22 --registry https://registry.npmjs.org
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
dsh plugin --profile desktop add dsh-im-companion@0.2.22 --registry https://registry.npmjs.org
npx --yes @deepseek-ai/dsh plugin --profile desktop add dsh-im-companion
dsh plugin --profile desktop add dsh-im-companion@latest --registry https://registry.npmjs.org
```

</details>

升级 · 卸载：

```bash
dsh plugin --profile desktop update dsh-im-companion
dsh plugin --profile desktop remove dsh-im-companion
```


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

<div align="left">

**[dsh-opencode-palette](https://github.com/FeatherHunter/dsh-opencode-palette)** —— 38 款 opencode 经典配色 + 20+自定义主题 一键换装 DSH

**[dsh-mattpocock-skills-deck](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck)** —— 近 30 万 star 的 mattpocock/skills 整套预置好（27 个技能），装好即用。

**[dsh-prompt](https://github.com/FeatherHunter/dsh-prompt)** —— 经常反复重复的模板化提示词，存成自定义模板，选中后直接注入，不再需要耗费精力。

**[ilife](https://github.com/FeatherHunter/ilife)** —— 爱生活：居家生活套件，记账、运动、饮食、体重、食谱、物品管理、作息规划、备忘录等。⚠️建设中⚠️待正式发布

</div>

---

有任何问题、建议、意见、想法、IDEA、交流、吐槽，都欢迎[提交 ISSUE](https://github.com/FeatherHunter/dsh-im-companion/issues)！🌹

</div>

<h2 align="center"><sub>THANKS</sub><br>致谢</h2>

<div align="left">

感谢每一位提交 Issue、PR 与参与讨论的朋友。

<!-- THANKS-TABLE-ZH-START -->
| 贡献者 | 致敬 | 贡献 |
| --- | --- | --- |
| [@cxin21](https://github.com/cxin21) | 🌹🌹 | [#154](https://github.com/FeatherHunter/dsh-im-companion/issues/154) [#155](https://github.com/FeatherHunter/dsh-im-companion/issues/155) |
| [@vk-liu-cn-1](https://github.com/vk-liu-cn-1) | 🌹 | [#97](https://github.com/FeatherHunter/dsh-im-companion/issues/97) |
| [@Shimmernight](https://github.com/Shimmernight) | 🌹 | [#78](https://github.com/FeatherHunter/dsh-im-companion/issues/78) |
<!-- THANKS-TABLE-ZH-END -->

也感谢上游 [dsh-im](https://github.com/xmanrui/dsh-im)：没有本体，就没有本插件。

</div>

<h2 align="center"><sub>CONNECT</sub><br>加入我们</h2>

<div align="center">

Bug 与需求请直接提 ISSUE，更高效可追溯。

[提交 ISSUE](https://github.com/FeatherHunter/dsh-im-companion/issues) · [上游 dsh-im](https://github.com/xmanrui/dsh-im)

**👇 DSH插件交流群（飞书），扫码加入：**

<img src="assets/DSH插件交流群-飞书二维码.png" width="330" alt="DSH插件交流群飞书二维码">

</div>

---

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/FeatherHunter/dsh-im-companion/master/docs/star-history-dark.svg?v=20261021" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/FeatherHunter/dsh-im-companion/master/docs/star-history-light.svg?v=20261021" />
  <img alt="Star History Chart" width="720" src="https://raw.githubusercontent.com/FeatherHunter/dsh-im-companion/master/docs/star-history-light.svg?v=20261021" />
</picture>

<sub>左轴读总星标（Total Stars），右轴读每日新增（Daily New），每天自动更新。</sub>

</div>