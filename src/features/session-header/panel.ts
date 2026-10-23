/** SessionHeader Header 浮层（C 变体 verdict #8）：呼吸点 + 详情（#32 渠道/机器人二选，#144 助理身份＋助理单选）。
 * 防御式：任何异常只隐藏自己，绝不影响原生 Header；订阅 stream 纯渲染，卸载即退订。
 * 归属：session-header 特性自有面板（#18 收编自共享层）。 */
import * as React from 'react'
import { botDisplayLabel, type BotSnap, type RpcCall } from '../../client/data/fleet-api'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import {
  SEND_TEST_EVENT, SESSION_VIEWED_EVENT, botsInChannel, chooseBot, headerOverlayFor, runTestSend, sendToSuggestion,
  suggestionLabel, type DeliverySuggestion, type DotKind, type OverlayChannel, type TestSendOutcome,
} from '../../client/data/header-overlay'
import { assistantGroups, assistantName, assistantPickerBlock, pickerBlock } from './pickers'
import { fetchAssistBriefs, type AssistBrief } from './assistants'
import { logLine, logOn } from '../../client/log'

export interface SessionHeaderDeps {
  sessionId: string
  getWorkspacePath: (sessionId: string) => string | undefined
  /** 单份 stream 订阅（index 单例）；首轮快照到达前不绘制。 */
  subscribe: (fn: (snap: StreamSnapshot) => void) => () => void
  /** 仅发测试消息写路径使用；读快照一律走 subscribe。 */
  createRpc: () => RpcCall | null
  /** 自定义名表（与面板同一套 meta.names）；取不到按空表，显示回退目录名。 */
  loadCustomNames: () => Promise<Record<string, string>>
}

/** 自定义名表浅相等：loadMeta 每次返回新对象，不比较就直接 setState ⇒ 每次订阅回放都白渲染一轮。 */
function sameNames(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

function emit(name: string, detail: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent(name, { detail }))
  } catch { /* 派发失败不影响展示 */ }
}

function dotTitle(dot: DotKind): string {
  if (dot === 'online') return '在线'
  if (dot === 'warn') return '待确认'
  if (dot === 'offline') return '离线'
  return '未绑定'
}

export const SessionHeaderAction: React.FC<SessionHeaderDeps> = ({ sessionId, getWorkspacePath, subscribe, createRpc, loadCustomNames }) => {
  const [bots, setBots] = React.useState<BotSnap[]>([])
  const [hasSnap, setHasSnap] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [sgList, setSgList] = React.useState<DeliverySuggestion[] | null>(null)
  const [sgBot, setSgBot] = React.useState<BotSnap | null>(null)
  const [chPick, setChPick] = React.useState<OverlayChannel[] | null>(null)
  const [botPick, setBotPick] = React.useState<BotSnap[] | null>(null)
  const [names, setNames] = React.useState<Record<string, string>>({})
  const [assists, setAssists] = React.useState<AssistBrief[]>([])
  const [assistPick, setAssistPick] = React.useState<AssistBrief[] | null>(null)
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
            void (p as Promise<Record<string, string>>).then((n) => { if (!disposed) setNames((prev) => sameNames(prev, n ?? {}) ? prev : (n ?? {})) }).catch(() => {})
          }
        } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'session-header', action: 'names-fail', ok: false, message: '自定义名表读取失败（回退目录名）：' + String((e as Error)?.message ?? e) }) }
      })
    } catch (e) { logLine('warn', 'bridge.call.fail', { method: 'stream.subscribe', message: '呼吸点订阅失败（停绘）：' + String((e as Error)?.message ?? e) }); unsub = null }
    return () => {
      disposed = true
      try { unsub?.() } catch { /* 清理失败忽略 */ }
    }
  }, [sessionId, subscribe])
  React.useEffect(() => {
    setOpen(false); setResult(null); setSgList(null); setSgBot(null); setChPick(null); setBotPick(null); setAssistPick(null)
    try { emit(SESSION_VIEWED_EVENT, { sessionId: sessionId }) } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'session-header', action: 'viewed-emit-fail', ok: false, message: '已读回写上报失败（不影响展示）：' + String((e as Error)?.message ?? e) }) }
  }, [sessionId])
  /* #144：弹窗打开时一次性拉取家表助理身份（无轮询）；失败留空回落旧渲染。 */
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    let path: string | undefined
    try { path = getWorkspacePath(sessionId) } catch { path = undefined }
    void (async () => {
      try {
        const briefs = await fetchAssistBriefs(createRpc(), bots, path ?? '')
        if (!cancelled) setAssists(briefs)
      } catch { if (!cancelled) setAssists([]) }
    })()
    return () => { cancelled = true }
  }, [open, sessionId])
  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const onDoc = (ev: Event): void => {
      try {
        const t = ev.target as { closest?: (s: string) => unknown } | null
        if (t && typeof t.closest === 'function' && t.closest('.session-header-pop,.session-header-dotbtn')) return
        setOpen(false)
      } catch { setOpen(false) }
    }
    const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') setOpen(false) }
    try {
      document.addEventListener('mousedown', onDoc, true)
      document.addEventListener('keydown', onKey, true)
    } catch { return }
    return () => {
      try { document.removeEventListener('mousedown', onDoc, true) } catch { /* 清理失败忽略 */ }
      try { document.removeEventListener('keydown', onKey, true) } catch { /* 清理失败忽略 */ }
    }
  }, [open])
  let workspacePath: string | undefined
  try { workspacePath = getWorkspacePath(sessionId) } catch { workspacePath = undefined }
  const overlay = hasSnap ? headerOverlayFor(workspacePath, bots, Date.now(), names) : null
  if (!overlay || overlay.mode === 'hidden') return null
  const bot = overlay.mode === 'full' ? overlay.bot : null
  /** 落定一次发送结果：建议列表记属主 Bot；多 Bot 渠道成功追加机器人标识，绝不谎报。 */
  const finish = (outcome: TestSendOutcome, target: BotSnap | null): void => {
    if (outcome.ok) logLine('debug', 'ui.action', { area: 'session-header', action: 'send-test', ok: true, message: outcome.text + (target ? '（' + botDisplayLabel(target) + '）' : '') })
    else logLine('warn', 'bridge.call.fail', { method: 'test-send', message: outcome.text })
    setSgList(outcome.suggestions ?? null)
    setSgBot(outcome.suggestions?.length ? target : null)
    let text = outcome.text
    try {
      const owner = target ? assists.find((a) => a.bot?.botId === target.botId && (!a.bot?.channel || a.bot.channel === target.channel)) : undefined
      if (outcome.ok && target && owner) text += '（助理：' + owner.name + '）'
      else if (outcome.ok && target && botsInChannel(bots, workspacePath ?? '', target.channel).length > 1) text += '（机器人：' + botDisplayLabel(target) + '）'
    } catch { /* 标识追加失败不影响主文案 */ }
    setResult({ ok: outcome.ok, text })
  }
  const sendViaBot = async (target: BotSnap | null): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await runTestSend(createRpc(), target, workspacePath ?? '', overlay.agent)
      if (outcome.event) emit(SEND_TEST_EVENT, outcome.event)
      finish(outcome, target)
    } finally { setBusy(false) }
  }
  const onSendTest = async (): Promise<void> => {
    if (busy) return
    /* #144：多助理先选发送助理（以助理为单位）；单助理直发，不打扰。 */
    if (assists.length > 1) {
      logLine('debug', 'ui.action', { area: 'session-header', action: 'pick-assistant', ok: true, message: '多助理（' + assists.length + ' 位），先选发送助理' })
      setResult(null); setSgList(null); setSgBot(null); setChPick(null); setBotPick(null)
      setAssistPick(assists)
      return
    }
    const first = assists[0]
    if (assists.length === 1 && first && first.bot) {
      setAssistPick(null)
      await sendViaBot(first.bot)
      return
    }
    if (overlay.mode === 'full' && overlay.channels.length > 1) {
      logLine('debug', 'ui.action', { area: 'session-header', action: 'pick-channel', ok: true, message: '多渠道（' + overlay.channels.length + ' 个），先选发送渠道' })
      setResult(null); setSgList(null); setSgBot(null); setBotPick(null)
      setChPick(overlay.channels)
      return
    }
    const only = overlay.mode === 'full' ? overlay.channels[0] : undefined
    const inCh = only ? botsInChannel(bots, workspacePath ?? '', only.channel) : []
    if (inCh.length > 1) {
      setResult(null); setSgList(null); setSgBot(null); setChPick(null)
      setBotPick(inCh)
      return
    }
    setBotPick(null)
    await sendViaBot(bot)
  }
  const onPickChannel = (channel: string): void => {
    setChPick(null)
    const list = botsInChannel(bots, workspacePath ?? '', channel)
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'session-header', action: 'pick-channel', ok: true, message: '选中渠道 ' + channel + '（该渠道 ' + list.length + ' 个机器人' + (list.length > 1 ? '，继续选机器人' : '，直发') + '）' })
    if (list.length > 1) {
      setResult(null); setSgList(null); setSgBot(null)
      setBotPick(list)
      return
    }
    setBotPick(null)
    void sendViaBot(chooseBot(bots, workspacePath ?? '', channel))
  }
  const onPickBot = (target: BotSnap): void => {
    setBotPick(null)
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'session-header', action: 'pick-bot', ok: true, message: '选中机器人 ' + botDisplayLabel(target) + '，直发测试' })
    void sendViaBot(target)
  }
  const onPickAssistant = (brief: AssistBrief): void => {
    setAssistPick(null)
    if (!brief.bot) {
      setResult({ ok: false, text: '该助理（' + brief.name + '）尚未绑定机器人，先去绑定后再试。' })
      return
    }
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'session-header', action: 'pick-assistant', ok: true, message: '选中助理 ' + brief.name + '，直发测试' })
    void sendViaBot(brief.bot)
  }
  const onPickSg = async (sg: DeliverySuggestion): Promise<void> => {
    const target = sgBot ?? bot
    if (busy || !target) return
    const rpc = createRpc()
    if (!rpc) {
      logLine('warn', 'bridge.call.fail', { method: 'send-to-suggestion', message: '无法连接 Host 连接服务（rpc 缺失）' })
      setResult({ ok: false, text: '无法连接 Host 连接服务，稍后重试。' })
      return
    }
    setBusy(true)
    try {
      const outcome = await sendToSuggestion(rpc, target, sg, workspacePath ?? '', overlay.agent)
      if (outcome.event) emit(SEND_TEST_EVENT, outcome.event)
      finish(outcome, target)
    } finally { setBusy(false) }
  }
  const dotCls = 'session-header-dot ' + overlay.dotKind
  const btn = React.createElement(
    'button',
    {
      type: 'button',
      className: 'session-header-dotbtn ' + overlay.dotKind,
      title: overlay.mode === 'unbound' ? '未绑定，点击查看指引' : overlay.agent + '，' + overlay.label + '（点击查看详情）',
      'aria-label': overlay.mode === 'unbound' ? '未绑定，点击查看指引' : overlay.agent + dotTitle(overlay.dotKind as DotKind),
      onClick: () => {
        setResult(null); setSgList(null); setSgBot(null); setChPick(null); setBotPick(null); setAssistPick(null)
        logLine('debug', 'ui.action', { area: 'session-header', action: open ? 'close-detail' : 'open-detail', ok: true, message: '呼吸点详情' + (open ? '收起' : '展开') + (workspacePath ? '：' + workspacePath : '：未绑定') })
        setOpen(!open)
      },
    },
    React.createElement('span', { className: dotCls }),
  )
  if (!open) return React.createElement('span', { className: 'session-header' }, btn)
  /* #144：有助理行按助理分组（组头助理脸＋名＋状态，组下其渠道），无行回落旧平铺。 */
  const detail = overlay.mode === 'unbound'
    ? React.createElement('div', { className: 'session-header-sub' }, '该工作区尚未绑定机器人。到 dsh-im 设置页接入后，圆点会显示状态。')
    : assistantGroups(assists, overlay.channels)
  const sendBtn = overlay.mode === 'full'
    ? React.createElement(
      'button',
      { type: 'button', className: 'session-header-btn primary', disabled: busy, onClick: () => void onSendTest() },
      busy ? '发送中' : '发测试消息',
    )
    : null
  const sgBtns = sgList && sgList.length && overlay.mode === 'full'
    ? pickerBlock('选择发送会话：', sgList.map((sg) => suggestionLabel(sg)), busy, (i) => {
      const sg = sgList[i]
      if (sg) void onPickSg(sg)
    })
    : null
  const assistPicker = assistPick && assistPick.length > 1 && overlay.mode === 'full'
    ? assistantPickerBlock(assistPick, overlay.channels, busy, (i) => {
      const b = assistPick[i]
      if (b) onPickAssistant(b)
    })
    : null
  const chPicker = chPick && chPick.length > 1 && overlay.mode === 'full'
    ? pickerBlock('选择发送渠道：', chPick.map((ch) => ch.label), busy, (i) => {
      const ch = chPick[i]
      if (ch) onPickChannel(ch.channel)
    })
    : null
  const botPicker = botPick && botPick.length > 1 && overlay.mode === 'full'
    ? pickerBlock('选择发送机器人：', botPick.map((b) => botDisplayLabel(b)), busy, (i) => {
      const b = botPick[i]
      if (b) onPickBot(b)
    })
    : null
  const firstAssist = assists.length === 1 ? assists[0] : undefined
  const titleNode = overlay.mode === 'unbound' ? '未绑定'
    : firstAssist ? assistantName(firstAssist, 28)
    : React.createElement('span', { className: 'session-header-twrap' },
      React.createElement('span', null, overlay.agent + (assists.length > 1 ? '（' + assists.length + ' 位助理）' : '')),
      React.createElement('span', { className: 'session-header-tlabel' }, overlay.label))
  const pop = React.createElement(
    'div',
    { className: 'session-header-pop', role: 'dialog', 'aria-label': overlay.agent + (assists.length ? '（' + assists.map((a) => a.name).join('、') + '）' : '') + ' 状态详情' },
    React.createElement('div', { className: 'session-header-title' }, titleNode),
    detail,
    sendBtn ? React.createElement('div', { className: 'session-header-row' }, sendBtn) : null,
    assistPicker,
    chPicker,
    botPicker,
    sgBtns,
    result ? React.createElement('div', { className: 'session-header-result ' + (result.ok ? 'ok' : 'err') }, result.text) : null,
  )
  return React.createElement('span', { className: 'session-header' }, btn, pop)
}
