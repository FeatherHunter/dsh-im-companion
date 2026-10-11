/** #120 取证：真渲染 lib/client.js，验「更新按钮在 star 左侧」。
 * 跑法（本仓根目录）：node .local/diag/verify-header-order.mjs
 * 输出 .af-hd-right 的子节点顺序 + #imc-update-center 与 a.af-star 的先后关系。 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import vm from 'node:vm'
import { createDocument, El } from '../../tools/verify/dom-shim.ts'

const REPO = process.cwd()
const req = createRequire(import.meta.url)
const code = readFileSync(join(REPO, 'lib', 'client.js'), 'utf8')

const doc = createDocument()
const win = {
  document: doc, __ModuleLoader__: null, navigator: { userAgent: 'node-shim' }, console,
  localStorage: { getItem: () => null, setItem: () => {} }, alert: () => {},
}
for (const name of ['HTMLElement', 'HTMLIFrameElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLStyleElement', 'HTMLLabelElement', 'HTMLTableElement']) {
  win[name] = El
}
doc.defaultView = win
globalThis.window = win
globalThis.document = doc

const React = req('react')
const ReactDOMClient = req('react-dom/client')

let loaded = null
win.__ModuleLoader__ = {
  load({ id, factory }) {
    loaded = { id, exports: factory((name) => {
      if (name === 'react') return React
      if (name === 'react-dom') return ReactDOMClient
      if (name === 'react-dom/client') return ReactDOMClient
      throw new Error('unexpected require ' + name)
    }) }
  },
}

const sandbox = vm.createContext({
  ...win, window: win, document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  AbortSignal, navigator: {}, location: { protocol: 'http:', host: 'x' },
})
vm.runInContext(code, sandbox)

let registered = null
const ctx = {
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  effect(fn) { const d = fn(); if (typeof d === 'function') d() },
  slots: {
    inject(_name, fn) { return fn() },
    register(opts, Comp) { registered = { opts, Comp }; return () => {} },
  },
  connection: { rpc: { call: async (ch) => {
    if (ch === '/feishu' || ch === '/weixin' || ch === '/qq' || ch === '/slack' || ch === '/telegram' || ch === '/discord' || ch === '/whatsapp' || ch === '/dingtalk' || ch === '/wecom') {
      return { ok: true, value: { bots: [], totals: { configured: 0, connected: 0 } } }
    }
    return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '渠道未配置', details: {} } }
  } } },
  emit() {},
}
loaded.exports.apply(ctx)

const container = doc.createElement('div')
ReactDOMClient.createRoot(container).render(React.createElement(registered.Comp, { ...(registered.opts.inject?.() || {}) }))
await new Promise((r) => setTimeout(r, 400))

const hdRight = container.querySelector('.af-hd-right')
if (!hdRight) { console.log('FAIL：没找到 .af-hd-right'); process.exit(1) }
const kids = Array.from(hdRight.childNodes || []).filter((n) => n.nodeType === 1)
const describe = (el) => {
  const cls = el.getAttribute?.('class') ?? el.className ?? ''
  const id = el.getAttribute?.('id') ?? el.id ?? ''
  return `<${(el.tagName || '').toLowerCase()}${id ? ' id=' + id : ''}${cls ? ' class=' + cls : ''}>`
}
console.log('=== .af-hd-right 子节点顺序（左 → 右）===')
kids.forEach((k, i) => console.log(`  ${i + 1}. ${describe(k)}`))

const hostIdx = kids.findIndex((k) => (k.getAttribute?.('id') ?? k.id) === 'imc-update-center')
const starIdx = kids.findIndex((k) => String(k.getAttribute?.('class') ?? k.className ?? '').includes('af-star'))
console.log('=== 判定 ===')
console.log('  更新挂载点 idx =', hostIdx, '| star idx =', starIdx)
console.log('  挂载点在 star 左侧 =', hostIdx >= 0 && starIdx >= 0 && hostIdx < starIdx)
const hostEl = hostIdx >= 0 ? kids[hostIdx] : null
const inner = hostEl ? String(hostEl.innerHTML ?? '') : ''
console.log('  挂载点内已挂包按钮 =', inner.includes('dsh-upd-entry'), '| 长度 =', inner.length)
console.log('  root 里不再有旧位置 =', !Array.from(container.querySelectorAll('.af-root > *')).some((n) => (n.getAttribute?.('id') ?? '') === 'imc-update-center'))
process.exit(hostIdx >= 0 && starIdx >= 0 && hostIdx < starIdx ? 0 : 1)
