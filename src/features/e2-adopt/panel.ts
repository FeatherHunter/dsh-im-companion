/** e2-adopt 驾驶舱：中央弹窗 + 按归属分地盘（色板区分）+ “＋ 新地盘”兜底（空人也能接）。
 * 纯展示装配；写操作由 view 的文档级拖放接管（地盘即 data-e2-ws 目标）。 */
import { channelLabel } from '../../client/data/config'
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import type { FeatureCtx } from '../protocol'
import { boardGroups, shortName } from './model'

export interface BoardHandle {
  repaint(bots: BotSnap[]): void
  close(): void
}

const SEC_CLASS = 'e2-sec'
const ROW_CLASS = 'e2-row'

/** 归属色板（8 色循环；卡头色点 + 卡片描边 + 牌归属条同色，卡头即图例）。 */
const PALETTE = ['#0a84ff', '#30d158', '#bf5af2', '#ff9f0a', '#ff375f', '#64d2ff', '#ffd60a', '#ff453a']

function botLabel(b: BotSnap): string {
  return (b.botName || b.botId) + ' · ' + channelLabel(b.channel)
}

function paintColor(el: HTMLElement, color: string): void {
  try { el.style.setProperty('--e2-c', color) } catch { /* 无样式环境忽略 */ }
}

export function openBoard(ctx: FeatureCtx): BoardHandle {
  let overlay: HTMLElement | null = null
  let grid: HTMLElement | null = null
  try {
    overlay = h('div', { className: 'e2-overlay' }) as HTMLElement
    const dialog = h('div', { className: 'e2-cockpit', role: 'dialog', 'aria-modal': 'true', 'aria-label': '重新分配机器人归属' }) as HTMLElement
    const closeBtn = h('button', { className: 'e2-x', title: '关闭', 'aria-label': '关闭', onClick: () => api.close() }, '×') as HTMLElement
    dialog.appendChild(h('h2', { className: 'e2-panel-title' }, '重新分配机器人归属') as unknown as Node)
    dialog.appendChild(h('p', { className: 'e2-panel-sub' }, '把牌拖到另一块地盘完成换绑（会二次确认）。颜色即归属。') as unknown as Node)
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

  const sec = (name: string, ws: string | null, bots: BotSnap[], color: string | null, extra: Record<string, string>): HTMLElement => {
    const box = h('div', { className: SEC_CLASS + (color === null ? ' e2-sec-unbound' : '') }) as HTMLElement
    if (ws) box.setAttribute('data-e2-ws', ws)
    for (const k of Object.keys(extra)) box.setAttribute(k, extra[k])
    if (color) paintColor(box, color)
    box.appendChild(h('div', { className: 'e2-sec-name' }, h('span', { className: 'e2-dot' }) as unknown as Node, name + ' ', h('span', { className: 'e2-n' }, bots.length + ' 个')) as unknown as Node)
    for (const b of bots) {
      const row = h('div', { className: ROW_CLASS }) as HTMLElement
      row.setAttribute('draggable', ctx.rpc ? 'true' : 'false')
      row.setAttribute('data-e2-bot', b.botId)
      row.setAttribute('data-e2-channel', b.channel)
      row.title = ctx.rpc ? '拖到另一块地盘完成换绑' : '连接服务不可用，暂不能分配'
      row.appendChild(h('span', { className: 'e2-who' }, botLabel(b)) as unknown as Node)
      box.appendChild(row as unknown as Node)
    }
    return box
  }

  const repaint = (bots: BotSnap[]): void => {
    if (!grid) return
    try {
      const { unbound, groups } = boardGroups(bots)
      grid.replaceChildren()
      if (unbound.length > 0) grid.appendChild(sec('待分配', null, unbound, null, {}))
      groups.forEach((g, i) => grid!.appendChild(sec(g.name, g.workspace, g.bots, PALETTE[i % PALETTE.length], {})))
      const plus = sec('＋ 新地盘', null, [], null, { 'data-e2-new': '1', class: 'e2-sec e2-sec-unbound e2-sec-new' })
      plus.appendChild(h('div', { className: 'e2-plus-hint' }, '把牌拖到这里，选个空人接住') as unknown as Node)
      grid.appendChild(plus)
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

