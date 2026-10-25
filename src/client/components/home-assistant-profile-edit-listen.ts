/** 助理编辑事件监听（T8-4 #172 补丁 B）：「编辑助理资料」的跨层通道只此一条。
 *
 * 派发方是详情面板（#173）的「编辑」；监听方是家面板 A1 私有层（panel-body）——两端都不引对方文件，
 * 只共认 src/client/data/config.ts 里的事件名与 detail 形状（Added-only，#173 的契约）。
 * 本文件只做「订/退订 ＋ fail-soft」：环境里没有 window / addEventListener（单测桩、SSR）就不订，绝不抛。
 * 单实例：重复 bind（热重载、面板重建）先把上一份退掉，绝不让监听叠加（否则一次派发开两次窗）。 */
import { OPEN_ASSISTANT_PROFILE_EDIT_EVENT, type AssistantProfileEditDetail } from '../data/config'

let active: (() => void) | null = null

/** 订阅「编辑助理资料」：返回退订函数（幂等，随时可调）。 */
export function bindAssistantProfileEdit(onEdit: (d: AssistantProfileEditDetail) => void): () => void {
  try {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
    const handler = (ev: Event): void => {
      const d = (ev as CustomEvent<AssistantProfileEditDetail>).detail
      if (!d || typeof d.assistantId !== 'string' || d.assistantId === '') return
      onEdit(d)
    }
    const off = (): void => {
      try { window.removeEventListener(OPEN_ASSISTANT_PROFILE_EDIT_EVENT, handler) } catch { /* 退订失败不改变行为 */ }
      if (active === off) active = null
    }
    if (active) active()
    window.addEventListener(OPEN_ASSISTANT_PROFILE_EDIT_EVENT, handler)
    active = off
    return off
  } catch { return () => {} }
}
