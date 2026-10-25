/** 插件内多语言核心：查词 / 缺词回退 / {name} 插值 / 语言与字典变更订阅。
 * 纯逻辑、无 DOM 与构建期依赖（verify 可直测）。词条真相在 src 下各 locales.yaml，
 * 构建期由 scripts/i18n-locales.mjs 汇总后经 virtual:imc-locales 注入（装配见 install.ts）。
 * 回退链：请求语言 → en → zh → 键名本身（绝不返回空串：缺词在 UI 上可见、可查）。 */
export type LocaleTag = string
export type LocaleDicts = Record<string, Record<string, Record<string, string>>>

const FALLBACK_LOCALE = 'en'
const DEFAULT_LOCALE = 'zh'

let dictionaries: LocaleDicts = {}
let active: LocaleTag = DEFAULT_LOCALE
let revision = 0
const listeners = new Set<() => void>()

/** BCP-47 标签归一：zh*→zh、en*→en，其余保留小写原文（未知语言交给回退链）。 */
export function normalizeLocale(tag: unknown): LocaleTag {
  const s = typeof tag === 'string' ? tag.trim().toLowerCase() : ''
  if (!s) return ''
  if (s.startsWith('zh')) return 'zh'
  if (s.startsWith('en')) return 'en'
  return s
}

/** 注入全部词条（构建期一次给全量；测试里可替换）。 */
export function setDictionaries(next: LocaleDicts): void {
  dictionaries = next && typeof next === 'object' ? next : {}
  bump()
}

/** 当前语言（已归一）。 */
export function activeLocale(): LocaleTag {
  return active
}

/** 全局修订号：词条或语言一变就 +1（视图拼进重绘签名即可强制换语）。 */
export function localeRevision(): number {
  return revision
}

/** 切换语言；空值回落默认语言，已是该语言则不动（不触发通知）。 */
export function setActiveLocale(tag: unknown): LocaleTag {
  const next = normalizeLocale(tag) || DEFAULT_LOCALE
  if (next === active) return active
  active = next
  bump()
  return active
}

/** 订阅语言/字典变化，返回退订函数（单个监听器异常不扩散）。 */
export function onLocaleChange(fn: () => void): () => void {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function bump(): void {
  revision++
  for (const fn of Array.from(listeners)) {
    try { fn() } catch { /* 单个监听失败不影响其他 */ }
  }
}

/** 该语言下的查词顺序（去重）：请求语言 → en → zh。 */
function fallbackOrder(tag: LocaleTag): LocaleTag[] {
  const order: LocaleTag[] = []
  for (const cand of [normalizeLocale(tag) || DEFAULT_LOCALE, FALLBACK_LOCALE, DEFAULT_LOCALE]) {
    if (cand && order.indexOf(cand) === -1) order.push(cand)
  }
  return order
}

/** {name} 占位符插值；缺参数的原样保留（缺词/缺参在 UI 上可见，便于诊断）。 */
export function fill(template: string, params?: Record<string, string | number>): string {
  if (typeof template !== 'string' || !params) return template
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (raw, key: string) => {
    const v = params[key]
    return v === undefined || v === null ? raw : String(v)
  })
}

/** 指定语言查词（回退顺序见文件头）。 */
export function translate(tag: unknown, ns: string, key: string, params?: Record<string, string | number>): string {
  const dicts = dictionaries[ns]
  if (!dicts) return key
  for (const loc of fallbackOrder(normalizeLocale(tag))) {
    const dict = dicts[loc]
    const value = dict ? dict[key] : undefined
    if (typeof value === 'string' && value !== '') return fill(value, params)
  }
  return key
}

/** 当前语言查词（UI 主入口）。 */
export function t(ns: string, key: string, params?: Record<string, string | number>): string {
  return translate(active, ns, key, params)
}

/** 绑定命名空间的查词器（feature 推荐写法：const tr = tOf('left-filter')）。 */
export function tOf(ns: string): (key: string, params?: Record<string, string | number>) => string {
  return (key, params) => t(ns, key, params)
}

/** 指定语言下该键是否真存在（诊断与门禁用，不走回退）。 */
export function hasKey(ns: string, locale: LocaleTag, key: string): boolean {
  const dict = dictionaries[ns]
  const loc = normalizeLocale(locale)
  const tree = dict ? dict[loc] : undefined
  return typeof tree?.[key] === 'string'
}
