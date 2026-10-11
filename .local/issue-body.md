## 现象

集成 `dsh-plugin-update@0.10.0` 后点开更新面板：`使用范围 未知`、横幅永远停在「正在读取更新状态…」、运行/磁盘/远端三个框全空、04 显示「暂无失败」、安装更新灰 —— 既不报错也永远不出数据。

## 根因（T5 #110 薄挂载重写回归）

宿主刻意把更新包载荷裹进本仓 RpcResult 信封（src/host/update.ts 的 reply()）：宿主回包为 `{ok:true, value:{ok:true, snapshot, manual, receipt}}`，而包 README §5 只认扁平 `{ok:true, snapshot, manual, receipt}`。薄挂载层把信封原样转给包（src/features/update-center/view.ts 的 call），没拆 value。包的 `if (reply.ok !== true) → 记失败` 判不出来（外层 ok:true），又取不到顶层 snapshot ⇒ 快照恒 null、错误恒 null ⇒ 永远走 loading 分支。旧自画实现（已删的 phone.ts）本来有「解构本仓 RpcResult 信封…res.value」这层，重写时丢了。

## 证据

1. 宿主侧单独跑正常：imc.updateStatus 7ms 返回 runningVersion/installedVersion=0.2.5 + env={profileName:"desktop"}；imc.updateCheck 407ms 打到 registry 得 latestVersion=0.2.5。
2. A/B 对照（真宿主桥 + 真包面板，脚本 .local/diag/repro-panel-ab.mjs）：A 直返信封 = 与用户截图逐字相同；B 先拆 value = 正常渲染（使用范围 desktop、运行/磁盘/远端 0.2.5）。
3. lib/client.js 与本机 desktop profile 实装副本 hash 一致，产物含 imc-update-center、不含旧 update-center-dialog-body ⇒ 跑的就是这份薄挂载。

## 修法

view.ts 内加 feature 自包含的 toPackageReply()：成功拆 value、失败从 error.details.update 还原包的 {ok:false,error,errorKind,diag}（失败通道现状也会一律降级成兜底码 check-failed，一并修）。共享层零改；tools/verify/features/update-center.ts 补运行时断言（此前只有产物文本断言，抓不到这类形状错）。

## 验收

npm run check 全绿 + 两侧 lib hash 对齐 + 用户 Ctrl+F5 目视面板出 0.2.5。
