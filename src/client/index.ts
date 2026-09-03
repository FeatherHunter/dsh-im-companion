/** dsh-im-companion client 入口：注册设置面板（settings.section, order 22）。
 * 铁律：settings.section 注册组件必须返回 React 元素 —— 用 React 外壳挂载命令式 FleetPanel。 */
import * as React from 'react'
import { installStyles } from './theme'
import { FleetPanel } from './components/panel'
import { startLeftBadges } from './components/left-badges'
import { B3HeaderAction } from './components/b3-header'
import { extractRpc } from './data/rpc'
import { resolveWorkspacePath, type WorkspaceItem } from './data/header-overlay'

export const inject = ['slots', 'connection', 'workspaces']

export function apply(ctx: any): void {
  const PLUGIN_ID = 'dsh-im-companion'

  const disposeStyles = installStyles()

  /* B1 左栏徽标：独立于设置面板运行；失败只降级叠加，不影响面板 */
  let stopBadges: (() => void) | null = null
  try {
    stopBadges = startLeftBadges(extractRpc(ctx))
  } catch {
    stopBadges = null
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
    try {
      stopBadges?.()
    } catch {
      /* 清理失败忽略 */
    }
    disposeStyles()
  }, 'dsh-im-companion: styles+badges')
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
        B3HeaderAction({ sessionId: props?.sessionId ?? '', getWorkspacePath: getB3WorkspacePath, createRpc: createB3Rpc })),
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
