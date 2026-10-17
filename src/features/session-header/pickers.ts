/** session-header 选择器渲染（#32：渠道/机器人/会话三组按钮共用一套现有类，零新样式）。
 * #144：助理脸 + 助理分组 + 助理单选（只加导出，panel 原样调用；样式见 styles.ts 新增类）。
 * 纯渲染 helper：原样承接 panel 的渠道 logo 与按钮形态，行为零改；归属本特性自有。 */
import * as React from 'react'
import { channelGlyphSvg } from '../../client/icons'
import type { OverlayChannel } from '../../client/data/header-overlay'
import type { AssistBrief } from './assistants'

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
export function pickerBlock(  title: string,
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

/** 助理脸（#144）：上传图/机器人头像优先，未到画色脸首字；尺寸走内联宽高（默认 20，标题 28）。 */
export function assistantFace(img: string | null, tint: string, initial: string, size = 20): React.ReactNode {
  const fs = Math.max(9, Math.round(size * 0.45))
  if (img) {
    return React.createElement('span', { className: 'session-header-aface' },
      React.createElement('img', { src: img, alt: '', width: size, height: size, draggable: false } as object))
  }
  return React.createElement('span', {
    className: 'session-header-aface',
    ref: (el: unknown) => {
      try {
        const d = el as { setAttribute?: (k: string, v: string) => void } | null
        d?.setAttribute?.('style', (tint ? tint + ';' : '') + `width:${size}px;height:${size}px;font-size:${fs}px`)
      } catch { /* 忽略 */ }
    },
  }, initial || '?')
}

/** 助理名＋状态字（状态色跟 #142 绿档：在线绿/待确认黄/离线灰/未绑定灰）。 */
export function assistantName(b: AssistBrief, faceSize = 20): React.ReactNode {
  return React.createElement('span', { className: 'session-header-ahead' },
    assistantFace(b.img, b.tint, b.initial, faceSize),
    React.createElement('span', null, b.name),
    React.createElement('span', { className: 'session-header-astatus ' + b.status }, b.statusText))
}

/** 弹窗渠道区（#144）：有助理行按助理分组（组头助理＋组下其渠道），无行回落旧平铺。 */
export function assistantGroups(briefs: AssistBrief[], channels: OverlayChannel[]): React.ReactNode {
  if (!briefs.length) {
    return React.createElement('div', { className: 'session-header-channels' },
      ...channels.map((ch) => React.createElement('div',
        { className: 'session-header-chrow', key: ch.channel, title: ch.label + '，' + ch.statusText, 'aria-label': ch.label + '，' + ch.statusText },
        channelLogo(ch), React.createElement('span', null, ch.label))))
  }
  const byCh = new Map(channels.map((ch) => [ch.channel, ch]))
  return React.createElement('div', { className: 'session-header-channels' },
    ...briefs.map((b) => {
      const ch = byCh.get(b.assistant.channel)
      const label = ch?.label ?? b.assistant.channel
      const tip = label + '，' + (ch?.statusText ?? b.statusText)
      return React.createElement('div', { className: 'session-header-agroup', key: b.assistant.id },
        React.createElement('div', { title: b.name + '，' + b.statusText, 'aria-label': b.name + '，' + b.statusText }, assistantName(b)),
        ch ? React.createElement('div', { className: 'session-header-chrow', title: tip, 'aria-label': tip }, channelLogo(ch), React.createElement('span', null, label))
          : React.createElement('div', { className: 'session-header-chrow', title: tip, 'aria-label': tip }, React.createElement('span', null, label)))
    }))
}

/** 助理单选块（#144）：多助理时先选发送助理；每项脸＋名＋状态＋渠道（最多 5 项）。 */
export function assistantPickerBlock(briefs: AssistBrief[], channels: OverlayChannel[], disabled: boolean, onPick: (index: number) => void): React.ReactNode {
  const byCh = new Map(channels.map((ch) => [ch.channel, ch]))
  return React.createElement('div', null,
    React.createElement('div', { className: 'session-header-sub' }, '选择发送助理：'),
    React.createElement('div', { className: 'session-header-row' },
      ...briefs.slice(0, 5).map((b, i) => {
        const ch = byCh.get(b.assistant.channel)
        const tip = b.name + '，' + b.statusText + '（' + (ch?.label ?? b.assistant.channel) + '）'
        return React.createElement('button',
          { type: 'button', key: b.assistant.id, title: tip, 'aria-label': tip, className: 'session-header-btn session-header-abtn', disabled, onClick: () => onPick(i) },
          assistantFace(b.img, b.tint, b.initial, 20),
          React.createElement('span', { className: 'session-header-abname' }, b.name),
          ch ? channelLogo(ch) : null)
      })))
}
