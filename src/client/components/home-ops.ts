/** 绿框家/助理写管道（owner：components 系本票领地；panel-actions.ts 旧流程冻结保留，connect-qr 钉住）。
 * 家经自有桥 home.*；绑定先走 dsh-im bot.workspace.set（5 次×2s 竞态重试，T1 §2.3）再落表；写后刷新。 */
import { toast } from '../ui/toast'
import type { RpcCall } from '../data/fleet-api'
import { basenameOf, normPath, type Assistant, type Home, type WorkspaceRef } from '../data/home-model'
import { openConnectFlow } from './connect-flow'

const BRIDGE = '/im-companion'

type BridgeOk<T> = { ok?: boolean; value?: T; error?: { code?: string; message?: string } } | null

async function bridge<T>(rpc: RpcCall, endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const raw = await rpc(BRIDGE, endpoint, payload, AbortSignal.timeout(8000)) as BridgeOk<T>
  if (!raw || raw.ok !== true || raw.value === undefined) {
    const e = new Error(raw?.error?.message ?? 'host 桥调用失败') as Error & { code?: string }
    e.code = raw?.error?.code
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

/** 种子落盘（幂等：宿主按规范路径/bot 判重跳过，可重跑；已存在行原样返回映射）。
 * 宿主半**未必是最新**（宿主代码只在插件重载/重启时生效，客户端 Ctrl+F5 不会）：旧宿主没有 `home.seed`，
 * 故失败即回落到「逐行 home.create ＋ assistant.create」（这两个端点早一轮就有），
 * 保证「有家无助理」的空窗不会因为宿主半落后而出现；回落同样幂等（already-exists/already-bound 吞掉）。 */
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
  } catch {
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
    if (v.home) toast('建家成功', 'check')
    return v.home ?? null
  } catch (e) {
    toast('建家失败：' + String((e as Error)?.message ?? e))
    return null
  }
}

/** dsh-im 渠道绑定（connect-flow/binding-commit 同口径重试；本函数不落助理表，由调用方接 assistant.create）。 */
export async function bindBot(rpc: RpcCall, channel: string, botId: string, workspace: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    try {
      const raw = await rpc('/' + channel, 'bot.workspace.set', { botId, workspace }, AbortSignal.timeout(8000)) as
        { ok?: boolean; error?: { code?: string; message?: string } } | null
      if (raw && raw.ok === true) return true
      if ((raw?.error as { code?: string })?.code === 'workspace-bot-not-found' && i < 4) {
        if (i === 0) toast('服务端正在登记新机器人，绑定稍候重试…')
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      toast('绑定失败：' + String(raw?.error?.message ?? '绑定失败'))
      return false
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      if (msg.includes('workspace-bot-not-found') && i < 4) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      toast('绑定失败：' + msg)
      return false
    }
  }
  return false
}

export async function createAssistant(
  rpc: RpcCall,
  input: { homeId: string; channel: string; botId: string; botName: string; homeText: string },
): Promise<Assistant | null> {
  try {
    const v = await bridge<{ assistant?: Assistant }>(rpc, 'assistant.create', input)
    if (v.assistant) toast('建助理并绑定成功', 'check')
    return v.assistant ?? null
  } catch (e) {
    toast('建助理失败：' + String((e as Error)?.message ?? e))
    return null
  }
}

/** T6b #114：改名/配图（空名=恢复默认）、占位、绑定、删助理（只删行不断连）。 */
export async function updateHome(rpc: RpcCall, input: { id: string; name?: string | null; avatar?: string | null }): Promise<Home | null> {
  try {
    const v = await bridge<{ home?: Home }>(rpc, 'home.update', input as Record<string, unknown>)
    if (v.home) toast(input.name === '' ? '已恢复默认名' : input.name !== undefined ? '改名成功' : '头像已更新', 'check')
    return v.home ?? null
  } catch (e) {
    toast('家更新失败：' + String((e as Error)?.message ?? e))
    return null
  }
}

export async function updateAssistant(rpc: RpcCall, input: { id: string; name?: string | null; avatar?: string | null }): Promise<Assistant | null> {
  try {
    const v = await bridge<{ assistant?: Assistant }>(rpc, 'assistant.update', input as Record<string, unknown>)
    if (v.assistant) toast(input.name === '' ? '已恢复默认名' : input.name !== undefined ? '改名成功' : '头像已更新', 'check')
    return v.assistant ?? null
  } catch (e) {
    toast('助理更新失败：' + String((e as Error)?.message ?? e))
    return null
  }
}

export async function createUnbound(rpc: RpcCall, input: { homeId: string; channel: string; name?: string }): Promise<Assistant | null> {
  try {
    const v = await bridge<{ assistant?: Assistant }>(rpc, 'assistant.createUnbound', input as Record<string, unknown>)
    if (v.assistant) toast('未绑定助理已占位', 'check')
    return v.assistant ?? null
  } catch (e) {
    toast('建占位失败：' + String((e as Error)?.message ?? e))
    return null
  }
}

export async function removeAssistant(rpc: RpcCall, id: string): Promise<boolean> {
  try {
    await bridge(rpc, 'assistant.remove', { id })
    toast('助理已删除（机器人连接保留）', 'check')
    return true
  } catch (e) {
    toast('删除失败：' + String((e as Error)?.message ?? e))
    return false
  }
}

export function workspaceChoices(ws: WorkspaceRef[]): { id: string; label: string }[] {
  return (ws || []).filter((w) => w && w.workspaceId && w.path)
    .map((w) => ({ id: w.workspaceId, label: (w.title || w.path) + '（' + w.path + '）' }))
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
  createAssistant(homeId: string, channel: string, botId: string, userName?: string): Promise<void>
  updateHome(id: string, patch: { name?: string | null; avatar?: string | null }): Promise<void>
  updateAssistant(id: string, patch: { name?: string | null; avatar?: string | null }): Promise<void>
  createUnbound(homeId: string, channel: string, name?: string): Promise<void>
  bindAssistant(id: string, channel: string, botId: string): Promise<void>
  removeAssistant(id: string): Promise<void>
  connect(homeId: string, anchor: HTMLElement): void
}

export function createDrillOps(deps: DrillOpsDeps): DrillOpsBundle {
  return {
    createHome: async (workspaceId: string) => {
      const rpc = deps.getRpc()
      if (!rpc) {
        toast('连接服务不可用')
        return
      }
      const w = deps.getWorkspaces().find((x) => x.workspaceId === workspaceId)
      if (!w) {
        toast('没找着这个工作区')
        return
      }
      if (await createHome(rpc, { workspaceId: w.workspaceId, path: w.path, title: w.title })) await deps.reloadHomes()
    },
    createAssistant: async (homeId: string, channel: string, botId: string, userName?: string) => {
      const rpc = deps.getRpc()
      if (!rpc) {
        toast('连接服务不可用')
        return
      }
      const home = deps.getHome(homeId)
      const bot = deps.getBot(channel, botId)
      if (!home || !bot) {
        toast('没找着这个家或机器人')
        return
      }
      if (!await bindBot(rpc, channel, botId, home.path)) return
      const row = await createAssistant(rpc, {
        homeId: home.id, channel, botId, botName: bot.botName ?? '', homeText: '',
      })
      if (row) {
        /* 先读表再刷新：反过来快照会拿旧名单误判缺口（home-create-flow 已钉）。 */
        const want = (userName ?? '').trim()
        if (want) await updateAssistant(rpc, { id: row.id, name: want })
        await deps.reloadHomes()
        await deps.refresh()
      }
    },
    updateHome: async (id, patch) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); return }
      if (await updateHome(rpc, { id, ...patch })) await deps.reloadHomes()
    },
    updateAssistant: async (id, patch) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); return }
      if (await updateAssistant(rpc, { id, ...patch })) await deps.reloadHomes()
    },
    createUnbound: async (homeId, channel, name) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); return }
      if (await createUnbound(rpc, { homeId, channel, name })) await deps.reloadHomes()
    },
    bindAssistant: async (id, channel, botId) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); return }
      const a = deps.getAssistant(id)
      const bot = deps.getBot(channel, botId)
      if (!a || !bot) { toast('没找着这个助理或机器人'); return }
      const home = deps.getHome(a.homeId)
      if (!home) { toast('没找着这个家'); return }
      if (!await bindBot(rpc, channel, botId, home.path)) return
      try {
        await bridge<{ assistant?: Assistant }>(rpc, 'assistant.bind', {
          id, channel, botId, botName: bot.botName ?? '', homeText: '',
        })
        toast('绑定成功', 'check')
        await deps.reloadHomes()
        await deps.refresh()
      } catch (e) {
        toast('绑定失败：' + String((e as Error)?.message ?? e))
      }
    },
    removeAssistant: async (id) => {
      const rpc = deps.getRpc()
      if (!rpc) { toast('连接服务不可用'); return }
      if (await removeAssistant(rpc, id)) await deps.reloadHomes()
    },
    connect: (homeId: string, anchor: HTMLElement) => {
      const home = deps.getHome(homeId)
      if (!home) {
        toast('没找着这个家')
        return
      }
      const name = home.name || basenameOf(home.path) || home.path
      openConnectFlow(deps.ctx, deps.getRpc(), anchor, { name, workspace: home.path }, () => {
        void deps.refresh().then(() => deps.reloadHomes())
      })
    },
  }
}
