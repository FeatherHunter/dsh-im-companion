/** B3 Header 浮层（C 变体 verdict #8）：conversation.session.header.utilities 呼吸点 + 详情。
 * 平时仅圆点零打扰；点击展开详情（Agent 健康 + 绑定渠道 + 打开工作区/发测试消息）。
 * 防御式：任何异常只隐藏自己，绝不影响原生 Header；订阅 stream 纯渲染，卸载即退订。
 * 点击只读：打开工作区派发 OPEN_AGENT_EVENT（与 B1 同缝）；发测试消息只走 dsh-im
 * 已保存目标（无目标不清谎报发送，只给去配置指引），成功同时派发 SEND_TEST_EVENT。 */
import * as React from 'react'
import { OPEN_AGENT_EVENT } from '../data/bindings'
import type { BotSnap, RpcCall } from '../data/fleet-api'
import type { StreamSnapshot } from '../data/connection-stream'
import {
  SEND_TEST_EVENT,
  headerOverlayFor,
  runTestSend,
  type DotKind,
} from '../data/header-overlay'

export interface B3HeaderDeps {
  sessionId: string
  getWorkspacePath: (sessionId: string) => string | undefined
  /** 单份 stream 订阅（index 单例）；首轮快照到达前不绘制。 */
  subscribe: (fn: (snap: StreamSnapshot) => void) => () => void
  /** 仅发测试消息写路径使用；读快照一律走 subscribe。 */
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

export const B3HeaderAction: React.FC<B3HeaderDeps> = ({ sessionId, getWorkspacePath, subscribe, createRpc }) => {
  const [bots, setBots] = React.useState<BotSnap[]>([])
  const [hasSnap, setHasSnap] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)

  React.useEffect(() => {
    let unsub: (() => void) | null = null
    try {
      unsub = subscribe((snap) => {
        setBots(snap.bots)
        setHasSnap(snap.updatedAt > 0)
      })
    } catch {
      unsub = null
    }
    return () => {
      try {
        unsub?.()
      } catch {
        /* 清理失败忽略 */
      }
    }
  }, [sessionId, subscribe])

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const onDoc = (ev: Event): void => {
      try {
        const t = ev.target as { closest?: (s: string) => unknown } | null
        if (t && typeof t.closest === 'function' && t.closest('.b3-header-pop,.b3-header-dotbtn')) return
        setOpen(false)
      } catch {
        setOpen(false)
      }
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setOpen(false)
    }
    try {
      document.addEventListener('mousedown', onDoc, true)
      document.addEventListener('keydown', onKey, true)
    } catch {
      return
    }
    return () => {
      try {
        document.removeEventListener('mousedown', onDoc, true)
      } catch {
        /* 清理失败忽略 */
      }
      try {
        document.removeEventListener('keydown', onKey, true)
      } catch {
        /* 清理失败忽略 */
      }
    }
  }, [open])

  let workspacePath: string | undefined
  try {
    workspacePath = getWorkspacePath(sessionId)
  } catch {
    workspacePath = undefined
  }
  const overlay = hasSnap ? headerOverlayFor(workspacePath, bots, Date.now()) : null
  if (!overlay || overlay.mode === 'hidden') return null

  const bot = overlay.mode === 'full' ? overlay.bot : null

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
