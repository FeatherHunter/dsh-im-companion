/** 未读染色唯一出口（永久功能 #55）：事件源挂载 + 行染色挂载 + unread 命名空间样式。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountUnreadEvents } from './events'
import { mountUnreadPaint } from './paint-mount'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'unread',
  name: '未读',
  order: 96,
  slots: [
    { target: 'workspace-rail', mount: function (ctx) { return mountUnreadEvents(ctx) } },
    { target: 'workspace-rail', mount: function (ctx) { return mountUnreadPaint(ctx) } },
  ],
  installStyles: () => installFeatureStyles('unread', CSS),
}
