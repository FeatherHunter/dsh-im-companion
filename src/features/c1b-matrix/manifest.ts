/** c1b-matrix 特性唯一出口：Fleet 矩阵总览（A 稠密表 verdict #10）。
 * 自注册独立 settings.section（order 23），零 A1 私有触碰；点格钻取走 C1a 抽屉真消费者。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountMatrix } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'c1b-matrix',
  name: '矩阵总览',
  order: 23,
  slots: [{ target: 'settings.section', mount: (ctx) => mountMatrix(ctx) }],
  installStyles: () => installFeatureStyles('c1b-matrix', CSS),
}
