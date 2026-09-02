/** dsh-im-companion client 入口：注册设置面板（settings.section, order 22）。
 * 铁律：settings.section 注册组件必须返回 React 元素 —— 用 React 外壳挂载命令式 FleetPanel。 */
import * as React from 'react'
import { installStyles } from './theme'
import { FleetPanel } from './components/panel'

export const inject = ['slots', 'connection']

export function apply(ctx: any): void {
  const PLUGIN_ID = 'dsh-im-companion'

  const disposeStyles = installStyles()

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

  ctx.effect(() => () => disposeStyles(), 'dsh-im-companion: styles')
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
