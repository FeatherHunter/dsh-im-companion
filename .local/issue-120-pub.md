## 已发布 0.2.7（含本票改动）

- 发布前：`check:update-pkg` 绿（官方源 = pin = 0.10.0）；用现版本 0.2.6 探针 → **PROBE-OK**（whoami=feather_wch）。
- `npm version patch` → 0.2.7；本地打包预检：version 0.2.7 / pin 0.10.0 / 解信封接线 true / 注入 v0.2.7 / 页头 `updateCenterHost` 落在 `copy.starHref` 之前 / root 无旧位置 / 33 文件无 update-schedule。
- `publish-token.ps1 -FullPost`：GATE check 绿 → `09:00:38 PKG-OK` → `09:02:45 POST-OK 可见`，exit 0。
- **公开物独立复核**（`npm pack dsh-im-companion@0.2.7`，脚本 `.local/diag/verify-published.mjs`）：`latest=0.2.7`；包内 version 0.2.7 / pin 0.10.0 / `toPackageReply(await rpc(` 接线 true / 注入 v0.2.7 / **页头挂载点在 star 左侧 true** / verBox 在前 true / root 无旧位置 true / host 四电话 4/4+4/4 / index.js 接更新桥 / 无陈旧调度器 / 33 文件。shasum `43236ac86761874275c51a8a0102a75181c09a2e`。
- 面板侧（真宿主桥 + 真包面板）：`有新版 0.2.7 可装（当前 0.2.6）· 运行 0.2.6 磁盘 0.2.6 远端 0.2.7`。

## 待目视

页头右组宽度（最长档「更新失败，点此查看」）需用户刷新后确认；嫌挤则 `upToDateDisplay:'tooltip'` 或短 `label` 微调（另开票）。确认后关本票。
