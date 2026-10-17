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
  /** T10b #127：家级编排（重绑/删家）要能拿到「这个家下面的助理」，故按整表取。 */
  getAssistants(): Assistant[]
  reloadHomes(): Promise<void>
  refresh(): Promise<void>
}

export interface MoveOps {
  moveAssistant(id: string, targetHomeId: string): Promise<void>
  unbindAssistant(id: string): Promise<void>
  /** 删助理（T6c clean 版，覆盖 drill 旧版）：已绑先清空工作区再删行，防种子复活；不断连接。 */
  removeAssistant(id: string): Promise<void>
  /** 重绑（T10b #127「选择工作区」）：家改指新工作区；已绑助理先远端跟随（新目录）再落表，失败回滚。
   *  **失败一律 throw（带原文）**：调用方是孤儿家弹层，它要就地显示拒绝原因（如宿主回的「该工作区已有家」）
   *  并把按钮恢复可点；静默 return 会让「点了没反应」重新长出来（T8 #121 A 款修法同口径）。 */
  rebindHome(homeId: string, workspaceId: string, path: string): Promise<void>
  /** 删除家（T10b #127）：先清各已绑助理的远端工作区（fail-closed），再打墓碑＋级联删助理行；机器人不断连。 */
  removeHome(homeId: string): Promise<void>
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
          /* fromHomeId/followBot 只进宿主诚实日志（log-sites 纠正 from/to），落表只认 id/targetHomeId。 */
          await bridge(rpc, 'assistant.move', { id, targetHomeId, fromHomeId: a.homeId, followBot: true })
        } catch (e) {
          try { if (src) await bindBot(rpc, a.channel, a.botId, src.path) } catch { /* 回滚尽力 */ }
          toast('搬家失败，已恢复原样：' + msgOf(e)); aLog('move', id, false, '搬家失败并已回滚远端：' + msgOf(e))
          return
        }
      } else {
        try {
          await bridge(rpc, 'assistant.move', { id, targetHomeId, fromHomeId: a.homeId, followBot: false })
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
    /* —— T10b #127：家级编排（重绑 / 删家）——顺序铁律与上面同款：已绑行先 bot.workspace.set 再落表；
     * 落表失败回滚远端；写后先 reloadHomes 再 refresh。远端一律 fail-closed：清不动就不动表（不留半行）。 */
    rebindHome: async (homeId, workspaceId, path) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('rebind-home', homeId, false, '连接服务不可用'); throw new Error('连接服务不可用') }
      const home = deps.getHome(homeId)
      if (!home) { toast('找不到这个家'); aLog('rebind-home', homeId, false, '找不到这个家'); throw new Error('找不到这个家') }
      if (home.tombstone) { toast('家已删除，不能再重绑'); aLog('rebind-home', homeId, false, '家已删除'); throw new Error('家已删除，不能再重绑') }
      const bound = deps.getAssistants().filter((a): a is Assistant & { botId: string } => a.homeId === homeId && a.status === 'bound' && !!a.botId)
      for (const a of bound) {
        /* 远端先跟随；切不过去就中止——表一行不写（fail-closed），弹层拿到原文可重试。 */
        if (!await bindBot(rpc, a.channel, a.botId, path)) throw new Error('远端工作区没切过去，已中止：家的记录一行没写')
      }
      try {
        await bridge(rpc, 'home.rebind', { id: homeId, workspaceId, path })
      } catch (e) {
        for (const a of bound) { try { await bindBot(rpc, a.channel, a.botId, home.path) } catch { /* 回滚尽力 */ } }
        toast('重绑失败，已恢复原样：' + msgOf(e)); aLog('rebind-home', homeId, false, '重绑失败并已回滚远端：' + msgOf(e))
        throw new Error(msgOf(e))
      }
      toast('已重绑到新工作区', 'check'); aLog('rebind-home', homeId, true, '→ ' + path)
      await deps.reloadHomes()
      await deps.refresh()
    },
    removeHome: async (homeId) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('remove-home', homeId, false, '连接服务不可用'); throw new Error('连接服务不可用') }
      const home = deps.getHome(homeId)
      if (!home) { toast('找不到这个家'); aLog('remove-home', homeId, false, '找不到这个家'); throw new Error('找不到这个家') }
      const all = deps.getAssistants().filter((a) => a.homeId === homeId)
      const bound = all.filter((a): a is Assistant & { botId: string } => a.status === 'bound' && !!a.botId)
      /* 先清远端：家要没了，机器人还指着老目录＝看不见的脏状态；清不动就中止（表一行不写）。 */
      for (const a of bound) {
        if (!await bindBot(rpc, a.channel, a.botId, '')) throw new Error('远端工作区没清掉，已中止：家的记录一行没写')
      }
      try {
        await bridge(rpc, 'home.remove', { id: homeId })
        toast(all.length ? `家已删除：它的 ${all.length} 位助理一并删除（机器人连接保留）` : '家已删除', 'check')
        aLog('remove-home', homeId, true, 'assistants=' + all.length)
      } catch (e) {
        for (const a of bound) { try { await bindBot(rpc, a.channel, a.botId, home.path) } catch { /* 回滚尽力 */ } }
        toast('删除失败，已恢复原样：' + msgOf(e)); aLog('remove-home', homeId, false, msgOf(e))
        throw new Error(msgOf(e))
      }
      await deps.reloadHomes()
      await deps.refresh()
    },
  }
}
