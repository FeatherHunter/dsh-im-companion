/** V2 行染色（#55）：真相 + 持久表 → 重演 → 行/组染色（门控 join，组从 store 聚合）。 */
import type { RowState } from '../../client/data/activity'
import { replaySession, type ReplayFlag, type ReplayOut } from './replay'

/* 无自有定时器（MO+rAF 跟随）；行 join 唯一命中门；组聚合红>黄>蓝；全 fail-soft；console 仅 mount 一行+变更加一行。 */
const PREFIX = '[unread]'
const ROW_SEL = 'div[role="treeitem"]'
export const ACT = 'data-unread-act'
export const SESS = 'data-unread-sess'
export const TIP = 'data-unread-tip'
const L_RED = '异常 · 需处理'
const L_BLUE = '执行中'
const L_YELLOW = '待看'
const L_WAIT = '待确认 · 等你选择'

interface StoreEntry { seenAt: number | null; notifyAt: number | null }

export type UnreadStoreMap = Record<string, StoreEntry>

function setA(el: Element, k: string, v: string): void {
  try { if (el.getAttribute(k) !== v) el.setAttribute(k, v) } catch { /* 忽略 */ }
}
function delA(el: Element, k: string): void {
  try { if (el.hasAttribute(k)) el.removeAttribute(k) } catch { /* 忽略 */ }
}
function textOf(el: Element): string {
  try { return typeof el.textContent === 'string' ? el.textContent : '' } catch { return '' }
}
/** 标题归一（照抄 design-preview：去时间尾巴/省略号/小写，只做字符串清洗）。 */
export function normUnreadTitle(s: unknown): string {
  try {
    const t = String(s == null ? '' : s).toLowerCase().trim()
    return t.replace(/(刚刚|\d+\s*(分钟|小时|天))\s*$/, '').trim().replace(/[…\.]+$/, '').trim()
  } catch { return '' }
}
/** 行归属：文档序扫描，行归最近上方组行（复刻 sessionsOf；类名哈希不可依赖）。 */
function sessionsOf(groups: Element[]): Map<Element, Element[]> {
  const map = new Map<Element, Element[]>()
  try {
    const order: Element[] = []
    document.querySelectorAll(ROW_SEL).forEach((n) => order.push(n))
    const idx = new Map<Element, number>()
    for (let i = 0; i < groups.length; i++) idx.set(groups[i], i)
    let cur = -1
    for (const el of order) {
      try {
        if (el.getAttribute('aria-expanded') !== null) { cur = idx.has(el) ? (idx.get(el) as number) : -1; continue }
        if (cur < 0) continue
        const arr = map.get(groups[cur]) || []
        arr.push(el)
        map.set(groups[cur], arr)
      } catch { /* 单行跳过 */ }
    }
  } catch { /* 非浏览器静默 */ }
  return map
}
export function numOrNull(v: unknown): number | null {
  try { return typeof v === 'number' && Number.isFinite(v) ? v : null } catch { return null }
}
/** 单会话重演：store 精确 join（top.name 全等）+ replaySession；缺席即双空；归档直接平静（用户裁定：归档不在 V2 宇宙内）。 */
export function replayForTop(t: { name?: unknown; open?: unknown; kind?: unknown; approval?: unknown }, store: UnreadStoreMap, excluded?: Set<string>): ReplayOut {
  try {
    const name = typeof t?.name === 'string' ? t.name : ''
    if (!name) return { flag: 'none', tip: '平静' }
    try {
      if (excluded && excluded.has(name)) return { flag: 'none', tip: '平静' }
    } catch { /* 集合异常当不过滤 */ }
    let e: StoreEntry | undefined
    try { e = store[name] } catch { e = undefined }
    return replaySession({ open: t?.open === true, kind: typeof t?.kind === 'string' ? (t.kind as string) : '', approval: t?.approval === true, seenAt: numOrNull(e?.seenAt), notifyAt: numOrNull(e?.notifyAt) })
  } catch { return { flag: 'none', tip: '平静' } }
}
function shortName(v: unknown): string {
  try {
    const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ')
    return !s ? '' : (s.length > 20 ? s.slice(0, 20) + '…' : s)
  } catch { return '' }
}
/** 组 tip 点名（组红但行不可见时可发现）：红/黄各列最多 3 个磁盘标题。 */
function pushName(arr: string[], tops: unknown[], oi: number): void {
  try {
    if (arr.length >= 3) return
    const n = shortName((tops[oi] as { title?: unknown })?.title)
    if (n && arr.indexOf(n) === -1) arr.push(n)
  } catch { /* 忽略 */ }
}
function withNames(base: string, arr: string[]): string {
  try { return arr.length ? base + '（' + arr.join('、') + '）' : base } catch { return base }
}
function sessAttr(f: ReplayFlag): string {
  try { return f === 'red' ? 'red' : f === 'blue' ? 'exec' : f === 'yellow' ? 'seen' : '' } catch { return '' }
}
function tipFor(o: ReplayOut): string {
  try { return o.flag === 'red' ? L_RED : o.flag === 'blue' ? L_BLUE : o.flag === 'yellow' ? (o.yellowSrc === 'approval-wait' ? L_WAIT : L_YELLOW) : '' } catch { return '' }
}
/** 整轮摘要（状态变化才打一行 + 返回计数供落盘；无标题）。 */
export interface PaintCounts { groups: number; rows: number; red: number; yellow: number; blue: number }
let lastPaintSummary = ''
function reportPaint(groups: Element[]): PaintCounts | null {
  try {
    let rows = 0, red = 0, yellow = 0, blue = 0
    try {
      document.querySelectorAll('[' + SESS + ']').forEach((n) => {
        try {
          rows++
          const v = (n as Element).getAttribute(SESS) || ''
          if (v === 'red') red++
          else if (v === 'seen') yellow++
          else if (v === 'exec') blue++
        } catch { /* 单行跳过 */ }
      })
    } catch { /* 统计失败不影响 */ }
    const s = 'paint groups=' + groups.length + ' rows=' + rows + ' red=' + red + ' yellow=' + yellow + ' blue=' + blue
    if (s !== lastPaintSummary) {
      lastPaintSummary = s
      try { console.info(PREFIX + ' ' + s) } catch { /* 忽略 */ }
      return { groups: groups.length, rows, red, yellow, blue }
    }
    return null
  } catch { return null }
}
/** 整轮染色（可单测）：行唯一命中门染色；组由组内重演态聚合（红>黄>蓝），折叠组同样生效；归档全跳过。
 * 返回本轮计数（变化时）供诊断落盘；无变化/失败返回 null。 */
export function paintUnread(groups: Element[], states: RowState[], store: UnreadStoreMap, excluded?: Set<string>): PaintCounts | null {
  try {
    try { document.querySelectorAll('[' + SESS + ']').forEach((n) => { try { n.removeAttribute(SESS); n.removeAttribute(TIP) } catch { /* 忽略 */ } }) } catch { /* 首轮无旧属性 */ }
    const safe: UnreadStoreMap = store && typeof store === 'object' ? store : {}
    const sessMap = sessionsOf(groups)
    for (let i = 0; i < groups.length; i++) {
      try {
        const st = states[i]
        const rows = sessMap.get(groups[i]) || []
        const tops = st && Array.isArray(st.top) ? st.top : []
        const key = st ? st.key : ''
        const outs: ReplayOut[] = tops.map((t) => replayForTop(t, safe, excluded))
        const isExcluded = (c: number): boolean => {
          try {
            const nm = String((tops[c] as { name?: unknown })?.name ?? '')
            return !!nm && !!excluded && excluded.has(nm)
          } catch { return false }
        }
        const taken: string[] = []
        for (const row of rows) {
          try {
            const rn = normUnreadTitle(textOf(row))
            if (rn.length < 2) continue
            const cand: number[] = []
            for (let c = 0; c < tops.length; c++) {
              try {
                if (isExcluded(c)) continue
                const tn = normUnreadTitle((tops[c] as { title?: unknown })?.title ?? '')
                if (!tn || tn.length < 4) continue
                if (!(tn === rn || (rn.length >= 4 && tn.indexOf(rn) === 0) || rn.indexOf(tn) === 0)) continue
                const ck = key + '/' + String((tops[c] as { name?: unknown })?.name ?? '')
                if (taken.indexOf(ck) !== -1) continue
                cand.push(c)
              } catch { /* 单候选跳过 */ }
            }
            if (cand.length !== 1) continue
            const ci = cand[0]
            taken.push(key + '/' + String((tops[ci] as { name?: unknown })?.name ?? ''))
            const v = sessAttr(outs[ci].flag)
            if (!v) continue
            setA(row, SESS, v)
            setA(row, TIP, tipFor(outs[ci]))
          } catch { /* 单行不影响其他 */ }
        }
        try {
          let gval = ''
          let gtip = ''
          let firstYellowTip = ''
          const redNames: string[] = []
          const yellowNames: string[] = []
          for (let oi = 0; oi < outs.length; oi++) {
            try {
              if (isExcluded(oi)) continue
              const o = outs[oi]
              if (o.flag === 'red') { gval = 'need'; pushName(redNames, tops, oi) }
              else if (o.flag === 'yellow') {
                if (gval !== 'need') gval = 'seen'
                if (!firstYellowTip) firstYellowTip = tipFor(o)
                pushName(yellowNames, tops, oi)
              }
              else if (o.flag === 'blue' && !gval) { gval = 'exec' }
            } catch { /* 单会话不影响聚合 */ }
          }
          if (gval === 'need') gtip = withNames(L_RED, redNames)
          else if (gval === 'seen') gtip = withNames(firstYellowTip || L_YELLOW, yellowNames)
          else if (gval === 'exec') gtip = L_BLUE
          if (gval) { setA(groups[i], ACT, gval); setA(groups[i], TIP, gtip) } else { delA(groups[i], ACT); delA(groups[i], TIP) }
        } catch { /* 组同步失败不影响行 */ }
      } catch { /* 单组失败下组 */ }
    }
    try { return reportPaint(groups) } catch { return null }
  } catch { /* 整轮失败下轮 */ }
  return null
}
