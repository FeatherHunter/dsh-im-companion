/** 接入流程：渠道菜单 → provision.begin 二维码（倒计时/轮询）→ 新机器人就绪 → workspace.set 绑定。
 * #29 修复：begin 先清上一轮（曾误取消本轮致秒失效）；poll 单链（曾指数增殖）；
 * 倒计时 ceil+引用直写+变更才刷（曾 round+全局 query 致闪烁漂移）；关闭即停即取消。 */
import { h, mount } from '../dom'
import { icon } from '../icons'
import { showMenu, type MenuItem } from '../ui/menu'
import { showModal, type ModalHandle } from '../ui/modal'
import { makeButton, type BtnKind } from '../ui/button'
import { toast } from '../ui/toast'
import { CHANNEL_ORDER, channelLabel } from '../data/config'
import { fetchChannelStatus, fmtCountdown, normalizeProvisionTiming, resolveNewBotId, type ProvisionState, type RpcCall } from '../data/fleet-api'
import { firstViewCopy } from './first-view-copy'
import { commitBinding } from '../data/binding-commit'
import { getChannelMode } from '../data/dual-mode-capabilities'
import { dualModeCopy } from './dual-mode-copy'
import { ensureDualModeStyles } from './dual-mode-styles'
import { enterDualMode } from './dual-mode-flow'

export { commitBinding }
export type { BindingCommit } from '../data/binding-commit'
/* 落定编排已搬 ../data/binding-commit（登记竞态 workspace-bot-not-found 重试＋removeLocal＋createMetaStore 同效，重导出保兼容）。 */

export interface ConnectTarget {
  name: string
  workspace: string
}

function safeQrSrc(value: string | undefined): string | null {
  if (!value) return null
  return /^data:image\/(?:png|webp|svg\+xml)(?:;charset=[^;,]+)?;base64,/i.test(value) ? value : null
}

export function openConnectFlow(ctx: unknown, rpc: RpcCall | null, anchor: HTMLElement, target: ConnectTarget, onDone: () => void): void {
  void ctx
  /* #62 纵深守卫：无家不进扫码（主防线在行按钮置灰＋动作层阻断；此处兜住直调）。 */
  if (!target.workspace) {
    toast(firstViewCopy().needHomeForConnect(target.name))
    try { onDone() } catch { /* 刷新兜底失败则静默（已如实报错） */ }
    return
  }
  if (!rpc) {
    toast('host 桥不可用，无法发起接入')
    return
  }
  const items: MenuItem[] = CHANNEL_ORDER.map((ch) => ({
    label: '接入 ' + channelLabel(ch),
    iconName: 'external' as const,
    onSelect: () => void run(ch),
  }))
  showMenu(anchor, items)

  async function run(channel: string): Promise<void> {
    const label = channelLabel(channel)
    const title = h('h3', { className: 'af-modal-title' }, '接入渠道')
    const sub = h('div', { className: 'af-modal-sub' }, '为「' + target.name + '」创建 ' + label + ' 机器人')
    const body = h('div', { className: 'af-qr' })

    const timers: ReturnType<typeof setInterval>[] = []
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    const baseline = new Set<string>()
    let attemptId: string | undefined
    let finished = false

    const stopTimers = () => {
      for (const t of timers) clearInterval(t)
      timers.length = 0
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer)
        pollTimer = undefined
      }
    }
    const call = (endpoint: string, payload: Record<string, unknown>) =>
      rpc!('/' + channel, endpoint, payload, AbortSignal.timeout(8000))
    const cancelAttempt = (id: string | undefined): Promise<void> => {
      if (!id) return Promise.resolve()
      return call('provision.cancel', { attemptId: id }).then(() => {}).catch(() => {})
    }
    /** 用户关闭（右上 X / Escape / 点遮罩 / 取消按钮）：停一切计时，不再建新轮，并取消本轮。 */
    const handleClose = () => {
      if (finished) return
      finished = true
      stopTimers()
      const id = attemptId
      attemptId = undefined
      if (id) void cancelAttempt(id)
    }
    const modal: ModalHandle = showModal([title, sub, body], { onClose: handleClose })
    /* T4 双模式：文案 + 模式 + QR 页切手动钩子（renderQr 仅追加一个分支按钮，既有不动）。 */
    const dmCopy = dualModeCopy()
    const dmMode = getChannelMode(channel)
    let qrSwitch: (() => void) | null = null

    async function begin(): Promise<void> {
      stopTimers()
      const prev = attemptId
      attemptId = undefined
      if (prev) await cancelAttempt(prev)
      mount(body, [
        h('div', { className: 'af-loading-row' }, h('span', { className: 'af-spin' }), '正在生成授权二维码…'),
      ])
      try {
        const raw = await call('provision.begin', { locale: 'zh-CN' })
        const res = raw as { ok: boolean; value?: ProvisionState; error?: { message?: string } }
        if (!res.ok || !res.value) throw new Error(res.error?.message ?? 'provision.begin 失败')
        if (finished) return
        attemptId = res.value.attemptId
        renderQr(res.value)
        void poll()
      } catch (e) {
        if (!finished) renderError(String((e as Error)?.message ?? e))
      }
    }

    function startTicking(timerEl: HTMLElement, barEl: HTMLElement, expiresAt: number, duration: number): void {
      const paint = (): boolean => {
        if (!timerEl.isConnected) return false
        const remaining = expiresAt - Date.now()
        const text = '二维码有效时间 ' + fmtCountdown(remaining) + (remaining <= 0 ? '（已失效）' : '')
        if (timerEl.textContent !== text) timerEl.textContent = text
        const width = Math.round(Math.max(0, Math.min(1, remaining / duration)) * 100) + '%'
        if (barEl.style.width !== width) barEl.style.width = width
        return remaining > 0
      }
      if (!paint()) return
      const id = setInterval(() => {
        if (!paint()) clearInterval(id)
      }, 500)
      timers.push(id)
    }

    async function poll(): Promise<void> {
      if (finished) return
      try {
        const st = await fetchChannelStatus(rpc!, channel)
        if (finished) return
        const botId = resolveNewBotId(st.bots, baselineOk ? baseline : null, st.provisioning?.botId)
        if (botId) {
          return void succeed(botId)
        }
        if (st.provisioning?.submitted === true && !st.bots.some((b) => b.botId === (st.provisioning?.botId ?? ''))) {
          /* 已扫码提交，等待机器人出现 */
        }
      } catch {
        /* 轮询失败忽略 */
      }
      if (!finished) {
        if (pollTimer !== undefined) clearTimeout(pollTimer)
        pollTimer = setTimeout(() => void poll(), 3000)
      }
    }

    async function succeed(botId: string): Promise<void> {
      if (finished) return
      finished = true
      stopTimers()
      attemptId = undefined
      /* #62：创建即带家，扫码成功直绑；旧“扫码后再弹可取消选家窗”分叉已删（无家连扫码都进不来）。 */
      if (!target.workspace) {
        modal.close()
        toast(firstViewCopy().needHomeForConnect(target.name))
        try { onDone() } catch { /* 刷新兜底失败则静默（已如实报错） */ }
        return
      }
      /* T2 去双 toast：成功只留终态“已接入并绑定工作区”（commitBinding 内），此处不再单独报就绪。 */
      try {
        modal.close()
        await commitBinding({ rpc: rpc!, channel, toast, onDone, botId, ws: target.workspace, prevWorkspace: target.workspace, agentName: target.name })
      } catch (e) {
        toast('绑定工作区失败：' + String((e as Error)?.message ?? e))
        try { onDone() } catch { /* 刷新兜底失败则静默（已如实报错） */ }
      }
    }

    function renderQr(prov: ProvisionState): void {
      const { expiresAt, durationMs } = normalizeProvisionTiming(prov)
      const src = safeQrSrc(prov.qrCodeDataUrl)
      const frame = h('div', { className: 'af-qr-frame' },
        src
          ? h('img', { src, alt: '授权二维码' })
          : h('div', { className: 'fallback' }, '二维码未就绪'),
      )
      const timerEl = h('div', { className: 'af-qr-timer' }, '二维码有效时间 ' + fmtCountdown(expiresAt - Date.now()))
      const barEl = h('span')
      barEl.style.width = Math.round(Math.max(0, Math.min(1, (expiresAt - Date.now()) / durationMs)) * 100) + '%'
      const actions: HTMLElement[] = [
        makeButton({ kind: 'ghost', label: '换一个二维码', onClick: () => void begin() }),
        makeButton({ kind: 'ghost', label: '取消', onClick: () => { handleClose(); modal.close() } }),
      ]
      /* T4 加分支：双支持 QR 页经独立返回行切手动（底栏既有 3 按钮不动，防挤换行）。 */
      const switchRow = qrSwitch
        ? h('div', { className: 'dm-backrow' }, makeButton({ kind: 'ghost', size: 'sm', label: dmCopy.choiceManual, onClick: () => qrSwitch?.() }))
        : null
      const verif = prov.verificationUrl && /^https?:/i.test(prov.verificationUrl)
        ? makeButton({ label: '在 ' + label + ' 中打开', iconName: 'external', onClick: () => { window.open(prov.verificationUrl!, '_blank', 'noopener') } })
        : null
      if (verif) actions.unshift(verif)
      mount(body, [
        frame,
        timerEl,
        h('div', { className: 'af-qr-progress' }, barEl),
        h('div', { className: 'af-qr-msg' }, '扫码只会新增一个机器人，已接入的机器人不受影响'),
        h('ol', { className: 'af-steps' },
          h('li', null, '打开 ' + label + ' 移动端扫一扫'),
          h('li', null, '核对应用名称与权限范围后确认创建'),
          h('li', null, '保持本页打开，等待新机器人长连接就绪'),
        ),
        switchRow,
        h('div', { className: 'af-modal-foot' }, ...actions),
      ])
      startTicking(timerEl, barEl, expiresAt, durationMs)
    }

    function renderError(message: string): void {
      mount(body, [
        h('div', { className: 'af-error' }, '接入失败：' + message),
        h('div', { className: 'af-modal-foot' },
          makeButton({ kind: 'ghost', label: '关闭', onClick: () => modal.close() }),
          makeButton({ kind: 'primary', label: '重试', onClick: () => void begin() }),
        ),
      ])
    }

    /* 基线：当前该渠道已存在的 botId（用于识别新机器人）；拉取失败按未知处理（只认 provision 上报，绝不差分认领）。 */
    let baselineOk = false
    const refreshBaseline = async (): Promise<void> => {
      try {
        const st = await fetchChannelStatus(rpc!, channel)
        for (const b of st.bots) baseline.add(b.botId)
        baselineOk = true
      } catch {
        /* 基线未知：识别退化为 provision 匹配 */
      }
    }
    await refreshBaseline()
    if (finished) return
    /* T4 双模式入口（provision 未启动，无取消语义）：单扫码走既有链路；其余进二选一/直达后 return。 */
    if (dmMode !== 'qr-only') {
      ensureDualModeStyles()
      enterDualMode({
        channel, label, target, rpc: rpc!, body, modal, copy: dmCopy, baseline, onDone,
        anchor, menuItems: items,
        commitManual: async (botId: string): Promise<void> => {
          if (finished) return
          finished = true
          stopTimers()
          attemptId = undefined
          try {
            modal.close()
            await commitBinding({ rpc: rpc!, channel, toast, onDone, botId, ws: target.workspace, prevWorkspace: target.workspace, agentName: target.name })
          } catch (e) {
            toast('绑定工作区失败：' + String((e as Error)?.message ?? e))
            try { onDone() } catch { /* 刷新兜底失败则静默（已如实报错） */ }
          }
        },
      }, {
        begin: () => void begin(),
        cancelAttempt, stopTimers,
        getAttemptId: () => attemptId,
        setAttemptId: (id) => { attemptId = id },
        setQrSwitch: (fn) => { qrSwitch = fn },
        refreshBaseline,
      })
      return
    }
    void begin()
  }
}
