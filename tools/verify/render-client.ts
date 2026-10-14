// Real-React verification for dsh-im-companion lib/client.js（TypeScript，Node 直跑）
// 不写死任何机器路径：产物按仓库根解析，react 走模块解析（本仓 devDependency）——
// 别的开发者 clone 后 npm install 即可直接跑，换机器 / 换目录 / 换用户名都不受影响。
import { readFileSync, writeFileSync } from 'node:fs';
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
  requestAnimationFrame: (fn: any) => setTimeout(fn, 0), cancelAnimationFrame: (id: any) => clearTimeout(id),
});
vm.runInContext(code, sandbox);

console.log('LOADED id =', loaded?.id);
console.log('inject =', JSON.stringify((loaded?.exports as any)?.inject));

const effects: (string | undefined)[] = [];
let registered: { opts: any; Comp: any } | null = null;
/* 家/助理小表（内存镜像宿主 home-store 判重口径）：面板首读空表即种子迁移，故此处必须有真幂等语义，
 * 否则「首读→种子→回填」这条链在验证里跑不通（T6a 绿框真相源）。 */
const homeDb: { homes: any[]; assistants: any[] } = { homes: [], assistants: [] };
/* T11 #128：头像图片的「文件侧」内存镜像（真宿主落在 <配置目录>/avatars/<stem>.<ext>）。
 * 不补这三个端点，接线后客户端取图会被打成 unknown ep ⇒ 负缓存 ⇒ 真机看不到图。 */
const avatarFiles: Record<string, string> = {};
const rowOf = (id: string): any => homeDb.homes.find((x) => x.id === id) ?? homeDb.assistants.find((x) => x.id === id) ?? null;
const normP = (p: string) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase();
/* 宿主工作区名单（面板经 ctx.get('workspaces') 惰性读取；含一个无人之家以验「一区一家」）。 */
const workspaceItems = [
  { workspaceId: 'ws-1', path: 'D:\\agents\\xiaoshuai', title: '小帅窝', sessionIds: [] },
  { workspaceId: 'ws-2', path: 'D:\\agents\\xinghuo', title: '星火', sessionIds: [] },
  { workspaceId: 'ws-3', path: 'D:\\agents\\wechat', title: '', sessionIds: [] },
  { workspaceId: 'ws-4', path: 'D:\\agents\\empty', title: '空房间', sessionIds: [] },
];
function bridgeReply(ep: string, p: any): unknown {
  if (ep === 'home.list') return { ok: true, value: { homes: homeDb.homes, assistants: homeDb.assistants } };
  if (ep === 'home.create') {
    if (homeDb.homes.some((h) => normP(h.path) === normP(p?.path))) {
      return { ok: false, error: { code: 'already-exists', message: '家已存在', details: {} } };
    }
    const row = {
      id: 'h-' + (homeDb.homes.length + 1), workspaceId: p?.workspaceId ?? null, path: p?.path ?? '',
      name: p?.title ?? '', nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1,
    };
    homeDb.homes.push(row);
    return { ok: true, value: { home: row } };
  }
  if (ep === 'assistant.create') {
    if (homeDb.assistants.some((a) => a.channel === p?.channel && a.botId === p?.botId && a.status === 'bound')) {
      return { ok: false, error: { code: 'already-bound', message: '已绑定', details: {} } };
    }
    const row = {
      id: 'a-' + (homeDb.assistants.length + 1), homeId: p?.homeId ?? '', channel: p?.channel ?? '',
      botId: p?.botId ?? null, status: 'bound', name: p?.botName || p?.homeText || '', nameSource: p?.botName ? 'bot' : 'home',
      avatar: null, avatarSource: 'default', createdAt: 1, boundAt: 1,
    };
    homeDb.assistants.push(row);
    return { ok: true, value: { assistant: row } };
  }
  if (ep === 'home.seed') {
    const mapped: any[] = [];
    for (const r of p?.homes ?? []) {
      const hit = homeDb.homes.find((h) => normP(h.path) === normP(r.path) || (h.workspaceId && h.workspaceId === r.workspaceId));
      if (hit) { mapped.push(hit); continue; }
      const row = { ...r, createdAt: 1, updatedAt: 1 };
      homeDb.homes.push(row); mapped.push(row);
    }
    const outA: any[] = [];
    for (const a of p?.assistants ?? []) {
      if (homeDb.assistants.some((x) => x.botId === a.botId && x.channel === a.channel)) continue;
      const row = { ...a, createdAt: 1, boundAt: 1 };
      homeDb.assistants.push(row); outA.push(row);
    }
    return { ok: true, value: { homes: mapped, assistants: outA } };
  }
  /* T6b #114：改名/配图/占位/绑定/删除（内存镜像同口径：user 冻结、avatar 1-6、一对一、删行不断连）。 */
  if (ep === 'home.update') {
    const h = homeDb.homes.find((x) => x.id === p?.id);
    if (!h) return { ok: false, error: { code: 'not-found', message: '家不存在', details: {} } };
    if (p?.name !== undefined) {
      const t = String(p.name ?? '').trim().slice(0, 64);
      if (t) { h.name = t; h.nameSource = 'user'; } else { h.name = ''; h.nameSource = 'system'; }
    }
    if (p?.avatar !== undefined) {
      if (p.avatar === null) { h.avatar = null; h.avatarSource = 'default'; }
      else if (/^[1-6]$/.test(String(p.avatar))) { h.avatar = String(p.avatar); h.avatarSource = 'user'; }
      else return { ok: false, error: { code: 'bad-request', message: 'avatar 非法', details: {} } };
    }
    return { ok: true, value: { home: h } };
  }
  if (ep === 'assistant.update') {
    const a = homeDb.assistants.find((x) => x.id === p?.id);
    if (!a) return { ok: false, error: { code: 'not-found', message: '助理不存在', details: {} } };
    if (p?.name !== undefined) {
      const t = String(p.name ?? '').trim().slice(0, 64);
      if (t) { a.name = t; a.nameSource = 'user'; } else { a.name = ''; a.nameSource = a.botId ? 'bot' : 'home'; }
    }
    if (p?.avatar !== undefined) {
      if (p.avatar === null) { a.avatar = null; a.avatarSource = 'default'; }
      else if (/^[1-6]$/.test(String(p.avatar))) { a.avatar = String(p.avatar); a.avatarSource = 'user'; }
      else return { ok: false, error: { code: 'bad-request', message: 'avatar 非法', details: {} } };
    }
    return { ok: true, value: { assistant: a } };
  }
  if (ep === 'assistant.createUnbound') {
    if (!p?.homeId || !p?.channel) return { ok: false, error: { code: 'bad-request', message: 'homeId/channel 必填', details: {} } };
    const t = String(p.name ?? '').trim().slice(0, 64);
    const row = {
      id: 'a-' + (homeDb.assistants.length + 1), homeId: p.homeId, channel: p.channel,
      botId: null, status: 'unbound', name: t, nameSource: t ? 'user' : 'home',
      avatar: null, avatarSource: 'default', createdAt: Date.now(), boundAt: null,
    };
    homeDb.assistants.push(row);
    return { ok: true, value: { assistant: row } };
  }
  if (ep === 'assistant.bind') {
    const a = homeDb.assistants.find((x) => x.id === p?.id);
    if (!a) return { ok: false, error: { code: 'not-found', message: '助理不存在', details: {} } };
    if (a.status === 'bound') return { ok: false, error: { code: 'bad-request', message: '已绑定', details: {} } };
    if (homeDb.assistants.some((x) => x.id !== a.id && x.botId === p?.botId && x.channel === p?.channel && x.status === 'bound')) {
      return { ok: false, error: { code: 'already-bound', message: '已被绑定', details: {} } };
    }
    a.channel = p.channel; a.botId = p.botId; a.status = 'bound'; a.boundAt = 1;
    return { ok: true, value: { assistant: a } };
  }
  if (ep === 'assistant.remove') {
    const i = homeDb.assistants.findIndex((x) => x.id === p?.id);
    if (i < 0) return { ok: false, error: { code: 'not-found', message: '助理不存在', details: {} } };
    homeDb.assistants.splice(i, 1);
    return { ok: true, value: {} };
  }
  /* T11 #128：头像图片三端点（内存镜像宿主 home-avatar 的形状：`img:<stem>.<ext>` 标记 ＋ 文件另存）。
   * 值域口径不变：`home.update`/`assistant.update` 仍只收 1-6，图片只走 avatar.set。 */
  if (ep === 'avatar.get') {
    const ids = Array.isArray(p?.ids) ? p.ids.map((x: unknown) => String(x ?? '')) : [];
    const images: Record<string, string> = {};
    for (const id of ids) if (id && avatarFiles[id]) images[id] = avatarFiles[id];
    return { ok: true, value: { images } };
  }
  if (ep === 'avatar.set') {
    const id = String(p?.id ?? '');
    const row = rowOf(id);
    if (!row) return { ok: false, error: { code: 'not-found', message: '没有这行（家/助理）：' + id, details: {} } };
    const url = String(p?.dataUrl ?? '');
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m) return { ok: false, error: { code: 'bad-request', message: '图片格式不支持（只收 png/jpg/webp 的 data URL）', details: {} } };
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const marker = 'img:' + id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) + '.' + ext;
    avatarFiles[id] = url;
    row.avatar = marker; row.avatarSource = 'user';
    return { ok: true, value: { row, avatar: marker } };
  }
  if (ep === 'avatar.clear') {
    const id = String(p?.id ?? '');
    const row = rowOf(id);
    if (!row) return { ok: false, error: { code: 'not-found', message: '没有这行（家/助理）：' + id, details: {} } };
    delete avatarFiles[id];
    row.avatar = null; row.avatarSource = 'default';
    return { ok: true, value: { row } };
  }
  return { ok: false, error: { code: 'bad-request', message: 'unknown ' + ep, details: {} } };
}
const ctx = {
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  effect(fn: () => unknown, name?: string) { effects.push(name); const d = fn(); if (typeof d === 'function') d(); },
  get(name: string) {
    if (name !== 'workspaces') return undefined;
    return {
      list: {
        getSnapshot: () => ({ items: workspaceItems }),
        /* T10 #124：建家＝「选目录 → DSH 建工作区」⇒ 夹具的 workspaces 服务要真能 create（adoptDirectory 走真实现）。 */
        create: async (input: { path: string }) => {
          const path = String(input?.path ?? '');
          const hit = workspaceItems.find((w: any) => w.path === path);
          if (hit) return { ok: true, value: { workspace: hit, created: false } };
          const row = { workspaceId: 'ws-new', path, title: '新房间', sessionIds: [] };
          workspaceItems.push(row);
          return { ok: true, value: { workspace: row, created: true } };
        },
      },
    };
  },
  /* 原生选择器：给一个还不是工作区的目录（T10 #124：建家永远是新建工作区）。 */
  uiWorkspace: { pickDirectory: async () => 'D:\\agents\\newroom' },
  slots: {
    inject(_name: string, fn: () => unknown) { return fn(); },
    register(opts: any, Comp: any) { registered = { opts, Comp }; return () => {}; },
  },
  connection: { rpc: { call: async (ch: string, ep?: string, p?: any) => {
    if (ch === '/feishu') {
      return { ok: true, value: {
        schemaVersion: 2, revision: 3, state: 'connected',
        bots: [
          { botId: 'bot_aaaa', workspace: 'D:\\agents\\xiaoshuai', connected: true, bot: { name: '小帅·飞书' },
            health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 1 } },
          { botId: 'bot_bbbb', workspace: 'D:\\agents\\xiaoshuai', connected: true, bot: { name: '小帅·微信' },
            health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 2 } },
          { botId: 'bot_cccc', workspace: 'D:\\agents\\xinghuo', connected: false, bot: { name: '星火·飞书' },
            health: { status: 'offline', summary: '尚未连接', lastCheckedAt: 3 } },
          { botId: 'bot_free', workspace: '', connected: false, bot: { name: '待认领·飞书' },
            health: { status: 'offline', summary: '尚未连接', lastCheckedAt: 5 } },
        ],
        totals: { configured: 4, connected: 2 },
      } };
    }
    if (ch === '/weixin') {
      return { ok: true, value: {
        bots: [
          { botId: 'wx_1111', workspace: 'D:\\agents\\wechat', connected: true, bot: { name: '微信小号' },
            health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 4 } },
        ],
        totals: { configured: 1, connected: 1 },
      } };
    }
    /* T6a 自有桥：家/助理端点走内存小表（list 首读空 → 面板种子 → seed 幂等回填）；其余端点沿用旧答复。 */
    if (ch === '/im-companion') {
      if (ep === 'home.list' || ep === 'home.seed' || ep === 'home.create' || ep === 'assistant.create'
        || ep === 'home.update' || ep === 'assistant.update' || ep === 'assistant.createUnbound'
        || ep === 'assistant.bind' || ep === 'assistant.remove') return bridgeReply(ep, p);
      return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '渠道未配置', details: {} } };
    }
    /* T5（#77）：旧 DSH 传输语义——未知路由传输层 reject（T1 verdict：立即拒识或 5s 超时），
     * 而非 ok:false（ok:false 是权威答复，dualTransportCallV2 永不回退）。
     * 本 mock 扮旧 DSH：新载体 /api 拒识 → 生产回退旧直调。 */
    throw Object.assign(new Error('old DSH mock: no route for ' + ch), { code: 'RPC_NO_ROUTE' });
  } } },
  emit() {},
};
(loaded!.exports as any).apply(ctx);
console.log('registered label =', registered?.opts?.label());

const container = doc.createElement('div');
const root = ReactDOMClient.createRoot(container);
root.render(React.createElement(registered!.Comp, { ...(registered!.opts.inject?.() || {}) }));
await new Promise((resolve) => setTimeout(resolve, 600));
const l1Text = (container as any).textContent as string;
console.log('---- L1 rendered text (first 700) ----');
console.log(l1Text.slice(0, 700));

/* DOM 真序列化（dom-shim 的 innerHTML 只是桩：不递归、不带属性，故自己走一遍节点树）。
 * 断言与预览共用同一份序列化：结构断言不依赖 RC_DUMP 是否设置。 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VOID_TAGS = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK']);
const ser = (n: any): string => {
  if (!n) return '';
  if (n.nodeType === 3) return esc(String(n.textContent ?? ''));
  const name = String(n.nodeName || n.tagName || '').toLowerCase();
  if (!name) return '';
  let attrs = '';
  for (const [k, v] of (n.attributes ?? new Map<string, string>())) {
    if (String(k).toLowerCase() === 'class') continue;
    attrs += ' ' + k + '="' + esc(String(v)) + '"';
  }
  /* dom-shim 把 className 收在 classList 里（不进 attributes）——漏了它整页就没样式。 */
  const cls = n.classList && typeof n.classList.toString === 'function' ? String(n.classList.toString()).trim() : '';
  if (cls) attrs = ' class="' + esc(cls) + '"' + attrs;
  const tagUp = String(n.nodeName || '').toUpperCase();
  if ((tagUp === 'INPUT' || tagUp === 'TEXTAREA' || tagUp === 'SELECT') && n._value) attrs += ' value="' + esc(String(n._value)) + '"';
  const st = n._style && Object.keys(n._style).length
    ? ' style="' + esc(Object.entries(n._style).map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + String(v)).join(';')) + '"'
    : '';
  const kids = (n.childNodes ?? []).map(ser).join('');
  if (VOID_TAGS.has(name.toUpperCase())) return '<' + name + attrs + st + '>';
  return '<' + name + attrs + st + '>' + kids + '</' + name + '>';
};
/* 客户端自己注入的样式（installFeatureStyles 挂进 head）——断言「绿框样式表已装」用。 */
const injectedCss = ((doc as any).head?.childNodes ?? [])
  .map((n: any) => String(n?.textContent ?? '')).filter((s: string) => s.trim()).join('\n');

/* 视觉预览导出（只在 RC_DUMP 设了路径时才写）：把**真面板**的 DOM＋客户端自己注入的样式落成一个
 * 自包含 HTML，交给真浏览器渲染后截图，用于人工目验布局（非真机；真机仍须在 DSH 里刷新验收）。 */
function dumpHtml(tag: string): { file: string; dom: string } | null {
  const out = process.env.RC_DUMP;
  if (!out) return null;
  const file = out.replace(/\.html$/i, '') + '-' + tag + '.html';
  const dom = ser(container);
  const html = '<!doctype html><meta charset="utf-8"><title>IM机器人增强 · ' + tag + ' 预览</title>\n'
    + '<style>body{margin:0;padding:18px;background:#f5f6f8;font-family:"Microsoft YaHei",sans-serif}'
    + '.wrap{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e6eb;border-radius:12px;padding:10px 12px}</style>\n'
    + '<style>' + injectedCss + '</style>\n'
    + '<div class="wrap">' + dom + '</div>\n';
  writeFileSync(file, html, 'utf8');
  console.log('DUMP ' + file + '（样式 ' + injectedCss.length + ' 字节，DOM ' + html.length + ' 字节）');
  return { file, dom };
}
dumpHtml('l1');
const l1Dump = ser(container);
const css = injectedCss;
const seededHomes = homeDb.homes.length;
const seededAssts = homeDb.assistants.length;

/* ===== 三级钻取（T4 认可款 proto-studio 结构）：点行进下一级，不是展开树 ===== */
const q1 = (sel: string) => (container as any).querySelector?.(sel) ?? null;
const all = (sel: string) => (container as any).querySelectorAll(sel) as any[];
const rows = () => all('.hu-row');
const homeRows = () => rows().filter((n) => n.getAttribute('data-open') === 'L2');
const asstRows = () => rows().filter((n) => n.getAttribute('data-open') === 'L3');
const crumbs = () => all('.hu-crumb');
const crumbList = () => crumbs().map((n) => String(n.textContent).replace(/\s+/g, ''));
const click = (el: any, what: string) => { if (!el) throw new Error('点不到：' + what); el.dispatchEvent({ type: 'click' }); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 90));
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
const popHost = () => (((doc as any).body.childNodes as any[]) || []).find((n) => n.classList?.contains('hu-pophost')) ?? null;
const popNode = () => popHost()?.querySelector?.('.hu-pop') ?? null;
const popBtn = (label: string) => popNode()?.querySelectorAll('.hu-pbtn-s')?.find((b: any) => String(b.textContent).trim() === label) ?? null;

if (homeRows().length !== 3) throw new Error('L1 活跃家行数应为 3，实际 ' + homeRows().length + '（0 助理的家应折叠进尾部）');
const moreRow = q1('.hu-more-row');
const moreText = String(moreRow?.textContent ?? '');
if (!moreText.includes('1 个空家')) throw new Error('L1 空家折叠行缺失，实际：' + moreText);
const plannedL1 = all('.hu-ract').filter((b: any) => b.classList.contains('planned')).length;
const plannedAria = all('.hu-ract').filter((b: any) => b.classList.contains('planned')).every((b: any) => b.getAttribute('aria-disabled') === 'true');
const avatarOf = (row: any): string => String(row?.querySelector?.('.hu-av')?.textContent ?? '');
const avatar0 = avatarOf(homeRows()[0]);
const avatarWe = avatarOf(homeRows().find((r: any) => String(r.textContent).includes('wechat')));
const l1Head = String(q1('.hu-ttl')?.textContent ?? '');
const l1Foot = String(q1('.hu-pbtn')?.textContent ?? '');
const l1CrumbList = crumbList();
const l1HomeCount = homeRows().length;
/* 面板动作簇：装配层交进绿框页头的四枚动作（船 / 串门搬家 / 配置 / 刷新）+ 页头自己的 ＋。 */
const headActs = all('.hu-head-acts').length;
const l1HeadActBtns = all('.hu-head-acts')[0]?.childNodes?.filter((n: any) => n.nodeType === 1).length ?? 0;
const l1Snap = l1Text;
console.log('---- L1 head ---- ' + l1Head);
console.log('---- L1 crumbs ---- ' + l1CrumbList.join(' | '));

/* L1 → L2：点第一家（小帅窝，2 位助理） */
click(homeRows()[0], 'L1 家行 #0');
await tick();
const l2Text = String((container as any).textContent ?? '');
const l2Head = String(q1('.hu-ttl')?.textContent ?? '');
const l2Asst = asstRows().length;
const l2Foot = String(q1('.hu-pbtn')?.textContent ?? '');
const l2Crumbs = crumbList().join(' | ');
dumpHtml('l2');

/* L2 → L3：点第一位助理（钻取详情，不是展开） */
click(asstRows()[0], 'L2 助理行 #0');
await tick();
const l3Text = String((container as any).textContent ?? '');
const detail = q1('.hu-detail');
const detailCls = detail ? String(detail.className ?? '') : '';
const acts = all('.hu-abtn');
const enabledActs = acts.filter((b) => !b.hasAttribute('disabled')).map((b) => String(b.textContent).trim());
const disabledActs = acts.filter((b) => b.hasAttribute('disabled')).map((b) => String(b.textContent).trim());
const l3Foot = String(q1('.hu-pbtn')?.textContent ?? '');
const l3Head = String(q1('.hu-ttl')?.textContent ?? '');
const l3Soon = String(q1('.hu-soon')?.textContent ?? '');
dumpHtml('l3');

/* 头部返回键（T4 verdict：返回方式＝头部返回键 / 点 TAB 的上级） */
click(q1('.hu-back'), '返回键');
await tick();
const afterBack = !!q1('.hu-detail');
click(crumbs().find((n) => n.getAttribute('data-goto') === 'L1'), '面包屑 L1 章');
await tick();
const backToL1 = homeRows().length === 3 && !!q1('.hu-more-row');

/* 空家（第 4 家 ws-4 无 bot ⇒ 原型空态文案）：默认收在「N 个空家」折叠段里（呈现策略），
 * 先点折叠行展开，再钻进去。 */
click(q1('.hu-more-row'), 'L1「1 个空家」折叠行');
await tick();
const l1ExpandedText = String((container as any).textContent ?? '');
const l1ExpandedRows = homeRows().length;
click(homeRows()[3], 'L1 家行 #3（空家）');
await tick();
const emptyText = String((container as any).textContent ?? '');
const emptyBox = q1('.hu-empty');
dumpHtml('l4');
click(q1('.hu-back'), '返回键（空家回 L1）');
await tick();

/* 建家（T10 #124：锚定 popover → 选目录 → DSH 建区＋等投影 → 落家）：目录还不是工作区 ⇒ 收养后落家 */
const beforeHomes = homeDb.homes.length;
click(q1('.hu-pbtn'), 'L1 底部「新建家」');
await tick();
const popHome = popNode();
const popHomeText = String(popHome?.textContent ?? '');
const popHomeOpts = popHome ? popHome.querySelectorAll('.hu-opt').length : 0;
if (popHomeOpts !== 0) throw new Error('T10 #124 后建家弹层不该再有候选列表：' + popHomeText);
click(popBtn('选择目录'), '建家弹层「选择目录」');
await settle();
click(popBtn('创建'), '建家弹层「创建」');
await settle();
const afterHomes = homeDb.homes.length;
const createdHome = homeDb.homes.find((h: any) => h.workspaceId === 'ws-new');
const l2AfterHome = String(q1('.hu-ttl')?.textContent ?? '');
dumpHtml('l5');
if (!createdHome) throw new Error('建家没写入家表：opts=' + popHomeOpts + ' popText=' + popHomeText + ' homes=' + JSON.stringify(homeDb.homes.map((h: any) => h.workspaceId)));
if (!q1('.hu-back')) throw new Error('建家后没落到 L2：head=' + l2AfterHome + ' body=' + String((container as any).textContent).slice(0, 120));

/* 建助理（锚定 popover）：回第一家 ⇒ L2 底部主操作 ⇒ 选空闲机器人 bot_free */
click(q1('.hu-back'), '返回键（新家回 L1）');
await tick();
click(homeRows()[0], 'L1 家行 #0（回小帅窝）');
await tick();
const beforeAssts = homeDb.assistants.length;
click(q1('.hu-pbtn'), 'L2 底部「新建助理」');
await tick();
const popAsst = popNode();
const popAsstText = String(popAsst?.textContent ?? '');
const popAsstOpts = popAsst ? popAsst.querySelectorAll('.hu-opt').length : 0;
const popAsstDisabled = popAsst ? popAsst.querySelectorAll('.hu-opt').filter((b: any) => b.hasAttribute('disabled')).length : 0;
click(popBtn('创建'), '建助理弹层「创建」');
await settle();
const afterAssts = homeDb.assistants.length;
const l3AfterAsst = !!q1('.hu-detail');
dumpHtml('l6');
if (afterAssts === beforeAssts) throw new Error('建助理没写入助理表：opts=' + popAsstOpts + ' disabled=' + popAsstDisabled + ' popText=' + popAsstText);

/* 建助理·以后再绑（T6b #114 未绑定占位点击级）：点选「以后再绑」→ assistant.createUnbound → 落未绑行 → 进该助理 L3 */
click(q1('.hu-back'), '返回键（回 L2）');
await tick();
const beforeUnbound = homeDb.assistants.length;
click(q1('.hu-pbtn'), 'L2 底部「新建助理」');
await tick();
const popLater = popNode();
const laterOpt = popLater?.querySelectorAll('.hu-opt')?.find((b: any) => b.getAttribute('data-value') === '') ?? null;
if (!laterOpt || laterOpt.hasAttribute('disabled')) throw new Error('「以后再绑」选项不可点');
click(laterOpt, '建助理弹层「以后再绑」');
await tick();
click(popBtn('创建'), '建助理弹层「创建」（未绑定占位）');
await settle();
const afterUnbound = homeDb.assistants.length;
const unboundRow = homeDb.assistants.find((a: any) => a.status === 'unbound' && !a.botId);
const l3UnboundText = String((container as any).textContent ?? '');
const l3UnboundFoot = String(q1('.hu-pbtn')?.textContent ?? '');
dumpHtml('l7');
if (afterUnbound !== beforeUnbound + 1 || !unboundRow) throw new Error('以后再绑没写入未绑行：' + JSON.stringify(homeDb.assistants.map((a: any) => [a.id, a.status, a.botId])));

/* #82 两色胶囊：值由构建从 package.json 注入，故断言按真相源推导，
 * 不在测试里再抄一份版本号（宿主 / 上游换版本时这里自动跟随）。
 * 宿主胶囊已删（用户裁定 2026-10-01）：此处断言它**不在**渲染文本里。 */
const pkg: any = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
const pluginVersion: string = pkg?.version ?? '';
const dshImCompatVerified: string = pkg?.dshImCompat?.verified ?? '';
const dshCompatVerified: string = pkg?.dshCompat?.verified ?? '';

const checks: [string, boolean][] = [
  ['顶部标题 IM机器人增强(#56)', String((container as any).textContent).includes('IM机器人增强')],
  /* 上部区域定稿（owner 裁定 2026-10-13）：搜索框与「按助理 / 按渠道」分段退场，
   * 三个面板动作（船 / 串门搬家 / 刷新）并进绿框页头右侧。 */
  ['搜索框与分段已退场（上部只留标题行 + 绿框页头）', !l1Text.includes('按助理 (') && !l1Text.includes('按渠道 (')],
  ['面板动作簇在绿框页头里（船 / 串门搬家 / 配置 / 刷新 4 枚）', headActs === 1 && l1HeadActBtns === 4],
  ['无按工作区(已砍)', !l1Text.includes('按工作区')],
  ['页头 家 + N 个 · 每个家对应一个工作区（原型 fhead）', l1Head.includes('家') && l1Head.includes('4 个 · 每个家对应一个工作区')],
  ['L1 面包屑三级 chip（L1 家 / L2 助理 · … / L3 机器人 · …）', l1CrumbList.length === 3 && l1CrumbList[0].includes('L1家') && l1CrumbList[1].includes('L2助理') && l1CrumbList[2].includes('L3机器人')],
  ['L1 家名（工作区标题回落）', l1Text.includes('小帅窝')],
  ['L1 家名（空标题回落目录基名）', l1Text.includes('wechat')],
  ['L1 空家折叠（0 助理的家收尾部，可达性不丢）', moreText.includes('1 个空家') && l1HomeCount === 3],
  ['L1 展开后可见空家与 0 位助理', l1ExpandedRows === 4 && l1ExpandedText.includes('空房间') && l1ExpandedText.includes('0 位助理')],
  ['头像字形：CJK 单字 / 拉丁两词首字母（dsh-* 不再全是 d）', avatar0 === '小' && avatarWe === 'WE'],
  ['L1 行动作已启用（T6b #114：重命名/更多不再 planned）', plannedL1 === 0],
  ['L1 助理计数（N 位助理）', l1Text.includes('2 位助理')],
  ['L1 命名回落来源行（原型 sub）', l1Text.includes('跟随工作区名') && l1Text.includes('跟随目录名')],
  ['L1 助理清单行（原型 names）', l1Text.includes('助理：')],
  ['L1 在线汇总（N 个在线 / 全部离线；0 助理不再重复一枚）', l1Text.includes('2 个在线') && l1Text.includes('全部离线') && !l1Text.includes('没有助理') && !l1Text.includes('还没有助理')],
  ['L1 无“未命名”', !l1Text.includes('未命名')],
  ['L1 家行 3 枚（钻取锚点 data-open=L2）', l1HomeCount === 3],
  ['L1 底部主操作＝新建家（随层）', l1Foot.includes('新建家')],
  ['点家行进入 L2（钻取，非展开树）', l2Asst === 2],
  ['L2 页头标题＝家名', l2Head.includes('小帅窝')],
  ['L2 页头副标＝回落来源 · N 位助理', l2Head.includes('跟随工作区名 · 2 位助理')],
  ['L2 面包屑当前层在 L2', l2Crumbs.includes('L2小帅窝')],
  ['L2 助理行两枚（一对一不合并）', l2Asst === 2],
  ['L2 渠道标签 飞书', l2Text.includes('飞书')],
  ['L2 已绑状态章', l2Text.includes('已绑')],
  ['L2 行内接入钮常显（旧能力继承）', l2Text.includes('接入')],
  ['L2 底部主操作＝新建助理（随层）', l2Foot.includes('新建助理')],
  ['L3 详情卡存在（原型 .detail）', !!detail],
  ['L3 详情卡不继承列表行 hover 隐藏', !detailCls.includes('hu-row') && !detailCls.includes('af-row')],
  ['L3 机器人 id 与只接一个渠道', l3Text.includes('bot_aaaa') && l3Text.includes('只接一个渠道')],
  ['L3 命名链三段（你取的名/机器人名/家名）', l3Text.includes('你取的名') && l3Text.includes('机器人名') && l3Text.includes('家名')],
  ['L3 页头标题＝助理名 + 副标回落来源', l3Head.includes('跟随机器人名')],
  ['L3 行动作启用集＝接入,详情,改名·头像,删除助理,换工作区,移除渠道（T6c 实做）', enabledActs.join(',') === '接入,详情,改名·头像,删除助理,换工作区,移除渠道'],
  ['L3 待实现清单退场（#115 落地，无假按钮）', l3Soon === '' && disabledActs.length === 0],
  ['L3 底部主操作＝返回助理列表（已绑）', l3Foot.includes('返回助理列表')],
  ['头部返回键回 L2', afterBack === false],
  ['面包屑 L1 章回 L1', backToL1],
  ['空家空态卡（原型 .empty）', !!emptyBox && emptyText.includes('这个家还没有助理')],
  ['建家弹层＝锚定 popover（非底部弹窗）', !!popHome && popHomeText.includes('新建家')],
  ['建家弹层＝选目录支路（T10 #124 分段退场）', popHomeOpts === 0 && popHomeText.includes('选中的目录会建成 DSH 工作区')],
  ['建家写入家表（4→5）', beforeHomes === 4 && afterHomes === 5],
  ['建家后落到新家的 L2', l2AfterHome.includes('新房间')],
  ['建助理弹层含空闲机器人与可用「以后再绑」（T6b 占位）', popAsstOpts >= 2 && popAsstText.includes('待认领·飞书') && popAsstText.includes('以后再绑') && popAsstDisabled === 0],
  ['建助理写入助理表（4→5）', beforeAssts === 4 && afterAssts === 5],
  ['建助理后落到该助理 L3 详情', l3AfterAsst],
  ['建助理·以后再绑写入未绑行（无号不占号）', afterUnbound === beforeUnbound + 1 && !!unboundRow && unboundRow.boundAt === null],
  ['建助理·以后再绑落到该助理 L3 未绑详情', l3UnboundText.includes('还没绑机器人') && l3UnboundFoot.includes('绑定机器人')],
  ['旧 A1 列表行 DOM 已退出绿框', !l1Dump.includes('af-row') && !l1Dump.includes('af-actions')],
  ['绿框样式表已装（.home-ui 命名空间 + hu- 前缀）', css.includes('.home-ui .hu-row') && css.includes('.home-ui .hu-detail') && css.includes('.home-ui .hu-pop')],
  ['引流关联卡 P2(#26)', String((container as any).textContent).includes('作者其他插件')],
  ['自家版本胶囊 紫(#82)', pluginVersion !== '' && String((container as any).textContent).includes('v' + pluginVersion)],
  ['上游胶囊 dsh-im(#82)', dshImCompatVerified !== '' && String((container as any).textContent).includes('dsh-im ' + dshImCompatVerified)],
  ['宿主胶囊已删(2026-10-01)', dshCompatVerified === '' || !String((container as any).textContent).includes('dsh ' + dshCompatVerified)],
  ['副标已删(#82)', !String((container as any).textContent).includes('IM COMPANION · 辅助插件')],
  ['页面干净-无解释词', !String((container as any).textContent).includes('解耦') && !String((container as any).textContent).includes('试验')],
  ['家表经种子落盘（一区一家 4 行）', seededHomes === 4],
  ['助理经种子落盘（有归属 4 枚）', seededAssts === 4],
  ['种子不建未绑定行（空 workspace 不进表，T6b 占位只走显式创建）', homeDb.assistants.filter((a: any) => !a.botId).length === 1 && !!unboundRow],
];
for (const [name, ok] of checks) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
const allOk = checks.every(([, ok]) => ok);
console.log('==== ' + (allOk ? 'ALL PASS' : 'SOME FAIL') + ' ====');
process.exit(allOk ? 0 : 1);

