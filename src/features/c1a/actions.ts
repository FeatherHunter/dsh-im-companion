/** C1a 写透层（drawer 瘦身拆出）：逐渠道写上游真接口＋部分失败透出＋写后刷新；deps 注入可单测。 */
import type { FeatureCtx } from '../protocol'
import { unwrapRpc, type DrawerBot, type DrawerModel } from './data'

export interface WriteDeps {
  rpc: FeatureCtx['rpc']
  refresh(): Promise<void>
  reloadMeta(): Promise<void>
  paint(): void
  notify(msg: string, icon?: 'check'): void
}

export function rpcOf(
  rpc: FeatureCtx['rpc'], channel: string, endpoint: string, payload: Record<string, unknown>,
): Promise<void> {
  if (!rpc) return Promise.reject(new Error('连接服务不可用'))
  return rpc('/' + channel, endpoint, payload, AbortSignal.timeout(8000)).then((raw) => unwrapRpc(raw))
}

/** 逐渠道写透：部分失败如实透出（失败渠道名），成功后 refresh 广播。 */
export async function writeBots(
  model: DrawerModel, deps: WriteDeps, kind: string,
  run: (b: DrawerBot) => Promise<void>, note = '，新会话生效',
): Promise<void> {
  if (!deps.rpc) {
    deps.notify('连接服务不可用')
    return
  }
  if (!model.bots.length) {
    deps.notify('该 Agent 尚未绑定机器人')
    return
  }
  const fails: string[] = []
  let ok = 0
  let lastErr = ''
  for (const b of model.bots) {
    try {
      await run(b)
      ok++
    } catch (e) {
      fails.push(b.channel)
      lastErr = String((e as Error)?.message ?? e)
    }
  }
  if (!fails.length) deps.notify(kind + '已写入真系统' + note, 'check')
  else if (ok > 0) deps.notify(kind + '部分写入（成功 ' + ok + ' 个），失败：' + fails.join('、'))
  else deps.notify(kind + '写入失败：' + lastErr)
  try {
    await deps.reloadMeta()
    await deps.refresh()
  } catch {
    /* 刷新失败忽略（下轮 15s 自愈） */
  }
  deps.paint()
}
