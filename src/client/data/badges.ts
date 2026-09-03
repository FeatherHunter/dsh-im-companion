/** 兼容垫片（已废弃）：B1 徽标派生已迁入 ./bindings，新代码直接引 bindings。
 * 保留此 re-export 仅为不断 B3 在途引用（header-overlay/b3-header 迁移后删除本文件）。
 * TODO(#6)：B3 切到 bindings 后删除本文件。 */
export { badgeForWorkspace, basenameOfPath, OPEN_AGENT_EVENT } from './bindings'
export type { BadgeKind, LeftBadge } from './bindings'
