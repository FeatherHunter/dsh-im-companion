/// <reference path="./react-dom-client.d.ts" />
/**
 * base 包共享 UI（插件基座接入）：联系入口与联系弹窗的**唯一真源** = dsh-featherhunter-plugin-base/client。
 *
 * 本仓不再持有群二维码图片、群链接或联系文案：群码/文案来自 base 包的发布数据（CDN @latest），
 * README 的联系块也由 base 的 readme 工具生成（见 package.json 的 readme:* 脚本）。
 * 这里给设置面板两处 UI：① 底部 ContactRow（点击在面板上层弹 base.openContactModal）；
 * ② 页头三件套 ActionGroup（base 0.1.1：联系 / Star / Issue 一枚胶囊，替代旧自绘的两枚图标钮）。
 * 注意：不引 AuthorPlugins（本仓面板底部已有自己的关联卡），也不自绘任何联系弹窗。
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
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

/** 整行式联系入口：点击弹 base 联系弹窗（群码与文案来自 base 发布数据）。 */
export function ContactRow(): React.ReactElement | null {
  ensureBaseStylesOnce()
  return React.createElement(baseUI().ContactRow, {})
}

/** 页头三件套挂进命令式面板：独立 React root，返回卸载函数（面板 __afDispose 里调用）。
 *  size 16 = base 页头默认尺度：单枚图标 16px + 6px 内边距 = 28×28，三枚胶囊 88×32，
 *  与旧两枚 32px 钮（70px）比只 +18px，窄面板页头单行预算仍够（见 panel.ts 页头注释）。 */
export function mountHeaderActions(host: HTMLElement): () => void {
  ensureBaseStylesOnce()
  const root = createRoot(host)
  root.render(React.createElement(baseUI().ActionGroup, { size: 16 }))
  /* 卸载发生在宿主 React 的 effect 清理里（面板重挂 / 切走设置页）：同步 unmount 一棵嵌套 root 会踩
   * React 19 的「already rendering」告警；挪到微任务，等本轮 commit 收尾再拆（宿主容器可能已 detach，
   * React 仍能正常回收）。 */
  return () => {
    const unmount = (): void => {
      try { root.unmount() } catch { /* 已卸载（重复 dispose）忽略 */ }
    }
    if (typeof queueMicrotask === 'function') queueMicrotask(unmount)
    else unmount()
  }
}
