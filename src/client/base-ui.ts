/**
 * base 包共享 UI（插件基座接入）：页头快捷入口的**唯一真源** = dsh-featherhunter-plugin-base/client。
 *
 * 本仓不再持有群二维码图片、群链接或联系文案：群码/文案来自 base 包的发布数据（CDN @latest），
 * README 的联系块也由 base 的 readme 工具生成（见 package.json 的 readme:* 脚本）。
 * 这里只给设置面板一处 UI：页头三件套 ActionCluster（base 0.1.2 v2 默认款：联系 / Star / Issue
 * 三枚独立 28×28 彩色图标钮组成无外框静默簇；旧 ActionGroup 胶囊与底部 ContactRow 随票 05 退场）。
 * 注意：不引 AuthorPlugins（本仓面板底部已有自己的关联卡），也不自绘任何联系弹窗。
 */
import * as React from 'react'
import { createBaseUI, ensureBaseStyles, type BaseUI } from 'dsh-featherhunter-plugin-base/client'
import { activeLocale } from './i18n'
import { ISSUES_HREF, REPO_HREF } from './components/first-view-copy'

const SELF_ID = 'dsh-im-companion'

/* createBaseUI 的组件绑定建实例时的语言与 selfId ⇒ 语言切换后重建（设置面板壳整体重挂驱动）。
 * repoUrl/issuesUrl 是页头 Star / Issue 的去处；本仓仅此一处持有仓库地址（first-view-copy 导出）。 */
let cache: BaseUI | null = null
let cacheLang = ''

function baseUI(): BaseUI {
  const lang = activeLocale()
  if (!cache || cacheLang !== lang) {
    cacheLang = lang
    cache = createBaseUI(React, { lang, selfId: SELF_ID, repoUrl: REPO_HREF, issuesUrl: ISSUES_HREF })
  }
  return cache
}

/** base 样式是文档级一次性注入（id: dsh-base-ui-style）；首帧前补齐。 */
function ensureBaseStylesOnce(): void {
  if (typeof document !== 'undefined') ensureBaseStyles(document)
}

/** 页头三件套（联系 / Star / Issue）：base 0.1.2 ActionCluster 静默簇，size 16 = 单枚 28×28。
 *  由 index.ts 的装配壳经 createPortal 渲染进命令式面板的 .af-hd-actions 容器——同一棵 React 树，
 *  不再像 0.1.1 那样在面板里自建独立 root（切页 / 热重载只剩一棵树要收）。 */
export function HeaderActions(): React.ReactElement {
  ensureBaseStylesOnce()
  return React.createElement(baseUI().ActionCluster, { size: 16 })
}
