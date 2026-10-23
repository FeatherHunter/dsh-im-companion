/** 把拉到的 starred_at 列表落成 docs/star-history.json（每日任务的第 1 步）。
 *
 * 用法（本地）：
 *   gh api -H "Accept: application/vnd.github.star+json" \
 *     repos/FeatherHunter/dsh-im-companion/stargazers --paginate --jq ".[].starred_at" > stars.txt
 *   node tools/star-history/update.ts stars.txt
 *
 * 路径全部相对**仓库根**（由本文件位置推出），不是相对当前工作目录 —— 免得在别的目录
 * 跑脚本时把文件写到别处去。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregateByDay, withZeroStart } from './aggregate.ts'

/** 仓库根 = tools/star-history/ 的上上级。 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const input = process.argv[2] ? resolve(process.argv[2]) : join(REPO_ROOT, 'stars.txt')
const outPath = process.argv[3] ? resolve(process.argv[3]) : join(REPO_ROOT, 'docs', 'star-history.json')

const list = readFileSync(input, 'utf8').trim().split(/\r?\n/).filter(Boolean)
const agg = withZeroStart(aggregateByDay(list))
writeFileSync(outPath, JSON.stringify(agg, null, 2) + '\n')
console.log(`Wrote ${agg.length} days, total ${agg[agg.length - 1]?.total} → ${outPath}`)
