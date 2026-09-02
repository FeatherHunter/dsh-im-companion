/** 后端 Agent 元数据存储：持久化到 ~/.dsh/integrations/dsh-im-companion/meta.json。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface LocalAgent {
  name: string
  workspace: string
}

export interface AgentMetaDoc {
  version: 1
  names: Record<string, string>
  avatars: Record<string, string>
  locals: LocalAgent[]
}

const EMPTY: AgentMetaDoc = { version: 1, names: {}, avatars: {}, locals: [] }

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
