/** 绿框「舞台」层（T6a）：页头文案 / 面包屑语义 / 三级列表本体。
 *
 * 从 panel-body 抽出（300 行红线）：panel-body 管编排与状态机（钻取、焦点、建单、装配），
 * 这里只管「当前层该长什么样」——纯函数式，输入 StageCtx，输出 DOM，不持有状态。
 * 结构照 T4 认可款原型 `prototypes/home-assistant/proto-studio.html`（owner 裁定 2026-10-13）。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import type { Assistant } from '../data/home-model'
import { detailEl } from './home-detail'
import type { Level } from './home-frame'
import { crumbsEl } from './home-frame'
import { partitionHomes } from './home-index'
import { asstDisplay, asstName, asstOfHome, asstRow, channelRow, emptyEl, homeDisplay, homeName, homeRow, type RowView } from './home-rows'

export interface StageCtx {
  view: RowView
  level: Level
  selHome: string
  selAsst: string
  selChannel: string
  focusId: string
  flashId: string
  query: string
  channelMode: boolean
  onGo(next: Level, id?: string): void
  onOpen(id: string): void
  onAct(kind: string, id: string, anchor: HTMLElement): void
}

const channelsOf = (v: RowView): string[] => [...new Set(v.assistants.map((a) => a.channel))]

/** 页头标题 + 副标（随层/随模式变）。 */
export function stageHead(c: StageCtx): { title: string; sub: string } {
  const v = c.view
  if (c.channelMode) {
    if (c.level === 'L1') return { title: '渠道', sub: `${channelsOf(v).length} 个渠道 · 每个渠道下的助理` }
    const list = v.assistants.filter((a) => a.channel === c.selChannel)
    const bound = list.filter((a) => a.status === 'bound').length
    return { title: c.selChannel ? channelLabel(c.selChannel) : '渠道', sub: `${list.length} 位助理 · ${bound} 位已绑` }
  }
  if (c.level === 'L1') return { title: '家', sub: `${v.homes.length} 个 · 每个家对应一个工作区` }
  const home = v.homes.find((x) => x.id === c.selHome)
  if (c.level === 'L2') {
    const list = home ? asstOfHome(v, home.id) : []
    return { title: home ? homeName(v, home) : '家', sub: `${home ? homeDisplay(v, home).from : ''} · ${list.length} 位助理` }
  }
  const a = v.assistants.find((x) => x.id === c.selAsst)
  return { title: a ? asstName(v, a) : '助理', sub: a ? `${asstDisplay(v, a).from} · 助理详情` : '助理详情' }
}

/** 面包屑三级的「焦点」语义（owner 2026-10-13 收紧）：
 *   ① 悬停谁就预显谁（原型语义）；
 *   ② **没有焦点时不留空**——下一级 chip 显示「它要带你去的那个列表的第一个」，
 *      并且可点即进（owner：「点击 tab 后就自动进去」）。空 chip（`助理`/`机器人` 后面没名字、
 *      aria-disabled）既没信息也没去处，属于没做完的状态。
 *   ③ 默认值取**列表实际顺序**的第一个（有助理的家在前、空家在后），不是数组顺序——
 *      chip 说什么，点进去就该看到什么。 */
export function stageCrumbOpts(c: StageCtx): Parameters<typeof crumbsEl>[0] {
  const v = c.view
  if (c.channelMode) {
    const chs = channelsOf(v)
    const focused = (c.level === 'L1' && c.focusId) ? c.focusId : (c.selChannel || chs[0] || '')
    const first = v.assistants.filter((a) => a.channel === focused)[0]
    return {
      level: c.level,
      homeName: c.selChannel ? channelLabel(c.selChannel) : '',
      asstName: c.selAsst ? asstName(v, v.assistants.find((a) => a.id === c.selAsst) as Assistant) : '',
      focusHomeName: focused ? channelLabel(focused) : '',
      focusAsstName: first ? asstName(v, first) : '',
      l2Target: focused,
      l3Target: first ? first.id : '',
      onGo: (l, id) => c.onGo(l, id),
    }
  }
  const focusedHome = (c.level === 'L1' && c.focusId) ? c.focusId : (c.selHome || firstListedHomeId(v))
  const home = v.homes.find((x) => x.id === focusedHome)
  const firstAsst = home ? asstOfHome(v, home.id)[0] : undefined
  const focusedAsst = ((c.level === 'L2' ? (c.focusId || c.selAsst) : '') || (firstAsst ? firstAsst.id : ''))
  const a = v.assistants.find((x) => x.id === focusedAsst)
  return {
    level: c.level,
    homeName: c.selHome ? homeName(v, v.homes.find((x) => x.id === c.selHome) as never) : '',
    asstName: c.selAsst && v.assistants.some((x) => x.id === c.selAsst) ? asstName(v, v.assistants.find((x) => x.id === c.selAsst) as Assistant) : '',
    focusHomeName: home ? homeName(v, home) : '',
    focusAsstName: a ? asstName(v, a) : '',
    l2Target: focusedHome,
    l3Target: focusedAsst,
    onGo: (l, id) => c.onGo(l, id),
  }
}

/** L1 列表实际顺序的第一行（孤儿置顶，其次有助理的家在前、空家在后）——chip 的默认去处必须与眼睛看到的一致。 */
function firstListedHomeId(v: RowView): string {
  const { orphan, active, empty } = partitionHomes(v.homes, v.index, v.workspaces)
  const first = orphan[0] ?? active[0] ?? empty[0] ?? v.homes[0]
  return first ? first.id : ''
}

/** 当前层的列表本体（L1 家 / L2 助理 / L3 详情，渠道模式另走一套）。 */
export function stageList(c: StageCtx): HTMLElement {
  const v = c.view
  const q = c.query.trim().toLowerCase()
  const match = (t: string): boolean => !q || t.toLowerCase().indexOf(q) >= 0
  const list = h('div', { className: 'hu-fbody' })
  const rowOpts = { onOpen: c.onOpen, onItemAct: c.onAct }
  if (c.level === 'L3') {
    const a = v.assistants.find((x) => x.id === c.selAsst)
    list.appendChild(a
      ? detailEl({ view: v, a, onAct: (kind, anchor) => c.onAct(kind, a.id, anchor) })
      : emptyEl('没有选中助理', '回到上一级选一位助理', 'person'))
    return list
  }
  if (c.channelMode) {
    if (c.level === 'L1') {
      const chs = channelsOf(v).filter((ch) => match(channelLabel(ch)) || v.assistants.some((a) => a.channel === ch && match(asstName(v, a))))
      if (!chs.length) list.appendChild(emptyEl('还没有渠道', '接入聊天渠道后，这里会按渠道列出助理', 'link'))
      chs.forEach((ch) => list.appendChild(channelRow(v, ch, { selected: c.selChannel === ch, flash: c.flashId === ch, ...rowOpts })))
    } else {
      const items = v.assistants.filter((a) => a.channel === c.selChannel && match(asstName(v, a)))
      if (!items.length) list.appendChild(emptyEl('这个渠道下还没有助理', '点下面的「新建助理」给它选一个机器人', 'person'))
      items.forEach((a) => list.appendChild(asstRow(v, a, { selected: c.selAsst === a.id, flash: c.flashId === a.id, ...rowOpts })))
    }
    return list
  }
  if (c.level === 'L1') {
    const items = v.homes.filter((x) => match(homeName(v, x)) || asstOfHome(v, x.id).some((a) => match(asstName(v, a))))
    if (!items.length) {
      list.appendChild(v.homes.length
        ? emptyEl('没有匹配的家', '换个关键词，或者点右上角新建一个家', 'search')
        : emptyEl('还没有家', '点下面的「新建家」，选一个工作区认成家', 'home'))
      return list
    }
    const rowOf = (x: (typeof items)[number]): HTMLElement => homeRow(v, x, { selected: c.selHome === x.id, flash: c.flashId === x.id, ...rowOpts })
    /* 呈现策略（非数据规则）：孤儿家置顶（工作区已不在，必须人动手，最显眼），
     * 再是有助理的家（按最近更新降序），空家在后——
     * T3「一区一家含无人之家」是持久化不变量（保历史不丢），这里只决定先看谁。
     * owner 2026-10-15：折叠段取消，「N 个空家」退场，空家直接成行（状态看行内章/圆点/副标）。 */
    const { orphan, active, empty } = partitionHomes(items, v.index, v.workspaces)
    const ordered = [...orphan, ...active, ...empty]
    if (q) { ordered.forEach((x) => list.appendChild(rowOf(x))); return list }
    ordered.forEach((x) => list.appendChild(rowOf(x)))
    return list
  }
  const home = v.homes.find((x) => x.id === c.selHome)
  const items = (home ? asstOfHome(v, home.id) : []).filter((a) => match(asstName(v, a)))
  if (!items.length) {
    list.appendChild(home
      ? emptyEl('这个家还没有助理', '点下面的「新建助理」，给这个家添一位助理', 'person')
      : emptyEl('没有选中家', '回到上一级挑一个家', 'home'))
  }
  items.forEach((a) => list.appendChild(asstRow(v, a, { selected: c.selAsst === a.id, flash: c.flashId === a.id, ...rowOpts })))
  return list
}
