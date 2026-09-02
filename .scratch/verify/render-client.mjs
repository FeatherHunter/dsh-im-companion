// Real-React verification for dsh-im-companion lib/client.js
// Loads the ModuleLoader bundle in a vm with react/react-dom from DSH checkout,
// applies it with a fake ctx, renders the registered settings.section component
// through real ReactDOM.createRoot, then asserts the DOM contains FleetPanel cards.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createDocument, El } from './dom-shim.mjs';

const BASE = 'D:/0Tools/DSH Desktop/resources/app.asar.unpacked/node_modules';
const req = createRequire(import.meta.url);
const code = readFileSync('D:/dsh-plugin/dsh-im-companion/lib/client.js', 'utf8');

const doc = createDocument();
const win = { document: doc, __ModuleLoader__: null, navigator: { userAgent: 'node-shim' }, console, localStorage: { getItem: () => null, setItem: () => {} }, alert: (m) => { (win.__alerts ||= []).push(String(m)); } };
// ReactDOM dev-mode touches several win.HTML*Element constructors.
for (const name of ['HTMLElement','HTMLIFrameElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLAnchorElement','HTMLDivElement','HTMLSpanElement','HTMLStyleElement','HTMLLabelElement','HTMLTableElement','HTMLElement']) win[name] = El;
doc.defaultView = win;
// Make ReactDOM see a DOM on the host process globals (it checks window/document at import).
globalThis.window = win;
globalThis.document = doc;
try { globalThis.navigator = win.navigator; } catch { /* read-only in node */ }
const React = req(BASE + '/react');
const ReactDOMClient = req(BASE + '/react-dom/client');

let loaded = null;
win.__ModuleLoader__ = {
  load({ id, factory }) {
    loaded = { id, exports: factory((name) => {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOMClient;
      if (name === 'react-dom/client') return ReactDOMClient;
      throw new Error('unexpected require ' + name);
    }) };
  },
};

const sandbox = vm.createContext({ ...win, window: win, document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval, AbortSignal, navigator: { }, location: { protocol: 'http:', host: 'x' } });
vm.runInContext(code, sandbox);

console.log('LOADED id =', loaded.id);
console.log('exports =', Object.keys(loaded.exports));
const mod = loaded.exports;
console.log('inject =', JSON.stringify(mod.inject));

const effects = [];
let registered = null;
const ctx = {
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  effect(fn, name) { effects.push(name); const d = fn(); if (typeof d === 'function') d(); },
  slots: {
    inject(name, fn) { return fn(); },
    register(opts, Comp) { registered = { opts, Comp }; return () => {}; },
  },
  connection: { rpc: { call: async (ch, ep) => {
      // Realistic envelope per dsh-im unwrapRpcResult
      if (ch === '/feishu') {
        return { ok: true, value: {
          schemaVersion: 2, revision: 3, state: 'connected',
          bots: [
            { botId: 'bot_aaaa', workspace: 'D:\\3DeepSeekHarness\\agents\\xiaoshuai', connected: true,
              health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 1 } },
            { botId: 'bot_bbbb', workspace: 'D:\\3DeepSeekHarness\\agents\\xiaoshuai', connected: true,
              health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 2 } },
            { botId: 'bot_cccc', workspace: 'D:\\3DeepSeekHarness\\agents\\xinghuo', connected: false,
              health: { status: 'offline', summary: '尚未连接', lastCheckedAt: 3 } },
          ],
          totals: { configured: 3, connected: 2 },
        } };
      }
      return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '渠道未配置', details: {} } };
    } } },
  emit() {},
};
mod.apply(ctx);
console.log('effects =', effects.join(','));
console.log('registered opts =', JSON.stringify(registered.opts));
console.log('label() =', registered.opts.label());

// --- Real React render of the registered component ---
const container = doc.createElement('div');
let renderError = null;
try {
  const root = ReactDOMClient.createRoot(container);
  root.render(React.createElement(registered.Comp, { ...(registered.opts.inject?.()||{}) }));
  await new Promise((resolve) => setTimeout(resolve, 120));
} catch (e) { renderError = e; }
if (renderError) {
  console.log('RENDER ERROR:', renderError.message);
  console.log('STACK:', (renderError.stack||'').split('\n').slice(0,6).join('\n'));
  process.exit(1);
}
const text = container.textContent;
console.log('---- rendered text (first 700) ----');
console.log(text.slice(0, 700));
const checks = [
  ['顶部标题 Agent', text.includes('Agent')],
  ['顶部新建按钮', text.includes('＋ 新建') || text.includes('新建')],
  ['按Agent 计数', text.includes('按Agent (')],
  ['按渠道 胶囊', text.includes('按渠道')],
  ['按工作区 胶囊', text.includes('按工作区')],
  ['渲染出内容(非空)', container.childNodes.length > 0],
  ['页面干净-无解释词', !text.includes('解耦外挂') && !text.includes('Host: dsh-im-companion') && !text.includes('真数据') && !text.includes('流程：')],
  ['页面干净-无 10项清单', !text.includes('10项试验清单')],
  ['页面干净-无 B1~E4卡', !text.includes('B1 左侧工作区徽标') && !text.includes('E4 拟人化Home')],
];
for (const [name, ok] of checks) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
const extra = [
  ['A1 家-xiaoshuai', text.includes('xiaoshuai')],
  ['A1 家-xinghuo', text.includes('xinghuo')],
  ['A1 在线状态点', text.includes('在线')],
];
for (const [name, ok] of extra) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
const allOk = checks.every(([, ok]) => ok) && extra.every(([, ok]) => ok);
console.log('==== ' + (allOk ? 'ALL PASS' : 'SOME FAIL') + ' ====');
process.exit(allOk ? 0 : 1);
