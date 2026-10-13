/** 绿框建单弹层（T6a）：新建家 / 新建助理——锚定 popover，布局与文案照 T4 认可款原型
 * proto-studio.html 的 newHomePop / newAsstPop。写管道复用 home-ops（本模块不直接碰 rpc）。
 * T6a 只走「复用已有工作区 + 选一个空闲机器人」这条最细的路：
 *   · 新建工作区（建家第二入口）与「以后再绑」（未绑定占位）照原型画出但禁用，标注归属票号。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import { huIcon } from './home-icons'
import { initialsOf } from './home-identity'
import { closeHomePop, openHomePop } from './home-pop'
import { freeBots, freeWorkspaces, type Assistant, type Home, type WorkspaceRef } from '../data/home-model'
import type { BotSnap } from '../data/fleet-api'
import { avatarStyle } from './home-identity'
import { homeName, type RowView } from './home-rows'

export interface FormOps {
  createHome(workspaceId: string): Promise<void>
  createAssistant(homeId: string, channel: string, botId: string): Promise<void>
}

export interface FormDeps {
  view: RowView
  ops: FormOps
  selHome: string
  onDone: (level: 'L2' | 'L3', homeId: string, workspaceId?: string) => void
}

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { className: 'hu-fld' }, h('span', {}, label), control)
}

function optList(items: Array<{ value: string; title: string; sub: string; disabled?: boolean; tip?: string }>, current: string, onPick: (v: string) => void): HTMLElement {
  const box = h('div', { className: 'hu-opts' })
  items.forEach((it) => {
    const btn = h('button', {
      className: 'hu-opt', type: 'button', 'data-value': it.value,
      'aria-selected': it.value === current ? 'true' : 'false',
    },
      h('span', { className: 'hu-oi', style: avatarStyle(`opt:${it.value}`, null) }, initialsOf(it.title)),
      h('span', { className: 'hu-ot' }, h('b', {}, it.title), h('small', {}, it.sub)))
    if (it.disabled) {
      btn.disabled = true
      btn.setAttribute('disabled', '')
      if (it.tip) btn.setAttribute('data-tip', it.tip)
    } else {
      btn.addEventListener('click', () => {
        const all = box.querySelectorAll('.hu-opt')
        for (let i = 0; i < all.length; i += 1) all[i].setAttribute('aria-selected', 'false')
        btn.setAttribute('aria-selected', 'true')
        onPick(it.value)
      })
    }
    box.appendChild(btn)
  })
  return box
}

function seg2(): HTMLElement {
  const box = h('div', { className: 'hu-seg2' })
  const pick = h('button', { type: 'button', 'aria-selected': 'true' }, '复用工作区')
  const mk = h('button', { type: 'button', 'aria-selected': 'false', 'data-tip': '新建工作区（#114 待实现）' }, '新建工作区')
  mk.disabled = true
  mk.setAttribute('disabled', '')
  box.appendChild(pick)
  box.appendChild(mk)
  return box
}

function footBtns(onOk: () => void): HTMLElement[] {
  const cancel = h('button', { className: 'hu-pbtn-s', type: 'button' }, '取消')
  cancel.addEventListener('click', () => closeHomePop())
  const ok = h('button', { className: 'hu-pbtn-s go', type: 'button' }, '创建')
  ok.addEventListener('click', onOk)
  return [cancel, ok]
}

/** 新建家（原型 newHomePop）：选一个空闲工作区 ⇒ 写本插件家表。 */
export function newHomePop(anchor: HTMLElement | null, deps: FormDeps): void {
  const free: WorkspaceRef[] = freeWorkspaces(deps.view.workspaces, deps.view.homes)
  let picked = free.length ? free[0].workspaceId : ''
  const body = [
    h('div', { className: 'hu-ptitle' }, huIcon('plus', 15), '新建家'),
    seg2(),
    field('已有工作区', free.length
      ? optList(free.map((w) => ({ value: w.workspaceId, title: w.title, sub: w.path })), picked, (v) => { picked = v })
      : h('p', { className: 'hu-fhint' }, '没有空闲工作区了：每个工作区只能有一个家。')),
    h('p', { className: 'hu-fhint' }, '家和工作区一一对应：复用就只写本插件；新建工作区入口待后续票。'),
  ]
  const ok = (): void => {
    if (!picked) return
    closeHomePop(true)
    void deps.ops.createHome(picked).then(() => deps.onDone('L2', '', picked))
  }
  openHomePop(anchor, { width: 330, label: '新建家', body, foot: footBtns(ok) })
}

/** 新建助理（原型 newAsstPop + T6a 验收②「建助理选绑机器人即成功」）：选家 + 选空闲机器人 + 可选名字。 */
export function newAsstPop(anchor: HTMLElement | null, deps: FormDeps): void {
  const homes: Home[] = deps.view.homes.filter((x) => !x.tombstone)
  const bots: BotSnap[] = freeBots(deps.view.bots.map((b) => ({ channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName })), deps.view.assistants)
    .map((r) => deps.view.bots.find((b) => b.botId === r.botId && b.channel === r.channel))
    .filter((b): b is BotSnap => !!b)
  let homeId = deps.selHome && homes.some((x) => x.id === deps.selHome) ? deps.selHome : (homes[0]?.id ?? '')
  let botId = bots.length ? bots[0].botId : ''
  const nameInput = h('input', { type: 'text', placeholder: '留空按回落取名', 'aria-label': '助理名字' }) as HTMLInputElement
  const body = [
    h('div', { className: 'hu-ptitle' }, huIcon('plus', 15), '新建助理'),
    field('属于哪个家', homes.length
      ? optList(homes.map((x) => ({ value: x.id, title: homeName(deps.view, x), sub: x.path || '未关联工作区' })), homeId, (v) => { homeId = v })
      : h('p', { className: 'hu-fhint' }, '还没有家：先在上层建一个家。')),
    field('绑定机器人', bots.length
      ? optList([
        { value: '', title: '以后再绑', sub: '先占位，之后随时绑号', disabled: true, tip: '未绑定占位（#114 待实现）' },
        ...bots.map((b) => ({ value: b.botId, title: b.botName || b.botId, sub: `${channelLabel(b.channel)} · ${b.connected ? '在线' : '离线'}` })),
      ], botId, (v) => { botId = v })
      : h('p', { className: 'hu-fhint' }, '没有空闲机器人了：每个机器人只能绑一位助理。')),
    field('名字', nameInput),
    h('p', { className: 'hu-fhint' }, '先建人、后绑号：名字留空时已绑用机器人名，未绑用家名。'),
  ]
  const ok = (): void => {
    if (!homeId || !botId) return
    const bot = bots.find((b) => b.botId === botId)
    if (!bot) return
    closeHomePop(true)
    void deps.ops.createAssistant(homeId, bot.channel, bot.botId).then(() => deps.onDone('L3', homeId))
  }
  openHomePop(anchor, { width: 340, label: '新建助理', body, foot: footBtns(ok) })
}

export type { Assistant }
