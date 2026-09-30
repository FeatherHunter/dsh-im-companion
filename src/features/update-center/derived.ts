/** 本文件由 scripts/gen-update-constants.mjs 生成，**人手不改**（要改请改生成器或更新包）。
 *
 * 来源：dsh-plugin-update@0.2.0 的 buildPhoneNames(imc) 与 dist/client.js 的 CLIENT_POLL
 * （宿主侧与客户端侧的电话名已交叉核对一致）。重新生成：npm run gen:update-constants
 *
 * 为什么是生成而不是运行期取值：客户端源码一旦 import 更新包，会被 tsdown 整个内联进单文件浏览器产物
 * （tsdown.config.ts 的 alwaysBundle 白名单之外一律内联）。
 */
export const UPD_STATUS = 'imc.updateStatus'
export const UPD_CHECK = 'imc.updateCheck'
export const UPD_INSTALL = 'imc.updateInstall'
export const UPD_POLL = 1000
export const UPD_POLL_MIN = 250
