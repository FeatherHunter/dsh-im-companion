/** 新建助理弹层（T8-3 #171：从 `home-forms.ts` 搬出——那边 299 行顶格，再嵌两栏必超红线）。
 *
 * 搬移纪律：**先一字不改地纯搬、单独跑一遍 verify**，绿了再动功能——红了立刻能分出「搬坏了」还是「改坏了」。
 * 控件原语（`field`/`optList`/`footBtns`/`botSubNode`）仍住在 home-forms：本文件只是它们的调用方，
 * 与 `home-bind-forms.ts` 同一条先例（拆出去的文件从老文件 import 原语，不复制第二份）。 */
import { h } from '../dom'
import { freeBots, type Home } from '../data/home-model'
import type { BotSnap } from '../data/fleet-api'
import { huIcon } from './home-icons'
import { closeHomePop, openHomePop, type AnchorRef } from './home-pop'
import { homeName } from './home-rows'
import { avatarEl } from './home-avatar-view'
import { botSubNode, field, footBtns, optList, type FormDeps } from './home-forms'
import { asstFieldsUi } from './home-asst-fields'
import { logLine, logOn } from '../log'

/* 表单侧兜底（与 home-forms / home-bind-forms 同口径）：只 debug，不进恒落盘通道。 */
const fLog = (action: string, ok: boolean, message: string): void => { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'form', action, ok, message }) }

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
  /* T8-3 #171：两栏内嵌在名字之后（可跳过，随创建一次性写入）。变更回调只切主按钮，不重建弹层。 */
  const fieldsUi = asstFieldsUi(undefined, () => syncFoot())
  const body = [
    locked
      ? field('属于哪个家', h('div', { className: 'hu-locked' },
        avatarEl(locked.id, lockedName, locked.avatar, { kind: 'home' }),
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
    ...fieldsUi.nodes,
  ]
  const ok = (): void => {
    if (!homeId) { fLog('create-assistant', false, '没有家可选'); return }
    /* 再判一次：disabled 挡不住程序化点击／回车（"禁用只是装饰"那条坑）。 */
    const blocked = fieldsUi.reason()
    if (blocked) { fLog('create-assistant', false, blocked); return }
    const fields = fieldsUi.values()
    const userName = (nameInput as HTMLInputElement).value.trim()
    closeHomePop(true)
    if (!botId) {
      void deps.ops.createUnbound(homeId, userName, fields).then(() => deps.onDone('L3', homeId))
      return
    }
    const bot = bots.find((b) => b.botId === botId)
    if (!bot) { fLog('create-assistant', false, '没选到机器人：' + botId); return }
    void deps.ops.createAssistant(homeId, bot.channel, bot.botId, userName || undefined, fields).then(() => deps.onDone('L3', homeId))
  }
  const baseTip = (): string | undefined => (homeId ? undefined : '还没有家：先回上一层建一个家')
  const foot = footBtns(ok, baseTip())
  const okBtn = foot[1] as HTMLButtonElement
  /* 两栏超限 ⇒ 沿用 data-tip 形态禁用主按钮（不弹 alert、不静默截断）；改回合法立即复原。 */
  function syncFoot(): void {
    const reason = baseTip() ?? fieldsUi.reason()
    if (reason) { okBtn.disabled = true; okBtn.setAttribute('disabled', ''); okBtn.setAttribute('data-tip', reason); return }
    okBtn.disabled = false
    okBtn.removeAttribute('disabled')
    okBtn.removeAttribute('data-tip')
  }
  syncFoot()
  /* 宽度 340→380：两栏进来后 340 会把 textarea 挤成窄条（规格 #168「弹窗宽度微调」）。 */
  openHomePop(anchor, {
    width: 380, label: '新建助理', above: true,
    title: h('div', { className: 'hu-ptitle' }, huIcon('plus', 15), '新建助理'),
    body, foot,
  })
}
