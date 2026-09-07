# ADR-0001：内容真值 flags（P1–P3 落定）

- Status：**已接受（Accepted）** — 2026-09-07，#47 合议技术门全关（C1 86 + C2 90，双≥85 达线）＋ 用户拍板 P1–P3 落定
- 相关票：#47（内容真值方案深查第二轮·六路证伪）、#45（T4 原型，裁定出处）、#41（map）、#46（T5 执行票设计，待开工）

## Context（六路结论＋评审＋裁定）

第一轮 mtime 方案被废弃的教训＝调查只证实不证伪；本轮六路各带证伪条件（#47 矩阵）。

- **A 宿主解码可行性**：静态走通，运行时待验。host 可 `import node:zlib`，loader 不拦 builtin（三文件 node: 拦截零命中＋版本快照 hash 注记）；失败自动降级 mtime。残险收敛到首帧试解一次运行时确认。
- **B 性能预算实测**：预算冻结待重采。N=47 全解 363.8ms（尾 3 帧 3.7ms）；熔断 300ms 为单轮分片预算（冷启动天然多轮）；帧 cap（单文件 150ms 延后／2 万帧硬顶）为暂行，待巨文件校准。
- **C 真实 schema 验证**：未被证伪。蓝／黄成立（N=7→N=48：turn/start−end 计数差、retry 活性集、归一零冲突）；红全系待证（E4：blocked／max-tokens／interrupted 零样本）；R2 error-taxonomy＋R4–R10 落地。
- **D 真事件桥 E3**：静态不通，运行时待探。事件存在且在转发白名单（`api-session/status`＋`activity`），插件无 remote；静态侦察完成，运行时探针待并行 session 落定后执行。
- **E 会话视图源码映射**：DOM 定蓝黄分工。行无稳定 id（文本标题 best-effort 匹配）；绿点＝done 成功绿（非未读）；`stopped` 系工具行；双 TTL 清理记开工首项；系统黄优先。
- **F 持久化并发设计**：现状低风险。改名 `watermarks.json`；writer 懒构造为开工前置；host 单写者（写走端点＋广播），跨进程 last-wins 记 T5。

对抗评审（质量门：双≥85 且认可）：**C1 86/100 认可达线**（T7d 一行更正：收回“3.03MB 丢失”，认 session-d8eab4ca 标识＋漂移注记）＋ **C2 90/100 认可达线**（自我纠错 loader 行号＋fileRevision 两项返还扣分）。技术门全关。

用户裁定（#45 第 18–19 条评论，#47 第 12 条）：范围锁死左栏行（Fleet 不动）；红平级（红＋闪）；黄系统优先双路径（系统琥珀必黄／系统绿＋水位未看则黄）；点生命周期实证；**时间维度作废**（判据禁时间，mtime 仅作缓存版本号）；**aborted 中断红**（与 error 同级）。

## Decision（六条）

- **D1 · P1 废**：废弃“单例红永久占行”。C2-S2 三选一落定为 **B＋C**：B 会话消失即失效（归档／删除／配对丢失，机制事件非时间）；C 红配额制（同区行上只保留最近 1 个未 ack 红，更老自动转历史红进悬浮卡，不占行）。A 新 turn 内容顶替保留为活跃会话默认行为。“内容顶替满足 decay”原句收回。
- **D2 · P2 删**：删 STICKY。`STICKY_TTL_MS` 5 分钟冻结修法删除（时间作废令下无时间兜底；黄虚线瞬时扫描失败兜底取消，改水位／真相等级）；基础设施节拍 `SNAP_TTL_MS` 8s（快照缓存，非判据）保留。
- **D3 · P3 进 T5 池**：R7／E3 上游立案（P1 端点立案）**进 T5 需求池**，不卡 T5 前，不在本票提前开工。
- **D4 · flags 五态＋诊断正交**：`RowFlag=red｜blue｜yellow｜done｜none`（done=刚收尾边沿，聚合时等价 yellow 但 tip 与清除独立；none=诚实无色删属性），诊断 `diag=nosig｜nosig0｜null` 正交（只解释“为何无色”，永不改色）；红保留原因 `redReason=402/aborted/unknown-default`（approval 占位永不发出，P1 废），黄保留来源 `system-amber/native-dot/water-level/approval-wait`，蓝只保留 `running`；open 缺 closer 即蓝，水位无进展也不断蓝（写入阵发性；崩溃残留 open 鉴别交 E4）；行级蓝/黄主路径读原生 `svg[data-state]`（ongoing→蓝，warning→黄，与 sessionStatuses 同源，零 join 零像素扫描），真相标题 join 只负责红/收尾/待看；组色＝会话聚合不变量（展开组：组蓝/黄/红 ⇒ 必有同色会话行，无则清组旧色；收起组留 entry 汇总为例外）；红不进 PRIO，视图双通道并列呈现平级。
- **D5 · 展示时间删**：展示层删除时间。tip 仅状态词（删方向词与诊断行，nosig 诊断保留）；`RUN_WIN`／`SEEN_TTL`／`DOT_FRESH`／`RUNNING_WINDOW_MS`／`FRESH_MS`／配对文本天窗实现时删除（配对容差 :178 属配对机制，保留并正名）。mtime 仅作缓存版本号（三维键 `size:mtimeNs:尾帧 offset`，快路径 stat＋确认路径 magic 扫描）。
- **D6 · 无标题默认关**：无标题／不可归属会话真相默认**无色**（关闭染色）；数字标题精确匹配等证实路径为例外（best-effort 保留，行 id 精确记 T5）。

## Consequences

- T5（#46）执行票约束：先拆分再加码（guard 物理行口径：client 284 余 16 行，拆分完成前零新增行）；熔断／回填轮数公式／SLO 均为目标值；`readStableFile` 差异注记（官方 for(;;) vs R4 重试一次转未知）由执行票定稿；绝对计数一律带快照时间戳。
- E3（运行时探针）、E4（观察分类：收尾是否出现／是否合成，不再验收阈值）移出本合议，转 T4 后续验证与 T5 执行输入。
- #47 合议毕业：技术门＋拍板门全关，可 close（E3／E4 除外）。

## 证伪条件（任一命中即重开本 ADR 对应条目）

- E3 运行时探针打通（收到 `api-session/status`）：D1／D4 蓝路重议（蓝走官方事件，解码退备选）。
- E4／日常征集到 stale 红或 interrupted／blocked／max-tokens 正样本：红规则（D1／R2 表）重验。
- 巨文件校准推翻暂行值（cap／缓存键／8ms 目标值输入）：D5 键与 B 预算重定（对齐官方五维为备选已注记）。
- 同 tick 追加验收用例失败（size＋offset 均未变）：缓存键加尾 hash／ctimeNs 进键。
- 行稳定 id 被证实存在：D6 best-effort 匹配退役，换全 id 精确。
