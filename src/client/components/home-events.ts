/** 绿框 cross-feature 事件出口（T8-4 #172）：跨层派发的窗口事件集中在本文件。
 *
 * 自成一文件是为守 panel-body.ts 的 300 行红线——emitDrawer 从 panel-body **一字不改**搬到这里，
 * 派发语义（事件名/异常吞法/日志口径）与搬移前完全一致；#173 的 OPEN_ASSIST_EDIT_EVENT
 * 派发与监听也落这里，别处不再自开窗口通道。 */
import { OPEN_DRAWER_EVENT, type OpenDrawerDetail } from '../data/config'
import { logLine, logOn } from '../log'

/** 打开右侧抽屉（抽屉归属别的 feature，绿框只广播事件）。 */
export function emitDrawer(key: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    const detail: OpenDrawerDetail = { key }
    window.dispatchEvent(new window.CustomEvent(OPEN_DRAWER_EVENT, { detail }))
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel.body', action: 'open-drawer', ok: false, message: '派发失败，抽屉打不开：' + String((e as Error)?.message ?? e) })
  }
}
