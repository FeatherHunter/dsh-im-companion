/** C1b 矩阵视图（A 稠密表 verdict #10）：自注册 settings.section（order 23）+ 命令式稠密表。
 * 归属：特性自注册独立 section（零 A1 触碰，解耦优先于同 panel；健康/绑定语义与 A1 同源 buildModel）。
 * 数据：单份 stream 订阅 + meta 读取；无自有轮询；点格派发 OPEN_DRAWER_EVENT（C1a 真消费者）。
 * 窄屏：横滚 + 首列冻结（thead sticky）；空态：makeEmpty 共享原语。 */
import * as React from 'react'
import { h, mount } from '../../client/dom'
import { EMPTY_META } from '../../client/data/meta'
import { OPEN_DRAWER_EVENT, type OpenDrawerDetail } from '../../client/data/config'
import { makeEmpty } from '../../client/ui/empty'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { FeatureCtx } from '../protocol'
import { buildMatrix, drillEventFor, statusText, type MatrixCell, type MatrixModel, type MatrixRow } from './data'

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

function cellLabel(cell: MatrixCell): string {
  if (cell.health === 'empty') return '未接入'
  return statusText(cell.health, cell.bound)
}

function cellTitle(cell: MatrixCell): string {
  if (cell.health === 'empty') return cell.label + '：未接入，点击可添加接入'
  return cell.label + ' ' + cell.botId + ' · ' + cellLabel(cell) + (cell.stale ? '（数据过期）' : '') + '，点击钻取详情'
}

function renderCell(row: MatrixRow, cell: MatrixCell): HTMLElement {
  if (cell.health === 'empty') {
    return h('button', {
      type: 'button',
      className: 'c1bm-cell ghost',
      title: cellTitle(cell),
      onClick: () => emitDrawer(row.key),
    }, h('span', { className: 'c1bm-dot empty' }), '—') as HTMLElement
  }
  return h('button', {
    type: 'button',
    className: 'c1bm-cell' + (cell.bound ? '' : ' unbound'),
    title: cellTitle(cell),
    onClick: () => emitDrawer(row.key),
  }, h('span', { className: 'c1bm-dot ' + cell.health }), cellLabel(cell)) as HTMLElement
}

function renderAgentHead(row: MatrixRow): HTMLElement {
  const av = h('span', { className: 'c1bm-av', style: { background: avatarColor(row.key) } }, row.name.charAt(0).toUpperCase()) as HTMLElement
  return h('button', {
    type: 'button',
    className: 'c1bm-rowbtn',
    title: row.name + '，点击钻取详情',
    onClick: () => emitDrawer(row.key),
  }, h('span', { className: 'c1bm-agent' }, av,
    h('span', null, h('div', { className: 'c1bm-nm' }, row.name), h('div', { className: 'c1bm-bs' }, row.base || row.key)))) as unknown as HTMLElement
}

function renderTable(model: MatrixModel): HTMLElement {
  const head: HTMLElement[] = [h('th', { style: { textAlign: 'left' } }, 'Agent ＼ 渠道') as HTMLElement]
  for (const c of model.cols) head.push(h('th', null, c.label) as HTMLElement)
  head.push(h('th', null, '汇总') as HTMLElement)
  const body = model.rows.map((row) => {
    const tds: HTMLElement[] = [h('th', null, renderAgentHead(row)) as HTMLElement]
    for (const cell of row.cells) tds.push(h('td', null, renderCell(row, cell)) as HTMLElement)
    const agg = row.botCount === 0 ? '未接入' : statusText(row.status, row.bound)
    tds.push(h('td', null, h('span', { className: 'c1bm-agg' },
      h('span', { className: 'c1bm-dot ' + (row.botCount === 0 ? 'empty' : row.status) }), agg)) as HTMLElement)
    return h('tr', null, ...tds)
  })
  return h('div', { className: 'c1bm-scroll' },
    h('table', { className: 'c1bm-table' }, h('thead', null, h('tr', null, ...head)), h('tbody', null, ...body))) as HTMLElement
}

function renderInto(root: HTMLElement, model: MatrixModel, updatedAt: number, onRefresh: () => void): void {
  const hd = h('div', { className: 'c1bm-hd' },
    h('h2', { className: 'c1bm-title' }, 'Fleet 矩阵总览'),
    h('span', { className: 'c1bm-meta' }, model.counts.agents + ' 个 Agent × ' + model.counts.channels + ' 渠道 · ' + model.counts.bots + ' 个机器人'),
    h('span', { className: 'c1bm-sp' }),
    h('button', { type: 'button', className: 'c1bm-refresh', title: '立即刷新单份轮询', onClick: onRefresh }, '刷新')) as HTMLElement
  if (updatedAt === 0 && model.rows.length === 0) {
    mount(root, [hd, h('div', { className: 'c1bm-loading' }, '矩阵加载中…')])
    return
  }
  if (model.rows.length === 0) {
    mount(root, [hd, makeEmpty({ iconName: 'person', title: '还没有 Agent', sub: '新建 Agent 并接入任意渠道后，这里会出现矩阵' }) as unknown as HTMLElement])
    return
  }
  const foot = model.emptyColumns.length
    ? model.emptyColumns.join('、') + ' 暂无接入'
    : model.counts.channels + ' 渠道均有接入'
  mount(root, [hd, renderTable(model), h('div', { className: 'c1bm-foot' }, foot)])
}

function MatrixSection(props: { fctx: FeatureCtx }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const fctx = props.fctx
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
        renderInto(ref.current, buildMatrix(bots, meta), updatedAt, () => void fctx.refresh().catch(() => {}))
      } catch {
        /* 渲染失败保留旧帧 */
      }
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
      try { el.replaceChildren() } catch { /* ignore */ }
    }
  }, [fctx])
  return React.createElement('div', { ref, className: 'c1bm-root' })
}

/** 挂载：自注册独立 settings.section（order 23，紧随 IM机器人辅助 22）。
 * 注册与 B3/A1 同 API；注册项随宿主会话存活（同 B3/A1 先例不注销），
 * 订阅/DOM 由 React effect 清理，卸载即净。 */
export function mountMatrix(fctx: FeatureCtx): () => void {
  try {
    const slots = fctx.slots as unknown as {
      inject(name: string, fn: () => unknown): unknown
      register(info: Record<string, unknown>, comp: unknown): unknown
    }
    slots.inject('settings.section', () => slots.register({
      name: 'settings.section',
      id: 'dsh-im-companion:c1b-matrix',
      order: 23,
      label: () => 'Fleet 矩阵总览',
      inject: () => ({}),
    }, () => React.createElement(MatrixSection, { fctx })))
  } catch {
    /* 老宿主无该槽位就跳过（A1 面板不受影响） */
  }
  return () => {}
}
