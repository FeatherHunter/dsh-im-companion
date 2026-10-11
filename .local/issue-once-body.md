## Question

当前对 0.10.0 更新系统的使用不正确：面板能画出五章但首帧快照不到——头栏“使用范围 未知”、横幅“正在读取更新状态…”、运行/磁盘/远端三格空占位、02–05 全中性提示（无日志/无排队/无失败/无手工命令）。按用户要求收敛为“一个更新按钮＋点开即 dialog 面板＋default 主题”，一个 ISSUE 把发现的问题一次修完，不动家/助理等其他需求。

问题清单（本票一次修完）：
- P1 点开无面板：入口 openOn=has-update，无新版时点开只给一句小字，用户感知“面板没内容”。改 openOn=always（点开总有完整五章；稳定后再议回 has-update），dialog 由 entry.open() 内置不变。
- P2 主题未锁定：虽未传即默认，但未显式锁定 default，后续易漂。显式 theme=default（入口根＋dialog 透传同套），与“用 default 主题”对齐。
- P3 首帧无快照不可诊：call 抛错（桥不可用/让位 null/超时）时无稳定码可复制，04 无法成卷。call 层失败原样透传，必要时 profileName 显式覆盖兜底（README 允许更准时覆盖），让未知变已知或给真失败码。
- P4 宿主透传：update.ts 四电话透传必须原样保留快照六字段＋env（含 includeEnv 范围名），reply 不自造第二套词表；rpc.ts 四 case 不改行为，只验线不断。

范围（单一切片）：
- 只碰 src/features/update-center/view.ts＋manifest.ts＋src/host/update.ts＋其 verify（tools/verify/features/update-center.ts＋update-host.ts），他功能零改，单文件≤300 行，共享层 Added-only
- npm run check 全绿；lib 重打后以 hash 验收（Ctrl+F5），不重启 DSH
- 不做发布（发版另起票），不碰大地图 #105

验收：
- 按钮文案随状态变（检查更新/已是最新/有新版/安装中/待重启/失败可点）
- 点开即完整 dialog 五章，default 深色最小可用样式
- 头栏使用范围不再恒为未知（真未知则给真失败码＋复制诊断可取证）
- 全量 npm run check exit 0

## 进度

- 待开工：问题已取证（截图基线＋0.10.0 README＋entry.d.ts），未动盘。
