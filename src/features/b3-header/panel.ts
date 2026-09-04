/** B3 Header 浮层（C 变体 verdict #8）：conversation.session.header.utilities 呼吸点 + 详情。
 * 平时仅圆点零打扰；点击展开详情（Agent 健康 + 绑定渠道 + 发测试消息）。
 * 防御式：任何异常只隐藏自己，绝不影响原生 Header；订阅 stream 纯渲染，卸载即退订。
 * 发测试消息：优先已保存目标；无目标时用已聊会话做草稿测试（不存任何东西），
 * 多个会话先选再发，成功同时派发 SEND_TEST_EVENT；未绑定只给静态指引，无死按钮。
 * 归属：b3-header 特性自有面板（#18 收编自共享层，原样迁移，行为零改）。 */
import * as React from 'react'
import { channelGlyphSvg } from '../../client/icons'
import type { BotSnap, RpcCall } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import {
  SEND_TEST_EVENT,
  headerOverlayFor,
  runTestSend,
  sendToSuggestion,
  suggestionLabel,
  chooseBot,
  type DeliverySuggestion,
  type DotKind,
  type OverlayChannel,
} from '../../client/data/header-overlay'

export interface B3HeaderDeps {
  sessionId: string
  getWorkspacePath: (sessionId: string) => string | undefined
  /** 单份 stream 订阅（index 单例）；首轮快照到达前不绘制。 */
  subscribe: (fn: (snap: StreamSnapshot) => void) => () => void
  /** 仅发测试消息写路径使用；读快照一律走 subscribe。 */
  createRpc: () => RpcCall | null
  /** 自定义名表（与面板同一套 meta.names）；取不到按空表，显示回退目录名。 */
  loadCustomNames: () => Promise<Record<string, string>>
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

export const B3HeaderAction: React.FC<B3HeaderDeps> = ({ sessionId, getWorkspacePath, subscribe, createRpc, loadCustomNames }) => {
  const [bots, setBots] = React.useState<BotSnap[]>([])
  const [hasSnap, setHasSnap] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [sgList, setSgList] = React.useState<DeliverySuggestion[] | null>(null)
  const [chPick, setChPick] = React.useState<OverlayChannel[] | null>(null)

  const [names, setNames] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    let disposed = false
    let unsub: (() => void) | null = null
    try {
      unsub = subscribe((snap) => {
        setBots(snap.bots)
        setHasSnap(snap.updatedAt > 0)
        try {
          const p = loadCustomNames()
          if (p && typeof (p as Promise<Record<string, string>>).then === 'function') {
            void (p as Promise<Record<string, string>>).then((n) => {
              if (!disposed) setNames(n ?? {})
            }).catch(() => {})
          }
        } catch {
          /* 名表失败即回退目录名 */
        }
      })
    } catch {
      unsub = null
    }
    return () => {
      disposed = true
      try {
        unsub?.()
      } catch {
        /* 清理失败忽略 */
      }
    }
  }, [sessionId, subscribe])

  React.useEffect(() => {
    setOpen(false)
    setResult(null)
    setSgList(null)
    setChPick(null)
  }, [sessionId])

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
  const overlay = hasSnap ? headerOverlayFor(workspacePath, bots, Date.now(), names) : null
  if (!overlay || overlay.mode === 'hidden') return null

  const bot = overlay.mode === 'full' ? overlay.bot : null

  const sendViaBot = async (target: BotSnap | null): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await runTestSend(createRpc(), target, workspacePath ?? '', overlay.agent)
      if (outcome.event) emit(SEND_TEST_EVENT, outcome.event)
      setSgList(outcome.suggestions ?? null)
      setResult({ ok: outcome.ok, text: outcome.text })
    } finally {
      setBusy(false)
    }
  }

  const onSendTest = async (): Promise<void> => {
    if (busy) return
    if (overlay.mode === 'full' && overlay.channels.length > 1) {
      setResult(null)
      setSgList(null)
      setChPick(overlay.channels)
      return
    }
    await sendViaBot(bot)
  }

  const onPickChannel = (channel: string): void => {
    setChPick(null)
    void sendViaBot(chooseBot(bots, workspacePath ?? '', channel))
  }

  const onPickSg = async (sg: DeliverySuggestion): Promise<void> => {
    if (busy || !bot) return
    const rpc = createRpc()
    if (!rpc) {
      setResult({ ok: false, text: '无法连接 Host 连接服务，稍后重试。' })
      return
    }
    setBusy(true)
    try {
      const outcome = await sendToSuggestion(rpc, bot, sg, workspacePath ?? '', overlay.agent)
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
      title: overlay.mode === 'unbound' ? '未绑定，点击查看指引' : overlay.agent + '·' + overlay.label + '（点击查看详情）',
      'aria-label': overlay.mode === 'unbound' ? '未绑定，点击查看指引' : overlay.agent + dotTitle(overlay.dotKind as DotKind),
      onClick: () => {
        setResult(null)
        setSgList(null)
        setChPick(null)
        setOpen(!open)
      },
    },
    React.createElement('span', { className: dotCls }),
  )

  if (!open) return React.createElement('span', { className: 'b3-header' }, btn)

  const detail = overlay.mode === 'unbound'
    ? React.createElement('div', { className: 'b3-header-sub' }, '该工作区尚未绑定机器人。到 dsh-im 设置页接入后，圆点会显示状态。')
    : React.createElement(
      'div',
      { className: 'b3-header-channels', title: overlay.tooltip },
      ...overlay.channels.map((ch) =>
        React.createElement(
          'div',
          {
            className: 'b3-header-chrow',
            key: ch.channel,
            title: ch.label + '·' + ch.statusText,
            'aria-label': ch.label + ch.statusText,
          },
          React.createElement(
            'span',
            { className: 'b3-header-chlogo' },
            (() => {
              const logo = channelGlyphSvg(ch.channel, 18)
              if (logo) {
                return React.createElement('span', {
                  className: 'b3-header-chlogoin',
                  dangerouslySetInnerHTML: { __html: logo },
                })
              }
              return React.createElement(
                'span',
                { className: 'b3-header-chbadge', style: { background: ch.color } },
                ch.label.charAt(0) || '?',
              )
            })(),
            React.createElement('span', { className: 'b3-header-chst ' + ch.kind }),
          ),
          React.createElement('span', null, ch.label),
        ),
      ),
    )

  const sendBtn = overlay.mode === 'full'
    ? React.createElement(
      'button',
      { type: 'button', className: 'b3-header-btn primary', disabled: busy, onClick: () => void onSendTest() },
      busy ? '发送中…' : '发测试消息',
    )
    : null

  const sgBtns = sgList && sgList.length && overlay.mode === 'full'
    ? React.createElement(
      'div',
      { className: 'b3-header-row' },
      ...sgList.slice(0, 5).map((sg, i) =>
        React.createElement(
          'button',
          { type: 'button', key: i, className: 'b3-header-btn', disabled: busy, onClick: () => void onPickSg(sg) },
          suggestionLabel(sg),
        ),
      ),
    )
    : null

  const chPicker = chPick && chPick.length > 1 && overlay.mode === 'full'
    ? React.createElement(
      'div',
      null,
      React.createElement('div', { className: 'b3-header-sub' }, '选择发送渠道：'),
      React.createElement(
        'div',
        { className: 'b3-header-row' },
        ...chPick.map((ch) =>
          React.createElement(
            'button',
            { type: 'button', key: ch.channel, className: 'b3-header-btn', disabled: busy, onClick: () => onPickChannel(ch.channel) },
            ch.label,
          ),
        ),
      ),
    )
    : null

  const pop = React.createElement(
    'div',
    { className: 'b3-header-pop', role: 'dialog', 'aria-label': overlay.agent + ' 状态详情' },
    React.createElement('div', { className: 'b3-header-title' }, overlay.mode === 'unbound' ? '未绑定' : overlay.agent + '·' + overlay.label),
    detail,
    sendBtn ? React.createElement('div', { className: 'b3-header-row' }, sendBtn) : null,
    chPicker,
    sgBtns,
    result ? React.createElement('div', { className: 'b3-header-result ' + (result.ok ? 'ok' : 'err') }, result.text) : null,
  )

  return React.createElement('span', { className: 'b3-header' }, btn, pop)
}
