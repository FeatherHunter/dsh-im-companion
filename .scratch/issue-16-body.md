Part of #1
## Question
把「≤300 行/文件」做成机械守卫：脚本/CI 检查 src/** 行数（豁免规则随 F0 定案），超限即报错；同时加固构建（tsdown/tsc 一键 build + verify 挂进 npm 脚本）。
## Done when
npm run guard 可执行并通过当前 22 个源文件；build+verify+guard 一条命令全绿。

## 实施记录

- 守卫：tools/guard/check-lines.mjs（零依赖，F0 §5 口径：src/**/*.ts 全部行，limit 300，超限列清单 exit 1；lib/tools/.scratch/docs 只扫 src 即天然豁免）
- 管线：package.json 新增 guard + check（check = build && typecheck && verify && guard，一条命令全绿）
- 验证（2026-09-03）：npm run check 全绿 —— build（tsc host + tsdown client）过 / typecheck 过 / verify 17/17 ALL PASS / guard 30 文件 PASS（max 276 行 src/client/theme.ts，余量 24）；负测 --limit 10 → exit 1 + 超限清单，超限即报错得证
- 口径取证：guard 计数与 .NET ReadAllLines 一致（276）；Get-Content 少计 3 行系 cmdlet 假象，已排除，不影响结论
- 注：立项时 22 个源文件，现为 30 个，已全量覆盖通过；本票无 UI 变更，真机闭环不适用（验证由既有 render-client 17 项承担）

## 进度：100%

下一步：无（已交付，关闭）
