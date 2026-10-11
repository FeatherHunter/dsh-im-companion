/** 发布后公开物复核（发布日志只认公开物）：对解包后的 tarball 目录逐项验。
 * 跑法：node .local/diag/verify-published.mjs <解包目录，含 package/>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('用法：node .local/diag/verify-published.mjs <解包目录>'); process.exit(2) }
const pkgDir = join(dir, 'package')
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const client = readFileSync(join(pkgDir, 'lib', 'client.js'), 'utf8')
const rpc = readFileSync(join(pkgDir, 'lib', 'host', 'rpc.js'), 'utf8')
const upd = readFileSync(join(pkgDir, 'lib', 'host', 'update.js'), 'utf8')
const idx = readFileSync(join(pkgDir, 'lib', 'index.js'), 'utf8')

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
const files = walk(pkgDir).map((p) => p.replace(/\\/g, '/'))

const start = client.indexOf('const hdRight = h("div", { className: "af-hd-right" }')
const seg = start >= 0 ? client.slice(start, start + 900) : ''
const phones = ['imc.updateStatus', 'imc.updateCheck', 'imc.updateInstall', 'imc.updateChangelog']

const rows = [
  ['包内 version', pkg.version],
  ['更新包 pin', pkg.dependencies['dsh-plugin-update']],
  ['解信封 call 接线', /toPackageReply\(\s*await\s+rpc\(/.test(client)],
  ['注入 __PLUGIN_VERSION__', (client.match(/v\d+\.\d+\.\d+/) ?? ['(无)'])[0]],
  ['页头：挂载点在 star 左侧', seg.includes('updateCenterHost') && seg.indexOf('updateCenterHost') < seg.indexOf('copy.starHref')],
  ['页头：right 组顺序含 verBox 在前', seg.indexOf('verBox') < seg.indexOf('updateCenterHost')],
  ['root 里已无旧位置', !/className: "af-root"[^;]*updateCenterHost/.test(client)],
  ['host 四电话 rpc.js', phones.filter((k) => rpc.includes(k)).length + '/4'],
  ['host 四电话 update.js', phones.filter((k) => upd.includes(k)).length + '/4'],
  ['index.js 接更新桥', idx.includes('createUpdateHostBridge')],
  ['无陈旧 update-schedule', !files.some((f) => f.includes('update-schedule'))],
  ['包内文件数', files.length],
]
for (const [k, v] of rows) console.log(String(k).padEnd(30), '=', v)

const bad = rows.filter(([, v]) => v === false || v === '0/4')
console.log(bad.length ? 'FAIL：' + bad.map(([k]) => k).join('、') : 'PASS：公开物逐项通过')
process.exit(bad.length ? 1 : 0)
