/** e2-adopt 特性唯一出口（E2）：拖拽领养——把 Bot 分配给工作区（分身份）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountE2Adopt } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'e2-adopt',
  name: '拖拽领养',
  order: 12,
  slots: [{ target: 'workspace-rail', mount: (ctx) => mountE2Adopt(ctx) }],
  installStyles: () => installFeatureStyles('e2-adopt', CSS),
}
