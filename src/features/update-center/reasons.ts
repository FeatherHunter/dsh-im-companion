/** update-center 阻塞原因层（DOM-free）：更新包 known 码表（13 条）的中文文案 + 手工命令门。
 * 注：`registry-conflict` 在更新包产物中**无赋值路径、实际不可达**——保留它是防御性设计
 * （上游将来若赋此值，本仓照译不误；这里不因「测不到」就删掉一条表项）。 */
import type { PhoneResult, UpdateFailure } from './phone'

interface ReasonSpec { text: string; command: boolean }
export const REASONS: Record<string, ReasonSpec> = {
  'unknown-profile': { text: '认不出当前的使用范围，请把使用范围名或目录修好后再看更新。', command: false },
  'source-install': { text: '当前是从源码安装的，想走更新请先按版本号重装一次。', command: false },
  'invalid-installation': { text: '已安装的包不完整，请用下面的命令重装当前版本后再检查。', command: true },
  'installation-changed': { text: '运行中的版本与磁盘上装好的版本不一致；重启宿主后即生效。', command: true },
  'pending-restart': { text: '新版已装好，重启宿主后生效（这不是失败）。', command: true },
  'registry-conflict': { text: '使用范围的清单里那一行不是版本号，改成版本号后重试。', command: true },
  'incompatible-node': { text: '新版要求更高的 Node，请先升级 Node 到 22 或更高再检查。', command: true },
  'recovery-required': { text: '上次安装被打断，请重新点一次安装；一直出现就按更新包文档排错。', command: true },
  /* ↓ 下面五条来自更新包 `dist/host.js` 的 known 码表（共 13 条）中、档案 §B 当时未覆盖的部分。
   * 起因：T10 真机「点安装」失败，reason=`check-expired`，而表里没有它 ⇒ 落到「未知的安装阻塞」兜底，用户看不懂。
   * `check-expired` 是更新包的**泛化码**：既表示「检查快照过期」，也表示「请求凭证（requestId）不合法」，
   * 故文案只讲面板能自救的那一面（重新检查），不复述包的内部语义。 */
  'check-expired': { text: '检查结果已过期（或缺请求凭证），请重新检查后再安装。', command: false },
  'update-busy': { text: '另一次安装还在进行中，稍等片刻再试。', command: false },
  'check-failed': { text: '检查更新失败（网络或官方源暂时不可达），请稍后重试。', command: false },
  'invalid-release': { text: '官方源上的版本信息不完整，这一版暂时装不了。', command: false },
  'install-failed': { text: '安装没成功，请重试；一直失败就用下面的手工命令。', command: true },
}
/** 认不出的原因码照原样露出来（宁可见到生 token，也不谎报「未知错误」）。 */
export function reasonText(reason: string | null): string {
  if (!reason) return ''
  return REASONS[reason]?.text ?? ('遇到未知的安装阻塞（' + reason + '），请按更新包文档排错。')
}
/** 这两种情况给不出可用命令（显示小字说明，绝不自行拼命令）。 */
export function noCommandOf(reason: string | null): boolean {
  return reason !== null && REASONS[reason] !== undefined && REASONS[reason].command === false
}
/** 命令只在 manual 非空时展示；manual 为空时绝不自行拼命令。 */
export function commandOf(res: PhoneResult | null): string | null {
  const manual = res !== null && res.ok ? res.manual : null
  return typeof manual === 'string' && manual.trim() !== '' ? manual : null
}
/** 手动检查失败的瞬时提示（§D.4）：宿主原话优先，其次档案 §B 的中文原因，再没有才兜底。
 * 注意 toast **不**替代面板：`autoCheck` 灰字槽仍只由自动检查失败驱动（手动失败不得写进那一槽）。 */
export function manualFailText(res: UpdateFailure): string {
  const why = res.message !== null && res.message !== '' ? res.message
    : (res.token !== null ? (REASONS[res.token]?.text ?? res.token) : null)
  return why === null ? '检查更新失败，请稍后重试' : '检查更新失败：' + why
}
