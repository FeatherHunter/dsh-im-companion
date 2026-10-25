/** left-filter 叠加视图：订阅 stream 快照 → 顶部筛选条 + 整组藏显。隐藏单元见 dom-scope（最小独占祖先；扁平退化带会话兄弟），绝不写行内节点。
 * #183 口径（维护者 2026-10-23 拍板）：搜索态不参与筛选——搜索结果是单一扁平列表、与工作区归属无稳定对应，
 * 故搜索态不挂条带、不藏结果行；头栏漏斗置灰（tooltip 说明）且点击无效，退出搜索自动恢复（判据见 dom-scope.searchQueryActive）。
 * 无自有轮询；行悬停无原生 title（2026-09-04 用户裁定，只留自画卡）。 */
import { makeSegmented, type SegHandle } from '../../client/ui/segmented'
import { logLine, logOn } from '../../client/log'
import { localeRevision, onLocaleChange, t } from '../../client/i18n'
import { isPlausibleListContainer } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import { EMPTY_WORKSPACE_INDEX, workspaceIdOfRow, workspaceIndexOf } from '../../client/data/workspace-index'
import type { FeatureCtx } from '../protocol'
import { FILTERS, FILTER_LABEL, countsOf, passFilter, resolveWorkspaceRow, segLabel, type FilterId } from './model'
import { ensureCollapseBtn } from './collapse-all'
import { logResolveStats } from './resolve-log'
import { ensureHeaderBtn, hasHeaderBtn, headerChanged, headerOfInjectedBtn, nextFilter, removeHeaderBtns, resolveHeader } from './header-btn'

import { GROUP_SEL, clearTips, hideRootsFor, isListContainer, restoreAll, searchQueryActive, setHidden, textOf, tuneLabels } from './dom-scope'
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
/* #154：工作区注册表索引的取数口（组行按身份解析 ⇒ 读注册表快照；无自有轮询）。 */
let ctxGet: ((name: string) => unknown) | null = null

/* 关键节点人话（挂载/首次命中）：低频，走 ui.action（area=left-filter），不套开关守卫。 */
function info(msg: string): void {
  logLine('debug', 'ui.action', { area: 'left-filter', action: 'lifecycle', ok: true, message: msg })
}

function collect(sel: string): Element[] {
  const out: Element[] = []
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return out
    document.querySelectorAll(sel).forEach((n) => out.push(n))
  } catch { /* 选择器不支持就空 */ }
  return out
}

/* 判定依据留痕（谁可见/谁被藏 + 名字清单）：每次重绘都会走到，高频 ⇒ 只许 debug 且套开关守卫。 */
function logReasons(filter: FilterId, vis: string[], hidden: string[]): void {
  const sig = filter + '>' + vis.join(',') + '|' + hidden.join(',')
  if (sig === lastReasonSig) return
  lastReasonSig = sig
  try {
    if (!logOn('debug')) return
    const short = (ls: string[]): string => ls.length <= 8 ? ls.join('、') : ls.slice(0, 8).join('、') + '…等' + ls.length + '个'
    logLine('debug', 'ui.action', { area: 'left-filter', action: 'filter-reasons', ok: true, message: FILTER_LABEL[filter] + ' ' + vis.length + ' → [' + short(vis) + ']' + (hidden.length ? '；藏起 ' + hidden.length + ' → [' + short(hidden) + ']' : '') })
  } catch { /* 日志失败忽略 */ }
}

function removeStrip(): void {
  try {
    if (strip && strip.parentNode && typeof strip.parentNode.removeChild === 'function') strip.parentNode.removeChild(strip)
    /* #183 spec 复核修：strip 与句柄必须一起置空。只清 stripSeg 会让下次 ensureStrip 见 strip 仍在而不重建
     * 句柄（makeSegmented 的 setLabel/setValue 全跳过）——搜索退出后三段计数与选中态永久停更。 */
    strip = null
    stripSeg = null
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
        logLine('debug', 'ui.action', { area: 'left-filter', action: 'pick-filter', ok: true, message: FILTER_LABEL[currentFilter] })
        scheduleRepaint(latestBots)
      })
      stripSeg = seg
      strip.appendChild(seg.el)
      try { ensureCollapseBtn(strip) } catch { /* 收起钮失败不影响三段 */ }
      stripOwner = gen
    }
    if (stripOwner !== gen) stripOwner = gen
    if (strip.parentNode !== container) container.insertBefore(strip, container.firstChild)
    try { ensureCollapseBtn(strip) } catch { /* 复用条带补钮 */ }
    try { stripSeg?.setValue(currentFilter); stripSeg?.relayout() } catch { /* 首绘布局失败下次再试 */ }
  } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'strip-fail', ok: false, message: '建条失败（fail-closed，行保持全显）：' + String((e as Error)?.message ?? e) }) }
}

let latestBots: BotSnap[] = []

/* #94 单组树修正：仅 1 个分组时 hideRootsFor 爬到应用根、宽度门必判死 ⇒ 条带静默消失；官方真容器是 role="tree"（结构可信即认）。 */
function listAncestorOf(seed: Element | null): Element | null {
  let node: Element | null = seed
  for (let i = 0; i < 12 && node; i++) {
    if (isListContainer(node)) return node
    try { node = node.parentElement } catch { return null }
  }
  return null
}

function containerOk(el: Element | null | undefined): boolean {
  if (isListContainer(el)) return true
  try { return isPlausibleListContainer(el) } catch { return false }
}

function paint(bots: BotSnap[], gen: number): void {
  if (!genAlive(gen)) return
  if (typeof document === 'undefined') return
  const groups = collect(GROUP_SEL)
  /* #183：搜索态不参与筛选。判据必须同时要求「组行 0」（扁平结果列表替换浏览树）与「搜索框查询非空」——
   * 加载/空列表态组行也为 0，单用会误判；查询判据见 dom-scope.searchQueryActive。 */
  const searchOn = groups.length === 0 && searchQueryActive()
  /* #154：按行身份（data-row-key）解析归属；显示名只作兜底。 */
  const index = ctxGet ? workspaceIndexOf(ctxGet) : EMPTY_WORKSPACE_INDEX
  const rowRes = groups.map((g) => resolveWorkspaceRow(textOf(g), bots, workspaceIdOfRow(g), index))
  const resolved = rowRes.map((r) => r.path)
  logResolveStats(rowRes.map((r) => r.source))
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
  const okParent = (el: Element | null | undefined): Element | null => {
    try {
      if (!el) return null
      const tag = String(el.tagName ?? '').toLowerCase()
      return tag === 'body' || tag === 'html' ? null : el
    } catch { return null }
  }
  /* 条带锚点：隐藏根的父级（列表）；搜索态无组行（searchOn）⇒ 本条不会走到，单组树兜底改锚容器顶部（否则单工作区用户永无条带）。 */
  const firstRoots = groups.length > 0 ? allRoots[0] : []
  let validContainer = okParent(firstRoots.length > 0 ? firstRoots[0].parentElement : null)
  if (!validContainer && firstRoots.length > 0) validContainer = okParent(firstRoots[0])
  /* #94：容器落到应用根（单组树）时改用官方列表容器；结构可信优先于宽度启发式。 */
  if (!containerOk(validContainer)) {
    const seed = groups.length > 0 ? groups[0] : validContainer
    const structural = listAncestorOf(seed)
    if (structural && structural !== validContainer) validContainer = structural
  }
  /* 头锚：优先从行种子找头栏（行比容器稳定）；搜索态组行已消失、没有种子，复用已挂头钮的父级
   * （原生头栏不重渲染，注入钮仍在原头栏；「钮挂在哪个头」的知识归 header-btn）。头钮挂载不依赖条带验货。 */
  const seedForHeader = groups.length > 0 ? groups[0] : validContainer
  const header: Element | null = (seedForHeader ? resolveHeader(seedForHeader) : null) || (searchOn ? headerOfInjectedBtn() : null)
  /* #184 验收修：换语言时 DSH 重建左栏头（注入钮随旧头失效）；头变了清签名、签名记 hb ⇒ 重挂（详见 header-btn）。 */
  if (headerChanged(header)) lastSig = ''
  /* 签名里的 hb 现读 DOM：挂完钮要按「真实已挂」记账（首绘签名 hb:0，若按挂前记账，之后钮被摘时 hb:0 撞旧签名 ⇒ 又短路）。 */
  const buildSig = (): string => currentFilter + '|' + localeRevision() + '|' + counts.all + '/' + counts.bound + '/' + counts.unbound + '|' + visKeys.join(',') + '|' + hiddenSections.length + '|s:' + (searchOn ? '1' : '0') + '|h:' + (header ? '1' : '0') + '|hb:' + (hasHeaderBtn(header) ? '1' : '0')
  const sig = buildSig()
  const mountHead = (): void => {
    if (!header) { if (searchOn) { try { removeHeaderBtns() } catch { /* 摘除失败忽略 */ } } return }
    try { ensureHeaderBtn(header, currentFilter, counts, () => { currentFilter = nextFilter(currentFilter); logLine('debug', 'ui.action', { area: 'left-filter', action: 'cycle-filter', ok: true, message: FILTER_LABEL[currentFilter] }); scheduleRepaint(latestBots, activeGen) }, searchOn) } catch { /* 头按钮失败不影响条带 */ }
    lastSig = buildSig()
  }
  /* 第三步验货：容器混入行外原生按钮或超宽即猜大了→条带 fail-closed（摘条带、还原），但头钮照常挂。 */
  try {
    if (validContainer && !containerOk(validContainer)) {
      if (sig === lastSig && validContainer === lastContainer) return
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'container-reject', ok: false, message: '容器验货未过 ⇒ 条带 fail-closed 摘除（头钮照挂）' })
      lastSig = sig
      if (lastContainer && lastContainer !== validContainer) removeHint(lastContainer)
      lastContainer = validContainer
      restoreAll()
      removeStrip()
      removeHint(validContainer)
      mountHead()
      return
    }
  } catch { /* 验货失败按通过处理，下游照常 */ }
  if (sig === lastSig && validContainer === lastContainer) return
  lastSig = sig
  if (lastContainer && lastContainer !== validContainer) removeHint(lastContainer)
  lastContainer = validContainer
  restoreAll()
  if (!validContainer) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'no-container', ok: false, message: (searchOn ? '搜索态（不参与筛选）' : '无有效容器') + ' ⇒ 只摘条带不绘制（等结构稳定再试）' })
    removeStrip()
    /* #183：搜索态头钮置灰说明（不摘、避免头栏跳动）；非搜索态维持改前行为（头钮留给下一轮重绘更新）——
     * 容器瞬态丢失时摘了再挂会晃，且旧行为本来也不在此摘。 */
    if (searchOn) mountHead()
    return
  }
  ensureStrip(validContainer, gen)
  mountHead()
  try {
    if (stripSeg) for (const f of FILTERS) stripSeg.setLabel(f, segLabel(f, counts[f]))
  } catch { /* 计数更新失败下次再试 */ }
  tuneLabels(strip)
  for (const s of hiddenSections) setHidden(s, true)
  logReasons(currentFilter, visLabels, hiddenLabels)
  const treeEmpty = groups.length > 0 && visKeys.length === 0
  removeHint(validContainer)
  if (treeEmpty) {
    try {
      const hint = document.createElement('div')
      hint.setAttribute('class', EMPTY_CLASS)
      hint.textContent = t('left-filter', 'empty.workspace')
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
    try { paint(latestBots, pendingGen) } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'paint-fail', ok: false, message: String((e as Error)?.message ?? e) }) }
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
  /* #154：注册表取数口（惰性读；读不到就退回老口径字面匹配）。 */
  ctxGet = typeof ctx.get === 'function' ? (name: string) => ctx.get(name) : null
  let bots: BotSnap[] = []
  let hasSnap = false
  let loggedHit = false
  let lastTotal = -1
  let observer: MutationObserver | undefined
  latestBots = []
  pendingGen = myGen
  info('已挂载（整组藏显 + 搜索态不筛 + #94 容器结构兜底 v2，等 stream 首轮快照）')
  /* #184：换语即强制重绘（清签名 ⇒ 走完整绘制，三段标签/空提示/悬停一起刷新）。 */
  let offLocale: () => void = () => {}
  try { offLocale = onLocaleChange(() => { lastSig = ''; lastReasonSig = ''; scheduleRepaint(latestBots, myGen) }) } catch { /* 订阅失败只影响即时换语 */ }
  let unsub: (() => void) | null = null
  try {
    unsub = ctx.subscribe((_snap: StreamSnapshot) => {
      bots = _snap.bots
      hasSnap = _snap.updatedAt > 0
      if (!genAlive(myGen)) return
      if (!hasSnap) return
      scheduleRepaint(bots, myGen)
    })
  } catch (e) {
    logLine('error', 'feature.mount.fail', { feature: 'left-filter', message: String((e as Error)?.message ?? e) })
    return noop
  }
  try {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => { if (hasSnap) scheduleRepaint(bots, myGen) })
      observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
    }
  } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'no-observer', ok: false, message: 'MutationObserver 不可用，只靠快照重绘：' + String((e as Error)?.message ?? e) }) }
  const totalTimer = (): void => {
    try {
      const n = collect(GROUP_SEL).length
      if (!loggedHit && n > 0) { loggedHit = true; info('命中 ' + n + ' 行，开始过滤') }
      if (n !== lastTotal) { lastTotal = n; if (logOn('debug')) logLine('debug', 'ui.action', { area: 'left-filter', action: 'target-rows', ok: true, message: '目标行 ' + n }) }
    } catch { /* 统计失败忽略 */ }
  }
  try { totalTimer() } catch { /* 忽略 */ }
  return () => {
    try { unsub?.() } catch { /* 清理失败忽略 */ }
    try { offLocale() } catch { /* 退订失败忽略 */ }
    try { observer?.disconnect() } catch { /* 清理失败忽略 */ }
    try { if (stripOwner === myGen) { removeStrip(); strip = null } } catch { /* 清理失败忽略 */ }
    try { removeHeaderBtns() } catch { /* 清理失败忽略 */ }
    try { removeHint(lastContainer); lastContainer = null; lastSig = ''; lastReasonSig = '' } catch { /* 清理失败忽略 */ }
    try { clearTips() } catch { /* 清理失败忽略 */ }
    try { restoreAll() } catch { /* 清理失败忽略 */ }
  }
}
