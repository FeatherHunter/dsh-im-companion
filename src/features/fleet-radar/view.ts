/** FleetRadar 舰队雷达（A 稠密表 verdict #10；DSH 正中大弹窗，一次完整展示、无横向滚动）。
 * 行＝家：每行一个 home，看其下有哪些助理（assistant），助理的渠道由其绑定的机器人决定（channelOf）；
 * 格＝同家同渠道多助理合并；行汇总＝整行状态（在线/待确认/离线＋助理构成＋待绑/失联）。无家表时回落旧 Agent 矩阵。
 * 事件制（DetailDrawer 抽屉同款）：A1 船按钮经 FLEET_VIEW_EVENT 派发，本特性监听后居中弹模态；
 * 弹窗挂 body（宽版一次放下 9 列），Esc/点外部/关闭键三路可关；开弹窗才订阅、关即退订。
 * 数据：单份 stream 订阅 + meta 读取 + 家表（home.list）；无自有轮询；点格派发 drillKey（home.path，抽屉兼容）。
 * 双语：跟随 DSH 系统语言（documentElement.lang + 属性监听即时跟随，无开关）+ data.ts 字典。
 * LOGO：渠道 glyph（dsh-im 同款字符串，DetailDrawer 同渲染模式 html 注入）+ 文字，表头同；未知渠道只剩文字。 */
import { h, mount } from '../../client/dom'
import { EMPTY_META } from '../../client/data/meta'
import { FLEET_VIEW_EVENT, OPEN_DRAWER_EVENT, type FleetViewDetail, type OpenDrawerDetail } from '../../client/data/config'
import { showSheet } from '../../client/ui/sheet'
import { channelGlyphSvg } from '../../client/icons'
import { makeEmpty } from '../../client/ui/empty'
import { logLine, logOn } from '../../client/log'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { Assistant, Home } from '../../client/data/home-model'
import type { FeatureCtx } from '../protocol'
import {
  avatarColor, buildMatrix, drillEventFor, footAllLine, footSomeLine, healthLabel, langOf, metaCrewLine, metaGridLine, metaBotsLine,
  rowCrewNote, statusText, strings, LOGO_TILE_BG, type Lang, type MatrixCell, type MatrixModel, type MatrixRow,
} from './data'
import { buildHomeMatrix } from './home-matrix'
import { disposeCellPop, hideCellPop, setCellPopRpc, showCellPop, warmCellPopImages } from './cell-pop'

function emitDrawer(key: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    const evt = drillEventFor(key)
    window.dispatchEvent(new window.CustomEvent<OpenDrawerDetail>(evt.name, { detail: evt.detail }))
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'fleet-radar', action: 'drill-dispatch-fail', ok: false, message: '钻取事件派发失败（不影响展示）：' + String((e as Error)?.message ?? e) })
  }
}

/** 跟随 DSH 系统语言（locale 插件把语言同步到 html lang；取不到按中文）。 */
function docLang(): Lang {
  try {
    if (typeof document === 'undefined') return 'zh'
    return langOf(document.documentElement?.lang)
  } catch {
    return 'zh'
  }
}

/** 渠道 LOGO 节点：品牌底圆角 + glyph（未知渠道回 null，调用方只剩文字）。
 * 单色 7 渠道经 CSS 洗白（data-ch 豁免 feishu/wecom 多色直显，见 styles.ts）。 */
function logoNode(channel: string): HTMLElement | null {
  try {
    const svg = channelGlyphSvg(channel, 12)
    if (!svg) return null
    return h('span', {
      className: 'fleet-radar-logo',
      dataset: { ch: channel },
      html: svg,
      style: { background: LOGO_TILE_BG[channel] ?? 'var(--dsw-alias-fill-secondary,rgba(127,127,127,.15))' },
    }) as HTMLElement
  } catch {
    return null
  }
}

function cellLabel(cell: MatrixCell, lang: Lang): string {
  if (cell.health === 'empty') return healthLabel('empty', lang)
  if (cell.health === 'orphan') return healthLabel('orphan', lang)
  return statusText(cell.health, cell.bound, lang)
}

/** 格 title：渠道＋助理名（多位顿号连）＋机器人 id＋状态；stale 时明确“数据过期”。
 * 空格不钻取 ⇒ title 不带钻取提示（只剩渠道＋未接入）。 */
function cellTitle(cell: MatrixCell, lang: Lang): string {
  const t = strings(lang)
  if (cell.health === 'empty') return cell.label + '：' + healthLabel('empty', lang)
  const who = cell.names.length ? cell.names.join('、') : cell.botId
  return cell.label + '，' + who + '，' + cellLabel(cell, lang) + (cell.stale ? t.staleNote : '') + '，' + t.drillHint
}

/** 格内文字：状态词＋（同格多助理时）人数注；失联格只留“失联”字样。 */
function cellTextNodes(cell: MatrixCell, lang: Lang): (string | HTMLElement)[] {
  if (cell.health === 'empty') return ['—']
  if (cell.health === 'orphan') return [healthLabel('orphan', lang)]
  const nodes: (string | HTMLElement)[] = [healthLabel(cell.health, lang)]
  if (cell.count > 1) nodes.push(h('span', { className: 'fleet-radar-note' }, lang === 'en' ? ` (${cell.count})` : `（${cell.count}位）`) as HTMLElement)
  return nodes
}

/** 格子只留圆点 + 文字：列身份由表头 LOGO 一次性建立，格内重复即噪音（第一性原理：零信息熵不配占像素）。
 * 有明细的格悬浮出助理清单（cell-pop）；无明细才走原生 title（免双层提示）。
 * 空格（渠道无机器人）是纯展示 span：不可点、不钻取（点进去的详情抽屉没有主体可讲）。 */
function renderCell(row: MatrixRow, cell: MatrixCell, lang: Lang): HTMLElement {
  const cls = 'fleet-radar-cell' + (cell.health === 'empty' ? ' ghost' : (cell.health === 'orphan' || !cell.bound) ? ' unbound' : '')
  if (cell.health === 'empty') {
    return h('span', { className: cls, title: cellTitle(cell, lang) },
      h('span', { className: 'fleet-radar-dot ' + cell.health }), ...cellTextNodes(cell, lang)) as HTMLElement
  }
  const btn = h('button', {
    type: 'button',
    className: cls,
    ...(cell.mates.length ? {} : { title: cellTitle(cell, lang) }),
    onClick: () => emitDrawer(row.drillKey || row.key),
  }, h('span', { className: 'fleet-radar-dot ' + cell.health }), ...cellTextNodes(cell, lang)) as HTMLElement
  if (cell.mates.length) {
    btn.addEventListener('mouseenter', () => showCellPop(btn, cell, lang))
    btn.addEventListener('mouseleave', () => hideCellPop())
  }
  return btn
}

function renderHomeHead(row: MatrixRow, lang: Lang): HTMLElement {
  const av = h('span', { className: 'fleet-radar-av', style: { background: avatarColor(row.key) } }, row.name.charAt(0).toUpperCase()) as HTMLElement
  return h('button', {
    type: 'button',
    className: 'fleet-radar-rowbtn',
    title: row.name + '，' + strings(lang).drillHint,
    onClick: () => emitDrawer(row.drillKey || row.key),
  }, h('span', { className: 'fleet-radar-agent' }, av,
    h('span', null, h('div', { className: 'fleet-radar-nm' }, row.name), h('div', { className: 'fleet-radar-bs' }, row.base || row.workspace || row.key)))) as unknown as HTMLElement
}

/** 行汇总：整行状态＝健康词（在线/待确认/离线）＋助理构成（rowCrewNote）。
 * 空家（0 助理）按未接入；全员待绑（无绑定无失联）按待确认黄点＋“待绑”。 */
function rowSummary(row: MatrixRow, lang: Lang): { dot: string; health: string; note: string } {
  if (row.assistantCount === 0) return { dot: 'empty', health: healthLabel('empty', lang), note: '' }
  if (row.boundCount + row.orphanCount === 0) {
    return { dot: 'warn', health: lang === 'en' ? 'Pending' : '待绑', note: rowCrewNote(row, lang) }
  }
  return { dot: row.status, health: healthLabel(row.status, lang), note: rowCrewNote(row, lang) }
}

function renderTable(model: MatrixModel, lang: Lang): HTMLElement {
  const t = strings(lang)
  const head: HTMLElement[] = [h('th', { style: { textAlign: 'left' } }, t.agentCol) as HTMLElement]
  for (const c of model.cols) {
    const logo = logoNode(c.id)
    head.push(h('th', null, ...(logo ? [logo, c.label] : [c.label])) as HTMLElement)
  }
  head.push(h('th', null, t.summaryCol) as HTMLElement)
  const body = model.rows.map((row) => {
    const tds: HTMLElement[] = [h('th', null, renderHomeHead(row, lang)) as HTMLElement]
    for (const cell of row.cells) tds.push(h('td', null, renderCell(row, cell, lang)) as HTMLElement)
    const agg = rowSummary(row, lang)
    tds.push(h('td', null, h('span', { className: 'fleet-radar-agg' },
      h('span', { className: 'fleet-radar-dot ' + agg.dot }),
      agg.health,
      agg.note ? h('span', { className: 'fleet-radar-note' }, agg.note) : null)) as HTMLElement)
    return h('tr', null, ...tds)
  })
  return h('div', { className: 'fleet-radar-scroll' },
    h('table', { className: 'fleet-radar-table' }, h('thead', null, h('tr', null, ...head)), h('tbody', null, ...body))) as HTMLElement
}

export interface RadarCallbacks {
  onRefresh(): void
  onClose(): void
}

function renderInto(root: HTMLElement, model: MatrixModel, updatedAt: number, lang: Lang, cbs: RadarCallbacks): void {
  const t = strings(lang)
  const hd = h('div', { className: 'fleet-radar-hd' },
    h('h2', { className: 'fleet-radar-title' }, t.title),
    h('span', { className: 'fleet-radar-meta' },
      metaGridLine(model.counts.agents, model.counts.channels, lang),
      model.counts.assistants !== undefined ? metaCrewLine(model.counts.assistants, model.counts.bots, lang) : metaBotsLine(model.counts.bots, lang)),
    h('span', { className: 'fleet-radar-sp' }),
    h('button', { type: 'button', className: 'fleet-radar-refresh', title: t.refresh, onClick: cbs.onRefresh }, t.refresh),
    h('button', { type: 'button', className: 'fleet-radar-close', title: t.close, onClick: cbs.onClose }, '× ' + t.close)) as HTMLElement
  if (updatedAt === 0 && model.rows.length === 0) {
    mount(root, [hd, h('div', { className: 'fleet-radar-loading' }, t.loading)])
    return
  }
  if (model.rows.length === 0) {
    mount(root, [hd, makeEmpty({ iconName: 'person', title: t.emptyTitle, sub: t.emptySub }) as unknown as HTMLElement])
    return
  }
  const names = model.emptyColumns.map((id) => model.cols.find((c) => c.id === id)?.label ?? id)
  const foot = model.emptyColumns.length ? footSomeLine(names, lang) : footAllLine(model.counts.channels, lang)
  mount(root, [hd, renderTable(model, lang), h('div', { className: 'fleet-radar-foot' }, foot)])
}

/** 雷达挂载（命令式：订阅 + paint + 退订清 DOM；弹窗/行内两种容器通用）。 */
export function mountRadarView(fctx: FeatureCtx, root: HTMLElement, opts: { onClose(): void }): () => void {
  let dead = false
  let meta: AgentMetaDoc = EMPTY_META
  let bots: BotSnap[] = []
  let homes: Home[] = []
  let assistants: Assistant[] = []
  let updatedAt = 0
  const paint = (): void => {
    if (dead) return
    /* 表格重画换掉格子：旧悬停随旧格作废，悬浮盒先收（否则 mouseleave 永不到、盒子滞留）。 */
    hideCellPop()
    const lang = docLang()
    try {
      /* 有家表走家矩阵（行＝家）；家表未到（老宿主/桥失败）回落旧 Agent 矩阵，不白屏。 */
      const model = homes.length || assistants.length ? buildHomeMatrix(bots, homes, assistants, lang) : buildMatrix(bots, meta, lang)
      renderInto(root, model, updatedAt, lang, {
        onRefresh: () => { void fctx.refresh().catch(() => {}); void loadHomes() },
        onClose: () => opts.onClose(),
      })
      /* 首悬即见真图：随表预热全格有图助理（同缓存同端点；全命中零请求；通道挂载级已就绪）。 */
      try {
        const all: MatrixCell[] = []
        for (const r of model.rows) for (const c of r.cells) all.push(c)
        warmCellPopImages(all)
      } catch { /* 预热失败只影响首悬速度 */ }
    } catch (e) {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'fleet-radar', action: 'paint-fail', ok: false, message: '渲染失败保留旧帧：' + String((e as Error)?.message ?? e) })
    }
  }
  /** 家表一次拉取（失败回空、paint 回落旧矩阵；不抛）。 */
  const loadHomes = async (): Promise<void> => {
    try {
      if (!fctx.rpc) return
      const raw = await fctx.rpc('/im-companion', 'home.list', {}, AbortSignal.timeout(8000)) as
        { ok?: boolean; value?: { homes?: Home[]; assistants?: Assistant[] } } | null
      const v = raw?.ok === true ? raw.value : null
      homes = Array.isArray(v?.homes) ? v.homes as Home[] : []
      assistants = Array.isArray(v?.assistants) ? v.assistants as Assistant[] : []
      paint()
    } catch { /* 回落旧矩阵，paint 已在订阅/meta 路径触发 */ }
  }
  /* 系统语言切换即时跟随：locale 插件改 html lang 属性即重绘；无监听环境靠下次 paint 跟随。 */
  let langMo: MutationObserver | null = null
  try {
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
      langMo = new MutationObserver(() => paint())
      langMo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    }
  } catch {
    /* ignore */
  }
  let unsub: (() => void) | null = null
  try {
    unsub = fctx.subscribe((snap) => {
      bots = snap?.bots ?? []
      updatedAt = snap?.updatedAt ?? 0
      paint()
    })
  } catch (e) {
    logLine('error', 'feature.mount.fail', { feature: 'fleet-radar', message: '弹窗内订阅 stream 失败（停在加载态）：' + String((e as Error)?.message ?? e) })
  }
  try {
    void fctx.meta.loadMeta().then((m) => {
      if (m) meta = m
      paint()
    }).catch((e) => { logLine('warn', 'bridge.call.fail', { method: 'meta.get', message: '雷达读身份配置失败（按空表展示）：' + String((e as Error)?.message ?? e) }); paint() })
  } catch (e) {
    logLine('warn', 'bridge.call.fail', { method: 'meta.get', message: '雷达读身份配置不可用（按空表展示）：' + String((e as Error)?.message ?? e) })
  }
  void loadHomes()
  /* 悬浮取图通道：与面板同桥（只读 avatar.get；transport 是挂载级，断在 dispose）。 */
  setCellPopRpc(() => fctx.rpc)
  return () => {
    dead = true
    disposeCellPop()
    try { unsub?.() } catch { /* ignore */ }
    try { langMo?.disconnect() } catch { /* ignore */ }
  }
}

let currentClose: (() => void) | null = null

/** 开雷达弹窗（宽版居中，一次放下 9 列；重复点击先关旧窗）。 */
export function openRadar(fctx: FeatureCtx): void {
  logLine('debug', 'ui.action', { area: 'fleet-radar', action: 'open', ok: true, message: '打开舰队雷达弹窗' })
  try {
    try { currentClose?.() } catch { /* ignore */ }
    currentClose = null
    if (typeof document === 'undefined') return
    const sheet = showSheet({ overlayClass: 'fleet-radar-overlay', panelClass: 'fleet-radar-modal', label: '舰队雷达' })
    if (!sheet) { logLine('error', 'ui.render.fail', { area: 'fleet-radar', message: '雷达弹窗未建出（showSheet 返回空）' }); return }
    const dispose = mountRadarView(fctx, sheet.panel, { onClose: () => sheet.close() })
    currentClose = () => {
      try { dispose() } catch { /* ignore */ }
      try { sheet.close() } catch { /* ignore */ }
    }
  } catch (e) {
    logLine('error', 'ui.render.fail', { area: 'fleet-radar', message: '开雷达弹窗失败（列表不受影响）：' + String((e as Error)?.message ?? e) })
  }
}

/** 特性挂载：只监听开窗事件（DetailDrawer 抽屉同款）；弹窗/DOM/订阅全由 openRadar 持有并清理。 */
export function mountRadar(fctx: FeatureCtx): () => void {
  const onEvent = (e: Event): void => {
    try {
      const detail = (e as CustomEvent)?.detail as Partial<FleetViewDetail> | undefined
      if (detail?.view === 'radar') openRadar(fctx)
    } catch {
      /* ignore */
    }
  }
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined
    window.addEventListener(FLEET_VIEW_EVENT, onEvent as EventListener)
  } catch (e) { logLine('error', 'feature.mount.fail', { feature: 'fleet-radar', message: '开窗事件监听注册失败：' + String((e as Error)?.message ?? e) }); return () => undefined }
  return () => {
    try { window.removeEventListener(FLEET_VIEW_EVENT, onEvent as EventListener) } catch { /* ignore */ }
  }
}
