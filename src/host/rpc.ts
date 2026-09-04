/** host 桥端点分发：/im-companion 渠道下各 endpoint → AgentMetaStore / 文件系统浏览。 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { AgentMetaStore } from './meta-store.js'
import { collectRoutes } from './routes.js'

export type RpcPayload = Record<string, unknown>

export type RpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }

const ok = (value: unknown): RpcResult => ({ ok: true, value })
const fail = (code: string, message: string): RpcResult => ({ ok: false, error: { code, message, details: {} } })

async function listDirectories(dir: string): Promise<{ name: string; path: string }[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const entries = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .slice(0, 300)
  return entries.map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
}


export function createAgentFleetHandler(store: AgentMetaStore, opts: { dshHome?: string } = {}): (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null) => Promise<RpcResult> {
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
        case 'fs.defaultRoot':
          return ok({ path: homedir() })
        case 'fs.list': {
          const dir = String(p.path ?? '')
          if (!dir || !path.isAbsolute(dir)) return fail('bad-request', '需要绝对路径')
          const entries = await listDirectories(dir)
          return ok({ path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), entries })
        }
        default:
          return fail('bad-request', '未知端点: ' + endpoint)
      }
    } catch (e) {
      return fail('internal', String((e as Error)?.message ?? e))
    }
  }
}
