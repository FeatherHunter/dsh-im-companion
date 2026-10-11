/** update-center 薄挂载层（T5 #110 M3 → #118 单按钮+dialog默认主题统修）。
 * 只做三件事，其余全归更新包：
 * ① 事件制挂载（UPDATE_CENTER_HOST_EVENT + #imc-update-center 主动认领，A1 零改）；
 * ② 调包的 mountUpdateEntry（variant button，openOn always，autoCheck mount，theme default，dialog 由 open() 内置）；
 * ③ 宿主电话桥（(name, args) => ctx.rpc('/im-companion', name, args)，超时 30s，回包经 toPackageReply 解信封后交包）。
 * 三条硬约束原样保留：P0-a mount() 不读 ctx.meta；P0-b 事件无重放 ⇒ 末尾主动认领；P1-c 挂载即自查（包 autoCheck mount）。
 * U1=button+always（#118：有无新版点开都有完整五章，has-update 下无事只给小字易被当“没内容”）；U2=dialog（entry.open() 内置）；主题显式 default（最小可用深色，不用 archive）。
 */
import { mountUpdateEntry, type UpdateEntryController } from 'dsh-plugin-update/entry'
import { UPDATE_CENTER_HOST_EVENT, type UpdateCenterHostDetail } from '../../client/data/config'
import type { FeatureCtx } from '../protocol'

const HOST_ID = 'imc-update-center'
const PLUGIN_ID = 'dsh-im-companion'
const PREFIX = 'imc'
const CHANNEL = '/im-companion'
const RPC_TIMEOUT_MS = 30000

/** 容器认领（P0-b：事件无重放 ⇒ 主动找已存在的挂载点，不依赖事件到达顺序）。 */
function claimHost(): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    return document.getElementById(HOST_ID)
  } catch {
    return null
  }
}

function clearHost(el: HTMLElement): void {
  try {
    el.replaceChildren()
  } catch { /* ignore */ }
}

/** 本仓 `RpcResult` 信封 → 更新包认的扁平回包（包 README §5：只读顶层 `ok`/`snapshot`/`error`/`errorKind`）。
 *
 * 宿主把包载荷放两层里（`src/host/update.ts` 的 `reply`）：成功进 `value`、失败进 `error.details.update`。
 * 不拆这层，包拿到的是 `{ok:true,value:{…}}`——外层 `ok` 让它判成功，可顶层没有 `snapshot`，
 * 于是快照恒 `null`、错误也恒 `null` ⇒ 面板永远停在「正在读取更新状态…」（2026-10-10 实证）。
 * 失败通道同理：包的 `failureCodeOf` 只认顶层字符串 `error`／`errorKind`，不还原就一律落兜底码。
 * 旧自画实现（已删的 `phone.ts`）本来就有这层解信封，薄挂载重写时丢了，此函数把它补回。
 * 认形状不认来源：只有本仓信封形状才翻译，已是包自己的扁平回包（成功带 `snapshot`、失败 `error` 是字符串）
 * 一律原样直通——免得把包的原因码洗掉，也免得以后宿主改成直传包载荷时反而被它弄坏。 */
export function toPackageReply(raw: unknown): unknown {
  const env = raw as { ok?: unknown; value?: unknown; error?: unknown } | null
  if (!env || typeof env !== 'object') return raw
  if (env.ok === true) {
    // 成功信封：`value` 行内仍可能是包自己的 `ok:false`（如 install 缺 checkId）——原样交回，包自己认。
    if (env.value !== undefined) return env.value
    if ('snapshot' in env) return raw // 已是包的扁平成功载荷（宿主哪天直传也不许弄坏）
    return { ok: false, error: 'internal' } // 成功信封缺 value：宁可报失败，也不许落成「永远读取中」
  }
  if (env.ok !== false) return raw
  const err = env.error as { code?: unknown; details?: { update?: unknown } } | null | undefined
  if (!err || typeof err !== 'object') return raw // 包自己的扁平失败（error 是字符串）：原样直通
  // 宿主失败通道：包原始载荷（error/errorKind/diag 全在）原样还原；宿主自产失败（端点未接线等）只给码。
  const pkg = err.details?.update
  if (pkg && typeof pkg === 'object') return pkg
  const code = err.code
  return { ok: false, error: typeof code === 'string' && code ? code : 'internal' }
}

/** 特性挂载：注册 {host} 监听 + 同步认领既有容器；所有宿主读取都在回调里发生（P0-a）。 */
export function mountUpdateCenter(ctx: FeatureCtx): () => void {
  let host: HTMLElement | null = null
  let controller: UpdateEntryController | null = null

  /** 先全拆（关包面板 / 清 DOM）再挂；重复调用同一容器是幂等的。 */
  function detach(): void {
    try {
      controller?.unmount()
    } catch { /* ignore */ }
    controller = null
    const old = host
    host = null
    if (old) clearHost(old)
  }

  function attach(el: HTMLElement): void {
    if (host === el && controller !== null) return
    detach()
    host = el
    const rpc = ctx.rpc
    const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      if (!rpc) throw new Error('宿主桥不可用')
      return toPackageReply(await rpc(CHANNEL, name, args, AbortSignal.timeout(RPC_TIMEOUT_MS)))
    }
    controller = mountUpdateEntry(host, {
      pluginId: PLUGIN_ID,
      prefix: PREFIX,
      call,
      variant: 'button',
      theme: 'default',
      autoCheck: 'mount',
      openOn: 'always',
    })
  }

  const onHost = (e: Event): void => {
    try {
      const detail = (e as CustomEvent).detail as Partial<UpdateCenterHostDetail> | undefined
      const next = detail?.host ?? null
      if (next) {
        attach(next)
        return
      }
      detach()
      const live = claimHost() // host=null 后再复查一次是否还有 live 容器
      if (live) attach(live)
    } catch { /* 单次回调失败不留死状态：下一次 {host} 仍会走 attach/detach */ }
  }

  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined
    window.addEventListener(UPDATE_CENTER_HOST_EVENT, onHost as EventListener)
  } catch {
    return () => undefined
  }
  try {
    const live = claimHost()
    if (live) attach(live)
  } catch { /* 认领失败不致命：事件到达时仍会挂 */ }
  return () => {
    try {
      window.removeEventListener(UPDATE_CENTER_HOST_EVENT, onHost as EventListener)
    } catch { /* ignore */ }
    detach()
  }
}
