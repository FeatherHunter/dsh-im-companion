/** 输入原语：搜索框 + 行内改名编辑器。 */
import { h } from '../dom'
import { icon } from '../icons'

export interface SearchField {
  el: HTMLElement
  input: HTMLInputElement
  value(): string
}

export function makeSearchField(onInput: (v: string) => void): SearchField {
  const input = h('input', { type: 'text', placeholder: '搜索', 'aria-label': '搜索 Agent' })
  input.addEventListener('input', () => onInput(input.value))
  const el = h('div', { className: 'af-search' },
    h('span', { className: 'af-search-icon' }, icon('search', 17)),
    input,
  )
  return { el, input, value: () => input.value }
}

export interface NameEditor {
  el: HTMLInputElement
  focus(): void
}

/** 行内改名：Enter/失焦提交，Escape 取消；空值视为取消。 */
export function makeNameEditor(initial: string, onCommit: (v: string) => void, onCancel: () => void): NameEditor {
  const input = h('input', { className: 'af-name-input', type: 'text', value: initial, 'aria-label': '重命名 Agent' })
  let finished = false
  const finish = (commit: boolean) => {
    if (finished) return
    finished = true
    if (commit) {
      const v = input.value.trim()
      if (v && v !== initial) onCommit(v)
      else onCancel()
    } else {
      onCancel()
    }
  }
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') finish(true)
    else if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
  return {
    el: input,
    focus: () => {
      input.focus()
      input.select()
    },
  }
}
