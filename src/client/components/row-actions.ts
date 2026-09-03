/** 行内 ⋯ 操作菜单：重命名 / 选家 / 移除渠道机器人（二次确认）/ 删除本地 Agent。 */
import { showMenu } from '../ui/menu'
import { channelLabel } from '../data/config'
import type { AgentView } from '../data/model'

export interface RowActionCallbacks {
  rename(): void
  pickWorkspace(): void
  removeBot(channel: string, botId: string): void
  deleteLocal(): void
}

export function openMoreMenu(view: AgentView, anchor: HTMLElement, cb: RowActionCallbacks): void {
  const items: {
    label: string
    iconName: 'pencil' | 'folder' | 'trash'
    danger?: boolean
    confirm?: boolean
    sep?: boolean
    onSelect?: () => void
  }[] = []

  items.push({ label: '重命名', iconName: 'pencil', onSelect: () => cb.rename() })
  items.push({
    label: view.workspace ? '更换工作区…' : '选择工作区…',
    iconName: 'folder',
    onSelect: () => cb.pickWorkspace(),
  })

  if (!view.isLocal && view.bots.length) {
    items.push({ label: '渠道机器人', iconName: 'trash', sep: true })
    for (const b of view.bots) {
      items.push({
        label: '移除渠道·' + channelLabel(b.channel) + ' 机器人',
        iconName: 'trash',
        danger: true,
        confirm: true,
        onSelect: () => cb.removeBot(b.channel, b.botId),
      })
    }
  }
  if (view.isLocal) {
    items.push({ label: '删除 Agent', iconName: 'trash', sep: true })
    items.push({ label: '删除 Agent 及其本地记录', iconName: 'trash', danger: true, confirm: true, onSelect: () => cb.deleteLocal() })
  }

  showMenu(anchor, items, 'bottom-left')
}
