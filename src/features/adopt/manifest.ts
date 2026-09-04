/** adopt 特性唯一出口（Adopt）：拖拽领养——把 Bot 分配给工作区（分身份）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountAdopt } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'adopt',
  name: '拖拽领养',
  order: 12,
  slots: [{ target: 'workspace-rail', mount: (ctx) => mountAdopt(ctx) }],
  installStyles: () => installFeatureStyles('adopt', CSS),
}
