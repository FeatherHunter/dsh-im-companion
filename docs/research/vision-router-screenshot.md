# dsh-vision-router 截图功能调查

> 基线：`ysr666/dsh-vision-router` @ commit `c6e05dc`（main，package `2.1.3`，2026-09-07 取证）。
> 仓库：https://github.com/ysr666/dsh-vision-router
> 方法：只采信一手来源——README、`docs/`、源码（`index.js` 为打包入口，`lib/` 为可读分模块源码）、`tests/`、`assets/` 示例、GitHub issue/PR。
> 行号均指该 commit 下的文件。GitHub blob 链接形如 `.../blob/main/<path>#Lx`，均可在仓库中直接定位。

---

## 1. 概述（来源：README L47–L108、L240–L243；`docs/releases/v2.1.3.md`）

- dsh-vision-router 是 DSH（DeepSeek Harness）插件，提供 **Settings → Vision Router** 设置面 + 一套 `vision_*` 模型可调用工具：图示覆盖 11 个图像处理工具，`vision_present`（持久化图片投递）与 `vision_bootstrap`（可选 1+x 结构化首遍）使**默认深工具集达到 14 个**；隐私门控的 `vision_screenshot` 在启动时按需加入，成为**可选的第 15 个工具**。（来源：[README#工具表](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L240-L243)）
- 全链路 **No Python**：降采样、定位、裁剪、像素对比、取色、OCR、SVG 描摹、抠图、HTML 截图全部跑在 sharp / potrace / tesseract / 系统 Chrome 上。（来源：[README L71](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L71)）
- 连续多步图像工作是常态：一轮 image turn 即一轮 text turn + 多次工具调用（`vision_ground` → `vision_crop` → `vision_describe` → `vision_pixel_diff` → 修复 → 再截图），agent 迭代到收敛为止。（来源：[README L72](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L72)）
- 设计致谢（非自研部分的归属）：深视觉工具层与 UI 还原工作流借鉴了 `Anionex/agent-vision-toolkit` 及其 DSH 原生实现（含意图驱动选工具、渐进式工具暴露、pixel-diff 验证循环、long-screenshot OCR/前景提取/HTML 截图的分解与命名）；本地视觉后端（Ollama/LM Studio 双后端、结构化识别、截屏识别等）设计继承自 `dsh-vision`（shaoqiuyuavailable），再并入 HTTP vision chain。（来源：[README L108](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L108)、[README L380](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L380)）
- 当前版本语义以 **v2.1.3「Structured 1+x 可靠性」**为准：`structured-flow-hardening` 是唯一的 bootstrap 后完成权威，`recommended_followups` 只是任务无关建议，`vision_ocr` 全局恢复 tesseract-优先的公开契约。（来源：[docs/releases/v2.1.3.md](https://github.com/ysr666/dsh-vision-router/blob/main/docs/releases/v2.1.3.md)）

---

## 2. 工具清单表（来源：README L245–L281；`index.js` 各工具定义）

| 工具 | 作用 | 关键参数 | 产物 |
|---|---|---|---|
| `vision_bootstrap` | 可选 1+x 结构化首次视觉遍历；任务无关证据基线，成功后**必须**再做 ≥1 次针对性证据调用 | `paths` / `attachmentIds`（共 1–4 张） | 无文件；返回 `evidence{visual_kind, overview, regions, visible_text, entities, relationships, uncertainties, recommended_followups, content_kind, mixed_of}` + `next` |
| `vision_describe` | 看图问答 / 多图对比 / `json:true` 结构化证据模式 | `paths`, `attachmentIds`, `question`（必填）, `json` | 无文件（文本答案） |
| `vision_materialize` | 把已授权附件落盘为工作区真实路径，供只认 `file_path` 的本地 OCR/解析器；**不做任何 vision/网络调用**（issue #153 引入） | `image`（必填，推荐 `sha256:…`） | 工作区图片拷贝 |
| `vision_ground` | 定位目标 → **原图像素框 x1/y1/x2/y2** | `image`（必填）, `target`（必填）, `annotate`（默认 true） | 可选标注 PNG |
| `vision_detect` | 按种类盘点全部元素（按钮/输入框/链接…），编号清单 + 原像素框，后续可用“元素 #n”引用 | `image`（必填）, `target`, `annotate`（默认 true） | 编号标注 PNG |
| `vision_crop` | 按原像素框裁剪放大细看；超大区域渲染为有界预览 | `image`（必填）, `region`（必填，`"x1,y1,x2,y2"`） | PNG（超限时附 `preview:true` + 缩放建议） |
| `vision_present` | **强制呈现规则**：凡要让用户看到的生成/编辑/截图/导出图，必须调它；`read_image` 只读不送 | `image`（必填）, `label` | 附件图片（会话 UI 常驻） |
| `vision_pixel_diff` | sharp 逐像素对比：差异比 + 最差 8×8 网格区 | `original`（必填）, `rebuilt`（必填）, `threshold`（默认 16/通道） | 红色热力 PNG + JSON 报告 |
| `vision_colors` | 主色提取（hex + 占比），UI 还原取色 | `image`, `top`（默认 8） | 无文件 |
| `vision_ocr` | 文字转录：省略/`auto` **永远先本地 tesseract（chi_sim+eng），失败或空结果才回退 vision 模型**；只读字母，不认人/物/场景 | `image`, `engine`（`auto`/`tesseract`/`vision`，显式值恒被尊重） | 无文件（`{engine, text}`） |
| `vision_trace` | potrace 矢量化为 SVG（图标/logo）；默认保留彩色（每主色一条 path） | `image`, `color`（默认 true）, `colors`（默认 8）, `steps`（1–16，默认 4，仅 `color=false` 时） | SVG |
| `vision_extract_foreground` | 边框漫水填充去纯色背景抠图 | `image`, `tolerance`（默认 40） | 透明 PNG |
| `vision_html_screenshot` | 系统 Chrome 无头渲染本地 `.html/.htm` 并截图；`fullPage:true` 截整页并回 `pageHeight`（CSS px） | `source`（必填）, `width`（默认 1200）, `height`（默认 720）, `fullPage` | PNG |
| `vision_screenshot` | **默认禁用，需显式 opt-in** 的桌面截屏（本文件 §3 详述） | `identify`（默认 false，启用本地后端做截屏后识别） | PNG（+ 可选识别文本） |
| `vision_long_screenshot_ocr` | 长截图（聊天记录/长文档）水平重叠分片 OCR 后拼成有序 Markdown | `image`, `chunkHeight`（默认 1200，范围 400–2000）, `overlap`（默认 120）, `engine` | 分片 PNG + Markdown + manifest |
| `vision_activate`（会话助手） | 仅 `progressiveTools:true` 时可见；图片轮自动挂载，纯文字轮需手动调一次挂载深工具 | 无 | — |

- 工具表原文与调用速查：[README L245–L281](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L245-L281)。
- 各工具 `description`/`parameters` 第一手定义：`index.js` L5121（describe）、L5627（bootstrap）、L5797（materialize）、L6030（ground）、L6120（detect）、L6190（crop）、L6266（present）、L6323（pixel_diff）、L6466（colors）、L6495（ocr）、L6571（long OCR）、L6764（trace）、L6823（extract_foreground）、L6864（html_screenshot）、L6971（screenshot）、L7178（activate）。在线浏览：https://github.com/ysr666/dsh-vision-router/blob/main/index.js
- 调用顺序总纲（skill `vision-tools`，模型可见）：定位与细看用 `ground → crop → describe`，`detect` 做盘点；还原验证循环为 参考图 → 实现 → `html_screenshot` → `pixel_diff` → 修复 → 再截图；`fullPage:true` 一次截整页；所有坐标均为原图像素；上传图可直接用附件 ID 当 `image` 参数。（来源：[index.js L7207–L7231](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7207-L7231)）
- `vision_bootstrap` 1+x 铁律（工具定义原文）：启用「Structured bootstrap / 结构化预识别」时**首个视觉调用必须是它**，不得先选 OCR/文档/UI/代码模式；它只做一次任务无关的详细结构化遍历；成功后**必须**至少调用一个任务导向的证据/深挖工具（`x >= 1`），之后按需继续——“这是 1+x，不是 one-shot bootstrap”。（来源：[index.js L5628–L5634](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L5628-L5634)）
- 门控实现：深工具执行包装器在 bootstrap 未完成前拦截其他视觉工具，返回 `ok:false` + `STRUCTURED_BOOTSTRAP_REQUIRED`（`retryable:true`）；若 bootstrap 本身后端失败则返回 `STRUCTURED_BOOTSTRAP_FAILED`（`retryable:false`，本轮停调）。（来源：[index.js L7145–L7157](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7145-L7157)；提醒文案 [lib/runtime-i18n.js L11/L36](https://github.com/ysr666/dsh-vision-router/blob/main/lib/runtime-i18n.js)）
- 完成权威唯一：`lib/structured-flow-hardening.js` 以 `postBootstrapEvidenceCalls >= 1` 为唯一的硬完成条件；bootstrap 之前收集的证据即使成功也不能抵 `x>=1`（可计入显式调用上限）。（来源：[tests/structured-bootstrap-gate.test.js](https://github.com/ysr666/dsh-vision-router/blob/main/tests/structured-bootstrap-gate.test.js)、[docs/releases/v2.1.3.md](https://github.com/ysr666/dsh-vision-router/blob/main/docs/releases/v2.1.3.md)）
- Bootstrap 内部就是一次专用 prompt 的 describe 调用（`json:false`，bootstrap prompt 自带专用结构化契约），`ok:false` 直接透传并标记本轮失败。（来源：[index.js L5655–L5686](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L5655-L5686)）
- OCR 引擎语义注意：PR #391 曾短暂改为“结构化跟进 + auto → 直接走 vision”，但 **v2.1.3 已推翻**，恢复“省略/`auto` 永远 tesseract 优先、失败/空才回退 vision，结构化模式不改顺序”，以 `index.js` 当前代码（L6524–L6567）与 release notes 为准。（来源：[index.js L6497–L6510](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6497-L6510)、[docs/releases/v2.1.3.md](https://github.com/ysr666/dsh-vision-router/blob/main/docs/releases/v2.1.3.md)、[PR #391](https://github.com/ysr666/dsh-vision-router/pull/391) 仅作历史参考）

---

## 3. 开启步骤：`vision_screenshot` 与隐私门（来源：README L260/L335/L364/L411/L420；`index.js` L6966–L6995；`lib/local-vision-stabilizer.js`；PR #146/#342）

1. **位置**：Settings → Vision Router → **Local & Device** 页，有 Ollama / LM Studio 与隐私门控的桌面截图开关。（来源：[README L335](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L335)、[lib/client.js L214/L488 开关文案](https://github.com/ysr666/dsh-vision-router/blob/main/lib/client.js)、[lib/settings-ia-client-prelude.js L258 本地与设备页](https://github.com/ysr666/dsh-vision-router/blob/main/lib/settings-ia-client-prelude.js)）
2. **默认关闭**：配置项 `desktopScreenshot` 默认为 `false`，是“模型可调用 `vision_screenshot` 的隐私 opt-in，每次捕获前实时检查”。（来源：[README L364](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L364)）
3. **工具按开关挂载**：core 仅在 `desktopScreenshot === true` 时才把 `vision_screenshot` 注册进深工具集，保证关闭时模型可见工具集（token/前缀缓存）完全不变；注释称改开关需重启。（来源：[index.js L6966–L6969](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6966-L6969)；配套的运行时挂载同步见 [lib/local-vision-stabilizer.js L101–L115](https://github.com/ysr666/dsh-vision-router/blob/main/lib/local-vision-stabilizer.js#L101-L115)，构造期以 `desktopScreenshot:true` 的 `bootConfig` 预构建定义以备后挂载 L121）
4. **双层执行守卫**：关闭时调用直接抛错 `vision_screenshot is disabled; enable Desktop screenshot explicitly…`（[index.js L6991–L6995](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6991-L6995)）；另有全局 vision 总开关 `tool===false` 守卫（[lib/local-vision-stabilizer.js L136–L144](https://github.com/ysr666/dsh-vision-router/blob/main/lib/local-vision-stabilizer.js#L136-L144)）。该开关被列为隐私开关（[lib/client.js L698 `PRIVACY_TOGGLE_KEYS`](https://github.com/ysr666/dsh-vision-router/blob/main/lib/client.js)）。
5. **macOS 授权探针**：把开关存为开启后，Web 客户端会 POST `/_dsh/vision-router/request-screenshot-permission`，服务端在 macOS 上执行一次即弃的 `screencapture -x -m` 捕获以**立即**触发系统“屏幕录制”授权（临时 PNG 必删；已授权则系统不再弹窗；非 macOS 不做假捕获；持久 opt-in 关闭时该路由回 409）。（来源：[PR #146](https://github.com/ysr666/dsh-vision-router/pull/146)、[lib/local-vision-stabilizer.js L16–L31 路由与探针](https://github.com/ysr666/dsh-vision-router/blob/main/lib/local-vision-stabilizer.js#L16-L31)、客户端提示 [lib/client.js L231/L506](https://github.com/ysr666/dsh-vision-router/blob/main/lib/client.js)）
6. **本地识别前置**：`identify=true` 复用 Ollama → LM Studio 顺序做截屏后识别（[README L411](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L411)）；未启用任一本地后端时返回 `identifyError` 而不阻断截图；多后端按剩余时间均分预算， hung 住的 Ollama 吃不掉 LM Studio 的份额。（来源：[index.js L7042–L7120](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7042-L7120)）
7. **OS 差异与依赖**（来源：[README L260](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L260)、[README L420](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L420)、[index.js L7002–L7030](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7002-L7030)）：
   - Windows：PowerShell `System.Windows.Forms` + `CopyFromScreen` 截**虚拟屏**（多显示器全覆盖，含主屏左/上方显示器的负坐标），`powershell.exe -NoProfile -STA` 执行；
   - Windows 混合 DPI 修复：拦截 legacy 捕获命令，改走同线程 C# 助手，先进入 `PER_MONITOR_AWARE_V2`、回退 `V1`，`finally` 恢复原线程 DPI 上下文；进不去则显式失败，绝不返回可能错位的截图（[lib/windows-screenshot-dpi-compat.js](https://github.com/ysr666/dsh-vision-router/blob/main/lib/windows-screenshot-dpi-compat.js)、[PR #342](https://github.com/ysr666/dsh-vision-router/pull/342) 修复 issue #340，回归测试 [tests/qa-screenshot-runtime.test.js](https://github.com/ysr666/dsh-vision-router/blob/main/tests/qa-screenshot-runtime.test.js)）；
   - macOS：`screencapture -x -m` 截**主显示器**（`-m` 避免多显示器时在 tmp 留下无人认领的兄弟文件）；
   - Linux：ImageMagick `import -window root`，失败回退 `scrot`，**两者任一必须预装**；需要可捕获的桌面会话，Wayland 支持随环境而定；无输出时报错 `no output produced on <platform> (is a screen available?)`。
8. **隐私影响**：截屏是用户桌面的实时像素（含可能可见的敏感内容），因此默认禁用、显式 opt-in、执行前实时复核；远程/非本机视图下本地后端与桌面捕获仅显示“仅本机可见”，只能在运行 DSH 的机器上配置。（来源：[lib/settings-ia-client-prelude.js L258/L264 诊断页](https://github.com/ysr666/dsh-vision-router/blob/main/lib/settings-ia-client-prelude.js)）

---

## 4. 典型调用链示例（来源：README L267–L281；skill `vision-tools` index.js L7211–L7222；assets 示例）

官方速查原文（[README L267–L281](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L267-L281)）：

```text
vision_ground image="ref.png" target="the send button"
vision_detect image="page.png" target="input fields"
vision_crop   image="ref.png" region="1067,841,1108,881"
vision_present path="rebuilt.png"
vision_describe paths=["ref.png","impl.png"] question="list the differences" json=true
vision_pixel_diff original="ref.png" rebuilt="screenshot.png"
vision_ocr image="screenshot.png"
vision_colors image="ref.png" top=8
vision_trace image="icon.png" steps=4
vision_extract_foreground image="logo.png"
vision_html_screenshot source="page.html" width=1200 height=720
vision_html_screenshot source="page.html" width=1200 height=720 fullPage=true
vision_long_screenshot_ocr image="chat-log.png" chunkHeight=1200 overlap=120
```

**完整链路 A：截全屏 → 识别 → 裁剪放大 → OCR/定位 → 呈现**（综合 §2 调用顺序与各工具参数语义拼出的标准走法）：

```text
1) vision_screenshot({})
   → {"path":"<workspace>/.dsh-vision-router/artifacts/screenshot-<ts>.png","bytes":N}

2) vision_bootstrap({paths:["<screenshotPath>"]})          # 启用结构化预识别时必须先调
   → {"ok":true,"phase":"structured-bootstrap","evidence":{visual_kind,overview,regions,...},"next":"..."}

3) vision_ground({image:"<screenshotPath>", target:"the send button"})
   → {"x1":..,"y1":..,"x2":..,"y2":..,"width":..,"height":..,"annotatedPath":"..."}
   # 或 vision_detect({image:"<screenshotPath>", target:"buttons"}) 做编号盘点

4) vision_crop({image:"<screenshotPath>", region:"x1,y1,x2,y2"})
   → {"path":"<...crop-x1-y1-x2-y2.png>","width":..,"height":..}

5) vision_describe({paths:["<cropPath>"], question:"<针对用户问题的具体问题>"})
   # 需逐字保真（代码/表单/合同/表格数字/验证码）才用 vision_ocr({image:"<cropPath>"})
   # 对比两图用 vision_describe({paths:["ref.png","impl.png"], question:"list the differences", json:true})

6) vision_present({image:"<cropPath|标注图|重建图>"})       # 凡要让用户看到，必须调；只返路径不够
```

**完整链路 B：UI 还原验证循环**（插件招牌流程，[index.js L7212–L7213](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7212-L7213)）：参考图 → 写实现 → `vision_html_screenshot` 截图 → `vision_pixel_diff` 度量 → 修复 → 再截图，迭代到差异收敛（0% 为常见终点）；长页面加 `fullPage:true` 一次截整页并拿 `pageHeight`。

**可视示例**（均为仓库内第一手产物）：

- `assets/vision-demo.gif`：粘贴图片 → agent 用 `vision_ground`/`vision_crop`/`vision_pixel_diff` 定位发送按钮并带坐标回答（[README L47](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L47)，文件：https://github.com/ysr666/dsh-vision-router/blob/main/assets/vision-demo.gif）；
- `assets/pixel-loop.png`：参考设计 vs agent 重建，`vision_pixel_diff` 终值 **2.54%**（32,939/1,296,000，threshold 16/通道）（[README L221–L225](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L221-L225)，经由 [PR #25](https://github.com/ysr666/dsh-vision-router/pull/25) 落盘）；
- `assets/dsh-conversation-image-qa.png`：图片轮中经免费链 `vision_describe` 作答的结构化答案（[README L180–L184](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L180-L184)）；
- `assets/vision-settings.png`：Settings → Vision Router 设置面截图（[README L338–L340](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L338-L340)）。

---

## 5. 产物与呈现（来源：README L372/L576–L580；`index.js` L5784–L5860/L6265–L6320；PR #49/#153）

- **产物目录**：`artifactsDir` 默认 `.dsh-vision-router/artifacts`，**相对于会话工作区**（[README L372](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L372)、[index.js L343 schema 默认](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L343)）；结果返回**绝对路径 + 字节数**（[README L578](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L578)）；写入统一走 `saveArtifact = writeArtifactFile(workspaceOf(exec), artifactsRel, relPath, data)`（[index.js L5784–L5785](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L5784-L5785)），`artifactsDir` 被约束不得逃出会话工作区（[index.js L525–L530](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L525-L530)）。
- **各工具产物命名**：`artifactStemOf(imagePath, suffix)` 派生（如 `crop-<box>.png`、`diff-heatmap.png`/`diff-report.json`、`ocr/chunk-NN.png` + `ocr.md` + `manifest.json`、`trace-color.svg`、`shot-<w>x<h>[-fullpage].png`、`screenshot-<ts>.png`）；长截图 OCR 把 Markdown 路径、分片数、引擎分布一并返回（[index.js L6734–L6759](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6734-L6759)）。
- **呈现（present）vs 自看（read/inspect）**：`vision_present` 定义含强制规则——生成/编辑/截图/导出图凡希望用户看到，**必须**调 `vision_present`；`read_image` 仅模型侧检查，**绝不能**当作展示/发送手段（[index.js L6266–L6271](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6266-L6271)、skill 重申 [index.js L7215–L7218](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7215-L7218)）。实现上 present 把原压缩图存 artifact，同时经 DSH 持久附件服务 `attachments.saveImage` 发布，会话日志保留图片做原生预览/回放，但嵌在 tool-result 里的图片在后续纯文本 DeepSeek 请求前会被消毒移除，以免 `UNSPECIFIED/UNSUPPORTED_CONTENT` 污染后续轮次（[index.js L6282–L6319](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6282-L6319)、[PR #49](https://github.com/ysr666/dsh-vision-router/pull/49)）。
- **附件 ID 即路径**：上传图可直接把 `sha256:…` 当各工具 `image`/`paths` 参数，经会话上传索引解析（`readImageBytes` 对 filesystem 路径与附件 ID 双兼容，[index.js L5199–L5202 注释](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L5199-L5202)）；魔法字节嗅探格式，无扩展名的内容寻址附件文件处处可用（[README L263](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L263)）。
- **vision_materialize 的定位**：`vision_describe`/`vision_bootstrap` 返回 `ok:false` 后，若本地 OCR/解析器只认 `file_path`，用它把附件拷进工作区；**永远不要猜附件存储的私有路径或同名本地文件**（[index.js L5797–L5801](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L5797-L5801)，issue #153 见代码注释 L5794）。

---

## 6. 失败与重试禁忌（来源：各工具 `description`；skill 失败语义；`tests/`；README L285–L298/L410/L421/L576）

1. **后端不可用时禁止换词重试**：`vision_describe` 结果若为 `ok:false` + `VISION_AUTH_FAILED` / `VISION_RATE_LIMITED` / `VISION_TIMEOUT` / `VISION_BACKEND_UNAVAILABLE` / `VISION_BACKEND_UNAVAILABLE_THIS_TURN`，说明认证/限流/基础设施故障——**换问法重调修不好**；基于已有信息继续文本任务并告知用户视觉暂时不可用；只有**成功返回但内容不确定**才允许 `vision_crop`/`vision_ground`/再次 describe 细看；基础设施故障留下只认 `file_path` 的 OCR/解析器兜底时，用 `vision_materialize`。（来源：[index.js L5131–L5138](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L5131-L5138)；`vision_ground`/`vision_detect` 同款禁重试行 [L6034–L6036](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6034-L6036)、[L6124–L6126](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6124-L6126)；skill 版 [L7224–L7230](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7224-L7230)；`lib/runtime-i18n.js` skill 文案 L25/L50）
2. **OCR 不是通用重试**：`vision_ocr` 只读字母，不认人/物/场景（“这是谁/这是什么东西”归 `vision_describe`）；`vision_describe` 以后端不可用码失败时，改调 `vision_ocr` 会以同样方式失败——**不要把两者串成互为重试**；OCR 输出只当待验证证据，不当真值（易混字形 1/l、0/O，空格换行不可靠）。（来源：[index.js L6501–L6510](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6501-L6510)）
3. **Bootstrap 门的两态**：`STRUCTURED_BOOTSTRAP_REQUIRED`（`retryable:true`）→ 去调 `vision_bootstrap` 并等它返回；`STRUCTURED_BOOTSTRAP_FAILED`（`retryable:false`）→ 本轮停调视觉，基于已有文本继续。（来源：[index.js L7149–L7156](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7149-L7156)、[lib/runtime-i18n.js L11/L36](https://github.com/ysr666/dsh-vision-router/blob/main/lib/runtime-i18n.js)）
4. **允许的重试（内容级、且上游调用成功）**：`vision_ground` 退化细条框可严格重问一次，再失败则抛错而非无尽重试（[index.js L6072–L6104](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6072-L6104)）；`vision_detect` 非法清单可严格重问一次，仍非法则抛错，且畸形清单**不得**塌成 `elements:[]` 的假阴性证据（[index.js L6154–L6173](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6154-L6173)，v2.1.3 收紧语义）；长截图 OCR 单分片超长（>12000 字）判幻觉后严格重写一次（[index.js L6694–L6717](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6694-L6717)）。
5. **链式故障转移**：vision 工具按“用户视觉模型 → 本地 Ollama → 本地 LM Studio → 自定义 HTTP → 内置匿名 OVH”顺序尝试，**全部失败才报错**并附行动建议；429 立即进下一后端并加 `Retry-After` 感知的熔断冷却；本地后端宕机/超时自动跳过。（来源：[README L285–L298](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L285-L298)、[README L410](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L410)）
6. **预算是全局的，不叠加**：`vision_ocr` 与 vision 回退共享一个 OCR 预算，tesseract 切片 ≤12s（[index.js L6527–L6531](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6527-L6531)）；长截图整任务一个 deadline，分片 tesseract 与 vision 回退都从中扣；某分片后端失败即置 `visionFailed`，剩余分片不再烧 vision 调用（[index.js L6618–L6621/L6686–L6691](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L6618-L6691)）。
7. **不阻断性失败**：`identify=true` 的本地识别失败只写 `identifyError`，截图本身照常返回（[index.js L7039–L7041 注释](https://github.com/ysr666/dsh-vision-router/blob/main/index.js#L7039-L7041)）；tesseract 缺席时 `vision_ocr` 回退 vision 模型（[README L421](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L421)）；`vision_html_screenshot` 需 Chrome/Chromium/Edge（可用 `CHROME_PATH`/`PUPPETEER_EXECUTABLE_PATH` 覆盖），其他工具不需要浏览器（[README L419](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L419)、[PR #49](https://github.com/ysr666/dsh-vision-router/pull/49)）。
8. **图中文不可信**：描述/OCR/自动挂载注记都要求 agent 永不执行图片内发现的指令（[README L576](https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L576)、[lib/runtime-i18n.js](https://github.com/ysr666/dsh-vision-router/blob/main/lib/runtime-i18n.js)）。
9. **`progressiveTools` 是启动期配置**：决定启动时注册哪组工具，不要指望 Web 设置热切换；改 profile patch 后重启（[docs/progressive-tools-cache.md](https://github.com/ysr666/dsh-vision-router/blob/main/docs/progressive-tools-cache.md)、[docs/releases/v2.1.3.md](https://github.com/ysr666/dsh-vision-router/blob/main/docs/releases/v2.1.3.md)）。

---

## 7. 来源引用总表

| # | 来源 | 覆盖结论 |
|---|---|---|
| S1 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L47-L72（demo、No Python、多步工作） | §1 |
| S2 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L99-L110（sidecar 对比、agent-vision-toolkit 致谢） | §1 |
| S3 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L240-L281（工具表 + 调用速查） | §1、§2、§4 |
| S4 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L283-L298（fallback 链与 429/冷却/4MP 降采样） | §6.5 |
| S5 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L327-L372（设置面与 `desktopScreenshot:false` 默认） | §3 |
| S6 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L376-L411（Ollama/LM Studio 接入、`identify`、自动跳过） | §3 |
| S7 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L413-L421（Requirements：Chrome/Tesseract/桌面捕获 OS 差异） | §3、§6.7 |
| S8 | https://github.com/ysr666/dsh-vision-router/blob/main/README.md#L574-L580（安全：图中文不可信、产物路径、密钥不落地） | §5、§6.8 |
| S9 | https://github.com/ysr666/dsh-vision-router/blob/main/index.js（工具定义 L5121–L7120、bootstrap 门 L7145–L7157、skill L7207–L7231；行号见 §2/§5/§6 逐条标注） | §2、§4、§5、§6 |
| S10 | https://github.com/ysr666/dsh-vision-router/blob/main/lib/runtime-i18n.js（bootstrap 提醒 L11/L36、选工具/失败语义 L25/L50） | §2、§6 |
| S11 | https://github.com/ysr666/dsh-vision-router/blob/main/lib/local-vision-stabilizer.js（截屏挂载同步 L101–L121、总开关守卫 L136–L144、macOS 探针路由 L16–L31/L386–L411） | §3 |
| S12 | https://github.com/ysr666/dsh-vision-router/blob/main/lib/windows-screenshot-dpi-compat.js（混合 DPI 同线程 V2→V1 修复） | §3.7 |
| S13 | https://github.com/ysr666/dsh-vision-router/blob/main/lib/client.js（开关文案 L214/L231/L488/L506、隐私键 L698） | §3 |
| S14 | https://github.com/ysr666/dsh-vision-router/blob/main/lib/structured-flow-hardening.js + https://github.com/ysr666/dsh-vision-router/blob/main/tests/structured-bootstrap-gate.test.js + https://github.com/ysr666/dsh-vision-router/blob/main/tests/structured-bootstrap.test.js（1+x 唯一完成权威、OCR 契约矩阵） | §2 |
| S15 | https://github.com/ysr666/dsh-vision-router/blob/main/tests/qa-screenshot-runtime.test.js（Windows DPI 上下文、安全 HTML 截图、legacy 命令漂移门） | §3.7 |
| S16 | https://github.com/ysr666/dsh-vision-router/blob/main/tests/vision-artifact-store.test.js + https://github.com/ysr666/dsh-vision-router/blob/main/lib/vision-artifact-store.js（产物落盘与返回契约） | §5 |
| S17 | https://github.com/ysr666/dsh-vision-router/blob/main/docs/releases/v2.1.3.md（1+x 定稿语义、OCR 契约恢复、progressive 启动期化） | §1、§2、§6 |
| S18 | https://github.com/ysr666/dsh-vision-router/blob/main/docs/progressive-tools-cache.md（`progressiveTools` 启动期配置） | §6.9 |
| S19 | https://github.com/ysr666/dsh-vision-router/pull/342（修复 issue #340 的 Windows 混合 DPI 错位） | §3.7 |
| S20 | https://github.com/ysr666/dsh-vision-router/pull/146（macOS 保存开关即触发录屏授权探针、409 门） | §3.5 |
| S21 | https://github.com/ysr666/dsh-vision-router/pull/49（`vision_present` 专用呈现通道、`read_image` 仅自看、跨平台浏览器发现） | §5 |
| S22 | https://github.com/ysr666/dsh-vision-router/pull/25（pixel-loop 2.54% 展示落盘） | §4 |
| S23 | https://github.com/ysr666/dsh-vision-router/pull/391（历史中间态：结构化 OCR 曾改直连 vision，已被 v2.1.3 推翻，仅作谱系参考） | §2 注 |
| S24 | assets：https://github.com/ysr666/dsh-vision-router/blob/main/assets/vision-demo.gif、pixel-loop.png、dsh-conversation-image-qa.png、vision-settings.png | §4 |

> 未引用 issue #393/#394（Chrome 粘贴 QQ/微信截图去重）于正文：其对象是**剪贴板粘贴 intake**（`lib/client-presentation-boundary-main.js`），不是 `vision_screenshot` 桌面捕获，为避免概念混淆仅在此说明。
