/** 双模式编排（T4 新建 · 向导步骤式 T3-A）：二选一 + 单支持直达 + 来回切。
 * connect-flow 只传钩子（begin/取消/计时/attempt 存取），本模块 own 选择页与手动页的挂载；
 * QR 渲染/轮询原样留在 connect-flow（renderQr 仅追加一个“手动填写”分支按钮）。
 * 取消语义（T2）：未 submitted 切走才 `provision.cancel`；submitted 快照后切页不 cancel（保留此次尝试）；
 * 手动页永不调 `provision.*`（取消=本地关窗 + 中止在途绑定请求）；内存 secret 切页/关窗即清（manual-form 内）。 */
import { h, mount } from '../dom'
import { makeButton } from '../ui/button'
import { toast } from '../ui/toast'
import { fetchChannelStatus } from '../data/fleet-api'
import type { RpcCall } from '../data/fleet-api'
import type { ModalHandle } from '../ui/modal'
import { showMenu, type MenuItem } from '../ui/menu'
import { getChannelMode } from '../data/dual-mode-capabilities'
import type { DualModeCopy } from './dual-mode-copy'
import { renderManualForm } from './manual-form'
import type { ConnectTarget } from './connect-flow'

export interface DualCtx {
  channel: string
  label: string
  target: ConnectTarget
  rpc: RpcCall
  body: HTMLElement
  modal: ModalHandle
  copy: DualModeCopy
  baseline: ReadonlySet<string>
  onDone: () => void
  anchor: HTMLElement
  menuItems: MenuItem[]
  commitManual: (botId: string) => Promise<void>
}

export interface DualQrHooks {
  begin: () => void
  cancelAttempt: (id: string | undefined) => Promise<void>
  stopTimers: () => void
  getAttemptId: () => string | undefined
  setAttemptId: (id: string | undefined) => void
  setQrSwitch: (fn: (() => void) | null) => void
  refreshBaseline: () => Promise<void>
}

/** 同步挂载（provision 未启动时调用，无取消语义）；调用后 run() 直接返回，后续导航走内部闭包。 */
export function enterDualMode(ctx: DualCtx, qr: DualQrHooks): void {
  const mode = getChannelMode(ctx.channel)
  if (mode === 'manual-only') {
    showManual(null)
    return
  }
  showChoice()

  function showChoice(): void {
    qr.setQrSwitch(null)
    const toQr = makeButton({
      kind: 'primary', label: ctx.copy.choiceQr,
      onClick: () => {
        qr.setQrSwitch(() => void switchToManual())
        qr.begin()
      },
    })
    const toManual = makeButton({
      label: ctx.copy.choiceManual,
      onClick: () => showManual(() => showChoice()),
    })
    const cancel = makeButton({
      kind: 'ghost', label: '取消',
      onClick: () => ctx.modal.close(),
    })
    mount(ctx.body, [
      h('div', { className: 'dm-title' }, ctx.copy.choiceTitle),
      h('div', { className: 'dm-choice' }, toQr, toManual),
      h('div', { className: 'af-modal-foot' }, cancel),
    ])
  }

  function showManual(backToChoice: (() => void) | null): void {
    qr.setQrSwitch(null)
    let cleanup: (() => void) | null = null
    const dispose = (): void => {
      try { cleanup?.() } catch { /* 忽略 */ }
      cleanup = null
    }
    const onBack = backToChoice
      ? () => { dispose(); showChoice() }
      : () => {
        dispose()
        try { ctx.modal.close() } catch { /* 忽略 */ }
        showMenu(ctx.anchor, ctx.menuItems)
      }
    cleanup = renderManualForm(ctx.body, {
      channel: ctx.channel,
      label: ctx.label,
      rpc: ctx.rpc,
      toast,
      copy: ctx.copy,
      baseline: ctx.baseline,
      commit: (botId) => ctx.commitManual(botId),
      onCancel: () => {
        dispose()
        ctx.modal.close()
      },
      onBack,
    })
  }

  async function switchToManual(): Promise<void> {
    /* QR→手动：已提交保留此次尝试（不 cancel），未提交才取消；随后本地挂 manual（永不调 provision.*）。
     * 先刷新基线：已提交尝试若已产出机器人，手动认领时不与其混淆（多 fresh 则如实报未识别）。 */
    let submitted = false
    try {
      const st = await fetchChannelStatus(ctx.rpc, ctx.channel)
      submitted = st.provisioning?.submitted === true
    } catch {
      submitted = false
    }
    await qr.refreshBaseline()
    qr.stopTimers()
    const id = qr.getAttemptId()
    qr.setAttemptId(undefined)
    qr.setQrSwitch(null)
    if (!submitted && id) await qr.cancelAttempt(id)
    showManual(() => void switchToQr())
  }

  async function switchToQr(): Promise<void> {
    await qr.refreshBaseline()
    qr.setQrSwitch(() => void switchToManual())
    qr.begin()
  }
}
