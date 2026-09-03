/** c1a 特性唯一出口：详情抽屉（B 变体 verdict #9）。
 * 说明：slot 挂载只注册窗口事件监听，不向 settings.section 注入任何 DOM（详情按需经 ui/sheet 居中模态挂 body）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountDrawer } from './drawer'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'c1a',
  name: '详情抽屉',
  order: 20,
  slots: [{ target: 'settings.section', mount: (ctx) => mountDrawer(ctx) }],
  installStyles: () => installFeatureStyles('c1a', CSS),
}
