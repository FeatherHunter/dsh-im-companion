// #139/#140「渲染文案零中点」门禁：把 owner 2026-10-17 的裁定做成**跨命名空间**的静态钉子。
//
// 为什么值得单独一个验证物：`·` 退役不是三十处手改，而是一条**显示规范**——关系（父/子、注解、键值、
// 步骤、并列）各有形式，靠结构（换行/字重/色阶/括号/图标/gap）表达，不靠一个兼多义的符号。
// 手改的证据是「我这次改的这几处没了」；规范要的证据是「下一个 PR 也长不回来」。
// 既有门禁只在自己的命名空间里查自己那几行（home-steel / welcome-banner / fleet-radar…），
// 一个新建的 feature 往文案里塞 `·` 不会有任何东西红——本文件补的就是这一档。
//
// 判据（先剥注释再看）：src/**.ts 里**注释之外**不允许出现 U+00B7。
// 例外只有一条，且必须写在这里（新增例外＝改这条规范，得在提审里说）：
//   ① `src/host/config-yaml.ts` 的注释头 `# dsh-im-companion · <title>` —— 它落进用户磁盘上的
//      config.yaml 当注释行，不是渲染文案（`tools/verify/features/config-yaml.ts:64` 钉着这串）。
// 手法：朴素字符扫描（跟踪 ' " ` 三态与 // /* 两态）——不用正则剥注释，因为源码里有 URL 与正则字面量。
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'

const REPO = process.cwd()
const SRC = join(REPO, 'src')
const MIDDOT = '\u00b7'

/** 例外：文件路径（相对仓库根，正斜杠）→ 理由。理由必须说清「为什么它不是渲染文案」。 */
const EXEMPT: Record<string, string> = {
  'src/host/config-yaml.ts': '写进 config.yaml 的注释头，落盘注释不是渲染文案',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 剥掉注释，返回 {line, text} 形式的「注释外」内容行（保留行号，便于报错定位）。 */
function codeLines(src: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = []
  let buf = ''
  let line = 1
  let quote: string | null = null
  let block = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '\n') {
      if (quote !== '`') buf += c // 模板串可跨行，普通串/单引号串不跨行（转义交给下一轮 quote 判定）
      out.push({ line, text: buf.replace(/\n$/, '') })
      buf = ''
      line += 1
      continue
    }
    if (block) {
      if (c === '*' && n === '/') { block = false; i += 1 }
      continue
    }
    if (quote) {
      buf += c
      if (c === '\\') { buf += n ?? ''; i += 1; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '/' && n === '/') { // 行注释：跳到行尾
      while (i < src.length && src[i] !== '\n') i += 1
      i -= 1
      continue
    }
    if (c === '/' && n === '*') { block = true; i += 1; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; buf += c; continue }
    buf += c
  }
  if (buf) out.push({ line, text: buf })
  return out
}

test('渲染文案零中点（#139/#140）：注释之外 src 全域不许再出现 ·，例外逐条钉名', () => {
  const files = walk(SRC).map((p) => relative(REPO, p).replace(/\\/g, '/')).sort()
  assert.ok(files.length > 100, 'src 至少应扫到上百个文件（防止 walk 走空导致门禁假绿）')
  const hits: string[] = []
  for (const rel of files) {
    if (EXEMPT[rel]) continue
    const lines = codeLines(readFileSync(join(REPO, rel), 'utf8'))
    for (const l of lines) {
      const at = l.text.indexOf(MIDDOT)
      if (at >= 0) hits.push(rel + ':' + l.line + ' —— ' + l.text.trim().slice(Math.max(0, at - 30), at + 30))
    }
  }
  assert.deepEqual(hits, [],
    '中点已退役（owner 2026-10-17）：关系改用结构表达——父/子换行＋色阶、注解括号、属性键值图标节点、'
    + '步骤合成词、并列 gap。渲染文案与 title/aria 一律不许再出现 ·（不可见文案用中文逗号／英文逗号）。\n'
    + '若确属非渲染用途（注释不算，已被剥掉），把它加进本文件 EXEMPT 并写明理由。\n命中：\n' + hits.join('\n'))
})

test('例外清单不腐烂：EXEMPT 里的文件确实还在、且确实含 ·', () => {
  for (const [rel, why] of Object.entries(EXEMPT)) {
    assert.ok(why.length > 8, rel + ' 的例外理由必须写清楚')
    let src = ''
    try { src = readFileSync(join(REPO, rel), 'utf8') } catch { assert.fail('例外文件不存在了，删掉这条豁免：' + rel) }
    assert.ok(codeLines(src).some((l) => l.text.includes(MIDDOT)),
      rel + ' 已经不含中点了 —— 把这条豁免删掉（豁免留着会掩盖将来的回归）')
  }
})
