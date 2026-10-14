/** 配置文件 YAML 文本 IO（T12 #129）：**我们是这份文件注释的权威解释者**。
 *
 * 口径（owner 裁定 2026-10-15）：
 * ① 配置文件一律 YAML；每次写回**整块重新生成**注入的注释块——用户手改注释会被覆盖（既定口径）；
 * ② 写是原子的：先写 `<文件>.tmp` 再 rename，中断不会留下半截文件，写失败不脏（目标文件原样）；
 * ③ 结构字段可手改（parse 出来再由各 store 的 clean* 归一）；
 * ④ 迁移尚未跑完时，读路径对同目录同名的旧 `.json` 诚实回落（不丢数据、不静默空表）。
 * 库选 `yaml`（精确版本 pin 在 package.json）：`lineWidth: 0` 关掉折行——YAML 折行会把长标量
 * （头像 data URL 之类）折成多行，折行处的换行在解析时变空格 ⇒ 数据被悄悄改写；关掉才 round-trip 无损。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/** 每个配置文件一行「这是什么」的说法（单点定义，migrator 与两个 store 共用）。 */
const TITLES: Record<string, string> = {
  homes: '家（＝工作区，一对一）与助理（＝机器人身份）的权威记录',
  meta: '旧 Agent 偏好（名字 / 头像 / 预设 / 更新与动效开关）',
}

/** 文件名（去掉扩展名）→ 该文件的说明行；认不出就退回通用说法（绝不留空）。 */
export function titleForFile(file: string): string {
  const stem = path.basename(file).replace(/\.(yaml|json)$/i, '')
  return TITLES[stem] ?? '插件配置文件'
}

/** 注入注释块（整块重建；只有这一处拼它，别在别处再写一份）。 */
export function commentBlockFor(title: string): string {
  return [
    '# ---------------------------------------------------------------------------',
    '# dsh-im-companion · ' + title,
    '#',
    '# ・本文件由「IM 机器人增强」插件生成与维护。结构字段（名字 / 头像 / 路径之类）可以手工改，',
    '#   改完刷新面板即生效；本注释块由插件强制注入——手改的注释会在下次写回时被恢复成这个样子。',
    '# ・写入是原子的：先写 <同名>.tmp 再改名覆盖；中断不会留下半截文件，失败不动原文件。',
    '# ・可用面板页头的「配置」入口复制本目录路径，或在文件浏览器里直接打开本目录。',
    '# ---------------------------------------------------------------------------',
  ].join('\n') + '\n'
}

/** 落盘文本＝注入注释块 + YAML 正文（注释块每次都重新生成，手改必被覆盖）。 */
export function renderConfigText(doc: unknown, title: string): string {
  return commentBlockFor(title) + stringifyYaml(doc, { lineWidth: 0 })
}

/** 解析配置文本；注释天然被忽略，结构字段听用户的。解析不出来回 null（调用方按空表诚实兜底）。 */
export function parseConfigText(text: string): unknown | null {
  try {
    const value = parseYaml(text)
    return value === undefined ? null : value
  } catch {
    return null
  }
}

/** 同名旧文件（`x.yaml` ↔ `x.json`）：迁移前回落读与迁移本身共用这一个推导。 */
export function legacyJsonFor(file: string): string {
  return /\.yaml$/i.test(file) ? file.replace(/\.yaml$/i, '.json') : file + '.json'
}

async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

/** 读配置文本：先读自己（.yaml），没有就回落读同名 `.json`（迁移还没跑完的场景）。 */
export async function readConfigText(file: string): Promise<{ text: string; legacy: boolean } | null> {
  const own = await readTextOrNull(file)
  if (own !== null) return { text: own, legacy: false }
  const legacy = legacyJsonFor(file)
  if (legacy === file) return null
  const old = await readTextOrNull(legacy)
  return old === null ? null : { text: old, legacy: true }
}

/** 原子写：mkdir → 写 `<文件>.tmp` → rename 覆盖（同 meta-store/home-store 既有口径，收敛到这一处）。 */
export async function writeConfigTextAtomic(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, file)
}

/** 配置目录（家 / 助理 / 旧 Agent 偏好 / 头像素材都在这一个目录里）——面板「复制路径」「打开目录」的落点。 */
export function configDirFor(dshHome: string): string {
  return path.join(dshHome, 'integrations', 'dsh-im-companion')
}

/** 目录内文件名清单（面板弹层显示用；读不到就回空数组——只影响展示，不影响动作）。 */
export async function listConfigFiles(dir: string): Promise<string[]> {
  try {
    const names = await fs.readdir(dir)
    return names.filter((n) => !n.endsWith('.tmp')).sort()
  } catch {
    return []
  }
}
