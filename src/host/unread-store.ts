/** V2 未看持久化存储（host 单写者，#53）：每会话 {seenAt, notifyAt} 落盘 unread.json（与 meta.json 同目录，独立文件——V2 可整体移除，不碰 AgentMetaStore）。
 * 并发 A（文件锁 + 读-合并-写）：lockfile O_EXCL + mtime-stale 熔断（10s）；合并律 notifyAt 取最早非空（首次观测胜）、seenAt 取最晚非空（最近已看胜）；tmp+rename 原子落盘。
 * 全部 fail-soft：读失败=空表；拿不到锁=本次跳过（下轮事件重写，自愈，与崩溃窗口同级）。
 * 键约束：sessionId 非空 ≤256；at 有限非负整数，否则对应写为 no-op（调用方 RPC 层已先验 bad-request）。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface UnreadEntry {
  seenAt: number | null
  notifyAt: number | null
}

export interface UnreadDoc {
  version: 1
  unread: Record<string, UnreadEntry>
}

const LOCK_STALE_MS = 10000
const LOCK_RETRIES = 50
const LOCK_WAIT_MS = 20

const EMPTY: UnreadDoc = { version: 1, unread: {} }

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s || s.length > 256) return null
  return s
}

function cleanAt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

function cleanEntry(value: unknown): UnreadEntry | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  return { seenAt: cleanAt(r.seenAt), notifyAt: cleanAt(r.notifyAt) }
}

function cleanDoc(value: unknown): UnreadDoc {
  if (!value || typeof value !== 'object') return { version: 1, unread: {} }
  const r = value as Record<string, unknown>
  if (r.version !== 1) return { version: 1, unread: {} }
  const unread: Record<string, UnreadEntry> = {}
  const raw = r.unread
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const id = cleanId(k)
      const e = id ? cleanEntry(v) : null
      if (id && e) unread[id] = e
    }
  }
  return { version: 1, unread }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      setTimeout(resolve, ms)
    } catch {
      resolve()
    }
  })
}

export class UnreadStore {  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  /** 全量快照（深拷贝；V2-2 重演读；无 PII——键为会话 UUID）。 */
  async dump(): Promise<UnreadDoc> {
    try {
      return await this.readDoc()
    } catch {
      return { version: 1, unread: {} }
    }
  }

  /** 规则 1：notifyAt 空才写（首次观测定住；跨进程同样成立——读最新后判定）。 */
  async noteObserved(sessionId: string, at: number): Promise<void> {
    const id = cleanId(sessionId)
    const t = cleanAt(at)
    if (!id || t === null) return
    await this.mutate((doc) => {
      const e = doc.unread[id]
      if (e && e.notifyAt !== null) return false
      doc.unread[id] = { seenAt: e ? e.seenAt : null, notifyAt: t }
      return true
    })
  }

  /** 规则 3：seenAt 覆盖写（最近已看胜；串行锁定序≈墙钟序）。 */
  async noteViewed(sessionId: string, at: number): Promise<void> {
    const id = cleanId(sessionId)
    const t = cleanAt(at)
    if (!id || t === null) return
    await this.mutate((doc) => {
      const e = doc.unread[id]
      doc.unread[id] = { seenAt: t, notifyAt: e ? e.notifyAt : null }
      return true
    })
  }

  /** 规则 4：重跑清候选（notifyAt=null；seenAt 保留）。无条目=无操作。 */
  async clearNotify(sessionId: string): Promise<void> {
    const id = cleanId(sessionId)
    if (!id) return
    await this.mutate((doc) => {
      const e = doc.unread[id]
      if (!e || e.notifyAt === null) return false
      e.notifyAt = null
      return true
    })
  }

  /** 规则 5：文件消失删条目（keep=本轮磁盘仍在的会话 id 集）。 */
  async pruneUnread(keep: Set<string>): Promise<void> {
    await this.mutate((doc) => {
      let dirty = false
      for (const k of Object.keys(doc.unread)) {
        if (!keep.has(k)) {
          delete doc.unread[k]
          dirty = true
        }
      }
      return dirty
    })
  }

  private mutate(fn: (doc: UnreadDoc) => boolean): Promise<void> {
    const run = this.writeQueue.then(() => this.applyLocked(fn)).catch(() => {})
    this.writeQueue = run
    return run
  }

  private async applyLocked(fn: (doc: UnreadDoc) => boolean): Promise<void> {
    const got = await this.acquire()
    if (!got) return
    try {
      const doc = await this.readDoc()
      if (fn(doc)) await this.writeDoc(doc)
    } finally {
      await this.release()
    }
  }

  private lockPath(): string {
    return this.file + '.lock'
  }

  private async acquire(): Promise<boolean> {
    const lock = this.lockPath()
    for (let i = 0; i < LOCK_RETRIES; i++) {
      try {
        await fs.writeFile(lock, String(process.pid), { flag: 'wx' })
        return true
      } catch {
        /* 已被占：看 stale */
      }
      try {
        const st = await fs.stat(lock)
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          try {
            await fs.unlink(lock)
          } catch {
            /* 删失败下轮重试 */
          }
          continue
        }
      } catch {
        continue
      }
      await sleep(LOCK_WAIT_MS)
    }
    return false
  }

  private async release(): Promise<void> {
    try {
      await fs.unlink(this.lockPath())
    } catch {
      /* 无锁可放忽略 */
    }
  }

  private async readDoc(): Promise<UnreadDoc> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      return cleanDoc(JSON.parse(raw) as unknown)
    } catch {
      return { version: 1, unread: {} }
    }
  }

  private async writeDoc(doc: UnreadDoc): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(doc), 'utf8')
    await fs.rename(tmp, this.file)
  }
}

export interface PaintDiag {
  groups: number
  rows: number
  red: number
  yellow: number
  blue: number
}

function cleanCount(v: unknown): number {
  try {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0
    return Math.min(Math.floor(v), 100000)
  } catch {
    return 0
  }
}

/** 诊断取证纪律：paint 摘要镜像落盘（diag.json，与 unread.json 同目录），agent 直接读，用户永不贴控制台。 */
export async function writePaintDiag(dir: string, data: Partial<PaintDiag> | null | undefined): Promise<void> {
  try {
    if (!dir || typeof dir !== 'string') return
    const doc = {
      at: Date.now(),
      groups: cleanCount(data?.groups),
      rows: cleanCount(data?.rows),
      red: cleanCount(data?.red),
      yellow: cleanCount(data?.yellow),
      blue: cleanCount(data?.blue),
    }
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, 'diag.json')
    const tmp = file + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(doc), 'utf8')
    await fs.rename(tmp, file)
  } catch {
    /* 诊断失败静默（永不影响主路径） */
  }
}
