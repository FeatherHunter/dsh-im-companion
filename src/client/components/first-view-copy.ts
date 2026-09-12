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
  byAgent: (n: number) => string
  byChannel: (n: number) => string
  updatedTip: (t: string) => string
  search: string
  searchAria: string
  segAria: string
  radar: string
  /** 串门搬家工具栏入口（label 与 title 共用）。 */
  adopt: string
  refresh: string
  plus: string
  join: string
  joinTitle: string
  /** 无家时接入按钮置灰悬停（#62：先选家再接入）。 */
  joinNeedHome: string
  /** 无家阻断扫码的引导语（#62：指向真能落家的选家动作）。 */
  needHomeForConnect: (name: string) => string
  detail: string
  detailTitle: string
  moreActions: (name: string) => string
  wsPrefix: string
  rowTip: (name: string) => string
  starTitle: string
  starHref: string
  feedbackTitle: string
  feedbackHref: string
  versionTitle: (v: string) => string
  /** #82 自家版本胶囊（紫）：文案只留版本号——品牌名进悬停，宽度让给标题。
   * 身份由胶囊颜色承载（紫=自家 / 蓝白=上游 dsh-im / 黑白=宿主），见 first-view-styles。 */
  compatChip: (v: string) => string
  /** #78 上游兼容标记：兼容的 dsh-im 版本（来源 package.json.dshImCompat，构建注入）。
   * #82 改：去「兼容」前缀（颜色即身份），悬停仍写全「已在 dsh-im X 上验收」口径。 */
  compatTitle: (v: string, range: string) => string
  compatHref: string
  /** #79 宿主兼容标记：已验证的 @deepseek-ai/dsh 版本（来源 package.json.dshCompat，构建注入）。
   * 与 dsh-im 轴并列——宿主升级同样会让插件失效（#79 即宿主侧装配失败）。
   * #82 改：去「宿主」前缀（黑白色胶囊即宿主身份）。 */
  dshCompatChip: (v: string) => string
  /** #79 宿主兼容悬停说明：已验证宿主版本 + 本插件依赖的宿主能力。 */
  dshCompatTitle: (v: string, requires: string) => string
  promoTitle: string
  promoDeck: string
  promoDeckDesc: string
  promoPal: string
  promoPalDesc: string
  states: FirstViewStates
}

/** #27 三态文案（来源 #25 原型 STR；空-零数据按赢家口径新写，＋ 已搬工具栏）。 */
export interface FirstViewStates {
  loading: string
  emptySearchTitle: string
  emptySearchSub: string
  emptyNoneTitle: string
  emptyNoneSub: string
  errorMsg: string
  retry: string
}

const ZH: FirstViewCopy = {
  title: 'IM机器人增强',
  byAgent: (n) => '按助理 (' + n + ')',
  byChannel: (n) => '按渠道 (' + n + ')',
  updatedTip: (t) => (t ? '更新于 ' + t + '（标题计数行已收起：助理 / 渠道数看分段）' : '助理 / 渠道数看分段'),
  search: '搜索',
  searchAria: '搜索助理',
  segAria: '分组方式',
  radar: '扬帆远航！',
  adopt: '串门搬家',
  refresh: '刷新列表',
  plus: '新建助理',
  join: '接入',
  joinTitle: '接入新渠道',
  joinNeedHome: '请先选择工作区后再接入',
  needHomeForConnect: (name) => '请先为「' + name + '」选择工作区，再接入渠道',
  detail: '详情',
  detailTitle: '打开助理详情抽屉',
  moreActions: (name) => '更多操作 ' + name + '：重命名 / 更换工作区 / 移除渠道机器人',
  wsPrefix: '工作区·',
  rowTip: (name) => name + '（整行悬停出按钮；触屏点一下行）',
  starTitle: '你的⭐是我夜空中最亮的星',
  starHref: 'https://github.com/FeatherHunter/dsh-im-companion',
  feedbackTitle: '反馈问题',
  feedbackHref: 'https://github.com/FeatherHunter/dsh-im-companion/issues/new',
  versionTitle: (v) => 'dsh-im-companion ' + v + '（点跳 GitHub 仓库首页）',
  compatChip: (v) => 'dsh-im ' + v,
  compatTitle: (v, range) => '本插件已在 dsh-im ' + v + ' 上验收；兼容范围 ' + range
    + '（4.17.1+ 走 /api 新载体，旧版自动回退旧路由）。点开看兼容性说明。',
  compatHref: 'https://github.com/FeatherHunter/dsh-im-companion#compat',
  dshCompatChip: (v) => 'dsh ' + v,
  dshCompatTitle: (v, requires) => '本插件已在 @deepseek-ai/dsh ' + v + ' 上验收；要求宿主提供 '
    + requires + '（DSH 公开 /api 载体；更老的宿主会在装配期显式报错，不静默降级）。点开看兼容性说明。',
  promoTitle: '作者其他插件',
  promoDeck: 'dsh-mattpocock-skills-deck',
  promoDeckDesc: 'Mattpocock SKILLS 在DSH中增强插件。开发伴侣☕️。',
  promoPal: 'dsh-opencode-palette',
  promoPalDesc: 'OpenCode 配色盘',
  states: {
    loading: '加载中…正在获取助理列表，请稍候。',
    emptySearchTitle: '没有找到匹配的助理',
    emptySearchSub: '试试换个关键词，或清空搜索看看全部',
    emptyNoneTitle: '还没有助理',
    emptyNoneSub: '点击工具栏 ＋ 新建，或接入聊天渠道',
    errorMsg: '刚才没连上，助理列表没拿到。检查网络后点重试。',
    retry: '重试',
  },
}

const EN: FirstViewCopy = {
  title: 'IM Companion',
  byAgent: (n) => 'By Assistants (' + n + ')',
  byChannel: (n) => 'By Channels (' + n + ')',
  updatedTip: (t) => (t ? 'Updated ' + t + ' (title counts folded into seg labels)' : 'See seg labels for counts'),
  search: 'Search',
  searchAria: 'Search assistants',
  segAria: 'Group by',
  radar: 'Set sail!',
  adopt: 'Visit & move',
  refresh: 'Refresh list',
  plus: 'New assistant',
  join: 'Connect',
  joinTitle: 'Connect a new channel',
  joinNeedHome: 'Choose a workspace before connecting',
  needHomeForConnect: (name) => 'Choose a workspace for "' + name + '" before connecting a channel.',
  detail: 'Details',
  detailTitle: 'Open assistant details',
  moreActions: (name) => 'More actions ' + name + ': Rename / Change workspace / Remove channel bots',
  wsPrefix: 'Workspace: ',
  rowTip: (name) => name + ' (hover row for actions; tap row on touch)',
  starTitle: 'Your ⭐ is the brightest star in my night sky',
  starHref: 'https://github.com/FeatherHunter/dsh-im-companion',
  feedbackTitle: 'Report an issue',
  feedbackHref: 'https://github.com/FeatherHunter/dsh-im-companion/issues/new',
  versionTitle: (v) => 'dsh-im-companion ' + v + ' (open repo on GitHub)',
  compatChip: (v) => 'dsh-im ' + v,
  compatTitle: (v, range) => 'Verified against dsh-im ' + v + '; compatible with ' + range
    + ' (4.17.1+ uses the /api carrier, older falls back automatically). Open the compatibility notes.',
  compatHref: 'https://github.com/FeatherHunter/dsh-im-companion/blob/master/docs/README.en.md#compat',
  dshCompatChip: (v) => 'dsh ' + v,
  dshCompatTitle: (v, requires) => 'Verified against @deepseek-ai/dsh ' + v + '; the host must provide '
    + requires + ' (the public /api carrier; older hosts fail loudly at assembly). Open the compatibility notes.',
  promoTitle: 'Related projects',
  promoDeck: 'dsh-mattpocock-skills-deck',
  promoDeckDesc: 'Agent skills method deck',
  promoPal: 'dsh-opencode-palette',
  promoPalDesc: 'OpenCode color palettes',
  states: {
    loading: 'Loading assistants… please wait.',
    emptySearchTitle: 'No matching assistants',
    emptySearchSub: 'Try another keyword, or clear search to see all',
    emptyNoneTitle: 'No assistants yet',
    emptyNoneSub: 'Click + in the toolbar, or connect a channel',
    errorMsg: 'Connection failed, list not loaded. Check network, then retry.',
    retry: 'Retry',
  },
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
