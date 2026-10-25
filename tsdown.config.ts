import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { loadLocales } from './scripts/i18n-locales.mjs'

const PLUGIN_ID = "dsh-im-companion"

/* #56：package.json 为唯一真相，构建时注入 __PLUGIN_VERSION__（对标 deck 的 DSW_VERSION）。 */
function pluginVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    return 'v' + String(pkg.version ?? '0.0.0')
  } catch {
    return 'v0.0.0'
  }
}

/* #78/#79：同源注入兼容信息（package.json 的 dshImCompat / dshCompat 是唯一真相，改一处 UI 即变）。
 * 字段名由调用处给定，缺字段回空串 —— 面板据此隐藏对应的兼容标记，绝不硬编码版本号。 */
function compatField(key: string, fields: readonly string[]): Record<string, string> {
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))?.[key] ?? {}
  } catch {
    /* 读不到 package.json（异常环境）：全部回空串，UI 隐藏标记 */
  }
  return Object.fromEntries(fields.map((f) => [f, String(raw[f] ?? '')]))
}

/* #130：构建身份（日志行自证「出自哪一版产物」）：版本 + 打包时刻（UTC 秒），与宿主侧同形（src/build-id.ts）。 */
function buildStamp(): string {
  try {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  } catch {
    return ''
  }
}

const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-runtime/client',
]

/* #184 i18n：src 下所有 locales.yaml 汇总成 virtual:imc-locales 打进客户端 bundle。
 * 词条单一真相是 YAML（形状/校验见 scripts/i18n-locales.mjs）；校验不过即构建失败（不静默降级）。 */
const LOCALES_VIRTUAL_ID = 'virtual:imc-locales'
const LOCALES_RESOLVED_ID = '\0' + LOCALES_VIRTUAL_ID

function localesPlugin() {
  const repoRoot = fileURLToPath(new URL('.', import.meta.url))
  return {
    name: 'imc-locales',
    resolveId(id: string) {
      return id === LOCALES_VIRTUAL_ID ? LOCALES_RESOLVED_ID : null
    },
    load(id: string) {
      if (id !== LOCALES_RESOLVED_ID) return null
      const { dicts, files, problems } = loadLocales(repoRoot)
      if (problems.length > 0) throw new Error('[i18n] locales.yaml 校验失败（' + problems.length + ' 条）：\n' + problems.join('\n'))
      return 'export default ' + JSON.stringify(dicts) + ' /* ' + files.length + ' 份 locales.yaml（构建期注入） */'
    },
  }
}

const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  plugins: [localesPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    __PLUGIN_VERSION__: JSON.stringify(pluginVersion()),
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
    __DSH_IM_COMPAT__: JSON.stringify(compatField('dshImCompat', ['verified', 'range'])),
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
}

export default [clientBundle] satisfies UserConfig[]
