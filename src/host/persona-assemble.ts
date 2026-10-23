/** 装配期补救（#178）：新会话首条消息的系统提示词装配，可能早于两条懒刷新索引落地。
 *
 * 背景：section.text 是**同步**的（宿主 dsh-system-prompt 在 assemble 里直接 map 求值），拿不到 await；
 * 归属索引（dsh-im 的 state.json）与人设目录（家表）都由 250ms 节流的异步懒刷新维护。dsh-im 在 ask 之前
 * 就写好归属 state.json，但我们内存快照可能还是上一次的 ⇒ 首条消息读不到人设。
 *
 * 落点：宿主在 sections 求值之后会 `await ctx.waterfall(..., 'system-prompt/assemble', assembly, context, ...)`
 * （dsh-system-prompt lib/index.js:398），这是唯一能 await 的位置。本模块在该事件上挂一个 prepend 监听
 * （最外层）：await 下游结果后，**只**把本插件那一段的空文本重算一遍（必要时先 await 重扫两索引），其余 section
 * 原样返回；任何异常都退回原 assembly。上游指引「不要用该事件增删文本」针对改别人的提示词，这里只重算自己那段、
 * 且只从空到非空（窄化使用，理由与取证见 #178 票面）。
 *
 * 节流：同一会话 TTL 内只补刷一次（本来就没有人设的桌面会话不能每个 LLM 步都扫盘）；表满只留最近一半。
 */
import type { AssistantRef } from './assistant-directory.js'
import type { OwnershipLookup } from './session-ownership.js'

/** 宿主 systemPrompt.assemble 在 sections 求值之后 await 的事件（唯一可 async 的装配钩子）。 */
export const ASSEMBLE_EVENT = 'system-prompt/assemble'
/** 同一会话装配期补刷的最短间隔。 */
const RECOVERY_TTL_MS = 2000
/** 补刷记录上限：超了只留最近一半，长期运行不无界增长。 */
const RECOVERY_MAX = 512

export interface PersonaIndexes {
  /** 会话 → 助理归属索引；`refresh` 供装配期补救 await 一次重扫。 */
  ownership: { lookup(sessionId: string): OwnershipLookup; refresh?(reason?: string): Promise<void> }
  /** 渠道+机器人 → 家表绑定行；`refresh` 同上。 */
  directory: { lookup(channel: string, botId: string): AssistantRef | null; refresh?(reason?: string): Promise<void> }
}

export interface PersonaAssembleOptions extends PersonaIndexes {
  /** 本插件段的 name：只认这一段，别人的段一律不碰。 */
  sectionName: string
  /** 同步重算本段文本（与宿主 section.text 同一实现）；永不抛。 */
  render(context: unknown): string
  /** 失败留痕（由 prompt-section 的去重 resident 出口落盘）。 */
  onFail(phase: string, message: string, sessionId: string): void
  now?: () => number
}

export interface PersonaAssembleGuard {
  /** 在插件 ctx 上后置注册 waterfall 监听（prepend）；宿主无 ctx.on 时静默跳过。 */
  install(ctx: unknown): void
  /** 摘掉监听（section 卸载/测试用）。 */
  dispose(): void
}

interface SectionLike { name?: unknown; text?: unknown; [key: string]: unknown }
interface HostLike { on?: (name: string, listener: (...args: unknown[]) => unknown, options?: { prepend?: boolean }) => unknown }

function messageOf(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? error)
}

/** sessionId 只认 `context.agent.session.id` 的非空字符串；数字/对象/缺失一律 ''（不 String() 猜）。 */
export function sessionIdOf(context: unknown): string {
  const id = (context as { agent?: { session?: { id?: unknown } } } | null)?.agent?.session?.id
  return typeof id === 'string' && id.length > 0 ? id : ''
}

export function createPersonaAssembleGuard(options: PersonaAssembleOptions): PersonaAssembleGuard {
  const now = options.now ?? Date.now
  /** 装配期补救的节流表：sessionId → 上次补刷时刻。 */
  const recoveryAt = new Map<string, number>()
  let disposeListener: (() => void) | null = null

  /** 同会话补刷节流：TTL 内不再扫盘；表满只留最近一半（长期运行不无界增长）。 */
  function shouldRecover(sessionId: string): boolean {
    const current = now()
    const at = recoveryAt.get(sessionId)
    if (at !== undefined && current - at < RECOVERY_TTL_MS) return false
    recoveryAt.set(sessionId, current)
    if (recoveryAt.size <= RECOVERY_MAX) return true
    const recent = [...recoveryAt.entries()].sort((a, b) => b[1] - a[1]).slice(0, RECOVERY_MAX >> 1)
    recoveryAt.clear()
    for (const [id, stamp] of recent) recoveryAt.set(id, stamp)
    return true
  }

  /** await 一次归属索引 + 人设目录重扫（两侧都有 inFlight 复用 ⇒ 不叠加并发）。 */
  async function refreshIndexes(reason: string): Promise<void> {
    const pending: Array<Promise<void>> = []
    if (typeof options.ownership.refresh === 'function') pending.push(options.ownership.refresh(reason))
    if (typeof options.directory.refresh === 'function') pending.push(options.directory.refresh(reason))
    await Promise.all(pending)
  }

  /** 两索引是否已能 join 出「有助理」：用来区分「数据真没有」与「快照太旧（值得再补一次）」。 */
  function indexesReady(sessionId: string): boolean {
    try {
      const lookup = options.ownership.lookup(sessionId)
      if (!lookup?.hit) return false
      return options.directory.lookup(lookup.channel, lookup.botId) !== null
    } catch {
      return false
    }
  }

  /** 在宿主 assembly 里定位本段；没找到（未注册/被 complete 段吞掉）⇒ null。 */
  function ownSectionOf(assembly: unknown): { sections: SectionLike[]; mine: SectionLike } | null {
    const list = (assembly as { sections?: unknown } | null)?.sections
    if (!Array.isArray(list)) return null
    const sections = list as SectionLike[]
    const mine = sections.find((section) => section?.name === options.sectionName)
    return mine ? { sections, mine } : null
  }

  /** 本段空 ⇒ await 重扫两索引后重算；非空/无会话/节流内 ⇒ 原样返回。 */
  async function patch(assembly: unknown, context: unknown): Promise<unknown> {
    const own = ownSectionOf(assembly)
    if (!own) return assembly
    if (typeof own.mine.text === 'string' && own.mine.text.length > 0) return assembly
    const sessionId = sessionIdOf(context)
    if (!sessionId || !shouldRecover(sessionId)) return assembly
    try {
      await refreshIndexes('assemble')
      let rendered = options.render(context)
      if (!rendered && !indexesReady(sessionId)) {
        /* 首刷可能 await 到一份「早于本次落盘」的 inFlight（热重载/启动 warm）⇒ 再补一次真重扫。 */
        await refreshIndexes('assemble-retry')
        rendered = options.render(context)
      }
      if (!rendered) return assembly
      const sections = own.sections.map((section) => (section === own.mine ? { ...section, text: rendered } : section))
      return { ...(assembly as Record<string, unknown>), sections }
    } catch (error) {
      options.onFail('assemble-refresh', messageOf(error), sessionId)
      return assembly
    }
  }

  function install(ctx: unknown): void {
    const host = (ctx && typeof ctx === 'object' ? ctx : null) as HostLike | null
    if (!host || typeof host.on !== 'function') return
    try {
      const remove = host.on(ASSEMBLE_EVENT, async (...args: unknown[]) => {
        const next = args[args.length - 1]
        const accepted = typeof next === 'function' ? await (next as () => Promise<unknown>)() : args[0]
        return patch(accepted, args[1])
      }, { prepend: true })
      disposeListener = typeof remove === 'function' ? remove as () => void : null
    } catch (error) {
      options.onFail('assemble-register', messageOf(error), '')
    }
  }

  function dispose(): void {
    const remove = disposeListener
    disposeListener = null
    recoveryAt.clear()
    if (!remove) return
    try {
      remove()
    } catch (error) {
      options.onFail('assemble-dispose', messageOf(error), '')
    }
  }

  return { install, dispose }
}
