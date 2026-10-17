/** host 桥端点分发：/im-companion 渠道下各 endpoint → AgentMetaStore / 文件系统浏览。 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { AgentMetaStore } from './meta-store.js'
import { collectRoutes } from './routes.js'
import { collectActivity } from './activity.js'
import { createAssistantRow, createHomeRow, homesFileFor, loadHomesDoc, seedDocs } from './home-store.js'
import { bindAssistantRow, createUnboundRow, removeAssistantRow, updateAssistantRow, updateHomeRow } from './home-edit.js'
import { moveAssistantRow, unbindAssistantRow } from './home-move.js'
import { rebindHomeRow, removeHomeRow } from './home-orphan.js'
import { avatarPhone } from './home-avatar.js'
import { withRpcLog, type HostLogHandle, type LogPhoneRegistry } from './log.js'
import { handleMetaCase } from './rpc-meta.js'
import { configDirFor, listConfigFiles } from './config-yaml.js'
import { openDir } from './open-dir.js'

export type RpcPayload = Record<string, unknown>

export type RpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }

/** 更新系统宿主侧的**端口**（T7 #90）：本文件只声明它要什么，不 import 任何更新系统模块——
 *  端点名→处理器的表、以及「包载荷 → 本仓信封」的翻译都归 `src/host/update.ts`。
 *  取成**提供函数**而非对象：装配方在「路由已注册」的让位分支上根本不会建出实现，
 *  故那一路径上既没有定时器、也没有 case 会被服务到（票面 §F.2）。 */
export interface UpdateHostSurface {
  handlers: Record<string, (payload?: unknown) => Promise<unknown>>
  reply(pkgReply: unknown): RpcResult
}

export interface AgentFleetHandlerOptions {
  dshHome?: string
  update?: () => UpdateHostSurface | null
  /** 日志（T9 #123）：取成提供函数——让位分支上它一直是 null，那个实例不建日志、不碰日志目录。 */
  log?: () => HostLogHandle | null
  /** dsh-log 的电话注册表：命中即转给它（电话名与入参形状全归包，本仓不拼字符串）。 */
  logPhones?: LogPhoneRegistry | null
}

const ok = (value: unknown): RpcResult => ({ ok: true, value })
const fail = (code: string, message: string): RpcResult => ({ ok: false, error: { code, message, details: {} } })

/** 可达根目录：Windows 枚举现存盘符，POSIX 返回根（供 picker 一键直达任意位置）。 */
async function listRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return ['/']
  const found: string[] = []
  for (let code = 65; code <= 90; code++) {
    const root = String.fromCharCode(code) + ':\\'
    try { await fs.access(root); found.push(root) } catch { /* 不存在的盘符跳过 */ }
  }
  return found.length ? found : [homedir()]
}

async function listDirectories(dir: string): Promise<{ name: string; path: string }[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const entries = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .slice(0, 300)
  return entries.map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
}
/** 桥分发器。T9 #125 起多收一个**独立**的第 4 参 `traceId`（客户端会话链 id，随桥内层 payload 下来）：
 * 它**只进日志行**（`withRpcLog` 的 fields），不是任何端点的入参——入口 `src/index.ts` 已把它从 payload 摘掉，
 * 分发器这一层（以及其下所有端点）**看不见**它，故 300 行分发主体一字未动。 */
export function createAgentFleetHandler(store: AgentMetaStore, opts: AgentFleetHandlerOptions = {}): (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null, traceId?: string | null) => Promise<RpcResult> {
  const dispatch = async (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null): Promise<RpcResult> => {
    if (signal?.aborted) return fail('cancelled', '已取消')
    const p = payload ?? {}
    /* 日志电话（logBatch/logExport/logClear/logGetSwitch/logSetSwitch/logQuery）优先于业务端点表。 */
    if (opts.logPhones?.has(endpoint)) return ok(await opts.logPhones.get(endpoint)!(p as never))
    const dshHome = typeof opts.dshHome === 'string' && opts.dshHome ? opts.dshHome : path.join(homedir(), '.dsh')
    try {
      /* `meta.*` 端点块已整体搬去 `rpc-meta.ts`（T12 #129：本文件顶 300 行红线，腾行给配置两通电话）。
       * 搬家 ≠ 改行为：它命中就回结果，不是 `meta.*` 回 null 交下面主 switch。 */
      const meta = await handleMetaCase(endpoint, p, store)
      if (meta) return meta
      switch (endpoint) {
        case 'ping':
          return ok({ pong: Date.now() })
        case 'routes.list': {
          const bots = Array.isArray(p.bots) ? p.bots as { channel?: unknown; botId?: unknown }[] : null
          if (!bots) return fail('bad-request', 'bots 数组必填')
          const home = dshHome
          const seen = new Set<string>()
          const clean = bots.filter((b) => {
            const k = String(b?.channel ?? '') + '\0' + String(b?.botId ?? '')
            if (seen.has(k) || seen.size >= 200) return false
            seen.add(k)
            return true
          }).map((b) => ({ channel: String(b?.channel ?? ''), botId: String(b?.botId ?? '') }))
          return ok(await collectRoutes(home, clean))
        }
        case 'activity.snapshot': {
          const now = Date.now()
          return ok(await collectActivity(dshHome, now))
        }
        case 'fs.defaultRoot':
          return ok({ path: homedir() })
        case 'fs.roots':
          return ok({ roots: await listRoots() })
        case 'fs.list': {
          const dir = String(p.path ?? '')
          if (!dir || !path.isAbsolute(dir)) return fail('bad-request', '需要绝对路径')
          const entries = await listDirectories(dir)
          return ok({ path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), entries })
        }
        // ── T6a #113 追加（Added-only，只追加 case）：家/助理新表三端点，旧 Agent 码不动。
        // 存储见 src/host/home-store.ts（homes.json，version:2）；形状与 T3 #116 速记同形。
        case 'home.list': {
          const doc = await loadHomesDoc(homesFileFor(dshHome))
          return ok({ homes: doc.homes, assistants: doc.assistants })
        }
        case 'home.create': {
          const r = await createHomeRow(homesFileFor(dshHome), {
            workspaceId: String(p.workspaceId ?? ''),
            path: String(p.path ?? ''),
            title: String(p.title ?? ''),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ home: r.home })
        }
        case 'assistant.create': {
          const r = await createAssistantRow(homesFileFor(dshHome), {
            homeId: String(p.homeId ?? ''),
            channel: String(p.channel ?? ''),
            botId: String(p.botId ?? ''),
            botName: String(p.botName ?? ''),
            homeText: String(p.homeText ?? ''),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ assistant: r.assistant })
        }
        case 'home.seed': {
          const r = await seedDocs(homesFileFor(dshHome), {
            homes: Array.isArray(p.homes) ? p.homes as never[] : [],
            assistants: Array.isArray(p.assistants) ? p.assistants as never[] : [],
          })
          return ok({ homes: r.homes, assistants: r.assistants })
        }
        // ── T6b #114 追加（Added-only，只追加 case）：改名/配图/占位/绑定/删除，旧码不动。
        case 'home.update': {
          const r: any = await updateHomeRow(homesFileFor(dshHome), {
            id: String(p.id ?? ''),
            ...(p.name !== undefined ? { name: p.name as string | null } : {}),
            ...(p.avatar !== undefined ? { avatar: p.avatar as string | null } : {}),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ home: r.row })
        }
        case 'assistant.update': {
          const r: any = await updateAssistantRow(homesFileFor(dshHome), {
            id: String(p.id ?? ''),
            ...(p.name !== undefined ? { name: p.name as string | null } : {}),
            ...(p.avatar !== undefined ? { avatar: p.avatar as string | null } : {}),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ assistant: r.row })
        }
        case 'assistant.createUnbound': {
          /* #138 渠道诚实性：不再传 channel——未绑定助理**没有渠道**，宿主 createUnboundRow 也不再要求。 */
          const r: any = await createUnboundRow(homesFileFor(dshHome), {
            homeId: String(p.homeId ?? ''),
            ...(p.name !== undefined ? { name: String(p.name ?? '') } : {}),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ assistant: r.row })
        }
        case 'assistant.bind': {
          const r: any = await bindAssistantRow(homesFileFor(dshHome), {
            id: String(p.id ?? ''), channel: String(p.channel ?? ''), botId: String(p.botId ?? ''),
            botName: String(p.botName ?? ''), homeText: String(p.homeText ?? ''),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ assistant: r.row })
        }
        case 'assistant.remove': {
          const r: any = await removeAssistantRow(homesFileFor(dshHome), { id: String(p.id ?? '') })
          if (!r.ok) return fail(r.code, r.message)
          return ok({})
        }
        // ── T6c #115 追加（Added-only，只追加 case）：搬家 / 解绑（显式移除·孤儿回落），旧码不动。
        case 'assistant.move': {
          const r: any = await moveAssistantRow(homesFileFor(dshHome), {
            id: String(p.id ?? ''), targetHomeId: String(p.targetHomeId ?? ''),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ assistant: r.row })
        }
        case 'assistant.unbind': {
          const r: any = await unbindAssistantRow(homesFileFor(dshHome), {
            id: String(p.id ?? ''), orphan: p.orphan === true,
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ assistant: r.row })
        }
        // ── T10b #127 追加（Added-only，只追加 case）：孤儿家两通电话——重绑到新工作区 / 删除家（墓碑＋级联清助理行）。
        case 'home.rebind': {
          const r: any = await rebindHomeRow(homesFileFor(dshHome), {
            id: String(p.id ?? ''), workspaceId: String(p.workspaceId ?? ''), path: String(p.path ?? ''),
            ...(p.name !== undefined ? { name: String(p.name ?? '') } : {}),
          })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ home: r.row })
        }
        case 'home.remove': {
          const r: any = await removeHomeRow(homesFileFor(dshHome), { id: String(p.id ?? '') })
          if (!r.ok) return fail(r.code, r.message)
          return ok({ home: r.row })
        }
        // ── T7 #90 追加 → T5 #110 加第四电话 → #132 加第五电话 logAppend：更新系统五通电话（电话名即端点名，票面定死；键由包的 `update.phoneNames` 给出，不另拼字符串）。
        // 回包是本仓 RpcResult 信封：成功把包载荷原样放 `value`（M5 起不再注入 autoCheck）；
        // 包失败（`{ok:false,error,errorKind}`）走失败通道，翻译在 `src/host/update.ts` 的 `reply`，本文件不认识包字段。
        // 第五电话 logAppend 回 `{accepted,dropped}` 无 ok 包裹，翻译同样在 reply（按成功进 value），本文件只负责透传。
        case 'imc.updateStatus':
        case 'imc.updateCheck':
        case 'imc.updateInstall':
        case 'imc.updateChangelog':
        case 'imc.logAppend': {
          const surface = opts.update?.() ?? null
          if (!surface) return fail('bad-request', '更新端点未接线: ' + endpoint)
          const call = surface.handlers[endpoint]
          if (typeof call !== 'function') return fail('bad-request', '未知端点: ' + endpoint)
          return surface.reply(await call(p))
        }
        // ── T12 #129 追加（Added-only，只追加 case）：配置目录两通电话——面板「复制路径」「在文件浏览器打开」。
        // 客户端只说意图，平台配方（explorer / open / xdg-open）全在 `src/host/open-dir.ts`，本文件不认平台。
        case 'config.path':
          return ok({ dir: configDirFor(dshHome), files: await listConfigFiles(configDirFor(dshHome)) })
        case 'config.openDir': {
          const opened = await openDir(configDirFor(dshHome))
          return opened.ok ? ok({ opener: opened.opener }) : fail('open-failed', opened.message)
        }
        default:
          /* T11 #128：头像族（avatar.get/set/clear）挂这里——一个入口收一族端点，分发主体不再按端点膨胀；
           * `avatarPhone` 只认 `avatar.` 前缀，别的端点回 null 走原路（未知端点仍是 bad-request）。 */
          return (await avatarPhone(endpoint, homesFileFor(dshHome), p)) ?? fail('bad-request', '未知端点: ' + endpoint)
      }
    } catch (e) {
      return fail('internal', String((e as Error)?.message ?? e))
    }
  }
  /* 逐调用一条日志：成功 debug（高频默认不落盘）、失败 error（恒落盘带原因码）。 */
  return withRpcLog(dispatch, opts.log)
}
