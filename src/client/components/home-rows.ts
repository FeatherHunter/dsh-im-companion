/** 绿框行渲染器（T6a）：行解剖逐字照 T4 认可款原型；只渲染不写数据（写管道在 home-ops，钻取在 panel-body）。
 * T6b/T6c 才实现的钮照原型画出但 disabled（owner 裁定 2026-10-12），title 标注归属票号。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import { huIcon, type HuIconName } from './home-icons'
import { avatarStyle, imageCover, initialsOf } from './home-identity'
import { avatarSrc } from './home-avatar'
import { botKey, buildIndex, type FleetIndex } from './home-index'
import {
  basenameOf, resolveAssistantDisplay, resolveHomeDisplay,
  type Assistant, type Display, type Home, type WorkspaceRef,
} from '../data/home-model'
import { isOrphanHome } from '../data/home-orphan'
import { orphanRowActs } from './home-orphan-row'
import { homeStrip } from './home-row-strip'
import type { BotSnap } from '../data/fleet-api'

/** 原型回落文案（proto-studio 的 homeFrom/asstFrom）。 */
const FROM_TEXT: Record<string, string> = {
  user: '你改过的名字', workspace: '跟随工作区名', basename: '跟随目录名', fallback: '默认名',
}
const ASST_FROM_TEXT: Record<string, string> = {
  user: '你取过的名字', bot: '跟随机器人名', home: '跟随家名', fallback: '跟随家名',
}

export interface RowView {
  homes: Home[]
  assistants: Assistant[]
  bots: BotSnap[]
  workspaces: WorkspaceRef[]
  /** 一次渲染建一次：所有分组/计数/查找都走它，别在行渲染里再扫数组。 */
  index: FleetIndex
}

/** 唯一装配缝（T10b #127：墓碑家不进列表/计数/钻取，索引仍含它供命名回落读家名）。 */
export function viewOf(homes: Home[], assistants: Assistant[], bots: BotSnap[], workspaces: WorkspaceRef[]): RowView {
  return { homes: homes.filter((h) => !h.tombstone), assistants, bots, workspaces, index: buildIndex(homes, assistants, bots, workspaces) }
}

export function wsOf(view: RowView, home: Home): WorkspaceRef | null {
  if (!home.workspaceId) return null
  return view.index.byWs.get(home.workspaceId) ?? null
}

export function botOf(view: RowView, a: Assistant): BotSnap | null {
  if (!a.botId) return null
  return view.index.byBot.get(botKey(a.channel, a.botId))
    ?? view.index.byBot.get(a.botId) ?? null
}

export function asstOfHome(view: RowView, homeId: string): Assistant[] {
  return view.index.byHome.get(homeId) ?? []
}

export function homeDisplay(view: RowView, home: Home): Display {
  const ws = wsOf(view, home)
  const live = ws ? ws.title : ''
  const livePath = ws ? ws.path : home.path
  const d = resolveHomeDisplay(home, live, livePath)
  return { text: d.text, from: FROM_TEXT[d.from] ?? FROM_TEXT.fallback }
}

export function asstDisplay(view: RowView, a: Assistant): Display {
  const b = botOf(view, a)
  const home = view.index.byId.get(a.homeId)
  const homeText = home ? homeDisplay(view, home).text : ''
  const d = resolveAssistantDisplay(a, b ? b.botName : '', homeText)
  return { text: d.text, from: ASST_FROM_TEXT[d.from] ?? ASST_FROM_TEXT.fallback }
}

export function homeName(view: RowView, home: Home): string {
  return homeDisplay(view, home).text
}

export function asstName(view: RowView, a: Assistant): string {
  return asstDisplay(view, a).text
}

/** 头像：色相与字形都由**不可变 id** 派生（改名不换色），字形见 initialsOf。
 *  `id` 与 `name` 分开传：身份来自 id，显示来自 name——两者不许混用。 */
export function avatarEl(id: string, name: string, avatar: string | null, opts: { round?: boolean; small?: boolean; iconName?: HuIconName } = {}): HTMLElement {
  const cls = `hu-av${opts.round ? ' round' : ''}${opts.small ? ' sm' : ''}`
  /* T11 #128：判定单点＝avatarSrc（列表/详情共用 ⇒ 一致是结构保证）；图未到先画回落款。 */
  const img = opts.iconName ? null : avatarSrc(id, avatar)
  const tint = opts.iconName ? 'background:var(--hu-accent-soft);color:var(--hu-accent-deep)' : avatarStyle(id, avatar)
  const el = h('span', { className: cls, style: img ? imageCover(img) : tint })
  if (opts.iconName) el.appendChild(huIcon(opts.iconName, 15))
  else if (!img) el.textContent = initialsOf(name)
  return el
}

export function pillEl(kind: 'ok' | 'warn' | 'bad' | 'dim', text: string): HTMLElement {
  return h('span', { className: `hu-pill ${kind}` }, text)
}

export function dotEl(on: boolean): HTMLElement {
  return h('span', { className: `hu-dot ${on ? 'on' : 'off'}` })
}

/** 助理在线标（原型 onlineTag）：无渠道 / 在线 / 离线。 */
export function onlineTagEl(bot: BotSnap | null): HTMLElement {
  if (!bot) return h('span', { className: 'hu-online off' }, dotEl(false), '无渠道')
  const on = !!bot.connected
  return h('span', { className: `hu-online${on ? '' : ' off'}` }, dotEl(on), on ? '在线' : '离线')
}

export function statusPillEl(a: Assistant): HTMLElement {
  if (a.status === 'unbound') return pillEl('warn', '未绑定')
  return pillEl(a.status === 'bound' ? 'ok' : 'bad', a.status === 'bound' ? '已绑' : '失联')
}

/** 未实现钮（T6b/T6c）：照原型画出但语义化禁用（不用 opacity .45）；悬停说明归属票号（owner 裁定 2026-10-12）。 */
export function pendingTip(label: string, ticket: string): string {
  return `${label}（#${ticket} 待实现）`
}

function planned(el: HTMLElement, label: string, ticket: string): HTMLElement {
  const btn = el as HTMLButtonElement
  btn.disabled = true
  btn.setAttribute('disabled', '')
  btn.setAttribute('aria-disabled', 'true')
  btn.setAttribute('data-tip', pendingTip(label, ticket))
  btn.classList.add('planned')
  return btn
}

export function iconBtn(act: string, label: string, iconName: HuIconName, opts: { ticket?: string } = {}): HTMLElement {
  const el = h('button', { className: 'hu-ract icon', type: 'button', 'data-item-act': act,
    'aria-label': label, 'data-tip': opts.ticket ? pendingTip(label, opts.ticket) : label }, huIcon(iconName, 15))
  return opts.ticket ? planned(el, label, opts.ticket) : el
}

export function textBtn(act: string, label: string, opts: { cls?: string; ticket?: string; id?: string } = {}): HTMLElement {
  const el = h('button', { className: `hu-ract ${opts.cls ?? ''}`.trim(), type: 'button',
    'data-item-act': act, ...(opts.id ? { 'data-id': opts.id } : {}) }, label)
  return opts.ticket ? planned(el, label, opts.ticket) : el
}

/** 在线汇总（渠道行用）：0 助理不渲染——计数已由副标承担（真机反馈 2026-10-13）。O(m)。 */
export function homeOnlineTag(view: RowView, list: Assistant[]): HTMLElement | null {
  if (!list.length) return null
  let online = 0
  for (const a of list) if (botOf(view, a)?.connected) online += 1
  return online > 0
    ? h('span', { className: 'hu-online' }, dotEl(true), `${online} 个在线`)
    : h('span', { className: 'hu-online off' }, dotEl(false), '全部离线')
}

export interface RowOpts {
  selected?: boolean
  flash?: boolean
  onOpen?: (id: string) => void
  onItemAct?: (act: string, id: string, anchor: HTMLElement) => void
}

function wireRow(el: HTMLElement, opts: RowOpts, id: string): void {
  el.addEventListener('click', () => opts.onOpen?.(id))
  el.addEventListener('keydown', (e) => {
    /* 焦点落在行内按钮（[data-item-act]，如「＋ 建助理」）上时回车/空格只触发按钮自己：
     * 行不再顺手钻取——否则回车＝又开弹层又进 L2，一键两事（T13 #135 真机把关）。 */
    if ((e as KeyboardEvent).target !== el) return
    const k = (e as KeyboardEvent).key
    if (k === 'Enter' || k === ' ') { e.preventDefault(); opts.onOpen?.(id) }
  })
  const acts = el.querySelectorAll('[data-item-act]')
  for (let i = 0; i < acts.length; i += 1) {
    const btn = acts[i] as HTMLElement
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onItemAct?.(btn.getAttribute('data-item-act') ?? '', id, btn)
    })
  }
}

/** 家行（T13 #135，owner 选定的 B 方案）：**两段式**——
 *  上段：头像 ＋ 名字（**只有手改过名**才挂「你取的名」）＋ 动作（孤儿＝选择工作区/删除家，正常＝重命名/更多）；
 *  下段：`homeStrip` 的条带（助理芯片｜空家「＋ 建助理」｜孤儿红色警示行）。
 *  为什么删掉老副标「N 位助理 · 跟随工作区名」：计数交给条带上的芯片与「N 助理」徽章（owner：纯文本不成形）；
 *  默认命名规则不必写出来（owner 2026-10-15 真机）。孤儿判据唯一在 data/home-orphan.isOrphanHome（T10b #127）。 */
export function homeRow(view: RowView, home: Home, opts: RowOpts = {}): HTMLElement {
  const d = homeDisplay(view, home)
  const list = asstOfHome(view, home.id)
  const orphan = isOrphanHome(home, view.workspaces)
  const nm = h('span', { className: 'hu-nm' }, h('b', {}, d.text))
  if (home.nameSource === 'user' && home.name.trim()) nm.appendChild(h('span', { className: 'hu-scr' }, '你取的名'))
  const acts = h('span', { className: 'hu-acts2' })
  if (orphan) orphanRowActs(acts, home.id, opts.onItemAct)
  else {
    acts.appendChild(iconBtn('rename-h', '重命名', 'pencil'))
    acts.appendChild(iconBtn('more-home', '更多', 'more'))
  }
  const el = h('div', {
    className: `hu-row hrow${orphan ? ' orphan' : ''}${opts.selected ? ' on' : ''}${opts.flash ? ' hu-flash' : ''}`,
    role: 'button', tabindex: 0, 'data-open': 'L2', 'data-id': home.id, 'aria-label': `家 ${d.text}`,
  },
    h('div', { className: 'hu-btop' },
      avatarEl(home.id, d.text, home.avatar),
      h('span', { className: 'hu-txt' }, nm),
      acts),
    homeStrip({
      homeId: home.id,
      orphan,
      path: home.path ?? '',
      assts: list.map((a) => {
        const bot = botOf(view, a)
        const ch = channelLabel(a.channel)
        const bound = !!a.botId
        return {
          id: a.id,
          name: asstName(view, a),
          avatar: a.avatar ?? null,
          /* 绿＝在线；有机器人但快照没到＝离线（红）；没绑机器人＝空心（未绑定）。与老「每助理一圆点」口径一致。 */
          on: bot ? !!bot.connected : (bound ? false : null),
          channel: a.channel ?? '',
          /* 气泡 sub 只讲“渠道＋机器人名”，状态一律由 statusText 讲（owner 禁 · 且禁状态复读）。 */
          sub: bot ? `${ch}${bot.botName || '未命名机器人'}` : ch,
        }
      }),
    }))
  wireRow(el, opts, home.id)
  return el
}

/** 助理行（原型 rowsAsst）：头像(圆) + 名 + 已绑章 + 在线 / 渠道 · 工作区路径 + 接入 · ⋯。 */
export function asstRow(view: RowView, a: Assistant, opts: RowOpts = {}): HTMLElement {
  const d = asstDisplay(view, a)
  const bot = botOf(view, a)
  const home = view.index.byId.get(a.homeId)
  const path = home && home.path ? home.path : '未关联工作区'
  const nm = h('span', { className: 'hu-nm' }, h('b', {}, d.text), statusPillEl(a), onlineTagEl(bot))
  const el = h('div', {
    className: `hu-row${opts.selected ? ' on' : ''}${opts.flash ? ' hu-flash' : ''}${a.status !== 'bound' ? ' off' : ''}`,
    role: 'button', tabindex: 0, 'data-open': 'L3', 'data-id': a.id, 'aria-label': `助理 ${d.text}`,
  },
    avatarEl(a.id, d.text, a.avatar, { round: true }),
    h('span', { className: 'hu-txt' }, nm,
      h('span', { className: 'hu-sub' }, `${channelLabel(a.channel)} · 工作区 ${path}`)),
    h('span', { className: 'hu-acts2' },
      a.status === 'bound'
        ? textBtn('connect-a', '接入', { cls: 'connect', id: a.id })
        : textBtn('bind-a', '绑定机器人', { id: a.id }),
      iconBtn('more-asst', '更多', 'more')))
  wireRow(el, opts, a.id)
  return el
}

/** 渠道行（按渠道模式 L1）：渠道名 + 在线汇总 / N 位助理 · 已绑数 / 助理清单。 */
export function channelRow(view: RowView, channel: string, opts: RowOpts = {}): HTMLElement {
  const list = view.index.byChannel.get(channel) ?? []
  let bound = 0
  for (const a of list) if (a.status === 'bound') bound += 1
  const label = channelLabel(channel)
  const names = list.length ? `助理：${list.map((a) => asstName(view, a)).join('、')}` : ''
  const nm = h('span', { className: 'hu-nm' }, h('b', {}, label))
  const onlineEl = homeOnlineTag(view, list)
  if (onlineEl) nm.appendChild(onlineEl)
  const txt = h('span', { className: 'hu-txt' }, nm,
    h('span', { className: 'hu-sub' }, `${list.length} 位助理 · ${bound} 位已绑`))
  if (names) txt.appendChild(h('span', { className: 'hu-names' }, names))
  const el = h('div', {
    className: `hu-row${opts.selected ? ' on' : ''}${opts.flash ? ' hu-flash' : ''}`,
    role: 'button', tabindex: 0, 'data-open': 'L2', 'data-id': channel, 'aria-label': `渠道 ${label}`,
  },
    avatarEl(`channel:${channel}`, label, null),
    txt,
    h('span', { className: 'hu-acts2' }))
  wireRow(el, opts, channel)
  return el
}

export function emptyEl(title: string, sub: string, iconName: HuIconName = 'home'): HTMLElement {
  return h('div', { className: 'hu-empty' },
    h('div', { className: 'hu-eic' }, huIcon(iconName, 19)),
    h('b', {}, title),
    h('p', {}, sub))
}

/** 骨架列表：两段式家行同几何（上段头像/名条/动作 ＋ 下段条带灰条）⇒「骨架 → 真行」只换内容
 * 不换几何，布局零跳动（真机要求 2026-10-13；T13 #135 起家行是两段，骨架必须跟着变）。 */
export function skeletonRows(n = 4): HTMLElement {
  const one = (): HTMLElement => h('div', { className: 'hu-row hrow hu-srow', 'aria-hidden': 'true' },
    h('div', { className: 'hu-btop' },
      h('span', { className: 'hu-sk hu-sk-av' }),
      h('span', { className: 'hu-scol' }, h('span', { className: 'hu-sk hu-sk-t1' })),
      h('span', { className: 'hu-sk hu-sk-act' })),
    h('div', { className: 'hu-sstrip' },
      h('span', { className: 'hu-sk hu-sk-chip' }),
      h('span', { className: 'hu-sk hu-sk-chip' }),
      h('span', { className: 'hu-sk hu-sk-cnt' })))
  const list = h('div', { className: 'hu-fbody' })
  for (let i = 0; i < n; i += 1) list.appendChild(one())
  return list
}

export { basenameOf }
