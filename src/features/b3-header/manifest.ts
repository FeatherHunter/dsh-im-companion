/** b3-header 特性唯一出口（B3 · #18）：工作区 Header 浮层（C 变体呼吸点）。
 * 会话 Header 右侧常驻呼吸点：悬停知状态，点击展开详情卡（自定义名 + 渠道行 + 发测试消息）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountB3Header } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'b3-header',
  name: '工作区 Header 浮层',
  order: 30,
  slots: [{ target: 'session-header', mount: (ctx) => mountB3Header(ctx) }],
  installStyles: () => installFeatureStyles('b3-header', CSS),
}
