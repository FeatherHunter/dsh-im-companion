/** update-center 的常量出口（feature 内部只认这一个入口）。
 *
 * 分两类：
 * ① **派生常量**（三个电话名 + 两个轮询间隔）在 `./derived.ts`，由 `scripts/gen-update-constants.mjs`
 *    从**已安装的** `dsh-plugin-update` 生成（电话名两侧交叉核对，见生成器头注）。升级更新包时
 *    `npm run build` 会比对这份产物：pin 动了而这里没重生成 ⇒ 构建直接红，不靠人记得改。
 * ② **本仓自有常量**（桥载体、RPC 超时、版本说明数据源）就地声明，与更新包版本无关。
 */
export { UPD_CHECK, UPD_INSTALL, UPD_POLL, UPD_POLL_MIN, UPD_STATUS } from './derived'

/** 自有桥载体：与 src/client/data/meta.ts 的 HOST_CHANNEL 同值，此处再声明一份以保持特性自包含（不引私有模块）。 */
export const UPD_CHANNEL = '/im-companion'
/** 三通电话的单次超时（安装走子进程，给得比 status/check 宽）。 */
export const UPD_RPC_TIMEOUT = 30000
/** 版本说明数据源优先级：① raw.githubusercontent ② jsDelivr 镜像。禁用 github.com/.../raw/（跨域必失败）。 */
export const UPD_CHANGELOG_URLS = [
  'https://raw.githubusercontent.com/FeatherHunter/dsh-im-companion/master/CHANGELOG.md',
  'https://cdn.jsdelivr.net/gh/FeatherHunter/dsh-im-companion@master/CHANGELOG.md',
]
/** 拉版本说明的超时（直连会挂死，必须 AbortController 超时）。 */
export const UPD_CHANGELOG_TIMEOUT = 8000
