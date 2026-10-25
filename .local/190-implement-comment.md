## 实施完成 · 待真机验收（2026-10-25 03:15，AI）

**状态**：按 Agent Brief 与拍板结论（Q1=A / Q2=A 轻量 + 有配置头像显示头像 / Q3=B / Q4=A 两档）实现完毕；`npm run check` 全绿；**尚未提交、未关闭**（等真机验收点头）。

### 改动清单（仅 left-badges feature + 其 verify）
- 新增 `src/features/left-badges/panel-identity.ts`（65 行）：面板身份镜像（家/助理色板、房子/机器人字形逐字镜像，避免 feature 引 A1 私有层）。
- 新增 `src/features/left-badges/card-model.ts`（168 行）：实体驱动卡片数据——家行 + 助理行（已绑/未绑定）+ 游离机器人行（未归属 / 无助理两档）；无绑定 bot 的家也出卡。
- 新增 `src/features/left-badges/card-render.ts`（116 行）：家行（房子图标/上传图）+ 轻量分隔线 + 三类行 + 脚注渲染。
- 改 `assistant-face.ts`（128 行）：无图助理 = 机器人字形 + 暖亮色板（面板同口径）；有配置头像优先显示头像；`snapshot()` 把家表/助理表/图片直通给卡片。
- 改 `hover-card.ts`（189 行）：只留生命周期/定位/事件；数据与渲染分别搬进 card-model / card-render。
- 改 `view.ts`（268 行）：resolve = snapshot → `buildCardData`；行徽标、筛选、轮询均未动。
- 改 `styles.ts`（57 行）：分隔线、未绑定虚线、机器人字形、档位标签。
- 改 `tools/verify/features/left-badges.ts`（701 行）：parity 升级到 kind 口径 + 新增三态/两档/结构断言；29 测全过。

### 门禁证据
- `npm run check` = build + typecheck + verify + guard **全绿**（exit 0）。
- 300 行红线：feature 文件最大 268 行（view.ts）。
- 解耦：无 A1 私有 import、无新增轮询/数据源（复用既有 `home.list` / `avatar.get`）。
- i18n 债（#184）：新增「未绑定 / 未归属 / 无助理」三条中文文案，待 #184 统一。

### 验收环境（已处理）
- desktop profile 当前是 **Junction → 本仓**（发现原为真安装 0.2.25 普通目录，client hash 与仓不一致，已按 AGENTS.md 配方切回；原目录备份 `D:\Temp\190-accept-2026-10-25\dsh-im-companion-real-0.2.25`）。
- 生效门：profile 的 `lib/client.js` sha256 = `D156C0E5E8691D05D2C48E418584CE0DCF3185235EF8E28DDD39F2A494403D`（1,160,064 B），与仓一致（等同 Junction 下天然一致）。

### 请验收（Ctrl+F5 刷新页面后逐项核对）
1. 家行：无上传图 = 房子图标 + 家色板；有上传图 = 图片。
2. 家行与助理行之间：只有一条轻量分隔线，无新增文字标签。
3. 已绑助理：渠道 logo + 面板助理身份（有配置头像显示头像）+ 状态点；「小洋」等保持现状。
4. 未绑定助理：灰化虚线 + 「未绑定」，无状态点（如「调色板🎨」）。
5. 游离机器人：「微信机器人」显示「未归属」机器人行；无匹配助理显示「无助理」；均用机器人字形、不用助理名/脸。
6. 行徽标「未绑定」与「有助理/无助理」筛选口径不变。

验收通过后我会：提交代码（仅本票 left-badges 相关文件）→ 更新票面并关闭 #190。若某项不符，请指出，我改到通过为止。