/** fleet-radar 特性唯一出口：舰队雷达（A 稠密表 verdict #10；DSH 正中大弹窗）。
 * 事件制（DetailDrawer 抽屉同款）：A1 船按钮经 FLEET_VIEW_EVENT 派发，本特性监听后居中弹模态；
 * A1/装配层零感知矩阵，矩阵不引 A1；开弹窗才订阅、关即退订，卸载无残留。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountRadar } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'fleet-radar',
  name: '舰队雷达',
  order: 23,
  slots: [{ target: 'settings.section', mount: (ctx) => mountRadar(ctx) }],
  installStyles: () => installFeatureStyles('fleet-radar', CSS),
}
