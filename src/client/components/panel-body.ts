/** FleetPanel 视图层：面板状态 → body DOM（加载/错误/空态/分区头/两态列表）。
 * 渲染唯一入口 render()；数据层与动作层都不直接触碰 DOM。
 * #17 两件套之一：监听 open-agent → 定位 Agent 行滚动高亮；失败渠道 tooltip 透出“（轮询失败）”。 */
import { h, mount, type ChildNode } from '../dom'
import { buildModel, type AgentView, type FleetModel } from '../data/model'
import { OPEN_AGENT_EVENT } from '../data/bindings'
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
  dispose(): void
}

export interface OpenAgentDetail {
  workspace?: unknown
  agent?: unknown
}

const norm = (s: unknown): string => String(s ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

function matchView(v: AgentView, ws: string, agent: string): boolean {
  if (ws && (norm(v.workspace) === ws || norm(v.key) === ws)) return true
  if (agent && (norm(v.name) === agent || norm(v.base) === agent)) return true
  return false
}

function flash(row: HTMLElement): void {
  try {
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  } catch {
    try {
      row.scrollIntoView()
    } catch {
      /* 滚动失败只高亮 */
    }
  }
  try {
    const prev = row.style.boxShadow
    row.style.transition = 'box-shadow .3s'
    row.style.boxShadow = '0 0 0 3px var(--af-accent, #0a84ff)'
    setTimeout(() => {
      try {
        row.style.boxShadow = prev
      } catch {
        /* 恢复失败忽略 */
      }
    }, 1600)
  } catch {
    /* 高亮失败忽略 */
  }
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

  function tagRow(row: HTMLElement, v: AgentView): void {
    try {
      row.setAttribute('data-agent-key', v.key)
      if (v.workspace) row.setAttribute('data-workspace', v.workspace)
      if (v.name) row.setAttribute('data-agent', v.name)
    } catch {
      /* 标记失败不影响渲染 */
    }
    const failed = deps.state.failed ?? []
    if (failed.length && v.bots.some((b) => failed.includes(b.channel))) {
      try {
        const st = row.querySelector('.af-status')
        if (st) {
          const cur = st.getAttribute('title') ?? ''
          if (!cur.includes('轮询失败')) st.setAttribute('title', cur + '（轮询失败）')
        }
      } catch {
        /* tooltip 失败忽略 */
      }
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
          tagRow(row, v)
          return row
        })))
      }
      return out
    }
    return model.agents.map((v) => {
      const row = makeAgentRow(v, deps.rowCallbacks(), 'agent')
      tagRow(row, v)
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

  function onOpenAgent(e: Event): void {
    try {
      const el = deps.bodyEl
      if (!el || (el as unknown as { isConnected?: unknown }).isConnected === false) return
      const d = (e as CustomEvent)?.detail as OpenAgentDetail | undefined
      const ws = norm(d?.workspace)
      const agent = norm(d?.agent)
      if (!ws && !agent) return
      const model = buildModel(deps.state.bots, deps.state.meta, deps.state.mode, deps.state.query)
      const views = deps.state.mode === 'channel' ? model.channelGroups.flatMap((g) => g.views) : model.agents
      const keys = new Set(views.filter((v) => matchView(v, ws, agent)).map((v) => v.key))
      if (!keys.size) return
      const rows = el.querySelectorAll('[data-agent-key]')
      for (const row of Array.from(rows)) {
        try {
          const k = (row as HTMLElement).getAttribute?.('data-agent-key') ?? ''
          if (k && keys.has(k)) {
            flash(row as HTMLElement)
            return
          }
        } catch {
          /* 单行失败继续找 */
        }
      }
    } catch {
      /* 监听失败不影响面板 */
    }
  }

  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(OPEN_AGENT_EVENT, onOpenAgent as EventListener)
    }
  } catch {
    /* 监听挂载失败不影响渲染 */
  }

  return {
    render,
    dispose: () => {
      try {
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
          window.removeEventListener(OPEN_AGENT_EVENT, onOpenAgent as EventListener)
        }
      } catch {
        /* 清理失败忽略 */
      }
    },
  }
}
