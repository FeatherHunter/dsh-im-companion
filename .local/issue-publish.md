## 已发布 0.2.6 并复核线上物

- `npm run check:update-pkg`：官方源 `dsh-plugin-update` latest = 0.10.0 = 本仓 pin = node_modules 实际 ⇒ 不落后。
- 探针 `-Probe` → **PROBE-OK**（whoami=feather_wch，写链路通）。
- `npm version patch` → 0.2.6（package.json + package-lock 同步）。
- 发布前本地打包预检：包内 version=0.2.6、pin=0.10.0、`toPackageReply(await rpc(` 已接线、注入 v0.2.6 ⇒ 通过。
- **顺手清掉陈旧产物**：`lib/host/update-schedule.js(.map)`、`lib/types/host/update-schedule.d.ts`（M5 删调度器时 tsc 不清理 outDir 的遗留，重建不再生；发布包里 33 文件、无 update-schedule）。
- `pwsh -NoProfile -File scripts\publish-token.ps1 -FullPost` → PKG-OK → STAGED → 长轮询第 6 次 **POST-OK 可见**，exit 0。
- **独立复核线上 tarball**（`npm pack dsh-im-companion@0.2.6 --registry=https://registry.npmjs.org`）：dist-tags `latest=0.2.6`；包内 version 0.2.6 / pin 0.10.0 / `toPackageReply(await rpc(` 接线 true / 注入 v0.2.6 true / 无 update-schedule；host 侧 `rpc.js` 与 `update.js` 四电话 4/4、`index.js` 接 `createUpdateHostBridge` 且无调度器。shasum `f4203324c42a3671c574328bc582f7890f30c61f`。
- 面板侧复核（真宿主桥 + 真包面板）：`使用范围 desktop · 有新版 0.2.6 可装（当前 0.2.5）· 运行 0.2.5 磁盘 0.2.5 远端 0.2.6 · 按钮「安装 0.2.6」`。

## 验收

用户真机确认：「现在能看到正确效果了」（Ctrl+F5 后面板出数据）。发布侧到 registry 全绿即交付；安装一律用户侧做。关票。

遗留（非本票）：git 侧仍是未提交工作树（无 commit / tag / GitHub Release）；线上 0.2.5 即那版坏包，可选 deprecate 提醒。
