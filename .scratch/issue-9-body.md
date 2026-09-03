Part of #1

## Question

从 A1 行打开 Agent 详情抽屉（右侧 sheet）：预设、上下文增强、绑定工作区、会话路由摘要、渠道管理；哪些进抽屉、哪些留在行内？

## Context

R3 会话路由事实可用；A1 缺口表已把身份配置划给本卡。

## Done when

抽屉可开合、编辑经 dsh-im RPC（bot.preset.set 等）、状态刷新一致；真机验收。

## 原型（抛弃式，不进 main）

分支判定：UI（界面应该长什么样 → 同路由多变体 + 底部悬浮切换；子形态 B：抽屉尚无既有路由，以单文件 mock DSH 壳承载 A1 行 + 右侧 sheet）。

文件：prototype-c1a-drawer.html，位于 throwaway/c1a-drawer 分支（已推送）。切到该分支后双击打开，或 python -m http.server 8788 后访问 /prototype-c1a-drawer.html?variant=A；A / B / C 切换（← / → 亦可，?prod=1 隐藏切换条）。

三变体：A 全量进抽屉（行内仅状态 + 接入 + 详情）；B 摘要 + 折叠（行内保留渠道胶囊 + 换绑快捷）；C 渠道 × 能力矩阵（行内保留全部快捷，抽屉批量运维）。

Grilling 共识（2026-09-03，四问全按推荐确认）：变体 A / B / C；mock 数据（预设下拉 + 自定义名、上下文开关 + 三档、绑定路径 + 换绑、路由 2 私聊 + 2 群聊、渠道行接入 / 解绑）；全可点 + 内存态 + 每次操作后 State 面板外显完整 JSON；落点本单文件。

自验证：HTML / JS 解析通过；A / B / C 三变体截图渲染正常，结构差异成立；实测点击上下文开关后 JSON 中 enabled true → false，?variant=A 保持。

修订 v2（2026-09-03 真机截图约束）：mock 壳收窄至设置弹窗真机尺寸（弹窗约 940 / 导航 190 / 内容约 730），抽屉由并排改为覆盖式 360px；A / B 复验截图通过，行宽不再被挤；归档 throwaway/c1a-drawer（v2=864b8d3）。

修订 v3（B 反馈 2026-09-03）：行右侧状态固定 70px 右对齐（按钮跨行对齐）、「… 详情」→「详情」；DOM 实测通过（按钮文本=详情、min-width=70px；截图通道返回缓存图，以 DOM 为准）；归档 v3=02cfc99。方向：B 基本满意，待最终 verdict。

注：并行 session 的 git add -A 曾把 v2 内容扫入 master（d6babea），属 cross-session 污染；规范归档仍以 throwaway 分支为准，master 侧 placement 由迁移 session 定夺。

归档：决议后赢家重写进真代码，落选变体随原型留在 throwaway/c1a-drawer 分支。

## 评审（对抗式 2026-09-03，真机验收前）

结论：B 有条件成立；verdict 系于 P0-1。

P0（不定就返工）：P0-1 preset / 上下文增强的消费者与落点（dsh-im 有无对应能力？若 companion meta 自持、谁来读？src 零命中、host 仅 meta.* / fs.*；答错则 B 摘要卡失去核心、verdict 翻转）；P0-2 保存语义（即时写§4 vs 批量保存，原型里保存按钮可能是错的）；P0-3 抽屉在 15s 刷新 / 写后 refresh 下的存活与数据语义（原型从未建模刷新）；P0-4 Sheet 机制（shell.overlay 在 src 零命中，三选一）；P0-5 E3 双向等待死锁（E3 待 #9 关，#9 承接 E3 seat，且落点本身是 E3 的问题）。

P1（实现票必须含）：A1 行改动走 §10 例外单 PR；长名称 / 长路径溢出（mock 全短路径，原型在撒谎）；多渠道测试消息目标；原型搬家 prototypes/c1a/（§8）；R3 证据落盘（research 输出不在仓库）；“状态刷新一致”可测化。

P2（接受 / 观察）：深色 token 对齐；D1 双写工作区显示；截图缓存（本地双击无影响）。

v4 候选：压力数据行（超长名 / 路径 / 3 渠道）+ 保存语义切换开关；待用户点头。

## 实现（提审 95%，未验收不 close）

verdict：B（含 v3）+ 即时写（无保存按钮）。

改动（commit 3fd88a7，17 文件 +875/-7）：features/c1a（manifest/data/view/drawer/styles，最大 222 行）；新原语 ui/sheet.ts；host presets/ctxEnhance 持久化 + meta.preset.set/meta.ctx.set；client meta 双实现 + OPEN_DRAWER_EVENT；FEATURES 注册 + protocol refresh（契约 §2 已同步）；verify features/c1a-drawer.ts 6 用例。

触碰面自述：共享全加法，无既有签名行为改动；唯一例外触碰 = agent-row.ts 详情按钮 + 事件派发（+20/-1，理由：抽屉入口必须落在 A1 行，事件解耦无反向依赖）；package.json 仅 verify 脚本行。

偏离 B mock（8 项，实现时定）：无保存按钮 / 无 +接入 / 换绑 = 路径输入 / 无清空解绑 / 路由 E3 空席 / 测试消息同 B3 语义 / 自研 sheet / 刷新保活（订阅重渲染、无草稿）。

证据：npm run check 全绿（build + typecheck + verify render-client/left-badges 8/c1a 6 + guard max299）；Standards 复审 approve-with-notes（11 条已修）；可移除性验证通过（隔离环境删 c1a 后 check 全绿）。

体验修复（真机反馈，commit 7e274d8/4c76509）：抽屉由视口右沿改为贴设置面板右沿；场景 1 真机翻车（点详情无反应无 toast）转守为攻——harness 复现确认数据就绪链路正常，空数据静默关闭是根因，改为加载态等待 + 8s 超时人话 toast + 中途消失 toast 关闭（红线拆分合规）（量 .af-root 矩形反推四边 + resize 跟随，找不到面板回兜底；verify 7/7）。

待确认：① 真机验收（完全退出 DSH 重开 + Ctrl+F5：行内详情按钮 → 抽屉开合 → 改预设/上下文即时生效 → 15s 刷新不丢抽屉）；② Spec 复审子代理两次无声失败，转自我覆盖（映射如上），后续有异另起 fixup；③ dsh-im 上游 preset/ctx 能力 research（并行，不阻塞验收）。

## 进度：95%

下一步：请确认变体 verdict（A / B / C 或拼装，如 B 的行 + C 的矩阵），并确认预设与上下文增强的真实 RPC shape（当前为 mock：预设单选 + 自定义名、上下文开关 + 精简 / 均衡 / 详尽三档）。

待确认：见实现节三项；真机验收前不 close。
