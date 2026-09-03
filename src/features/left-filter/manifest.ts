/** left-filter 特性唯一出口（B2）：左栏工作区筛选条（全部/已绑定/未绑定）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountLeftFilter } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'left-filter',
  name: '左栏筛选',
  order: 11,
  slots: [{ target: 'workspace-rail', mount: (ctx) => mountLeftFilter(ctx) }],
  installStyles: () => installFeatureStyles('left-filter', CSS),
}
