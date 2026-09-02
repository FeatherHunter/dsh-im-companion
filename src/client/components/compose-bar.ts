/** 新建 Agent 内联表单（点 + 展开）。 */
import { h } from '../dom'
import { makeButton } from '../ui/button'

export interface ComposeBar {
  el: HTMLElement
  input: HTMLInputElement
  setVisible(v: boolean): void
}

export function makeComposeBar(onCreate: (name: string) => void): ComposeBar {
  const input = h('input', { type: 'text', placeholder: '输入名称，如「小帅」', 'aria-label': '新的 Agent 名称' })
  const create = makeButton({
    kind: 'primary',
    size: 'sm',
    label: '创建',
    onClick: () => {
      const v = input.value.trim()
      if (!v) {
        input.focus()
        return
      }
      input.value = ''
      onCreate(v)
    },
  })
  const cancel = makeButton({
    kind: 'ghost',
    size: 'sm',
    label: '取消',
    onClick: () => setVisible(false),
  })
  const el = h('div', { className: 'af-compose', style: { display: 'none' } }, input, create, cancel)

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') create.click()
    else if (e.key === 'Escape') setVisible(false)
  })

  function setVisible(v: boolean): void {
    el.style.display = v ? 'flex' : 'none'
    if (v) input.focus()
  }

  return { el, input, setVisible }
}
