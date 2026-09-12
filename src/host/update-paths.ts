/** 更新系统宿主侧（T7 #90）：本插件包根、运行版本、使用范围目录的**同步**解析。
 *
 * 为什么由集成方自带：更新包认「自己在哪个使用范围」的唯一手段是
 * `containingPackage(fileURLToPath(import.meta.url), 目标包名)` 从**更新包自己所在的目录**向上找目标包
 * （`dist/reader.js:102`、`dist/host.js:83`）——**没有任何参数可以指定起点**。
 * 本插件按版本号装进 profile 后，目标包与更新包在 `node_modules` 里是**兄弟目录**，向上找不到
 * ⇒ `runningVersion` 算不出 ⇒ 每通电话都抛 `unknown-profile`（`dist/host.js:85`，R3 实测 L1）。
 * 故运行版本与使用范围目录必须显式给定（`deps.readerOverrides`，`dist/host.js:219/84/86`）。
 *
 * 全同步的理由：`createHostUpdate(deps, configInput)` 是同步两参函数，`readerOverrides` 在建能力那一刻即取定；
 * 且 `dist/host.js:93` 的单例键不含 `readInstalled` ⇒ 注入必须**首次调用就带**，不能等到某个 await 之后再补。
 * 本模块只在装配期跑一次，不进热路径。
 */
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 目标包名：本插件在更新包里的第二注册参数，也是三处判据（电话名/读取器/读取器上游）的同一个值。 */
export const TARGET_PACKAGE_NAME = 'dsh-im-companion'

export interface OwnPackage {
  directory: string
  version: string | null
}

/** 读一份 package.json；读不到、不是 JSON、不是对象一律 null（不吃异常）。 */
function readManifest(filename: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filename, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** realpath 失败就回原值（目录可能还没建；调用方不需要区分）。 */
function canonical(directory: string): string {
  try {
    return realpathSync(directory)
  } catch {
    return directory
  }
}

/** 本插件包根与运行版本：从**本文件**向上找 `name === 目标包名` 的 package.json。
 *  起点是本文件自己 ⇒ 恒能命中本包；这与「从更新包向上找目标包」那种会断掉的起点不是一回事。
 *  真机两处布局都成立：Junction（`<profile>\node_modules\dsh-im-companion` → 本仓）与按版本号安装（真目录）。 */
export function ownPackage(): OwnPackage | null {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const manifest = readManifest(join(directory, 'package.json'))
    if (manifest && manifest.name === TARGET_PACKAGE_NAME) {
      return {
        directory: canonical(directory),
        version: typeof manifest.version === 'string' ? manifest.version : null,
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

/** 使用范围目录 = `<DSH_HOME>/profiles/<范围名>`（README §8 第 196 行的「使用范围」）。
 *  判定优先级：
 *  ① 显式范围名（配置/环境给的）；
 *  ② 本包 realpath 落在某个 `<profiles>/<名>/node_modules/` 之内 ⇒ 就是它（按版本号安装后的真身形态）；
 *  ③ 扫 `<profiles>/*` 找 `node_modules/<目标包>` 的 realpath 等于本包的那一支（今天 web 是 Junction 的形态，
 *     本包 realpath 在本仓、不在 profiles 下，只能这样认领）；
 *  ④ 都不中 ⇒ 与更新包自己的兜底同值 `profiles/web`（`dist/host.js:76`）。 */
export function resolveProfileDir(input: { dshHome: string; selfDir?: string | null; profileName?: string }): string {
  const home = canonical(input.dshHome)
  const profiles = join(home, 'profiles')
  if (typeof input.profileName === 'string' && input.profileName) return join(profiles, input.profileName)
  const self = input.selfDir ? canonical(input.selfDir) : null
  if (self) {
    const prefix = profiles + sep
    if (self.startsWith(prefix)) {
      const rest = self.slice(prefix.length).split(sep)
      if (rest.length >= 2 && rest[1] === 'node_modules') return join(profiles, rest[0])
    }
    try {
      for (const name of readdirSync(profiles).sort()) {
        if (canonical(join(profiles, name, 'node_modules', TARGET_PACKAGE_NAME)) === self) return join(profiles, name)
      }
    } catch {
      /* profiles 目录不存在：走兜底 */
    }
  }
  return join(profiles, 'web')
}
