/** session-header 挂载：会话 Header 工具槽列表位（order 30）注册呼吸点。
 * 依赖只经 FeatureCtx：读快照走 subscribe 单例流；写走 ctx.rpc 投递通道；
 * 自定义名走 ctx.meta；工作区归属经 ctx.get('workspaces') 惰性查找。
 * 防御式：槽位缺失/服务缺失/老宿主一律只隐藏自己，不影响原生 Header 与设置面板。 */
import * as React from 'react'
import { resolveWorkspacePath, type WorkspaceItem } from '../../client/data/header-overlay'
import type { StreamSnapshot } from '../../client/data/connection-stream'
import type { FeatureCtx } from '../protocol'
import { logLine } from '../../client/log'
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
    if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
      logLine('error', 'ui.render.fail', { area: 'session-header', message: '宿主 slots 缺 inject/register ⇒ 呼吸点降级隐藏' })
      return noop
    }
    let stop: (() => void) | null = null
    /* 依赖对象只建一次（ctx 在装配期固定）：槽组件每次渲染拿到的 subscribe/loadCustomNames
     * 必须是同一个身份，否则 panel 里 `useEffect(..., [sessionId, subscribe])` 会每渲染重订阅一次。
     * 重订阅时 connection-stream 会同步回放当前快照 → 拉 meta.get → setNames(新对象) 再次渲染 →
     * 紧循环（真机 0.2.20「正在加载」卡死 + 每秒数百条 meta.get 的根因，0.2.21 热修）。 */
    const deps = {
      getWorkspacePath: (sid: string) => getWorkspacePath(ctx, sid),
      subscribe: (fn: (snap: StreamSnapshot) => void) => subscribe(ctx, fn),
      createRpc: () => ctx.rpc,
      loadCustomNames: () => loadCustomNames(ctx),
    }
    slots.inject(SLOT, () => {
      try {
        /* 必须用 createElement 渲染成**子组件**：直接调用 SessionHeaderAction(...) 会把它的 hooks
         * 挂到槽包装组件上，它自己的 setState 就会重渲染包装组件（回调身份全换、effect 抖动）；
         * 渲染成子组件后状态只属于它自己，包装组件只渲一次。 */
        const ret = slots.register!(
          { name: SLOT, id: ID, order: 30, inject: () => ({}) },
          (props: { sessionId?: string }) => React.createElement(SessionHeaderAction, { sessionId: props?.sessionId ?? '', ...deps }),
        )
        if (typeof ret === 'function') stop = ret as () => void
      } catch (e) { logLine('error', 'ui.render.fail', { area: 'session-header', message: '呼吸点槽位注册失败（降级隐藏）：' + String((e as Error)?.message ?? e) }); stop = null }
    })
    return () => {
      try {
        stop?.()
      } catch {
        /* 清理失败忽略 */
      }
    }
  } catch (e) { logLine('error', 'feature.mount.fail', { feature: 'session-header', message: String((e as Error)?.message ?? e) }); return noop }
}
