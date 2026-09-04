/** session-header 选择器渲染（#32：渠道/机器人/会话三组按钮共用一套现有类，零新样式）。
 * 纯渲染 helper：原样承接 panel 的渠道 logo 与按钮形态，行为零改；归属本特性自有。 */
import * as React from 'react'
import { channelGlyphSvg } from '../../client/icons'
import type { OverlayChannel } from '../../client/data/header-overlay'

/** 渠道行 logo：品牌 glyph + 健康点（原样迁自 panel）。 */
export function channelLogo(ch: OverlayChannel): React.ReactNode {
  return React.createElement(
    'span',
    { className: 'session-header-chlogo' },
    (() => {
      const logo = channelGlyphSvg(ch.channel, 18)
      if (logo) {
        return React.createElement('span', {
          className: 'session-header-chlogoin',
          dangerouslySetInnerHTML: { __html: logo },
        })
      }
      return React.createElement(
        'span',
        { className: 'session-header-chbadge', style: { background: ch.color } },
        ch.label.charAt(0) || '?',
      )
    })(),
    React.createElement('span', { className: 'session-header-chst ' + ch.kind }),
  )
}

/** 通用选择块：标题 + 最多 5 个按钮（复用 session-header-btn/row/sub 类）。 */
export function pickerBlock(
  title: string,
  labels: string[],
  disabled: boolean,
  onPick: (index: number) => void,
): React.ReactNode {
  return React.createElement(
    'div',
    null,
    React.createElement('div', { className: 'session-header-sub' }, title),
    React.createElement(
      'div',
      { className: 'session-header-row' },
      ...labels.slice(0, 5).map((label, i) =>
        React.createElement(
          'button',
          { type: 'button', key: i, title: label, className: 'session-header-btn', disabled, onClick: () => onPick(i) },
          label,
        ),
      ),
    ),
  )
}
