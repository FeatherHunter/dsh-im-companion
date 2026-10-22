/** 助理资料编辑弹窗（T8-4 #172）：只含「简介 / 人物设定」两栏的小弹窗。
 *
 * 两条入口共用同一张窗：L2 助理行第 4 个图标（profile-a），以及详情面板（#173）派发的
 * OPEN_ASSIST_EDIT_EVENT（监听在 home-assist-edit-listen.ts，panel-body 接线）。窗口本体留在本文件，
 * panel-body 只留一行 act 分支 ＋ 一行订阅，守它的 300 行红线。
 *
 * 保存四分支照规格 #168：校验不过 ⇒ 弹窗不动；归一后没改 ⇒ 关窗且**零写请求**；成功 ⇒ **先关窗**
 * 再 toast「已保存助理资料」再 onDone；失败／8s 超时 ⇒ 留窗、保留输入、宿主错误原文落 role=alert 行。
 * 写请求一律 quiet=true 且自带 onError：home-ops 的兜底 toast 会让失败弹两条互相矛盾的提示（补丁 A6）。
 * 清空语义：某字段被清空 ⇒ 载荷**显式发 `''`**（宿主把它当「删掉这个键」，与缺失同形；规格 #168
 * 「空串与缺失等价」＋ #176 负向验收 D「清空人设后不再注入」都靠这条）；只有「归一后完全没变」才 noop。 */
import { h } from '../dom'
import { ASSISTANT_FIELDS, normalizeFieldText, type AssistantFieldsValue } from '../../assistant-fields'
import { logLine, logOn } from '../log'
import { asstFieldsUi } from './home-asst-fields'
import { footBtns, type EditDeps } from './home-forms'
import { huIcon } from './home-icons'
import { closeHomePop, openHomePop, type AnchorRef } from './home-pop'
import { boxOf, homeToast } from './home-toast'
import type { RowView } from './home-rows'

/** 桥自带的超时（8s，规格钉死）＋两条兜底文案：超时、失败但宿主没给原因。 */
const SAVE_TIMEOUT_MS = 8000
const TIMEOUT_TEXT = '保存超时，请稍后重试'
const FALLBACK_TEXT = '保存失败，请稍后重试'
/** 失败文案里出现这些词＝连接层 abort/timeout 的原文 ⇒ 统一换成规格文案。 */
const TIMEOUT_RE = /timeout|timed out|abort|超时/i

const pLog = (action: string, ok: boolean, message: string): void => { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel.body', action, ok, message }) }
const alive = (el: HTMLElement): boolean => (typeof el.isConnected === 'boolean' ? el.isConnected : !!el.parentNode)
const first = (root: HTMLElement, sel: string): HTMLElement | null => (root.querySelectorAll(sel) as unknown as HTMLElement[])[0] ?? null

/** 弹层锚点一律现取（T7 #112 纪律）：点击入口用还活着的原按钮；事件入口没有按钮 ⇒ 按助理行找
 *  第 4 图标 → L3 的「改名与头像」→ 底部主按钮；全找不到时 openHomePop 自己收窗（绝不兜底跳位）。 */
export function profileAnchor(bodyEl: HTMLElement, id: string, btn: HTMLElement | null): AnchorRef {
  return () => {
    if (btn && alive(btn)) return btn
    for (const row of Array.from(bodyEl.querySelectorAll('[data-id="' + id + '"]') as unknown as HTMLElement[])) {
      const hit = first(row, '[data-item-act="profile-a"]') ?? first(row, '[data-item-act="settings-a"]')
      if (hit) return hit
    }
    return first(bodyEl, '.hu-pbtn')
  }
}

export interface ProfileDeps { view: RowView; ops: EditDeps['ops']; onDone: () => void; bodyEl: HTMLElement }

/** 两条入口共用的开窗口：助理不在表里就只记一条失败日志（与面板其它动作同口径），绝不开空窗。 */
export function profileAsstOpen(deps: ProfileDeps, id: string, btn: HTMLElement | null, opts?: { timeoutMs?: number }): void {
  if (!deps.view.assistants.some((x) => x.id === id)) {
    logLine('info', 'assistant.action', { action: 'update', assistantId: id, ok: false, message: '助理不在表里（可能刚被删），编辑资料弹层不开' })
    return
  }
  profileAsstPop(profileAnchor(deps.bodyEl, id, btn), { view: deps.view, ops: deps.ops, asstId: id, onDone: deps.onDone }, opts)
}

/** 打开编辑资料弹窗。opts.timeoutMs 只给验证用（真机走 8s），不改任何对外行为。 */
export function profileAsstPop(anchor: AnchorRef, deps: EditDeps & { asstId: string }, opts: { timeoutMs?: number } = {}): void {
  const a = deps.view.assistants.find((x) => x.id === deps.asstId)
  if (!a) return
  const asstId = a.id /* 收成 string：闭包（ok）里不再持有可空收窄，省得 TS 丢窄化 */
  const init: Required<AssistantFieldsValue> = { description: a.description ?? '', persona: a.persona ?? '' }
  const anchorEl = (): HTMLElement | null => (typeof anchor === 'function' ? anchor() : anchor)
  const errRow = h('div', { className: 'hu-err', role: 'alert' })
  const ui = asstFieldsUi(init, () => sync())
  const foot = footBtns(ok, undefined, '保存')
  const cancelBtn = foot[0] as HTMLButtonElement
  const saveBtn = foot[1] as HTMLButtonElement
  let busy = false

  /** 保存/取消的可用态只在这里改：校验不过 ⇒ 禁用＋把原因挂 data-tip；写请求在飞 ⇒ 双禁用。 */
  function sync(): void {
    const bad = ui.reason()
    saveBtn.textContent = busy ? '保存中…' : '保存'
    saveBtn.disabled = busy || bad !== undefined
    if (bad !== undefined) saveBtn.setAttribute('data-tip', bad); else saveBtn.removeAttribute('data-tip')
    cancelBtn.disabled = busy
  }

  /** 只带「变了的键」：归一后与打开时相同＝没改；**清空也要发**（`''`＝宿主删键，别省掉）。 */
  function diff(): AssistantFieldsValue {
    const next = ui.texts()
    const out: AssistantFieldsValue = {}
    for (const f of ASSISTANT_FIELDS) if (next[f] !== normalizeFieldText(init[f])) out[f] = next[f]
    return out
  }

  function fail(message: string): void {
    errRow.textContent = TIMEOUT_RE.test(message) ? TIMEOUT_TEXT : message
    sync()
  }

  function ok(): void {
    if (busy) return
    if (ui.invalid()) { pLog('profile-invalid', false, ui.reason() ?? ''); return }
    const patch = diff()
    if (Object.keys(patch).length === 0) {
      closeHomePop(true)
      pLog('profile-noop', true, '资料没变，编辑资料弹层直接关（零写请求）')
      return
    }
    busy = true
    errRow.textContent = ''
    sync()
    let hostMsg = ''
    const ms = opts.timeoutMs ?? SAVE_TIMEOUT_MS
    const save = Promise.resolve(deps.ops.updateAssistant(asstId, patch, true, (m) => { hostMsg = m })).then(
      (done: boolean) => ({ done, timeout: false, err: '' }),
      (e: unknown) => ({ done: false, timeout: false, err: String((e as Error)?.message ?? e) }),
    )
    let timer: ReturnType<typeof setTimeout> | null = null
    const guard = new Promise<{ done: boolean; timeout: boolean; err: string }>((res) => {
      timer = setTimeout(() => res({ done: false, timeout: true, err: '' }), ms)
    })
    void Promise.race([save, guard]).then((r) => {
      if (timer !== null) clearTimeout(timer)
      busy = false
      if (r.done) {
        const box = boxOf(anchorEl()) /* 先量锚点：关窗/列表重建后按钮可能已不在 */
        closeHomePop(true)
        homeToast('已保存助理资料', box)
        deps.onDone()
        return
      }
      fail(r.timeout ? TIMEOUT_TEXT : hostMsg || r.err || FALLBACK_TEXT)
    })
  }

  sync()
  openHomePop(anchor, {
    width: 380, above: true, label: '编辑助理资料',
    title: h('div', { className: 'hu-ptitle' }, huIcon('person', 15), '编辑助理资料'),
    body: [...ui.nodes, errRow],
    foot,
  })
}
