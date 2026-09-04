/** session-header 特性唯一出口（SessionHeader · #18）：工作区 Header 浮层（C 变体呼吸点）。
 * 会话 Header 右侧常驻呼吸点：悬停知状态，点击展开详情卡（自定义名 + 渠道行 + 发测试消息）。 */
import { installFeatureStyles } from '../../client/theme'
import type { FeatureManifest } from '../protocol'
import { mountSessionHeader } from './view'
import { CSS } from './styles'

export const feature: FeatureManifest = {
  id: 'session-header',
  name: '工作区 Header 浮层',
  order: 30,
  slots: [{ target: 'session-header', mount: (ctx) => mountSessionHeader(ctx) }],
  installStyles: () => installFeatureStyles('session-header', CSS),
}
