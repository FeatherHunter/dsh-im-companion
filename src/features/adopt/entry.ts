/** adopt 头栏入口按钮（左栏头“串门”小图标；锚点走共享唯一真相源，与 left-filter 同锚→成对出现，要错一起错）。
 * 从 view.ts 拆出：view 有 300 行红线，入口装配另起一档；行为一字不动（fail-closed：锚点不在就不挂）。 */
import { findWorkspaceHeaderFromNode, h } from '../../client/dom'
import { logLine, logOn } from '../../client/log'

const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'
const ENTRY_CLASS = 'adopt-entry'

let entryBtn: HTMLElement | null = null

/** 头栏锚点：共享唯一真相源（与 left-filter 同函数→同输入同输出，配对永不散）。 */
function resolveHeader(container: Element): Element | null {
  try { return findWorkspaceHeaderFromNode(container) } catch { return null }
}

export function ensureEntry(onOpen: () => void): void {
  try {
    if (typeof document === 'undefined') return
    if (entryBtn && entryBtn.isConnected) return
    entryBtn = null
    const groups = document.querySelectorAll(GROUP_SEL)
    if (!groups.length) return
    const section = groups[0].parentElement
    const container = section?.parentElement
    if (!container) return
    const header = resolveHeader(container)
    if (!header) return
    if (header.querySelector('.' + ENTRY_CLASS)) return
    const btn = h('button', {
      className: ENTRY_CLASS,
      title: '串门：看看各家机器人，拖一拖就搬家',
      'aria-label': '串门：重新分配机器人归属',
      onClick: () => { try { onOpen() } catch { /* 忽略 */ } },
      html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="12" height="9" rx="2.5"/><circle cx="10" cy="13.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="14" cy="13.5" r="1.1" fill="currentColor" stroke="none"/><path d="M12 9V5"/><circle cx="12" cy="4" r="1"/><path d="M3.5 20c1.5-1.2 3-1.7 4.5-1.7M20.5 20c-1.5-1.2-3-1.7-4.5-1.7"/></svg>',
    }) as HTMLElement
    header.appendChild(btn)
    entryBtn = btn
  } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'adopt', action: 'entry-fail', ok: false, message: '头栏锚点/入口按钮未挂（fail-closed）：' + String((e as Error)?.message ?? e) }) }
}

export function clearEntry(): void {
  try { entryBtn?.remove() } catch { /* 忽略 */ }
  entryBtn = null
}
