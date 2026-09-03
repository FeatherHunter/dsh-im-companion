修正（实现中查到的上游事实，经用户确认）：

上游 bot.workspace.set 要求 workspace 为非空绝对路径（空串被拒，见 dsh-im workspace-rpc.validWorkspacePayload），且唯一能回到未绑定的 bot.delete 会销毁机器人。因此“新绑定→撤销→回未绑定池”无无损实现。

落点：新绑定成功只给普通 toast（无撤销键），只有换绑可撤销（from 恒为非空路径）。规格故事 5 与 #13 原型走查 1 的新绑撤销步按此理解，不另改正文。