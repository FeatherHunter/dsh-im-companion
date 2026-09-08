/** 新建 Agent 内联表单（点 + 展开）：名字 + 必选工作区（#62 创建时强制选 HOME，
 * 无家不允许创建出可接入助理——扫码绑定直落自带之家，不再经过可取消的二次选家）。
 * 选家器由调用方注入（可测编排 seam），本表单只管“两者齐了才提交”。 */
import { h } from '../dom'
import { makeButton } from '../ui/button'

export interface ComposeBar {
  el: HTMLElement
  input: HTMLInputElement
  setVisible(v: boolean): void
}

export interface ComposeBarOpts {
  /** 打开工作区选择器：确认得路径、取消得 null（取消保留已选，不清零）。 */
  pickWorkspace: () => Promise<string | null>
}

const NO_HOME = ''
const HOME_PLACEHOLDER = '尚未选择工作区'

export function makeComposeBar(onCreate: (name: string, workspace: string) => void, opts: ComposeBarOpts): ComposeBar {
  const input = h('input', { type: 'text', placeholder: '输入名称，如「小帅」', 'aria-label': '新的 Agent 名称' })
  let home = NO_HOME
  const homeLabel = h('span', { className: 'af-compose-home', title: HOME_PLACEHOLDER }, HOME_PLACEHOLDER)
  const create = makeButton({
    kind: 'primary',
    size: 'sm',
    label: '创建',
    disabled: true,
    onClick: () => {
      const v = input.value.trim()
      if (!v || !home) return
      const ws = home
      input.value = ''
      home = NO_HOME
      paint()
      onCreate(v, ws)
    },
  })
  const pick = makeButton({
    kind: 'ghost',
    size: 'sm',
    label: '选择工作区…',
    onClick: () => {
      void opts.pickWorkspace().then((ws) => {
        if (ws) home = ws
        paint()
      })
    },
  })
  const cancel = makeButton({
    kind: 'ghost',
    size: 'sm',
    label: '取消',
    onClick: () => setVisible(false),
  })
  const el = h('div', { className: 'af-compose', style: { display: 'none' } }, input, pick, homeLabel, create, cancel)

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') create.click()
    else if (e.key === 'Escape') setVisible(false)
  })
  input.addEventListener('input', () => paint())

  /** 名与家齐了创建才可用（置灰是主防线，onClick 内复核是底线）。 */
  function paint(): void {
    create.disabled = !(input.value.trim() && home)
    homeLabel.textContent = home || HOME_PLACEHOLDER
    homeLabel.title = home || HOME_PLACEHOLDER
  }

  function setVisible(v: boolean): void {
    el.style.display = v ? 'flex' : 'none'
    if (v) {
      paint()
      input.focus()
    } else {
      /* #62：隐藏即重置——取消不得把旧家留给下一次创建（1 Agent = 1 Workspace，防串家）。 */
      input.value = ''
      home = NO_HOME
      paint()
    }
  }

  return { el, input, setVisible }
}
