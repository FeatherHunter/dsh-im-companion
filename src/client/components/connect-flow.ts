/** 接入流程：渠道菜单 → provision.begin 二维码（倒计时/轮询）→ 新机器人就绪 → workspace.set 绑定。 */
import { h, mount } from '../dom'
import { icon } from '../icons'
import { showMenu, type MenuItem } from '../ui/menu'
import { showModal, type ModalHandle } from '../ui/modal'
import { makeButton, type BtnKind } from '../ui/button'
import { toast } from '../ui/toast'
import { CHANNEL_ORDER, channelLabel } from '../data/config'
import { fetchChannelStatus, type ProvisionState, type RpcCall } from '../data/fleet-api'
import { openWorkspacePicker } from './workspace-picker'

export interface ConnectTarget {
  name: string
  workspace: string
}

function safeQrSrc(value: string | undefined): string | null {
  if (!value) return null
  return /^data:image\/(?:png|webp|svg\+xml)(?:;charset=[^;,]+)?;base64,/i.test(value) ? value : null
}

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return mm + ':' + ss
}

export function openConnectFlow(ctx: unknown, rpc: RpcCall | null, anchor: HTMLElement, target: ConnectTarget, onDone: () => void): void {
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
    const modal: ModalHandle = showModal([title, sub, body])

    const timers: ReturnType<typeof setInterval>[] = []
    const baseline = new Set<string>()
    let attemptId: string | undefined
    let finished = false

    const stopTimers = () => {
      for (const t of timers) clearInterval(t)
      timers.length = 0
    }
    const call = (endpoint: string, payload: Record<string, unknown>) =>
      rpc!('/' + channel, endpoint, payload, AbortSignal.timeout(8000))

    async function begin(): Promise<void> {
      stopTimers()
      mount(body, [
        h('div', { className: 'af-loading-row' }, h('span', { className: 'af-spin' }), '正在生成授权二维码…'),
      ])
      try {
        const raw = await call('provision.begin', { locale: 'zh-CN' })
        const res = raw as { ok: boolean; value?: ProvisionState; error?: { message?: string } }
        if (!res.ok || !res.value) throw new Error(res.error?.message ?? 'provision.begin 失败')
        attemptId = res.value.attemptId
        await attemptCleanupPrevious()
        renderQr(res.value)
        startTicking(res.value)
        void poll()
      } catch (e) {
        renderError(String((e as Error)?.message ?? e))
      }
    }

    async function attemptCleanupPrevious(): Promise<void> {
      if (!attemptId) return
      try {
        await call('provision.cancel', { attemptId })
      } catch {
        /* 忽略：begin 是权威 */
      }
    }

    function startTicking(prov: ProvisionState): void {
      const expiresAt = prov.expiresAt ?? Date.now() + 5 * 60_000
      const duration = prov.durationMs ?? Math.max(1, expiresAt - Date.now())
      timers.push(setInterval(() => {
        const remaining = expiresAt - Date.now()
        const timerEl = document.querySelector('.af-qr-timer') as HTMLElement | null
        if (timerEl) timerEl.textContent = '二维码有效时间 ' + fmtRemaining(remaining) + (remaining <= 0 ? '（已失效）' : '')
        const prog = document.querySelector('.af-qr-progress > span') as HTMLElement | null
        if (prog) prog.style.width = Math.round(Math.max(0, Math.min(1, remaining / duration)) * 100) + '%'
      }, 1000))
    }

    async function poll(): Promise<void> {
      if (finished) return
      try {
        const st = await fetchChannelStatus(rpc!, channel)
        const fresh = st.bots.filter((b) => !baseline.has(b.botId))
        const provBotId = st.provisioning?.botId
        const botId = fresh[0]?.botId ?? (provBotId && st.bots.some((b) => b.botId === provBotId) ? provBotId : undefined)
        if (botId) {
          return void succeed(botId)
        }
        if (st.provisioning?.submitted === true && !st.bots.some((b) => b.botId === (st.provisioning?.botId ?? ''))) {
          /* 已扫码提交，等待机器人出现 */
        }
      } catch {
        /* 轮询失败忽略 */
      }
      if (!finished) timers.push(setInterval(() => void poll(), 3000))
    }

    async function succeed(botId: string): Promise<void> {
      if (finished) return
      finished = true
      stopTimers()
      toast(label + ' 机器人已就绪', 'check')
      try {
        if (target.workspace) {
          await call('bot.workspace.set', { botId, workspace: target.workspace })
          toast('已接入并绑定工作区', 'check')
          modal.close()
          onDone()
          return
        }
      } catch (e) {
        toast('绑定工作区失败：' + String((e as Error)?.message ?? e))
      }
      modal.close()
      const picker = openWorkspacePicker(ctx, rpc)
      const ws = await picker.promise
      if (ws) {
        await call('bot.workspace.set', { botId, workspace: ws }).catch((e: unknown) => toast('绑定失败：' + String((e as Error)?.message ?? e)))
        toast('已接入并绑定工作区', 'check')
        onDone()
      } else {
        toast('机器人已就绪，请用 ⋯ 菜单「选择工作区」完成绑定')
        onDone()
      }
    }

    function renderQr(prov: ProvisionState): void {
      const src = safeQrSrc(prov.qrCodeDataUrl)
      const frame = h('div', { className: 'af-qr-frame' },
        src
          ? h('img', { src, alt: '授权二维码' })
          : h('div', { className: 'fallback' }, '二维码未就绪'),
      )
      const actions: HTMLElement[] = [
        makeButton({ kind: 'ghost', label: '换一个二维码', onClick: () => void begin() }),
        makeButton({ kind: 'ghost', label: '取消', onClick: () => { finished = true; void attemptCleanupPrevious(); modal.close() } }),
      ]
      const verif = prov.verificationUrl && /^https?:/i.test(prov.verificationUrl)
        ? makeButton({ label: '在 ' + label + ' 中打开', iconName: 'external', onClick: () => { window.open(prov.verificationUrl!, '_blank', 'noopener') } })
        : null
      if (verif) actions.unshift(verif)
      mount(body, [
        frame,
        h('div', { className: 'af-qr-timer' }, '二维码有效时间 ' + fmtRemaining((prov.expiresAt ?? Date.now() + 5 * 60_000) - Date.now())),
        h('div', { className: 'af-qr-progress' }, h('span')),
        h('div', { className: 'af-qr-msg' }, '扫码只会新增一个机器人，已接入的机器人不受影响'),
        h('ol', { className: 'af-steps' },
          h('li', null, '打开 ' + label + ' 移动端扫一扫'),
          h('li', null, '核对应用名称与权限范围后确认创建'),
          h('li', null, '保持本页打开，等待新机器人长连接就绪'),
        ),
        h('div', { className: 'af-modal-foot' }, ...actions),
      ])
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

    /* 基线：当前该渠道已存在的 botId（用于识别新机器人） */
    try {
      const st = await fetchChannelStatus(rpc!, channel)
      for (const b of st.bots) baseline.add(b.botId)
    } catch {
      /* 基线失败按空处理 */
    }
    if (finished) return
    void begin()
  }
}