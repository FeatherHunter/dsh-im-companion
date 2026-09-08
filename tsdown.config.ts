import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'

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

const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-runtime/client',
]

const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    __PLUGIN_VERSION__: JSON.stringify(pluginVersion()),
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
