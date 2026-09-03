#9 关闭记账（用户裁定：任务完成，按指示 close）

合入 2d3f590（3 文件 +70/-8，显式 pathspec，并行会话文件未碰）：
- 抽屉底部越界修复：placeSheetPanel 改量 .af-root 可见矩形（与裁剪祖先求交，纯函数 clipRect 进 data.ts），内容高于设置面板可视区时底边锁面板底，不再顶到 DSH 视口底（此前 Math.max(0) 把负偏移钳成 0 = 真机复现根因）；顶边同步夹取；裁没回 null 走既有 CSS 兜底。
- verify：c1a-drawer.ts 新增几何用例（旧路径 bottom=0 复现 vs 新路径 bottom=100 锁定）。

证据：npm run build PASS；guard PASS；几何断言 5/5（独立转译 c1a/data.ts 直跑）。树级红 = 并行作业 left-badges/hover-card.ts 272/274 UIEvent 类型错（2026-09-03 已声明），连带 typecheck/c1a verify 整链无法转译，与本改动无关；left-badges 修复后整链即可全绿。

验收（close 后，用户真机）：完全退出 DSH Desktop 重开 + Ctrl+F5 → 设置 → IM机器人辅助 → 内容超出面板时点「详情」→ 抽屉底边不超过设置面板底边。不通过请 reopen。

解锁：E3（#14）不再被本票阻塞。
