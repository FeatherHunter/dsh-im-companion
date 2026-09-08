/** TEMP 探针A（定稿即删，仿 design-preview 先例）：#51 子问题1 —— 官方会话列表快照是否经 ctx.get 对插件可读。
 * 只读 src/features/unread-probe/ 下本文件；不改任何共享文件；不注册进 FEATURES（父级手动挂载验证）。
 * 行为：mount(ctx) 后立即探针一次 + 复用 15s stream 订阅做事件驱动重探（禁新增定时器，禁 localStorage）。
 * 全防御式 try/catch（fail-soft）；日志前缀 [unread-probe]；结果写入 window.__unreadProbe.svc。
 * 隐私：只记字段名/计数/id 格式（sessionId 只记前 8 位），绝不记标题/正文内容。 */
import type { FeatureCtx } from '../protocol'

const PREFIX = '[unread-probe]'

/* 候选服务名（workspaces 必含；其余均有仓内依据，命中失败 catch 跳过）：
 * - workspaces：依据 src/features/session-header/view.ts:17、src/features/adopt/panel.ts:33、
 *   src/features/design-preview/demo.ts:142、src/client/index.ts:11（list.getSnapshot 已知可用，对照组）。
 * - uiWorkspace：依据 src/client/index.ts:12,38、src/features/detail-drawer/drawer.ts:212、
 *   src/client/ui/dir-picker.ts:47（目录选择服务，预期无 list.getSnapshot，阴性对照）。
 * - sessions/session：依据 docs/research/05-e4-unread-source.md H3/H4（dsh-api-session-controller /
 *   dsh-session / dsh-session-query 为官方会话列表拥有者）+ protocol SlotTarget 'conversation-session'。
 * - conversation/conversations：依据 src/features/protocol.ts:6（SlotTarget）+ research/06
 *   single 独占槽 conversation.session + research/05 dsh-client-ui-conversation 包名。
 * 负结果歧义声明（client/index.ts:11-12,42-49）：ctx.get 是宿主透传，workspaces 免声明可用，
 * 但未知服务可能需进 inject 声明才注入——全 miss 时 verdict 不是"不可读"，而是"需声明探针"
 *（往 inject 加名重打再探），见 #51 真机清单。 */
const CANDIDATES: readonly string[] = ['workspaces', 'sessions', 'session', 'conversation', 'conversations', 'uiWorkspace']

const WANT_KEYS: readonly string[] = ['sessionId', 'completed', 'current', 'running', 'blank', 'title']

function safeKeys(o: unknown, cap = 24): string[] {
  try {
    if (!o || typeof o !== 'object') return []
    return Object.keys(o as Record<string, unknown>).sort().slice(0, cap)
  } catch {
    return []
  }
}

/** id 格式脱敏：只记 typeof + 字符串长度 + 前 8 位（满足"只记 id 格式"军规）。 */
function idFormat(v: unknown): string {
  try {
    if (typeof v === 'string') return 'string(len=' + v.length + ',prefix=' + v.slice(0, 8) + ')'
    if (typeof v === 'number') return 'number'
    if (v === null || v === undefined) return String(v)
    return typeof v
  } catch {
    return 'unknown'
  }
}

interface SvcEntry {
  name: string
  status: 'missing' | 'no-get' | 'found-no-list' | 'no-snapshot-fn' | 'snapshot-ok' | 'snapshot-threw' | 'threw'
  serviceKeys?: string[]
  listKeys?: string[]
  snapKeys?: string[]
  itemsLength?: number
  firstKeys?: string[]
  has?: Record<string, boolean>
  idFormat?: string
  hasCurrentTop?: boolean
}

function probeOne(ctx: FeatureCtx, name: string): SvcEntry {
  try {
    let svc: unknown
    try {
      const get = (ctx as unknown as { get?: unknown }).get
      if (typeof get !== 'function') return { name, status: 'no-get' }
      svc = (get as (n: string) => unknown).call(ctx, name)
    } catch {
      return { name, status: 'threw' }
    }
    if (svc === null || svc === undefined) return { name, status: 'missing' }
    const serviceKeys = safeKeys(svc)
    let listRec: Record<string, unknown> | null = null
    try {
      listRec = (svc as Record<string, unknown>)['list'] as Record<string, unknown> | null
    } catch {
      listRec = null
    }
    if (!listRec || typeof listRec !== 'object') return { name, status: 'found-no-list', serviceKeys }
    const listKeys = safeKeys(listRec)
    let snapFn: unknown = null
    try {
      snapFn = listRec['getSnapshot']
    } catch {
      snapFn = null
    }
    if (typeof snapFn !== 'function') return { name, status: 'no-snapshot-fn', serviceKeys, listKeys }
    let snap: Record<string, unknown> | null = null
    try {
      snap = (snapFn as () => unknown).call(listRec) as Record<string, unknown> | null
    } catch {
      return { name, status: 'snapshot-threw', serviceKeys, listKeys }
    }
    if (!snap || typeof snap !== 'object') return { name, status: 'snapshot-threw', serviceKeys, listKeys }
    const snapKeys = safeKeys(snap)
    let items: unknown = null
    try {
      items = (snap as Record<string, unknown>)['items']
    } catch {
      items = null
    }
    const arr = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : []
    const first = arr.length > 0 && arr[0] && typeof arr[0] === 'object' ? arr[0] : null
    const firstKeys = first ? safeKeys(first) : []
    const has: Record<string, boolean> = {}
    try {
      for (const k of WANT_KEYS) {
        try {
          has[k] = first ? k in (first as object) : false
        } catch {
          has[k] = false
        }
      }
    } catch {
      /* has 保持已填部分 */
    }
    let fmt = 'none'
    try {
      if (first && 'sessionId' in (first as object)) fmt = idFormat((first as Record<string, unknown>)['sessionId'])
      else if (first && 'id' in (first as object)) fmt = idFormat((first as Record<string, unknown>)['id'])
    } catch {
      fmt = 'unknown'
    }
    let hasCurrentTop = false
    try {
      hasCurrentTop = 'current' in snap
    } catch {
      hasCurrentTop = false
    }
    return { name, status: 'snapshot-ok', serviceKeys, listKeys, snapKeys, itemsLength: arr.length, firstKeys, has, idFormat: fmt, hasCurrentTop }
  } catch {
    return { name, status: 'threw' }
  }
}

function probeOnce(ctx: FeatureCtx): void {
  try {
    const entries: SvcEntry[] = []
    try {
      for (const n of CANDIDATES) {
        try {
          entries.push(probeOne(ctx, n))
        } catch {
          entries.push({ name: n, status: 'threw' })
        }
      }
    } catch {
      /* entries 保持已填部分 */
    }
    const report = { updatedAt: 0, candidates: entries }
    try {
      report.updatedAt = Date.now()
    } catch {
      /* 时间取失败不影响上报 */
    }
    try {
      const w = window as unknown as Record<string, unknown>
      const prev = (w['__unreadProbe'] && typeof w['__unreadProbe'] === 'object'
        ? (w['__unreadProbe'] as Record<string, unknown>)
        : {}) as Record<string, unknown>
      prev['svc'] = report
      w['__unreadProbe'] = prev
    } catch {
      /* 宿主无 window 时只打日志 */
    }
    try {
      const summary = entries.map((e) => e.name + '=' + e.status + (e.itemsLength !== undefined ? '(n=' + e.itemsLength + ')' : '')).join(' ')
      /* 变更才打日志（15s 重探常态无刷屏）；window 对象每次都更新供控制台读。 */
      const w2 = window as unknown as Record<string, unknown> & { __unreadProbeLastSvcSummary?: unknown }
      if (w2['__unreadProbeLastSvcSummary'] !== summary) {
        w2['__unreadProbeLastSvcSummary'] = summary
        console.info(PREFIX + ' svc ' + summary)
      }
    } catch {
      /* 日志失败忽略 */
    }
  } catch {
    /* 探针整体 fail-soft，绝不破坏宿主 UI */
  }
}

/** 探针挂载（TEMP，定稿即删）：立即探针一次 + 复用 stream 订阅事件驱动重探；返回卸载函数。 */
export function mount(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  try {
    try {
      probeOnce(ctx)
    } catch {
      /* 首探失败不影响订阅 */
    }
    let unsub: (() => void) | null = null
    try {
      unsub = ctx.subscribe(() => {
        try {
          probeOnce(ctx)
        } catch {
          /* 重探失败忽略 */
        }
      })
    } catch {
      unsub = null
    }
    return () => {
      try {
        if (typeof unsub === 'function') unsub()
      } catch {
        /* 清理失败忽略 */
      }
    }
  } catch {
    return noop
  }
}
