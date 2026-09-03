/** d1-home 装配：花名册（settings.section）+ 只读入口（workspace-rail），卸载即净。 */
import type { FeatureCtx } from '../protocol'
import { mountEntry } from './entry'
import { mountRoster } from './roster'

export function mountD1Home(ctx: FeatureCtx): () => void {
  let stopRoster: (() => void) | null = null
  let stopEntry: (() => void) | null = null
  try {
    stopRoster = mountRoster(ctx)
  } catch { /* 单挂载失败不影响另一挂载 */ }
  try {
    stopEntry = mountEntry(ctx)
  } catch { /* 单挂载失败不影响另一挂载 */ }
  return () => {
    try { stopRoster?.() } catch { /* 忽略 */ }
    try { stopEntry?.() } catch { /* 忽略 */ }
  }
}

export { mountEntry, mountRoster }
