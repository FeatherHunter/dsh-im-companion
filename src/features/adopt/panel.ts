/** adopt 驾驶舱：拍立得墙（胶带门牌 + 成员照片 + 健康灯）+ 巷子口公共区（一区两徽章：歇脚中/新来的）。
 * 纯展示装配；写操作由 view 的文档级拖放接管（家卡即 data-adopt-ws 目标）。 */
import { channelLabel } from '../../client/data/config'
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { FeatureCtx } from '../protocol'
import { boardGroups, homeList, homePlate, shortName, sloganFor, type HomePlate } from './model'
import type { WorkspaceItem } from '../../client/data/header-overlay'

export interface BoardHandle {
  repaint(bots: BotSnap[], staged: Map<string, string>): void
  close(): void
}

const SEC_CLASS = 'adopt-sec'
const ROW_CLASS = 'adopt-row'

function botLabel(b: BotSnap): string {
  return b.botName || b.botId
}

function healthClass(b: BotSnap): string {
  const k = b.stale ? 'warn' : b.healthKind
  return k === 'online' ? 'adopt-h-online' : k === 'warn' ? 'adopt-h-warn' : 'adopt-h-off'
}

/** 宿主工作区全名单（含无人之家；SessionHeader 同款 ctx.get('workspaces')，取不到按无名单处理）。 */
export function listHomes(ctx: FeatureCtx): string[] {
  try {
    const get = ctx.get
    if (typeof get !== 'function') return []
    const svc = get('workspaces') as { list?: { getSnapshot?: () => { items?: WorkspaceItem[] } } } | null
    const items = svc?.list?.getSnapshot?.()?.items
    if (!Array.isArray(items)) return []
    const out: string[] = []
    for (const it of items) { const p = (it as WorkspaceItem)?.path; if (typeof p === 'string' && p && !out.includes(p)) out.push(p) }
    return out
  } catch { return [] }
}

export function openBoard(ctx: FeatureCtx, meta: AgentMetaDoc | null): BoardHandle {
  let overlay: HTMLElement | null = null
  let grid: HTMLElement | null = null
  try {
    overlay = h('div', { className: 'adopt-overlay' }) as HTMLElement
    const dialog = h('div', { className: 'adopt-cockpit', role: 'dialog', 'aria-modal': 'true', 'aria-label': '串门搬家' }) as HTMLElement
    const closeBtn = h('button', { className: 'adopt-x', title: '关闭', 'aria-label': '关闭', onClick: () => api.close() }, '×') as HTMLElement
    dialog.appendChild(h('h2', { className: 'adopt-panel-title' }, '串门 · 搬家') as unknown as Node)
    dialog.appendChild(h('p', { className: 'adopt-panel-sub' }, '把照片拖到另一家，搬家成功会二次确认。绿灯在岗，黄灯打盹，灰灯睡着了。') as unknown as Node)
    dialog.appendChild(closeBtn as unknown as Node)
    grid = h('div', { className: 'adopt-grid' }) as HTMLElement
    dialog.appendChild(grid as unknown as Node)
    overlay.appendChild(dialog as unknown as Node)
    overlay.addEventListener('mousedown', (e: Event) => { if (e.target === overlay) api.close() })
    document.body.appendChild(overlay)
  } catch {
    return { repaint() {}, close() {} }
  }
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') api.close() }
  try { document.addEventListener('keydown', onKey, true) } catch { /* 忽略 */ }

  const homeCard = (plate: HomePlate, ws: string | null, bots: BotSnap[], dashed: boolean, extra: Record<string, string>, hint = '', badgeOf: (b: BotSnap) => string = () => ''): HTMLElement => {
    const box = h('div', { className: SEC_CLASS + (dashed ? ' adopt-sec-unbound' : '') }) as HTMLElement
    if (ws) box.setAttribute('data-adopt-ws', ws)
    for (const k of Object.keys(extra)) box.setAttribute(k, extra[k])
    const head = h('div', { className: 'adopt-sec-name' }) as HTMLElement
    head.appendChild(h('span', { className: 'adopt-tape' }, plate.name) as unknown as Node)
    box.appendChild(head as unknown as Node)
    for (const b of bots) {
      const row = h('div', { className: ROW_CLASS }) as HTMLElement
      row.setAttribute('draggable', ctx.rpc ? 'true' : 'false')
      row.setAttribute('data-adopt-bot', b.botId)
      row.setAttribute('data-adopt-channel', b.channel)
      row.title = ctx.rpc ? '拖到另一个家完成换绑' : '连接服务不可用，暂不能分配'
      const top = h('div', { className: 'adopt-ph-top' }) as HTMLElement
      top.appendChild(h('span', { className: 'adopt-hdot ' + healthClass(b), title: b.stale ? '状态未知（打盹）' : b.healthKind === 'online' ? '在岗' : '睡着了' }) as unknown as Node)
      top.appendChild(h('span', { className: 'adopt-who' }, botLabel(b)) as unknown as Node)
      row.appendChild(top as unknown as Node)
      row.appendChild(h('span', { className: 'adopt-cap' }, channelLabel(b.channel) + ' · ' + (b.stale ? '状态未知' : b.healthKind === 'online' ? sloganFor(b.botId) : b.healthKind === 'warn' ? '偶尔打盹' : '睡着了')) as unknown as Node)
      const badge = badgeOf(b)
      if (badge) row.appendChild(h('span', { className: 'adopt-badge' }, badge) as unknown as Node)
      box.appendChild(row as unknown as Node)
    }
    if (hint) box.appendChild(h('div', { className: 'adopt-plus-hint' }, hint) as unknown as Node)
    return box
  }

  const repaint = (bots: BotSnap[], staged: Map<string, string>): void => {
    if (!grid) return
    try {
      const byId = new Map((bots || []).map((b) => [b.botId, b] as const))
      const resting = [...staged.keys()].map((id) => byId.get(id)).filter((b): b is BotSnap => !!b)
      const { unbound, groups } = boardGroups((bots || []).filter((b) => !staged.has(b.botId)))
      grid.replaceChildren()
      for (const g of groups) {
        const plate = homePlate(g.workspace, meta)
        grid.appendChild(homeCard(plate, g.workspace, g.bots, false, {}, ''))
      }
      /* 巷子口是分界线：有人之家在上，无人之家在下。 */
      grid.appendChild(homeCard(
        { name: '巷子口', sub: '', initial: '', color: 0 }, null, [...resting, ...unbound], true,
        { 'data-adopt-plaza': '1', class: 'adopt-sec adopt-sec-unbound adopt-sec-new' },
        '串门的路过歇一歇，新来的等安家——拖进一家才落实；关面板时没安顿好的，送回原来的家。',
        (b) => staged.has(b.botId) ? '歇脚中 · 出来自' + shortName(staged.get(b.botId) ?? '') : '新来的 · 等安家',
      ))
      const have = new Set(groups.map((g) => g.workspace))
      for (const w of homeList(bots || [], listHomes(ctx))) {
        if (have.has(w)) continue
        grid.appendChild(homeCard(homePlate(w, meta), w, [], false, { class: 'adopt-sec adopt-sec-empty' }, '空无一人，拖个人来安家'))
      }
    } catch { /* 渲染失败保持旧面板（fail-closed） */ }
  }

  const api: BoardHandle & { close(): void } = {
    repaint,
    close: () => {
      try { document.removeEventListener('keydown', onKey, true) } catch { /* 忽略 */ }
      try { overlay?.remove() } catch { /* 忽略 */ }
      overlay = null
      grid = null
    },
  }
  return api
}
