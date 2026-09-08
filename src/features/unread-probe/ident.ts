/** TEMP 探针B ident（定稿即删，仿 design-preview 先例）：#51 子问题2。
 * 监听 SESSION_VIEWED_EVENT（session-header/panel.ts 在会话头挂载/切换时派发，
 * detail = { sessionId }，sessionId 即官方槽位 conversation.session.header.utilities 的
 * 原生 props.sessionId），记录其格式（长度/字符集/前8位）与经 ctx.get('workspaces')
 * 快照反查 workspace 路径的存在性（官方 ui-workspace 同款语义 resolveWorkspacePath）。
 * client-only：只读 ctx.get + window 事件，不碰 host、不写 localStorage、不开定时器
 * （纯事件驱动），全防御式 try/catch，fail-soft 绝不破坏宿主 UI。
 * 日志统一前缀 [unread-probe]，记录落 window.__unreadProbe.viewed（内存数组，供控制台读）。
 * 隐私：只记字段名/计数/id 格式，绝不记标题/正文（sessionId 只记前 8 位）。
 * 接线由父级做：本文件仅导出 mountUnreadProbeIdent(ctx)，不改任何共享文件。 */
import { resolveWorkspacePath, SESSION_VIEWED_EVENT, type WorkspaceItem } from '../../client/data/header-overlay'
import type { FeatureCtx } from '../protocol'

const PREFIX = '[unread-probe]'
const MAX_VIEWED = 50

/** 单条 viewed 记录（隐私安全：无标题/正文，id 仅前 8 位）。 */
export interface UnreadProbeViewed {
  t: number
  len: number
  charset: string
  head8: string
  wsFound: boolean
  wsItems: number
}

export interface UnreadProbeStore {
  viewed: UnreadProbeViewed[]
  guide: string
  mountedAt: number
}

/** 真机比对指引（人类用日志 head8 对照磁盘目录名；挂载时 console.info + 入 store.guide）。 */
export const IDENT_GUIDE: string = [
  '[unread-probe] 真机比对指引（#51 子问题2：SESSION_VIEWED_EVENT 的 sessionId 是不是官方会话 id）：',
  '1) 热重载/刷新后控制台过滤 [unread-probe]，先看 mount 行：items:n = 经 ctx.get(\'workspaces\') 可读的官方会话组数（只记字段名与计数，无隐私内容）。',
  '2) 逐个点开会话触发 SESSION_VIEWED_EVENT，每行 viewed 给出 head8（sessionId 前 8 位）+ wsFound（能否经快照反查到 workspace 路径）。',
  '3) 磁盘对照：打开 <dshHome>/sessions/，找 -- 开头目录，其下 <UUID>/ 目录名以 head8 开头即命中（host/activity.ts 布局：sessions/--*/<UUID>/session.jsonl.zstd）。',
  '4) 判定：wsFound=true 且 head8 与磁盘 UUID 前缀一致 → sessionId 即官方会话 id，可替代标题 join/DOM 观测成为 V2 精确事件源；wsFound=false → 复制该行（仅 head8/wsItems 计数）回票。',
  '5) 读数：window.__unreadProbe.viewed（纯内存数组，不写 localStorage，切会话不透标题）。',
].join('\n')

function ensureStore(): UnreadProbeStore | null {
  try {
    if (typeof window === 'undefined') return null
    const w = window as unknown as { __unreadProbe?: Record<string, unknown> }
    let st = w.__unreadProbe
    if (!st || typeof st !== 'object') { st = {}; w.__unreadProbe = st }
    /* merge 语义：child.ts 可能先建了 {mounts,...}，只补自己的键，不覆盖他人键。 */
    if (!Array.isArray(st['viewed'])) st['viewed'] = []
    if (typeof st['guide'] !== 'string') st['guide'] = IDENT_GUIDE
    if (typeof st['mountedAt'] !== 'number') {
      try {
        st['mountedAt'] = Date.now()
      } catch {
        /* 时间取失败不影响 store */
      }
    }
    return st as unknown as UnreadProbeStore
  } catch {
    return null
  }
}

/** id 格式分类（只定字符集与结构，不回显原值；调用方另取前 8 位）。 */
function charsetOf(s: string): string {
  try {
    if (!s) return 'empty'
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)) return 'uuid-dash36'
    if (/^[0-9a-fA-F]{32}$/.test(s)) return 'hex32'
    if (/^[0-9A-Za-z0-9_-]+$/.test(s)) return 'alnum-ish'
    return 'other'
  } catch {
    return 'probeERR'
  }
}

/** 官方会话列表快照（session-header/view.ts 同款链路；只取数组与首项字段名）。 */
function snapshotItems(ctx: FeatureCtx): { items: WorkspaceItem[]; keys: string } | null {
  try {
    const svc = ctx.get('workspaces') as {
      list?: { getSnapshot?: () => { items?: unknown } }
    } | null
    const items = svc?.list?.getSnapshot?.()?.items
    if (!Array.isArray(items)) return null
    let keys = 'none'
    try {
      const first = items[0] as Record<string, unknown> | undefined
      keys = first && typeof first === 'object' ? Object.keys(first).sort().join(',') : 'none'
    } catch {
      keys = 'probeERR'
    }
    return { items: items as WorkspaceItem[], keys }
  } catch {
    return null
  }
}

/** 挂载行：服务形状（只记字段名与计数，回答“快照是否可读”的存在性部分）。 */
function describeService(ctx: FeatureCtx): string {
  try {
    const raw = ctx.get('workspaces') as Record<string, unknown> | null
    const svcKeys = raw && typeof raw === 'object' ? Object.keys(raw).sort().join(',') : 'none'
    const list = (raw as { list?: unknown } | null)?.list as Record<string, unknown> | null
    const listKeys = list && typeof list === 'object' ? Object.keys(list).sort().join(',') : 'none'
    const snap = snapshotItems(ctx)
    return 'svc:[' + svcKeys + '] list:[' + listKeys + '] items:n=' + (snap ? snap.items.length : -1) + ' keys:[' + (snap ? snap.keys : 'none') + ']'
  } catch {
    return 'probeERR'
  }
}

function onViewed(ctx: FeatureCtx, ev: Event): void {
  try {
    const detail = (ev as CustomEvent<{ sessionId?: unknown }> | null)?.detail
    const sid = detail && typeof detail.sessionId === 'string' ? detail.sessionId : ''
    const rec: UnreadProbeViewed = {
      t: Date.now(),
      len: sid.length,
      charset: charsetOf(sid),
      head8: sid.slice(0, 8),
      wsFound: false,
      wsItems: -1,
    }
    try {
      const snap = snapshotItems(ctx)
      if (snap) {
        rec.wsItems = snap.items.length
        rec.wsFound = sid ? resolveWorkspacePath(sid, snap.items) !== undefined : false
      }
    } catch {
      /* 反查失败即记缺席（wsFound=false, wsItems=-1），不抛 */
    }
    try {
      const st = ensureStore()
      if (st) {
        st.viewed.push(rec)
        if (st.viewed.length > MAX_VIEWED) st.viewed.splice(0, st.viewed.length - MAX_VIEWED)
      }
    } catch {
      /* 落 store 失败忽略 */
    }
    try {
      console.info(PREFIX + ' viewed len=' + rec.len + ' charset=' + rec.charset + ' head8=' + rec.head8 + ' wsFound=' + rec.wsFound + ' wsItems=' + rec.wsItems)
    } catch {
      /* 日志失败忽略 */
    }
  } catch {
    /* 单事件失败绝不向上传播，不破坏宿主 UI */
  }
}

/** 挂载探针（父级接线用）：只添一个 window 事件监听，无定时器，返回卸载函数。 */
export function mountUnreadProbeIdent(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return noop
    ensureStore()
    try {
      console.info(PREFIX + ' mount shape=' + describeService(ctx))
    } catch {
      /* 形状上报失败忽略 */
    }
    try {
      console.info(IDENT_GUIDE)
    } catch {
      /* 指引输出失败忽略 */
    }
    const handler = (ev: Event): void => onViewed(ctx, ev)
    try {
      window.addEventListener(SESSION_VIEWED_EVENT, handler as EventListener)
    } catch {
      return noop
    }
    return () => {
      try {
        window.removeEventListener(SESSION_VIEWED_EVENT, handler as EventListener)
      } catch {
        /* 清理失败忽略 */
      }
    }
  } catch {
    return noop
  }
}
