/** left-badges 特性唯一出口（B1）：左栏工作区 IM 徽标。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountLeftBadges } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'left-badges',
  name: '左栏徽标',
  order: 10,
  slots: [{ target: 'workspace-rail', mount: (ctx) => mountLeftBadges(ctx) }],
  installStyles: () => installFeatureStyles('left-badges', CSS),
}
