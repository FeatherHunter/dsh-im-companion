# CHANGELOG

## v0.1.4 — 2026-09-08

主题：接入双模式（扫码/手动二选一，按渠道能力隐藏）落地；一键收起与串门搬家入口随包；Wayfinder Map #65 收尾关闭。

提炼：

- package.json / package-lock.json 0.1.3 → 0.1.4；README 中英文版本锁同步到 0.1.4。
- 接入双模式（#65 map T1–T4 全关）：9 渠道能力矩阵单点（4 双支持 feishu/dingtalk/qq/wecom、2 仅扫码 weixin/whatsapp、3 仅手动 slack/telegram/discord）；双支持渠道弹窗内二选一（扫码创建 / 手动填写），可来回切换；单支持渠道一步直达；手动走各渠道 `bot.bind-credentials`、成功复用绑定落定编排，失败留表单脱敏可重试；8 键中英文案，扫码页既有行为一字未动。
- 一键收起左栏可见工作区分组（#64）：筛选条旁同行按钮，只收当前可见展开组。
- 舰队面板工具栏「串门搬家」入口：事件制派发，adopt 特性自开面板。
- 配置页右上版本小字自动变为 v0.1.4（package.json 唯一真相，构建时注入）。
- 对应提交：见 GitHub Release v0.1.4 附件与提交历史。

验证与影响：

- `npm run check` 全绿（connect-qr 30/30、first-view 12/12、guard 101 文件 max≤300）；本仓 / web / desktop 三方 bundle sha256 一致。
- 手动绑定走既有 rpc 通道调上游 `bot.bind-credentials`，无新增契约通道；共享层 Added-only。

## v0.1.3 — 2026-09-09

主题：创建时强制选家断裂修复与新建空工作区红虚线修复随包；README 版式（ hero 双图 + 三色竖条）同步。

提炼：

- package.json / package-lock.json 0.1.2 → 0.1.3；README 中英文版本锁同步到 0.1.3。
- 修复 BUG · 新建工作区左侧出现红色虚线：已匹配但无会话数据不再用红色告警表达，与平静一致无条。
- 修复 BUG · 飞书绑定后取消工作区选择导致 Agent 无法关联：创建时强制选 HOME，扫码直绑不断裂；创建表单双行、选家行醒目化、缺件原因直说、成功即收单失败留单。
- README：hero 双图并排 + 蓝橙双栏、三色竖条接线、折叠态截图资源。
- 配置页右上版本小字自动变为 v0.1.3（package.json 唯一真相，构建时注入）。
- 对应提交：见 GitHub Release v0.1.3 附件与提交历史。

验证与影响：

- `npm run check` 全绿。
- 无新增契约通道与行为契约变更；纯修复 + 文档随包。

## v0.1.2 — 2026-09-08

主题：版本号 +1 并在配置页右上角显示版本；命名统一为 IM机器人增强；修复展开态工作组蓝条 lingering。

提炼：

- package.json / package-lock.json 0.1.1 → 0.1.2；README 中英文版本锁同步到 0.1.2。
- 配置页标题行右上新增版本小字 v0.1.2（package.json 唯一真相，构建时注入；点跳仓库首页）。
- 新增 Issue 反馈按钮（跳 `/issues/new`），与 Star 同组右对齐；右组 `margin-left: auto` + 窄窗换行，对标 dsh-mattpocock-skills-deck SettingsPage。
- 命名统一：面板大标题与设置侧栏入口均称 IM机器人增强（英文 IM Companion）。
- 修复展开态工作组蓝条 lingering（#57）：零归因行时不再恢复收起缓存旧蓝（entry-exec tiebreaker）；design-preview 转正并正名。
- 对应提交：见 GitHub Release v0.1.2 附件与提交历史。

验证与影响：

- `npm run check` 全绿。
- 无新增契约通道与行为契约变更。

## v0.1.1 — 2026-09-05

主题：许可证换 MIT、README 打磨定稿、换绑修复随包。

提炼：

- 许可证 BSD-3-Clause 换 MIT（声明文件、包元数据、中英文落款同步）。
- README：标语与 WHY 定稿（助理和家）、14 图 14 引导、去实现细节、用户视角、英文一比一对译。
- 修复 adopt 换绑成功后巷子口暂存不清理（#39）。
- 修复重装配时路由重复注册抛错：让路已注册实例（fail-closed）。
- 对应提交：见 GitHub Release v0.1.1 附件与提交历史。

验证与影响：

- npm pack --dry-run 仅含白名单，无密钥与多余文档。
- `npm run check` 全绿。
- 纯文档＋元数据＋单行修复，无破坏契约。

## v0.1.0 — 2026-09-04

主题：首个公开版：README 全量对齐 Deck 版式与发布通道打通。

提炼：

- README 仿 dsh-mattpocock-skills-deck 版式重写（INSTALL / WHY / IN ACTION / FAQ / ARCHITECTURE / DEVELOPMENT / MORE / THANKS / CONNECT），4 张现货截图 + 首屏图全部落位。
- 发布阻断项修复：cordis.patch.yml 空数组补 insert（id: dsh-im-companion），files 白名单补 cordis.patch.yml，private 设 false，description 与 GitHub About 同源，keywords 补 dsh / dsh-plugin。
- 新增发布向导 scripts/wizard-release.sh（6 段，只扫码）与 scripts/publish-interactive.ps1（Windows 交互窗口发布）。
- 对应提交：见 GitHub Release v0.1.0 附件与提交历史。

验证与影响：

- npm pack --dry-run 仅含白名单（lib + cordis.patch.yml + README + package.json），无密钥与多余文档。
- 卸载即净：dsh plugin remove 自动移除 bundle 条目与面板行为。
- 本体零侵入：不改 dsh-im 一行代码。
