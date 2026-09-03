// B3 真机前渲染验证：对构建产物 lib/client.js 跑 Real-React，断言 Header 槽位三态。
// settings.section 不碰（render-client.ts 覆盖）；本文件只覆盖新增的 header.utilities 注册。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createDocument, El } from '../dom-shim.ts';

const REPO = process.cwd();
const UNPACKED = process.env.DSH_DESKTOP_UNPACKED ?? 'D:/0Tools/DSH Desktop/resources/app.asar.unpacked';
const BASE = UNPACKED + '/node_modules';
const req = createRequire(import.meta.url);
import { join as joinPath } from 'node:path';
const code = readFileSync(joinPath(REPO, 'lib/client.js'), 'utf8');

const W1 = 'D:\\agents\\xiaoshuai';
const W2 = 'D:\\agents\\dsh-im';

const doc = createDocument();
const win = {
  document: doc, __ModuleLoader__: null, navigator: { userAgent: 'node-shim' }, console,
  localStorage: { getItem: () => null, setItem: () => {} },
  alert: () => {},
  CustomEvent: class { type: string; detail: unknown; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
  dispatchEvent: () => true,
};
for (const name of ['HTMLElement','HTMLIFrameElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLAnchorElement','HTMLDivElement','HTMLSpanElement','HTMLStyleElement','HTMLLabelElement','HTMLTableElement']) {
  (win as Record<string, unknown>)[name] = El;
}
(doc as any).defaultView = win;
(globalThis as any).window = win;
(globalThis as any).document = doc;
try { (globalThis as any).navigator = win.navigator; } catch { /* read-only */ }

const React = req(BASE + '/react');
const ReactDOMClient = req(BASE + '/react-dom/client');

let loaded: { id: string; exports: any } | null = null;
(win as any).__ModuleLoader__ = {
  load({ id, factory }: { id: string; factory: (r: (name: string) => unknown) => unknown }) {
    loaded = { id, exports: factory((name: string) => {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOMClient;
      if (name === 'react-dom/client') return ReactDOMClient;
      if (name === 'react/jsx-runtime') return req(BASE + '/react/jsx-runtime');
      throw new Error('unexpected require ' + name);
    }) as any };
  },
};

const sandbox = vm.createContext({
  ...win, window: win, document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  AbortSignal, navigator: {}, location: { protocol: 'http:', host: 'x' },
});
vm.runInContext(code, sandbox);

const regs: { opts: any; Comp: any }[] = [];
const disposers: (() => void)[] = [];
const rpcCall = async (ch: string) => {
  if (ch === '/feishu') {
    return { ok: true, value: { bots: [
      { botId: 'bot_aaaa', workspace: W1, connected: true,
        health: { status: 'healthy', summary: 'ok', lastCheckedAt: 1000 } },
    ] } };
  }
  if (ch === '/dsh-im-delivery') return { ok: true, value: { botId: 'bot_aaaa', channel: 'feishu', targets: [] } };
  return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '渠道未配置', details: {} } };
};
const ctx = {
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  effect(fn: () => unknown) { try { const d = fn() as unknown; if (typeof d === 'function') disposers.push(d as () => void); } catch { /* ignore */ } return () => {}; },
  get(name: string) {
    if (name === 'workspaces') {
      return { list: { getSnapshot: () => ({ items: [
        { workspaceId: 'ws-1', path: W1, title: 'xiaoshuai', sessionIds: ['sess-aaa'] },
        { workspaceId: 'ws-2', path: W2, title: 'dsh-im', sessionIds: ['sess-bbb'] },
      ] }) } };
    }
    throw new Error('unexpected service ' + name);
  },
  slots: {
    inject(_name: string, fn: () => unknown) { return fn(); },
    register(opts: any, Comp: any) { regs.push({ opts, Comp }); return () => {}; },
  },
  connection: { rpc: { call: rpcCall } },
  emit() {},
};
(loaded!.exports as any).apply(ctx);

const checks: [string, boolean][] = [];
const header = regs.find((r) => String(r.opts?.id ?? '').includes('b3-header'));
checks.push(['header 槽位已注册', !!header]);
checks.push(['样式含呼吸 keyframes（防回归）', code.includes('@keyframes b3-header-breathe') && code.includes('b3-header-dotbtn')]);
checks.push(['header 槽名正确', header?.opts?.name === 'conversation.session.header.utilities']);
checks.push(['settings 面板注册未受影响', regs.some((r) => r.opts?.name === 'settings.section')]);

async function renderSession(sessionId: string): Promise<{ text: string; btn: any }> {
  const container = doc.createElement('div');
  const root = ReactDOMClient.createRoot(container);
  root.render(React.createElement((header as any).Comp, { sessionId }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const text = (container as any).textContent as string;
  // 注：shim 下 React 经 setAttribute('class') 写类（不同步 classList），故按 attribute 查找。
  const findByClass = (node: any, cls: string): any => {
    if (!node || !node.childNodes) return null;
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      const attr = (typeof c.getAttribute === 'function' ? c.getAttribute('class') : '') ?? '';
      if (String(attr).split(/\s+/).includes(cls)) return c;
      const deep = findByClass(c, cls);
      if (deep) return deep;
    }
    return null;
  };
  const btn = findByClass(container, 'b3-header-dotbtn');
  root.unmount();
  return { text, btn };
}

const full = await renderSession('sess-aaa');
checks.push(['full 态渲染呼吸点', !!full.btn]);
checks.push(['full 态标题带 Agent', String(full.btn?.getAttribute?.('title') ?? '').includes('xiaoshuai')]);
checks.push(['full 态标题带在线', String(full.btn?.getAttribute?.('title') ?? '').includes('在线')]);

const unbound = await renderSession('sess-bbb');
checks.push(['unbound 态渲染呼吸点', !!unbound.btn]);
checks.push(['unbound 态标题未绑定', String(unbound.btn?.getAttribute?.('title') ?? '').includes('未绑定')]);

const hidden = await renderSession('sess-???');
checks.push(['hidden 态零渲染', !hidden.btn && hidden.text === '']);

for (const [name, ok] of checks) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
for (const d of disposers) { try { d(); } catch { /* ignore */ } }
const allOk = checks.every(([, ok]) => ok);
console.log('==== ' + (allOk ? 'ALL PASS' : 'SOME FAIL') + ' ====');
process.exit(allOk ? 0 : 1);
