/** e2-adopt 驾驶舱：中央弹窗 + 家卡（门牌大名/首字头像/健康灯）+ “＋ 安新家”兜底空人。
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

/* 渠道品牌色（自有映射；未知渠道回退灰）。与健康灯分工：字色=哪家电话，圆点=通不通。 */
const CHANNEL_COLORS: Record<string, string> = {
  feishu: '#3370ff', weixin: '#07c160', wechat: '#07c160', qq: '#12b7f5',
  slack: '#4a154b', telegram: '#2aabee', discord: '#5865f2', whatsapp: '#25d366',
  dingtalk: '#0091ff', wecom: '#2e7cf6',
}

function channelColor(channel: string): string {
  return CHANNEL_COLORS[String(channel ?? '').toLowerCase()] ?? '#8e8e93'
}

/* 成员行健康灯：在线绿（呼吸）/ 未知黄 / 离线灰；stale 按未知展示，绝不谎报离线。 */
function healthClass(b: BotSnap): string {
  const k = b.stale ? 'warn' : b.healthKind
  return k === 'online' ? 'e2-h-online' : k === 'warn' ? 'e2-h-warn' : 'e2-h-off'
}

export function openBoard(ctx: FeatureCtx, meta: AgentMetaDoc | null): BoardHandle {
  let overlay: HTMLElement | null = null
  let grid: HTMLElement | null = null
  try {
    overlay = h('div', { className: 'e2-overlay' }) as HTMLElement
    const dialog = h('div', { className: 'e2-cockpit', role: 'dialog', 'aria-modal': 'true', 'aria-label': '重新分配机器人归属' }) as HTMLElement
    const closeBtn = h('button', { className: 'e2-x', title: '关闭', 'aria-label': '关闭', onClick: () => api.close() }, '×') as HTMLElement
    dialog.appendChild(h('h2', { className: 'e2-panel-title' }, '机器人搬家') as unknown as Node)
    dialog.appendChild(h('p', { className: 'e2-panel-sub' }, '把成员拖到另一个家完成换绑（会二次确认）。绿灯在岗，黄灯打盹，灰灯睡着了。') as unknown as Node)
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
    const box = h('div', { className: SEC_CLASS + ' e2-av-' + (plate.color % 8) + (dashed ? ' e2-sec-unbound' : '') }) as HTMLElement
    if (ws) box.setAttribute('data-e2-ws', ws)
    for (const k of Object.keys(extra)) box.setAttribute(k, extra[k])
    const head = h('div', { className: 'e2-sec-name' }) as HTMLElement
    head.appendChild(h('span', { className: 'e2-face', title: plate.name }, plate.initial) as unknown as Node)
    const titles = h('span', { className: 'e2-titles' }) as HTMLElement
    titles.appendChild(h('span', { className: 'e2-home' }, plate.name) as unknown as Node)
    if (plate.sub) titles.appendChild(h('span', { className: 'e2-sub' }, plate.sub) as unknown as Node)
    head.appendChild(titles as unknown as Node)
    if (count) head.appendChild(h('span', { className: 'e2-n' }, count) as unknown as Node)
    box.appendChild(head as unknown as Node)
    for (const b of bots) {
      const row = h('div', { className: ROW_CLASS }) as HTMLElement
      row.setAttribute('draggable', ctx.rpc ? 'true' : 'false')
      row.setAttribute('data-e2-bot', b.botId)
      row.setAttribute('data-e2-channel', b.channel)
      row.title = ctx.rpc ? '拖到另一个家完成换绑' : '连接服务不可用，暂不能分配'
      row.appendChild(h('span', { className: 'e2-hdot ' + healthClass(b), title: b.stale ? '状态未知（打盹）' : b.healthKind === 'online' ? '在岗' : '睡着了' }) as unknown as Node)
      row.appendChild(h('span', { className: 'e2-who' }, botLabel(b)) as unknown as Node)
      row.appendChild(h('span', { className: 'e2-ch', style: { color: channelColor(b.channel) } }, ' · ' + channelLabel(b.channel)) as unknown as Node)
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
        grid.appendChild(homeCard({ name: '还没进家门的', sub: '先落到任意家', initial: '？', color: 0 }, null, unbound, true, {}, '', unbound.length + ' 个机器人'))
      }
      for (const g of groups) {
        grid.appendChild(homeCard(homePlate(g.workspace, meta), g.workspace, g.bots, false, {}, '', g.bots.length >= 2 ? g.bots.length + ' 个机器人' : ''))
      }
      grid.appendChild(h('div', { className: 'e2-foot' }, '共 ' + groups.length + ' 户 · ' + bots.length + ' 个机器人') as unknown as Node)
      grid.appendChild(homeCard(
        { name: '＋ 安新家', sub: '', initial: '＋', color: 0 }, null, [], true,
        { 'data-e2-new': '1', class: 'e2-sec e2-sec-unbound e2-sec-new' }, '把牌拖到这里，选个空房子接住',
      ))
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
