/** 绿框家/助理写管道（owner：components 系本票领地；panel-actions.ts 旧流程冻结保留，connect-qr 钉住）。
 * 家经自有桥 home.*；绑定先走 dsh-im bot.workspace.set（5 次×2s 竞态重试，T1 §2.3）再落表；写后刷新。
 * T8 #121：新建家的「新建工作区」支路（选目录→DSH 建区→等投影）下沉 home-dir，本文件只接线。 */
import { toast } from '../ui/toast'
import type { RpcCall } from '../data/fleet-api'
import { basenameOf, normPath, type Assistant, type AssistantFieldsValue, type Home, type WorkspaceRef } from '../data/home-model'
import { openConnectFlow } from './connect-flow'
import { adoptDirectory, pickDirectory } from './home-dir'
import { logLine, logOn } from '../log'

const BRIDGE = '/im-companion'

/* 家/助理动作的统一出口（成功失败同事件名；失败必带原文）——两条只认字面事件名与字段名，别改成变量。 */
export const hLog = (action: string, homeId: string, ok: boolean, message: string): void =>
  logLine('info', 'home.action', { action, homeId, ok, message })
export const aLog = (action: string, assistantId: string, ok: boolean, message: string): void =>
  logLine('info', 'assistant.action', { action, assistantId, ok, message })
export const msgOf = (e: unknown): string => String((e as Error)?.message ?? e)

type BridgeOk<T> = { ok?: boolean; value?: T; error?: { code?: string; message?: string } } | null

export async function bridge<T>(rpc: RpcCall, endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const raw = await rpc(BRIDGE, endpoint, payload, AbortSignal.timeout(8000)) as BridgeOk<T>
  if (!raw || raw.ok !== true || raw.value === undefined) {
    const e = new Error(raw?.error?.message ?? 'host 桥调用失败') as Error & { code?: string }
    e.code = raw?.error?.code
    /* 端点级失败（老宿主缺端点 / 桥抖动 / 参数被拒）：原文必留，调用方回退行为据此才解释得通。 */
    logLine('warn', 'bridge.call.fail', { method: endpoint, message: e.message })
    throw e
  }
  return raw.value
}

export async function listHomes(rpc: RpcCall): Promise<{ homes: Home[]; assistants: Assistant[] }> {
  try {
    const v = await bridge<{ homes?: Home[]; assistants?: Assistant[] }>(rpc, 'home.list', {})
    return { homes: Array.isArray(v.homes) ? v.homes : [], assistants: Array.isArray(v.assistants) ? v.assistants : [] }
  } catch {
    return { homes: [], assistants: [] }
  }
}

/** 种子落盘（幂等可重跑；旧宿主无 `home.seed` ⇒ 回落逐行建家/补助理，无空窗）。 */
export async function seedHomes(
  rpc: RpcCall,
  seed: { homes: Home[]; assistants: Assistant[] },
): Promise<{ homes: Home[]; assistants: Assistant[] }> {
  if (!seed.homes.length && !seed.assistants.length) return { homes: [], assistants: [] }
  try {
    const v = await bridge<{ homes: Home[]; assistants: Assistant[] }>(rpc, 'home.seed', {
      homes: seed.homes,
      assistants: seed.assistants,
    })
    return { homes: v.homes ?? [], assistants: v.assistants ?? [] }
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'homes', action: 'seed-fallback', ok: false, message: msgOf(e) })
    return seedByRows(rpc, seed)
  }
}

/** 回落种子：一行一端点，建完再 list 拿宿主真 id（种子里的 homeId 是客户端临时 id，宿主不认识）。 */
async function seedByRows(
  rpc: RpcCall,
  seed: { homes: Home[]; assistants: Assistant[] },
): Promise<{ homes: Home[]; assistants: Assistant[] }> {
  for (const h of seed.homes) {
    // title 只在「名字不是目录基名」时带（保住旧改名/工作区标题的可见名；回落路径不保 nameSource 冻结态）。
    const title = h.name && h.name !== basenameOf(h.path) ? h.name : ''
    try {
      await bridge(rpc, 'home.create', { workspaceId: h.workspaceId ?? '', path: h.path, title })
    } catch { /* already-exists / 坏行：跳过即可（幂等） */ }
  }
  const after = await listHomes(rpc)
  const byPath = new Map(after.homes.map((h) => [normPath(h.path), h.id]))
  for (const a of seed.assistants) {
    const temp = seed.homes.find((h) => h.id === a.homeId)
    const homeId = temp ? byPath.get(normPath(temp.path)) : undefined
    if (!homeId) continue
    const isBot = a.nameSource === 'bot'
    try {
      await bridge(rpc, 'assistant.create', {
        homeId, channel: a.channel, botId: a.botId ?? '',
        botName: isBot ? a.name : '', homeText: isBot ? '' : a.name,
      })
    } catch { /* already-bound / 坏行：跳过即可（幂等） */ }
  }
  return listHomes(rpc)
}

export async function createHome(
  rpc: RpcCall,
  input: { workspaceId: string; path: string; title: string },
): Promise<Home | null> {
  try {
    const v = await bridge<{ home?: Home }>(rpc, 'home.create', input)
    if (v.home) { toast('建家成功', 'check'); hLog('create', v.home.id, true, '') } else hLog('create', '', false, '宿主未返回家行')
    return v.home ?? null
  } catch (e) {
    hLog('create', '', false, msgOf(e)); toast('建家失败：' + msgOf(e))
    throw e /* 原文上抛：调用方灰字带原因（T8 #121 验收⑤「不吞细节」）；null 只留给「宿主未返回家行」。 */
  }
}

/** dsh-im 渠道绑定（connect-flow/binding-commit 同口径重试；本函数不落助理表，由调用方接 assistant.create）。 */
export async function bindBot(rpc: RpcCall, channel: string, botId: string, workspace: string): Promise<boolean> {
  const target = channel + '/' + botId
  for (let i = 0; i < 5; i++) {
    try {
      const raw = await rpc('/' + channel, 'bot.workspace.set', { botId, workspace }, AbortSignal.timeout(8000)) as
        { ok?: boolean; error?: { code?: string; message?: string } } | null
      if (raw && raw.ok === true) { aLog('bind-bot', '', true, target); return true }
      if ((raw?.error as { code?: string })?.code === 'workspace-bot-not-found' && i < 4) {
        if (i === 0) toast('机器人还没就绪，请稍后重试')
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      toast('绑定失败：' + String(raw?.error?.message ?? '绑定失败')); aLog('bind-bot', '', false, target + ': ' + String(raw?.error?.message ?? '绑定失败'))
      return false
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      if (msg.includes('workspace-bot-not-found') && i < 4) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      toast('绑定失败：' + msg); aLog('bind-bot', '', false, target + ': ' + msg)
      return false
    }
  }
  aLog('bind-bot', '', false, target + ': 重试 5 次仍未成功')
  return false
}

export async function createAssistant(
  rpc: RpcCall,
  input: { homeId: string; channel: string; botId: string; botName: string; homeText: string } & AssistantFieldsValue,
): Promise<Assistant | null> {
  try {
    const v = await bridge<{ assistant?: Assistant }>(rpc, 'assistant.create', input)
    if (v.assistant) { toast('建助理并绑定成功', 'check'); aLog('create', v.assistant.id, true, '') } else aLog('create', '', false, '宿主未返回助理行')
    return v.assistant ?? null
  } catch (e) {
    aLog('create', '', false, msgOf(e)); toast('建助理失败：' + msgOf(e))
    return null
  }
}

/** T6b #114：改名/配图/占位/绑定/删助理（只删行不断连）；`quiet`＝行内就地改名自带锚定提示（`home-toast.ts`），这条不再叠系统 toast（owner 2026-10-17③）。 */
export async function updateHome(rpc: RpcCall, input: { id: string; name?: string | null; avatar?: string | null }, quiet = false): Promise<Home | null> {
  try {
    const v = await bridge<{ home?: Home }>(rpc, 'home.update', input as Record<string, unknown>)
    if (v.home) { if (!quiet) toast(input.name === '' ? '已恢复默认名' : input.name !== undefined ? '改名成功' : '头像已更新', 'check', input.name === undefined ? undefined : 'home-ui hu-toast-top'); hLog('update', v.home.id, true, '') } else hLog('update', input.id, false, '宿主未返回家行')
    return v.home ?? null
  } catch (e) {
    hLog('update', input.id, false, msgOf(e)); toast('家更新失败：' + msgOf(e))
    return null
  }
}

export async function updateAssistant(rpc: RpcCall, input: { id: string; name?: string | null; avatar?: string | null } & AssistantFieldsValue, quiet = false): Promise<Assistant | null> {
  try {
    const v = await bridge<{ assistant?: Assistant }>(rpc, 'assistant.update', input as Record<string, unknown>)
    if (v.assistant) { if (!quiet) toast(input.name === '' ? '已恢复默认名' : input.name !== undefined ? '改名成功' : '头像已更新', 'check', input.name === undefined ? undefined : 'home-ui hu-toast-top'); aLog('update', v.assistant.id, true, '') } else aLog('update', input.id, false, '宿主未返回助理行')
    return v.assistant ?? null
  } catch (e) {
    aLog('update', input.id, false, msgOf(e)); toast('助理更新失败：' + msgOf(e))
    return null
  }
}

export async function createUnbound(rpc: RpcCall, input: { homeId: string; name?: string } & AssistantFieldsValue): Promise<Assistant | null> {
  try {
    const v = await bridge<{ assistant?: Assistant }>(rpc, 'assistant.createUnbound', input as Record<string, unknown>)
    if (v.assistant) { toast('已建好助理，还没有绑机器人', 'check'); aLog('create-unbound', v.assistant.id, true, '') } else aLog('create-unbound', '', false, '宿主未返回助理行')
    return v.assistant ?? null
  } catch (e) {
    aLog('create-unbound', '', false, msgOf(e)); toast('建占位失败：' + msgOf(e))
    return null
  }
}

export async function removeAssistant(rpc: RpcCall, id: string): Promise<boolean> {
  try {
    await bridge(rpc, 'assistant.remove', { id })
    toast('助理已删除（机器人连接保留）', 'check')
    aLog('remove', id, true, '')
    return true
  } catch (e) {
    aLog('remove', id, false, msgOf(e)); toast('删除失败：' + msgOf(e))
    return false
  }
}

/* 绿框写管道编排（从 panel.ts 下沉） */

export interface DrillOpsDeps {
  ctx: unknown
  getRpc(): RpcCall | null
  getWorkspaces(): WorkspaceRef[]
  getHome(id: string): Home | undefined
  getAssistant(id: string): Assistant | undefined
  getBot(channel: string, botId: string): { botName?: string } | undefined
  refresh(): Promise<void>
  reloadHomes(): Promise<void>
}

export interface DrillOpsBundle {
  createHome(workspaceId: string): Promise<void>
  createAssistant(homeId: string, channel: string, botId: string, userName?: string, fields?: AssistantFieldsValue): Promise<void>
  updateHome(id: string, patch: { name?: string | null; avatar?: string | null }, quiet?: boolean): Promise<boolean>
  updateAssistant(id: string, patch: { name?: string | null; avatar?: string | null } & AssistantFieldsValue, quiet?: boolean): Promise<boolean>
  createUnbound(homeId: string, name?: string, fields?: AssistantFieldsValue): Promise<void> /* #138：不再要 channel（未绑定＝没有渠道） */
  bindAssistant(id: string, channel: string, botId: string): Promise<void>
  removeAssistant(id: string): Promise<void>
  connect(homeId: string, anchor: HTMLElement, assistantId?: string, after?: (ok: boolean) => void): void
  pickDirectory(): Promise<string | null>
  adoptDirectory(dir: string): Promise<WorkspaceRef | null>
}

export function createDrillOps(deps: DrillOpsDeps): DrillOpsBundle {
  return {
    createHome: async (workspaceId: string) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); hLog('create', '', false, '连接服务不可用'); throw new Error('连接服务不可用') }
      const w = deps.getWorkspaces().find((x) => x.workspaceId === workspaceId)
      if (!w) { toast('找不到这个工作区'); hLog('create', '', false, '找不到这个工作区：' + workspaceId); throw new Error('找不到这个工作区') }
      const home = await createHome(rpc, { workspaceId: w.workspaceId, path: w.path, title: w.title }).catch((e) => { throw new Error('家的记录没写成功：' + msgOf(e)) })
      if (!home) throw new Error('家的记录没写成功：宿主未返回家行')
      await deps.reloadHomes()
    },
    createAssistant: async (homeId: string, channel: string, botId: string, userName?: string, fields?: AssistantFieldsValue) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('create', '', false, '连接服务不可用'); return }
      const home = deps.getHome(homeId)
      const bot = deps.getBot(channel, botId)
      if (!home || !bot) { toast('找不到这个家或机器人'); aLog('create', '', false, '找不到这个家或机器人：' + [homeId, channel, botId].join('/')); return }
      if (!await bindBot(rpc, channel, botId, home.path)) return
      const row = await createAssistant(rpc, {
        homeId: home.id, channel, botId, botName: bot.botName ?? '', homeText: '', ...fields,
      })
      if (row) {
        /* 先读表再刷新：反过来快照会拿旧名单误判缺口（home-create-flow 已钉）。 */
        const want = (userName ?? '').trim()
        if (want) await updateAssistant(rpc, { id: row.id, name: want })
        await deps.reloadHomes()
        await deps.refresh()
      }
    },
    updateHome: async (id, patch, quiet) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); hLog('update', id, false, '连接服务不可用'); return false }
      const row = await updateHome(rpc, { id, ...patch }, quiet); if (row) await deps.reloadHomes(); return row !== null
    },
    updateAssistant: async (id, patch, quiet) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('update', id, false, '连接服务不可用'); return false }
      const row = await updateAssistant(rpc, { id, ...patch }, quiet); if (row) await deps.reloadHomes(); return row !== null
    },
    createUnbound: async (homeId, name, fields) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('create-unbound', '', false, '连接服务不可用'); return }
      if (await createUnbound(rpc, { homeId, name, ...fields })) await deps.reloadHomes()
    },
    bindAssistant: async (id, channel, botId) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('bind', id, false, '连接服务不可用'); return }
      const a = deps.getAssistant(id)
      const bot = deps.getBot(channel, botId)
      if (!a || !bot) { toast('找不到这个助理或机器人'); aLog('bind', id, false, '找不到这个助理或机器人：' + channel + '/' + botId); return }
      const home = deps.getHome(a.homeId)
      if (!home) { toast('找不到这个家'); aLog('bind', id, false, '找不到这个家：' + a.homeId); return }
      if (!await bindBot(rpc, channel, botId, home.path)) return
      try {
        await bridge<{ assistant?: Assistant }>(rpc, 'assistant.bind', {
          id, channel, botId, botName: bot.botName ?? '', homeText: '',
        })
        toast('绑定成功', 'check'); aLog('bind', id, true, '')
        await deps.reloadHomes()
        await deps.refresh()
      } catch (e) {
        toast('绑定失败：' + msgOf(e)); aLog('bind', id, false, msgOf(e))
      }
    },
    removeAssistant: async (id) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); aLog('remove', id, false, '连接服务不可用'); return }
      if (await removeAssistant(rpc, id)) await deps.reloadHomes()
    },
    /* T8 #121：新建家的「新建工作区」支路——选目录（原生优先）→ DSH 建区＋等投影；落家仍由表单接 createHome。 */
    pickDirectory: () => pickDirectory(deps.ctx, deps.getRpc()),
    adoptDirectory: async (dir: string) => (await adoptDirectory(deps.ctx, dir))?.ref ?? null,
    connect: (homeId, anchor, assistantId, after) => {
      const home = deps.getHome(homeId)
      if (!home) { toast('找不到这个家'); hLog('connect', homeId, false, '找不到这个家'); return }
      const name = home.name || basenameOf(home.path) || home.path
      openConnectFlow(deps.ctx, deps.getRpc(), anchor, { name, workspace: home.path, assistantId, menuAtTop: true }, (ok) => {
        void deps.refresh().then(() => deps.reloadHomes()).then(() => after?.(ok === true))
      })
    },
  }
}
