/** 绑定落定编排（原 connect-flow.ts commitBinding，原样搬迁；行为一字不动）。
 * 搬迁理由（契约 §10 例外通道）：connect-flow 已 284 行，T4 分支加进来必超 300 行红线；
 * 落定编排是纯函数（无 DOM），移出后 connect-flow 只剩分支调用，renderQr/poll 原样保留。
 * 既有导入方经 connect-flow 重导出兼容（tests 仍从 connect-flow 取 commitBinding）。 */
import { HOST_CHANNEL, createMetaStore } from '../data/meta'
import type { RpcCall } from '../data/fleet-api'
import type { toast as toastFn } from '../ui/toast'
import { logLine, logOn } from '../log'

export interface BindingCommit {
  rpc: RpcCall
  channel: string
  toast: typeof toastFn
  /** #141：落定结果回传（true＝机器人认下工作区且归属已写进助理表）。取消流程不调它。 */
  onDone: (ok?: boolean) => void
  botId: string
  ws: string | null
  prevWorkspace: string
  agentName: string
  /** #141：发起接入的那个助理。给了它就**必须**落回那一行——workspace.set 只认下工作区，
   * 「谁拥有这个机器人」只有 assistant.bind 会写；不给则是旧面板的家级接入（名字跟人走）。 */
  assistantId?: string
  /** #141：assistant.bind 的名字兜底（宿主只在 nameSource ≠ user 时用它）。 */
  botName?: string
  /** 服务端登记竞态重试（默认 5 次 × 2s；单测可注入小值）。 */
  notFoundRetry?: { attempts: number; gapMs: number }
}

const NOT_FOUND_RETRY = { attempts: 5, gapMs: 2000 }
const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

/** 选家落定（#49：可单测的纯编排——set 信封校验＋名字跟人走＋如实 toast；弹窗/DOM 留在外层）。
 * 服务端登记竞态（上游 ensure 晚于状态可见）：`workspace-bot-not-found` 按间隔重试，其余失败直报。
 * #62：空工作区分支仅作纵深防御（正常流程无家连扫码都进不来）；提示须指向真能补绑的卡，
 * 绝不复活“扫码后再选家、可取消”的旧分叉。 */
export async function commitBinding(o: BindingCommit): Promise<boolean> {
  if (!o.ws) {
    logLine('info', 'assistant.action', { action: 'bind', assistantId: '', ok: false, message: '机器人已就绪但未绑定工作区（ws 为空）' })
    o.toast('机器人已就绪但未绑定工作区：请在该机器人所在卡片用 ⋯ 菜单「选择工作区」完成绑定')
    o.onDone(false)
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
        o.toast('机器人还没就绪，请稍后重试')
      }
      await sleep(retry.gapMs)
      continue
    }
    const failMsg = res?.error?.message ?? '绑定失败'
    logLine('info', 'assistant.action', { action: 'bind', assistantId: '', ok: false, message: failMsg })
    o.toast('绑定失败：' + failMsg)
    o.onDone(false)
    return false
  }
  /* #141：带了助理身份就必须落回那一行——上面只让机器人认下工作区，归属得由 assistant.bind 写。
   * 不写这一步，就会留下「已绑工作区·无主」的窗口，被家表种子对账当成缺口补成一条**新**助理（#141 真机实证）。 */
  if (o.assistantId) {
    try {
      const raw = await o.rpc(HOST_CHANNEL, 'assistant.bind', {
        id: o.assistantId, channel: o.channel, botId: o.botId, botName: o.botName ?? '', homeText: '',
      }, AbortSignal.timeout(8000)) as SetRes
      if (!raw || raw.ok !== true) throw new Error(raw?.error?.message ?? '宿主未确认绑定')
      logLine('info', 'assistant.action', { action: 'bind', assistantId: o.assistantId, ok: true, message: '' })
    } catch (e) {
      const m = String((e as Error)?.message ?? e)
      logLine('info', 'assistant.action', { action: 'bind', assistantId: o.assistantId, ok: false, message: m })
      o.toast('机器人已接入，但没绑上这个助理：' + m)
      o.onDone(false)
      return false
    }
  }
  /* 名字跟人走：无家 Agent 首次落家，家即其名，local 空壳退场；元数据失败不推翻已落地绑定。 */
  if (!o.prevWorkspace && o.agentName.trim()) {
    try {
      const store = await createMetaStore(o.rpc)
      await store.rename(o.ws, o.agentName)
      await store.removeLocal(o.agentName)
    } catch (e) {
      /* 半成功：绑定已生效、只有名字关联失败——不改判结果，但必须留证据。 */
      const m = String((e as Error)?.message ?? e)
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'connect', action: 'name-link', ok: false, message: m })
      o.toast('名称关联失败：' + m + '（绑定已生效）')
    }
  }
  logLine('info', 'assistant.action', { action: 'bind', assistantId: o.assistantId ?? '', ok: true, message: '' })
  o.toast('已接入并绑定工作区', 'check')
  o.onDone(true)
  return true
}
