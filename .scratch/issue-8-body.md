Part of #1

## Question

对话区顶部/工作区 Header 的浮层：当前 Agent 健康、绑定渠道、快捷动作（打开工作区/发测试消息）；悬浮时机与防遮挡。

## Done when

真机悬浮正常、随连接域更新、深色适配；无与 DSH 原生 Header 冲突。

## 原型

分支判定：UI（界面应该长什么样 → 同路由多变体 + 底部悬浮切换）。Sub-shape B（仓库内无对话区 Header 可挂载，故用独立抛弃式路由）。

Grilling 共识（2026-09-03，全按推荐确认）：变体 = A 胶囊嵌入 / B 独立浮条 / C 极简呼吸点；时机 = 按绑定状态显示；动作 = 打开工作区 + 发测试消息；数据 = 静态 mock + 手动切换；深色 = 纳入浅深切换。

产物：分支 prototype/b3-header-overlay 内 prototype-b3-header-overlay.html（单文件，双击即跑；?variant=A/B/C 可分享；底部悬浮切换加左右键；每次操作重渲染完整 state，无持久化）。

运行：git checkout prototype/b3-header-overlay 后双击 prototype-b3-header-overlay.html，或 python -m http.server 8788 后访问 /prototype-b3-header-overlay.html?variant=A（B/C 同理）。三变体截图已验证（A 胶囊 / B 浮条 / C 呼吸点均正常）。

变体速览：A 不增行高防遮挡最优；B 占一行信息最全可收起；C 平时零打扰，悬停或点击展开。

## 结论

赢家：C · 极简呼吸点（用户 2026-09-03 选定）。平时仅圆点零打扰，悬停或点击展开详情（含打开工作区 / 发测试消息）；A/B 归档保留在 throwaway 分支，需要混搭时可复用。

## 进度：95%

下一步（待确认，未确认不 close）：一是真机挂载点 conversation.session.header.utilities 是否可用；二是 C 变体真机悬浮正常、随连接域更新、深色适配、无与原生 Header 冲突。确认后折叠赢家进真代码（另起实现票），原型保留在 prototype/b3-header-overlay 分支。
