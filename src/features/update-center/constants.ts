/** update-center 常量（冻结值 · 不在运行期派生）。
 * 出处：dsh-plugin-update@0.1.1 的 derive-client-values.mjs 派生结果；
 * 已用包真身核对：buildPhoneNames('imc') 与 CLIENT_POLL。
 * 本仓 exact pin 0.1.1，故常量冻结；派生过程**不进 npm run check**（check 必须任何机器可跑，先例 #80）。 */
export const UPD_STATUS = 'imc.updateStatus'
export const UPD_CHECK = 'imc.updateCheck'
export const UPD_INSTALL = 'imc.updateInstall'
export const UPD_POLL = 1000
export const UPD_POLL_MIN = 250

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
