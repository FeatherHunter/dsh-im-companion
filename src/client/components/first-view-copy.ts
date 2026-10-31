/** 首屏赢家变体文案（#25 D 拼装 + 助理 + P2，#26 实现票自有）。
 * #184 起词条真相＝同目录 locales.yaml（ns: first-view，中英同文件），经 shared i18n 查词；
 * 语言跟随 DSH locale 服务（切换即时换语，无切换器）。空 / 加载 / 错误三态文案同表。 */
import { initialOf } from '../data/model'
import { activeLocale, normalizeLocale, translate } from '../i18n'

export type FirstViewLang = 'zh' | 'en'

/** DSH 系统语言：显式传 doc 时按 documentElement.lang 判（老快照/测试形态）；
 * 不传时取 i18n 当前语言（zh→zh，其他非空→en，空→zh）。 */
export function firstViewLang(doc?: unknown): FirstViewLang {
  if (doc !== undefined && doc !== null) {
    try {
      const lang = (doc as { documentElement?: { lang?: unknown } }).documentElement?.lang
      if (typeof lang === 'string' && lang.toLowerCase().startsWith('en')) return 'en'
    } catch {
      /* 取不到按中文 */
    }
    return 'zh'
  }
  const loc = normalizeLocale(activeLocale())
  if (!loc || loc === 'zh') return 'zh'
  return 'en'
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

const NS = 'first-view'

/** 语言无关的链接（两种语言同一地址；compatHref 中英不同，故进词条表）。
 *  export 出去给 base-ui 的页头三件套用（Star 去处 / Issue 去处）：仓库地址全仓只此一份真相。
 *  Issue 去处＝issues **列表页**（base 0.1.5 ActionCluster 默认口径；不再直落 /issues/new 表单）。 */
export const REPO_HREF = 'https://github.com/FeatherHunter/dsh-im-companion'
export const ISSUES_HREF = 'https://github.com/FeatherHunter/dsh-im-companion/issues'

function copyFor(lang: FirstViewLang): FirstViewCopy {
  const tr = (key: string, params?: Record<string, string | number>): string => translate(lang, NS, key, params)
  return {
    title: tr('title'),
    byAgent: (n) => tr('byAgent', { n }),
    byChannel: (n) => tr('byChannel', { n }),
    updatedTip: (t) => (t ? tr('updatedTip', { t }) : tr('updatedTipEmpty')),
    search: tr('search'),
    searchAria: tr('searchAria'),
    segAria: tr('segAria'),
    radar: tr('radar'),
    adopt: tr('adopt'),
    refresh: tr('refresh'),
    plus: tr('plus'),
    join: tr('join'),
    joinTitle: tr('joinTitle'),
    joinNeedHome: tr('joinNeedHome'),
    needHomeForConnect: (name) => tr('needHomeForConnect', { name }),
    detail: tr('detail'),
    detailTitle: tr('detailTitle'),
    moreActions: (name) => tr('moreActions', { name }),
    rowTip: (name) => tr('rowTip', { name }),
    starTitle: tr('starTitle'),
    starHref: REPO_HREF,
    feedbackTitle: tr('feedbackTitle'),
    feedbackHref: ISSUES_HREF,
    versionTitle: (v) => tr('versionTitle', { v }),
    compatChip: (v) => tr('compatChip', { v }),
    compatTitle: (v, range) => tr('compatTitle', { v, range }),
    compatHref: tr('compatHref'),
    states: {
      loading: tr('states.loading'),
      emptySearchTitle: tr('states.emptySearchTitle'),
      emptySearchSub: tr('states.emptySearchSub'),
      emptyNoneTitle: tr('states.emptyNoneTitle'),
      emptyNoneSub: tr('states.emptyNoneSub'),
      errorMsg: tr('states.errorMsg'),
      retry: tr('states.retry'),
    },
  }
}

export function firstViewCopy(lang?: FirstViewLang): FirstViewCopy {
  return copyFor(lang ?? firstViewLang())
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
