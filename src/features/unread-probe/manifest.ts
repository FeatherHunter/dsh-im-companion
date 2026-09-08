/** TEMP 未读探针唯一出口（定稿即删）：#51 官方快照可读性真机探针，无 UI 无样式。 */
import type { FeatureManifest } from '../protocol'
import { mountUnreadProbe } from './mount'

export const feature: FeatureManifest = {
  id: 'unread-probe',
  name: '未读探针（临时定稿即删）',
  order: 98,
  slots: [{ target: 'workspace-rail', mount: function (ctx) { return mountUnreadProbe(ctx) } }],
}
