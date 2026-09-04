/** FleetPanel 视图层：面板状态 → body DOM（加载/错误/空态/分区头/两态列表）。
 * 渲染唯一入口 render()；数据层与动作层都不直接触碰 DOM。
 * #17 数据层收敛的视图侧：失败渠道 tooltip 透出“（轮询失败）”（高亮监听已删：open-agent 无生产者，见 Decisions）。 */
import { h, mount, type ChildNode } from '../dom'
import { buildModel, type AgentView, type FleetModel } from '../data/model'
import { makeEmpty } from '../ui/empty'
import { makeErrorRow, makeGroupedList, makeLoadingRow, makeSkeletonRows } from '../ui/list'
import type { SegHandle } from '../ui/segmented'
import { makeAgentRow, type RowCallbacks } from './agent-row'
import { firstViewCopy, firstViewLang } from './first-view-copy'
import type { PanelState } from './panel-data'

export interface PanelBodyDeps {
  state: PanelState
  bodyEl: HTMLElement
  titleMetaEl: HTMLElement
  seg: SegHandle
  relayout(): void
  rowCallbacks(): RowCallbacks
  onRetry(): void
}

export interface PanelBody {
  render(): void
}

export function createPanelBody(deps: PanelBodyDeps): PanelBody {
  /* D 标题收起：计数进分段后缀，更新时间进分段悬停；标题 meta 行隐藏（空态三态文案本票不动）。 */
  function renderMeta(model: FleetModel): void {
    const copy = firstViewCopy()
    deps.titleMetaEl.hidden = true
    deps.seg.setLabel('agent', copy.byAgent(model.counts.agents))
    deps.seg.setLabel('channel', copy.byChannel(model.counts.channels))
    deps.seg.el.title = copy.updatedTip(deps.state.updatedAt)
  }

  /** 失败渠道的状态 tooltip 追加“（轮询失败）”（stale 本体由 stream 标 warn，见 bindings 语义）。 */
  function markFailed(row: HTMLElement, v: AgentView): void {
    const failed = deps.state.failed ?? []
    if (!failed.length || !v.bots.some((b) => failed.includes(b.channel))) return
    try {
      const st = row.querySelector('.af-status')
      if (st) {
        const cur = st.getAttribute('title') ?? ''
        if (!cur.includes('轮询失败')) st.setAttribute('title', cur + '（轮询失败）')
      }
    } catch {
      /* tooltip 失败忽略（行主体不受影响） */
    }
  }

  function rowsFor(model: FleetModel): ChildNode[] {
    if (deps.state.mode === 'channel') {
      const out: ChildNode[] = []
      for (const g of model.channelGroups) {
        out.push(h('div', { className: 'af-section' },
          g.label,
          h('span', { className: 'af-section-count' }, g.count + (firstViewLang() === 'en' ? ' assistants' : ' 个助理')),
        ))
        out.push(makeGroupedList(...g.views.map((v) => {
          const row = makeAgentRow(v, deps.rowCallbacks(), 'channel')
          markFailed(row, v)
          return row
        })))
      }
      return out
    }
    return model.agents.map((v) => {
      const row = makeAgentRow(v, deps.rowCallbacks(), 'agent')
      markFailed(row, v)
      return row
    })
  }

  /* #27 三态说人话（结构不动，只换文案；错误保留 raw 诊断串供排查）。 */
  function render(): void {
    const s = deps.state
    const st = firstViewCopy().states
    if (s.loading) {
      mount(deps.bodyEl, makeGroupedList(...makeSkeletonRows(3), makeLoadingRow(st.loading)))
      deps.relayout()
      return
    }
    if (s.error) {
      mount(deps.bodyEl, makeErrorRow(st.errorMsg + (s.error ? '（' + s.error + '）' : ''), deps.onRetry, st.retry))
      deps.relayout()
      return
    }
    const model = buildModel(s.bots, s.meta, s.mode, s.query)
    renderMeta(model)
    const rows = rowsFor(model)
    if (!rows.length) {
      mount(deps.bodyEl, s.query
        ? makeEmpty({ iconName: 'search', title: st.emptySearchTitle, sub: st.emptySearchSub })
        : makeEmpty({ iconName: 'person', title: st.emptyNoneTitle, sub: st.emptyNoneSub }))
      deps.relayout()
      return
    }
    mount(deps.bodyEl, s.mode === 'channel' ? rows : makeGroupedList(...rows))
    deps.relayout()
  }

  return { render }
}
