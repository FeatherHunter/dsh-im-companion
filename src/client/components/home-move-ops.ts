/** T6c #115 搬家/移除/孤儿/删时解绑编排（owner：components 系；home-ops 一字不动）。
 * 顺序铁律：已绑行先 bot.workspace.set（远端跟随）再 assistant.*（落表）；落表失败回滚远端，两边都不脏。
 * 写后顺序：先 reloadHomes 再 refresh（create-flow 顺序契约，T6b 已钉）。 */
import { toast } from '../ui/toast'
import type { RpcCall } from '../data/fleet-api'
import type { Assistant, Home } from '../data/home-model'
import { findOrphans } from '../data/home-move'
import { aLog, bindBot, msgOf } from './home-ops'
import { logLine, logOn } from '../log'

const BRIDGE = '/im-companion'

type BridgeOk<T> = { ok?: boolean; value?: T; error?: { code?: string; message?: string } } | null

async function bridge<T>(rpc: RpcCall, endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const raw = await rpc(BRIDGE, endpoint, payload, AbortSignal.timeout(8000)) as BridgeOk<T>
  if (!raw || raw.ok !== true || raw.value === undefined) {
    const e = new Error(raw?.error?.message ?? 'host 桥调用失败') as Error & { code?: string }
    e.code = raw?.error?.code
    logLine('warn', 'bridge.call.fail', { method: endpoint, message: e.message })
    throw e
  }
  return raw.value
}

export interface MoveDeps {
  getRpc(): RpcCall | null
  getHome(id: string): Home | undefined
  getAssistant(id: string): Assistant | undefined
  reloadHomes(): Promise<void>
  refresh(): Promise<void>
}

export interface MoveOps {
  moveAssistant(id: string, targetHomeId: string): Promise<void>
  unbindAssistant(id: string): Promise<void>
  /** 删助理（T6c clean 版，覆盖 drill 旧版）：已绑先清空工作区再删行，防种子复活；不断连接。 */
  removeAssistant(id: string): Promise<void>
}

/** 孤儿扫尾（bot 没了→助理回落，失败渠道 fail-closed；调用方扫后重读，列表详情一致）。 */
export async function sweepOrphans(
  rpc: RpcCall,
  assistants: Assistant[],
  bots: Array<{ channel: string; botId: string }>,
  failed: string[] = [],
): Promise<number> {
  const ids = findOrphans(assistants, bots, failed)
  let n = 0
  for (const id of ids) {
    try {
      await bridge(rpc, 'assistant.unbind', { id, orphan: true })
      n += 1
    } catch { /* best effort：下轮再试 */ }
  }
  if (n && logOn('debug')) logLine('debug', 'ui.action', { area: 'homes', action: 'sweep-orphans', ok: true, message: 'unbound=' + n })
  return n
}

export function createMoveOps(deps: MoveDeps): MoveOps {
  return {
    moveAssistant: async (id, targetHomeId) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('move', id, false, '连接服务不可用'); return }
      const a = deps.getAssistant(id)
      const target = deps.getHome(targetHomeId)
      if (!a || !target) { toast('找不到这个助理或家'); aLog('move', id, false, '找不到这个助理或家：' + targetHomeId); return }
      if (a.homeId === targetHomeId) { toast('已在该家，无需搬家'); aLog('move', id, false, '已在该家，无需搬家'); return }
      if (target.tombstone) { toast('目标家已删除'); aLog('move', id, false, '目标家已删除：' + targetHomeId); return }
      if (a.status === 'bound' && a.botId) {
        const src = deps.getHome(a.homeId)
        if (!await bindBot(rpc, a.channel, a.botId, target.path)) return
        try {
          await bridge(rpc, 'assistant.move', { id, targetHomeId })
        } catch (e) {
          try { if (src) await bindBot(rpc, a.channel, a.botId, src.path) } catch { /* 回滚尽力 */ }
          toast('搬家失败，已恢复原样：' + msgOf(e)); aLog('move', id, false, '搬家失败并已回滚远端：' + msgOf(e))
          return
        }
      } else {
        try {
          await bridge(rpc, 'assistant.move', { id, targetHomeId })
        } catch (e) {
          toast('搬家失败：' + msgOf(e)); aLog('move', id, false, msgOf(e))
          return
        }
      }
      toast('搬家成功', 'check'); aLog('move', id, true, '→ ' + targetHomeId)
      await deps.reloadHomes()
      await deps.refresh()
    },
    unbindAssistant: async (id) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('unbind', id, false, '连接服务不可用'); return }
      const a = deps.getAssistant(id)
      if (!a || a.status !== 'bound' || !a.botId) { toast('还没绑定，无需移除'); aLog('unbind', id, false, '还没绑定，无需移除'); return }
      const src = deps.getHome(a.homeId)
      if (!await bindBot(rpc, a.channel, a.botId, '')) return
      try {
        await bridge(rpc, 'assistant.unbind', { id, orphan: false })
      } catch (e) {
        try { if (src) await bindBot(rpc, a.channel, a.botId, src.path) } catch { /* 回滚尽力 */ }
        toast('移除失败，已恢复原样：' + msgOf(e)); aLog('unbind', id, false, '移除失败并已回滚远端：' + msgOf(e))
        return
      }
      toast('已移除渠道', 'check'); aLog('unbind', id, true, '')
      await deps.reloadHomes()
      await deps.refresh()
    },
    removeAssistant: async (id) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('remove', id, false, '连接服务不可用'); return }
      const a = deps.getAssistant(id)
      if (!a) { toast('找不到这个助理'); aLog('remove', id, false, '找不到这个助理'); return }
      if (a.status === 'bound' && a.botId) {
        if (!await bindBot(rpc, a.channel, a.botId, '')) return
      }
      try {
        await bridge(rpc, 'assistant.remove', { id })
        toast('助理已删除（机器人连接保留）', 'check'); aLog('remove', id, true, '')
      } catch (e) {
        toast('删除失败：' + msgOf(e)); aLog('remove', id, false, msgOf(e))
        return
      }
      await deps.reloadHomes()
    },
  }
}
