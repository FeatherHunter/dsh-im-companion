/** 宿主侧构建身份取值（#130）：回答「此刻运行的宿主产物是哪一份」。
 *
 * 取值＝入口产物（package.json 的 main ＝ `lib/index.js`）的 mtime ＋ 同目录 `package.json` 的 version。
 * 入口 URL 由调用方给（`src/index.ts` 传 `import.meta.url`）⇒ 这里不猜路径、同一函数可被验证物用临时包目录驱动。
 * 全函数 try/catch：取不到就把那段留空——日志绝不许拖垮装配，也不许编造。
 */
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formatBuildId } from '../build-id.js'

export function hostBuildId(entryUrl: string): string {
  let at: number | string = ''
  let version = ''
  try {
    at = statSync(fileURLToPath(entryUrl)).mtimeMs
  } catch {
    /* 产物不在磁盘（被打包进别处）：时刻留空，版本仍尽力取 */
  }
  try {
    /* 版本号统一带 `v` 前缀：与客户端 `__PLUGIN_VERSION__`（tsdown define 里已带 v）同形，两侧可直接对照。 */
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', entryUrl)), 'utf8'))
    const raw = String(pkg?.version ?? '')
    version = raw ? 'v' + raw : ''
  } catch {
    /* package.json 读不到（异常布局）：版本留空 */
  }
  return formatBuildId(version, at)
}
