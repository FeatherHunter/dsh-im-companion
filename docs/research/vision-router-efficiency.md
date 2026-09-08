# dsh-vision-router 使用效率机制调查

> 基线：`main` @ `c6e05dc30d14a1ab0c5e4172173beb570c5e1273`（2026-09-07，`chore(release): remove v2.1.3 dispatcher (#407)`），`package.json` version `2.1.3`。
> 方法：浅克隆仓库到本地后逐文件核对（`gh api` 取 releases/目录清单 + `git clone --depth 1` 读原文），只采信 README（中英互为镜像）、`docs/`、`index.js` / `lib/`、`tests/` 一手内容。
> 引用约定：`BLOB = https://github.com/ysr666/dsh-vision-router/blob/c6e05dc30d14a1ab0c5e4172173beb570c5e1273`，下文以 `文件:行号` 标注，链接均可拼到 `BLOB` 后面打开原文。

## 概述

Vision Router（v2.1.3）的效率设计围绕一句话：**云视觉调用是唯一稀缺资源（额度/钱/延迟），其他一切（本地 CPU、磁盘、工具 schema、历史文本）都应该替它省**。具体表现为五条主线：

1. **能不调云就不调**：答案缓存（content hash + question）、历史图片转文字描述复用、wrapper 默认不做自动视觉 pass、无缓存图片先走本地即时识别。
2. **调用了就要命中**：能力证据绑定 deployment 指纹后再谈 Auto 排序；无证据时老实按配置顺序走，不猜模型名；429 熔断 + 同轮失败记忆避免反复撞墙。
3. **本地算力代替云额度**：tesseract / sharp / potrace / system Chrome 全链路零 Python；Ollama → LM Studio 本地后端优先链。
4. **一次把事做完**：1–4 图单次 `vision_describe`、JSON 证据模式、1+x 结构化首 pass、fullPage 整页截图、长截图分片 OCR。
5. **别为省小钱花大钱**：14 工具默认常驻保 KV/prefix cache（默认 `progressiveTools: false`）；`vision_present`/guard-shadow 消毒历史，避免一条过期指令污染后续所有轮次。

## 机制清单表

| # | 机制 | 省什么 | 怎么开（默认/开关） | 来源 |
|---|------|--------|---------------------|------|
| 1 | `vision_describe` 答案缓存：按内容哈希 + question 做 key，LRU + TTL（默认 200 条 / 1h / 8MB、上限单条 1MB） | 省 token、省视觉调用次数、省时间（命中直接返回） | 默认开。`cache:true`、`cacheTtlSeconds:3600`、`cacheMaxEntries:200`；关掉即每次重调 | `index.js:9-13`（"results are cached by content hash + question"）、`index.js:1073`（`cacheKeyFor`）、`index.js:3222-3227`（建 cache）、`index.js:5297-5305`（命中）、`index.js:5403-5448`、`5546-5569`（写入）、`index.js:347-349`（schema 默认）、`README.md:73`、`:214`、`:370` |
| 2 | 成功答案缓存：只有成功答案进缓存，`ok:false` 的 `VISION_*` 后端故障不跨轮保留，修好凭证/后端后可立即重试 | 省时间（故障恢复后不再被旧失败卡住）、提成功率 | 内建行为，无开关（v2.1.2 起） | `docs/releases/v2.1.2.md`（"Keeps the `vision_describe` cache as a successful-answer cache…"） |
| 3 | 历史图片转描述复用：`rewriteHistoryImages` / `replaceImageBlocksWithMemory` 把历史图片块替换为"此前视觉内容记录（≤2000字）+ 不可信证据声明"，纯文本模型也能"记得"以前的图 | 省视觉调用次数、省 token（历史图不再随请求发送） | 默认开。`rewriteImages:true`；`false` 则关闭改写 | `index.js:1140-1162`、`:1164-1197`、`index.js:344`（schema）、`README.md:214`、`:363` |
| 4 | wrapper 默认不烧额度：整图轮的 wrapper 只改写**模型输入**中的图片块（缓存描述或紧凑标记），会话日志保留原图，绝不先做一次自动视觉识别；模型自己决定调不调视觉工具 | 省视觉调用次数（每图轮至少省 1 次） | 内建行为，无开关 | `index.js:2746-2760`（"never burns quota on an automatic vision pass"） |
| 5 | 即时本地识别（dsh-vision 并入）：无缓存图片先试本地 provider 即时描述，失败回退静态标记；结构化 1+x 开启时自动让路（不叠成 2+x） | 省视觉调用次数、省时间、省钱（本地零费用） | `instantDescribe` 相关配置 + 本地后端启用；`localDescribeStyle: plain/structured`（默认 `plain`） | `index.js:2756-2798`（`createWrapperStreamBody`）、`:3193`、`3240-3247`、`index.js:448`、`README.md:288-289` |
| 6 | 输入去重与归一：Web 剪贴板重复截图去重、图片类型按 magic bytes 校准；HTTP provider 列表去重；DSH 短附件 ID（`sha256:deadbeef` 形）解析回 canonical 附件（同 session、可消歧前缀、跨 session 隔离） | 省视觉调用次数、提成功率（防重复发送/防猜错文件） | 内建行为 | `docs/releases/v2.1.3.md`（clipboard intake）、`docs/releases/v2.1.2.md`（transcript ownership + attachment-handle）、`index.js:2287`（`dedupeHttpProviders`） |
| 7 | 复读循环守卫：`repetition-guard` 检测视觉后端语言生成死循环并熔断；分析限定前/中/尾采样、有界内存，不把检测器本身变成内存炸弹 | 省时间、省 token（截断无效长输出） | 内建行为；调用点在各视觉工具返回处 | `lib/repetition-guard.js:1-40`（注释与采样边界）、`index.js:5390`、`5429`、`5554` 等调用点、`tests/repetition-guard.test.js` |
| 8 | 稳定工具 schema（默认 14 工具常驻）：避免长会话中途工具列表膨胀导致 KV/prefix cache 前缀失效 | 省 token（长会话前缀缓存命中，省重算；不是省 schema 本身） | 默认 `progressiveTools:false`（composition 层 + `entry.js` 双保险）。`index.js` 内层 schema 默认是 `true`，被入口层覆盖为 `false`，以入口层为准 | `docs/progressive-tools-cache.md`（全文 38 行）、`README.md:216`、`:237`、`:243`、`:362`、`entry.js:21`、 `cordis.patch.yml:19`、`index.js:315`（内层默认 `true`，注意与入口层的区别） |
| 9 | `progressiveTools:true` 渐进挂载（高级 opt-in）：平时只暴露 `vision_activate`，首图轮再挂载全量工具，平时请求少带 schema | 省 token（短/无图会话的常驻 schema 开销） | **启动期配置**，写 profile/composition 的 `cordis.patch.yml` 后**重启 DSH**；运行中热切换无效 | `docs/progressive-tools-cache.md`、`README.md:237`、`index.js:5719`、`7178-7211`（`vision_activate` 定义与挂载语） |
| 10 | 能力感知 Auto 路由：`Authority → Evidence → Planner → Execution`；只在已配置+已授权候选中按实测证据做**相邻保守重排**（阈值 `AUTO_REORDER_MIN_ADVANTAGE = 0.08`），无证据回退配置顺序，绝不按模型名/品牌猜能力 | 提成功率（把请求送给真能看图的模型）、省 token（少走 fallback） | `routingMode: ordered`（默认）/`auto`；`routingPreference: balanced/quality/speed/local`；开 Auto 本身**不启动任何 Benchmark、不产生额外请求** | `docs/v2-capability-routing.md`（Authority/Evidence/Planner/Execution、阈值、默认 `ordered`+`off`）、`README.md:210`、`:348-349`、`lib/vision-capability-router.js`、`lib/vision-execution-order*.js`、`tests/vision-capability-router.test.js` |
| 11 | 供应商降级链：用户视觉模型（按行从上到下）→ 本地 Ollama → 本地 LM Studio → 自定义 `httpProviders` → 内置匿名 OVH 免费兜底（5 模型独立桶，理论 ~10 RPM） | 省钱（免费兜底）、提成功率（一个挂了自动下一个） | 默认即此顺序；`localOllama` / `localLmStudio` 默认关闭，按需启用；`freeFallback:true`（默认）追加 OVH；`freeCloudFirst:true`（默认关）把 OVH 免费提到云端最前 | `README.md:285-291`（链顺序与 OVH 五模型）、`index.js:2249-2277`（`orderedHttpProviders`）、`index.js:367-372`（schema）、`index.js:283`（默认内置对） |
| 12 | 429 熔断冷却（`Retry-After` 感知）：`RATE_LIMIT` 按凭证无关的短期冷却（默认 60s），`QUOTA` 按凭证域长期冷却（默认 10min）；`AUTH` 跳闸到凭证指纹变化；`INVALID_REQUEST` 本轮跳过该后端 | 省时间（不等死）、省视觉调用次数（冷却期内不重撞）、提成功率（429 立刻进下一个后端） | 内建行为，无开关；冷却时长为 `lib/vision-resilience.js` 默认常量 | `lib/vision-resilience.js`（`createVisionCircuitBreaker`、`defaultRateCooldownMs = 60*1000`、`defaultQuotaCooldownMs = 10*60*1000`）、`index.js:3258-3269`（装配注释）、`README.md:298` |
| 13 | 同轮失败记忆：同 session 同一轮里所有后端都失败后，后续视觉调用直接返回 `VISION_BACKEND_UNAVAILABLE_THIS_TURN`，零网络等待 | 省时间（坏后端不再把普通文本会话拖成几分钟）、省调用次数 | 内建行为（`createVisionTurnMemory` + `turnNumberOf` 与 harness 共用 turn 推导） | `lib/vision-resilience.js`（`createVisionTurnMemory`）、`index.js:3261-3279` |
| 14 | 超时三层预算：单次 provider 调用 `timeoutMs`（默认 120s）∩ 单视觉任务共享墙钟 `visionTaskTimeoutMs`（默认 120s，多后端串行也不叠加等待）∩ OCR 总预算 `ocrTimeoutMs`（默认 30s，其中 tesseract 最多 12s、视觉模型只用剩余部分）；整轮预算 `visionTurnBudgetMs` 默认 `0`（不限，避免误伤长推理） | 省时间（慢后端链有上限）、提成功率（慢模型 Benchmark 不被总墙钟误杀） | 默认值即推荐；`visionTaskTimeoutMs` UI 与 Host 校验已对齐（v2.0.1）；Benchmark 按 fixture 数缩放聚合 deadline | `index.js:350-359`（三层 schema 与注释）、`index.js:3146-3159`、`2082-2089`、`2639-2657`（执行侧取 min 与 round budget）、`README.md:368`、`:371`、`docs/releases/v2.0.1.md`、`docs/releases/v2.0.0.md`（Benchmark deadline 章节） |
| 15 | 并发/资源治理：大图资源压力与取消/超时回归覆盖；fetch 代理可撤销、断路器失败寿命显式化、扫描队列有界；前台真实视觉永远抢占后台测量（~30s 空闲恢复，手动 Benchmark ~15s 恢复； revoking 后台授权立即中止后续请求与写入） | 省时间（前台不排队）、省调用次数（关开关真停） | 内建行为；`backgroundBenchmarking: off`（默认）/`local-free`/`all` | `lib/image-resource-governor.js`（`scaledDimensions`、`DEFAULT_IMAGE_RESOURCE_MAX_BYPASSES = 2`）、`lib/turn-budget-context.js`、`lib/vision-runtime-performance.js`（中位延迟、按后端近 8 样本，供 balanced/speed 排序）、`docs/v2-capability-routing.md`（Background measurement）、`docs/releases/v2.1.0.md`（Runtime 章节）、`tests/large-image-resource-integration.test.js`、`tests/image-resource-governor.test.js`、`tests/qa-turn-budget-cancellation.test.js` |
| 16 | 查证深度档：`visionDepth` fast / standard / deep 只定**查证策略**，不隐式限次数；独立 `visionDepthMaxCalls` 安全阀由 structured-flow hardening 统一执行 | 省调用次数（fast 档少查证；cap 封顶防失控） | `visionDepth: standard`（默认）；`deep` 按需；cap 仅显式 `>0` 生效 | `index.js:305-308`、`3200-3204`、`4905-4913`、`README.md`（v2.1.0 "Fast / Standard / Deep" 章节见 `docs/releases/v2.1.0.md`） |
| 17 | 本地 OCR 优先：`vision_ocr` 的 `engine` 省略/`auto` **永远先试本地 tesseract（chi_sim+eng）**，失败或空结果才回退视觉模型；显式 `tesseract`/`vision` 被严格尊重；结构化模式不改变该顺序（v2.1.3 修复回归） | 省视觉调用次数、省钱、省时间（本地免费离线快） | 默认即此顺序，无需配置；tesseract 缺失时自动降级（需安
...[truncated 7371 chars]