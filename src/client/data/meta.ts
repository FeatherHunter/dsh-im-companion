/** Agent 元数据（昵称 / 头像 / 本地空壳）存储。
 * 接口 MetaStore 与存储实现解耦：真机走 host 桥（RpcMetaStore，host 持久化文件），
 * 桥不可用时降级 localStorage（LocalMetaStore，兼容旧键名）。UI 只依赖接口。 */
import type { RpcCall } from './fleet-api'

export interface LocalAgent {
  name: string
  workspace: string
}

export interface CtxEnhance {
  enabled: boolean
  level: string
}

export interface AgentMetaDoc {
  names: Record<string, string>
  avatars: Record<string, string>
  locals: LocalAgent[]
  /** C1a 身份配置（与 host/meta-store.ts 同形；旧快照缺字段时读方 ?? {} 兜底）。 */
  presets: Record<string, string>
  ctxEnhance: Record<string, CtxEnhance>
}

export const EMPTY_META: AgentMetaDoc = { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }

export interface MetaStore {
  loadMeta(): Promise<AgentMetaDoc>
  rename(key: string, name: string): Promise<void>
  setAvatar(key: string, dataUrl: string): Promise<void>
  clearAvatar(key: string): Promise<void>
  addLocal(name: string): Promise<void>
  removeLocal(name: string): Promise<void>
  renameLocal(from: string, to: string): Promise<void>
  setPreset(key: string, preset: string): Promise<void>
  setCtx(key: string, cfg: { enabled: boolean; level: string }): Promise<void>
}

/** 经 host 桥调用（channel 前缀 + 信封），由 host 侧持久化到 meta.json。 */
export class RpcMetaStore implements MetaStore {
  constructor(private readonly channel: string, private readonly rpc: RpcCall) {}

  private async call<T>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    const raw = await this.rpc(this.channel, endpoint, payload, AbortSignal.timeout(5000))
    const res = raw as { ok: boolean; value?: T; error?: { code?: string; message?: string } } | null
    if (!res || res.ok !== true) {
      const msg = res?.error?.message ?? res?.error?.code ?? 'host 桥调用失败'
      throw new Error(msg)
    }
    return res.value as T
  }

  loadMeta(): Promise<AgentMetaDoc> {
    return this.call<AgentMetaDoc>('meta.get')
  }
  async rename(key: string, name: string): Promise<void> {
    await this.call('meta.rename', { key, name })
  }
  async setAvatar(key: string, dataUrl: string): Promise<void> {
    await this.call('meta.avatar.set', { key, dataUrl })
  }
  async clearAvatar(key: string): Promise<void> {
    await this.call('meta.avatar.clear', { key })
  }
  async addLocal(name: string): Promise<void> {
    await this.call('meta.local.add', { name })
  }
  async removeLocal(name: string): Promise<void> {
    await this.call('meta.local.remove', { name })
  }
  async renameLocal(from: string, to: string): Promise<void> {
    await this.call('meta.local.rename', { from, to })
  }
  async setPreset(key: string, preset: string): Promise<void> {
    await this.call('meta.preset.set', { key, preset })
  }
  async setCtx(key: string, cfg: { enabled: boolean; level: string }): Promise<void> {
    await this.call('meta.ctx.set', { key, enabled: cfg.enabled, level: cfg.level })
  }
}

/** localStorage 降级实现（兼容历史键名 af-fleet-names / af-fleet-avatars / af-fleet-agents）。 */
export class LocalMetaStore implements MetaStore {
  private readonly K_NAMES = 'af-fleet-names'
  private readonly K_AVATARS = 'af-fleet-avatars'
  private readonly K_LOCALS = 'af-fleet-agents'
  private readonly K_PRESETS = 'af-fleet-presets'
  private readonly K_CTX = 'af-fleet-ctx'

  constructor(private readonly storage: Storage | null) {}

  private readJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage?.getItem(key)
      if (!raw) return fallback
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  private writeJson(key: string, value: unknown): void {
    try {
      this.storage?.setItem(key, JSON.stringify(value))
    } catch {
      /* 存储不可用时静默（内存态仍可用） */
    }
  }

  async loadMeta(): Promise<AgentMetaDoc> {
    const names = this.readJson<Record<string, string>>(this.K_NAMES, {})
    const avatars = this.readJson<Record<string, string>>(this.K_AVATARS, {})
    const locals = this.readJson<LocalAgent[]>(this.K_LOCALS, [])
    const presets = this.readJson<Record<string, string>>(this.K_PRESETS, {})
    const ctxEnhance = this.readJson<Record<string, CtxEnhance>>(this.K_CTX, {})
    return { names, avatars, locals, presets, ctxEnhance }
  }

  async rename(key: string, name: string): Promise<void> {
    const doc = await this.loadMeta()
    doc.names[key] = name
    this.writeJson(this.K_NAMES, doc.names)
  }
  async setAvatar(key: string, dataUrl: string): Promise<void> {
    const doc = await this.loadMeta()
    doc.avatars[key] = dataUrl
    this.writeJson(this.K_AVATARS, doc.avatars)
  }
  async clearAvatar(key: string): Promise<void> {
    const doc = await this.loadMeta()
    delete doc.avatars[key]
    this.writeJson(this.K_AVATARS, doc.avatars)
  }
  async addLocal(name: string): Promise<void> {
    const doc = await this.loadMeta()
    if (!doc.locals.some((l) => l.name === name)) {
      doc.locals.push({ name, workspace: '' })
      this.writeJson(this.K_LOCALS, doc.locals)
    }
  }
  async removeLocal(name: string): Promise<void> {
    const doc = await this.loadMeta()
    doc.locals = doc.locals.filter((l) => l.name !== name)
    this.writeJson(this.K_LOCALS, doc.locals)
  }
  async renameLocal(from: string, to: string): Promise<void> {
    const doc = await this.loadMeta()
    for (const l of doc.locals) if (l.name === from) l.name = to
    this.writeJson(this.K_LOCALS, doc.locals)
  }
  async setPreset(key: string, preset: string): Promise<void> {
    const doc = await this.loadMeta()
    doc.presets[key] = preset
    this.writeJson(this.K_PRESETS, doc.presets)
  }
  async setCtx(key: string, cfg: { enabled: boolean; level: string }): Promise<void> {
    const doc = await this.loadMeta()
    doc.ctxEnhance[key] = { enabled: cfg.enabled, level: cfg.level }
    this.writeJson(this.K_CTX, doc.ctxEnhance)
  }
}

export const HOST_CHANNEL = '/im-companion'

/** 探测 host 桥（ping）→ 选 RpcMetaStore；否则降级本地。 */
export async function createMetaStore(rpc: RpcCall | null): Promise<MetaStore> {
  if (rpc) {
    try {
      const raw = await rpc(HOST_CHANNEL, 'ping', {}, AbortSignal.timeout(1500))
      const res = raw as { ok?: boolean } | null
      if (res?.ok === true) return new RpcMetaStore(HOST_CHANNEL, rpc)
    } catch {
      /* 桥不可用 → 降级 */
    }
  }
  let storage: Storage | null = null
  try {
    storage = typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    storage = null
  }
  return new LocalMetaStore(storage)
}
