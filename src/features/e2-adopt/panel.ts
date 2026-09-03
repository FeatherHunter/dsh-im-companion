/** e2-adopt 驾驶舱：拍立得墙（胶带门牌 + 成员照片 + 健康灯）+ “＋ 安新家”兜底空人。
 * 纯展示装配；写操作由 view 的文档级拖放接管（家卡即 data-e2-ws 目标）。 */
import { channelLabel } from '../../client/data/config'
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'
import type { FeatureCtx } from '../protocol'
import { boardGroups, homePlate, type HomePlate } from './model'

export interface BoardHandle {
  repaint(bots: BotSnap[]): void
  close(): void
}

const SEC_CLASS = 'e2-sec'
const ROW_CLASS = 'e2-row'

function botLabel(b: BotSnap): string {
  return b.botName || b.botId
}

function healthClass(b: BotSnap): string {
  const k = b.stale ? 'warn' : b.healthKind
  return k === 'online' ? 'e2-h-online' : k === 'warn' ? 'e2-h-warn' : 'e2-h-off'
}

export function openBoard(ctx: FeatureCtx, meta: AgentMetaDoc | null): BoardHandle {
  let overlay: HTMLElement | null = null
  let grid: HTMLElement | null = null
  try {
    overlay = h('div', { className: 'e2-overlay' }) as HTMLElement
    const dialog = h('div', { className: 'e2-cockpit', role: 'dialog', 'aria-modal': 'true', 'aria-label': '串门搬家' }) as HTMLElement
    const closeBtn = h('button', { className: 'e2-x', title: '关闭', 'aria-label': '关闭', onClick: () => api.close() }, '×') as HTMLElement
    dialog.appendChild(h('h2', { className: 'e2-panel-title' }, '串门 · 搬家') as unknown as Node)
    dialog.appendChild(h('p', { className: 'e2-panel-sub' }, '把照片拖到另一家，搬家成功会二次确认。绿灯在岗，黄灯打盹，灰灯睡着了。') as unknown as Node)
    dialog.appendChild(closeBtn as unknown as Node)
    grid = h('div', { className: 'e2-grid' }) as HTMLElement
    dialog.appendChild(grid as unknown as Node)
    overlay.appendChild(dialog as unknown as Node)
    overlay.addEventListener('mousedown', (e: Event) => { if (e.target === overlay) api.close() })
    document.body.appendChild(overlay)
  } catch {
    return { repaint() {}, close() {} }
  }
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') api.close() }
  try { document.addEventListener('keydown', onKey, true) } catch { /* 忽略 */ }

  const homeCard = (plate: HomePlate, ws: string | null, bots: BotSnap[], dashed: boolean, extra: Record<string, string>, hint = '', count = ''): HTMLElement => {
    const box = h('div', { className: SEC_CLASS + (dashed ? ' e2-sec-unbound' : '') }) as HTMLElement
    if (ws) box.setAttribute('data-e2-ws', ws)
    for (const k of Object.keys(extra)) box.setAttribute(k, extra[k])
    const head = h('div', { className: 'e2-sec-name' }) as HTMLElement
    head.appendChild(h('span', { className: 'e2-tape' }, plate.name) as unknown as Node)
    if (count) head.appendChild(h('span', { className: 'e2-n' }, count) as unknown as Node)
    box.appendChild(head as unknown as Node)
    for (const b of bots) {
      const row = h('div', { className: ROW_CLASS }) as HTMLElement
      row.setAttribute('draggable', ctx.rpc ? 'true' : 'false')
      row.setAttribute('data-e2-bot', b.botId)
      row.setAttribute('data-e2-channel', b.channel)
      row.title = ctx.rpc ? '拖到另一个家完成换绑' : '连接服务不可用，暂不能分配'
      const top = h('div', { className: 'e2-ph-top' }) as HTMLElement
      top.appendChild(h('span', { className: 'e2-hdot ' + healthClass(b), title: b.stale ? '状态未知（打盹）' : b.healthKind === 'online' ? '在岗' : '睡着了' }) as unknown as Node)
      top.appendChild(h('span', { className: 'e2-who' }, botLabel(b)) as unknown as Node)
      row.appendChild(top as unknown as Node)
      row.appendChild(h('span', { className: 'e2-cap' }, channelLabel(b.channel) + ' · ' + (b.stale ? '状态未知' : b.healthKind === 'online' ? '永远在线' : b.healthKind === 'warn' ? '偶尔打盹' : '睡着了')) as unknown as Node)
      box.appendChild(row as unknown as Node)
    }
    if (hint) box.appendChild(h('div', { className: 'e2-plus-hint' }, hint) as unknown as Node)
    return box
  }

  const repaint = (bots: BotSnap[]): void => {
    if (!grid) return
    try {
      const { unbound, groups } = boardGroups(bots)
      grid.replaceChildren()
      if (unbound.length > 0) {
        grid.appendChild(homeCard({ name: '还没进家门的', sub: '', initial: '', color: 0 }, null, unbound, true, {}, '', unbound.length + ' 个机器人'))
      }
      for (const g of groups) {
        const plate = homePlate(g.workspace, meta)
        grid.appendChild(homeCard(plate, g.workspace, g.bots, false, {}, '', g.bots.length >= 2 ? g.bots.length + ' 个机器人' : ''))
      }
      grid.appendChild(homeCard(
        { name: '＋ 安新家', sub: '', initial: '', color: 0 }, null, [], true,
        { 'data-e2-new': '1', class: 'e2-sec e2-sec-unbound e2-sec-new' }, '把照片拖到这里，选个空房子接住',
      ))
      grid.appendChild(h('div', { className: 'e2-foot' }, '共 ' + groups.length + ' 户 · ' + bots.length + ' 个机器人') as unknown as Node)
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
