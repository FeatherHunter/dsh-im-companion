/** d1-home 特性唯一出口（D1）：在家看全换家——设置页花名册主件 + 左栏只读入口。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountEntry, mountRoster } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'd1-home',
  name: '在家管',
  order: 21,
  slots: [
    { target: 'settings.section', mount: (ctx) => mountRoster(ctx) },
    { target: 'workspace-rail', mount: (ctx) => mountEntry(ctx) },
  ],
  installStyles: () => installFeatureStyles('d1-home', CSS),
}
