/** Agent 行组件：头像 + 名称（内联改名）+ 渠道状态胶囊 + 工作区行 + 状态 + 接入 + ⋯。
 * #26 赢家变体（D 拼装）：Xiao 系头像取特征音节 + 莫兰迪兜底、详情 ghost、整行悬停统一显现。 */
import { h } from '../dom'
import { icon } from '../icons'
import { makeAvatar } from '../ui/avatar'
import { firstViewCopy, winnerAvatarClass, winnerAvatarText } from './first-view-copy'
import { makeButton } from '../ui/button'
import { makeNameEditor } from '../ui/field'
import { makeRow } from '../ui/list'
import { HEALTH_LABELS, OPEN_DRAWER_EVENT, stateColor, type OpenDrawerDetail } from '../data/config'
import { paletteOf, type AgentView } from '../data/model'
import { openMoreMenu } from './row-actions'

export type RowVariant = 'agent' | 'channel'

export interface RowCallbacks {
  rename(view: AgentView, next: string): void
  connect(view: AgentView, anchor: HTMLElement): void
  avatarMenu(view: AgentView, anchor: HTMLElement): void
  pickWorkspace(view: AgentView): void
  removeBot(view: AgentView, channel: string, botId: string): void
  deleteLocal(view: AgentView): void
}

export function makeAgentRow(view: AgentView, cb: RowCallbacks, variant: RowVariant = 'agent'): HTMLDivElement {
  const row = makeRow()
  const isAgent = variant === 'agent'
  const copy = firstViewCopy()

  let avatar: HTMLDivElement
  avatar = makeAvatar({
    name: view.name,
    avatar: view.avatar,
    palette: paletteOf(view.key),
    title: isAgent ? undefined : '渠道头像',
    onClick: isAgent
      ? (e: Event) => {
          e.preventDefault()
          cb.avatarMenu(view, avatar)
        }
      : undefined,
  })
  /* D 头像：仅无自定义图且 Xiao 系时替换兜底文案 + 莫兰迪色（img 层原样不动）。 */
  if (!view.avatar && /^xiao/i.test(view.name.trim())) {
    avatar.className = 'af-avatar ' + winnerAvatarClass(view.name, '')
    avatar.replaceChildren(document.createTextNode(winnerAvatarText(view.name)))
  }

  const nameWrap = h('div', { className: 'af-name' })
  const showName = () => {
    nameWrap.replaceChildren()
    nameWrap.appendChild(h('span', { title: view.name }, view.name))
    if (!isAgent) return
    nameWrap.appendChild(h('button', {
      className: 'af-rename',
      type: 'button',
      title: '重命名',
      'aria-label': '重命名 ' + view.name,
      onClick: () => startEdit(),
    }, icon('pencil', 13)))
  }
  const startEdit = () => {
    const ed = makeNameEditor(view.name, (next) => {
      showName()
      cb.rename(view, next)
    }, () => showName())
    nameWrap.replaceChildren(ed.el)
    ed.focus()
  }
  showName()

  /* 渠道状态胶囊（状态色点 = 该渠道在线/待确认/离线） */
  const chips = h('div', { className: 'af-chips' },
    ...(view.channels.length
      ? view.channels.map((ch) =>
          h('span', {
            className: 'af-chip',
            title: ch.label + '·' + HEALTH_LABELS[ch.status],
          },
            h('span', { className: 'af-chdot', style: { background: stateColor(ch.status) } }),
            ch.label,
          ))
      : [h('span', { className: 'af-chip' }, '尚未接入渠道')]),
  )
  const wsLine = h('div', { className: 'af-ws-line', title: view.workspace || view.workspaceLine }, view.workspaceLine)
  const main = h('div', { className: 'af-row-main' }, nameWrap, chips, wsLine)

  const status = h('span', { className: 'af-status', title: view.healthDetail },
    h('span', { className: 'af-dot ' + view.status }),
    view.stateLabel,
  )
  const connectBtn = makeButton({
    kind: 'tinted',
    size: 'sm',
    label: copy.join,
    title: copy.joinTitle,
    onClick: (e: Event) => cb.connect(view, e.currentTarget as HTMLElement),
  })
  const actions = h('div', { className: 'af-actions' }, status, connectBtn)
  if (isAgent) {
    /* D 降噪：详情与接入同级 ghost，不再整排桃粉 primary。 */
    const detailBtn = makeButton({
      kind: 'ghost',
      size: 'sm',
      label: copy.detail,
      title: copy.detailTitle,
      onClick: () => emitOpenDrawer(view.key),
    })
    actions.appendChild(detailBtn)
    const moreBtn = h('button', {
      className: 'af-more-btn',
      type: 'button',
      title: copy.moreActions(view.name),
      'aria-label': copy.moreActions(view.name),
      onClick: (e: Event) => openMoreMenu(view, e.currentTarget as HTMLElement, {
        rename: () => startEdit(),
        pickWorkspace: () => cb.pickWorkspace(view),
        removeBot: (channel, botId) => cb.removeBot(view, channel, botId),
        deleteLocal: () => cb.deleteLocal(view),
      }),
    }, icon('more', 18))
    actions.appendChild(moreBtn)
  }

  /* B 悬停统一：触屏点行呼出按钮组（点中按钮/输入不翻转），键盘靠 focus-within 显现。 */
  row.tabIndex = 0
  row.title = copy.rowTip(view.name)
  row.addEventListener('click', (e: Event) => {
    const t = e.target as unknown as { closest?: (s: string) => unknown } | null
    if (t && typeof t.closest === 'function' && t.closest('button,a,input')) return
    row.classList.toggle('af-tap')
  })

  row.append(avatar, main, actions)
  return row
}

/** C1a 抽屉打开意图（§10 例外：A1 行唯一新增触碰点；C1a 特性监听，无反向依赖）。 */
function emitOpenDrawer(key: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    const detail: OpenDrawerDetail = { key }
    window.dispatchEvent(new window.CustomEvent(OPEN_DRAWER_EVENT, { detail }))
  } catch {
    /* 派发失败静默（抽屉打不开但行不受影响） */
  }
}
