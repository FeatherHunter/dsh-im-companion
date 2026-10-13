/** 绿框 L3 助理详情（T6a）：结构逐字照 T4 认可款原型 proto-studio.html 的 viewAsst——
 * 详情卡（头像/名/回落来源/在线 + 家·渠道章 + 命名链 + 机器人块）+ 三组行动作。
 * T6b #114：绑定/改名/配图/删除已启用；T6c 的钮（换工作区·移除渠道）仍走待实现清单。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import { huIcon } from './home-icons'
import { asstDisplay, avatarEl, botOf, homeDisplay, onlineTagEl, pillEl, statusPillEl, type RowView } from './home-rows'
import type { Assistant } from '../data/home-model'

export interface DetailOpts {
  view: RowView
  a: Assistant
  onAct: (act: string, anchor: HTMLElement) => void
}

function abtn(act: string, label: string, o: DetailOpts, opts: { cls?: string; icon?: 'link' | 'info' | 'pencil' | 'image' | 'move' | 'unlink' | 'trash'; ticket?: string } = {}): HTMLElement {
  const el = h('button', { className: `hu-abtn ${opts.cls ?? ''}`.trim(), type: 'button', 'data-item-act': act },
    ...(opts.icon ? [huIcon(opts.icon, 14)] : []), label)
  if (opts.ticket) {
    el.disabled = true
    el.setAttribute('disabled', '')
    el.setAttribute('aria-disabled', 'true')
    el.setAttribute('data-tip', `${label}（#${opts.ticket} 待实现）`)
    el.classList.add('planned')
  } else {
    el.addEventListener('click', () => o.onAct(act, el))
  }
  return el
}

/** 命名链：你取的名 / 机器人名 / 家名，命中来源高亮。 */
function chainEl(a: Assistant): HTMLElement {
  const active = a.nameSource === 'user' ? 'user' : a.botId ? 'bot' : 'home'
  const wrap = h('div', { className: 'hu-chain' })
  const items: Array<[string, string]> = [['user', '你取的名'], ['bot', '机器人名'], ['home', '家名']]
  items.forEach(([key, label], i) => {
    if (i) wrap.appendChild(h('i', {}))
    const span = h('span', { className: key === active ? 'on' : '' }, label)
    wrap.appendChild(span)
  })
  return wrap
}

function botBlock(o: DetailOpts): HTMLElement {
  const { a } = o
  const bot = botOf(o.view, a)
  const block = h('div', { className: 'hu-botblock' })
  if (bot) {
    block.appendChild(h('div', { className: 'hu-big' },
      h('span', { className: 'hu-bic' }, huIcon('bot', 18)),
      h('div', { className: 'hu-txt' },
        h('b', {}, bot.botName || '未命名机器人'),
        h('small', {}, `${channelLabel(bot.channel)} · 单渠道实例`)),
      h('span', { className: 'hu-pill dim hu-mono' }, bot.botId)))
    block.appendChild(h('div', { className: 'hu-steps3' },
      h('span', {}, '助理占位'), h('i', {}),
      h('span', { style: 'color:var(--hu-accent-deep);font-weight:650' }, '机器人绑定'), h('i', {}),
      h('span', {}, '改名史跟随')))
  } else {
    block.appendChild(h('div', { className: 'hu-big' },
      h('span', { className: 'hu-bic off' }, huIcon('person', 18)),
      h('div', { className: 'hu-txt' },
        h('b', {}, '还没绑机器人'),
        h('small', {}, '人先占位、号后到')),
      pillEl('warn', a.status === 'orphan' ? '失联' : '未绑定')))
    block.appendChild(h('p', { className: 'hu-fhint' }, '点下面的「绑定机器人」认领一个单渠道实例；显示走家名回落。'))
  }
  return block
}

/** 详情卡 + 三组行动作（返回 fragment 容器，便于直接挂进列表）。 */
export function detailEl(o: DetailOpts): HTMLElement {
  const { a } = o
  const d = asstDisplay(o.view, a)
  const home = o.view.index.byId.get(a.homeId)
  const homeText = home ? homeDisplay(o.view, home).text : '未关联工作区'
  const bot = botOf(o.view, a)

  const card = h('div', { className: 'hu-detail' },
    h('div', { className: 'hu-dhead' },
      avatarEl(a.id, d.text, a.avatar, { round: true }),
      h('div', { className: 'hu-txt' },
        h('b', {}, d.text),
        h('small', {}, `${d.from} · `, h('span', { className: 'hu-mono' }, a.id))),
      onlineTagEl(bot)),
    h('div', { className: 'hu-meta' },
      h('span', { className: 'hu-mchip' }, huIcon('home', 13), homeText),
      h('span', { className: 'hu-mchip' }, huIcon('link', 13), channelLabel(a.channel)),
      statusPillEl(a)),
    chainEl(a),
    botBlock(o))

  const primary = h('div', { className: 'hu-acts' })
  if (a.status === 'bound') primary.appendChild(abtn('connect-a', '接入', o, { cls: 'go', icon: 'link' }))
  else primary.appendChild(abtn('bind-a', '绑定机器人', o, { cls: 'go', icon: 'link' }))
  primary.appendChild(abtn('detail-a', '详情', o, { icon: 'info' }))

  /* T6b #114 已启用：改名·配图（同一设置弹层）＋删除助理（两步确认，只删行不断连）。
   * T6c 的动作不画成假按钮：一行待实现清单（真机反馈 2026-10-13）。 */
  const second = h('div', { className: 'hu-acts' })
  second.appendChild(abtn('rename-a', '改名·配图', o, { icon: 'pencil' }))
  const del = h('button', { className: 'hu-abtn', type: 'button', 'data-item-act': 'remove-a' }, huIcon('trash', 14), '删除助理')
  let armed = false
  del.addEventListener('click', () => {
    if (!armed) { armed = true; del.textContent = '再点一次确认删除'; return }
    o.onAct('remove-a', del)
  })
  second.appendChild(del)
  const soon = h('p', { className: 'hu-soon' }, '待实现：换工作区 · 移除渠道（#115）')

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, card, primary, second, soon)
}
