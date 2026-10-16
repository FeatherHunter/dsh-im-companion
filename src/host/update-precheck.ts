/** #126 只读预检：开发态实装（Junction／越界目录）下更新中心**必然**回 `dev-source`。
 *
 * 根因（一手取证见 `docs/research/排查-更新中心unknown-profile根因.md`）：
 *   更新包的 `tryInferProfileDir` 用 `marker = sep + 'node_modules' + sep + 目标包名`、
 *   `dir.lastIndexOf(marker) > 0` 从**目标包 realpath** 反推「使用范围」；
 *   而 `resolveTargetPackage` 走的就是 realpath——
 *   开发态把本插件挂成 Junction（desktop profile → 本仓）时 realpath 落在仓库里，
 *   判据找不到 marker ⇒ 包抛开发态码。0.18.3 起是独立码 `dev-source`（#153），
 *   此前为 `unknown-profile`。真机按版本号安装不命中。
 *
 * 本模块只做两件事，且**只读**：判定当前实装形态 + 给一句人话结论。
 * 诚实性红线（`docs/research/验证-V3-T8桥诚实性与档位白名单.md` 的 P0 判据）：
 * 绝不把这次失败降级成成功、不隐藏红字、不用「已是最新」盖过去——失败照旧透传，
 * 这里只多留一行 resident 日志，让事后只看磁盘日志就能判「这红字是不是 bug」。
 *
 * 判据**必须与包同形**：本模块的职责是**预测包的判定**，不是自定第二套判据；
 * 包改判据而本仓照旧 ⇒ 会变成「日志说预期、面板说失败」的假解释。
 * 漂移由 `tools/verify/features/update-host.ts` 的 T7-3b 用**包的真行为**双向钉住
 * （真安装夹具 ⇒ 包 ok + 本仓 profile-install；越界夹具 ⇒ 包 dev-source + 本仓 dev-source）。
 */
import { sep } from 'node:path'
import { resolveTargetPackage } from 'dsh-plugin-update'

/** 与包内 `tryInferProfileDir` 逐字同形（含 `path.sep`：POSIX 下包用 `/`，本仓不许硬编码 `\`）。 */
export function installMarker(pkg: string): string {
  return sep + 'node_modules' + sep + String(pkg).split('/').join(sep)
}

/** marker 之前那段就是「使用范围」目录；认不出回 null（包据此抛 dev-source）。 */
export function inferProfileFromDir(dir: string, pkg: string): string | null {
  const at = dir.lastIndexOf(installMarker(pkg))
  return at > 0 ? dir.slice(0, at) : null
}

export interface InstallVerdict {
  /** profile-install＝按版本号装在使用范围内；dev-source＝开发态实装（预期不可用）；unknown＝解析不出目标包（未能归因）。 */
  mode: 'profile-install' | 'dev-source' | 'unknown'
  /** realpath 后的目标包目录。 */
  dir: string | null
  /** 判据切出来的使用范围目录（认不出即 null）。 */
  profileDir: string | null
  message: string
}

export function judgeInstallDir(dir: string | null, pkg: string): InstallVerdict {
  if (!dir) {
    /* 预检只在包已回开发态码（dev-source；旧版为 unknown-profile）之后跑 ⇒ 这里「判不出」本身就是一种结论：
     * 这次失败**没能归因**，不许写成「预期」（诚实口径）。 */
    return { mode: 'unknown', dir: null, profileDir: null, message: '目标包目录没解析出来：这次失败没能归因（不是「预期」）' }
  }
  const profileDir = inferProfileFromDir(dir, pkg)
  if (profileDir) {
    return { mode: 'profile-install', dir, profileDir, message: '按版本号装在使用范围内：更新中心可用' }
  }
  return {
    mode: 'dev-source', dir, profileDir: null,
    message: '开发态实装（Junction／越界目录）：更新中心预期回 dev-source，属预期而非缺陷（见 AGENTS.md「开发态实装」）',
  }
}

/** 只读解析目标包目录（真盘 realpath 口径，与包内同一条链）；任何异常都收敛成 unknown，不抛。 */
export async function precheckInstall(pkg: string): Promise<InstallVerdict> {
  try {
    const found = await resolveTargetPackage(pkg)
    return judgeInstallDir(found?.directory ?? null, pkg)
  } catch {
    return judgeInstallDir(null, pkg)
  }
}
