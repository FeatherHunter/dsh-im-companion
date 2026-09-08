/** TEMP 真机探针 C（#51 子问题 3+4，定稿即删，仿 design-preview 先例）。
 * 只读、不染、不定时：无 timer、无 localStorage、无 DOM 写；一切失败静默 fail-soft。
 * 用法（控制台/HITL）：`window.__unreadProbe.mounts` 看 header 挂载/切换序列；
 * `window.__unreadProbe.auditRows()` 对 live DOM 只计数、不读文本。
 * 隐私：日志只记字段名/计数/id 前 8 位，绝不记标题/正文内容。 */

import { SESSION_VIEWED_EVENT } from '../../client/data/header-overlay'

export interface MountRecord {
  seq: number
  t: number
  /** sessionId 前 8 位（隐私截断），空串=取不到 */
  sid8: string
  kind: 'mount' | 'switch' | 'remount' | 'event'
  reason: string
}

export interface RowAudit {
  scanned: number
  done: number
  doneSelected: number
  selected: number
  /** 固定字段名清单（证明没读别的） */
  fields: string[]
}

declare global {
  interface Window {
    /** 合并命名空间（svc/ident/child 三模块共享，merge 不覆盖）：各键均可选。 */
    __unreadProbe?: {
      svc?: unknown
      viewed?: unknown[]
      guide?: string
      mountedAt?: number
      mounts: MountRecord[]
      auditRows: () => RowAudit
      recordHeaderMount: (sessionId: unknown, reason?: unknown) => void
      installed?: boolean
    }
  }
}

var PREFIX = '[unread-probe]'
var EVENT_NAME = SESSION_VIEWED_EVENT
var FIELDS = ['role=treeitem', 'data-state', 'aria-selected']
var MAX_MOUNTS = 200
var seq = 0
var lastSid8 = ''

function shortId(v: unknown): string {
  try {
    var s = String(v == null ? '' : v).trim()
    if (!s) return ''
    return s.slice(0, 8)
  } catch { return '' }
}

function shortReason(v: unknown): string {
  try {
    var s = String(v == null ? '' : v).trim()
    if (!s) return ''
    return s.slice(0, 32)
  } catch { return '' }
}

function log(msg: string): void {
  try {
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(PREFIX + ' ' + msg)
    }
  } catch { /* 日志失败不影响宿主 */ }
}

/** (1) 记录 header 挂载/切换一笔：供 #51-Q3（C4 子会话判定：连续切换/child 挂载识别）。 */
export function recordHeaderMount(sessionId: unknown, reason?: unknown): void {
  try {
    var sid8 = shortId(sessionId)
    var r = shortReason(reason) || 'manual'
    var kind: MountRecord['kind'] = 'mount'
    try {
      if (r === 'event') kind = 'event'
      else if (lastSid8 !== '' && sid8 !== '' && sid8 !== lastSid8) kind = 'switch'
      else if (lastSid8 !== '' && sid8 !== '' && sid8 === lastSid8) kind = 'remount'
    } catch { kind = 'mount' }
    lastSid8 = sid8 || lastSid8
    var rec: MountRecord = { seq: seq++, t: Date.now(), sid8: sid8, kind: kind, reason: r }
    try {
      var ns = typeof window !== 'undefined' ? window.__unreadProbe : undefined
      if (ns && Array.isArray(ns.mounts)) {
        ns.mounts.push(rec)
        while (ns.mounts.length > MAX_MOUNTS) ns.mounts.shift()
      }
    } catch { /* 缓存失败忽略 */ }
    log('mount seq=' + rec.seq + ' kind=' + kind + ' sid8=' + (sid8 || '(empty)') + ' reason=' + r)
  } catch { /* fail-soft：绝不破坏宿主 UI */ }
}

/** 原生 data-state 直读（内联 truth-flags/dom-state.ts 语义，不跨 feature import）：只认小写三值。 */
function nativeStateOf(row: Element): string {
  try {
    var el = row.querySelector('[data-state]')
    if (!el) return ''
    var s = String(el.getAttribute('data-state') || '').toLowerCase().trim()
    if (s === 'ongoing' || s === 'warning' || s === 'done') return s
    return ''
  } catch { return '' }
}

function selectedOf(row: Element): boolean {
  try {
    return row.getAttribute('aria-selected') === 'true'
  } catch { return false }
}

/** (2) live DOM 行审计：只计数（done 行数、done+selected 行数、selected 总数），绝不读文本内容。 */
export function auditRows(): RowAudit {
  var out: RowAudit = { scanned: 0, done: 0, doneSelected: 0, selected: 0, fields: FIELDS.slice() }
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return out
    var rows: ArrayLike<Element>
    try {
      rows = document.querySelectorAll('div[role="treeitem"]')
    } catch { return out }
    var n = 0
    try { n = (rows as { length?: unknown }).length as number || 0 } catch { n = 0 }
    out.scanned = n
    for (var i = 0; i < n; i++) {
      try {
        var row = (rows as unknown as { [k: number]: Element })[i]
        if (!row) continue
        var st = nativeStateOf(row)
        var sel = selectedOf(row)
        if (st === 'done') out.done++
        if (sel) out.selected++
        if (st === 'done' && sel) out.doneSelected++
      } catch { /* 单行失败跳过 */ }
    }
    log('audit scanned=' + out.scanned + ' done=' + out.done
      + ' doneSelected=' + out.doneSelected + ' selected=' + out.selected)
  } catch { /* fail-soft */ }
  return out
}

/** 事件驱动自挂载（无定时器）：header 的 SESSION_VIEWED_EVENT 触发即记一笔 kind=event。 */
function autoListen(): void {
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
    if (window.__unreadProbe && window.__unreadProbe.installed === true) return
    window.addEventListener(EVENT_NAME, function (ev: Event) {
      try {
        var sid: unknown = ''
        try {
          var ce = ev as CustomEvent
          var d = (ce && (ce as { detail?: unknown }).detail) as { sessionId?: unknown } | null
          sid = (d && d.sessionId) || ''
        } catch { sid = '' }
        recordHeaderMount(sid, 'event')
      } catch { /* fail-soft */ }
    })
    try {
      if (window.__unreadProbe) window.__unreadProbe.installed = true
    } catch { /* 标记失败忽略 */ }
  } catch { /* fail-soft */ }
}

/** 命名空间自注册（merge 不覆盖：保留 svc/ident 已写的 svc/viewed/guide/mountedAt）。 */
function ensureNs(): void {
  try {
    if (typeof window === 'undefined') return
    var prevMounts: MountRecord[] = []
    var wasInstalled = false
    var keep: Record<string, unknown> = {}
    try {
      var cur = window.__unreadProbe as unknown as Record<string, unknown> | undefined
      if (cur && typeof cur === 'object') {
        if (Array.isArray(cur['mounts'])) prevMounts = cur['mounts'] as MountRecord[]
        wasInstalled = cur['installed'] === true
        for (var k = 0; k < ['svc', 'viewed', 'guide', 'mountedAt'].length; k++) {
          var key = ['svc', 'viewed', 'guide', 'mountedAt'][k]
          try { if (cur[key] !== undefined) keep[key] = cur[key] } catch { /* 单键失败跳过 */ }
        }
      }
    } catch { prevMounts = [] }
    var next: Record<string, unknown> = keep
    next['mounts'] = prevMounts
    next['auditRows'] = auditRows
    next['recordHeaderMount'] = recordHeaderMount
    next['installed'] = wasInstalled
    window.__unreadProbe = next as unknown as NonNullable<Window['__unreadProbe']>
  } catch { /* fail-soft */ }
}

try { ensureNs() } catch { /* 忽略 */ }
try { autoListen() } catch { /* 忽略 */ }
try { log('ready fields=' + FIELDS.join(',') + ' (mounts[] + auditRows())') } catch { /* 忽略 */ }
