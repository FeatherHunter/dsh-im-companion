/** update-center 特性唯一出口：更新中心（T8 #91）。
 * 事件制（fleet-radar 同款）：A1 面板骨架建好即经 UPDATE_CENTER_HOST_EVENT 派发 host 容器，
 * 本特性监听后自挂自管（自备内容样式），收到 host=null 即回收；A1/装配层零感知本特性。
 * 契约 §2：id/name/order/slots/installStyles 五项即全部对外入口。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountUpdateCenter } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'update-center',
  name: '更新中心',
  order: 24,
  slots: [{ target: 'settings.section', mount: (ctx) => mountUpdateCenter(ctx) }],
  installStyles: () => installFeatureStyles('update-center', CSS),
}
