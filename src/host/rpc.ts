/** host 桥端点分发：/im-companion 渠道下各 endpoint → AgentMetaStore / 文件系统浏览。 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { AgentMetaStore } from './meta-store.js'

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

/** TEMP-DEBUG(#6)：诊断上报字段白名单 + 上限，定位后删除。 */
function pickDebug(p: RpcPayload): Record<string, string | number | boolean> {
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const str = (v: unknown, max = 120): string => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    kind: str(p.kind, 16), rows: num(p.rows), decorated: num(p.decorated),
    treeitem: num(p.treeitem), expanded: num(p.expanded), selected: num(p.selected),
    badges: num(p.badges), bots: num(p.bots), failed: num(p.failed),
    updatedAt: num(p.updatedAt), hasSnap: p.hasSnap === true,
    rpcNull: p.rpcNull === true, err: str(p.err, 300),
  }
}

export function createAgentFleetHandler(store: AgentMetaStore): (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null) => Promise<RpcResult> {
  return async (endpoint: string, payload: RpcPayload | null | undefined, signal?: AbortSignal | null): Promise<RpcResult> => {
    if (signal?.aborted) return fail('cancelled', '已取消')
    const p = payload ?? {}
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
        case 'fs.defaultRoot':
          return ok({ path: homedir() })
        case 'fs.list': {
          const dir = String(p.path ?? '')
          if (!dir || !path.isAbsolute(dir)) return fail('bad-request', '需要绝对路径')
          const entries = await listDirectories(dir)
          return ok({ path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), entries })
        }
        case '__badgeDebug': { // TEMP-DEBUG(#6)：左栏徽标真机普查落盘，定位后删除
          const dir = path.join(homedir(), '.dsh', 'integrations', 'dsh-im-companion')
          const file = path.join(dir, 'badge-debug.log')
          const line = JSON.stringify({ t: Date.now(), ...pickDebug(p) })
          await fs.mkdir(dir, { recursive: true })
          let prev = ''
          try { prev = await fs.readFile(file, 'utf8') } catch { prev = '' }
          const kept = prev.split('\n').filter(Boolean).slice(-199)
          kept.push(line)
          await fs.writeFile(file, kept.join('\n') + '\n', 'utf8')
          return ok({ received: true })
        }
        default:
          return fail('bad-request', '未知端点: ' + endpoint)
      }
    } catch (e) {
      return fail('internal', String((e as Error)?.message ?? e))
    }
  }
}
