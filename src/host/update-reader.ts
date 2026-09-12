/** 更新系统宿主侧（T7 #90）：**自有读取器**，替换更新包的 `readInstalledReal`。
 *
 * 为什么必须替换（R3 实测坐实，`docs/research/审查-R3-风险报告核心结论证伪.md`）：
 * 上游 `readInstalledReal` 用 `containingPackage` 的 walk-up 结果算 `sameLoadedPackage`
 * （`dist/reader.js:147-152`）。按版本号安装后 walk-up 恒 `null` ⇒ 指纹永不绑定
 * ⇒ `blockedReason = installation-changed` ⇒ `env.eligible` 恒假
 * ⇒ 快照 `canInstall` 恒假（`dist/service.js:218-219`）⇒ **一键安装按钮永不出现**。
 * 只注入 `runningVersion` 治不了（R3 L1 实测：仍 `installation-changed`）。
 *
 * 本读取器自答上游结果对象的**全部 10 个字段**（`dist/reader.js:104-165` 的对象字面量是 10 个键；
 * 真身核查与 T4 写的「9 字段」少算了 `environmentKind`——实测为准）。判据两条**逐字照抄上游**：
 * - `sourceInstall = !registrySpec(范围清单里本包说明符) || !inside(范围目录/node_modules, 已装目录)`
 *   （`dist/reader.js:144`）——**只有真 `link:`/`file:`/`workspace:` 或实装目录越界才给 `source-install`**；
 * - `blockedReason` 顺序 `invalid-installation → source-install → pending-restart`（`:157-161`），
 *   不接 `installation-changed` 那两条（那两条是本读取器要消掉的东西）。
 * `registrySpec` / `validVersion` / `profileNameValid` 直接用包根导出，避免把上游判据抄成第二个真相。
 */
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { profileNameValid, registrySpec } from 'dsh-plugin-update'

/** 上游 env 结果的完整形状（10 字段）——下游 `dist/service.js` 的 `buildSnapshot`/`install` 全量消费它。 */
export interface UpdateEnv {
  profileName: string | null
  environmentKind: string
  homeDir: string | null
  profileDir: string | null
  installedVersion: string | null
  packageValid: boolean
  sourceInstall: boolean
  blockedReason: string | null
  installationKey: string | null
  eligible: boolean
}

/** 读盘端口：生产走 node:fs，verify 换内存假盘（真 fs 依赖本机布局，断言不可移植）。 */
export interface UpdateReaderFs {
  realpath(target: string): Promise<string>
  readText(filename: string): Promise<string>
  isFile(filename: string): Promise<boolean>
}

export const nodeUpdateReaderFs: UpdateReaderFs = {
  realpath: (target) => realpath(target),
  readText: (filename) => readFile(filename, 'utf8'),
  isFile: async (filename) => {
    try { return (await stat(filename)).isFile() } catch { return false }
  },
}

export interface UpdateReaderOptions {
  /** 使用范围目录（**绝对路径**；由 `update-paths.ts` 定，不依赖上游 inferProfileDir 的 web 硬兜底）。 */
  profileDir: string
  /** 本插件**运行**版本（构建期/装配期从本包 package.json 读出，见 `update-paths.ts` 的 `ownPackage`）。 */
  runningVersion: string
  pluginId: string
  targetPackageName: string
  homeDir: string
  /** `detectEnvironmentKind(ctx)` 的结果（web profile 为 `cli`）。 */
  environmentKind: string
  fs?: UpdateReaderFs
}

/** 与上游 `validVersion` 同义（`dist/service.js:15-17`）。
 *  **包根没有导出它**（真身核查的 17 个导出里没有 `validVersion`，它只从 `dist/service.js` 出），
 *  故这里自持一份——只有一行正则，比引子路径 `dsh-plugin-update/dist/service.js` 可靠（子路径被 `exports` 拦）。 */
function validVersion(value: unknown): boolean {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value)
}

/** 与上游 `inside` 同义（`dist/reader.js:10-13`）：子路径不在目录内即 false。 */
function inside(directory: string, filename: string): boolean {
  const suffix = relative(directory, filename)
  return suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix)
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? input as Record<string, unknown> : null
}

function parseManifest(text: string): Record<string, unknown> | null {
  try { return asRecord(JSON.parse(text)) } catch { return null }
}

/** 上游 `validPackage` 的一环（`dist/reader.js:53-69`）：入口必须是包内真实文件。 */
async function entryIsFile(
  manifest: Record<string, unknown>, directory: string, entry: unknown, fs: UpdateReaderFs,
): Promise<boolean> {
  if (typeof entry !== 'string' || !entry || isAbsolute(entry) || entry.includes('\0')) return false
  const filename = resolve(directory, entry)
  if (!inside(directory, filename)) return false
  let target: string
  try { target = await fs.realpath(filename) } catch { return false }
  // 上游 `dist/reader.js:57-63`：解出来的真身也必须在包内（软链/联接指到包外不算包内入口）——realpath 后复判一次。
  if (!inside(directory, target)) return false
  return fs.isFile(target)
}

/** 上游 `validPackage` 同义（`dist/reader.js:46-70`）：包名对得上、版本三段、三个入口都在包内且是文件。 */
async function selfValid(
  manifest: Record<string, unknown> | null, directory: string, targetName: string, fs: UpdateReaderFs,
): Promise<boolean> {
  if (!manifest || manifest.name !== targetName || !validVersion(manifest.version)) return false
  const entries = [
    manifest.main,
    asRecord(manifest.exports)?.['./client'],
    asRecord(manifest.dsh)?.bundle ? asRecord(asRecord(manifest.dsh)!.bundle)?.patch : undefined,
  ]
  for (const entry of entries) {
    if (!await entryIsFile(manifest, directory, entry, fs)) return false
  }
  return true
}

/** 空壳结果：任何一条早退路径都回它 + 一个 `blockedReason`，形状与上游逐字段一致。 */
function emptyEnv(environmentKind: string): UpdateEnv {
  return {
    profileName: null,
    environmentKind,
    homeDir: null,
    profileDir: null,
    installedVersion: null,
    packageValid: false,
    sourceInstall: false,
    blockedReason: null,
    installationKey: null,
    eligible: false,
  }
}

/** 读一次环境。调用点：每次 status/check/install，上游同样每次都重读（`dist/service.js:231,245,300`）。 */
export async function readUpdateEnv(options: UpdateReaderOptions): Promise<UpdateEnv> {
  const fs = options.fs ?? nodeUpdateReaderFs
  const env = emptyEnv(options.environmentKind)
  const profileName = options.profileDir ? options.profileDir.split(/[\\/]/).filter(Boolean).pop() ?? '' : ''
  // 与上游同序（`dist/reader.js:117-122`）：**先**把（可能非法的）原名写上，再判合法性回 `unknown-profile`。
  env.profileName = profileName
  if (!profileNameValid(profileName)) {
    env.blockedReason = 'unknown-profile'
    return env
  }
  if (!validVersion(options.runningVersion)) {
    // 运行版本读不出（构建期没注入、包根 package.json 缺 version）：不能判 pending-restart，诚实报 unknown-profile。
    env.blockedReason = 'unknown-profile'
    return env
  }
  let homeDir: string
  let profileDir: string
  try {
    homeDir = await fs.realpath(options.homeDir)
    profileDir = await fs.realpath(options.profileDir)
  } catch {
    env.blockedReason = 'unknown-profile'
    return env
  }
  env.homeDir = homeDir
  env.profileDir = profileDir
  let profileText: string
  let installedDir: string
  let installedText: string
  try {
    profileText = await fs.readText(join(profileDir, 'package.json'))
    installedDir = await fs.realpath(join(profileDir, 'node_modules', options.targetPackageName))
    installedText = await fs.readText(join(installedDir, 'package.json'))
  } catch {
    env.blockedReason = 'invalid-installation'
    return env
  }
  const profileManifest = parseManifest(profileText)
  const installedManifest = parseManifest(installedText)
  if (!profileManifest || !installedManifest) {
    env.blockedReason = 'invalid-installation'
    return env
  }
  const spec = asRecord(profileManifest.dependencies)?.[options.targetPackageName]
  // 上游 `dist/reader.js:144` 两个判据：说明符不是版本号/范围 → 源安装；实装目录越出 <范围>/node_modules → 源安装。
  env.sourceInstall = !registrySpec(spec) || !inside(join(profileDir, 'node_modules'), installedDir)
  env.installedVersion = typeof installedManifest.version === 'string' ? installedManifest.version : null
  env.packageValid = await selfValid(installedManifest, installedDir, options.targetPackageName, fs)
  // 指纹：只要磁盘那三样（范围清单、实装目录、实装清单）不变就稳定——check 存下它、install 再比对（`dist/service.js:252,309`）。
  try {
    env.installationKey = createHash('sha256').update(JSON.stringify(
      [options.pluginId, profileDir, profileText, installedDir, installedText],
    )).digest('hex')
  } catch {
    env.installationKey = null
  }
  env.blockedReason = !env.packageValid
    ? 'invalid-installation'
    : env.sourceInstall
      ? 'source-install'
      : env.installedVersion !== options.runningVersion
        ? 'pending-restart'
        : null
  env.eligible = !env.blockedReason
  return env
}
