/** e2-adopt 面板渲染：分组板 DOM 装配（展示层；写操作经回调回 view，保证单向数据流）。 */
import { channelLabel } from '../../client/data/config'
import { h } from '../../client/dom'
import type { BotSnap } from '../../client/data/fleet-api'
import { showSheet, type SheetHandle } from '../../client/ui/sheet'
import type { FeatureCtx } from '../protocol'
import { boardGroups, shortName } from './model'

export interface BoardCallbacks {
  bindNew(bot: BotSnap, to: string): void
  confirmMove(bot: BotSnap, from: string, to: string): void
}

export interface BoardHandle {
  repaint(bots: BotSnap[]): void
  close(): void
}

const SEC_CLASS = 'e2-sec'
const ROW_CLASS = 'e2-row'

function botLabel(b: BotSnap): string {
  return (b.botName || b.botId) + ' · ' + channelLabel(b.channel)
}

export function openBoard(ctx: FeatureCtx, cbs: BoardCallbacks): BoardHandle {
  let sheet: SheetHandle | null = null
  try {
    sheet = showSheet({ overlayClass: 'e2-overlay', panelClass: 'e2-panel', label: '重新分配机器人归属' })
  } catch {
    return { repaint() {}, close() {} }
  }
  const sec = (name: string, ws: string | null, bots: BotSnap[], dashed: boolean): HTMLElement => {
    const box = h('div', { className: SEC_CLASS + (dashed ? ' e2-sec-unbound' : '') }) as HTMLElement
    if (ws) box.setAttribute('data-e2-ws', ws)
    box.appendChild(h('div', { className: 'e2-sec-name' }, name + ' ', h('span', { className: 'e2-n' }, bots.length + ' 个')) as unknown as Node)
    for (const b of bots) {
      const row = h('div', { className: ROW_CLASS }) as HTMLElement
      row.setAttribute('draggable', ctx.rpc ? 'true' : 'false')
      row.setAttribute('data-e2-bot', b.botId)
      row.setAttribute('data-e2-channel', b.channel)
      row.title = ctx.rpc ? '拖到另一组完成换绑' : '连接服务不可用，暂不能分配'
      row.appendChild(h('span', { className: 'e2-who' }, botLabel(b)) as unknown as Node)
      const targets = lastTargets.filter((w) => w !== b.workspace)
      if (targets.length > 0) {
        const sel = h('select', {
          title: '移交给别的归属',
          onChange: () => {
            const to = (sel as HTMLSelectElement).value
            try { (sel as HTMLSelectElement).value = '' } catch { /* 忽略 */ }
            if (!to) return
            if (!b.workspace) cbs.bindNew({ ...b }, to)
            else if (to !== b.workspace) cbs.confirmMove({ ...b }, b.workspace, to)
          },
        }) as HTMLSelectElement
        sel.appendChild(h('option', { value: '' }, '移交给…') as unknown as Node)
        for (const w of targets) sel.appendChild(h('option', { value: w }, shortName(w)) as unknown as Node)
        row.appendChild(sel as unknown as Node)
      }
      box.appendChild(row as unknown as Node)
    }
    return box
  }
  let lastTargets: string[] = []
  const repaint = (bots: BotSnap[]): void => {
    if (!sheet) return
    try {
      const { unbound, groups } = boardGroups(bots)
      lastTargets = groups.map((g) => g.workspace)
      const body: unknown[] = [
        h('h2', { className: 'e2-panel-title' }, '重新分配机器人归属'),
        h('p', { className: 'e2-panel-sub' }, '把牌拖到另一组完成换绑（会二次确认）；拖不动时用每行的“移交给”下拉。'),
      ]
      if (unbound.length > 0) body.push(sec('未分配', null, unbound, true))
      for (const g of groups) body.push(sec(g.name, g.workspace, g.bots, false))
      sheet.panel.replaceChildren()
      for (const n of body) sheet.panel.appendChild(n as unknown as Node)
    } catch { /* 渲染失败保持旧面板（fail-closed） */ }
  }
  return {
    repaint,
    close: () => { try { sheet?.close() } catch { /* 忽略 */ } sheet = null },
  }
}

