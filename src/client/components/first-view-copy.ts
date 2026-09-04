/** 首屏赢家变体文案（#25 D 拼装 + 助理 + P2，#26 实现票自有）。
 * 中英双语以字典提供，跟随 DSH 系统语言（documentElement.lang，en 开头即英文，无切换器）；
 * 空 / 加载 / 错误三态文案不在此表（#27 收尾票领地，本票一字不动）。 */
import { initialOf } from '../data/model'

export type FirstViewLang = 'zh' | 'en'

/** DSH 系统语言（precedent：welcome-banner overlay docLang）：en 开头即英文。 */
export function firstViewLang(doc?: unknown): FirstViewLang {
  try {
    const d = (doc ?? (typeof document !== 'undefined' ? document : null)) as {
      documentElement?: { lang?: unknown }
    } | null
    const lang = d?.documentElement?.lang
    if (typeof lang === 'string' && lang.toLowerCase().startsWith('en')) return 'en'
  } catch {
    /* 取不到按中文 */
  }
  return 'zh'
}

export interface FirstViewCopy {
  title: string
  sub: string
  byAgent: (n: number) => string
  byChannel: (n: number) => string
  updatedTip: (t: string) => string
  search: string
  searchAria: string
  segAria: string
  radar: string
  refresh: string
  plus: string
  join: string
  joinTitle: string
  detail: string
  detailTitle: string
  moreActions: (name: string) => string
  wsPrefix: string
  rowTip: (name: string) => string
  starTitle: string
  starHref: string
  promoTitle: string
  promoDeck: string
  promoDeckDesc: string
  promoPal: string
  promoPalDesc: string
}

const ZH: FirstViewCopy = {
  title: '助理',
  sub: 'ASSISTANTS',
  byAgent: (n) => '按助理 (' + n + ')',
  byChannel: (n) => '按渠道 (' + n + ')',
  updatedTip: (t) => (t ? '更新于 ' + t + '（标题计数行已收起：助理 / 渠道数看分段）' : '助理 / 渠道数看分段'),
  search: '搜索',
  searchAria: '搜索助理',
  segAria: '分组方式',
  radar: '舰队视图事件入口',
  refresh: '刷新列表',
  plus: '新建助理',
  join: '接入',
  joinTitle: '接入新渠道',
  detail: '详情',
  detailTitle: '打开助理详情抽屉',
  moreActions: (name) => '更多操作 ' + name + '：重命名 / 更换工作区 / 移除渠道机器人',
  wsPrefix: '工作区·',
  rowTip: (name) => name + '（整行悬停出按钮；触屏点一下行）',
  starTitle: '给本项目点 Star（跳 GitHub 仓库）',
  starHref: 'https://github.com/FeatherHunter/dsh-im-companion',
  promoTitle: '作者其他插件',
  promoDeck: 'dsh-mattpocock-skills-deck',
  promoDeckDesc: 'Mattpocock SKILLS 在DSH中增强插件。开发伴侣☕️。',
  promoPal: 'dsh-opencode-palette',
  promoPalDesc: 'OpenCode 配色盘',
}

const EN: FirstViewCopy = {
  title: 'Assistants',
  sub: '助理',
  byAgent: (n) => 'By Assistants (' + n + ')',
  byChannel: (n) => 'By Channels (' + n + ')',
  updatedTip: (t) => (t ? 'Updated ' + t + ' (title counts folded into seg labels)' : 'See seg labels for counts'),
  search: 'Search',
  searchAria: 'Search assistants',
  segAria: 'Group by',
  radar: 'Fleet view event entry',
  refresh: 'Refresh list',
  plus: 'New assistant',
  join: 'Connect',
  joinTitle: 'Connect a new channel',
  detail: 'Details',
  detailTitle: 'Open assistant details',
  moreActions: (name) => 'More actions ' + name + ': Rename / Change workspace / Remove channel bots',
  wsPrefix: 'Workspace: ',
  rowTip: (name) => name + ' (hover row for actions; tap row on touch)',
  starTitle: 'Star this project on GitHub',
  starHref: 'https://github.com/FeatherHunter/dsh-im-companion',
  promoTitle: 'Related projects',
  promoDeck: 'dsh-mattpocock-skills-deck',
  promoDeckDesc: 'Agent skills method deck',
  promoPal: 'dsh-opencode-palette',
  promoPalDesc: 'OpenCode color palettes',
}

export function firstViewCopy(lang?: FirstViewLang): FirstViewCopy {
  return (lang ?? firstViewLang()) === 'en' ? EN : ZH
}

/** D 头像文案：Xiao 系去前缀取特征音节（Ji/Sh/Su/Wa），其余维持首字母。
 * initialOf 本体不动（共享只加不改），本函数为赢家专用。 */
export function winnerAvatarText(name: string): string {
  const n = (name ?? '').trim()
  const m = /^xiao\s*([a-z]{1,2})/i.exec(n)
  if (m) {
    const s = m[1].toLowerCase()
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return initialOf(n)
}

/** D 头像配色：Xiao 系用莫兰迪柔色兜底（m0–m3），其余走既有 palette 类。
 * 用户自定义头像（img 层）不受影响——本函数只决定渐变兜底类。 */
export function winnerAvatarClass(name: string, fallbackClass: string): string {
  const n = (name ?? '').trim()
  if (!/^xiao/i.test(n)) return fallbackClass
  let hash = 0
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0
  return 'af-av-m' + (hash % 4)
}
