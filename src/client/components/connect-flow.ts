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
import { createMetaStore } from '../data/meta'
import { WORKSPACE_PICKER_COPY, ctxNativePicker, openDirPicker } from '../ui/dir-picker'

export interface ConnectTarget {
  name: string
  workspace: string
}

function safeQrSrc(value: string | undefined): string | null {
  if (!value) return null
  return /^data:image\/(?:png|webp|svg\+xml)(?:;charset=[^;,]+)?;base64,/i.test(value) ? value : null
}

export interface BindingCommit {
  rpc: RpcCall
  channel: string
  toast: typeof toast
  onDone: () => void
  botId: string
  ws: string | null
  prevWorkspace: string
  agentName: string
  /** 服务端登记竞态重试（默认 5 次 × 2s；单测可注入小值）。 */
  notFoundRetry?: { attempts: number; gapMs: number }
}

const NOT_FOUND_RETRY = { attempts: 5, gapMs: 2000 }
const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

/** 选家落定（#49：可单测的纯编排——set 信封校验＋名字跟人走＋如实 toast；弹窗/DOM 留在外层）。
 * 服务端登记竞态（上游 ensure 晚于状态可见）：`workspace-bot-not-found` 按间隔重试，其余失败直报。 */
export async function commitBinding(o: BindingCommit): Promise<boolean> {
  if (!o.ws) {
    o.toast('机器人已就绪，请用 ⋯ 菜单「选择工作区」完成绑定')
    o.onDone()
    return false
  }
  const call = (endpoint: string, payload: Record<string, unknown>) =>
    o.rpc('/' + o.channel, endpoint, payload, AbortSignal.timeout(8000))
  type SetRes = { ok?: boolean; error?: { code?: string; message?: string } } | null
  const retry = o.notFoundRetry ?? NOT_FOUND_RETRY
  let res: SetRes = null
  let announced = false
  for (let attempt = 1; ; attempt++) {
    try {
      res = await call('bot.workspace.set', { botId: o.botId, workspace: o.ws }) as SetRes
    } catch (e) {
      res = { ok: false, error: { message: String((e as Error)?.message ?? e) } }
    }
    if (res && res.ok === true) break
    if (res?.error?.code === 'workspace-bot-not-found' && attempt < retry.attempts) {
      if (!announced) {
        announced = true
        o.toast('服务端正在登记新机器人，绑定稍候重试…')
      }
      await sleep(retry.gapMs)
      continue
    }
    o.toast('绑定失败：' + (res?.error?.message ?? '绑定失败'))
    o.onDone()
    return false
  }
  /* 名字跟人走：无家 Agent 首次落家，家即其名，local 空壳退场；元数据失败不推翻已落地绑定。 */
  if (!o.prevWorkspace && o.agentName.trim()) {
    try {
      const store = await createMetaStore(o.rpc)
      await store.rename(o.ws, o.agentName)
      await store.removeLocal(o.agentName)
    } catch (e) {
      o.toast('名称关联失败：' + String((e as Error)?.message ?? e) + '（绑定已生效）')
    }
  }
  o.toast('已接入并绑定工作区', 'check')
  o.onDone()
  return true
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
      toast(label + ' 机器人已就绪', 'check')
      try {
        if (target.workspace) {
          modal.close()
          if (await commitBinding({ rpc: rpc!, channel, toast, onDone, botId, ws: target.workspace, prevWorkspace: target.workspace, agentName: target.name })) return
        }
      } catch (e) {
        toast('绑定工作区失败：' + String((e as Error)?.message ?? e))
      }
      modal.close()
      const picker = openDirPicker(rpc, '', ctxNativePicker(ctx), WORKSPACE_PICKER_COPY)
      const ws = await picker.promise
      await commitBinding({ rpc: rpc!, channel, toast, onDone, botId, ws, prevWorkspace: target.workspace, agentName: target.name })
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
    try {
      const st = await fetchChannelStatus(rpc!, channel)
      for (const b of st.bots) baseline.add(b.botId)
      baselineOk = true
    } catch {
      /* 基线未知：识别退化为 provision 匹配 */
    }
    if (finished) return
    void begin()
  }
}
