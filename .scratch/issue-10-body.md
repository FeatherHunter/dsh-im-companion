Part of #1

## Question

矩阵视图：行=Agent、列=渠道、格=bot 状态/绑定；缩放策略（多 Agent×9 渠道）、行列排序、空态与钻取。

## Done when

矩阵渲染稳定、单元格点击可钻取行、窄屏降级方案；真机验收。

## 开工必读

先读 docs/features-contract.md（§0 最高原则 + §1 解耦九律）；认领即 assign @me；只写自己的目录、共享只加不改；完工前 npm run check 全绿 + 可移除性试验。提审等用户点头后才可关闭。

## 原型

分支：UI（what-should-this-look-like），sub-shape B 抛弃式单文件（无现成矩阵页可挂，按 B3 先例走 throwaway 文件）。

文件：prototypes/c1b-matrix/prototype-c1b-matrix.html（抛弃式，不进 main；决议后赢家折叠进真代码，原型归档 throwaway 分支）。

运行：双击打开，或 python -m http.server 8788 后访问 /prototypes/c1b-matrix/prototype-c1b-matrix.html?variant=A（B/C 经底部悬浮条或 ←/→ 键切换，URL 可分享、可回退）。

变体：A 稠密表（首列冻结 + 横滚，桌面扫表最快）；B 卡片热力（每 Agent 一卡，渠道芯片换行，窄屏零横滚）；C 主从钻取（左选 Agent、右看该行 9 渠道，聚焦排查）。

状态外显：每次操作重渲染 kv + JSON（variant / mock / 排序 / 选中 / 钻取 / 主题 / 宽度 / 计数）；点击只模拟派发 dsh-im-companion:open-drawer，不写真数据；内存态，无持久化。

验证：A / B / C / 空态（n=0）截图已过；点击钻取（3 Agent 稠密 24 格）弹抽屉替身 + JSON drill.open-drawer 已过（ui_drive）。

## Grilling

2026-09-03 用户选推荐项：三变体按 A/B/C 做；窄屏按 A 横滚 + B/C 堆叠 + 宽度滑杆（360px~1100px）；行按在线>待确认>离线>未绑定、组内按名，列固定 9 序（飞书/微信/QQ/Slack/Telegram/Discord/WhatsApp/钉钉/企微）；点格/行模拟钻取 C1a 抽屉；静态 mock + 控制条覆盖 0/3/8/12 Agent × 稀疏/稠密。

## Verdict（已锁定）

用户终评：初评 A 很漂亮 → 回复锁定 A。赢家 = A 稠密表（首列冻结 + 横滚），B/C 归档到 throwaway 分支。

## 实现（A 折叠进真代码）

新目录 src/features/c1b-matrix/（自包含，feature 间零 import）：data.ts（95 行，DOM-free 矩阵模型）/ view.ts（163 行，自注册 settings.section order 23 + 命令式稠密表 + React 壳）/ styles.ts（32 行，c1bm-*，dsw-alias 令牌仿 c1a）/ manifest.ts（14 行）。

自验证 tools/verify/features/c1b-matrix.ts（7/7 绿）：列 9 序同源 / 行排序未绑定独立沉底 / 格语义 / 空态 / 钻取载荷即 OPEN_DRAWER_EVENT / 状态文案 / 注册与命名空间。

触碰面（对照 R5 表，全追加零修改）：src/features/index.ts 加 1 import + 1 数组项；package.json verify 追加 1 个 && 项；零 A1 私有触碰（独立 section，解耦优先）；绑定取行级（真模型按工作区分组，key 与 C1a 同源可直钻）。

证据：build（host+client，含 React 壳打包）绿；自验证 6/6 绿；guard 76 文件红线绿；可移除性实测（5 新文件移走 + 3 行回退 → build+guard 照绿 → 已还原）。

评审（/implement 双轴，均 APPROVE with nits，均已修）：Spec 轴 10/10 规格项过，修空格/行头可钻取、表头角格冻结，汇总列记为接受的展示加法；Standards 轴解耦九律/术语/红线全过，修全局裸类 sp→c1bm-sp、状态文案抽 statusText、魔数 9→counts.channels、删无操作 map、注释 c1bm 缩写。

提交：master 3c0a251（本票 6 路径：4 新文件 + verify + index.ts/package.json 各 1 行追加；他票文件未碰）。

## 单入口改造（用户反馈双入口太多 → 小船方案，已锁定实现）

形态（终版）：单 section（IM机器人辅助）+ A1 toolbar 小船按钮（与刷新间距 12px）→ FLEET_VIEW_EVENT 事件 → DSH 正中大弹窗（宽版一次放下 9 列、无横向滚动；Esc/点外部/× 三路可关；开窗才订阅、关即退订）。装配层已还原零感知（例外收敛到只剩 A1 6 行）。

改名：矩阵总览 → 舰队雷达 Fleet Radar（tab/块标题/验收手册同步）。

双语（跟随 DSH 系统语言，无手动开关）：读 documentElement.lang（locale 插件同步点）+ 属性监听即时跟随，无则中文兜底；字典仍在 data.ts 纯函数：在线 Online、待确认 Pending、离线 Offline、未绑定 Unbound、未接入 Not connected、汇总 Summary、刷新 Refresh、关闭 Close、9 渠道英文名。

LOGO：表头文字前加 dsh-im 同款渠道 LOGO（9/9 全覆盖、未知回退纯文字；C1a 同渲染模式 html 注入）。修过一轮全白问题：7 枚单色 glyph 是 currentColor，跟深色文字一起变白；现配品牌色圆角底 + 白 glyph（dsh-im 设置页同款，飞书/企微白底衬多色标），提交 a5a88c5。再修一轮降噪：LOGO 只留表头做列锚，格子只剩圆点 + 文字（列身份已由表头建立，格内重复即噪音）；关闭钮移到刷新右边。提交 6b63c2b。

触碰面（契约 §10 例外，用户即审批人）：A1 panel.ts 仅加船按钮 + 事件派发 + 间距（不引矩阵、不改 mode）；icons.ts 加 ship 导出；config.ts 加 FLEET_VIEW_EVENT；index.ts 已还原零感知；矩阵事件制自管大弹窗（manifest 保留归属声明）。typecheck 零新增报错（仍仅 B1 预存 2 错）；render-client 全过；自验证 11/11；guard 全绿。

提交：master b93d504；c88a4ae（语言跟随 + LOGO）；a5a88c5（品牌色 LOGO 底）；6b63c2b（关闭右置 + 格子去 LOGO）。验收手册：prototypes/c1b-matrix/acceptance-c1b-matrix.html（绝对路径 D:\dsh-plugin\dsh-im-companion\prototypes\c1b-matrix\acceptance-c1b-matrix.html）。

原型归档：A/B/C 三变体原型 prototypes/c1b-matrix/prototype-c1b-matrix.html 留在主树（本仓惯例，契约 §8 prototypes/<id>/ 常驻； won A 已折叠进真代码）。

真机验收（用户多轮真机反馈即验收）：小船位置与手感 ✓、EN 跟随 ✓、彩色 LOGO ✓（返修过全白）、关闭右置 ✓、格子降噪 ✓。用户 2026-09-04 确认“本次需求开发完成”。

## 进度：100%

下一步：无（已关闭）。后续 LOGO 色差微调另开小票。

待确认：无（用户已终验点头）。

阻塞（非本票）：typecheck / verify 全链被 B1 hover-card.ts 预存 UIEvent 类型错挡住（clean HEAD 同红，他票文件，本票零新增报错、未碰）。

## 进度：98%

下一步：请用户真机验收（完全退出 DSH Desktop 再重开 + Ctrl+F5 → 设置页 IM机器人辅助 → 点 toolbar 小船进舰队雷达，按验收手册 7 场景走一遍：prototypes/c1b-matrix/acceptance-c1b-matrix.html）。

待确认（未确认不得 close）：真机验收通过；B1 预存红由他票修复（本票不代修他人文件）。
