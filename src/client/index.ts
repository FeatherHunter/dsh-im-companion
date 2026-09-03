/** dsh-im-companion client 入口：注册设置面板（settings.section, order 22）。
 * 铁律：settings.section 注册组件必须返回 React 元素 —— 用 React 外壳挂载命令式 FleetPanel。 */
import * as React from 'react'
import { installStyles } from './theme'
import { FleetPanel } from './components/panel'
import { B3HeaderAction } from './components/b3-header'
import { extractRpc } from './data/rpc'
import { createConnectionStream, type StreamSnapshot } from './data/connection-stream'
import { createMetaStore, type MetaStore } from './data/meta'
import { resolveWorkspacePath, type WorkspaceItem } from './data/header-overlay'
import { FEATURES, type FeatureCtx, type SlotsService } from '../features'

/* 注：workspaces 经 ctx.get 惰性可选查找（无需声明）；声明会引入 provider 卸载连带，不声明更稳。 */
export const inject = ['slots', 'connection']

export function apply(ctx: any): void {
  const PLUGIN_ID = 'dsh-im-companion'

  const disposeStyles = installStyles()

  /* F0 特性装配：FEATURES 列表循环挂载（index 只改此列表）；单份 stream 供所有特性订阅 */
  const rpc = extractRpc(ctx)
  const stream = createConnectionStream(rpc)
  let metaCache: MetaStore | null = null
  void createMetaStore(rpc).then((m) => {
    metaCache = m
  }).catch(() => {
    metaCache = null
  })
  const featureCtx: FeatureCtx = {
    rpc,
    subscribe: (fn) => stream.subscribe(fn),
    refresh: () => stream.refresh(),
    get meta() {
      if (!metaCache) throw new Error('[dsh-im-companion] meta 未就绪')
      return metaCache
    },
    slots: ctx.slots as SlotsService,
    get: () => undefined,
  }
  const stopFeatures: (() => void)[] = []
  for (const f of FEATURES) {
    try {
      if (typeof f.installStyles === 'function') {
        const stop = f.installStyles()
        if (typeof stop === 'function') stopFeatures.push(stop)
      }
      for (const s of f.slots ?? []) stopFeatures.push(s.mount(featureCtx))
    } catch {
      /* 单个特性失败不影响其他 */
    }
  }

  const FleetSettingsTab: React.FC = () => {
    const ref = React.useRef<HTMLDivElement | null>(null)
    React.useEffect(() => {
      const mount = ref.current
      if (!mount) return
      let panel: HTMLElement | null = null
      try {
        mount.replaceChildren()
        panel = FleetPanel(ctx)
        mount.appendChild(panel)
      } catch (e) {
        console.error('[dsh-im-companion] mount error', e)
        const box = document.createElement('div')
        box.textContent = 'IM机器人辅助 加载失败：' + String((e as Error)?.message ?? e)
        box.style.cssText = 'padding:20px;color:var(--dsw-alias-state-error-primary);'
        mount.replaceChildren(box)
      }
      return () => {
        try {
          ;(panel as unknown as { __afDispose?: () => void })?.__afDispose?.()
        } catch {
          /* noop */
        }
        mount.replaceChildren()
      }
    }, [])
    return React.createElement('div', { ref, style: { background: 'transparent' } })
  }

  ctx.effect(() => () => {
    for (const stop of stopFeatures) {
      try {
        stop()
      } catch {
        /* 清理失败忽略 */
      }
    }
    try {
      stream.dispose()
    } catch {
      /* 清理失败忽略 */
    }
    disposeStyles()
  }, 'dsh-im-companion: styles+features')
  /* B3 Header 浮层（C 变体）：conversation.session.header.utilities 呼吸点；取不到工作区服务就隐藏，不影响原生 Header */
  const getB3WorkspacePath = (sessionId: string): string | undefined => {
    try {
      const svc = (ctx as { get?: (name: string) => unknown } | null)?.get?.('workspaces') as {
        list?: { getSnapshot?: () => { items?: WorkspaceItem[] } }
      } | null
      const items = svc?.list?.getSnapshot?.()?.items
      if (!Array.isArray(items)) return undefined
      return resolveWorkspacePath(sessionId, items)
    } catch {
      return undefined
    }
  }
  const subscribeB3 = (fn: (snap: StreamSnapshot) => void): (() => void) => {
    try {
      return stream.subscribe(fn)
    } catch {
      return () => {}
    }
  }
  const createB3Rpc = (): import('./data/fleet-api').RpcCall | null => {
    try {
      return extractRpc(ctx)
    } catch {
      return null
    }
  }
  try {
    ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: PLUGIN_ID + ':b3-header',
        order: 30,
        inject: () => ({}),
      }, (props: { sessionId?: string }) =>
        B3HeaderAction({ sessionId: props?.sessionId ?? '', getWorkspacePath: getB3WorkspacePath, subscribe: subscribeB3, createRpc: createB3Rpc })),
    )
  } catch {
    /* 老宿主无该槽位就跳过（设置面板不受影响） */
  }
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: PLUGIN_ID,
      order: 22,
      label: () => 'IM机器人辅助',
      inject: () => ({}),
    }, FleetSettingsTab),
  )
}
