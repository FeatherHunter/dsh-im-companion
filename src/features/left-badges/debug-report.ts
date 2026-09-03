/** left-badges 临时诊断上报（#6 真机无徽标排查，定位后删除）。
 * 只读 Cli：梯子式统计 DOM 现状（treeitem 总量 / 展开态 / 会话态 / 已有徽标），
 * 经 ctx.rpc 发往 host __badgeDebug 落盘；rpc 缺失即 no-op（console.info 保留），
 * 永不抛错、永不改 DOM。零运行时 import（仅 type），单测可直转译。 */
import type { RpcCall } from '../../client/data/fleet-api'

export interface BadgeCensus {
  treeitem: number
  expanded: number
  selected: number
  badges: number
}

export function collectCensus(): BadgeCensus {
  const zero: BadgeCensus = { treeitem: 0, expanded: 0, selected: 0, badges: 0 }
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return zero
    const n = (sel: string): number => {
      try {
        return document.querySelectorAll(sel).length
      } catch {
        return 0
      }
    }
    return {
      treeitem: n('div[role="treeitem"]'),
      expanded: n('div[role="treeitem"][aria-expanded]'),
      selected: n('div[role="treeitem"][aria-selected]'),
      badges: n('.left-badges-badge'),
    }
  } catch {
    return zero
  }
}

export function reportDebug(rpc: RpcCall | null | undefined, fields: Record<string, string | number | boolean>): void {
  try {
    if (!rpc) {
      try {
        console.info('[dsh-im-companion] left-badges-debug（rpc 空）: ' + JSON.stringify(fields))
      } catch {
        /* 无 console 环境静默 */
      }
      return
    }
    void rpc('/im-companion', '__badgeDebug', fields as unknown as Record<string, unknown>, AbortSignal.timeout(3000)).catch(() => {
      /* 上报失败静默 */
    })
  } catch {
    /* 上报失败静默 */
  }
}
