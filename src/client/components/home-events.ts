/** 绿框 cross-feature 事件出口（T8-4 #172）：跨层派发的窗口事件集中在本文件。
 *
 * 自成一文件是为守 panel-body.ts 的 300 行红线——emitDetailPanel 从 panel-body **一字不改**搬到这里，
 * 派发语义（事件名/异常吞法/日志口径）与搬移前完全一致；#173 的 OPEN_ASSISTANT_PROFILE_EDIT_EVENT
 * 派发与监听也落这里，别处不再自开窗口通道。 */
import { OPEN_DETAIL_PANEL_EVENT, type AssistantProfileBrief, type OpenDetailPanelDetail } from '../data/config'
import { logLine, logOn } from '../log'

/** 打开右侧详情面板（详情面板归属别的 feature，绿框只广播事件）；#173 起第二参可带助理资料快照（缺省 null）。 */
export function emitDetailPanel(key: string, assistant: AssistantProfileBrief | null = null): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    const detail: OpenDetailPanelDetail = { key, assistant }
    window.dispatchEvent(new window.CustomEvent(OPEN_DETAIL_PANEL_EVENT, { detail }))
  } catch (e) {
    if (logOn('debug')) logLine('debug', 'ui.action', { area: 'panel.body', action: 'open-detail-panel', ok: false, message: '派发失败，详情面板打不开：' + String((e as Error)?.message ?? e) })
  }
}
