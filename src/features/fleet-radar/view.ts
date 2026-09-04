/** FleetRadar 舰队雷达（A 稠密表 verdict #10；DSH 正中大弹窗，一次完整展示、无横向滚动）。
 * 事件制（DetailDrawer 抽屉同款）：A1 船按钮经 FLEET_VIEW_EVENT 派发，本特性监听后居中弹模态；
 * 弹窗挂 body（宽版一次放下 9 列），Esc/点外部/关闭键三路可关；开弹窗才订阅、关即退订。
 * 数据：单份 stream 订阅 + meta 读取；无自有轮询；点格派发 OPEN_DRAWER_EVENT（DetailDrawer 真消费者）。
 * 双语：跟随 DSH 系统语言（documentElement.lang + 属性监听即时跟随，无开关）+ data.ts 字典。
 * LOGO：渠道 glyph（dsh-im 同款字符串，DetailDrawer 同渲染模式 html 注入）+ 文字，表头同；未知渠道只剩文字。 */
import { h, mount } from '../../client/dom'
import { EMPTY_META } from '../../client/data/meta'
import { FLEET_VIEW_EVENT, OPEN_DRAWER_EVENT, type FleetViewDetail, type OpenDrawerDetail } from '../../client/data/config'
import { showSheet } from '../../client/ui/sheet'
import { channelGlyphSvg } from '../../client/icons'
import { makeEmpty } from '../../client/ui/empty'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { FeatureCtx } from '../protocol'
import {
  buildMatrix, drillEventFor, footAllLine, footSomeLine, healthLabel, langOf, metaLine,
  statusText, strings, LOGO_TILE_BG, type Lang, type MatrixCell, type MatrixModel, type MatrixRow,
} from './data'

const AVATAR_COLORS = ['#3964fe', '#07c160', '#e8890c', '#8e44ad', '#12b7f5', '#d92d20', '#00b386', '#5865f2']

function avatarColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function emitDrawer(key: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    const evt = drillEventFor(key)
    window.dispatchEvent(new window.CustomEvent<OpenDrawerDetail>(evt.name, { detail: evt.detail }))
  } catch {
    /* 派发失败不影响展示 */
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
  return statusText(cell.health, cell.bound, lang)
}

function cellTitle(cell: MatrixCell, lang: Lang): string {
  const t = strings(lang)
  if (cell.health === 'empty') return cell.label + '：' + healthLabel('empty', lang) + '，' + t.drillHint
  return cell.label + ' ' + cell.botId + ' · ' + cellLabel(cell, lang) + (cell.stale ? t.staleNote : '') + '，' + t.drillHint
}

/** 格子只留圆点 + 文字：列身份由表头 LOGO 一次性建立，格内重复即噪音（第一性原理：零信息熵不配占像素）。 */
function renderCell(row: MatrixRow, cell: MatrixCell, lang: Lang): HTMLElement {
  const cls = 'fleet-radar-cell' + (cell.health === 'empty' ? ' ghost' : cell.bound ? '' : ' unbound')
  return h('button', {
    type: 'button',
    className: cls,
    title: cellTitle(cell, lang),
    onClick: () => emitDrawer(row.key),
  }, h('span', { className: 'fleet-radar-dot ' + cell.health }), cell.health === 'empty' ? '—' : cellLabel(cell, lang)) as HTMLElement
}

function renderAgentHead(row: MatrixRow, lang: Lang): HTMLElement {
  const av = h('span', { className: 'fleet-radar-av', style: { background: avatarColor(row.key) } }, row.name.charAt(0).toUpperCase()) as HTMLElement
  return h('button', {
    type: 'button',
    className: 'fleet-radar-rowbtn',
    title: row.name + '，' + strings(lang).drillHint,
    onClick: () => emitDrawer(row.key),
  }, h('span', { className: 'fleet-radar-agent' }, av,
    h('span', null, h('div', { className: 'fleet-radar-nm' }, row.name), h('div', { className: 'fleet-radar-bs' }, row.base || row.key)))) as unknown as HTMLElement
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
    const tds: HTMLElement[] = [h('th', null, renderAgentHead(row, lang)) as HTMLElement]
    for (const cell of row.cells) tds.push(h('td', null, renderCell(row, cell, lang)) as HTMLElement)
    const agg = row.botCount === 0 ? healthLabel('empty', lang) : statusText(row.status, row.bound, lang)
    tds.push(h('td', null, h('span', { className: 'fleet-radar-agg' },
      h('span', { className: 'fleet-radar-dot ' + (row.botCount === 0 ? 'empty' : row.status) }), agg)) as HTMLElement)
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
    h('span', { className: 'fleet-radar-meta' }, metaLine(model.counts.agents, model.counts.channels, model.counts.bots, lang)),
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
  let updatedAt = 0
  const paint = (): void => {
    if (dead) return
    const lang = docLang()
    try {
      renderInto(root, buildMatrix(bots, meta, lang), updatedAt, lang, {
        onRefresh: () => void fctx.refresh().catch(() => {}),
        onClose: () => opts.onClose(),
      })
    } catch {
      /* 渲染失败保留旧帧 */
    }
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
  } catch {
    /* 订阅失败则停在加载态 */
  }
  try {
    void fctx.meta.loadMeta().then((m) => {
      if (m) meta = m
      paint()
    }).catch(() => paint())
  } catch {
    /* meta 不可用按空表展示 */
  }
  return () => {
    dead = true
    try { unsub?.() } catch { /* ignore */ }
    try { langMo?.disconnect() } catch { /* ignore */ }
  }
}

let currentClose: (() => void) | null = null

/** 开雷达弹窗（宽版居中，一次放下 9 列；重复点击先关旧窗）。 */
export function openRadar(fctx: FeatureCtx): void {
  try {
    try { currentClose?.() } catch { /* ignore */ }
    currentClose = null
    if (typeof document === 'undefined') return
    const sheet = showSheet({ overlayClass: 'fleet-radar-overlay', panelClass: 'fleet-radar-modal', label: '舰队雷达' })
    if (!sheet) return
    const dispose = mountRadarView(fctx, sheet.panel, { onClose: () => sheet.close() })
    currentClose = () => {
      try { dispose() } catch { /* ignore */ }
      try { sheet.close() } catch { /* ignore */ }
    }
  } catch {
    /* 开窗失败静默（列表不受影响） */
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
  } catch {
    return () => undefined
  }
  return () => {
    try { window.removeEventListener(FLEET_VIEW_EVENT, onEvent as EventListener) } catch { /* ignore */ }
  }
}
