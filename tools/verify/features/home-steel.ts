// T6a 钢线自验证（绿框真相源版）：建家选已有区 + 建助理绑机器人 + 三级命名回落 + 种子迁移（node --test）。
// 只测外部行为：给定绑定关系与动作 → 用户可见结论（展示名、分组、1:1 拒绝、一种植一种），不断言内部字段名。
// 绿框呈现（T4 认可款原型 DOM）走**真渲染**：DOM 桩 + tsc 现转译的 panel-body，点出来的 DOM 才算数。
import { mkdtempSync, readFileSync, symlinkSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, El } from '../dom-shim.ts';

const REPO = process.cwd();
const CLIENT = join(REPO, 'src', 'client');
const COMP = join(CLIENT, 'components');
const HOST = join(REPO, 'src', 'host');
const ENTRIES = [
  join(CLIENT, 'data', 'home-model.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'home-steel-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction');
} catch { /* 已存在跳过 */ }
const req = createRequire(join(tmp, 'run.cjs'));
const model: any = req('./home-model.js');

// —— 宿主 home-store 单独转译（真文件 IO，盘换临时目录） ——
const tmpHost = mkdtempSync(join(tmpdir(), 'home-steel-host-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(HOST, 'home-store.ts'),
    join(HOST, 'rpc.ts'),
    '--ignoreConfig',
    '--outDir', tmpHost, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('HOST-TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const reqHost = createRequire(join(tmpHost, 'run.cjs'));
const homeStore: any = reqHost('./home-store.js');

/* —— 绿框渲染链单独转译：真 panel-body 渲染（DOM 桩），让「呈现」这条断言点的是真 DOM 而不是源码文本 —— */
const tmpBox = mkdtempSync(join(tmpdir(), 'home-steel-box-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(COMP, 'panel-body.ts'),
    '--ignoreConfig',
    '--outDir', tmpBox, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('BOX-TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmpBox, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }

/* 渲染路径裸用 document/window（dom.ts）：先铺 node 侧 DOM 桩再 require（home-degrade 同款手法）。 */
const domDoc: any = createDocument();
const domWin: any = {
  document: domDoc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'home-steel' },
  CustomEvent: class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail } },
  dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {},
};
domDoc.defaultView = domWin;
for (const n of ['HTMLElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLStyleElement', 'Node', 'Element']) domWin[n] = El;
(globalThis as any).window = domWin;
(globalThis as any).document = domDoc;
try { (globalThis as any).localStorage = domWin.localStorage; } catch { /* read-only 忽略 */ }
/* 呈现层若在模块顶自开轮询，真计时器会吊住事件循环 ⇒ 整套挂死而不是报错。
   换成记账假计时器：让「自开轮询」变成一条能读到名字的断言失败（解耦那条会读 intervalCalls）。 */
const intervalCalls: string[] = [];
(globalThis as any).setInterval = ((fn: any, ms?: any) => { intervalCalls.push(String(ms ?? '')); return 0 }) as any;
const boxReq = createRequire(join(tmpBox, 'run.cjs'));
/* tsc 的推断 rootDir 随 import 图变：两种落点都试，避免换一次 import 就 ENOENT。 */
const bodyMod: any = (() => {
  try { return boxReq('./components/panel-body.js'); } catch { return boxReq('./panel-body.js'); }
})();

const H = (o: any) => ({ id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting', name: '客厅', nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1, ...o });
const A = (o: any) => ({ id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小帅', nameSource: 'bot', avatar: null, avatarSource: 'default', createdAt: 1, boundAt: 1, ...o });
const W = (o: any) => ({ workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅', ...o });
const B = (o: any) => ({ channel: 'feishu', botId: 'b1', workspace: 'D:\\agents\\keting', botName: '小帅', ...o });

/* —— 绿框真渲染夹具与 DOM 读法：断言的是点出来的真 DOM（类名/属性/disabled/文案），不是源码里有没有字符串 —— */
const BOX_WS = [
  W({ workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' }),
  W({ workspaceId: 'ws-2', path: 'D:\\agents\\shufang', title: '书房' }),
  W({ workspaceId: 'ws-3', path: 'D:\\agents\\garage', title: '车库' }), // 尚无家 ⇒ 新建家的唯一候选
];
const BOX_HOMES = [
  H({ id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting', name: '客厅', nameSource: 'system' }),
  H({ id: 'h2', workspaceId: 'ws-2', path: 'D:\\agents\\shufang', name: '书房基地', nameSource: 'user' }),
];
const BOX_ASSTS = [
  A({ id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小帅', nameSource: 'bot' }),
  A({ id: 'a2', homeId: 'h1', channel: 'weixin', botId: null, status: 'unbound', name: '', nameSource: 'home' }),
];
const BOX_BOTS = [
  B({ channel: 'feishu', botId: 'b1', workspace: 'D:\\agents\\keting', botName: '小帅', connected: true }),
  B({ channel: 'qq', botId: 'b9', workspace: '', botName: '野号', connected: false }), // 未绑 ⇒ 新建助理的唯一候选
];

const nodes = (root: any, out: any[] = []): any[] => {
  for (const c of root?.childNodes ?? []) if (c.nodeType === 1) { out.push(c); nodes(c, out); }
  return out;
};
const cls = (root: any, c: string): any[] => nodes(root).filter((e) => e.classList?.contains(c));
const one = (root: any, c: string): any => cls(root, c)[0] ?? null;
const byAttr = (root: any, k: string, v: string): any[] => nodes(root).filter((e) => e.getAttribute?.(k) === v);
const tag = (root: any, name: string): any => nodes(root).find((e) => String(e.nodeName).toLowerCase() === name) ?? null;
const txt = (e: any): string => String(e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const off = (e: any): boolean => e?.disabled === true || !!e?.hasAttribute?.('disabled');
const clickEl = (e: any): void => { e.dispatchEvent({ type: 'click' }); };

function renderBox(): { bodyEl: any; handle: any } {
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state: { homes: BOX_HOMES, assistants: BOX_ASSTS, bots: BOX_BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),


    getWorkspaces: () => BOX_WS,
    ops: { createHome: async () => {}, createAssistant: async () => {}, connect: () => {} },
    onRetry: () => {},
  });
  handle.render();
  return { bodyEl, handle };
}
const ttlOf = (root: any): { b: string; small: string } => {
  const t = one(root, 'hu-ttl');
  return { b: txt(tag(t, 'b')), small: txt(tag(t, 'small')) };
};
const footOf = (root: any): any => one(root, 'hu-pbtn');
const rowsOf = (root: any): any[] => cls(root, 'hu-row');
const crumbInfo = (root: any): Array<{ lv: string; label: string; cur: boolean; goto: string | null }> =>
  cls(root, 'hu-crumb').map((c) => ({ lv: txt(tag(c, 'span')), label: txt(tag(c, 'b')), cur: c.getAttribute('aria-current') === 'true', goto: c.getAttribute('data-goto') }));
const curCrumb = (root: any): any => cls(root, 'hu-crumb').filter((c) => c.getAttribute('aria-current') === 'true')[0];


test('家命名回落：用户手改 > 工作区标题 > 目录基名（T3 Q3）', () => {
  assert.equal(model.resolveHomeDisplay(H({ name: '湖畔小屋', nameSource: 'user' }), '客厅工作区').text, '湖畔小屋');
  assert.equal(model.resolveHomeDisplay(H({ name: '快照', nameSource: 'system' }), '客厅工作区').text, '客厅工作区');
  assert.equal(model.resolveHomeDisplay(H({ name: '', nameSource: 'system', path: 'D:\\agents\\keting' }), '').text, 'keting');
  assert.equal(model.resolveHomeDisplay(H({ name: 'x', nameSource: 'system' }), 'default-workspace').text, '默认工作区');
});

test('家冻结：手改后工作区再改名也不跟（T3 冻结）', () => {
  const home = H({ name: '我的家', nameSource: 'user' });
  assert.equal(model.resolveHomeDisplay(home, '新工作区名').from, 'user');
  assert.equal(model.resolveHomeDisplay(home, '新工作区名').text, '我的家');
});

test('助理命名回落：用户 > 机器人名 > 家名 > 缺省（T3 Q3）', () => {
  assert.equal(model.resolveAssistantDisplay(A({ name: '阿梨', nameSource: 'user' }), '机器人小帅', '客厅').text, '阿梨');
  assert.equal(model.resolveAssistantDisplay(A({ nameSource: 'bot', botId: 'b1' }), '机器人小帅', '客厅').text, '机器人小帅');
  assert.equal(model.resolveAssistantDisplay(A({ nameSource: 'home', botId: null }), '', '客厅').text, '客厅');
  assert.equal(model.resolveAssistantDisplay(A({ name: '', nameSource: 'home', botId: null }), '', '').text, '未命名助理');
});

test('助理冻结：手改后机器人/家改名也不跟', () => {
  const a = A({ name: '专属名', nameSource: 'user' });
  assert.equal(model.resolveAssistantDisplay(a, '新机器人名', '新家名').text, '专属名');
});

test('严格一对一：同一机器人不许进两家（T3 Q2）', () => {
  const list = [A({ id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1' })];
  assert.equal(model.isBotBound(list, 'feishu', 'b1'), true);
  assert.equal(model.isBotBound(list, 'feishu', 'b2'), false);
  assert.deepEqual(model.validateAssistantBind(list, 'feishu', 'b1'), { ok: false, reason: 'already-bound' });
  assert.deepEqual(model.validateAssistantBind(list, 'feishu', 'b2'), { ok: true });
  assert.deepEqual(model.validateAssistantBind(list, 'feishu', ''), { ok: false, reason: 'empty-bot' });
  assert.deepEqual(model.validateAssistantBind(list, 'wechat', 'b1'), { ok: true });
});

test('建家：选已有区即成功，空入参拒绝（验收①）', () => {
  const home = model.createHome({ workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.ok(home && home.workspaceId === 'ws-1' && home.path === 'D:\\agents\\keting');
  assert.equal(model.resolveHomeDisplay(home, '客厅').text, '客厅');
  assert.equal(model.createHome({ workspaceId: '', path: '', title: '' }), null);
});

test('建助理：选绑机器人即成功，一对一绑上（验收②）', () => {
  const home = H({});
  const a = model.createAssistant({ homeId: home.id, channel: 'feishu', botId: 'b9', botName: '小帅', homeText: '客厅' }, []);
  assert.ok(a && a.homeId === 'h1' && a.botId === 'b9' && a.status === 'bound');
  assert.equal(model.resolveAssistantDisplay(a, '小帅', '客厅').text, '小帅');
  assert.equal(model.createAssistant({ homeId: 'h1', channel: 'feishu', botId: 'b9' }, [a]), null);
  assert.equal(model.createAssistant({ homeId: 'h1', channel: 'feishu', botId: '' }, []), null);
});

test('三级列表一次点开：家→助理→机器人名字按默认规则显示（验收③）', () => {
  const homes = [H({ id: 'h1', name: '客厅', nameSource: 'system', path: 'D:\\agents\\keting' })];
  const assistants = [A({ id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', name: '小帅', nameSource: 'bot' })];
  const groups = model.groupByHome(homes, assistants);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].assistants.length, 1);
  assert.equal(model.resolveHomeDisplay(homes[0], '客厅').text, '客厅');
  assert.equal(model.resolveAssistantDisplay(assistants[0], '小帅', '客厅').text, '小帅');
});

test('空闲集合：已占用工作区/机器人不再列出（下拉口径）', () => {
  const ws = [W({}), W({ workspaceId: 'ws-2', path: 'D:\\agents\\shufang', title: '书房' })];
  assert.deepEqual(model.freeWorkspaces(ws, [H({ workspaceId: 'ws-1', path: 'D:\\agents\\keting' })]).map((w: any) => w.workspaceId), ['ws-2']);
  const bots = [B({}), B({ botId: 'b2', botName: '阿梨' })];
  assert.deepEqual(model.freeBots(bots, [A({ botId: 'b1', channel: 'feishu' })]).map((b: any) => b.botId), ['b2']);
});

test('种子迁移：一区一家含无人之家＋有归属各一助理＋旧名优先（T3 故事20-22）', () => {
  const ws = [W({}), W({ workspaceId: 'ws-2', path: 'D:\\agents\\empty', title: '' }), W({ workspaceId: 'ws-3', path: 'D:\\agents\\ali', title: '阿梨窝' })];
  const bots = [B({}), B({ channel: 'qq', botId: 'q1', workspace: 'D:\\agents\\ali', botName: '' }), B({ channel: 'feishu', botId: 'free', workspace: '', botName: '' })];
  const seed: any = model.buildSeed(ws, bots, { names: { 'D:\\agents\\ali': '阿梨2' } });
  assert.equal(seed.homes.length, 3);
  assert.equal(seed.assistants.length, 2);
  const ali = seed.homes.find((h: any) => h.workspaceId === 'ws-3');
  assert.equal(ali.name, '阿梨2');
  assert.equal(ali.nameSource, 'user');
  const keting = seed.homes.find((h: any) => h.workspaceId === 'ws-1');
  assert.equal(keting.nameSource, 'system');
  const empty = seed.homes.find((h: any) => h.workspaceId === 'ws-2');
  assert.equal(empty.name, 'empty');
  const qq = seed.assistants.find((a: any) => a.botId === 'q1');
  assert.equal(qq.homeId, ali.id);
  assert.equal(qq.nameSource, 'home');
  assert.ok(!seed.assistants.some((a: any) => a.botId === 'free'), '未绑定 bot 不建行（经下拉认领）');
});

test('种子幂等键：同规范路径（大小写/斜杠差异）不翻倍', () => {
  const ws = [W({}), W({ workspaceId: 'ws-x', path: 'd:/agents/KETING', title: '重复' })];
  const seed: any = model.buildSeed(ws, [], null);
  assert.equal(seed.homes.length, 1);
});

test('缺口判定：空表有料→补；齐→静默；新 bot→补', () => {
  assert.equal(model.seedGap([W({})], [], [], []), true);
  assert.equal(model.seedGap([], [B({})], [], []), true);
  assert.equal(model.seedGap([], [], [], []), false);
  assert.equal(model.seedGap([W({})], [B({})], [H({})], [A({})]), false);
  assert.equal(model.seedGap([W({})], [B({}), B({ botId: 'b2' })], [H({})], [A({})]), true);
});

test('全程只走 T3 模型，不另发明字段（验收④）：产出行与落盘行的键集合都钉死（可执行）', async () => {
  /* 旧的写法只 grep 源码文本（读文件找 "extra"/"customField"），既不执行也不看落盘结果。
   * 这里改成可执行断言：T3 记录（H/A 夹具）的键集合就是唯一合法集合，
   * 纯逻辑产出的行、以及真正写进 homes.json 的行，多一个字段都算「另发明」。 */
  const HOME_KEYS = Object.keys(H({})).sort();
  const ASST_KEYS = Object.keys(A({})).sort();
  const home: any = model.createHome({ workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' }, 1);
  assert.ok(home && home.id, 'createHome 应产出家');
  assert.deepEqual(Object.keys(home).sort(), HOME_KEYS, '纯逻辑家行键集合必须等于 T3');
  const asst: any = model.createAssistant({ homeId: home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '客厅' }, [], 1);
  assert.ok(asst && asst.id, 'createAssistant 应产出助理');
  assert.deepEqual(Object.keys(asst).sort(), ASST_KEYS, '纯逻辑助理行键集合必须等于 T3');

  const dir = mkdtempSync(join(tmpdir(), 'home-steel-shape-'));
  const file = join(dir, 'homes.json');
  const r1: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.equal(r1.ok, true);
  /* 每次写完立刻读盘断言——若只等两次写之后再读，未知字段会被下一次 load 的净化顺手抹掉，
   * 断言就成了「测不到」的空转（这是真踩到的：先加的 extraField 被下一轮 load 洗掉了）。 */
  let doc: any = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(doc.version, 2, '新表版本号是 2');
  assert.deepEqual(Object.keys(doc.homes[0]).sort(), HOME_KEYS, '落盘家行键集合必须等于 T3');
  const r2: any = await homeStore.createAssistantRow(file, { homeId: r1.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '客厅' });
  assert.equal(r2.ok, true);
  doc = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(doc.homes[0]).sort(), HOME_KEYS, '落盘家行键集合必须等于 T3');
  assert.deepEqual(Object.keys(doc.assistants[0]).sort(), ASST_KEYS, '落盘助理行键集合必须等于 T3');

  /* 外来字段进不来：手写一份带未知字段的盘上文件，读回时必须被净化掉
   * （T6b/c 或第三方工具手改盘上文件时，不认识的字段不许渗进内存模型）。 */
  const dirty = join(dir, 'dirty.json');
  writeFileSync(dirty, JSON.stringify({ version: 2, homes: [{ ...H({}), extraField: 1, customField: 'x' }], assistants: [{ ...A({}), nope: true }] }));
  const loaded: any = await homeStore.loadHomesDoc(dirty);
  assert.deepEqual(Object.keys(loaded.homes[0]).sort(), HOME_KEYS, '盘上未知字段必须被净化');
  assert.deepEqual(Object.keys(loaded.assistants[0]).sort(), ASST_KEYS, '盘上未知字段必须被净化');

  const homeSrc = readFileSync(join(CLIENT, 'data', 'home-model.ts'), 'utf8');
  assert.ok(homeSrc.includes("nameSource: 'user' | 'system'"));
  assert.ok(homeSrc.includes("status: 'unbound' | 'bound' | 'orphan'"));
  assert.ok(homeSrc.includes("nameSource: 'user' | 'home' | 'bot'"));
});

test('宿主：建家幂等 + 建助理一对一 + 落盘可读', async () => {
  const { mkdtempSync: mk } = await import('node:fs');
  const { tmpdir: td } = await import('node:os');
  const { join: j } = await import('node:path');
  const dir = mk(j(td(), 'hs-'));
  const file = j(dir, 'homes.json');
  const r1: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.equal(r1.ok, true);
  const r2: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'already-exists');
  const doc1: any = await homeStore.loadHomesDoc(file);
  assert.equal(doc1.homes.length, 1);
  assert.equal(doc1.version, 2);
  const a1: any = await homeStore.createAssistantRow(file, { homeId: r1.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '' });
  assert.equal(a1.ok, true);
  assert.equal(a1.assistant.status, 'bound');
  const a2: any = await homeStore.createAssistantRow(file, { homeId: r1.home.id, channel: 'feishu', botId: 'b1' });
  assert.equal(a2.ok, false);
  assert.equal(a2.code, 'already-bound');
  const bad: any = await homeStore.createAssistantRow(file, { homeId: 'missing', channel: 'feishu', botId: 'b2' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'not-found');
});

test('宿主：加载保留 unbound/orphan/tombstone（T6b/c 数据不丢）', async () => {
  const { mkdtempSync: mk, writeFileSync } = await import('node:fs');
  const { tmpdir: td } = await import('node:os');
  const { join: j } = await import('node:path');
  const dir = mk(j(td(), 'hs-keep-'));
  const file = j(dir, 'homes.json');
  writeFileSync(file, JSON.stringify({
    version: 2,
    homes: [{ id: 'h1', workspaceId: null, path: 'D:\\gone', name: '旧家', nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1, tombstone: { at: 2, reason: 'ws deleted' } }],
    assistants: [
      { id: 'a1', homeId: 'h1', channel: 'feishu', botId: null, status: 'unbound', name: '占位', nameSource: 'home', avatar: null, avatarSource: 'default', createdAt: 1, boundAt: null },
      { id: 'a2', homeId: 'h1', channel: 'feishu', botId: null, status: 'orphan', name: '失联', nameSource: 'home', avatar: null, avatarSource: 'default', createdAt: 2, boundAt: 1 },
    ],
  }), 'utf8');
  const doc: any = await homeStore.loadHomesDoc(file);
  assert.equal(doc.homes.length, 1);
  assert.deepEqual(doc.homes[0].tombstone, { at: 2, reason: 'ws deleted' });
  assert.equal(doc.assistants.length, 2);
  assert.ok(doc.assistants.some((a: any) => a.id === 'a1' && a.status === 'unbound' && a.botId === null));
  assert.ok(doc.assistants.some((a: any) => a.id === 'a2' && a.status === 'orphan'));
});

test('宿主种子：批量落盘＋id 回填＋重跑不翻倍', async () => {
  const { mkdtempSync: mk } = await import('node:fs');
  const { tmpdir: td } = await import('node:os');
  const { join: j } = await import('node:path');
  const dir = mk(j(td(), 'hs-seed-'));
  const file = j(dir, 'homes.json');
  const seed: any = model.buildSeed(
    [W({}), W({ workspaceId: 'ws-2', path: 'D:\\agents\\ali', title: '阿梨窝' })],
    [B({}), B({ channel: 'qq', botId: 'q1', workspace: 'D:\\agents\\ali', botName: 'Q' })],
    null, 1000);
  const r1: any = await homeStore.seedDocs(file, seed);
  assert.equal(r1.homes.length, 2);
  assert.equal(r1.assistants.length, 2);
  const r2: any = await homeStore.seedDocs(file, seed);
  assert.equal(r2.homes.length, 2, '重跑复用既有家（id 回填）');
  assert.equal(r2.assistants.length, 0, '重跑助理判重跳过');
  const doc: any = await homeStore.loadHomesDoc(file);
  assert.equal(doc.homes.length, 2);
  assert.equal(doc.assistants.length, 2);
  assert.equal(r1.homes[0].id, r2.homes[0].id);
});

test('宿主 RPC：四端点已追加且旧码不动（Added-only）', () => {
  const rpcSrc = readFileSync(join(REPO, 'src', 'host', 'rpc.ts'), 'utf8');
  assert.match(rpcSrc, /case 'home\.list': \{/);
  assert.match(rpcSrc, /case 'home\.create': \{/);
  assert.match(rpcSrc, /case 'assistant\.create': \{/);
  assert.match(rpcSrc, /case 'home\.seed': \{/);
  assert.ok(rpcSrc.includes("case 'meta.get':"), '旧 case 仍在');
  const metaSrc = readFileSync(join(REPO, 'src', 'host', 'meta-store.ts'), 'utf8');
  assert.ok(metaSrc.includes('version: 1'), '旧表 version:1 不动');
  assert.ok(!metaSrc.includes('homes.json'), '旧文件不碰新表文件');
});

/* 真分发器执行（补掉「只 grep 源码 case」的空档）：走 src/host/rpc.ts 的真 switch，
 * 而不是直接调 home-store 的函数，也不是断言源码里有 "case 'home.seed': {"。 */
test('宿主分发器真跑：ping → home.create → assistant.create → home.list → 一对一拒绝 → home.seed', async () => {
  const { AgentMetaStore } = reqHost('./meta-store.js');
  const { createAgentFleetHandler } = reqHost('./rpc.js');
  const dshHome = mkdtempSync(join(tmpdir(), 'home-steel-rpc-'));
  const call = createAgentFleetHandler(new AgentMetaStore(join(dshHome, 'agents.json')), { dshHome });

  const ping: any = await call('ping', {});
  assert.equal(ping.ok, true, '旧端点仍通（Added-only 未伤旧码）');

  const c1: any = await call('home.create', { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.equal(c1.ok, true, JSON.stringify(c1.error ?? {}));
  assert.ok(c1.value.home.id, 'home.create 返回真 id');
  const c2: any = await call('assistant.create', { homeId: c1.value.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '客厅' });
  assert.equal(c2.ok, true, JSON.stringify(c2.error ?? {}));

  const l1: any = await call('home.list', {});
  assert.equal(l1.value.homes.length, 1);
  assert.equal(l1.value.assistants.length, 1);

  const c3: any = await call('assistant.create', { homeId: c1.value.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '客厅' });
  assert.equal(c3.ok, false, '同一机器人二次绑定必须被拒');
  assert.equal(c3.error.code, 'already-bound');
  const l2: any = await call('home.list', {});
  assert.equal(l2.value.assistants.length, 1, '被拒后不新增行');

  const s: any = await call('home.seed', { homes: [H({ id: 'h9' })], assistants: [A({ id: 'a9', homeId: 'h9' })] });
  assert.equal(s.ok, true, JSON.stringify(s.error ?? {}));
  const file = join(dshHome, 'integrations', 'dsh-im-companion', 'homes.json');
  const doc: any = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(doc.homes.length, 1, '同规范路径不翻倍（一区一家）');
  assert.equal(doc.assistants.length, 1, '同 channel+botId 不翻倍');
  assert.deepEqual(Object.keys(doc.homes[0]).sort(), Object.keys(H({})).sort(), '分发器落盘行仍是 T3 键集合');
  assert.deepEqual(Object.keys(doc.assistants[0]).sort(), Object.keys(A({})).sort(), '分发器落盘行仍是 T3 键集合');
});

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('绿框归位：错误挂载已移除（左栏家按钮＋modal 特性注销）', () => {
  assert.equal(existsSync(join(REPO, 'src', 'features', 'home-assistant')), false, '特性目录已删');
  const idx = readFileSync(join(REPO, 'src', 'features', 'index.ts'), 'utf8');
  assert.ok(!idx.includes('home-assistant'), '注册表注销');
  const comp = readdirSync(COMP).join('\n');
  assert.ok(!comp.includes('home-steel-entry'), '左栏入口残留不得存在');
  const body = readFileSync(join(COMP, 'panel-body.ts'), 'utf8');
  assert.ok(!strip(body).includes('home-steel-entry'), 'body 不得含左栏入口');
});

test('绿框呈现：body 三级钻取＋建单＋链路条（T4 原型 DOM，旧 buildModel 列表退役）', () => {
  /* 旧 variant-A（home-drill / home-create / home-styles）整体删除，绿框改钉 T4 认可款原型
   * prototypes/home-assistant/proto-studio.html 的文件集合与 DOM（owner 裁定 2026-10-13）。 */
  const GONE = ['home-drill.ts', 'home-create.ts', 'home-styles.ts'];
  const GREEN = ['home-ui-styles.ts', 'home-icons.ts', 'home-rows.ts', 'home-frame.ts', 'home-detail.ts', 'home-forms.ts', 'home-pop.ts', 'home-ops.ts', 'panel-body.ts'];
  for (const f of GONE) assert.equal(existsSync(join(COMP, f)), false, '旧 variant-A 文件必须已删：' + f);
  for (const f of GREEN) assert.ok(existsSync(join(COMP, f)), '绿框实现文件必须存在：' + f);

  const srcOf = (f: string): string => readFileSync(join(COMP, f), 'utf8');
  assert.ok(!strip(srcOf('panel-body.ts')).includes('buildModel'), 'body 不再读旧模型');
  assert.ok(!strip(srcOf('panel-body.ts')).includes('makeAgentRow'), 'body 不再用旧行组件');
  /* 旧命名空间绝迹：整包绿框组件里不得再出现旧类名/旧属性/旧入口（只许出现新的 hu-* / .home-ui）。 */
  const greenCode = strip(GREEN.map(srcOf).join('\n'));
  for (const dead of ['.item', '.botcard', '.drill', '.hint', '.step', 'data-jump', 'createBlockFor', '.kids', 'af-row', 'af-actions']) {
    assert.ok(!greenCode.includes(dead), '旧命名空间不得回到绿框：' + dead);
  }
  assert.ok(!greenCode.includes('.af-'), '不占 .af-* 私有约定（主题令牌只走 var(--af-*)）');

  /* 命名空间（契约 §6）：样式表经 installFeatureStyles 以独有 id 注册，且每条规则都挂 .home-ui 之下。 */
  const cssSrc = srcOf('home-ui-styles.ts');
  const css = strip(cssSrc.split('`')[1] ?? '');
  assert.ok(cssSrc.includes("export const HOME_UI_STYLE_ID = 'home-greenbox'"), '样式表经独有 id 注册');
  const unscoped = css.split('\n').map((ln) => ln.trim())
    .filter((ln) => ln.includes('{') && !ln.startsWith('@') && !ln.includes('.home-ui'));
  assert.deepEqual(unscoped, [], '每条 CSS 规则都必须挂在 .home-ui 之下（不许污染全局）');
  assert.ok(css.includes('.home-ui.hu-pophost'), '弹层 portal 宿主同样带 .home-ui（作用域不破）');
  const subRule = css.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('.home-ui .hu-row .hu-sub{'))[0] ?? '';
  assert.ok(subRule.includes('white-space:nowrap') && subRule.includes('text-overflow:ellipsis'), '行副标必须单行截断');
  /* 绿框不自造滚动容器（真机缺陷：内层滚动条既丑、又与页面滚动嵌套；给元素写 ::-webkit-scrollbar
   * 还会把 Chromium 切回「经典滚动条」渲染，出现上下箭头按钮）。列表区只能交给宿主整页滚动。 */
  const fbodyRule = css.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('.home-ui .hu-fbody{'))[0] ?? '';
  assert.ok(fbodyRule.length > 0, '列表区规则必须存在');
  assert.ok(!/overflow(-y)?\s*:\s*auto/.test(fbodyRule), '列表区不得自造内层滚动条（整页只留宿主一条滚动条）');
  assert.ok(!css.includes('.hu-fbody::-webkit-scrollbar'), '列表区不得自绘滚动条（会触发经典滚动条箭头渲染）');
  assert.ok(css.includes('.hu-opts::-webkit-scrollbar-button{display:none'), '弹层列表的滚动条必须显式关掉箭头按钮');
  assert.ok(css.includes('scrollbar-color:color-mix(in srgb,var(--hu-ink-3)'), '弹层列表滚动条须用主题令牌着色');
  assert.ok(css.includes('.home-ui .hu-crumb[aria-current="true"]') && css.includes('.home-ui .hu-crumb.next'),
    '链路条：当前层与可前进层各有独立样式');
  assert.ok(srcOf('home-ops.ts').includes("'home.list'"), '家表经自有桥读取');
  /* 头像底色必须与主题底色混够量：深色主题里 16% 几乎无色相，十几行糊成一片灰（真机反馈）。
   * 身份派生已抽到纯模块 home-identity（色相由 id 派生、字形取两词首字母）。 */
  const identSrc = srcOf('home-identity.ts');
  const avBgPct = Number(/hsl\(\$\{hue\} 62% 50%\) (\d+)%,\s*var\(--hu-panel\)/.exec(identSrc)?.[1] ?? '0');
  const avFgPct = Number(/hsl\(\$\{hue\} 66% 44%\) (\d+)%,\s*var\(--hu-ink\)/.exec(identSrc)?.[1] ?? '0');
  assert.ok(avBgPct >= 25, '头像底色混色比例须 ≥25%（深色主题下要看得见色相）');
  assert.ok(avFgPct > 0 && avFgPct <= 70, '头像字色须把色相留在前景（≤70% 混 ink）');
  assert.ok(identSrc.includes('hash32(String(id'), '色相必须由不可变 id 派生（改名不许换色）');

  /* —— 真渲染：DOM 桩 + 真 panel-body。下面每条断言点的是点出来的真 DOM，不是源码文本。 —— */
  const { bodyEl, handle } = renderBox();
  const ttl = (): { b: string; small: string } => ttlOf(bodyEl);
  const foot = (): any => footOf(bodyEl);
  const rows = (): any[] => rowsOf(bodyEl);

  /* L1：无返回键、家行 data-open="L2"（点行进下一级，不是展开树）、底部主操作「新建家」。
   * 呈现策略（非数据规则）：0 助理的家折叠进尾部 ⇒ 默认只有活跃行 + 折叠行。 */
  assert.ok(one(bodyEl, 'home-ui'), '绿框根 .home-ui 必须在');
  assert.deepEqual(ttl(), { b: '家', small: '2 个 · 每个家对应一个工作区' }, 'L1 页头标题/副标');
  assert.equal(cls(bodyEl, 'hu-back').length, 0, 'L1 不显示返回键（原型：最上层无返回）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L2'], '活跃家行带 data-open="L2"');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['h1'], '活跃家行带家 id（钻取的落点）');
  assert.equal(txt(one(bodyEl, 'hu-more-row')), '1 个空家 · 暂无助理', '空家折叠行：0 助理的家收在尾部（可达性不丢）');
  clickEl(one(bodyEl, 'hu-more-row'));
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['h1', 'h2'], '展开后两行都在（T3 一区一家含无人之家仍成立）');
  for (const c of ['hu-av', 'hu-txt', 'hu-nm', 'hu-sub', 'hu-names', 'hu-acts2']) assert.ok(one(rows()[0], c), '家行解剖缺件：' + c);
  assert.deepEqual(crumbInfo(bodyEl), [
    { lv: 'L1', label: '家', cur: true, goto: null },
    { lv: 'L2', label: '助理', cur: false, goto: 'L2' },
    { lv: 'L3', label: '机器人', cur: false, goto: 'L3' },
  ], '链路条三级：当前层 aria-current，可前进层带 data-goto');
  assert.ok(cls(bodyEl, 'hu-crumb').slice(1).every((c) => c.getAttribute('aria-disabled') === 'true'),
    'L1 未聚焦任何家时后两级是灰色预显（原型 off）');
  assert.equal(txt(foot()), '新建家', 'L1 底部主操作＝新建家');
  /* 命名回落（渲染口径）：手改名冻结＞工作区标题＞目录名，副标如实标出来源 */
  assert.equal(txt(tag(one(rows()[0], 'hu-nm'), 'b')), '客厅', '家名回落：没手改 ⇒ 用工作区标题');
  assert.ok(txt(one(rows()[0], 'hu-sub')).includes('跟随工作区名'), '副标标出来源：跟随工作区名');
  assert.equal(txt(tag(one(rows()[1], 'hu-nm'), 'b')), '书房基地', '家名冻结：手改过就不跟工作区（书房）');
  assert.ok(txt(one(rows()[1], 'hu-sub')).includes('你改过的名字'), '副标标出来源：你改过的名字');
  /* 未实现钮（T6b/T6c 各票）照原型画出但 disabled，且每个都标了归属票号 */
  assert.equal(cls(bodyEl, 'hu-ract').length, 4, 'L1 只有禁用钮，没有可点的行动作');
  assert.ok(cls(bodyEl, 'hu-ract').every(off), '家行的重命名/更多全部 disabled（T6b 才实现）');
  assert.deepEqual([...new Set(cls(bodyEl, 'hu-ract').map((b) => b.getAttribute('data-tip')))].sort(),
    ['重命名（#114 待实现）', '更多（#114 待实现）'].sort(),
    '家行禁用钮标注归属票号 #114');

  /* 点家行 → L2（钻取，不是展开）：页头换家名、返回键出现、行变助理、底部换「新建助理」 */
  clickEl(rows()[0]);
  assert.deepEqual(ttl(), { b: '客厅', small: '跟随工作区名 · 2 位助理' }, 'L2 页头＝家名＋回落来源');
  assert.equal(cls(bodyEl, 'hu-back').length, 1, 'L2 出现返回键 .hu-back');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L3', 'L3'], '助理行带 data-open="L3"（再点进一级）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['a1', 'a2'], '助理行带助理 id');
  assert.equal(txt(curCrumb(bodyEl)), 'L2客厅', '当前层＝L2 家（链路条跟着钻取走）');
  assert.equal(txt(foot()), '新建助理', 'L2 底部主操作＝新建助理');
  assert.ok(txt(rows()[0]).includes('已绑') && txt(rows()[0]).includes('小帅'), '已绑助理行：机器人名回落＋已绑章');
  assert.ok(off(one(rows()[1], 'hu-ract')) && one(rows()[1], 'hu-ract').getAttribute('data-tip') === '绑机器人（#114 待实现）',
    '未绑助理的「绑机器人」是未实现钮：disabled 且标票号');

  /* 点助理行 → L3 详情：行动作按 114/115 分票，只有「接入 / 详情」可点 */
  clickEl(rows()[0]);
  assert.ok(one(bodyEl, 'hu-detail'), 'L3 详情卡 .hu-detail 必须在');
  const acts = cls(bodyEl, 'hu-abtn');
  assert.deepEqual(acts.filter((b) => !off(b)).map((b) => txt(b)), ['接入', '详情'], 'L3 只有「接入 / 详情」可点（已绑助理）');
  assert.equal(acts.filter(off).length, 0, 'L3 不再平铺 5 枚假按钮（真机反馈：灰钮读起来像坏了）');
  assert.ok(txt(one(bodyEl, 'hu-soon')).includes('待实现：重命名') && txt(one(bodyEl, 'hu-soon')).includes('#115'),
    '未实现动作改一行「待实现」清单：可发现性保留、可用性不伪装');
  assert.equal(txt(one(one(bodyEl, 'hu-chain'), 'on')), '机器人名', '命名链高亮命中来源（nameSource=bot）');
  assert.equal(txt(foot()), '返回助理列表', 'L3 已绑：底部主操作＝返回助理列表');

  /* L3 未绑：底部主操作换成禁用的「绑定机器人」（同一层随绑定状态变） */
  clickEl(one(bodyEl, 'hu-back'));
  clickEl(rows()[1]);
  assert.equal(txt(foot()), '绑定机器人', 'L3 未绑：底部主操作＝绑定机器人');
  assert.ok(off(foot()) && foot().getAttribute('data-tip') === '绑定机器人（#114 待实现）', '未绑的绑定钮是未实现钮：disabled 且标票号');
  assert.ok(txt(one(bodyEl, 'hu-detail')).includes('还没绑机器人'), 'L3 未绑详情卡走占位文案');

  /* 面包屑可向前钻取：点 L1 章回到 L1 */
  clickEl(byAttr(bodyEl, 'data-goto', 'L1')[0]);
  assert.deepEqual(ttl(), { b: '家', small: '2 个 · 每个家对应一个工作区' }, '面包屑点回 L1（链路条可向前钻取）');
  assert.equal(txt(foot()), '新建家', '回 L1 后底部主操作跟着回到新建家');

  /* 空态：进没有助理的家 → .hu-empty（不是空白列表）；空家折叠段此时已展开（前面点过折叠行） */
  assert.equal(txt(one(bodyEl, 'hu-more-row')), '收起 1 个空家', '折叠行状态可见（展开后变「收起」）');
  clickEl(rows()[1]);
  assert.equal(txt(tag(one(bodyEl, 'hu-empty'), 'b')), '这个家还没有助理', '空家走 .hu-empty 空态');
  assert.ok(txt(one(bodyEl, 'hu-empty')).includes('点下面的「新建助理」'), '空态给出下一步');
  assert.equal(txt(foot()), '新建助理', '空家 L2 底部主操作仍是新建助理');

  /* 建单：L2「新建助理」→ body 级 popover（选家＋选空闲机器人）；L1「新建家」→ 选已有工作区 */
  clickEl(foot());
  const pop = one(domDoc.body, 'hu-pophost');
  assert.ok(pop && pop.classList.contains('home-ui'), '弹层挂 body portal 且宿主带 .home-ui（作用域不破）');
  assert.ok(one(pop, 'hu-scrim') && one(pop, 'hu-pop') && one(pop, 'hu-ppo'), '弹层结构＝.hu-scrim + .hu-pop > .hu-ppo');
  assert.equal(txt(one(pop, 'hu-ptitle')), '新建助理', '弹层标题＝新建助理');
  assert.deepEqual(cls(pop, 'hu-fld').map((f) => txt(tag(f, 'span'))), ['属于哪个家', '绑定机器人', '名字'], '建单字段');
  assert.deepEqual(byAttr(pop, 'data-value', 'b9').map((o) => txt(tag(o, 'b'))), ['野号'], '空闲机器人是候选：已绑的 b1 不进下拉');
  const later = byAttr(pop, 'data-value', '')[0];
  assert.ok(off(later) && later.getAttribute('data-tip') === '未绑定占位（#114 待实现）', '「以后再绑」照原型画出但禁用并标票号');
  assert.deepEqual(cls(pop, 'hu-pbtn-s').map(txt), ['取消', '创建'], '弹层底钮＝取消 / 创建');
  clickEl(one(bodyEl, 'hu-back'));
  clickEl(foot());
  const pop2 = one(domDoc.body, 'hu-pophost');
  assert.equal(txt(one(pop2, 'hu-ptitle')), '新建家', '回 L1 后底部主操作开的是「新建家」');
  assert.deepEqual(cls(pop2, 'hu-fld').map((f) => txt(tag(f, 'span'))), ['已有工作区'], '建家字段＝已有工作区');
  assert.deepEqual(byAttr(pop2, 'data-value', 'ws-3').map((o) => txt(tag(o, 'b'))), ['车库'], '只列尚无家的已有工作区（ws-1/ws-2 已占用）');
  handle.dispose();

  /* 装配层接线：绿框样式表安装、家表首读；建单入口归绿框自管（A1 不再直连 openCreate） */
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  assert.ok(panel.includes('installHomeUiStyles'), '绿框样式表须在装配层安装');
  assert.ok(panel.includes('loadHomes'), '装配层接线家表首读');
  assert.ok(panel.includes('createPanelBody'), '装配层接线绿框 body');
  assert.ok(!panel.includes('openCreate'), 'A1 不再直连建单入口（绿框页头 ＋ 与底部主操作自管）');
  assert.ok(!strip(panel).includes('compose.el'), '旧 compose 新建条退役（文件保留供回归钉）');
});

test('首屏骨架：家表未就绪时渲染等比例骨架（同框架 + 灰条行），顶部不出报错横条', () => {
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state: { homes: [], assistants: [], bots: [], query: '', mode: 'agent', loading: true, failed: ['feishu'], homesReady: false, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => BOX_WS,
    ops: { createHome: async () => {}, createAssistant: async () => {}, connect: () => {} },
    onRetry: () => {},
  });
  handle.render();
  assert.ok(one(bodyEl, 'hu-fhead'), '骨架也要有页头（几何与真框架一致）');
  assert.deepEqual(cls(bodyEl, 'hu-crumb').length, 3, '骨架也要有三级面包屑');
  assert.equal(cls(bodyEl, 'hu-srow').length, 4, '骨架固定 4 行');
  assert.ok(cls(bodyEl, 'hu-srow')[0].classList.contains('hu-row'), '骨架行复用 .hu-row 几何（加载完零跳动）');
  assert.equal(txt(footOf(bodyEl)), '新建家', '骨架也要有底部主操作');
  /* 真机事故（2026-10-13）：state.failed 是失败端点数组（空数组也 truthy），
   * 只要家表没读完就命中错误分支 ⇒ 进面板瞬间闪出「家表读取失败」横条。这里连非空 failed 也不许出横条。 */
  assert.equal(cls(bodyEl, 'hu-err').length, 0, '首屏不得出现报错横条');
  handle.dispose();
});

test('上部区域定稿：搜索/分段退场，三个面板动作并进绿框页头', () => {
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  assert.ok(!panel.includes('makeSearchField') && !panel.includes('makeSegmented'),
    '搜索框与「按助理 / 按渠道」分段必须退场（owner 裁定：钻取三级下二者无价值）');
  assert.ok(!panel.includes('af-toolbar'), '工具栏行退场：动作并进绿框页头，上部少一行');
  assert.ok(panel.includes('headActions'), '三个面板动作交绿框页头承载');
  assert.ok(readFileSync(join(COMP, 'home-frame.ts'), 'utf8').includes('actions?: HTMLElement'),
    '页头必须支持动作槽（headActions 有落点）');
  assert.ok(readFileSync(join(COMP, 'home-rows.ts'), 'utf8').includes('hu-srow'),
    '骨架行必须与真行同几何（复用 .hu-row）');
});

test('页头单行预算：标题 20px + 更新入口收紧 + 不许行内换行（owner 2026-10-13）', () => {
  /* 真机两连：①更新失败横幅 + 两枚版本胶囊把标题压成省略号；②我为救它把右组改成可换行 ⇒ 页头变两行，
   * owner 否掉：「需要做到一行装得下，文字也不会变成省略号（起码标题不能变）」。
   * 正解 = 把单行预算做够，而不是让谁换行。三条钉住这个结论，防回潮。 */
  const theme = readFileSync(join(CLIENT, 'theme.ts'), 'utf8');
  assert.ok(/\.af-title \{ margin: 0; font-size: 20px;/.test(theme),
    '标题必须是 20px 面板尺度（30px 是 hero 尺寸，~543px 窄面板里独占 1/3 行宽 ⇒ 只能靠换行收场）');
  const fv = readFileSync(join(COMP, 'first-view-styles.ts'), 'utf8');
  assert.ok(fv.includes('.af-hd-right .dsh-upd-entry-btn'),
    '外部更新包按钮（失败态「更新失败，请查看详情」10 字）必须在页头里收紧：它是 13px 字号 + 4px 12px 内边距 ≈156px');
  assert.ok(/\.af-hd-right \.dsh-upd-entry-btn \{[^}]*font-size: 11\.5px/.test(fv), '收紧到 11.5px（≈133px，与版本胶囊同高）');
  assert.ok(fv.includes('.af-hd { flex-wrap: nowrap; }'), '#78 单行硬约束不得回退（换行＝回潮）');
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  assert.ok(!panel.includes('flex-wrap:wrap') && !panel.includes("'af-hd-right', style:"),
    '页头不得再写行内 flex 覆盖：行内 style 曾把 CSS 的 nowrap 顶成 wrap（真机两行的直接原因）');
});

test('旧面板能力保留：工具栏三钮顺序＋事件制＋文案一字不动', () => {
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  /* 工具栏 ＋ 已退场（T6a 重做）：同一个「新建」不再有第三个入口——绿框页头 ＋（随层）
   * 与底部上下文主操作接管；棘轮在此显式释放，理由写进断言名与注释（2026-10-13）。 */
  assert.ok(panel.includes('radarBtn, adoptBtn, refreshBtn'), '按钮顺序（舰队、串门搬家、刷新）');
  assert.ok(!panel.includes('plusBtn'), '工具栏不得再留 ＋ 入口');
  assert.ok(panel.includes('ADOPT_VIEW_EVENT'), '串门搬家事件保留');
  assert.ok(panel.includes('FLEET_VIEW_EVENT'), '舰队事件保留');
  assert.ok(panel.includes('UPDATE_CENTER_HOST_EVENT'), '更新中心挂载保留');
  assert.ok(!panel.includes('features/adopt') && !panel.includes('home-assistant'), '面板不直引特性');
  const copy = readFileSync(join(COMP, 'first-view-copy.ts'), 'utf8');
  assert.ok(!copy.includes('新建家'), '文案文件冻结（新串只进新文件）');
});

test('解耦：新文件不引特性、不自开轮询、不直写 localStorage', () => {
  /* 绿框解耦面（契约 §1②③）：整包新文件（含删旧文件后的新成员）逐条钉。 */
  const files = [
    join(CLIENT, 'data', 'home-model.ts'),
    join(COMP, 'home-ops.ts'),
    join(COMP, 'home-ui-styles.ts'),
    join(COMP, 'home-icons.ts'),
    join(COMP, 'home-rows.ts'),
    join(COMP, 'home-frame.ts'),
    join(COMP, 'home-detail.ts'),
    join(COMP, 'home-forms.ts'),
    join(COMP, 'home-pop.ts'),
    join(COMP, 'panel-body.ts'),
    join(COMP, 'panel-data.ts'),
  ];
  const code = strip(files.map((f) => {
    assert.ok(existsSync(f), '解耦清单里的文件必须存在：' + f);
    return readFileSync(f, 'utf8');
  }).join('\n'));
  assert.ok(!code.includes('features/'), '禁引特性层');
  assert.ok(!code.includes('setInterval'), '禁自开轮询');
  /* 静态扫描之外再加一层运行时网：真被调用过（假计时器记了账）同样是自开轮询，且这条失败不会把整套拖成挂起。 */
  assert.deepEqual(intervalCalls, [], '模块装载期不得调用 setInterval（呈现层不许自开轮询）');
  assert.ok(!code.includes('localStorage'), '禁直写 localStorage');
  /* 绿框渲染层是纯 h() DOM（React 只在装配壳 panel.ts）：引 React ⇒ 组件层就绑死了宿主渲染器。 */
  assert.ok(!code.includes("from 'react'") && !code.includes('from "react"'), '绿框渲染层不引 React');
  /* 呈现层只渲染不写：写管道（home-ops / home.* 端点）只能经 panel-body / home-forms 注入的 ops 抵达。 */
  for (const f of ['home-rows.ts', 'home-frame.ts', 'home-detail.ts']) {
    assert.doesNotMatch(strip(readFileSync(join(COMP, f), 'utf8')), /from\s+['"][^'"]*home-ops['"]/,
      f + ' 只渲染不写（不许直连写管道 home-ops）');
  }
});

/* —— 液签几何（真机反馈：一级目录反复动画/抖动 + 液签比 chip 高）——
 * 行为断言而非源码 grep：给 crumbs/chip 装假布局矩形，跑**真 slideTab**，量它落到 tab 上的宽高位移。
 * 旧实现只设 width/translateX、高度交给 CSS 的 top/bottom 内缩 ⇒ 液签比 chip 高 4px（Δtop=-2）。 */
test('液签：宽高位移全部取自 chip 实测矩形（不再比 chip 高 4px），且瞬时落位不触发滑动动画', async () => {
  const frame: any = (() => {
    try { return boxReq('./components/home-frame.js'); } catch { return boxReq('./home-frame.js'); }
  })();
  const mk = (): any => {
    const crumbs: any = domDoc.createElement('div');
    const tab: any = domDoc.createElement('span');
    const chip: any = domDoc.createElement('button');
    crumbs.querySelector = (sel: string) => (String(sel).indexOf('hu-crumb') >= 0 ? chip : null);
    crumbs.scrollLeft = 0;
    crumbs.getBoundingClientRect = () => ({ left: 100, top: 200, width: 540, height: 41.25 });
    chip.getBoundingClientRect = () => ({ left: 112, top: 208, width: 46.38, height: 25.25 });
    return { crumbs, tab, chip };
  };
  /* rAF 在 node 侧默认不存在（存在时才是异步恢复）⇒ 装一个捕获队列，才能断言「先 none、落位后恢复」。 */
  const rafQueue: Array<() => void> = [];
  const prevRaf = (globalThis as any).requestAnimationFrame;
  (globalThis as any).requestAnimationFrame = (fn: () => void) => { rafQueue.push(fn); return rafQueue.length };
  const a = mk();
  frame.slideTab(a.crumbs, a.tab, true);
  assert.equal(a.tab.style.width, '46.38px', '液签宽 = chip 宽');
  assert.equal(a.tab.style.height, '25.25px', '液签高必须 = chip 高（旧实现缺这行 ⇒ 高出 4px）');
  assert.equal(a.tab.style.transform, 'translate(12px, 8px)', '位移取 chip 相对 crumbs 的左上角（旧实现只给 X）');
  assert.equal(a.tab.style.transition, 'none', '瞬时落位那一刻不得有过渡（否则重建面包屑时液签会从 0 位滑过来）');
  rafQueue.splice(0).forEach((fn) => fn());
  assert.notEqual(a.tab.style.transition, 'none', '落位后必须恢复过渡：层级切换才有滑动动画');
  (globalThis as any).requestAnimationFrame = prevRaf;

  const b = mk();
  frame.slideTab(b.crumbs, b.tab, false);
  assert.notEqual(b.tab.style.transition, 'none', '层级切换（instant=false）不得禁用过渡');

  /* 没有 aria-current（例如渠道模式无焦点）时液签隐藏，不得残留上一次的宽度。 */
  const c = mk();
  c.crumbs.querySelector = () => null;
  frame.slideTab(c.crumbs, c.tab, true);
  assert.ok(c.tab.attributes.get('hidden') !== undefined, '无当前层时液签必须隐藏');

  /* CSS 不得再用 top/bottom 内缩：几何全部由 JS 按实测矩形给。 */
  const css = readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8');
  const rule = /\.hu-tablk\{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.ok(rule.indexOf('bottom:6px') < 0 && rule.indexOf('top:6px') < 0, '液签不得再用 top/bottom 内缩');
  assert.ok(rule.indexOf('top:0') >= 0 && rule.indexOf('left:0') >= 0, '液签原点必须归零（由 translate 定位）');

  /* 调用点契约：重建面包屑（setFocus）必须瞬时落位；重渲染只在层级没变时瞬时 ⇒ 只有换层才滑动。 */
  const bodySrc = readFileSync(join(COMP, 'panel-body.ts'), 'utf8');
  assert.match(bodySrc, /slideTab\(fresh,[\s\S]*?,\s*true\)/, 'setFocus 重建面包屑必须瞬时落位（否则每次悬停都滑一下）');
  assert.match(bodySrc, /lastLevel === null \|\| lastLevel === level/, '重渲染仅在层级未变时瞬时落位，换层才动画');
});

console.log('features/home-steel: ALL PASS');
