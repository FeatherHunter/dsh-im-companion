/** TEMP 探针装配（定稿即删）：svc + ident 双挂载；child.ts 副作用自注册（引用保活防 tree-shake）。
 * 零 UI：不写 DOM、不装样式，只打 [unread-probe] 控制台日志 + window.__unreadProbe。
 * 接线：manifest.ts workspace-rail 槽位 mount（父级已注册进 FEATURES）。 */
import type { FeatureCtx } from '../protocol'
import { auditRows, recordHeaderMount } from './child'
import { mountUnreadProbeIdent } from './ident'
import { mount as mountSvc } from './svc'

void auditRows
void recordHeaderMount

export function mountUnreadProbe(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  try {
    const stops: Array<() => void> = []
    try {
      stops.push(mountSvc(ctx))
    } catch {
      /* svc 挂载失败不影响 ident */
    }
    try {
      stops.push(mountUnreadProbeIdent(ctx))
    } catch {
      /* ident 挂载失败不影响 svc */
    }
    return () => {
      for (const s of stops) {
        try {
          s()
        } catch {
          /* 清理失败忽略 */
        }
      }
    }
  } catch {
    return noop
  }
}
