T0 决议交付：300 行红线守卫 + 构建管线加固完成，验收全绿，关闭。

- npm run guard：30 个源文件 PASS（max 276 行 src/client/theme.ts，余量 24；立项时 22 个，现 30 个全量覆盖）
- npm run check（一键门禁 = build + typecheck + verify + guard）：exit 0；verify 17/17 ALL PASS
- 负测 --limit 10 → exit 1 + 超限清单，超限即报错得证
- 口径 F0 §5（src/**/*.ts 全部行；lib/tools/.scratch/docs 豁免），计数经 Node/.NET 双权威交叉验证
- 改动：新增 tools/guard/check-lines.mjs；package.json +2 scripts（guard/check）。无 UI 变更，真机闭环不适用。
