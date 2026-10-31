/**
 * base 包共享 UI（插件基座接入）：联系入口与联系弹窗的**唯一真源** = dsh-featherhunter-plugin-base/client。
 *
 * 本仓不再持有群二维码图片、群链接或联系文案：群码/文案来自 base 包的发布数据（CDN @latest），
 * README 的联系块也由 base 的 readme 工具生成（见 package.json 的 readme:* 脚本）。
 * 这里只给设置面板提供 ContactRow —— 点击在面板上层弹 base.openContactModal。
 * 注意：不引 AuthorPlugins（本仓面板底部已有自己的关联卡），也不自绘任何联系弹窗。
 */
import * as React from 'react'
import { createBaseUI, ensureBaseStyles, type BaseUI } from 'dsh-featherhunter-plugin-base/client'
import { activeLocale } from './i18n'

const SELF_ID = 'dsh-im-companion'

/* createBaseUI 的组件绑定建实例时的语言与 selfId ⇒ 语言切换后重建（设置面板壳整体重挂驱动）。 */
let cache: BaseUI | null = null
let cacheLang = ''

function baseUI(): BaseUI {
  const lang = activeLocale()
  if (!cache || cacheLang !== lang) {
    cacheLang = lang
    cache = createBaseUI(React, { lang, selfId: SELF_ID })
  }
  return cache
}

/** base 样式是文档级一次性注入（id: dsh-base-ui-style）；首帧前补齐。 */
function ensureBaseStylesOnce(): void {
  if (typeof document !== 'undefined') ensureBaseStyles(document)
}

/** 整行式联系入口：点击弹 base 联系弹窗（群码与文案来自 base 发布数据）。 */
export function ContactRow(): React.ReactElement | null {
  ensureBaseStylesOnce()
  return React.createElement(baseUI().ContactRow, {})
}
