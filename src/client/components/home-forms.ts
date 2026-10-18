/** 绿框建单弹层（T6a/T6b/T8）：新建家 / 新建助理——锚定 popover，布局文案照 T4 认可款原型 proto-studio.html；写管道复用 home-ops。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import { dirField, runDirCreate } from './home-dir-form'
import { huIcon } from './home-icons'
import { avatarStyle, initialsOf } from './home-identity'
import { avatarImageCell } from './home-avatar-form'
import { closeHomePop, homePopOpen, openHomePop, updateHomePop, type AnchorRef } from './home-pop'
import { freeBots, type Assistant, type Home, type WorkspaceRef } from '../data/home-model'
import type { BotSnap } from '../data/fleet-api'
import { asstName, avatarEl, homeName, type RowView } from './home-rows'
import { logLine, logOn } from '../log'
export interface FormOps {
  createHome(workspaceId: string): Promise<void>
  createAssistant(homeId: string, channel: string, botId: string, userName?: string): Promise<void>
  createUnbound(homeId: string, name?: string): Promise<void>
  bindAssistant(id: string, channel: string, botId: string): Promise<void>
  updateHome(id: string, patch: { name?: string | null; avatar?: string | null }, quiet?: boolean): Promise<boolean>
  updateAssistant(id: string, patch: { name?: string | null; avatar?: string | null }, quiet?: boolean): Promise<boolean>
  removeAssistant(id: string): Promise<void>
  pickDirectory(): Promise<string | null>
  adoptDirectory(dir: string): Promise<WorkspaceRef | null>
}

export interface FormDeps {
  view: RowView
  ops: FormOps
  selHome: string
  /** 家内建助理时锁家（L2 的「新建助理」）：家已定 ⇒ 不再给候选列表，直接告知归属。 */
  lockHome?: boolean
  onDone: (level: 'L2' | 'L3', homeId: string, workspaceId?: string) => void
}

/* 表单侧「点了但什么都没发生」兜底（弹层在 ops 之前 return 的场合）：只 debug，不进恒落盘通道。 */
const fLog = (action: string, ok: boolean, message: string): void => { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'form', action, ok, message }) }

/* 装按钮类控件的字段必须传 'div'——真机实测（2026-10-14）：label 会把内部第一个按钮当 labeled control，悬停/点击/焦点全转过去。 */
export function field(label: string, control: HTMLElement, tag: 'label' | 'div' = 'label'): HTMLElement { return h(tag, { className: 'hu-fld' }, h('span', {}, label), control) }

/** 机器人列表项的副标：渠道名 ＋（在线／离线）。**「在线」二字必须绿**（owner 2026-10-17：属于在线的文字要绿）；
 * 纯串塞不进颜色 ⇒ 列表项额外吃一个节点（`subNode`，追加式字段，老调用只传 `sub` 照旧）。 */
export function botSubNode(channel: string, connected: boolean): HTMLElement {
  return h('span', {},
    channelLabel(channel) + '（',
    h('span', { className: connected ? 'hu-son' : undefined }, connected ? '在线' : '离线'),
    '）')
}

export function optList(items: Array<{ value: string; title: string; sub?: string; subNode?: HTMLElement; disabled?: boolean; tip?: string }>, current: string, onPick: (v: string) => void): HTMLElement {
  const box = h('div', { className: 'hu-opts' })
  items.forEach((it) => {
    const btn = h('button', {
      className: 'hu-opt', type: 'button', 'data-value': it.value,
      'aria-selected': it.value === current ? 'true' : 'false',
    },
      h('span', { className: 'hu-oi', style: avatarStyle(`opt:${it.value}`, null) }, initialsOf(it.title)),
      h('span', { className: 'hu-ot' }, h('b', {}, it.title), h('small', {}, it.subNode ?? it.sub ?? '')))
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

/** 弹层底钮（取消 / 主按钮）。主按钮文案默认「创建」，按动作可换：绑定机器人＝「绑定」、设置类＝「保存」——
 * 一个表单的主按钮必须说出**这一步到底做了什么**（owner 2026-10-17：绑定弹层的「创建」让人以为要新建机器人）。 */
export function footBtns(onOk: () => void, disabledReason?: string, okLabel = '创建'): HTMLElement[] {
  const cancel = h('button', { className: 'hu-pbtn-s', type: 'button' }, '取消')
  cancel.addEventListener('click', () => closeHomePop())
  const ok = h('button', { className: 'hu-pbtn-s go', type: 'button' }, okLabel)
  if (disabledReason) {
    /* 没有可建的家时必须一眼看出「不可用」：早先静默 return 会被读成「点了没反应」（#112 真机实测）。 */
    ok.disabled = true; ok.setAttribute('disabled', ''); ok.setAttribute('data-tip', disabledReason)
  } else ok.addEventListener('click', onOk)
  return [cancel, ok]
}

/** 新建家（T8 #121 ＋ T10 #124）：家＝工作区的镜像 ⇒ 建家**永远**是「选目录 → DSH 建工作区 → 家永久绑定」。
 * 没有第二条支路：任何工作区缺家都由种子自动补同名家（`seedGap`），所以不需要「复用已有工作区」。 */
export function newHomePop(anchor: AnchorRef, deps: FormDeps): void {
  let pickedDir = ''
  let busy = false, err = ''

  function ok(): void {
    if (busy || !pickedDir) { fLog('create-home', false, busy ? '正在建工作区' : '没选目录'); return }
    busy = true; err = ''; open()
    runDirCreate(pickedDir, {
      adoptDirectory: deps.ops.adoptDirectory,
      createHome: deps.ops.createHome,
      homes: () => deps.view.homes,
      onError: (m) => { busy = false; err = m; if (homePopOpen()) open() },
      onDone: (workspaceId) => { closeHomePop(true); deps.onDone('L2', '', workspaceId) },
    })
  }

  /* 选完目录只就地换内容（updateHomePop）：每次重建弹层都要重定位，锚点一被面板重渲染换掉就跳位（#112 真机实证）。 */
  let opened = false
  function open(): void {
    const body = [
      field('目录', dirField(pickedDir, () => deps.ops.pickDirectory(), (d) => { pickedDir = d; err = ''; open() }, err), 'div'),
      h('p', { className: 'hu-fhint' }, '选中的目录会建成 DSH 工作区，家绑在它上面，名字默认跟它一样。'),
    ]
    const tip = busy ? '正在建工作区，请稍候' : '先选一个目录'
    const opts = {
      width: 330, label: '新建家', above: true,
      title: h('div', { className: 'hu-ptitle' }, huIcon('plus', 15), '新建家'),
      body, foot: footBtns(ok, pickedDir && !busy ? undefined : tip),
    }
    if (opened) { updateHomePop(opts); return }
    opened = true
    openHomePop(anchor, opts)
  }

  open()
}

/** 新建助理（原型 newAsstPop + T6a 验收② + T6b #114 未绑定占位）：选家 + 选空闲机器人（或以后再绑）+ 可选名字。
 *  `lockHome` 为真且家还在时，「属于哪个家」退化成归属告知（无候选可点）——家内点的「新建助理」一定归当前家。 */
export function newAsstPop(anchor: AnchorRef, deps: FormDeps): void {
  const homes: Home[] = deps.view.homes.filter((x) => !x.tombstone)
  const bots: BotSnap[] = freeBots(deps.view.bots.map((b) => ({ channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName })), deps.view.assistants)
    .map((r) => deps.view.bots.find((b) => b.botId === r.botId && b.channel === r.channel))
    .filter((b): b is BotSnap => !!b)
  let homeId = deps.selHome && homes.some((x) => x.id === deps.selHome) ? deps.selHome : (homes[0]?.id ?? '')
  const locked = deps.lockHome ? homes.find((x) => x.id === homeId) ?? null : null
  const lockedName = locked ? homeName(deps.view, locked) : ''
  let botId = bots.length ? bots[0].botId : ''
  /* #138 渠道诚实性：这里原本会替用户编一个渠道（有空闲机器人就抄第一个，没有就写死 feishu）——
   * 未绑定的助理**没有渠道**，不许在磁盘上留一个猜测值。 */
  const nameInput = h('input', { type: 'text', placeholder: '留空用默认名', 'aria-label': '助理名字' }) as HTMLInputElement
  const body = [
    locked
      ? field('属于哪个家', h('div', { className: 'hu-locked' },
        avatarEl(locked.id, lockedName, locked.avatar),
        h('span', { className: 'hu-ot' }, h('b', {}, lockedName), h('small', {}, locked.path || '未关联工作区'))), 'div')
      : field('属于哪个家', homes.length
        ? optList(homes.map((x) => ({ value: x.id, title: homeName(deps.view, x), sub: x.path || '未关联工作区' })), homeId, (v) => { homeId = v })
        : h('p', { className: 'hu-fhint' }, '还没有家：先回上一层建一个家。')),
    field('绑定机器人', bots.length
      ? optList([
        { value: '', title: '以后再绑', sub: '先不选，之后在助理里再绑' },
        ...bots.map((b) => ({ value: b.botId, title: b.botName || b.botId, subNode: botSubNode(b.channel, b.connected) })),
      ], botId, (v) => { botId = v })
      : optList([{ value: '', title: '以后再绑', sub: '先不选，之后在助理里再绑' }], '', (v) => { botId = v })),
    field('名字', nameInput),
    h('p', { className: 'hu-fhint' }, '名字可以留空：绑了机器人就用机器人名，没绑就用家名。'),
  ]
  const ok = (): void => {
    if (!homeId) { fLog('create-assistant', false, '没有家可选'); return }
    const userName = (nameInput as HTMLInputElement).value.trim()
    closeHomePop(true)
    if (!botId) {
      void deps.ops.createUnbound(homeId, userName).then(() => deps.onDone('L3', homeId))
      return
    }
    const bot = bots.find((b) => b.botId === botId)
    if (!bot) { fLog('create-assistant', false, '没选到机器人：' + botId); return }
    void deps.ops.createAssistant(homeId, bot.channel, bot.botId, userName || undefined).then(() => deps.onDone('L3', homeId))
  }
  openHomePop(anchor, {
    width: 340, label: '新建助理', above: true,
    title: h('div', { className: 'hu-ptitle' }, huIcon('plus', 15), '新建助理'),
    body, foot: footBtns(ok, homeId ? undefined : '还没有家：先回上一层建一个家'),
  })
}

export type { Assistant }

export interface EditDeps {
  view: RowView
  ops: FormOps
  onDone: () => void
}

/** 配图行（2026-10-18）：第 1 格照片入口＋9 预置（avatar "1".."9"，实色）＝10 格 5×2；默认派生格退场（仅兼容旧 null）。
 *  返回 `{row, clear}` 两件：色板行由调用方塞进「头像」字段，`clear`（有图时才有）单摆在色板行下面。
 *  `onCommitted` 在图片真落盘后回调——图片**点了就落**（不攒进「确定」的补丁），故调用方应关弹层并重读。 */
export function avatarRow(
  name: string, id: string, kind: 'home' | 'assistant', current: string | null,
  onPick: (v: string | null) => void, onCommitted: () => void,
): { row: HTMLElement; clear: HTMLElement | null } {
  const wrap = h('div', { className: 'hu-avrow' })
  const img = avatarImageCell({ id, kind, current, onCommitted })
  wrap.appendChild(img.cell)
  const opts: Array<string> = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  opts.forEach((v) => {
    const b = h('button', {
      type: 'button', className: 'hu-avopt', 'aria-selected': v === (current ?? '') ? 'true' : 'false',
      style: avatarStyle(id + v, v), 'aria-label': '头像' + v, 'data-avatar': v,
    }, initialsOf(name))
    b.addEventListener('click', () => {
      const all = wrap.querySelectorAll('.hu-avopt')
      for (let i = 0; i < all.length; i += 1) all[i].setAttribute('aria-selected', 'false')
      b.setAttribute('aria-selected', 'true')
      onPick(v)
    })
    wrap.appendChild(b)
  })
  return { row: wrap, clear: img.clear }
}

/** 家设置：改名＋配图＋恢复默认（T6b 验收①②）。 */
export function renameHomePop(anchor: AnchorRef, deps: EditDeps & { homeId: string }): void {
  const home = deps.view.homes.find((x) => x.id === deps.homeId)
  if (!home) return
  const cur = home.nameSource === 'user' ? home.name : ''
  const input = h('input', { type: 'text', placeholder: homeName(deps.view, home), 'aria-label': '家名字' }) as HTMLInputElement
  input.value = cur
  let avatar: string | null = home.avatar ?? null
  const av = avatarRow(homeName(deps.view, home), home.id, 'home', avatar, (v) => { avatar = v }, () => { closeHomePop(true); deps.onDone() })
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
    if (!Object.keys(patch).length) { fLog('noop', false, '没有改动，设置弹层直接关'); return }
    void deps.ops.updateHome(home.id, patch).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '家设置',
    title: h('div', { className: 'hu-ptitle' }, huIcon('pencil', 15), '家设置'),
    body: [field('名字', input), reset, field('头像', av.row, 'div'), ...(av.clear ? [av.clear] : [])],
    foot: footBtns(ok, undefined, '保存'),
  })
}

/** 更换头像（owner 2026-10-17）：**只管头像**——行上的头像按钮与点头像本身都走它，不带名字字段。
 *  图片格点了就落（见 avatarRow 注释），预设色攒进「保存」；两者都与家设置弹层同源。 */
export function avatarHomePop(anchor: AnchorRef, deps: EditDeps & { homeId: string }): void {
  const home = deps.view.homes.find((x) => x.id === deps.homeId)
  if (!home) return
  let avatar: string | null = home.avatar ?? null
  const av = avatarRow(homeName(deps.view, home), home.id, 'home', avatar, (v) => { avatar = v }, () => { closeHomePop(true); deps.onDone() })
  const ok = (): void => {
    closeHomePop(true)
    if (avatar === (home.avatar ?? null)) { fLog('noop', false, '头像没变，换头像弹层直接关'); return }
    void deps.ops.updateHome(home.id, { avatar }).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 320, label: '更换头像', above: true,
    title: h('div', { className: 'hu-ptitle' }, huIcon('image', 15), '更换头像'),
    body: [field('头像', av.row, 'div'), ...(av.clear ? [av.clear] : [])],
    foot: footBtns(ok, undefined, '保存'),
  })
}

/** 助理设置：改名＋配图＋恢复默认＋删除助理（只删行不断连，验收④）。 */
export function renameAsstPop(anchor: AnchorRef, deps: EditDeps & { asstId: string }): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) return
  const cur = a.nameSource === 'user' ? a.name : ''
  const input = h('input', { type: 'text', placeholder: asstName(deps.view, a), 'aria-label': '助理名字' }) as HTMLInputElement
  input.value = cur
  let avatar: string | null = a.avatar ?? null
  const av = avatarRow(asstName(deps.view, a), a.id, 'assistant', avatar, (v) => { avatar = v }, () => { closeHomePop(true); deps.onDone() })
  const reset = h('button', { className: 'hu-plink', type: 'button' }, '恢复默认名（跟随机器人/家）')
  reset.addEventListener('click', () => {
    closeHomePop(true)
    void deps.ops.updateAssistant(a.id, { name: '' }).then(deps.onDone)
  })
  const del = h('button', { className: 'hu-plink danger', type: 'button' }, '删除助理（不断开机器人连接）')
  let armed = false
  del.addEventListener('click', () => {
    if (!armed) { armed = true; del.textContent = '再点一次确认删除'; fLog('delete-assistant', true, '第一次点击，等二次确认'); return }
    closeHomePop(true)
    void deps.ops.removeAssistant(a.id).then(deps.onDone)
  })
  const ok = (): void => {
    const patch: { name?: string | null; avatar?: string | null } = {}
    if (input.value.trim() !== cur) patch.name = input.value.trim()
    if (avatar !== (a.avatar ?? null)) patch.avatar = avatar
    closeHomePop(true)
    if (!Object.keys(patch).length) { fLog('noop', false, '没有改动，设置弹层直接关'); return }
    void deps.ops.updateAssistant(a.id, patch).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '助理设置',
    title: h('div', { className: 'hu-ptitle' }, huIcon('pencil', 15), '助理设置'),
    body: [field('名字', input), reset, field('头像', av.row, 'div'), ...(av.clear ? [av.clear] : []), del],
    foot: footBtns(ok, undefined, '保存'),
  })
}

/** 占位绑定已搬 `home-bind-forms.ts`（本文件曾 293 行顶格）：调用方改从新文件 import，本文件不留重导出（避运行时循环）。 */
