# Wayfinder Map — dsh-im-companion 高解耦功能地图

> 每功能一票（一票一 session）；第一核心原则：**高度解耦、可封装必封装、单源码文件 ≤300 行**；通过契约把可并发的功能拆到独立 session 独立开发。

## Destination

把 11 项方案（A1→B1..E4）逐一落地为 dsh-im 解耦伴生插件功能；每个功能=一个票=一个独立可开发模块（src/features/<feature>/ 形态），模块间仅通过约定契约（共享包边界 / 挂载点 / host 桥端点规范）交互，任何两个功能可在不同 session 并发开发，单文件 ≤300 行（构建产物 lib/ 豁免）。

## Notes

- **开工必读**：docs/features-contract.md（§0 最高原则 + §1 解耦七律）——每个 session 开工前先读，AGENTS.md 已自动注入指针。

- 领域：CONTEXT.md（Agent/Workspace/Bot/Channel/Session/Health/Binding/Fleet）+ 新增 Feature/契约/红线 术语。
- 技能：每票必读 dsh-plugin-ui-debug（真机闭环）、codebase-design + domain-modeling（解耦）、prototype（交互稿）；研究类用 research。
- 覆盖默认 Plan-don-do：本 effort 闭环 = 决策 + 实现 + 预览/注入验证 + 用户真机验收（一次一卡）。
- 已完成基础（A1 已交付 2026-09-02）：Apple 风格 UI、全 TS、host 桥（/im-companion：meta.* + fs.*）、连接采集、两态聚合、接入 QR 闭环、选家、解绑、红线 300 行（A1 拆分票收编 panel.ts 342→≤300）。
- 追踪器：GitHub（FeatherHunter/dsh-im-companion）原生子议题 + 原生依赖。

## Decisions so far

- **F0 解耦契约**（2026-09-02 决议，docs/features-contract.md）：features/<id>/manifest 协议；共享层只加导出；单份轮询订阅流；host 端点 im-companion.<feature>.<action>；红线 ≤300 行（豁免 lib/tools/.scratch/docs）；并发布局确认 R5 四线 + 先合并点清单。

- A1 三态聚合（2026-09-02 交付）：按工作区与按Agent 重复 → 砍为两态（按Agent/按渠道）；渠道视图=分区头+组内 Agent 列表、渠道头像与 dsh-im 一致、不改名/头像；头像菜单=头像右下角+可见项；接入=QR 三步闭环；选家=系统对话框+host 桥目录浏览器；解绑=bot.delete 二次确认；排序=在线优先；刷新=15s 轮询+手动+更新于。
- R1 workspaces/RPC 通路：host 直读盘可读、写走渠道 RPC、无 push（15s 轮询）→ research/01。
- R2 slots/DOM：settings.section 组件必须返回 React 元素 → research/02。
- R3 会话路由：sessionFor 事实（E3 依据）→ research/03。
- R4 host 桥：任意插件可注册非渠道前缀 → /im-companion；rpc.handle 契约 + 信封 + dispose 入 ctx.effect → research/04。

## Not yet specified

- （无：F0 决议后地图内已无未定型决策；后续雾由各功能票渐进产生）

- （已毕业→F0 决议）共享数据流=单份轮询订阅；端点前缀=im-companion.<feature>.<action>。
- （已毕业）F0 一并裁定：见上。

## Out of scope

- Ctrl+K 命令面板（与 DSH 原生冲突，已砍）。
- 1 workspace = N Agent（与 D1 约束冲突）。
- 已托管语义/词汇（一律已绑定/未绑定）。
- xmanrui/dsh-im 上游合入（本 effort 零改动 dsh-im）。

## 进度：30%

下一步：认领 A 线 B1（#6，奠基）或 AFK 票 #5/#16；F0/R5 已决、子议题关联已修复（14/14）。