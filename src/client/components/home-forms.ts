/** 绿框建单弹层（T6a）：新建家 / 新建助理——锚定 popover，布局与文案照 T4 认可款原型
 * proto-studio.html 的 newHomePop / newAsstPop。写管道复用 home-ops（本模块不直接碰 rpc）。
 * T6b #114：新建工作区仍禁用（归后续票）；「以后再绑」已启用（未绑定占位）；新增改名/配图/绑定弹层。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import { huIcon } from './home-icons'
import { initialsOf } from './home-identity'
import { closeHomePop, openHomePop } from './home-pop'
import { freeBots, freeWorkspaces, type Assistant, type Home, type WorkspaceRef } from '../data/home-model'
import type { BotSnap } from '../data/fleet-api'
import { avatarStyle } from './home-identity'
import { asstName, homeName, type RowView } from './home-rows'

export interface FormOps {
  createHome(workspaceId: string): Promise<void>
  createAssistant(homeId: string, channel: string, botId: string, userName?: string): Promise<void>
  createUnbound(homeId: string, channel: string, name?: string): Promise<void>
  bindAssistant(id: string, channel: string, botId: string): Promise<void>
  updateHome(id: string, patch: { name?: string | null; avatar?: string | null }): Promise<void>
  updateAssistant(id: string, patch: { name?: string | null; avatar?: string | null }): Promise<void>
  removeAssistant(id: string): Promise<void>
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
  const mk = h('button', { type: 'button', 'aria-selected': 'false', 'data-tip': '新建工作区（后续票待实现）' }, '新建工作区')
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

/** 新建助理（原型 newAsstPop + T6a 验收② + T6b #114 未绑定占位）：选家 + 选空闲机器人（或以后再绑）+ 可选名字。 */
export function newAsstPop(anchor: HTMLElement | null, deps: FormDeps): void {
  const homes: Home[] = deps.view.homes.filter((x) => !x.tombstone)
  const bots: BotSnap[] = freeBots(deps.view.bots.map((b) => ({ channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName })), deps.view.assistants)
    .map((r) => deps.view.bots.find((b) => b.botId === r.botId && b.channel === r.channel))
    .filter((b): b is BotSnap => !!b)
  let homeId = deps.selHome && homes.some((x) => x.id === deps.selHome) ? deps.selHome : (homes[0]?.id ?? '')
  let botId = bots.length ? bots[0].botId : ''
  const unboundChannel = bots.length ? bots[0].channel : 'feishu'
  const nameInput = h('input', { type: 'text', placeholder: '留空按回落取名', 'aria-label': '助理名字' }) as HTMLInputElement
  const body = [
    h('div', { className: 'hu-ptitle' }, huIcon('plus', 15), '新建助理'),
    field('属于哪个家', homes.length
      ? optList(homes.map((x) => ({ value: x.id, title: homeName(deps.view, x), sub: x.path || '未关联工作区' })), homeId, (v) => { homeId = v })
      : h('p', { className: 'hu-fhint' }, '还没有家：先在上层建一个家。')),
    field('绑定机器人', bots.length
      ? optList([
        { value: '', title: '以后再绑', sub: '先占位，之后随时绑号' },
        ...bots.map((b) => ({ value: b.botId, title: b.botName || b.botId, sub: `${channelLabel(b.channel)} · ${b.connected ? '在线' : '离线'}` })),
      ], botId, (v) => { botId = v })
      : optList([{ value: '', title: '以后再绑', sub: '先占位，之后随时绑号' }], '', (v) => { botId = v })),
    field('名字', nameInput),
    h('p', { className: 'hu-fhint' }, '先建人、后绑号：名字留空时已绑用机器人名，未绑用家名。'),
  ]
  const ok = (): void => {
    if (!homeId) return
    const userName = (nameInput as HTMLInputElement).value.trim()
    closeHomePop(true)
    if (!botId) {
      void deps.ops.createUnbound(homeId, unboundChannel, userName).then(() => deps.onDone('L3', homeId))
      return
    }
    const bot = bots.find((b) => b.botId === botId)
    if (!bot) return
    void deps.ops.createAssistant(homeId, bot.channel, bot.botId, userName || undefined).then(() => deps.onDone('L3', homeId))
  }
  openHomePop(anchor, { width: 340, label: '新建助理', body, foot: footBtns(ok) })
}

export type { Assistant }

export interface EditDeps {
  view: RowView
  ops: FormOps
  onDone: () => void
}

/** 配图行：默认＋6 色（avatar "1".."6"，见 home-identity.hueOf；改名不换色）。 */
function avatarRow(name: string, id: string, current: string | null, onPick: (v: string | null) => void): HTMLElement {
  const wrap = h('div', { className: 'hu-avrow' })
  const opts: Array<string | null> = [null, '1', '2', '3', '4', '5', '6']
  opts.forEach((v) => {
    const b = h('button', {
      type: 'button', className: 'hu-avopt', 'aria-selected': (v ?? '') === (current ?? '') ? 'true' : 'false',
      style: avatarStyle(id + (v ?? 'd'), v), 'aria-label': v ? '配图' + v : '默认图', 'data-avatar': v ?? '',
    }, initialsOf(name))
    b.addEventListener('click', () => {
      const all = wrap.querySelectorAll('.hu-avopt')
      for (let i = 0; i < all.length; i += 1) all[i].setAttribute('aria-selected', 'false')
      b.setAttribute('aria-selected', 'true')
      onPick(v)
    })
    wrap.appendChild(b)
  })
  return wrap
}

/** 家设置：改名＋配图＋恢复默认（T6b 验收①②）。 */
export function renameHomePop(anchor: HTMLElement | null, deps: EditDeps & { homeId: string }): void {
  const home = deps.view.homes.find((x) => x.id === deps.homeId)
  if (!home) return
  const cur = home.nameSource === 'user' ? home.name : ''
  const input = h('input', { type: 'text', placeholder: homeName(deps.view, home), 'aria-label': '家名字' }) as HTMLInputElement
  input.value = cur
  let avatar: string | null = home.avatar ?? null
  const pick = avatarRow(homeName(deps.view, home), home.id, avatar, (v) => { avatar = v })
  const reset = h('button', { className: 'hu-plink', type: 'button' }, '恢复默认名（跟随工作区）')
  reset.addEventListener('click', () => {
    closeHomePop(true)
    void deps.ops.updateHome(home.id, { name: '' }).then(deps.onDone)
  })
  const ok = (): void => {
    const patch: { name?: string | null; avatar?: string | null } = {}
    if (input.value.trim() !== cur) patch.name = input.value.trim()
    if (avatar !== (home.avatar ?? null)) patch.avatar = avatar
    closeHomePop(true)
    if (!Object.keys(patch).length) return
    void deps.ops.updateHome(home.id, patch).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '家设置',
    body: [h('div', { className: 'hu-ptitle' }, huIcon('pencil', 15), '家设置'), field('名字', input), reset, field('配图', pick)],
    foot: footBtns(ok),
  })
}

/** 助理设置：改名＋配图＋恢复默认＋删除助理（只删行不断连，验收④）。 */
export function renameAsstPop(anchor: HTMLElement | null, deps: EditDeps & { asstId: string }): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) return
  const cur = a.nameSource === 'user' ? a.name : ''
  const input = h('input', { type: 'text', placeholder: asstName(deps.view, a), 'aria-label': '助理名字' }) as HTMLInputElement
  input.value = cur
  let avatar: string | null = a.avatar ?? null
  const pick = avatarRow(asstName(deps.view, a), a.id, avatar, (v) => { avatar = v })
  const reset = h('button', { className: 'hu-plink', type: 'button' }, '恢复默认名（跟随机器人/家）')
  reset.addEventListener('click', () => {
    closeHomePop(true)
    void deps.ops.updateAssistant(a.id, { name: '' }).then(deps.onDone)
  })
  const del = h('button', { className: 'hu-plink danger', type: 'button' }, '删除助理（只解绑，不断机器人连接）')
  let armed = false
  del.addEventListener('click', () => {
    if (!armed) { armed = true; del.textContent = '再点一次确认删除'; return }
    closeHomePop(true)
    void deps.ops.removeAssistant(a.id).then(deps.onDone)
  })
  const ok = (): void => {
    const patch: { name?: string | null; avatar?: string | null } = {}
    if (input.value.trim() !== cur) patch.name = input.value.trim()
    if (avatar !== (a.avatar ?? null)) patch.avatar = avatar
    closeHomePop(true)
    if (!Object.keys(patch).length) return
    void deps.ops.updateAssistant(a.id, patch).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '助理设置',
    body: [h('div', { className: 'hu-ptitle' }, huIcon('pencil', 15), '助理设置'), field('名字', input), reset, field('配图', pick), del],
    foot: footBtns(ok),
  })
}

/** 占位绑定：给未绑定助理认领一个空闲机器人（先 bot.workspace.set 再 assistant.bind，验收③）。 */
export function bindAsstPop(anchor: HTMLElement | null, deps: EditDeps & { asstId: string }): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) return
  const bots: BotSnap[] = freeBots(deps.view.bots.map((b) => ({ channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName })), deps.view.assistants)
    .map((r) => deps.view.bots.find((b) => b.botId === r.botId && b.channel === r.channel))
    .filter((b): b is BotSnap => !!b)
  let botId = bots.length ? bots[0].botId : ''
  const body = [
    h('div', { className: 'hu-ptitle' }, huIcon('link', 15), '绑定机器人'),
    field('选择机器人', bots.length
      ? optList(bots.map((b) => ({ value: b.botId, title: b.botName || b.botId, sub: `${channelLabel(b.channel)} · ${b.connected ? '在线' : '离线'}` })), botId, (v) => { botId = v })
      : h('p', { className: 'hu-fhint' }, '没有空闲机器人了：每个机器人只能绑一位助理。')),
  ]
  const ok = (): void => {
    if (!botId) return
    const bot = bots.find((b) => b.botId === botId)
    if (!bot) return
    closeHomePop(true)
    void deps.ops.bindAssistant(a.id, bot.channel, bot.botId).then(deps.onDone)
  }
  openHomePop(anchor, { width: 330, label: '绑定机器人', body, foot: footBtns(ok) })
}
