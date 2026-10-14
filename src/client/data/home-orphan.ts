/** T10b #127 孤儿家纯判定（共享层 Added-only 新文件，旧模型一字不动）。
 * 孤儿＝家在表里活着，但它指向的工作区已经从 DSH 工作区快照里消失（工作区被删）。
 * 判据与 `seedGap` 同宽容度：workspaceId 或规范路径任一命中即「不是孤儿」——
 * path 是持久键，workspaceId 可能被重建换号，两者都要认（与 T10 #124 家＝工作区镜像同口径）。 */
import { normPath, type Home, type WorkspaceRef } from './home-model'

/** 墓碑家（用户点过「删除家」）不算孤儿：它已经不在视图里，重绑/删除都不该再给它入口。 */
export function isOrphanHome(home: Home, workspaces: WorkspaceRef[]): boolean {
  if (home.tombstone) return false
  const target = normPath(home.path)
  return !(workspaces || []).some((w) => {
    if (!w || !w.path) return false
    if (home.workspaceId && w.workspaceId === home.workspaceId) return true
    return !!target && normPath(w.path) === target
  })
}
