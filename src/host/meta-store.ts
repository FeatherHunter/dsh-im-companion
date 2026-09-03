/** 后端 Agent 元数据存储：持久化到 ~/.dsh/integrations/dsh-im-companion/meta.json。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface LocalAgent {
  name: string
  workspace: string
}

export interface CtxEnhance {
  enabled: boolean
  level: string
}

export interface AgentMetaDoc {
  version: 1
  names: Record<string, string>
  avatars: Record<string, string>
  locals: LocalAgent[]
  /** C1a 身份配置（companion 自持；dsh-im 侧能力 research 并行）：预设单选/custom:名前缀，上下文开关+三档。 */
  presets: Record<string, string>
  ctxEnhance: Record<string, CtxEnhance>
}

const EMPTY: AgentMetaDoc = { version: 1, names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }

function sanitizeString(value: unknown, max = 512): string {
  if (typeof value !== 'string') return ''
  return value.slice(0, max)
}

export class AgentMetaStore {
  private doc: AgentMetaDoc = { ...EMPTY }
  private loaded: Promise<void> | null = null
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  load(): Promise<void> {
    if (!this.loaded) this.loaded = this.read()
    return this.loaded
  }

  snapshot(): AgentMetaDoc {
    return {
      version: 1,
      names: { ...this.doc.names },
      avatars: { ...this.doc.avatars },
      locals: this.doc.locals.map((l) => ({ ...l })),
      presets: { ...this.doc.presets },
      ctxEnhance: Object.fromEntries(Object.entries(this.doc.ctxEnhance).map(([k, v]) => [k, { ...v }])),
    }
  }

  private async read(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AgentMetaDoc> | null
      if (parsed && typeof parsed === 'object') {
        this.doc = {
          version: 1,
          names: cleanRecord(parsed.names),
          avatars: cleanRecord(parsed.avatars),
          presets: cleanRecord(parsed.presets),
          ctxEnhance: cleanCtxRecord(parsed.ctxEnhance),
          locals: Array.isArray(parsed.locals)
            ? parsed.locals
                .filter((l) => l && typeof l.name === 'string')
                .map((l) => ({ name: sanitizeString(l.name, 64), workspace: sanitizeString(l.workspace, 1024) }))
            : [],
        }
      }
    } catch {
      this.doc = { ...EMPTY }
    }
  }

  private async persist(): Promise<void> {
    const doc = this.snapshot()
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      await fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8')
      await fs.rename(tmp, this.file)
    })
    await this.writeQueue
  }

  async rename(key: string, name: string): Promise<void> {
    await this.load()
    if (!sanitizeString(name)) return
    this.doc.names[key] = sanitizeString(name, 64)
    await this.persist()
  }

  async setAvatar(key: string, dataUrl: string): Promise<void> {
    await this.load()
    if (!dataUrl.startsWith('data:image/') || dataUrl.length > 15_000_000) return
    this.doc.avatars[key] = dataUrl
    await this.persist()
  }

  async clearAvatar(key: string): Promise<void> {
    await this.load()
    delete this.doc.avatars[key]
    await this.persist()
  }

  async addLocal(name: string): Promise<void> {
    await this.load()
    const n = sanitizeString(name, 64)
    if (!n) return
    if (!this.doc.locals.some((l) => l.name === n)) {
      this.doc.locals.push({ name: n, workspace: '' })
      await this.persist()
    }
  }

  async removeLocal(name: string): Promise<void> {
    await this.load()
    this.doc.locals = this.doc.locals.filter((l) => l.name !== name)
    await this.persist()
  }

  async renameLocal(from: string, to: string): Promise<void> {
    await this.load()
    const n = sanitizeString(to, 64)
    if (!n) return
    for (const l of this.doc.locals) {
      if (l.name === from) l.name = n
    }
    await this.persist()
  }

  async setPreset(key: string, preset: string): Promise<void> {
    await this.load()
    const k = sanitizeString(key, 256)
    const v = normalizePresetValue(preset)
    if (!k || !v) return
    this.doc.presets[k] = v
    await this.persist()
  }

  async setCtx(key: string, cfg: { enabled?: unknown; level?: unknown }): Promise<void> {
    await this.load()
    const k = sanitizeString(key, 256)
    const level = typeof cfg?.level === 'string' && CTX_LEVELS.includes(cfg.level) ? cfg.level : null
    if (!k || !level) return
    this.doc.ctxEnhance[k] = { enabled: cfg?.enabled === true, level }
    await this.persist()
  }
}

const PRESET_IDS = ['default', 'cs', 'coder']
const CTX_LEVELS = ['low', 'mid', 'high']

/** 预设值校验（与 client/data/meta.ts 同值；host/client 分构建，常量各持一份）：合法返回原值，否则 null。 */
export function normalizePresetValue(value: unknown): string | null {
  const s = sanitizeString(value, 40)
  if (!s) return null
  if (PRESET_IDS.includes(s)) return s
  if (s.startsWith('custom:') && s.length > 7) return s
  return null
}

function cleanCtxRecord(input: unknown): Record<string, CtxEnhance> {
  const out: Record<string, CtxEnhance> = {}
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const row = v as { enabled?: unknown; level?: unknown } | null
      const level = typeof row?.level === 'string' && CTX_LEVELS.includes(row.level) ? row.level : null
      if (k && level) out[k] = { enabled: row?.enabled === true, level }
    }
  }
  return out
}

function cleanRecord(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const s = sanitizeString(v, 15_000_000)
      if (s) out[k] = s
    }
  }
  return out
}
