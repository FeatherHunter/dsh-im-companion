/** B3 Header 浮层（C 变体 verdict #8）：conversation.session.header.utilities 呼吸点 + 详情。
 * 平时仅圆点零打扰；点击展开详情（Agent 健康 + 绑定渠道 + 打开工作区/发测试消息）。
 * 防御式：任何异常只隐藏自己，绝不影响原生 Header；卸载即净（轮询随组件走）。
 * 点击只读：打开工作区派发 OPEN_AGENT_EVENT（与 B1 同缝）；发测试消息只走 dsh-im
 * 已保存目标（无目标不清谎报发送，只给去配置指引），成功同时派发 SEND_TEST_EVENT。 */
import * as React from 'react'
import { OPEN_AGENT_EVENT } from '../data/badges'
import { fetchBots, mergeStaleBots, type BotSnap, type RpcCall } from '../data/fleet-api'
import {
  SEND_TEST_EVENT,
  chooseBot,
  headerOverlayFor,
  runTestSend,
  type DotKind,
} from '../data/header-overlay'

const POLL_MS = 15000

export interface B3HeaderDeps {
  sessionId: string
  getWorkspacePath: (sessionId: string) => string | undefined
  createRpc: () => RpcCall | null
}

function emit(name: string, detail: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent(name, { detail }))
  } catch {
    /* 派发失败不影响展示 */
  }
}

function dotTitle(dot: DotKind): string {
  if (dot === 'online') return '在线'
  if (dot === 'warn') return '待确认'
  if (dot === 'offline') return '离线'
  return '未绑定'
}

export const B3HeaderAction: React.FC<B3HeaderDeps> = ({ sessionId, getWorkspacePath, createRpc }) => {
  const [bots, setBots] = React.useState<BotSnap[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)

  React.useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined
    const poll = async (): Promise<void> => {
      const rpc = createRpc()
      if (!rpc || disposed) return
      try {
        const next = await fetchBots(rpc)
        if (disposed) return
        botsRef.current = mergeStaleBots(botsRef.current, next.bots, next.failed)
        setBots(botsRef.current)
        setLoaded(true)
      } catch {
        /* 静默失败保留旧状态（stale 语义在 fetchBots 内） */
      }
    }
    const botsRef = { current: [] as BotSnap[] }
    void poll()
    try {
      if (typeof setInterval !== 'undefined') timer = setInterval(() => void poll(), POLL_MS)
    } catch {
      /* 无定时器就只拉一次 */
    }
    return () => {
      disposed = true
      try {
        if (timer !== undefined) clearInterval(timer)
      } catch {
        /* 清理失败忽略 */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  let workspacePath: string | undefined
  try {
    workspacePath = getWorkspacePath(sessionId)
  } catch {
    workspacePath = undefined
  }
  const overlay = loaded ? headerOverlayFor(workspacePath, bots, Date.now()) : null
  if (!overlay || overlay.mode === 'hidden') return null

  const bot = overlay.mode === 'full' ? (overlay.bot ?? chooseBot(bots, workspacePath ?? '')) : null

  const onOpenWorkspace = (): void => {
    emit(OPEN_AGENT_EVENT, { workspace: workspacePath ?? '', agent: overlay.agent })
  }

  const onSendTest = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await runTestSend(createRpc(), bot, workspacePath ?? '', overlay.agent)
      if (outcome.event) emit(SEND_TEST_EVENT, outcome.event)
      setResult({ ok: outcome.ok, text: outcome.text })
    } finally {
      setBusy(false)
    }
  }

  const dotCls = 'b3-header-dot ' + overlay.dotKind
  const btn = React.createElement(
    'button',
    {
      type: 'button',
      className: 'b3-header-dotbtn ' + overlay.dotKind,
      title: overlay.mode === 'unbound' ? '未绑定：点击去设置' : overlay.agent + ' · ' + overlay.label + '（点击查看详情）',
      'aria-label': overlay.mode === 'unbound' ? '未绑定，点击去设置' : overlay.agent + dotTitle(overlay.dotKind as DotKind),
      onClick: () => {
        setResult(null)
        setOpen(!open)
      },
    },
    React.createElement('span', { className: dotCls }),
  )

  if (!open) return React.createElement('span', { className: 'b3-header' }, btn)

  const detail = overlay.mode === 'unbound'
    ? React.createElement('div', { className: 'b3-header-sub' }, '该工作区尚未绑定机器人。')
    : React.createElement('div', { className: 'b3-header-sub', title: overlay.tooltip }, overlay.agent + ' · ' + overlay.label)

  const actions = overlay.mode === 'unbound'
    ? React.createElement('button', { type: 'button', className: 'b3-header-btn primary', onClick: onOpenWorkspace }, '去设置')
    : React.createElement(
        React.Fragment,
        null,
        React.createElement('button', { type: 'button', className: 'b3-header-btn', onClick: onOpenWorkspace }, '打开工作区'),
        React.createElement(
          'button',
          { type: 'button', className: 'b3-header-btn primary', disabled: busy, onClick: () => void onSendTest() },
          busy ? '发送中…' : '发测试消息',
        ),
      )

  const pop = React.createElement(
    'div',
    { className: 'b3-header-pop', role: 'dialog', 'aria-label': overlay.agent + ' 状态详情' },
    React.createElement('div', { className: 'b3-header-title' }, overlay.mode === 'unbound' ? '未绑定' : overlay.agent + ' · ' + overlay.label),
    detail,
    React.createElement('div', { className: 'b3-header-row' }, actions),
    result ? React.createElement('div', { className: 'b3-header-result ' + (result.ok ? 'ok' : 'err') }, result.text) : null,
  )

  return React.createElement('span', { className: 'b3-header' }, btn, pop)
}
