# CHANGELOG

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
