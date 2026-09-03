/** C1b 舰队雷达（A 稠密表 verdict #10；单入口：由装配层统一挂载，见 client/index）。
 * 归属：渲染归本特性，显隐归装配层（FLEET_VIEW_EVENT 事件制，C1a 抽屉同款）；A1 仅多一个船按钮。
 * 数据：单份 stream 订阅 + meta 读取；无自有轮询；点格派发 OPEN_DRAWER_EVENT（C1a 真消费者）。
 * 双语：header 中文/EN 开关 + data.ts 字典，全表切换；窄屏横滚 + 首列冻结；空态走共享原语。 */
import * as React from 'react'
import { h, mount } from '../../client/dom'
import { EMPTY_META } from '../../client/data/meta'
import { FLEET_VIEW_EVENT, OPEN_DRAWER_EVENT, type FleetViewDetail, type OpenDrawerDetail } from '../../client/data/config'
import { makeEmpty } from '../../client/ui/empty'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { FeatureCtx } from '../protocol'
import {
  buildMatrix, drillEventFor, footAllLine, footSomeLine, healthLabel, metaLine,
  statusText, strings, type Lang, type MatrixCell, type MatrixModel, type MatrixRow,
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

function emitView(view: FleetViewDetail['view']): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent<FleetViewDetail>(FLEET_VIEW_EVENT, { detail: { view } }))
  } catch {
    /* 派发失败不影响展示 */
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

function renderCell(row: MatrixRow, cell: MatrixCell, lang: Lang): HTMLElement {
  const cls = 'c1bm-cell' + (cell.health === 'empty' ? ' ghost' : cell.bound ? '' : ' unbound')
  return h('button', {
    type: 'button',
    className: cls,
    title: cellTitle(cell, lang),
    onClick: () => emitDrawer(row.key),
  }, h('span', { className: 'c1bm-dot ' + cell.health }), cell.health === 'empty' ? '—' : cellLabel(cell, lang)) as HTMLElement
}

function renderAgentHead(row: MatrixRow, lang: Lang): HTMLElement {
  const av = h('span', { className: 'c1bm-av', style: { background: avatarColor(row.key) } }, row.name.charAt(0).toUpperCase()) as HTMLElement
  return h('button', {
    type: 'button',
    className: 'c1bm-rowbtn',
    title: row.name + '，' + strings(lang).drillHint,
    onClick: () => emitDrawer(row.key),
  }, h('span', { className: 'c1bm-agent' }, av,
    h('span', null, h('div', { className: 'c1bm-nm' }, row.name), h('div', { className: 'c1bm-bs' }, row.base || row.key)))) as unknown as HTMLElement
}

function renderTable(model: MatrixModel, lang: Lang): HTMLElement {
  const t = strings(lang)
  const head: HTMLElement[] = [h('th', { style: { textAlign: 'left' } }, t.agentCol) as HTMLElement]
  for (const c of model.cols) head.push(h('th', null, c.label) as HTMLElement)
  head.push(h('th', null, t.summaryCol) as HTMLElement)
  const body = model.rows.map((row) => {
    const tds: HTMLElement[] = [h('th', null, renderAgentHead(row, lang)) as HTMLElement]
    for (const cell of row.cells) tds.push(h('td', null, renderCell(row, cell, lang)) as HTMLElement)
    const agg = row.botCount === 0 ? healthLabel('empty', lang) : statusText(row.status, row.bound, lang)
    tds.push(h('td', null, h('span', { className: 'c1bm-agg' },
      h('span', { className: 'c1bm-dot ' + (row.botCount === 0 ? 'empty' : row.status) }), agg)) as HTMLElement)
    return h('tr', null, ...tds)
  })
  return h('div', { className: 'c1bm-scroll' },
    h('table', { className: 'c1bm-table' }, h('thead', null, h('tr', null, ...head)), h('tbody', null, ...body))) as HTMLElement
}

export interface RadarCallbacks {
  onRefresh(): void
  onBack(): void
  onLang(next: Lang): void
}

function renderInto(root: HTMLElement, model: MatrixModel, updatedAt: number, lang: Lang, cbs: RadarCallbacks): void {
  const t = strings(lang)
  const langBtn = (id: Lang, text: string): HTMLElement =>
    h('button', {
      type: 'button', className: 'c1bm-lang' + (lang === id ? ' on' : ''),
      onClick: () => cbs.onLang(id),
    }, text) as HTMLElement
  const hd = h('div', { className: 'c1bm-hd' },
    h('button', { type: 'button', className: 'c1bm-back', title: t.back, onClick: cbs.onBack }, t.back),
    h('h2', { className: 'c1bm-title' }, t.title),
    h('span', { className: 'c1bm-meta' }, metaLine(model.counts.agents, model.counts.channels, model.counts.bots, lang)),
    h('span', { className: 'c1bm-sp' }),
    langBtn('zh', '中文'), langBtn('en', 'EN'),
    h('button', { type: 'button', className: 'c1bm-refresh', title: t.refresh, onClick: cbs.onRefresh }, t.refresh)) as HTMLElement
  if (updatedAt === 0 && model.rows.length === 0) {
    mount(root, [hd, h('div', { className: 'c1bm-loading' }, t.loading)])
    return
  }
  if (model.rows.length === 0) {
    mount(root, [hd, makeEmpty({ iconName: 'person', title: t.emptyTitle, sub: t.emptySub }) as unknown as HTMLElement])
    return
  }
  const names = model.emptyColumns.map((id) => model.cols.find((c) => c.id === id)?.label ?? id)
  const foot = model.emptyColumns.length ? footSomeLine(names, lang) : footAllLine(model.counts.channels, lang)
  mount(root, [hd, renderTable(model, lang), h('div', { className: 'c1bm-foot' }, foot)])
}

/** 雷达节（装配层挂载：显隐由 hidden 控制，订阅常活；卸载时退订清 DOM）。 */
export function MatrixSection(props: { fctx: FeatureCtx; hidden: boolean }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const fctx = props.fctx
  const [lang, setLang] = React.useState<Lang>('zh')
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let dead = false
    let meta: AgentMetaDoc = EMPTY_META
    let bots: BotSnap[] = []
    let updatedAt = 0
    const paint = (): void => {
      if (dead || !ref.current) return
      try {
        renderInto(ref.current, buildMatrix(bots, meta, langRef.current), updatedAt, langRef.current, {
          onRefresh: () => void fctx.refresh().catch(() => {}),
          onBack: () => emitView('list'),
          onLang: (next) => setLang(next),
        })
      } catch {
        /* 渲染失败保留旧帧 */
      }
    }
    const langRef = { current: lang }
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
      try { el.replaceChildren() } catch { /* ignore */ }
    }
  }, [fctx, lang])
  return React.createElement('div', { ref, className: 'c1bm-root', hidden: props.hidden })
}
