// 诊断复现：对 lib/client.js 真实 apply，派发 open-drawer，看抽屉 DOM。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { join as joinPath } from 'node:path';
import { createDocument, El } from '../tools/verify/dom-shim.ts';

const REPO = process.cwd();
const UNPACKED = process.env.DSH_DESKTOP_UNPACKED ?? 'D:/0Tools/DSH Desktop/resources/app.asar.unpacked';
const BASE = UNPACKED + '/node_modules';
const req = createRequire(import.meta.url);
const code = readFileSync(joinPath(REPO, 'lib/client.js'), 'utf8');
const W1 = 'D:\\agents\\xiaoshuai';

const doc: any = createDocument();
const listeners = new Map<string, Set<Function>>();
const win: any = {
  document: doc, __ModuleLoader__: null, navigator: { userAgent: 'node-shim' }, console,
  localStorage: { getItem: () => null, setItem: () => {} },
  alert: () => {},
  innerWidth: 1600, innerHeight: 900,
  requestAnimationFrame: (fn: any) => setTimeout(fn, 0),
  CustomEvent: class { type: string; detail: unknown; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
  addEventListener: (t: string, fn: Function) => {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(fn);
  },
  removeEventListener: (t: string, fn: Function) => { listeners.get(t)?.delete(fn); },
  dispatchEvent: (e: any) => {
    for (const fn of [...(listeners.get(e?.type) ?? [])]) { try { (fn as Function)(e); } catch (err) { console.log('LISTENER-ERR', String(err)); } }
    return true;
  },
};
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLStyleElement']) win[name] = El;
(doc as any).defaultView = win;
(globalThis as any).window = win;
(globalThis as any).document = doc;

const React = req(BASE + '/react');
const ReactDOMClient = req(BASE + '/react-dom/client');
let loaded: any = null;
win.__ModuleLoader__ = {
  load({ id, factory }: any) {
    loaded = { id, exports: factory((name: string) => {
      if (name === 'react') return React;
      if (name === 'react-dom/client') return ReactDOMClient;
      throw new Error('unexpected require ' + name);
    }) };
  },
};
const sandbox = vm.createContext({ ...win, window: win, document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval, AbortSignal, navigator: {}, location: { protocol: 'http:', host: 'x' } });
vm.runInContext(code, sandbox);

const FAKE_META = { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
const rpcCall = async (ch: string, ep: string) => {
  if (ch === '/feishu' && ep === 'connection.status') {
    return { ok: true, value: { bots: [{ botId: 'b1', workspace: W1, connected: true, health: { status: 'healthy', lastCheckedAt: 1 } }] } };
  }
  if (ch === '/im-companion' && ep === 'ping') return { ok: true };
  if (ch === '/im-companion' && ep === 'meta.get') return { ok: true, value: FAKE_META };
  throw new Error('down:' + ch + '/' + ep);
};
const ctx: any = {
  effect: (fn: any) => { const d = fn(); return d; },
  slots: { inject: (_n: string, fn: any) => fn(), register: (o: any, c: any) => ({ o, c }) },
  connection: { rpc: { call: rpcCall } },
};
loaded.exports.apply(ctx);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const snapshot = (): string => vm.runInContext(`(() => {
  const out = [];
  const walk = (n, d) => {
    if (!n || d > 5) return;
    out.push((n.tagName || '?') + '.' + (n.className || ''));
    for (const k of n.childNodes || []) walk(k, d + 1);
  };
  walk(document.body, 0);
  return JSON.stringify({ kids: document.body.childNodes.length, tree: out.slice(0, 30) });
})()`, sandbox) as string;

console.log('T+0 immediate dispatch (race window):');
vm.runInContext(`window.dispatchEvent(new window.CustomEvent('dsh-im-companion:open-drawer', { detail: { key: ${JSON.stringify(W1)} } }))`, sandbox);
await sleep(400);
console.log(snapshot());
console.log('T+400 dispatch again (data present):');
vm.runInContext(`window.dispatchEvent(new window.CustomEvent('dsh-im-companion:open-drawer', { detail: { key: ${JSON.stringify(W1)} } }))`, sandbox);
await sleep(400);
console.log(snapshot());
console.log('DONE');
process.exit(0);
