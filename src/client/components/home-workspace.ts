/** 工作区路径的前置守卫（#158）——纯函数：绑定/换绑之前先问一句「这个 workspace 上游会收吗」。
 *
 * 上游事实（dsh-im workspace-rpc）：bot.workspace.set 只接受**非空绝对路径**
 * （path.isAbsolute(trim(workspace))）；相对路径 / 空串 / 裸盘符 C: 一律被拒。
 * 坏路径走到 RPC 只会换回难懂的上游报错（连接流里还常常表现为「没反应」），
 * 所以在客户端先挡下并把原因如实说出来。不替代宿主校验，只做同口径的前置防御。
 *
 * 口径（与 Windows 上游接受面一致）：盘符（C: 后必须带分隔符）、UNC（\\server\share）、
 * 根路径（/ 或 \）。不认 ~ 与相对路径——上游同样不收。 */
export function workspaceRejectReason(raw: unknown): string {
  if (typeof raw !== 'string') return '工作区路径不是字符串，需要绝对路径'
  const t = raw.trim()
  if (!t) return '工作区路径为空，需要绝对路径'
  if (!/^(?:[A-Za-z]:[\\/]|[\\/])/.test(t)) return '工作区路径不是绝对路径（需要盘符/UNC/根路径）'
  return ''
}
