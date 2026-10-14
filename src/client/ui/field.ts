/** 输入原语：搜索框 + 行内改名编辑器。 */
import { h } from '../dom'
import { icon } from '../icons'
import { logLine, logOn } from '../log'

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
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'ui.field', action: v && v !== initial ? 'rename-commit' : 'rename-noop', ok: true, message: '行内改名提交：「' + initial + '」→「' + v + '」（空值/未改视为取消）' })
      if (v && v !== initial) onCommit(v)
      else onCancel()
    } else {
      if (logOn('debug')) logLine('debug', 'ui.action', { area: 'ui.field', action: 'rename-escape', ok: true, message: 'Escape 取消行内改名：「' + initial + '」' })
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
