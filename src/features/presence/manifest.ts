/** presence 特性唯一出口（E1）：在场感动效（变体 A 落地，独立 presence-* 命名空间）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountPresence } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'presence',
  name: '在场感动效',
  order: 13,
  slots: [{ target: 'workspace-rail', mount: (ctx) => mountPresence(ctx) }],
  installStyles: () => installFeatureStyles('presence', CSS),
}
