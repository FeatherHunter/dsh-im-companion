/** 助理绑定弹层（绑定/接入打通）：从 `home-forms.ts` 拆出——它 293 行顶格，加分支必超红线。
 *
 * 第一性原理：绑定＝挑现成的空闲机器人（`assistant.bind`），接入＝造新的（扫码/手动全链路 `connect-flow`）。
 * 旧死胡同：无空闲时弹层只剩一句「都绑满了」，主按钮却还是高亮可用态（点下去静默 return），
 * 且完整接入只留给已绑定助理——最需要接入的人够不到接入。本文件只补出口，不改非空主路。
 * 术语：绑定/接入不混用（CONTEXT.md 锁定词）；控件文字不带省略号。 */
import { h } from '../dom'
import type { BotSnap } from '../data/fleet-api'
import { freeBots } from '../data/home-model'
import type { RowView } from './home-rows'
import { huIcon } from './home-icons'
import { closeHomePop, openHomePop, type AnchorRef } from './home-pop'
import { botSubNode, field, footBtns, optList, type FormOps } from './home-forms'
import { logLine, logOn } from '../log'

/* 表单侧兜底（与 home-forms 同口径）：只 debug，不进恒落盘通道。 */
const fLog = (action: string, ok: boolean, message: string): void => { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'form', action, ok, message }) }

export interface BindDeps {
  view: RowView
  /** FormOps 绑助理＋ connect 进接入全链路（panel-body 传的 ops 本来就带 connect，这里点名要它）。
   * #141：connect 现在必须带**本助理的身份**与落定回执——只传家会让接入落成「无主机器人」，
   * 再被家表种子对账补成一条新助理（真机实证）。 */
  ops: FormOps & { connect(homeId: string, anchor: HTMLElement, assistantId?: string, after?: (ok: boolean) => void): void }
  asstId: string
  onDone: () => void
}

function resolveAnchor(ref: AnchorRef): HTMLElement | null {
  try {
    if (typeof ref === 'function') return (ref as () => HTMLElement | null)() ?? null
    return (ref as HTMLElement | null) ?? null
  } catch { return null }
}

/** 占位绑定：给未绑定助理认领一个空闲机器人（先 bot.workspace.set 再 assistant.bind）。
 * 有空闲＝原样单选（与拆分前一字不差）；无空闲＝禁用「绑定」＋「新机器人」主按钮，点它关弹进接入流程。
 * #141 订正：原 v1 取舍「不跨流程自动绑」已被真机证伪——接入必须带着**本助理身份**走完，
 * 由落定编排（`binding-commit.ts`）在 workspace.set 成功后补 `assistant.bind`；落定失败才回本弹层。
 * owner 2026-10-17：出口原来是 `.hu-plink` 文本链接（"不明显"）⇒ 升格为块级 accent 主按钮 `.hu-pbtn-s.cta`。 */
export function bindAsstPop(anchor: AnchorRef, deps: BindDeps): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) return
  const bots: BotSnap[] = freeBots(deps.view.bots.map((b) => ({ channel: b.channel, botId: b.botId, workspace: b.workspace, botName: b.botName })), deps.view.assistants)
    .map((r) => deps.view.bots.find((b) => b.botId === r.botId && b.channel === r.channel))
    .filter((b): b is BotSnap => !!b)
  if (!bots.length) {
    /* 块级主按钮（不是文本链接）：这里是空态下唯一可走的动作 ⇒ 视觉权重必须压过被禁用的「绑定」。
     * 类名 `.cta` 自带 hover 抬起 / active 按下（见 home-row-styles.ts），反馈不靠浏览器默认。
     * owner 2026-10-17：文案「接入新机器人」→「新机器人」，图标由链条（link）改成**加号**——一眼看出
     * 这一步会**新增**一个机器人，而不是把现有东西连起来。 */
    const go = h('button', { className: 'hu-pbtn-s cta', type: 'button', 'data-act': 'to-connect' },
      huIcon('plus', 14), '新机器人')
    go.addEventListener('click', () => {
      const home = deps.view.homes.find((x) => x.id === a.homeId)
      const el = resolveAnchor(anchor)
      fLog('bind-assistant', true, '空态转新建：给「' + (home?.path ?? a.homeId) + '」新增机器人')
      closeHomePop(true)
      if (!home || !el) { fLog('bind-assistant', false, '家或锚点不在了，接入不开'); return }
      deps.ops.connect(home.id, el, a.id, (ok) => {
        /* #141 C：落定没成功（失败/被拒）⇒ 把用户送回**同一个助理**的绑定面：新机器人此刻已在空闲池，
         * 弹层默认首选就是它；成功则由 A 在落定编排里直接绑上 a，这里不再弹（免得给已绑助理开绑定弹层）。
         * 锚点用函数式（同 config-pop 手法）——刷新会把原按钮换掉，重开时现判连接性，取不到就不弹；
         * 记忆只在内存里（禁 localStorage）。 */
        if (ok) return
        fLog('bind-assistant', true, '接入未落定，回同助理的绑定面：' + a.id)
        bindAsstPop(() => {
          const on = typeof el.isConnected === 'boolean' ? el.isConnected : !!el.parentNode
          return on ? el : null
        }, deps)
      })
    })
    openHomePop(anchor, {
      width: 330, label: '绑定机器人', above: true,
      title: h('div', { className: 'hu-ptitle' }, huIcon('link', 15), '绑定机器人'),
      body: [
        field('选择机器人', h('p', { className: 'hu-fhint' }, '每个机器人只能绑一位助理，现在都绑满了。'), 'div'),
        go,
      ],
      foot: footBtns(() => { fLog('bind-assistant', false, '没选机器人') }, '没有空闲机器人，先新建一个', '绑定'),
    })
    return
  }
  let botId = bots.length ? bots[0].botId : ''
  const body = [
    field('选择机器人', optList(bots.map((b) => ({ value: b.botId, title: b.botName || b.botId, subNode: botSubNode(b.channel, b.connected) })), botId, (v) => { botId = v }), 'div'),
  ]
  const ok = (): void => {
    if (!botId) { fLog('bind-assistant', false, '没选机器人'); return }
    const bot = bots.find((b) => b.botId === botId)
    if (!bot) { fLog('bind-assistant', false, '没选到机器人：' + botId); return }
    closeHomePop(true)
    void deps.ops.bindAssistant(a.id, bot.channel, bot.botId).then(deps.onDone)
  }
  openHomePop(anchor, {
    width: 330, label: '绑定机器人', above: true,
    title: h('div', { className: 'hu-ptitle' }, huIcon('link', 15), '绑定机器人'),
    body, foot: footBtns(ok, undefined, '绑定'),
  })
}
