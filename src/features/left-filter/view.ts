/** left-filter 叠加视图：订阅 stream 快照 → 顶部筛选条 + 整组藏显。
 * 隐藏单元见 dom-scope（最小独占祖先；扁平退化带会话兄弟），绝不写行内节点；重渲染换节点由 observer 重算。
 * 搜索态（button[role=treeitem] 结果行）按归属名二次映射，实现叠加 AND。无自有轮询。
 * 行悬停无原生 title（2026-09-04 用户裁定）：原生“助理：…”气泡与自画卡打架，永久退役，悬停只留自画卡。 */
import { makeSegmented, type SegHandle } from '../../client/ui/segmented'
import type { BotSnap } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'
import { FILTERS, FILTER_LABEL, countsOf, passFilter, resolveResultKey, resolveWorkspaceKey, segLabel, type FilterId } from './model'
import { ensureHeaderBtn, nextFilter, removeHeaderBtns, resolveHeader } from './header-btn'

import { GROUP_SEL, RESULT_SEL, clearTips, hideRootsFor, restoreAll, setHidden, textOf } from './dom-scope'
const STRIP_CLASS = 'left-filter-strip'
const EMPTY_CLASS = 'left-filter-empty'
let lastReasonSig = ''

/* 代际哨兵（B1 同款教训）：热更新双挂载时只有最新一代持有条带并藏显。 */
let activeGen = 0
const claimGen = (): number => { try { const w = window as unknown as Record<string, number>; w.__lfGen = (w.__lfGen || 0) + 1; return w.__lfGen } catch { return 1 } }
const genAlive = (g: number): boolean => { try { return (window as unknown as Record<string, number>).__lfGen === g } catch { return true } }

let currentFilter: FilterId = 'all'
let strip: HTMLElement | null = null
let stripSeg: SegHandle | null = null
let stripOwner = 0
let lastSig = ''
let lastContainer: Element | null = null

function info(msg: string): void {
  try { console.info('[dsh-im-companion] left-filter：' + msg) } catch { /* 无 console 静默 */ }
}

function collect(sel: string): Element[] {
  const out: Element[] = []
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return out
    document.querySelectorAll(sel).forEach((n) => out.push(n))
  } catch { /* 选择器不支持就空 */ }
  return out
}

/** 数字降级：把“有助理 2”拆成标签 + span.left-filter-n（setLabel 会重置文本，每次重调，幂等）。 */
function tuneLabels(host: Element | null): void {
  try {
    if (!host || typeof host.querySelectorAll !== 'function') return
    host.querySelectorAll('.af-seg-item').forEach((btn) => {
      try {
        if (btn.querySelector('.left-filter-n')) return
        const m = /^(.*)\s+(\d+)$/.exec(textOf(btn))
        if (!m) return
        btn.textContent = m[1] + ' '
        const doc = btn.ownerDocument ?? document
        const span = doc.createElement('span')
        span.setAttribute('class', 'left-filter-n')
        span.textContent = m[2]
        btn.appendChild(span)
      } catch { /* 单钮失败忽略 */ }
    })
  } catch { /* 调整失败忽略 */ }
}

function logReasons(filter: FilterId, vis: string[], hidden: string[]): void {
  const sig = filter + '>' + vis.join(',') + '|' + hidden.join(',')
  if (sig === lastReasonSig) return
  lastReasonSig = sig
  try {
    const short = (ls: string[]): string => ls.length <= 8 ? ls.join('、') : ls.slice(0, 8).join('、') + '…等' + ls.length + '个'
    console.info('[dsh-im-companion] left-filter：' + FILTER_LABEL[filter] + ' ' + vis.length + ' → [' + short(vis) + ']' + (hidden.length ? '；藏起 ' + hidden.length + ' → [' + short(hidden) + ']' : ''))
  } catch { /* 日志失败忽略 */ }
}

function removeStrip(): void {
  try {
    stripSeg = null
    if (strip && strip.parentNode && typeof strip.parentNode.removeChild === 'function') strip.parentNode.removeChild(strip)
  } catch { /* 摘除失败忽略 */ }
}

function removeHint(container: Element | null): void {
  try {
    if (!container || typeof container.querySelector !== 'function') return
    const old = container.querySelector('.' + EMPTY_CLASS)
    if (old && old.parentNode && typeof old.parentNode.removeChild === 'function') old.parentNode.removeChild(old)
  } catch { /* 摘除失败忽略 */ }
}

function ensureStrip(container: Element, gen: number): void {
  try {
    if (typeof document === 'undefined') return
    if (!strip) {
      strip = document.createElement('div')
      strip.setAttribute('class', STRIP_CLASS)
      strip.setAttribute('role', 'tablist')
      const seg = makeSegmented(FILTERS.map((f) => ({ id: f, label: segLabel(f, 0) })), currentFilter, (id) => {
        currentFilter = id as FilterId
        scheduleRepaint(latestBots)
      })
      stripSeg = seg
      strip.appendChild(seg.el)
      stripOwner = gen
    }
    if (stripOwner !== gen) stripOwner = gen
    if (strip.parentNode !== container) container.insertBefore(strip, container.firstChild)
    try { stripSeg?.setValue(currentFilter); stripSeg?.relayout() } catch { /* 首绘布局失败下次再试 */ }
  } catch { /* 建条失败就无条带（fail-closed 条带，行保持全显） */ }
}

let latestBots: BotSnap[] = []

function paint(bots: BotSnap[], gen: number): void {
  if (!genAlive(gen)) return
  if (typeof document === 'undefined') return
  const groups = collect(GROUP_SEL)
  const results = collect(RESULT_SEL)
  const resolved = groups.map((g) => resolveWorkspaceKey(textOf(g), bots))
  const counts = countsOf(resolved, bots)
  const visKeys: string[] = []
  const hiddenSections: Element[] = []
  const visLabels: string[] = []
  const hiddenLabels: string[] = []
  const allRoots = groups.map((g) => hideRootsFor(g))
  for (let i = 0; i < groups.length; i++) {
    const pass = passFilter(resolved[i], currentFilter, bots)
    const label = textOf(groups[i]).slice(0, 24) || resolved[i]
    if (pass) { visKeys.push('g:' + resolved[i]); visLabels.push(label); try { groups[i].removeAttribute('title'); groups[i].removeAttribute('data-lf-tip') } catch { /* 单行清理失败忽略 */ } }
    else { for (const h of allRoots[i]) hiddenSections.push(h); hiddenLabels.push(label) }
  }
  const hiddenResults: Element[] = []
  for (const r of results) {
    const ws = resolveResultKey(textOf(r), bots)
    if (passFilter(ws, currentFilter, bots)) visKeys.push('r:' + ws + ':' + textOf(r).slice(0, 24))
    else hiddenResults.push(r)
  }
  const okParent = (el: Element | null | undefined): Element | null => {
    try {
      if (!el) return null
      const tag = String(el.tagName ?? '').toLowerCase()
      return tag === 'body' || tag === 'html' ? null : el
    } catch { return null }
  }
  /* 条带锚点：隐藏根的父级（列表），搜索态取结果行的父级（结果列表）。 */
  const firstRoots = groups.length > 0 ? allRoots[0] : []
  const validContainer = okParent(firstRoots.length > 0 ? firstRoots[0].parentElement : null)
    ?? (results.length > 0 ? okParent(results[0].parentElement) : null)
  const header = validContainer ? resolveHeader(validContainer) : null
  const sig = currentFilter + '|' + counts.all + '/' + counts.bound + '/' + counts.unbound + '|' + visKeys.join(',') + '|' + hiddenSections.length + '/' + hiddenResults.length + '|h:' + (header ? '1' : '0')
  if (sig === lastSig && validContainer === lastContainer) return
  lastSig = sig
  if (lastContainer && lastContainer !== validContainer) removeHint(lastContainer)
  lastContainer = validContainer
  restoreAll()
  if (!validContainer) { removeStrip(); return }
  ensureStrip(validContainer, gen)
  if (header) {
    try { ensureHeaderBtn(header, currentFilter, counts, () => { currentFilter = nextFilter(currentFilter); scheduleRepaint(latestBots, activeGen) }) } catch { /* 头按钮失败不影响条带 */ }
  }
  const key = counts.all + '/' + counts.bound + '/' + counts.unbound
  try {
    if (stripSeg) for (const f of FILTERS) stripSeg.setLabel(f, segLabel(f, counts[f]))
  } catch { /* 计数更新失败下次再试 */ }
  tuneLabels(strip)
  void key
  for (const s of hiddenSections) setHidden(s, true)
  for (const r of hiddenResults) setHidden(r, true)
  logReasons(currentFilter, visLabels, hiddenLabels)
  const treeEmpty = groups.length > 0 && visKeys.filter((k) => k.startsWith('g:')).length === 0
  const searchEmpty = groups.length === 0 && results.length > 0 && visKeys.length === 0
  removeHint(validContainer)
  if (treeEmpty || searchEmpty) {
    try {
      const hint = document.createElement('div')
      hint.setAttribute('class', EMPTY_CLASS)
      hint.textContent = treeEmpty ? '没有匹配的工作区' : '没有匹配的会话'
      validContainer.appendChild(hint)
    } catch { /* 空提示失败忽略 */ }
  }
}

let rafQueued = false
let pendingGen = 0
function scheduleRepaint(bots: BotSnap[], gen?: number): void {
  latestBots = bots
  if (gen !== undefined) pendingGen = gen
  const run = (): void => {
    rafQueued = false
    try { paint(latestBots, pendingGen) } catch { /* 绘制失败下次再试 */ }
  }
  try {
    if (typeof requestAnimationFrame === 'function') {
      if (rafQueued) return
      rafQueued = true
      requestAnimationFrame(() => run())
    } else run()
  } catch { run() }
}

/** 挂载：订阅 stream + observer；首轮快照前不绘制；返回 dispose（卸载即净）。 */
export function mountLeftFilter(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  if (typeof document === 'undefined') return noop
  const myGen = claimGen()
  activeGen = myGen
  void activeGen
  let bots: BotSnap[] = []
  let hasSnap = false
  let loggedHit = false
  let lastTotal = -1
  let observer: MutationObserver | undefined
  latestBots = []
  pendingGen = myGen
  info('已挂载（整组藏显 + 搜索 AND，等 stream 首轮快照）')
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((_snap: StreamSnapshot) => {
      bots = _snap.bots
      hasSnap = _snap.updatedAt > 0
      if (!genAlive(myGen)) return
      if (!hasSnap) return
      scheduleRepaint(bots, myGen)
    })
  } catch { return noop }
  try {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => { if (hasSnap) scheduleRepaint(bots, myGen) })
      observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
    }
  } catch { /* 无 observer 就只靠快照重绘 */ }
  const totalTimer = (): void => {
    try {
      const n = collect(GROUP_SEL).length + collect(RESULT_SEL).length
      if (!loggedHit && n > 0) { loggedHit = true; info('命中 ' + n + ' 行，开始过滤') }
      if (n !== lastTotal) { lastTotal = n; try { console.debug('[dsh-im-companion] left-filter：目标行 ' + n) } catch { /* 静默 */ } }
    } catch { /* 统计失败忽略 */ }
  }
  try { totalTimer() } catch { /* 忽略 */ }
  return () => {
    try { unsub?.() } catch { /* 清理失败忽略 */ }
    try { observer?.disconnect() } catch { /* 清理失败忽略 */ }
    try { if (stripOwner === myGen) { removeStrip(); strip = null } } catch { /* 清理失败忽略 */ }
    try { removeHeaderBtns() } catch { /* 清理失败忽略 */ }
    try { removeHint(lastContainer); lastContainer = null; lastSig = ''; lastReasonSig = '' } catch { /* 清理失败忽略 */ }
    try { clearTips() } catch { /* 清理失败忽略 */ }
    try { restoreAll() } catch { /* 清理失败忽略 */ }
  }
}
