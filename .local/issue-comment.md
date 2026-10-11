## 修复落地（待用户目视验收）

**改动面（2 文件，全部在 feature 自己的命名空间内，共享层零改）**
- `src/features/update-center/view.ts`：+28 行，新增 `toPackageReply()`（成功拆 `value`；失败从 `error.details.update` 还原包的 `{ok:false,error,errorKind,diag}`；宿主自产失败只给码；成功信封缺 `value` 落失败而不空转；已是包的扁平回包原样直通），并把 `call` 改成 `return toPackageReply(await rpc(...))`。101 → 130 行（红线 300）。
- `tools/verify/features/update-center.ts`：+新增 T5-6 运行时断言（转译 view.ts 取真函数 + 6 组形状断言 + 产物咬调用点形状）。此前本文件只有产物文本断言，抓不到形状错。

**门禁**：`npm run check`（build + typecheck + verify 250 例 + guard 300 行）全绿。

**端到端复证**（`.local/diag/verify-fix-e2e.mjs`：仓内真 `toPackageReply` + 真宿主桥 + 真包面板）
- 修复后：面板出数据 —— `使用范围 desktop`、`已是最新，无需更新`、`运行 0.2.5 磁盘 0.2.5`、复制诊断按钮出现。
- 对照（修复前 `.local/diag/repro-panel-ab.mjs`）：停在「正在读取更新状态…」，与用户截图逐字相同。

**变异测试（证明新断言咬得住）**
1. 只加函数、`call` 不接线 ⇒ 产物无调用点；第一版断言「产物含 toPackageReply」**误判 PASS**（rolldown 会保留未用的导出函数）⇒ 断言改为咬调用点形状 `/toPackageReply\(\s*await\s+rpc\(/`。
2. 再跑变异态 ⇒ T5-6 FAIL（`产物里的 call 没有把 rpc 回包交给 toPackageReply ⇒ 空心修复`）；恢复真码 ⇒ 6 pass。

**实装同步**：`lib/` 已同步进 `~/.dsh/profiles/desktop/node_modules/dsh-im-companion/lib`，两侧 hash 一致（client.js `F2F8F48F…`、index.js `E5581EC8…`）。web profile 未装本插件，无需同步。

**待办**：用户 Ctrl+F5 后打开更新面板目视确认（真机验收闸门之一）；确认无误再关本票。
