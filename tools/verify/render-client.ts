// Real-React verification for dsh-im-companion lib/client.js（TypeScript，Node 直跑）
// 不写死任何机器路径：产物按仓库根解析，react 走模块解析（本仓 devDependency）——
// 别的开发者 clone 后 npm install 即可直接跑，换机器 / 换目录 / 换用户名都不受影响。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { createDocument, El } from './dom-shim.ts';

const REPO = process.cwd(); // npm run verify 自仓库根起跑（与其余 verify 脚本同一约定）
const req = createRequire(import.meta.url);
const code = readFileSync(join(REPO, 'lib', 'client.js'), 'utf8');

const doc = createDocument();
const win = {
  document: doc, __ModuleLoader__: null, navigator: { userAgent: 'node-shim' }, console,
  localStorage: { getItem: () => null, setItem: () => {} },
  alert: (m: string) => { (win as any).__alerts ||= []; (win as any).__alerts.push(String(m)); },
};
for (const name of ['HTMLElement','HTMLIFrameElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLAnchorElement','HTMLDivElement','HTMLSpanElement','HTMLStyleElement','HTMLLabelElement','HTMLTableElement']) {
  (win as Record<string, unknown>)[name] = El;
}
(doc as any).defaultView = win;
(globalThis as any).window = win;
(globalThis as any).document = doc;
try { (globalThis as any).navigator = win.navigator; } catch { /* read-only */ }

const React = req('react'); // 本仓 devDependency（package.json）
const ReactDOMClient = req('react-dom/client');

let loaded: { id: string; exports: any } | null = null;
(win as any).__ModuleLoader__ = {
  load({ id, factory }: { id: string; factory: (r: (name: string) => unknown) => unknown }) {
    loaded = { id, exports: factory((name: string) => {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOMClient;
      if (name === 'react-dom/client') return ReactDOMClient;
      throw new Error('unexpected require ' + name);
    }) as any };
  },
};

const sandbox = vm.createContext({
  ...win, window: win, document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  AbortSignal, navigator: {}, location: { protocol: 'http:', host: 'x' },
});
vm.runInContext(code, sandbox);

console.log('LOADED id =', loaded?.id);
console.log('inject =', JSON.stringify((loaded?.exports as any)?.inject));

const effects: (string | undefined)[] = [];
let registered: { opts: any; Comp: any } | null = null;
const ctx = {
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  effect(fn: () => unknown, name?: string) { effects.push(name); const d = fn(); if (typeof d === 'function') d(); },
  slots: {
    inject(_name: string, fn: () => unknown) { return fn(); },
    register(opts: any, Comp: any) { registered = { opts, Comp }; return () => {}; },
  },
  connection: { rpc: { call: async (ch: string) => {
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
    if (ch === '/weixin') {
      return { ok: true, value: {
        bots: [
          { botId: 'wx_1111', workspace: 'D:\\3DeepSeekHarness\\agents\\wechat', connected: true,
            health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 4 } },
        ],
        totals: { configured: 1, connected: 1 },
      } };
    }
    /* T5（#77）：旧 DSH 传输语义——未知路由传输层 reject（T1 verdict：立即拒识或 5s 超时），
     * 而非 ok:false（ok:false 是权威答复，dualTransportCallV2 永不回退）。
     * 本 mock 扮旧 DSH：新载体 /api 拒识 → 生产回退旧直调；自有桥 /im-companion 保持 ok:false。 */
    if (ch === '/im-companion') {
      return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '渠道未配置', details: {} } };
    }
    throw Object.assign(new Error('old DSH mock: no route for ' + ch), { code: 'RPC_NO_ROUTE' });
  } } },
  emit() {},
};
(loaded!.exports as any).apply(ctx);
console.log('registered label =', registered?.opts?.label());

const container = doc.createElement('div');
const root = ReactDOMClient.createRoot(container);
root.render(React.createElement(registered!.Comp, { ...(registered!.opts.inject?.() || {}) }));
await new Promise((resolve) => setTimeout(resolve, 300));
const text = (container as any).textContent as string;
console.log('---- rendered text (first 700) ----');
console.log(text.slice(0, 700));

const checks: [string, boolean][] = [
  ['顶部标题 IM机器人增强(#56)', text.includes('IM机器人增强')],
  ['英文副标 IM COMPANION(#56)', text.includes('IM COMPANION')],
  ['按助理 计数 (3)(#26)', text.includes('按助理 (3)')],
  ['按渠道 计数 (2)', text.includes('按渠道 (2)')],
  ['标题计数行收起(#26)', !text.includes('个机器人')],
  ['无按工作区(已砍)', !text.includes('按工作区')],
  ['渲染出内容(非空)', container.childNodes.length > 0 && !text.includes('还没有 Agent')],
  ['名字 Xiaoshuai', text.includes('Xiaoshuai')],
  ['名字 Xinghuo', text.includes('Xinghuo')],
  ['名字 Wechat', text.includes('Wechat')],
  ['无“未命名”', !text.includes('未命名')],
  ['在线状态', text.includes('在线')],
  ['离线状态', text.includes('离线')],
  ['渠道标签 飞书', text.includes('飞书')],
  ['渠道标签 微信', text.includes('微信')],
  ['接入按钮', text.includes('接入')],
  ['详情按钮(#26 ghost 同级)', text.includes('详情')],
  ['引流关联卡 P2(#26)', text.includes('作者其他插件')],
  ['版本号带品牌名(#78)', text.includes('IM Companion v')],
  ['兼容版本带标签(#78)', text.includes('兼容 dsh-im 4.17.1')],
  ['副标带角色(#78)', text.includes('IM COMPANION · 辅助插件')],
  ['页面干净-无解释词', !text.includes('解耦') && !text.includes('试验') && !text.includes('B1 ')],
  ['显示工作区绑定', text.includes('工作区·D:')],
];
for (const [name, ok] of checks) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
const allOk = checks.every(([, ok]) => ok);
console.log('==== ' + (allOk ? 'ALL PASS' : 'SOME FAIL') + ' ====');
process.exit(allOk ? 0 : 1);