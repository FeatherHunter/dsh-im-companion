/** session-header 挂载：会话 Header 工具槽列表位（order 30）注册呼吸点。
 * 依赖只经 FeatureCtx：读快照走 subscribe 单例流；写走 ctx.rpc 投递通道；
 * 自定义名走 ctx.meta；工作区归属经 ctx.get('workspaces') 惰性查找。
 * 防御式：槽位缺失/服务缺失/老宿主一律只隐藏自己，不影响原生 Header 与设置面板。 */
import { resolveWorkspacePath, type WorkspaceItem } from '../../client/data/header-overlay'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'
import { SessionHeaderAction } from './panel'

const SLOT = 'conversation.session.header.utilities'
const ID = 'dsh-im-companion:session-header'

function getWorkspacePath(ctx: FeatureCtx, sessionId: string): string | undefined {
  try {
    const get = ctx.get
    if (typeof get !== 'function') return undefined
    const svc = get('workspaces') as {
      list?: { getSnapshot?: () => { items?: WorkspaceItem[] } }
    } | null
    const items = svc?.list?.getSnapshot?.()?.items
    if (!Array.isArray(items)) return undefined
    return resolveWorkspacePath(sessionId, items)
  } catch {
    return undefined
  }
}

async function loadCustomNames(ctx: FeatureCtx): Promise<Record<string, string>> {
  try {
    const doc = await ctx.meta.loadMeta()
    return doc?.names ?? {}
  } catch {
    return {}
  }
}

function subscribe(ctx: FeatureCtx, fn: (snap: StreamSnapshot) => void): () => void {
  try {
    return ctx.subscribe(fn)
  } catch {
    return () => {}
  }
}

/** 挂载 SessionHeader 呼吸点；返回卸载函数（摘注册 + 样式由装配层统一回收）。 */
export function mountSessionHeader(ctx: FeatureCtx): () => void {
  const noop = (): void => {}
  try {
    const slots = ctx.slots
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return noop
    let stop: (() => void) | null = null
    slots.inject(SLOT, () => {
      try {
        const ret = slots.register!(
          { name: SLOT, id: ID, order: 30, inject: () => ({}) },
          (props: { sessionId?: string }) =>
            SessionHeaderAction({
              sessionId: props?.sessionId ?? '',
              getWorkspacePath: (sid) => getWorkspacePath(ctx, sid),
              subscribe: (fn) => subscribe(ctx, fn),
              createRpc: () => ctx.rpc,
              loadCustomNames: () => loadCustomNames(ctx),
            }),
        )
        if (typeof ret === 'function') stop = ret as () => void
      } catch {
        stop = null
      }
    })
    return () => {
      try {
        stop?.()
      } catch {
        /* 清理失败忽略 */
      }
    }
  } catch {
    return noop
  }
}
