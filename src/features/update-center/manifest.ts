/** update-center 特性唯一出口：更新中心薄层（T5 #110 M3+M4）。
 * 事件制（fleet-radar 同款）：A1 面板骨架建好即经 UPDATE_CENTER_HOST_EVENT 派发 host 容器，
 * 本特性监听后自挂自管（包自带样式，无自产 CSS），收到 host=null 即回收；A1/装配层零感知本特性。
 * 契约 §2：id/name/order/slots 即全部对外入口（样式由包内 UPDATE_ENTRY_CSS/UPDATE_PANEL_CSS 自带，不再经 installFeatureStyles）。
 * order 24 / settings.section / 事件制容器三项原样保留（T2 M3）。
 */
import type { FeatureManifest } from '../protocol'
import { mountUpdateCenter } from './view'

export const feature: FeatureManifest = {
  id: 'update-center',
  name: '更新中心',
  order: 24,
  slots: [{ target: 'settings.section', mount: (ctx) => mountUpdateCenter(ctx) }],
}
