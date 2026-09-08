/** 绑定落定编排（原 connect-flow.ts commitBinding，原样搬迁；行为一字不动）。
 * 搬迁理由（契约 §10 例外通道）：connect-flow 已 284 行，T4 分支加进来必超 300 行红线；
 * 落定编排是纯函数（无 DOM），移出后 connect-flow 只剩分支调用，renderQr/poll 原样保留。
 * 既有导入方经 connect-flow 重导出兼容（tests 仍从 connect-flow 取 commitBinding）。 */
import { createMetaStore } from '../data/meta'
import type { RpcCall } from '../data/fleet-api'
import type { toast as toastFn } from '../ui/toast'

export interface BindingCommit {
  rpc: RpcCall
  channel: string
  toast: typeof toastFn
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
 * 服务端登记竞态（上游 ensure 晚于状态可见）：`workspace-bot-not-found` 按间隔重试，其余失败直报。
 * #62：空工作区分支仅作纵深防御（正常流程无家连扫码都进不来）；提示须指向真能补绑的卡，
 * 绝不复活“扫码后再选家、可取消”的旧分叉。 */
export async function commitBinding(o: BindingCommit): Promise<boolean> {
  if (!o.ws) {
    o.toast('机器人已就绪但未绑定工作区：请在该机器人所在卡片用 ⋯ 菜单「选择工作区」完成绑定')
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
