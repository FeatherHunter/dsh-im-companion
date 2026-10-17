/** 绿框「舞台」层（T6a）：页头文案 / 面包屑语义 / 三级列表本体。
 *
 * 从 panel-body 抽出（300 行红线）：panel-body 管编排与状态机（钻取、焦点、建单、装配），
 * 这里只管「当前层该长什么样」——纯函数式，输入 StageCtx，输出 DOM，不持有状态。
 * 结构照 T4 认可款原型 `prototypes/home-assistant/proto-studio.html`（owner 裁定 2026-10-13）。 */
import { h } from '../dom'
import { channelLabel } from '../data/config'
import { bucketOf, channelOf, type Assistant } from '../data/home-model'
import { detailEl } from './home-detail'
import type { Level } from './home-frame'
import { crumbsEl } from './home-frame'
import { partitionHomes } from './home-index'
import { metaRow } from './home-meta'
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

/** 真渠道集合：**未绑定助理不算渠道**（#138 渠道诚实性）——它们的 channel 是旧版客户端编的猜测值。 */
const channelsOf = (v: RowView): string[] => [...new Set(v.assistants.map((a) => channelOf(a)).filter((x): x is string => !!x))]

/** 待接入人数（未绑定助理）：按渠道模式里它们归一个显式的「待接入」组，不许从视野里消失。 */
const pendingOf = (v: RowView): number => v.assistants.filter((a) => a.status === 'unbound').length

/** 按渠道模式的桶键序列：真渠道在前，「待接入」组殿后（键是空串，与 `bucketOf` 同源）。 */
const channelKeys = (v: RowView): string[] => [...channelsOf(v), ...(pendingOf(v) ? [''] : [])]

/** 桶键的显示名：空键就是「待接入」，不是空字符串。 */
const bucketLabel = (k: string): string => (k ? channelLabel(k) : '待接入')

/** 页头标题 + 副标（随层/随模式变）。副标走元信息原语：主数强、注解进括号，不拼分隔符（#139）。 */
export function stageHead(c: StageCtx): { title: string; sub: string | HTMLElement } {
  const v = c.view
  if (c.channelMode) {
    if (c.level === 'L1') {
      const n = channelsOf(v).length
      const p = pendingOf(v)
      return {
        title: '渠道',
        sub: metaRow([
          { text: `${n} 个渠道`, tone: 'strong' },
          ...(p ? [{ text: `${p} 位待接入`, tone: 'accent' as const, note: true }] : []),
        ]),
      }
    }
    const list = v.assistants.filter((a) => bucketOf(a) === c.selChannel)
    const bound = list.filter((a) => a.status === 'bound').length
    return {
      title: bucketLabel(c.selChannel),
      sub: metaRow([{ text: `${list.length} 位助理`, tone: 'strong' }, { text: `${bound} 位已绑`, note: true }]),
    }
  }
  if (c.level === 'L1') {
    return {
      title: '家',
      sub: metaRow([{ text: `${v.homes.length} 个家`, tone: 'strong' }, { text: '每个家对应一个工作区', note: true }]),
    }
  }
  const home = v.homes.find((x) => x.id === c.selHome)
  if (c.level === 'L2') {
    const list = home ? asstOfHome(v, home.id) : []
    return {
      title: home ? homeName(v, home) : '家',
      sub: metaRow([
        { text: `${list.length} 位助理`, tone: 'strong' },
        ...(home ? [{ text: homeDisplay(v, home).from, note: true, tone: 'weak' as const }] : []),
      ]),
    }
  }
  const a = v.assistants.find((x) => x.id === c.selAsst)
  return {
    title: a ? asstName(v, a) : '助理',
    sub: a ? metaRow([{ text: asstDisplay(v, a).from, tone: 'weak' }, { text: '助理详情', tone: 'weak' }]) : '助理详情',
  }
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
    const keys = channelKeys(v)
    const focused = (c.level === 'L1' && c.focusId && keys.indexOf(c.focusId) >= 0)
      ? c.focusId
      : (keys.indexOf(c.selChannel) >= 0 ? c.selChannel : (keys[0] ?? ''))
    const hasFocus = keys.length > 0
    const first = v.assistants.filter((a) => bucketOf(a) === focused)[0]
    return {
      level: c.level,
      homeName: c.selChannel ? channelLabel(c.selChannel) : '待接入',
      asstName: c.selAsst ? asstName(v, v.assistants.find((a) => a.id === c.selAsst) as Assistant) : '',
      focusHomeName: hasFocus ? bucketLabel(focused) : '',
      focusAsstName: first ? asstName(v, first) : '',
      l2Target: hasFocus ? focused : '',
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
      /* 「待接入」组是显式的一行：修掉编造的渠道之后，未绑定助理不能在这个视图里消失（#138 owner 裁定）。 */
      const keys = channelKeys(v).filter((k) => match(bucketLabel(k)) || v.assistants.some((a) => bucketOf(a) === k && match(asstName(v, a))))
      if (!keys.length) list.appendChild(emptyEl('还没有渠道', '接入聊天渠道后，这里会按渠道列出助理', 'link'))
      keys.forEach((k) => list.appendChild(channelRow(v, k, { selected: c.selChannel === k, flash: c.flashId === k, ...rowOpts })))
    } else {
      const items = v.assistants.filter((a) => bucketOf(a) === c.selChannel && match(asstName(v, a)))
      if (!items.length) list.appendChild(emptyEl(c.selChannel ? '这个渠道下还没有助理' : '还没有待接入的助理', '点下面的「新建助理」给它选一个机器人', 'person'))
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
