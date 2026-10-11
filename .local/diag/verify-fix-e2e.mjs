/** 修复端到端复证（T5 #110 / issue #119）：**仓内真源码的 toPackageReply** + 真宿主桥 + 真包面板。
 *
 * 与 repro-panel-ab.mjs 的区别：这里不手写「拆 value」逻辑，而是把 `src/features/update-center/view.ts`
 * 转译出来取**修好的那个函数**，接进 call，证明修复后的真实代码路径能让面板出数据。
 * 跑法（本仓根目录）：node .local/diag/verify-fix-e2e.mjs [profileName=desktop]
 */
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
const profile = process.argv[2] ?? 'desktop'
const pkgDir = path.join(os.homedir(), '.dsh', 'profiles', profile, 'node_modules', 'dsh-plugin-update', 'dist')

/* ① 转译仓内 view.ts 取修好的 toPackageReply（转译只为取运行时 JS；类型门禁归 npm run typecheck）。 */
const BUILD = mkdtempSync(path.join(os.tmpdir(), 't5-e2e-'))
try {
  execFileSync(process.execPath, [
    path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO, 'src', 'features', 'update-center', 'view.ts'),
    '--ignoreConfig', '--module', 'commonjs', '--target', 'es2022', '--moduleResolution', 'node10',
    '--outDir', BUILD, '--rootDir', path.join(REPO, 'src'), '--skipLibCheck', '--noEmitOnError', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' })
} catch { /* 外链包类型在 node10 下可能报 TS2307，产物照样落盘 */ }
mkdirSync(path.join(BUILD, 'node_modules'), { recursive: true })
symlinkSync(path.join(REPO, 'node_modules', 'dsh-plugin-update'), path.join(BUILD, 'node_modules', 'dsh-plugin-update'), 'junction')
const { toPackageReply } = createRequire(import.meta.url)(path.join(BUILD, 'features', 'update-center', 'view.js'))

/* ② 真宿主桥（从 profile 实装目录加载：包按 import.meta.url 反推使用范围）。 */
const { createHostUpdate } = await import(pathToFileURL(path.join(pkgDir, 'host.js')).href)
const { mountUpdatePanel } = await import(pathToFileURL(path.join(pkgDir, 'panel.js')).href)
const bridge = createHostUpdate(
  { ctx: {}, logCtx: { fire: () => {} }, readerOverrides: { homeDir: path.join(os.homedir(), '.dsh') } },
  { pluginId: 'dsh-im-companion', prefix: 'imc', targetPackageName: 'dsh-im-companion' },
)

/** 与 src/host/update.ts 的 reply() 逐字同构。 */
function hostReply(pkg) {
  if (pkg && pkg.ok === true) return { ok: true, value: { ...pkg } }
  const token = typeof pkg?.error === 'string' && pkg.error ? pkg.error : 'internal'
  return { ok: false, error: { code: token, message: token, details: { errorKind: pkg?.errorKind ?? null, update: pkg } } }
}

/** 与修复后 view.ts 的 call 逐字同构：rpc 回包 → toPackageReply → 交包。 */
const fixedCall = async (name, args) => toPackageReply(hostReply(await bridge.handlers[name](args ?? {})))

const host = { _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this._html = String(v) }, addEventListener() {}, removeEventListener() {} }
const panel = mountUpdatePanel(host, { pluginId: 'dsh-im-companion', prefix: 'imc', mode: 'dialog', theme: 'default', call: fixedCall })

setTimeout(() => {
  const html = host.innerHTML
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('停在「正在读取更新状态」: ' + html.includes('正在读取更新状态'))
  console.log('首屏文案: ' + text.slice(0, 200))
  console.log(html.includes('正在读取更新状态') ? 'FAIL：修复后仍空转' : 'PASS：修复后面板出数据')
  try { panel?.unmount?.() } catch { /* ignore */ }
  rmSync(BUILD, { recursive: true, force: true })
  process.exit(0)
}, 500)
