/** 助理两栏（简介 / 人物设定）的共享控件（T8-3 #171；#172 编辑弹窗复用同一份）。
 *
 * 上限、中文名、归一、码点计数、拒绝文案**全部**来自 `src/assistant-fields.ts`——本文件只负责把它画成两栏，
 * 不在这里另写 200 / 8000：写死第二份，改规格时必漂，而错误文案里没有字段定位时用户不知道是哪一栏。
 *
 * 对外只承诺 `AsstFieldsUi` 这一层：调用方拿 `nodes` 摊进弹层、拿 `values()` 当 RPC 入参、
 * 拿 `reason()` 当主按钮的 disabled 说明。`.hu-fldbar` / `.hu-count` / `.hu-flderr` 只是样式钩子，
 * 取件一律按 aria-label 与可见文案（外部行为），别在验证里认内部结构。 */
import {
  ASSISTANT_FIELDS, ASSISTANT_FIELD_SPECS, checkFieldValue, countCodePoints, normalizeFieldText,
  validateAssistantFields, type AssistantField, type AssistantFieldsValue,
} from '../../assistant-fields'
import { h } from '../dom'
import { field } from './home-forms'

/** 每栏的界面前缀（规格 #168 逐字照抄）：placeholder = 前缀 +「（最多 N 字）」；aria-label = 「助理」+ 中文名。 */
const HINTS: Record<AssistantField, string> = {
  description: '一句话介绍这个助理',
  persona: '这个助理是谁、怎么说话',
}

/** 简介是**单行**（规格原话「简介单行」，不是多行框）；人物设定要多行，给 5 行可视高度。 */
const MULTILINE: Record<AssistantField, boolean> = { description: false, persona: true }

export interface AsstFieldsUi {
  /** 两栏节点（`ASSISTANT_FIELDS` 顺序），调用方按序摊进 body。 */
  nodes: HTMLElement[]
  /** 当前值：归一后非空的栏才带键——空栏**整键缺失**（不是 `''`，也不是 `undefined` 值）。创建用。 */
  values(): AssistantFieldsValue
  /** 两栏当前文本（归一后，**允许空串**）：编辑弹窗要判断「用户清空了一栏」——
   *  values() 省掉空键，清空会被误判成「没改」而写不出去（#172 修补：清空是需要落盘的显式动作）。 */
  texts(): Record<AssistantField, string>
  /** 第一个被拒栏的原文（`fieldErrorMessage` 的输出，带字段定位），全合法时 `undefined`：主按钮的禁用理由用它。 */
  reason(): string | undefined
  /** 有栏被拒（超限）。提交口要再判一次——`disabled` 挡不住程序化点击／回车。 */
  invalid(): boolean
}

/** 画两栏。`initial` 供 #172 编辑弹窗预填；`onChange` 在用户每次输入后调用（调用方据此切主按钮）。 */
export function asstFieldsUi(initial?: AssistantFieldsValue, onChange?: () => void): AsstFieldsUi {
  const slots = {} as Record<AssistantField, { el: HTMLInputElement | HTMLTextAreaElement; count: HTMLElement; err: HTMLElement }>
  /** 只刷这一栏的计数与红字。构造期也走它但不上报 onChange（避免调用方读到半成品）。 */
  const paint = (f: AssistantField, notify: boolean): void => {
    const { el, count, err } = slots[f]
    const check = checkFieldValue(f, el.value)
    count.textContent = countCodePoints(normalizeFieldText(el.value)) + '/' + ASSISTANT_FIELD_SPECS[f].max
    err.textContent = check.ok ? '' : check.message
    if (notify) onChange?.()
  }
  const nodes = ASSISTANT_FIELDS.map((f) => {
    const spec = ASSISTANT_FIELD_SPECS[f]
    const multiline = MULTILINE[f]
    const el = h(multiline ? 'textarea' : 'input', {
      type: multiline ? undefined : 'text',
      rows: multiline ? 5 : undefined,
      maxlength: spec.max,
      placeholder: HINTS[f] + '（最多 ' + spec.max + ' 字）',
      'aria-label': '助理' + spec.label,
      value: initial?.[f] ?? '',
    }) as HTMLInputElement | HTMLTextAreaElement
    const count = h('em', { className: 'hu-count' })
    const err = h('em', { className: 'hu-flderr' })
    /* 计数与红字挂在原语 `field` 的下方：.hu-fld>span 是加粗标签，故这两行用 div/em 不用 span。 */
    const wrap = field(spec.label, el)
    wrap.appendChild(h('div', { className: 'hu-fldbar' }, count, err))
    slots[f] = { el, count, err }
    el.addEventListener('input', () => paint(f, true))
    return wrap
  })
  for (const f of ASSISTANT_FIELDS) paint(f, false)
  const reasonOf = (): string | undefined => {
    const r = validateAssistantFields({ description: slots.description.el.value, persona: slots.persona.el.value })
    return r.ok ? undefined : r.message
  }
  return {
    nodes,
    values() {
      const out: AssistantFieldsValue = {}
      for (const f of ASSISTANT_FIELDS) {
        const r = checkFieldValue(f, slots[f].el.value)
        if (r.ok && r.value !== undefined && r.value !== '') out[f] = r.value
      }
      return out
    },
    texts() {
      const out = {} as Record<AssistantField, string>
      for (const f of ASSISTANT_FIELDS) out[f] = normalizeFieldText(slots[f].el.value)
      return out
    },
    reason: reasonOf,
    invalid: () => reasonOf() !== undefined,
  }
}
