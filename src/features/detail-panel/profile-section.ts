/** 详情面板「助理人设」只读块（#173 · 规格 #168）：名字/简介/人物设定三行 + persona 3 行折叠 + 复制 + 编辑跳转。
 * 只读投影：真值在 dsh-im 助理表（宿主回传的 brief）；编辑走 feature→A1 事件（契约 §4），本文件不发 RPC、不写数据。
 * 超长历史值（#168 数据模型：有 8800 字的历史 persona）完整显示，只在旁边给一句低调提示，绝不截断。 */
import { h } from '../../client/dom'
import { makeButton } from '../../client/ui/button'
import { ASSISTANT_FIELD_SPECS, countCodePoints } from '../../assistant-fields'
import type { DetailPanelModel } from './data'

export interface ProfileCallbacks {
  onEditAssistant(): void
  /** 复制结果轻提示（可选：静默渲染没有 toast）。 */
  onNotify?(message: string, icon?: 'check'): void
}

/** persona 折叠阈值：超过 3 行或 120 字才给「展开」（短人设不摆一个没用的按钮）。 */
const CLAMP_LINES = 3
const CLAMP_CHARS = 120

export function needsClamp(text: string): boolean {
  return text.split('\n').length > CLAMP_LINES || countCodePoints(text) > CLAMP_CHARS
}

/** 超长历史值：字数超上限即提示（不截断——规格要求完整显示，修正走编辑）。 */
export function isOverLimit(field: 'description' | 'persona', text: string): boolean {
  return countCodePoints(text) > ASSISTANT_FIELD_SPECS[field].max
}

/** 复制内容：名字 + 两栏原文（未填写留空，方便粘到别处再改）。 */
export function profileText(model: DetailPanelModel): string {
  const a = model.assistant
  if (!a) return ''
  return ['名字：' + a.name, '简介：' + a.description, '人物设定：' + a.persona].join('\n')
}

/** 剪贴板：navigator.clipboard 优先，退回 execCommand；两条都不行回 false（调用方给失败提示）。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(s: string): unknown } } }).navigator
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true }
  } catch {
    /* 落到 execCommand */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ;(ta as HTMLTextAreaElement).select?.()
    const ok = (document as unknown as { execCommand?: (c: string) => boolean }).execCommand?.('copy') === true
    ta.remove()
    return ok
  } catch {
    return false
  }
}

function row(label: string, value: HTMLElement | string): HTMLElement {
  return h('div', { className: 'detail-panel-profile-row' },
    h('span', { className: 'detail-panel-profile-lab' }, label),
    typeof value === 'string' ? h('div', { className: 'detail-panel-profile-val' }, value) : value)
}

/** persona：默认折到 3 行（CSS line-clamp），展开/收起只切类名——文本从头到尾都在 DOM 里，不丢字。 */
function personaValue(text: string): HTMLElement {
  const val = h('div', { className: 'detail-panel-profile-val detail-panel-profile-persona' }, text)
  if (!needsClamp(text)) return val
  const toggle = makeButton({ kind: 'ghost', size: 'sm', label: '展开' })
  const setClamped = (on: boolean): void => {
    if (on) val.classList.add('is-clamped')
    else val.classList.remove('is-clamped')
    toggle.textContent = on ? '展开' : '收起'
    toggle.title = on ? '展开人物设定全文' : '收起人物设定'
    toggle.setAttribute('aria-expanded', on ? 'false' : 'true')
  }
  setClamped(true)
  toggle.addEventListener('click', () => setClamped(!val.classList.contains('is-clamped')))
  return h('div', { className: 'detail-panel-profile-persona-wrap' }, val, toggle)
}

/** 只读块：缺助理只提示一句（编辑/复制隐藏）；有助理才出三行与动作。 */
export function renderProfileSection(model: DetailPanelModel, cbs: ProfileCallbacks): HTMLElement {
  const sec = h('div', { className: 'detail-panel-profile' })
  sec.appendChild(h('div', { className: 'detail-panel-cap' }, '助理人设'))
  const a = model.assistant
  if (!a) {
    sec.appendChild(h('div', { className: 'detail-panel-list detail-panel-nobox' },
      h('div', { className: 'detail-panel-empty' }, '该工作区暂无助理资料')))
    return sec
  }
  const card = h('div', { className: 'detail-panel-list detail-panel-profile-card' })
  card.appendChild(row('名字', a.name || '未命名'))
  card.appendChild(row('简介', a.description || '未填写'))
  card.appendChild(row('人物设定', a.persona ? personaValue(a.persona) : '未填写'))
  sec.appendChild(card)
  if (!a.description && !a.persona) {
    sec.appendChild(h('div', { className: 'detail-panel-empty detail-panel-profile-note' }, '还没有填写简介与人物设定。'))
  }
  if (isOverLimit('description', a.description) || isOverLimit('persona', a.persona)) {
    sec.appendChild(h('div', { className: 'detail-panel-meta detail-panel-profile-warn' }, '已超出上限，请到编辑里修正'))
  }
  const copy = makeButton({
    kind: 'tinted', size: 'sm', label: '复制', title: '复制名字、简介与人物设定',
    onClick: () => {
      void copyText(profileText(model)).then((ok) => cbs.onNotify?.(ok ? '已复制助理资料' : '复制失败，请手动选择', ok ? 'check' : undefined))
    },
  })
  const edit = makeButton({
    kind: 'primary', size: 'sm', label: '编辑', title: '打开助理资料编辑弹窗（改简介/人物设定）',
    onClick: () => cbs.onEditAssistant(),
  })
  sec.appendChild(h('div', { className: 'detail-panel-profile-actions' }, copy, edit))
  return sec
}
