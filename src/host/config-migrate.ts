/** 配置迁移（T12 #129）：`<name>.json` → `<name>.yaml`，**幂等**，旧文件留一份备份。
 *
 * 触发：宿主装配时跑一次（`src/index.ts`）。没跑完 / 跑失败也不丢数据——读路径
 * （`config-yaml.readConfigText`）对旧 `.json` 有诚实回落，写路径只写 `.yaml`。
 * 纪律：① 只有「迁移真的成功」才把旧文件改名成备份（半途失败绝不动旧文件）；
 * ② `.yaml` 已存在就不再迁移（重跑不重复迁移、不覆盖已有配置）；
 * ③ 旧文件 JSON 解析不出来 ⇒ 原样留着、报 `json-invalid`（不猜、不覆盖、不删）。 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseConfigText, renderConfigText, titleForFile, writeConfigTextAtomic } from './config-yaml.js'

export interface MigrateOutcome {
  /** 文件名主干，如 `homes` / `meta`（日志与断言用）。 */
  name: string
  migrated: boolean
  /** `no-json`（本来就没有旧文件）| `yaml-exists`（已迁移过）| `json-invalid` | `migrated`。 */
  reason: 'no-json' | 'yaml-exists' | 'json-invalid' | 'migrated'
  /** 备份文件名（无备份时空串）。 */
  backup: string
}

async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.stat(file)
    return true
  } catch {
    return false
  }
}

/** 备份名：优先 `<原名>.bak`；已存在则退 `<原名>.bak-2`、`-3`…（绝不覆盖既有备份）。 */
async function freeBackupName(file: string): Promise<string> {
  for (let i = 1; i < 100; i += 1) {
    const candidate = i === 1 ? file + '.bak' : file + '.bak-' + i
    if (!(await exists(candidate))) return candidate
  }
  return file + '.bak-' + Date.now()
}

/** 单文件迁移（幂等）：成功 = 写了 `.yaml` **并且**把旧 `.json` 改名成备份。 */
export async function migrateConfigFile(jsonFile: string, yamlFile: string): Promise<MigrateOutcome> {
  const name = path.basename(yamlFile).replace(/\.yaml$/i, '')
  const jsonText = await readTextOrNull(jsonFile)
  if (jsonText === null) return { name, migrated: false, reason: 'no-json', backup: '' }
  if (await exists(yamlFile)) return { name, migrated: false, reason: 'yaml-exists', backup: '' }
  /* JSON 是 YAML 1.2 的子集 ⇒ 同一把解析器读旧文件即可（顺带容忍历史脏格式）。 */
  const doc = parseConfigText(jsonText)
  if (doc === null || typeof doc !== 'object') return { name, migrated: false, reason: 'json-invalid', backup: '' }
  await writeConfigTextAtomic(yamlFile, renderConfigText(doc, titleForFile(yamlFile)))
  const backup = await freeBackupName(jsonFile)
  await fs.rename(jsonFile, backup)
  return { name, migrated: true, reason: 'migrated', backup: path.basename(backup) }
}

/** 插件全部配置文件的迁移（当前两个：homes / meta）。目录不存在时逐个回 `no-json`，不建目录。 */
export async function migrateConfigToYaml(dir: string): Promise<MigrateOutcome[]> {
  return [
    await migrateConfigFile(path.join(dir, 'homes.json'), path.join(dir, 'homes.yaml')),
    await migrateConfigFile(path.join(dir, 'meta.json'), path.join(dir, 'meta.yaml')),
  ]
}
