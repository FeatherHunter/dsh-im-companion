/** i18n 装配（只由 client 入口调用一次）：注入构建期词条 + 跟随 DSH 语言。
 * 语言来源：DSH locale 服务（ctx.get('locale')，内置 zh/en，切换即时生效并订阅）；
 * 服务缺失时回退 documentElement.lang → navigator.languages → 默认 zh（老宿主不至于卡死）。
 * 失败一律降级（无词条/无服务不影响插件其余部分），不留白屏。 */
import dicts from 'virtual:imc-locales'
import { logLine, logOn } from '../log'
import { activeLocale, localeRevision, setActiveLocale, setDictionaries, type LocaleDicts } from './core'

type GetService = (name: string) => unknown

interface LocaleLike {
  getSnapshot?: () => unknown
  getLocale?: () => unknown
  subscribe?: (fn: () => void) => unknown
}

function readServiceLocale(svc: LocaleLike | null): string {
  if (!svc) return ''
  try {
    const get = typeof svc.getSnapshot === 'function' ? svc.getSnapshot : typeof svc.getLocale === 'function' ? svc.getLocale : null
    if (!get) return ''
    const snap = get.call(svc) as { active?: unknown } | string | null | undefined
    const tag = typeof snap === 'string' ? snap : snap && typeof snap.active === 'string' ? snap.active : ''
    return typeof tag === 'string' ? tag : ''
  } catch {
    return ''
  }
}

function documentLang(): string {
  try {
    if (typeof document === 'undefined') return ''
    const lang = document.documentElement?.lang
    return typeof lang === 'string' ? lang : ''
  } catch {
    return ''
  }
}

/** 兜底跟随：DSH 换语时 locale 插件会把 <html lang> 改掉（宿主 dsh-client-locale 的 syncDocumentLanguage）。
 * 即使 ctx.get('locale') 取不到服务、也订阅不到语言服务，这个观察者仍能让插件实时换语。 */
function watchDocumentLang(): () => void {
  try {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
    const el = document.documentElement
    if (!el) return () => {}
    const obs = new MutationObserver(() => {
      const lang = el.lang
      if (typeof lang === 'string' && lang) setActiveLocale(lang)
    })
    obs.observe(el, { attributes: true, attributeFilter: ['lang'] })
    return () => {
      try { obs.disconnect() } catch { /* 断开失败忽略 */ }
    }
  } catch {
    return () => {}
  }
}

function navigatorLang(): string {
  try {
    if (typeof navigator === 'undefined' || !navigator) return ''
    const list = navigator.languages
    if (Array.isArray(list)) {
      for (const it of list) if (typeof it === 'string' && it) return it
    }
    const one = navigator.language
    return typeof one === 'string' ? one : ''
  } catch {
    return ''
  }
}

/** 装配 i18n；返回卸载函数（退订语言服务）。重复调用是幂等覆盖（热更新双挂载安全）。 */
export function installI18n(get: GetService): () => void {
  try {
    setDictionaries(dicts as unknown as LocaleDicts)
  } catch {
    /* 词条注入失败不阻断插件（查词会退化成键名） */
  }
  let svc: LocaleLike | null = null
  try {
    const raw = typeof get === 'function' ? get('locale') : undefined
    if (raw && typeof raw === 'object') svc = raw as LocaleLike
  } catch {
    svc = null
  }
  let source = 'default(zh)'
  let tag = readServiceLocale(svc)
  if (tag) {
    source = 'locale-service'
  } else {
    const doc = documentLang()
    if (doc) {
      tag = doc
      source = 'documentElement.lang'
    } else {
      const nav = navigatorLang()
      if (nav) {
        tag = nav
        source = 'navigator'
      }
    }
  }
  setActiveLocale(tag || 'zh')
  let off: (() => void) | null = null
  try {
    if (svc && typeof svc.subscribe === 'function') {
      const stop = svc.subscribe(() => {
        const next = readServiceLocale(svc)
        if (next) setActiveLocale(next)
      })
      if (typeof stop === 'function') off = stop as () => void
    }
  } catch {
    off = null
  }
  const offLang = watchDocumentLang()
  try {
    if (logOn('debug')) {
      logLine('debug', 'ui.action', {
        area: 'i18n',
        action: 'install',
        ok: true,
        message: '语言 ' + activeLocale() + '（来源 ' + source + (svc ? '，已订阅 locale 服务' : '，无 locale 服务') + '），修订号 ' + localeRevision(),
      })
    }
  } catch {
    /* 日志失败忽略 */
  }
  return () => {
    try { off?.() } catch { /* 退订失败忽略 */ }
    try { offLang() } catch { /* 断开失败忽略 */ }
  }
}
