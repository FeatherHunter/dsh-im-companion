/** 调查取证脚本（T5 #110 更新面板空转）：不改仓内源码，只读。
 *
 * 目的：用「真实宿主桥 + 真实包面板」做 A/B 对照，证明 call 回包信封形状决定面板能否渲染。
 * 关键约束：宿主桥必须从 **profile 实装目录**加载（包按 import.meta.url 反推使用范围），
 *   故这里用绝对 file URL 显式加载该 profile 里的 dsh-plugin-update，而不是本仓 node_modules 那份。
 *
 * 跑法（本仓根目录）：node .local/diag/repro-panel-ab.mjs [profileName=desktop]
 * 期望：A（现状，直返 {ok,value:{…}}）= 面板停在「正在读取更新状态…」；
 *       B（先拆 value）= 面板正常显示使用范围/运行/磁盘/远端。
 */
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const profile = process.argv[2] ?? 'desktop'
const pkgDir = path.join(os.homedir(), '.dsh', 'profiles', profile, 'node_modules', 'dsh-plugin-update', 'dist')
const { createHostUpdate } = await import(pathToFileURL(path.join(pkgDir, 'host.js')).href)
const { mountUpdatePanel } = await import(pathToFileURL(path.join(pkgDir, 'panel.js')).href)
console.log('加载更新包自：' + pkgDir)

const bridge = createHostUpdate(
  { ctx: {}, logCtx: { fire: () => {} }, readerOverrides: { homeDir: path.join(os.homedir(), '.dsh') } },
  { pluginId: 'dsh-im-companion', prefix: 'imc', targetPackageName: 'dsh-im-companion' },
)

/** 与 src/host/update.ts 的 reply() 逐字同构：成功把包载荷原样放进 value。 */
function hostReply(pkgReply) {
  if (pkgReply && pkgReply.ok === true) return { ok: true, value: { ...pkgReply } }
  const token = typeof pkgReply?.error === 'string' && pkgReply.error ? pkgReply.error : 'internal'
  return { ok: false, error: { code: token, message: token, details: { errorKind: pkgReply?.errorKind ?? null, update: pkgReply } } }
}

const rawCall = async (name, args) => hostReply(await bridge.handlers[name](args ?? {}))
const unwrappedCall = async (name, args) => {
  const env = await rawCall(name, args)
  return env && env.ok === true && env.value !== undefined ? env.value : env
}

const fakeHost = () => ({
  _html: '',
  get innerHTML() { return this._html },
  set innerHTML(v) { this._html = String(v) },
  addEventListener() {},
  removeEventListener() {},
})

function probe(label, callImpl) {
  const host = fakeHost()
  const panel = mountUpdatePanel(host, { pluginId: 'dsh-im-companion', prefix: 'imc', mode: 'dialog', theme: 'default', call: callImpl })
  return new Promise((resolve) => {
    setTimeout(() => {
      const html = host.innerHTML
      const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      console.log('===== ' + label + ' =====')
      console.log('  停在「正在读取更新状态」: ' + html.includes('正在读取更新状态'))
      console.log('  首屏文案: ' + text.slice(0, 200))
      try { panel?.unmount?.() } catch { /* ignore */ }
      resolve()
    }, 400)
  })
}

await probe('A 现状：call 直返本仓信封 {ok,value:{…}}', rawCall)
await probe('B 对照：call 先拆 value（包期望的扁平载荷）', unwrappedCall)
process.exit(0)
