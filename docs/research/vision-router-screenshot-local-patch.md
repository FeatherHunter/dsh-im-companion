# vision-router 截屏本地补丁（2026-09-07）

> 上游 issue：https://github.com/ysr666/dsh-vision-router/issues/409
> 起因：`vision_screenshot` 在双 2K @150% 缩放下输出逻辑尺寸（3414×963）且底边缺任务栏；
> 根因：DPI 重写依赖的 `execFile[promisify.custom]` 在 Node 24 上被冻结，重写永不命中；
> 且感知版 C# 依赖的 Add-Type 在中文用户名 %TEMP% 下编译失败。详见 issue 正文。

## 改动位置（均在已安装包内，非本仓库代码）

文件：`%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-vision-router\index.js`（v2.1.3）

1. import 区新增一行（约 L46）：
   `import { buildPerMonitorWindowsScreenshotScript } from './lib/windows-screenshot-dpi-compat.js'`
2. win32 分支（约 L7002 起）改直调感知版 helper：
   - 建 ASCII 编译临时目录 `C:\.dsh-vision-router-codem-tmp`（CodeDom 写中文 TEMP 会挂，勿删此目录）
   - `script = buildPerMonitorWindowsScreenshotScript(tmp)`
   - exec 时追加 `env: { ...process.env, TEMP: asciiTemp, TMP: asciiTemp }`
   - try/catch 包裹，失败回退 legacy 并记 logger.warn（永不让情况更糟）

## 验证结果（未重启 DSH，直接跑补丁同款逻辑）

- 输出：`C:\.dsh-vision-router-codem-tmp\verify-aware.png`，**5120×1445 物理像素**，双屏任务栏完整
- 复现脚本：`C:\.dsh-vision-router-codem-tmp\verify-screenshot.mjs`（保留，可重跑）

## 生效与维护

- host 侧代码，**需重启 DSH 才生效**（刷新页面不够）。
- 插件每次更新都会覆盖 `node_modules`，更新后按本文件重打（上游修好后删除本补丁）。
- `C:\.dsh-vision-router-codem-tmp` 运行时需要，勿删。
