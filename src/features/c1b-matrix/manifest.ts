/** c1b-matrix 特性唯一出口：舰队雷达（A 稠密表 verdict #10；单入口后由装配层统一挂载）。
 * 归属声明：slot 目标 settings.section 仅作特性归属标记；DOM 由 client/index 装配层挂载
 * （单入口：A1 船按钮/雷达返回键经 FLEET_VIEW_EVENT 切换显隐，本 mount 只做占位，卸载无残留）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'c1b-matrix',
  name: '舰队雷达',
  order: 23,
  slots: [{ target: 'settings.section', mount: () => () => {} }],
  installStyles: () => installFeatureStyles('c1b-matrix', CSS),
}
