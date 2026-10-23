/** 默认工作区显示名的单点真相（#154 · 客户端与宿主共用；留本地化接缝）。
 * 背景：DSH 把默认区**标题**本地化后才渲染左栏组行（显示名＝「默认工作区」），
 * 而机器人绑定记的是**绝对路径**（…\default-workspace）⇒ 两边对不上（本票根因的一半）。
 * 本仓按同一口径回落显示名：恰为默认区目录名时给本地化名，其余原样。
 * 接缝：DEFAULT_WORKSPACE_LABELS 目前只 zh；将来接多语言只改这一张表（不在本票范围）。 */
export const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'

/** 默认工作区显示名（按 locale；缺项回落 zh）。 */
export const DEFAULT_WORKSPACE_LABELS: Record<string, string> = { zh: '默认工作区' }

/** 取默认工作区显示名（locale 缺项 ⇒ zh）。 */
export function defaultWorkspaceLabel(locale = 'zh'): string {
  const key = String(locale ?? '').trim().toLowerCase()
  return DEFAULT_WORKSPACE_LABELS[key] || DEFAULT_WORKSPACE_LABELS.zh || '默认工作区'
}

/** 存储标题 → 显示标题：恰为默认区目录名时给本地化名，其余原样。 */
export function defaultWorkspaceTitle(title: string, locale = 'zh'): string {
  const t = String(title ?? '')
  return t === DEFAULT_WORKSPACE_DIRECTORY ? defaultWorkspaceLabel(locale) : t
}
