/**
 * i18n 词条装载器（单一真相：src 下所有 locales.yaml）。
 *
 * 每份 YAML 形状（单文件内同时含多语言词条）：
 *   ns: first-view        # 命名空间，全局唯一（同一 ns 只能一处定义）
 *   zh:                   # 平键字典（键可带 . 分段，值必须是字符串）
 *     title: 'IM机器人增强'
 *   en:
 *     title: 'IM Companion'
 *
 * 校验（problems 非空即构建/门禁失败）：
 *  - ns 必填且唯一；zh / en 两棵字典都必须存在；
 *  - 值必须是字符串且非空；
 *  - zh 与 en 键集必须一致（防止漏译／多余键）。
 *
 * 两个使用方：tsdown 构建期 virtual:imc-locales 注入（客户端词条）；tools/verify/i18n.ts 门禁。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse } from 'yaml'

export const LOCALE_KEYS = ['zh', 'en']
const FILE_NAME = 'locales.yaml'

function walk(dir, out) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile() && e.name === FILE_NAME) out.push(p)
  }
  return out
}

/**
 * 扫描并校验词条文件。
 * @param {string} rootDir 仓库根
 * @returns {{ dicts: Record<string, Record<string, Record<string, string>>>, files: string[], problems: string[] }}
 */
export function loadLocales(rootDir) {
  const problems = []
  const dicts = {}
  const files = walk(join(rootDir, 'src'), []).sort()
  if (!files.length) problems.push('src 下没有找到任何 locales.yaml（词条真相缺失）')
  for (const file of files) {
    const rel = relative(rootDir, file).split(sep).join('/')
    let doc
    try { doc = parse(readFileSync(file, 'utf8')) } catch (e) { problems.push(rel + '：YAML 解析失败（' + String((e && e.message) || e) + '）'); continue }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { problems.push(rel + '：顶层必须是映射（ns / zh / en）'); continue }
    const ns = typeof doc.ns === 'string' ? doc.ns.trim() : ''
    if (!ns) { problems.push(rel + '：缺 ns（命名空间，全局唯一）'); continue }
    if (dicts[ns]) { problems.push(rel + '：ns「' + ns + '」重复（同一命名空间只能一处定义）'); continue }
    const set = {}
    for (const key of LOCALE_KEYS) {
      const tree = doc[key]
      if (!tree || typeof tree !== 'object' || Array.isArray(tree)) { problems.push(rel + '：缺 ' + key + ' 词条树'); continue }
      const flat = {}
      for (const [k, v] of Object.entries(tree)) {
        if (typeof v !== 'string') { problems.push(rel + '：' + key + '.' + k + ' 必须是字符串'); continue }
        if (!v.trim()) { problems.push(rel + '：' + key + '.' + k + ' 为空串'); continue }
        flat[k] = v
      }
      set[key] = flat
    }
    if (!set.zh || !set.en) continue
    const missingEn = Object.keys(set.zh).filter((k) => !(k in set.en))
    const missingZh = Object.keys(set.en).filter((k) => !(k in set.zh))
    for (const k of missingEn) problems.push(rel + '：en 缺键 ' + k + '（zh/en 键集必须一致）')
    for (const k of missingZh) problems.push(rel + '：zh 缺键 ' + k + '（zh/en 键集必须一致）')
    if (missingEn.length || missingZh.length) continue
    dicts[ns] = set
  }
  return { dicts, files, problems }
}
