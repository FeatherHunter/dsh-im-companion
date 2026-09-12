/** host 桥端点分发：/im-companion 渠道下各 endpoint → AgentMetaStore / 文件系统浏览。 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { AgentMetaStore } from './meta-store.js'
import { isUpdateIntervalHours } from './meta-store.js'
import { collectRoutes } from './routes.js'
import { collectActivity } from './activity.js'

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
  /** 面板改档位/开关后重排宿主定时器（读 store 现值）。 */
  sync(): void
}

export interface AgentFleetHandlerOptions {
  dshHome?: string
  update?: () => UpdateHostSurface | null
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


export function createAgentFleetHandler(store: AgentMetaStore, opts: AgentFleetHandlerOptions = {}): (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null) => Promise<RpcResult> {
  return async (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null): Promise<RpcResult> => {
    if (signal?.aborted) return fail('cancelled', '已取消')
    const p = payload ?? {}
    const dshHome = typeof opts.dshHome === 'string' && opts.dshHome ? opts.dshHome : path.join(homedir(), '.dsh')
    try {
      switch (endpoint) {
        case 'ping':
          return ok({ pong: Date.now() })
        case 'meta.get':
          return ok(store.snapshot())
        case 'meta.rename': {
          const key = String(p.key ?? '')
          const name = String(p.name ?? '')
          if (!key || !name) return fail('bad-request', 'key 与 name 必填')
          await store.rename(key, name)
          return ok({})
        }
        case 'meta.avatar.set': {
          const key = String(p.key ?? '')
          const dataUrl = String(p.dataUrl ?? '')
          if (!key || !dataUrl) return fail('bad-request', 'key 与 dataUrl 必填')
          await store.setAvatar(key, dataUrl)
          return ok({})
        }
        case 'meta.avatar.clear': {
          const key = String(p.key ?? '')
          if (!key) return fail('bad-request', 'key 必填')
          await store.clearAvatar(key)
          return ok({})
        }
        case 'meta.local.add': {
          const name = String(p.name ?? '')
          if (!name) return fail('bad-request', 'name 必填')
          await store.addLocal(name)
          return ok({})
        }
        case 'meta.local.remove': {
          const name = String(p.name ?? '')
          if (!name) return fail('bad-request', 'name 必填')
          await store.removeLocal(name)
          return ok({})
        }
        case 'meta.local.rename': {
          const from = String(p.from ?? '')
          const to = String(p.to ?? '')
          if (!from || !to) return fail('bad-request', 'from/to 必填')
          await store.renameLocal(from, to)
          return ok({})
        }
        case 'meta.local.workspace': {
          const name = String(p.name ?? '')
          const workspace = String(p.workspace ?? '')
          if (!name) return fail('bad-request', 'name 必填')
          await store.setLocalWorkspace(name, workspace)
          return ok({})
        }
        case 'meta.preset.set': {
          const key = String(p.key ?? '')
          const preset = String(p.preset ?? '')
          if (!key || !preset) return fail('bad-request', 'key 与 preset 必填')
          await store.setPreset(key, preset)
          return ok({})
        }
        case 'meta.ctx.set': {
          const key = String(p.key ?? '')
          if (!key || typeof p.enabled === 'undefined' || typeof p.level === 'undefined') {
            return fail('bad-request', 'key/enabled/level 必填')
          }
          await store.setCtx(key, { enabled: p.enabled, level: p.level })
          return ok({})
        }
        case 'meta.welcomed.set': {
          const workspace = String(p.workspace ?? '')
          if (!workspace || typeof p.seen === 'undefined') {
            return fail('bad-request', 'workspace/seen 必填')
          }
          await store.setWelcomed(workspace, p.seen === true)
          return ok({})
        }
        // ── T7 #90 追加：自动检查偏好写入（**读**走既有 `meta.get` 的全量快照 `store.snapshot()`，不新增读端点）。
        // 校验与 `meta.rename` 同款：非法值回既有 `fail('bad-request', …)` 信封。
        case 'meta.update.set': {
          if (typeof p.autoCheckEnabled !== 'boolean' || !isUpdateIntervalHours(p.intervalHours)) {
            return fail('bad-request', 'autoCheckEnabled 必须布尔，intervalHours ∈ {6,12,24,168}')
          }
          await store.setUpdate({ autoCheckEnabled: p.autoCheckEnabled, intervalHours: p.intervalHours })
          opts.update?.()?.sync()
          return ok({})
        }
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
        // ── T7 #90 追加：更新系统三通电话（电话名即端点名，票面定死；键由包的 `update.phoneNames` 给出，不另拼字符串）。
        // 回包是本仓 RpcResult 信封：成功把包载荷原样放 `value`（含与 `manual` 同级的 `autoCheck` 运行期状态）；
        // 包失败（`{ok:false,error,errorKind}`）走失败通道，翻译在 `src/host/update.ts` 的 `reply`，本文件不认识包字段。
        case 'imc.updateStatus':
        case 'imc.updateCheck':
        case 'imc.updateInstall': {
          const surface = opts.update?.() ?? null
          if (!surface) return fail('bad-request', '更新端点未接线: ' + endpoint)
          const call = surface.handlers[endpoint]
          if (typeof call !== 'function') return fail('bad-request', '未知端点: ' + endpoint)
          return surface.reply(await call(p))
        }
        default:
          return fail('bad-request', '未知端点: ' + endpoint)
      }
    } catch (e) {
      return fail('internal', String((e as Error)?.message ?? e))
    }
  }
}
