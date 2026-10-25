/** adopt 头栏入口按钮（左栏头“串门”小图标；锚点走共享唯一真相源，与 left-filter 同锚→成对出现，要错一起错）。
 * 从 view.ts 拆出：view 有 300 行红线，入口装配另起一档；行为一字不动（fail-closed：锚点不在就不挂）。
 * #184 验收修（真机：英文态本入口与漏斗钮一起消失）：换语言时 DSH 重建左栏头，注入钮被旧头带走。
 * 旧实现只靠 15s 快照重挂（最长空窗 15s，验收当场正好撞见「两个钮都没了」）；改为自己盯 DOM：
 * 钮不在/已脱文档就在下一帧重挂，幂等、无轮询、锚点路径与 fail-closed 口径不变。 */
import { findWorkspaceHeaderFromNode, h } from '../../client/dom'
import { logLine, logOn } from '../../client/log'

const GROUP_SEL = 'div[role="treeitem"][aria-expanded]'
const ENTRY_CLASS = 'adopt-entry'

let entryBtn: HTMLElement | null = null
let lastOpen: (() => void) | null = null
let observer: MutationObserver | undefined
let rafQueued = false
let missLogged = false

/** 头栏锚点：共享唯一真相源（与 left-filter 同函数→同输入同输出，配对永不散）。 */
function resolveHeader(container: Element): Element | null {
  try { return findWorkspaceHeaderFromNode(container) } catch { return null }
}

/** 下一帧重挂（多次 DOM 变更合并成一次；幂等：挂上后观察者回调自然不再排队）。 */
function scheduleEnsure(): void {
  if (rafQueued) return
  rafQueued = true
  const run = (): void => {
    rafQueued = false
    const fn = lastOpen
    if (!fn) return
    try { ensureEntry(fn) } catch { /* 忽略 */ }
  }
  try { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run() } catch { run() }
}

/** DOM 观察者：只在「钮不在文档里」时重试（头被换新 / 钮被摘都会触发）。只读观察，不写 DOM。 */
function watchDom(): void {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  try {
    observer = new MutationObserver(() => { if (!entryBtn || !entryBtn.isConnected) scheduleEnsure() })
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
  } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'adopt', action: 'entry-watch-fail', ok: false, message: 'DOM 观察不可用，入口只靠快照重挂：' + String((e as Error)?.message ?? e) }) }
}

export function ensureEntry(onOpen: () => void): void {
  try {
    lastOpen = onOpen
    if (typeof document === 'undefined') return
    watchDom()
    if (entryBtn && entryBtn.isConnected) return
    const lost = !!entryBtn
    entryBtn = null
    const groups = document.querySelectorAll(GROUP_SEL)
    if (!groups.length) return
    const section = groups[0].parentElement
    const container = section?.parentElement
    if (!container) return
    const header = resolveHeader(container)
    if (!header) {
      if (!missLogged) {
        missLogged = true
        if (logOn('debug')) logLine('debug', 'ui.action', { area: 'adopt', action: 'entry-anchor-miss', ok: false, message: '头栏锚点暂未找到（fail-closed，等结构稳定或下次 DOM 变更再试）' })
      }
      return
    }
    missLogged = false
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
    if (lost && logOn('debug')) logLine('debug', 'ui.action', { area: 'adopt', action: 'entry-reinject', ok: true, message: '入口钮被换头带走 ⇒ 已重挂到当前头栏' })
  } catch (e) { if (logOn('debug')) logLine('debug', 'ui.action', { area: 'adopt', action: 'entry-fail', ok: false, message: '头栏锚点/入口按钮未挂（fail-closed）：' + String((e as Error)?.message ?? e) }) }
}

export function clearEntry(): void {
  try { observer?.disconnect() } catch { /* 忽略 */ }
  observer = undefined
  lastOpen = null
  missLogged = false
  try { entryBtn?.remove() } catch { /* 忽略 */ }
  entryBtn = null
}
