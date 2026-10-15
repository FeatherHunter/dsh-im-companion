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
  join(CLIENT, 'data', 'home-edit.ts'),
  join(CLIENT, 'data', 'home-move.ts'),
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
const editMod: any = req('./home-edit.js');
const moveMod: any = req('./home-move.js');

// —— 宿主 home-store 单独转译（真文件 IO，盘换临时目录） ——
const tmpHost = mkdtempSync(join(tmpdir(), 'home-steel-host-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(HOST, 'home-store.ts'),
    join(HOST, 'rpc.ts'),
    '--ignoreConfig',
    '--rootDir', join(REPO, 'src'),
    '--outDir', tmpHost, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('HOST-TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const reqHost = createRequire(join(tmpHost, 'run.cjs'));
/* 宿主产物统一在 <tmpHost>/host/ 下：tsc 的推断 rootDir 会随 import 图漂（T9 起 rpc 链牵到 src/log-events.ts
 * ⇒ 根上移到 src/），所以上面钉死 --rootDir src，这里也只认这一种落点。 */
const reqHostFile = (f: string): any => reqHost('./host/' + f);
try { symlinkSync(join(REPO, 'node_modules'), join(tmpHost, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }
const homeStore: any = reqHostFile('home-store.js');
/* —— T12 #129：配置文件已改 YAML（写路径只产出 YAML ＋ 顶部注入注释块）⇒ 夹具读盘一律走 YAML 解析。
 * 仍拿 `JSON.parse` 硬啃的话，夹具红在解析（`# ---` 不是 JSON）而不是产品行为上。 —— */
const yamlMod: any = reqHost('yaml');
const readDoc = (file: string): any => yamlMod.parse(readFileSync(file, 'utf8'));

/* —— 绿框渲染链单独转译：真 panel-body 渲染（DOM 桩），让「呈现」这条断言点的是真 DOM 而不是源码文本 —— */
const tmpBox = mkdtempSync(join(tmpdir(), 'home-steel-box-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(COMP, 'panel-body.ts'),
    join(COMP, 'home-refresh.ts'),
    '--ignoreConfig',
    '--rootDir', join(REPO, 'src'),
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
/* toast()（ui/toast）直接吃**全局** requestAnimationFrame：桩里补上，别让「点出来的真 DOM」路径因缺环境报错。 */
(globalThis as any).requestAnimationFrame = (fn: (t?: number) => void): number => setTimeout(() => fn(0), 0) as unknown as number;
try { (globalThis as any).localStorage = domWin.localStorage; } catch { /* read-only 忽略 */ }
/* 呈现层若在模块顶自开轮询，真计时器会吊住事件循环 ⇒ 整套挂死而不是报错。
   换成记账假计时器：让「自开轮询」变成一条能读到名字的断言失败（解耦那条会读 intervalCalls）。 */
const intervalCalls: string[] = [];
(globalThis as any).setInterval = ((fn: any, ms?: any) => { intervalCalls.push(String(ms ?? '')); return 0 }) as any;
const boxReq = createRequire(join(tmpBox, 'run.cjs'));
/* tsc 的推断 rootDir 随 import 图变：上面已钉死 --rootDir src ⇒ 产物在 client/components/ 下；
 * 仍两种落点都试，避免再换一次 import 就 ENOENT。 */
const bodyMod: any = (() => {
  try { return boxReq('./client/components/panel-body.js'); } catch { return boxReq('./components/panel-body.js'); }
})();
/* 弹层逻辑状态（开/关）读 pop 模块：遮罩关闭带 130ms 渐隐，DOM 移除是异步的，
 * “关了没”以 homePopOpen() 为准，数 DOM 会误判（T6b #114 实测）。 */
const popMod: any = (() => {
  try { return boxReq('./client/components/home-pop.js'); } catch { return boxReq('./components/home-pop.js'); }
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
/** 弹层里的按钮按文案找：按钮从底部行搬进标题栏（owner 2026-10-15）后 DOM 顺序变了，不许再用下标。 */
const popBtn = (pop: any, label: string): any => (pop ? cls(pop, 'hu-pbtn-s').find((b: any) => txt(b) === label) ?? null : null);

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

test('缺口判定：任一工作区缺家→补；齐→静默；新 bot→补', () => {
  assert.equal(model.seedGap([W({})], [], [], []), true);
  assert.equal(model.seedGap([], [B({})], [], []), true);
  assert.equal(model.seedGap([], [], [], []), false);
  assert.equal(model.seedGap([W({})], [B({})], [H({})], [A({})]), false);
  assert.equal(model.seedGap([W({})], [B({}), B({ botId: 'b2' })], [H({})], [A({})]), true);
  /* T10 #124（owner 裁定 2026-10-15）：家＝工作区的镜像 ⇒ 任何工作区缺家都要自动补同名家。
   * 于是「用已有工作区」支路没有存在意义（工作区刚被 DSH 加进来就会被补家），整个分段退场。 */
  assert.equal(model.seedGap(
    [W({}), W({ workspaceId: 'ws-9', path: 'D:\\agents\\new', title: '新区' })],
    [B({})], [H({})], [A({})]), true, '任何缺家工作区都要自动补同名家（T10 #124）');
  /* T10 #124 验收②的原形：DSH 里新建一个工作区、**没有任何机器人**（旧规则在这里必漏补）。 */
  assert.equal(model.seedGap(
    [W({}), W({ workspaceId: 'ws-new', path: 'D:\\agents\\fresh', title: '新房间' })],
    [], [H({})], []), true, '无机器人的新工作区也必须补家（T10 #124 验收②）');
  assert.equal(model.seedGap([W({}), W({ workspaceId: 'ws-new', path: 'D:\\agents\\fresh' })], [], [H({}), H({ id: 'h2', workspaceId: 'ws-new', path: 'D:\\agents\\fresh' })], []), false,
    '补过之后再判＝齐（幂等，不会每轮重种）');
});

test('T6b 改名配图纯逻辑：user 覆盖/恢复默认/非法拒收（验收①②）', () => {
  const h1: any = editMod.applyHomeUpdate(H({}), { name: '湖畔小屋' }, 7);
  assert.ok(h1 && h1.name === '湖畔小屋' && h1.nameSource === 'user' && h1.updatedAt === 7);
  const h2: any = editMod.applyHomeUpdate(H({ name: '旧', nameSource: 'user' }), { name: '  ' }, 7);
  assert.ok(h2 && h2.name === '' && h2.nameSource === 'system', '空名＝恢复默认（跟工作区走）');
  const h3: any = editMod.applyHomeUpdate(H({}), { avatar: '3' });
  assert.ok(h3 && h3.avatar === '3' && h3.avatarSource === 'user');
  const h4: any = editMod.applyHomeUpdate(H({ avatar: '3', avatarSource: 'user' }), { avatar: null });
  assert.ok(h4 && h4.avatar === null && h4.avatarSource === 'default');
  assert.equal(editMod.applyHomeUpdate(H({}), { avatar: '9' }), null, '非法配图拒收');
  assert.equal(editMod.applyHomeUpdate(H({}), { avatar: 'red' }), null, '非法配图拒收');
  const h5: any = editMod.applyHomeUpdate(H({}), { name: 'x'.repeat(100) });
  assert.equal(h5.name.length, 64, '名字截断 64');
  const a1: any = editMod.applyAssistantUpdate(A({ name: '旧', nameSource: 'user' }), { name: '' });
  assert.ok(a1 && a1.name === '' && a1.nameSource === 'bot', '已绑恢复默认→走机器人名');
  const a2: any = editMod.applyAssistantUpdate(
    A({ botId: null, status: 'unbound', name: '旧', nameSource: 'user' }), { name: '' });
  assert.ok(a2 && a2.nameSource === 'home', '未绑恢复默认→走家名');
  assert.equal(editMod.isAvatarCode('1'), true);
  assert.equal(editMod.isAvatarCode('6'), true);
  assert.equal(editMod.isAvatarCode('0'), false);
  assert.equal(editMod.isAvatarCode(''), false);
  assert.equal(editMod.isAvatarCode(null), false);
  assert.equal(editMod.trimName('  ab  '), 'ab');
});

test('T6b 未绑定占位纯逻辑：channel 必填、无号不占号（验收③）', () => {
  const u: any = editMod.makeUnboundAssistant({ homeId: 'h1', channel: 'feishu', name: '' }, 5);
  assert.ok(u && u.botId === null && u.status === 'unbound' && u.boundAt === null
    && u.channel === 'feishu' && u.nameSource === 'home' && u.createdAt === 5);
  const u2: any = editMod.makeUnboundAssistant({ homeId: 'h1', channel: 'feishu', name: '小梨' });
  assert.ok(u2 && u2.name === '小梨' && u2.nameSource === 'user');
  assert.equal(editMod.makeUnboundAssistant({ homeId: 'h1', channel: '' }), null);
  assert.equal(editMod.makeUnboundAssistant({ homeId: '', channel: 'feishu' }), null);
});

test('T6b 占位绑定纯逻辑：只收未绑、一对一、user 名保留（验收③④）', () => {
  const bound = A({ id: 'a1' });
  const u: any = editMod.makeUnboundAssistant({ homeId: 'h1', channel: 'qq', name: '' }, 1);
  u.id = 'a2';
  const ok: any = editMod.applyBind(u, { channel: 'qq', botId: 'b9', botName: '野号', homeText: '客厅' }, [bound, u], 9);
  assert.ok(ok && ok.status === 'bound' && ok.botId === 'b9' && ok.name === '野号'
    && ok.nameSource === 'bot' && ok.boundAt === 9);
  const u3 = { ...u, id: 'a3', channel: 'feishu' };
  assert.equal(editMod.applyBind(u3, { channel: 'feishu', botId: 'b1' }, [bound, u3]), null, '同号同道已绑→拒收');
  assert.equal(editMod.applyBind(bound, { channel: 'feishu', botId: 'b2' }, [bound]), null, '已绑→拒收再绑');
  const u4 = { ...u, id: 'a4', name: '专属', nameSource: 'user' };
  const ok4: any = editMod.applyBind(u4, { channel: 'qq', botId: 'b8', botName: '机器名' }, [bound, u4]);
  assert.ok(ok4 && ok4.name === '专属' && ok4.nameSource === 'user', '绑定不丢用户改名');
});

test('T6b 宿主改名配图/占位/绑定/删除：落盘真写、删不断连（验收①③④）', async () => {
  const homeEdit: any = reqHostFile('home-edit.js');
  const dir = mkdtempSync(join(tmpdir(), 'hs-t6b-'));
  const file = join(dir, 'homes.yaml');
  const r1: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  const hid = r1.home.id;
  const uh: any = await homeEdit.updateHomeRow(file, { id: hid, name: '湖畔', avatar: '2' });
  assert.equal(uh.ok, true);
  assert.ok(uh.row.name === '湖畔' && uh.row.nameSource === 'user' && uh.row.avatar === '2' && uh.row.avatarSource === 'user');
  const uh2: any = await homeEdit.updateHomeRow(file, { id: hid, name: '', avatar: null });
  assert.ok(uh2.ok && uh2.row.name === '' && uh2.row.nameSource === 'system' && uh2.row.avatar === null);
  const bad: any = await homeEdit.updateHomeRow(file, { id: hid, avatar: '9' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'bad-request');
  assert.equal((await homeEdit.updateHomeRow(file, { id: hid })).ok, false, '无字段→拒收');
  assert.equal((await homeEdit.updateHomeRow(file, { id: 'nope', name: 'x' })).code, 'not-found');
  const c: any = await homeEdit.createUnboundRow(file, { homeId: hid, channel: 'qq', name: '' });
  assert.equal(c.ok, true);
  assert.ok(c.row.botId === null && c.row.status === 'unbound' && c.row.boundAt === null);
  assert.equal((await homeEdit.createUnboundRow(file, { homeId: 'nope', channel: 'qq' })).code, 'not-found');
  let doc: any = readDoc(file);
  assert.deepEqual(Object.keys(doc.homes[0]).sort(), Object.keys(H({})).sort(), '改名配图不发明字段');
  assert.deepEqual(Object.keys(doc.assistants[0]).sort(), Object.keys(A({})).sort(), '占位不发明字段');
  const b: any = await homeStore.createAssistantRow(file, { homeId: hid, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '' });
  assert.equal(b.ok, true);
  const ua: any = await homeEdit.updateAssistantRow(file, { id: b.assistant.id, name: '' });
  assert.ok(ua.ok && ua.row.nameSource === 'bot', '已绑恢复默认→bot');
  const ua2: any = await homeEdit.updateAssistantRow(file, { id: c.row.id, name: '' });
  assert.ok(ua2.ok && ua2.row.nameSource === 'home', '未绑恢复默认→home');
  const bd: any = await homeEdit.bindAssistantRow(file, { id: c.row.id, channel: 'qq', botId: 'b9', botName: '野号' });
  assert.equal(bd.ok, true);
  assert.ok(bd.row.status === 'bound' && bd.row.name === '野号' && bd.row.nameSource === 'bot');
  assert.equal((await homeEdit.bindAssistantRow(file, { id: bd.row.id, channel: 'qq', botId: 'b8' })).ok, false, '已绑→拒收');
  const c2: any = await homeEdit.createUnboundRow(file, { homeId: hid, channel: 'qq' });
  const clash: any = await homeEdit.bindAssistantRow(file, { id: c2.row.id, channel: 'qq', botId: 'b9' });
  assert.equal(clash.ok, false);
  assert.equal(clash.code, 'already-bound');
  const rm: any = await homeEdit.removeAssistantRow(file, { id: bd.row.id });
  assert.equal(rm.ok, true);
  const doc2: any = await homeStore.loadHomesDoc(file);
  assert.ok(!doc2.assistants.some((x: any) => x.id === bd.row.id), '删后行不在');
  assert.equal(doc2.assistants.length, 2, '只少一行（b1 已绑＋c2 占位都在）');
  assert.equal((await homeEdit.removeAssistantRow(file, { id: 'nope' })).code, 'not-found');
  /* 删不断连的结构保证：宿主改行层没有任何机器人 RPC 可调（不断连、不断开）。
   * 注释里会提到“不断连”做说明 ⇒ 先剥注释再查，查的是真调用。 */
  const hostEditSrc = readFileSync(join(HOST, 'home-edit.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!hostEditSrc.includes('deleteBot') && !hostEditSrc.includes('disconnect') && !hostEditSrc.includes('bot.delete'),
    '宿主 home-edit 无机器人断连调用');
  assert.ok(hostEditSrc.match(/^import .*$/gm)?.every((l) => l.includes('home-store')),
    '宿主 home-edit 只引 home-store（同队列落盘，无旁路）');
});

test('T6b 绿框呈现：家设置弹层改名＋配图、绑定弹层可开（验收①③）', () => {
  const { bodyEl } = renderBox();
  const renameBtn = byAttr(rowsOf(bodyEl)[0], 'data-item-act', 'rename-h')[0];
  assert.ok(renameBtn && !off(renameBtn));
  clickEl(renameBtn);
  const pop = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop, '点重命名→家设置弹层');
  assert.ok(txt(pop).includes('家设置'));
  assert.equal(cls(pop, 'hu-avopt').length, 8, '配图行＝默认＋6 色＋图片格（T11 #128 收编）');
  assert.equal(cls(pop, 'hu-avimg-cell').length, 1, '图片格在色板行里（第 8 格）');
  assert.ok(!txt(pop).includes('清除图片'), '无图时不出现「清除图片」（回落预设色＝默认态）');
  assert.ok(txt(pop).includes('恢复默认'));
  clickEl(cls(domDoc.body, 'hu-scrim')[0]);
  assert.equal(popMod.homePopOpen(), false, '点遮罩→弹层逻辑关闭（DOM 渐隐 130ms 后移除）');
  popMod.closeHomePop(true);
  /* L1→L2→未绑助理行点绑机器人→绑定弹层（空闲号 野号 可选） */
  clickEl(rowsOf(bodyEl)[0]);
  const l2rows = rowsOf(bodyEl);
  const bindBtn = byAttr(l2rows[1], 'data-item-act', 'bind-a')[0];
  assert.ok(bindBtn && !off(bindBtn));
  clickEl(bindBtn);
  const pop2 = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop2 && txt(pop2).includes('绑定机器人') && txt(pop2).includes('野号'), '绑定弹层列出空闲机器人');
  clickEl(cls(domDoc.body, 'hu-scrim')[0]);
  assert.equal(popMod.homePopOpen(), false);
  popMod.closeHomePop(true);
});

test('T6b 两步删除：首点布防、次点真删且只走行删除（验收④）', () => {
  const removed: string[] = [];
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state: { homes: BOX_HOMES, assistants: BOX_ASSTS, bots: BOX_BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => BOX_WS,
    ops: { createHome: async () => {}, createAssistant: async () => {}, connect: () => {}, removeAssistant: async (id: string) => { removed.push(id); } },
    onRetry: () => {},
  });
  handle.render();
  clickEl(rowsOf(bodyEl)[0]);
  clickEl(rowsOf(bodyEl)[0]);
  assert.ok(one(bodyEl, 'hu-detail'), 'L3 详情在');
  const ra = byAttr(bodyEl, 'data-item-act', 'rename-a')[0];
  assert.ok(ra && !off(ra));
  clickEl(ra);
  const pop = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop && txt(pop).includes('助理设置'));
  const links = cls(pop, 'hu-plink');
  const del = links.find((b: any) => txt(b).includes('删除助理'));
  assert.ok(del, '助理设置弹层有删除助理（恢复默认旁，不再是假按钮）');
  assert.equal(cls(pop, 'hu-avopt').length, 8, '助理设置弹层也有配图行＝默认＋6 色＋图片格（T11 #128）');
  assert.equal(cls(pop, 'hu-avimg-cell').length, 1, '助理侧上传口与家设置共用 avatarImageCell（不是两份实现）');
  clickEl(del);
  assert.ok(txt(del).includes('再点一次确认删除') && removed.length === 0, '首点只布防不删除');
  clickEl(del);
  assert.deepEqual(removed, ['a1'], '次点真删（只调行删除）');
  popMod.closeHomePop(true);
  /* 结构保证：remove-a 分支只调行删除，不碰连接。 */
  const lines = readFileSync(join(COMP, 'panel-body.ts'), 'utf8').split('\n');
  const at = lines.findIndex((l) => l.includes("kind === 'remove-a'"));
  const branch = lines.slice(at, at + 3).join('\n');
  assert.ok(branch.includes('removeAssistant') && !branch.includes('disconnect') && !branch.includes('connect('),
    'remove-a 分支只走行删除');
});

test('全程只走 T3 模型，不另发明字段（验收④）：产出行与落盘行的键集合都钉死（可执行）', async () => {
  /* 旧的写法只 grep 源码文本（读文件找 "extra"/"customField"），既不执行也不看落盘结果。
   * 这里改成可执行断言：T3 记录（H/A 夹具）的键集合就是唯一合法集合，
   * 纯逻辑产出的行、以及真正写进 homes.yaml 的行，多一个字段都算「另发明」。 */
  const HOME_KEYS = Object.keys(H({})).sort();
  const ASST_KEYS = Object.keys(A({})).sort();
  const home: any = model.createHome({ workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' }, 1);
  assert.ok(home && home.id, 'createHome 应产出家');
  assert.deepEqual(Object.keys(home).sort(), HOME_KEYS, '纯逻辑家行键集合必须等于 T3');
  const asst: any = model.createAssistant({ homeId: home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '客厅' }, [], 1);
  assert.ok(asst && asst.id, 'createAssistant 应产出助理');
  assert.deepEqual(Object.keys(asst).sort(), ASST_KEYS, '纯逻辑助理行键集合必须等于 T3');

  const dir = mkdtempSync(join(tmpdir(), 'home-steel-shape-'));
  const file = join(dir, 'homes.yaml');
  const r1: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.equal(r1.ok, true);
  /* 每次写完立刻读盘断言——若只等两次写之后再读，未知字段会被下一次 load 的净化顺手抹掉，
   * 断言就成了「测不到」的空转（这是真踩到的：先加的 extraField 被下一轮 load 洗掉了）。 */
  let doc: any = readDoc(file);
  assert.equal(doc.version, 2, '新表版本号是 2');
  assert.deepEqual(Object.keys(doc.homes[0]).sort(), HOME_KEYS, '落盘家行键集合必须等于 T3');
  const r2: any = await homeStore.createAssistantRow(file, { homeId: r1.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '客厅' });
  assert.equal(r2.ok, true);
  doc = readDoc(file);
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
  const file = j(dir, 'homes.yaml');
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
  const file = j(dir, 'homes.yaml');
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
  const file = j(dir, 'homes.yaml');
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
  /* T12 #129：`meta.*` 的 case 块整体搬去 `rpc-meta.ts`（rpc.ts 顶 300 行红线）——「旧码不动」的钉子
   * 因此从「字面 case 在 rpc.ts」改成「rpc.ts 仍派发给它」＋「case 块在新文件里一字未改」。 */
  const metaRpcSrc = readFileSync(join(REPO, 'src', 'host', 'rpc-meta.ts'), 'utf8');
  assert.ok(rpcSrc.includes('handleMetaCase(endpoint, p, store)'), '旧 meta 派发仍在（搬到 rpc-meta 后原位接线）');
  assert.ok(metaRpcSrc.includes("case 'meta.get':"), '旧 case 仍在（rpc-meta.ts）');
  const metaSrc = readFileSync(join(REPO, 'src', 'host', 'meta-store.ts'), 'utf8');
  assert.ok(metaSrc.includes('version: 1'), '旧表 version:1 不动');
  assert.ok(!metaSrc.includes('homes.json'), '旧文件不碰新表文件');
});

/* 真分发器执行（补掉「只 grep 源码 case」的空档）：走 src/host/rpc.ts 的真 switch，
 * 而不是直接调 home-store 的函数，也不是断言源码里有 "case 'home.seed': {"。 */
test('宿主分发器真跑：ping → home.create → assistant.create → home.list → 一对一拒绝 → home.seed', async () => {
  const { AgentMetaStore } = reqHostFile('meta-store.js');
  const { createAgentFleetHandler } = reqHostFile('rpc.js');
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
  const file = join(dshHome, 'integrations', 'dsh-im-companion', 'homes.yaml');
  const doc: any = readDoc(file);
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
  const GREEN = ['home-ui-styles.ts', 'home-icons.ts', 'home-rows.ts', 'home-frame.ts', 'home-detail.ts', 'home-forms.ts', 'home-dir.ts', 'home-dir-form.ts', 'home-pop.ts', 'home-ops.ts', 'home-move-ops.ts', 'home-move-forms.ts', 'home-refresh.ts', 'panel-body.ts'];
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
   * 呈现策略（非数据规则）：有助理的家在前、空家在后直接成行（折叠退场，owner 2026-10-15）。 */
  assert.ok(one(bodyEl, 'home-ui'), '绿框根 .home-ui 必须在');
  assert.deepEqual(ttl(), { b: '家', small: '2 个 · 每个家对应一个工作区' }, 'L1 页头标题/副标');
  assert.equal(cls(bodyEl, 'hu-back').length, 0, 'L1 不显示返回键（原型：最上层无返回）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L2', 'L2'], '家行带 data-open="L2"（空家也是行）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['h1', 'h2'], '两行都在（T3 一区一家含无人之家仍成立）');
  assert.equal(cls(bodyEl, 'hu-more-row').length, 0, '折叠行退场（owner 2026-10-15：空家直接成行）');
  assert.equal(cls(bodyEl, 'hu-dots').length, 2, '圆点条每家一行：有助理画圆点、空家画空心标记（owner 2026-10-15 真机）');
  assert.equal(cls(one(rows()[0], 'hu-dots'), 'hu-dot').length, 2, '一助理一圆点（h1 两位助理两圆点）');
  assert.equal(cls(one(rows()[0], 'hu-dots'), 'hu-dot').filter((d) => d.classList.contains('on')).length, 1, '绿＝在线（a1 已绑在线）');
  assert.equal(cls(one(rows()[0], 'hu-dots'), 'hu-dot').filter((d) => d.classList.contains('off')).length, 1, '红＝离线/未绑定（a2 无渠道）');
  assert.ok(cls(one(rows()[0], 'hu-dots'), 'hu-dot').every((d) => String(d.getAttribute?.('data-tip') ?? '').length > 0), '圆点悬停报名字＋状态');
  const zeroDots = cls(one(rows()[1], 'hu-dots'), 'hu-dot');
  assert.equal(zeroDots.length, 1, '空家（h2）只配一枚空心标记');
  assert.ok(zeroDots[0].classList.contains('zero'), '空心标记带 zero 类');
  assert.equal(String(zeroDots[0].getAttribute?.('data-tip') ?? ''), '暂无助理', '空心标记悬停“暂无助理”');
  for (const c of ['hu-av', 'hu-txt', 'hu-nm', 'hu-sub', 'hu-names', 'hu-acts2']) assert.ok(one(rows()[0], c), '家行解剖缺件：' + c);
  assert.deepEqual(crumbInfo(bodyEl), [
    { lv: 'L1', label: '家', cur: true, goto: null },
    { lv: 'L2', label: '助理 · 客厅', cur: false, goto: 'L2' },
    { lv: 'L3', label: '机器人 · 小帅', cur: false, goto: 'L3' },
  ], '链路条三级：当前层 aria-current，后两级带默认去处（列表第一个，见「面包屑默认路径」）');
  assert.ok(cls(bodyEl, 'hu-crumb').slice(1).every((c) => !c.getAttribute('aria-disabled')),
    '无焦点时后两级必须可点即进（owner：点击 tab 后就自动进去）');
  assert.equal(txt(foot()), '新建家', 'L1 底部主操作＝新建家');
  /* 命名回落（渲染口径）：手改名冻结＞工作区标题＞目录名，副标如实标出来源 */
  assert.equal(txt(tag(one(rows()[0], 'hu-nm'), 'b')), '客厅', '家名回落：没手改 ⇒ 用工作区标题');
  assert.ok(txt(one(rows()[0], 'hu-sub')).includes('跟随工作区名'), '副标标出来源：跟随工作区名');
  assert.equal(txt(tag(one(rows()[1], 'hu-nm'), 'b')), '书房基地', '家名冻结：手改过就不跟工作区（书房）');
  assert.ok(txt(one(rows()[1], 'hu-sub')).includes('你改过的名字'), '副标标出来源：你改过的名字');
  /* T6b #114：家行重命名/更多已启用（开家设置弹层：改名＋配图＋恢复默认） */
  assert.equal(cls(bodyEl, 'hu-ract').length, 4, 'L1 家行两枚行动作 ×2 行');
  assert.ok(cls(bodyEl, 'hu-ract').every((b) => !off(b)), '家行的重命名/更多全部可用');
  assert.ok(cls(bodyEl, 'hu-ract').every((b) => !b.classList.contains('planned')), 'L1 不再有 planned 假按钮');

  /* 点家行 → L2（钻取，不是展开）：页头换家名、返回键出现、行变助理、底部换「新建助理」 */
  clickEl(rows()[0]);
  assert.deepEqual(ttl(), { b: '客厅', small: '跟随工作区名 · 2 位助理' }, 'L2 页头＝家名＋回落来源');
  assert.equal(cls(bodyEl, 'hu-back').length, 1, 'L2 出现返回键 .hu-back');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L3', 'L3'], '助理行带 data-open="L3"（再点进一级）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['a1', 'a2'], '助理行带助理 id');
  assert.equal(txt(curCrumb(bodyEl)), 'L2客厅', '当前层＝L2 家（链路条跟着钻取走）');
  assert.equal(txt(foot()), '新建助理', 'L2 底部主操作＝新建助理');
  assert.ok(txt(rows()[0]).includes('已绑') && txt(rows()[0]).includes('小帅'), '已绑助理行：机器人名回落＋已绑章');
  assert.ok(!off(one(rows()[1], 'hu-ract')) && txt(one(rows()[1], 'hu-ract')) === '绑定机器人',
    '未绑助理的「绑定机器人」可用（开绑定弹层，T6b #114）');

  /* 点助理行 → L3 详情：T6b #114 接入/详情/改名·头像/删除助理全可用；T6c #115 换工作区/移除渠道已启用 */
  clickEl(rows()[0]);
  assert.ok(one(bodyEl, 'hu-detail'), 'L3 详情卡 .hu-detail 必须在');
  const acts = cls(bodyEl, 'hu-abtn');
  assert.deepEqual(acts.filter((b) => !off(b)).map((b) => txt(b)), ['接入', '详情', '改名·头像', '删除助理', '换工作区', '移除渠道'], 'L3 六枚全可用（已绑助理，T6c #115）');
  assert.equal(acts.filter(off).length, 0, 'L3 无禁用钮');
  assert.deepEqual(acts.map((b) => b.getAttribute('data-item-act')), ['connect-a', 'detail-a', 'rename-a', 'remove-a', 'move-a', 'unbind-a'], '行动作 data-item-act 口径');
  assert.equal(cls(bodyEl, 'hu-soon').length, 0, '待实现清单退场（#115 落地，无 planned 假按钮）');
  assert.equal(txt(one(one(bodyEl, 'hu-chain'), 'on')), '机器人名', '命名链高亮命中来源（nameSource=bot）');
  assert.equal(txt(foot()), '返回助理列表', 'L3 已绑：底部主操作＝返回助理列表');

  /* L3 未绑：底部主操作是可用的「绑定机器人」（同一层随绑定状态变，T6b #114） */
  clickEl(one(bodyEl, 'hu-back'));
  clickEl(rows()[1]);
  assert.equal(txt(foot()), '绑定机器人', 'L3 未绑：底部主操作＝绑定机器人');
  assert.ok(!off(foot()), '未绑的绑定钮可用（开绑定弹层）');
  assert.ok(txt(one(bodyEl, 'hu-detail')).includes('还没绑机器人'), 'L3 未绑详情卡走占位文案');
  const actsU = cls(bodyEl, 'hu-abtn');
  assert.deepEqual(actsU.filter((b) => !off(b)).map((b) => txt(b)), ['绑定机器人', '详情', '改名·头像', '删除助理', '换工作区'], 'L3 未绑五枚可用（无移除渠道，T6c #115）');

  /* 面包屑可向前钻取：点 L1 章回到 L1 */
  clickEl(byAttr(bodyEl, 'data-goto', 'L1')[0]);
  assert.deepEqual(ttl(), { b: '家', small: '2 个 · 每个家对应一个工作区' }, '面包屑点回 L1（链路条可向前钻取）');
  assert.equal(txt(foot()), '新建家', '回 L1 后底部主操作跟着回到新建家');

  /* 空态：进没有助理的家 → .hu-empty（不是空白列表） */
  clickEl(rows()[1]);
  assert.equal(txt(tag(one(bodyEl, 'hu-empty'), 'b')), '这个家还没有助理', '空家走 .hu-empty 空态');
  assert.ok(txt(one(bodyEl, 'hu-empty')).includes('点下面的「新建助理」'), '空态给出下一步');
  assert.equal(txt(foot()), '新建助理', '空家 L2 底部主操作仍是新建助理');

  /* 建单：L2「新建助理」→ body 级 popover（选家＋选空闲机器人）；L1「新建家」→ 选目录（T10 #124 起唯一支路） */
  clickEl(foot());
  const pop = one(domDoc.body, 'hu-pophost');
  assert.ok(pop && pop.classList.contains('home-ui'), '弹层挂 body portal 且宿主带 .home-ui（作用域不破）');
  assert.ok(one(pop, 'hu-scrim') && one(pop, 'hu-pop') && one(pop, 'hu-ppo'), '弹层结构＝.hu-scrim + .hu-pop > .hu-ppo');
  assert.equal(txt(one(pop, 'hu-ptitle')), '新建助理', '弹层标题＝新建助理');
  const head = one(pop, 'hu-phead');
  assert.ok(head && one(head, 'hu-ptitle') && cls(head, 'hu-pbtn-s').length === 2, '标题栏＝标题 + 取消/创建同一行（按钮在弹层右上角，owner 2026-10-15）');
  assert.deepEqual(cls(pop, 'hu-fld').map((f) => txt(tag(f, 'span'))), ['属于哪个家', '绑定机器人', '名字'], '建单字段');
  /* 家内建助理（L2 开的这一单）：归属锁死——无家候选可点，直接告知当前家（h2 书房基地） */
  assert.equal(byAttr(pop, 'data-value', 'h1').length + byAttr(pop, 'data-value', 'h2').length, 0, '锁家：无家候选可点');
  assert.ok(txt(pop).includes('书房基地'), '归属告知当前家');
  assert.deepEqual(byAttr(pop, 'data-value', 'b9').map((o) => txt(tag(o, 'b'))), ['野号'], '空闲机器人是候选：已绑的 b1 不进下拉');
  const later = byAttr(pop, 'data-value', '')[0];
  assert.ok(!off(later), '「以后再绑」可用（未绑定占位，T6b #114）');
  assert.deepEqual(cls(pop, 'hu-pbtn-s').map(txt), ['取消', '创建'], '弹层底钮＝取消 / 创建');
  clickEl(one(bodyEl, 'hu-back'));
  clickEl(foot());
  const pop2 = one(domDoc.body, 'hu-pophost');
  assert.equal(txt(one(pop2, 'hu-ptitle')), '新建家', '回 L1 后底部主操作开的是「新建家」');
  assert.deepEqual(cls(pop2, 'hu-fld').map((f) => txt(tag(f, 'span'))), ['目录'], '建家字段＝目录（T10 #124：分段退场，没有「已有工作区」候选）');
  assert.equal(String(one(pop2, 'hu-fld').nodeName).toLowerCase(), 'div', '候选列表字段也不用 label 包：label 会把悬停/点击转给内部第一个候选按钮');
  assert.equal(byAttr(pop2, 'data-value', 'ws-3').length, 0, '不再有「已有工作区」候选列表（分段整段退场）');
  handle.dispose();

  /* 装配层接线：绿框样式表安装、家表首读；建单入口归绿框自管（A1 不再直连 openCreate） */
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  assert.ok(panel.includes('installHomeUiStyles'), '绿框样式表须在装配层安装');
  assert.ok(panel.includes('loadHomes'), '装配层接线家表首读');
  assert.ok(panel.includes('createPanelBody'), '装配层接线绿框 body');
  assert.ok(!panel.includes('openCreate'), 'A1 不再直连建单入口（绿框页头 ＋ 与底部主操作自管）');
  assert.ok(!strip(panel).includes('compose.el'), '旧 compose 新建条退役（文件保留供回归钉）');
});

test('T7 #112 弹层三处加固：未选目录时创建显式禁用、宿主进 top layer、面板 dispose 回收悬空弹层', async () => {
  /* 真机实测（#112）：13 个工作区全都有家 ⇒ 点「创建」静默 return（读成「没反应」）；
   * 且弹层挂在 body，切走设置页后不随面板卸载。这里把三处加固都按「点出来的真 DOM」钉住。
   * T10 #124（owner 2026-10-15 裁定）：家＝工作区的镜像 ⇒ 分段（用已有工作区/新建工作区）退场，
   * 建家永远是「选目录 → DSH 新建工作区 → 家永久绑定」。 */
  const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });
  const proto = Object.getPrototypeOf(new El('div', domDoc)) as any;
  const saved = { showPopover: proto.showPopover, hidePopover: proto.hidePopover, matches: proto.matches };
  let shown = 0;
  let hidden = 0;
  proto.showPopover = function (this: any) { shown += 1; this.setAttribute('data-layer', '1'); };
  proto.hidePopover = function (this: any) { hidden += 1; this.setAttribute('data-layer', '0'); };
  proto.matches = function (this: any, sel: string) { return sel === ':popover-open' && this.getAttribute?.('data-layer') === '1'; };
  try {
    /* ① 唯一支路（T10 #124）：目录字段 + 底钮；未选目录时「创建」禁用，不许「点了没反应」 */
    const taken = BOX_HOMES.concat([H({ id: 'h3', workspaceId: 'ws-3', path: 'D:\\agents\\garage', name: '车库' })]);
    const bodyEl = new El('div', domDoc);
    const handle = bodyMod.createPanelBody({
      state: { homes: taken, assistants: BOX_ASSTS, bots: BOX_BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
      bodyEl,
      titleMetaEl: new El('div', domDoc),
      getWorkspaces: () => BOX_WS,
      ops: { createHome: async () => { throw new Error('不该被调用'); }, createAssistant: async () => {}, connect: () => {}, pickDirectory: async () => 'D:\\agents\\newhome' },
      onRetry: () => {},
    });
    handle.render();
    clickEl(one(bodyEl, 'hu-pbtn'));
    let pop = one(domDoc.body, 'hu-pop');
    assert.ok(pop, '底部「新建家」开出弹层');
    assert.equal(cls(pop, 'hu-seg2').length, 0, '分段退场（T10 #124：家＝工作区的镜像，没有第二条支路）');
    assert.equal(cls(pop, 'hu-ind').length, 0, '选中滑块随分段一起退场');
    assert.doesNotMatch(readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8'), /\.hu-seg2/, '样式表不留分段残留');
    assert.deepEqual(cls(one(pop, 'hu-phead'), 'hu-pbtn-s').map(txt), ['取消', '创建'], '标题栏右＝取消 / 创建（按钮在弹层右上角）');
    assert.equal(txt(one(pop, 'hu-dirpath')), '还没有选择目录', '未选目录时路径位显式占位');
    /* owner 2026-10-14：按钮与路径必须**同排一行**（旧版两行：按钮一行 + 虚线占位一行） */
    assert.equal(cls(pop, 'hu-dirrow').length, 1, '目录字段只有一个行容器');
    assert.equal(cls(one(pop, 'hu-dirrow'), 'hu-pbtn-s').length, 1, '行内含「选择目录」按钮');
    assert.equal(cls(one(pop, 'hu-dirrow'), 'hu-dirpath').length, 1, '路径位与按钮同一行，不再另起一行');
    assert.ok(txt(pop).includes('选中的目录会建成 DSH 工作区'), '提示语讲用户得到什么（结果视角），不讲操作流程');
    assert.ok(off(popBtn(pop, '创建')), '未选目录时「创建」显式禁用（不再静默 return＝点了像没反应）');
    assert.ok(!off(popBtn(pop, '取消')), '「取消」仍可用');
    clickEl(popBtn(pop, '创建'));
    assert.ok(one(domDoc.body, 'hu-pop'), '点禁用的「创建」不关弹层、不写表（禁用钮派发 click 也不该有事）');
    /* 选到目录 ⇒ 路径位回填、「创建」解禁（本用例只验弹层自身，不落家） */
    clickEl(byAttr(pop, 'data-act', 'pick-dir')[0]);
    await tick();
    pop = one(domDoc.body, 'hu-pop');
    assert.equal(txt(one(pop, 'hu-dirpath')), 'D:\\agents\\newhome', '选到的目录回填路径位');
    assert.ok(!off(popBtn(pop, '创建')), '选到目录后「创建」可用');

    /* ② 有 Popover API 的宿主：portal 宿主进 top layer（z-index 再高也压不过原生 dialog 层） */
    const host = one(domDoc.body, 'hu-pophost');
    assert.equal(host.getAttribute('popover'), 'manual', '宿主带 popover="manual"');
    assert.ok(shown >= 1, 'showPopover 被调用（进 top layer）');

    /* ③ 面板 body dispose ⇒ portal 弹层回收 + 退出 top layer（不留悬空弹层） */
    handle.dispose();
    assert.equal(one(domDoc.body, 'hu-pop'), null, 'dispose 后弹层回收');
    assert.ok(hidden >= 1, 'hidePopover 被调用（退出 top layer）');

    /* ④ 源码级钉两处顺序/守卫（真机语义在 DOM 桩里量不出来）：
     *    a) 先 showLayer 再 place——宿主带 popover 时未 show 前是 UA display:none，量 pop 只会得 0×0，
     *       place 会退回 width=300/height=320 的猜测值（落位与箭头都偏）；
     *    b) 淡出收层前判 popEl——130ms 内重开弹层时宿主是同一个，旧定时器不能把新弹层一起收掉。 */
    const popSrc = readFileSync(join(COMP, 'home-pop.ts'), 'utf8');
    assert.ok(popSrc.indexOf('showLayer(host)') < popSrc.indexOf('place(pop, anchor)'), '先提层再量位（showLayer 在 place 之前）');
    assert.ok(/if \(!popEl\) \{\s*hideLayer\(hostEl\)/.test(popSrc), '淡出收层前判 popEl（不误收新弹层）');

    /* ⑤ body 级 portal 的令牌作用域（#112 真机第二次目验：弹层整块透明＝--af-* 未定义 ⇒ --hu-* 全失效）。
     *   宿主挂在 .af-root 之外，它的某个类必须落在 theme.ts 令牌作用域选择器表里；两边任何一侧漏了都要红。 */
    assert.ok(one(domDoc.body, 'af-portal'), 'popover 宿主带 af-portal（令牌作用域钩子）');
    const themeSrc = readFileSync(join(CLIENT, 'theme.ts'), 'utf8');
    const scope = themeSrc.slice(themeSrc.indexOf('const CSS = `'), themeSrc.indexOf('${TOKEN_BLOCK}'));
    const inScope = ['af-portal', 'hu-pophost', 'home-ui']
      .filter((c) => cls(domDoc.body, c).length > 0 && new RegExp('\\.' + c + '\\s*[,{]').test(scope));
    assert.ok(inScope.length > 0, '宿主至少一个类在 theme.ts 令牌作用域表里（body 级 portal 必须自带令牌作用域）');
  } finally {
    if (saved.showPopover === undefined) delete proto.showPopover; else proto.showPopover = saved.showPopover;
    if (saved.hidePopover === undefined) delete proto.hidePopover; else proto.hidePopover = saved.hidePopover;
    if (saved.matches === undefined) delete proto.matches; else proto.matches = saved.matches;
  }
});

test('T7 #112 弹层几何纯函数：贴底锚点翻上方、内容变矮不改横向落位、视口夹紧（真机跳位回归）', () => {
  const placeMod: any = (() => {
    try { return boxReq('./client/components/home-place.js'); } catch { return boxReq('./components/home-place.js'); }
  })();
  const vp = { w: 880, h: 980 };
  const footAnchor = { left: 42, top: 700, right: 808, bottom: 738, width: 766, height: 38 };
  const tall = placeMod.computePlacement(vp, footAnchor, { w: 330, h: 330 });
  const short = placeMod.computePlacement(vp, footAnchor, { w: 330, h: 160 });
  assert.equal(tall.below, false, '贴底锚点下方放不下 ⇒ 开在锚点上方');
  assert.equal(short.below, true, '内容变矮后下方放得下 ⇒ 翻到下方（原型行为）');
  assert.equal(tall.left, 260, '横向落位＝锚点中心对齐');
  assert.equal(short.left, tall.left, '内容变矮不许改变横向落位（真机「切分段弹层跳走」就是这条被破坏）');
  assert.ok(tall.top >= 8 && tall.top + 330 <= vp.h - 8, '纵向必须夹在视口内');
  assert.equal(short.top, 747, '下方落位＝锚点底边 + 缝');
  /* 面板下沿约束（真机 #112 第二次目验：贴底按钮的弹层半截挂在设置面板外）。 */
  const bounded = placeMod.computePlacement(vp, footAnchor, { w: 330, h: 160 }, 780);
  assert.equal(bounded.below, false, '面板下沿装不下 ⇒ 开在锚点上方，不许越出面板');
  assert.equal(bounded.top, 700 - 9 - 160, '上方落位＝锚点顶边 − 缝 − 弹层高');
  assert.equal(placeMod.computePlacement(vp, footAnchor, { w: 330, h: 160 }, vp.h).below, true, '面板下沿够宽 ⇒ 仍开下方（行为不回退）');
  /* 强制上方（owner 2026-10-15：「弹窗需要出现在新建按钮的上面」）——贴底主操作永远开在按钮上方。 */
  const forced = placeMod.computePlacement(vp, footAnchor, { w: 330, h: 160 }, vp.h, true);
  assert.equal(forced.below, false, '即使下方放得下，贴底主操作也开在锚点上方');
  assert.equal(forced.top, 700 - 9 - 160, '强制上方落位＝锚点顶边 − 缝 − 弹层高');
  const forcedTop = placeMod.computePlacement(vp, { left: 42, top: 100, right: 808, bottom: 138, width: 766, height: 38 }, { w: 330, h: 160 }, undefined, true);
  assert.equal(forcedTop.top, 8, '上方真放不下 ⇒ 夹到顶边 8px（不翻回按钮下方）');
  /* 宽度跟锚点走（owner 2026-10-14：弹层要与「＋ 新建家」满宽按钮等宽）。 */
  assert.equal(placeMod.widthFor(766, 880), 766, '弹层宽度＝锚点宽度（与满宽按钮等宽）');
  assert.equal(placeMod.widthFor(32, 880), placeMod.POP_MIN_W, '行内小按钮 ⇒ 保底宽度（不压成一条）');
  assert.equal(placeMod.widthFor(2000, 880), 860, '锚点比视口还宽 ⇒ 夹到视口 − 20');
  const low = placeMod.computePlacement(vp, { left: 42, top: 100, right: 808, bottom: 138, width: 766, height: 38 }, { w: 330, h: 160 });
  assert.equal(low.top, 147, '普通情形：开在锚点下方 9px');
  const tiny = placeMod.computePlacement({ w: 300, h: 200 }, { left: 0, top: 150, right: 300, bottom: 180, width: 300, height: 30 }, { w: 280, h: 400 });
  assert.equal(tiny.top, 8, '弹层比视口还高 ⇒ 贴顶（不贴屏幕下沿）');
  const narrow = placeMod.computePlacement({ w: 320, h: 600 }, { left: 0, top: 0, right: 320, bottom: 40, width: 320, height: 40 }, { w: 300, h: 100 });
  assert.equal(narrow.left, 10, '窄视口：左右夹在留边内');
  assert.ok(tall.arrowX >= 12 && tall.arrowX <= 330 - 22, '箭头夹在弹层内');
});

test('T7 #112 锚点被面板重建：弹层收掉，绝不兜底跳位（真机 bug 回归）', () => {
  const mk = (c: string) => { const e = domDoc.createElement('div'); e.className = c; return e; };
  const body = [mk('hu-ptitle')];
  /* ① 解析器取不到锚点 ⇒ 弹层根本不出现（早先会落在「居中 + top:80px」的兜底位，即用户看到的跳位）。 */
  popMod.openHomePop(() => null, { width: 330, label: '新建家', body, foot: [] });
  assert.equal(popMod.homePopOpen(), false, '锚点解析不到 ⇒ 不出现弹层');
  /* ② 锚点游离（面板 render 把它换掉）后重定位 ⇒ 收掉弹层，不跳位。 */
  const a1 = mk('hu-pbtn'); domDoc.body.appendChild(a1);
  popMod.openHomePop(() => a1, { width: 330, label: '新建家', body, foot: [] });
  assert.equal(popMod.homePopOpen(), true, '锚点活着 ⇒ 正常打开');
  a1.remove();
  popMod.updateHomePop({ width: 330, label: '新建家', body, foot: [] });
  assert.equal(popMod.homePopOpen(), false, '锚点已游离 ⇒ 收掉弹层（绝不兜底到默认位置）');
  /* ③ 解析器每次现取 ⇒ 面板重建后仍能贴住新按钮，弹层不收也不跳，且是同一个节点（不重播入场动画）。 */
  let cur = mk('hu-pbtn'); domDoc.body.appendChild(cur);
  popMod.openHomePop(() => cur, { width: 330, label: '新建家', body, foot: [] });
  const node = popMod.homePopNode();
  const a2 = mk('hu-pbtn'); domDoc.body.appendChild(a2); cur = a2;
  popMod.updateHomePop({ width: 330, label: '新建家', body, foot: [] });
  assert.equal(popMod.homePopOpen(), true, '解析器现取 ⇒ 换掉的锚点也能跟上');
  assert.equal(popMod.homePopNode(), node, '就地换内容：同一个 .hu-pop 节点');
  popMod.closeHomePop(true);
});

test('T8 #121 收养：workspaces.create({path}) → 等投影 → canonical 项（失败/超时不返回半成品）', async () => {
  const dirMod: any = boxReq('./client/components/home-dir.js');
  const dir = 'D:\\agents\\newhome';
  const calls: any[] = [];
  let rows: any[] = [];
  const ctxOf = (list: any): any => ({ get: (n: string) => (n === 'workspaces' ? { list } : undefined) });
  /* ① 成功：create 幂等入参 {path}；投影以尾杠/大小写归一化命中（T1 §3 口径） */
  const got = await dirMod.adoptDirectory(ctxOf({
    create: async (input: any) => {
      calls.push(input);
      rows = [{ workspaceId: 'ws-9', path: dir + '\\', title: 'newhome' }];
      return { ok: true, value: { workspace: rows[0], created: true } };
    },
    getSnapshot: () => ({ items: rows }),
  }), dir, 300);
  assert.deepEqual(calls, [{ path: dir }], 'create 入参＝{path}');
  assert.equal(got.ref.workspaceId, 'ws-9', '等投影拿到 canonical 项（尾杠归一化命中）');
  assert.equal(got.created, true, 'created:true 透传');
  /* ② 失败：ok:false ⇒ null（调用方不落家，不许返回半成品） */
  const bad = await dirMod.adoptDirectory(ctxOf({
    create: async () => ({ ok: false, error: { code: 'directory-not-found' } }),
    getSnapshot: () => ({ items: [] }),
  }), dir, 300);
  assert.equal(bad, null, 'create 失败 ⇒ null');
  assert.match(dirMod.takeDirError(), /建工作区失败/, 'create 失败留明文原因（弹层就地显示，验收 5）');
  /* ③ 受理但投影迟迟不出现 ⇒ 有界等待后超时返回 null（不吊死、不写半行） */
  const slow = await dirMod.adoptDirectory(ctxOf({
    create: async () => ({ ok: true, value: { created: true } }),
    getSnapshot: () => ({ items: [] }),
  }), dir, 260);
  assert.equal(slow, null, '投影超时 ⇒ null（可重试）');
});

test('T8 #121 新建家「新建工作区」支路：选目录 → 建区 → 落家（三步顺序；已占不写第二行）', async () => {
  const dir = 'D:\\agents\\newhome';
  const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });
  const taken = BOX_HOMES.concat([H({ id: 'h3', workspaceId: 'ws-3', path: 'D:\\agents\\garage', name: '车库' })]);
  const mkPanel = (adopted: string[], created: string[], ws: any, picks: number[] = [], failCreate = false): any => {
    const bodyEl = new El('div', domDoc);
    const handle = bodyMod.createPanelBody({
      state: { homes: taken, assistants: BOX_ASSTS, bots: BOX_BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
      bodyEl,
      titleMetaEl: new El('div', domDoc),
      getWorkspaces: () => BOX_WS,
      ops: {
        createHome: async (id: string) => { created.push(id); if (failCreate) throw new Error('宿主 500') },
        createAssistant: async () => {},
        connect: () => {},
        pickDirectory: async () => { picks.push(1); return dir },
        adoptDirectory: async (d: string) => { adopted.push(d); return ws; },
      },
      onRetry: () => {},
    });
    handle.render();
    return { bodyEl, handle };
  };

  /* ① 全新目录：选目录（回填路径）→ 创建 ⇒ adopt(目录) → createHome(DSH 回来的 canonical id) */
  const adopted: string[] = [];
  const created: string[] = [];
  const picks: number[] = [];
  const one1 = mkPanel(adopted, created, { workspaceId: 'ws-9', path: dir, title: 'newhome' }, picks);
  clickEl(one(one1.bodyEl, 'hu-pbtn'));
  const pop1 = one(domDoc.body, 'hu-pop');
  assert.deepEqual(cls(one(pop1, 'hu-phead'), 'hu-pbtn-s').map(txt), ['取消', '创建'], '标题栏右＝取消 / 创建；body 只剩目录字段');
  assert.equal(cls(pop1, 'hu-fld').length, 1, '「目录」字段只有一个 .hu-fld（dirField 不许再套一层，否则标签渲染两遍）');
  assert.equal(String(one(pop1, 'hu-fld').nodeName).toLowerCase(), 'div', '目录字段不用 label 包：真机实测 label 会把悬停/点击/焦点转给内部第一个按钮（点框开两次选择器＋按钮假焦点感）');
  /* owner 2026-10-14：虚线输入位＝右侧的路径框本体（与左侧按钮等高同排），不是整行外壳 */
  const dirCss = readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8');
  assert.match(dirCss, /\.hu-dirpath\{[^}]*border:1px dashed/, '虚线输入位落在右侧路径框上');
  assert.doesNotMatch(dirCss, /\.hu-dirrow\{[^}]*border:/, '行容器自身不画框（框＝路径位本体）');
  assert.match(dirCss, /\.hu-dirrow\{[^}]*align-items:stretch/, '左右等高：行容器 stretch');
  assert.match(dirCss, /\.hu-dirpath\.picked\{[^}]*border-style:solid/, '选到目录后框转实线');
  assert.match(dirCss, /\.hu-err\{[^}]*color:/, '失败原因行有自己的颜色（灰字原文要看得见）');
  /* owner 2026-10-14：弹层里每个可点控件都要有交互反馈（hover 变样 / 按下回弹），不许「看着能点、点了没反应」 */
  for (const sel of ['hu-pbtn-s', 'hu-opt', 'hu-plink', 'hu-avopt', 'hu-dirpath']) {
    assert.match(dirCss, new RegExp('\\.' + sel + ':(hover|active)'), '可点控件缺交互态：' + sel);
  }
  assert.equal(String(one(pop1, 'hu-dirpath').className).includes('picked'), false, '未选目录时框是虚线态');
  assert.ok(off(popBtn(pop1, '创建')), '未选目录时「创建」禁用');
  clickEl(byAttr(pop1, 'data-act', 'pick-dir')[0]);
  await tick();
  const pop2 = one(domDoc.body, 'hu-pop');
  assert.equal(txt(one(pop2, 'hu-dirpath')), dir, '所选目录回填到路径位');
  assert.ok(!off(popBtn(pop2, '创建')), '选到目录后「创建」可用');
  /* owner 2026-10-14：框＝控件本体，点框（不只按钮）也能开选择器 */
  clickEl(one(pop2, 'hu-dirpath'));
  await tick();
  assert.equal(picks.length, 2, '点框本身（不只按钮）也能开选择器');
  const popRow = one(domDoc.body, 'hu-pop');
  clickEl(popBtn(popRow, '创建'));
  await tick();
  assert.deepEqual(adopted, [dir], 'adopt 入参＝所选目录');
  assert.deepEqual(created, ['ws-9'], '落家用 DSH 回来的 canonical workspaceId');
  assert.equal(one(domDoc.body, 'hu-pop'), null, '创建后弹层关闭');
  one1.handle.dispose();

  /* ② 选到「已经是工作区、且已经有家」的目录：明文拒绝，不写第二行 */
  const adopted2: string[] = [];
  const created2: string[] = [];
  const one2 = mkPanel(adopted2, created2, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  clickEl(one(one2.bodyEl, 'hu-pbtn'));
  const pop3 = one(domDoc.body, 'hu-pop');
  clickEl(byAttr(pop3, 'data-act', 'pick-dir')[0]);
  await tick();
  clickEl(popBtn(one(domDoc.body, 'hu-pop'), '创建'));
  await tick();
  assert.deepEqual(adopted2, [dir], '仍走了收养（目录确实是工作区）');
  assert.deepEqual(created2, [], '已有家的工作区不写第二行（一家一区）');
  /* T10 #124：目标已达成就不该报错——直接带用户进那家（弹层收掉、不写第二行）。 */
  assert.equal(one(domDoc.body, 'hu-pop'), null, '已有家 ⇒ 直接进那家（关弹层、不报错）');
  one2.handle.dispose();

  /* ③ 落家失败（宿主写表报错）：弹层不关、灰字原文留在弹层里、不跳详情（验收 5「失败不脏、可重试」） */
  const adopted3: string[] = [];
  const created3: string[] = [];
  const one3 = mkPanel(adopted3, created3, { workspaceId: 'ws-9', path: dir, title: 'newhome' }, [], true);
  clickEl(one(one3.bodyEl, 'hu-pbtn'));
  const pop4 = one(domDoc.body, 'hu-pop');
  clickEl(byAttr(pop4, 'data-act', 'pick-dir')[0]);
  await tick();
  clickEl(popBtn(one(domDoc.body, 'hu-pop'), '创建'));
  await tick();
  const pop5 = one(domDoc.body, 'hu-pop');
  assert.ok(pop5, '落家失败时弹层不关（就地可重试）');
  assert.match(txt(one(pop5, 'hu-err')), /家的记录没写成功/, '失败原因以灰字原文留在弹层里');
  assert.ok(!off(popBtn(pop5, '创建')), '失败后「创建」恢复可点（可重试）');
  assert.deepEqual(created3, ['ws-9'], '失败也如实记录尝试过的 canonical id（日志可追）');
  one3.handle.dispose();
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

test('上部区域定稿：搜索/分段退场，三个面板动作并进绿框页头，页头不再有 ＋', () => {
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  assert.ok(!panel.includes('makeSearchField') && !panel.includes('makeSegmented'),
    '搜索框与「按助理 / 按渠道」分段必须退场（owner 裁定：钻取三级下二者无价值）');
  assert.ok(!panel.includes('af-toolbar'), '工具栏行退场：动作并进绿框页头，上部少一行');
  assert.ok(panel.includes('headActions'), '三个面板动作交绿框页头承载');
  assert.ok(readFileSync(join(COMP, 'home-frame.ts'), 'utf8').includes('actions?: HTMLElement'),
    '页头必须支持动作槽（headActions 有落点）');
  assert.ok(readFileSync(join(COMP, 'home-rows.ts'), 'utf8').includes('hu-srow'),
    '骨架行必须与真行同几何（复用 .hu-row）');
  /* 页头 ＋ 退场（owner 2026-10-13）：它与底部主操作**同效、同屏、同时可见**，L3 还点了没反应。
   * 一个动作一个入口：建单归底部主操作（随层：新建家 / 新建助理），页头只留面板级动作（船/房/刷新）。 */
  const frame = readFileSync(join(COMP, 'home-frame.ts'), 'utf8');
  const body = readFileSync(join(COMP, 'panel-body.ts'), 'utf8');
  assert.ok(!frame.includes('onAdd') && !frame.includes('hu-ibtn solid'),
    '页头不得再有 ＋（与底部主操作重复；L3 点了无反应）');
  assert.ok(!body.includes('onAdd'), '装配层不得再给页头传建单回调（唯一入口＝底部主操作）');
});

test('刷新：两个真相源各读一遍（渠道先、家表后），在途去重，忙态成对且失败不锁死', async () => {
  const refresher: any = (() => {
    try { return boxReq('./client/components/home-refresh.js'); } catch { return boxReq('./components/home-refresh.js'); }
  })();
  /* 行为断言（不读源码文本）：给定一个可挂起的 load，连点两下只能跑一轮。 */
  const order: string[] = [];
  const busySeq: boolean[] = [];
  const doneSeq: boolean[] = [];
  let release: (() => void) | null = null;
  const refresh = refresher.createRefresher({
    load: async () => { order.push('load'); await new Promise<void>((res) => { release = res; }); },
    reloadHomes: async () => { order.push('homes'); },
    onBusy: (b: boolean) => busySeq.push(b),
    onDone: (ok: boolean) => doneSeq.push(ok),
  });
  const first = refresh();
  const second = refresh();
  assert.equal(await second, false, '在途重复点击必须被忽略（不得叠第二轮）');
  (release as unknown as () => void)();
  assert.equal(await first, true, '一轮刷新成功');
  assert.deepEqual(order, ['load', 'homes'], '顺序：渠道/机器人快照先、家表后（家表种子判定要读刚更新的 bot 名单）');
  assert.deepEqual(busySeq, [true, false], '忙态必须成对');
  assert.deepEqual(doneSeq, [true], '完成回调一轮只报一次');
  /* 失败路径：家表读失败也必须解忙态——否则刷新钮永久禁用（比不刷新更糟）。 */
  const busy2: boolean[] = [];
  const done2: boolean[] = [];
  const fail = refresher.createRefresher({
    load: async () => {},
    reloadHomes: async () => { throw new Error('boom'); },
    onBusy: (b: boolean) => busy2.push(b),
    onDone: (ok: boolean) => done2.push(ok),
  });
  assert.equal(await fail(), false, '失败必须如实返回 false（供调用方给失败提示）');
  assert.deepEqual(busy2, [true, false], '失败路径忙态也必须成对');
  assert.deepEqual(done2, [false]);
  /* 去重只在途生效，不能变成一次性：释放后再点仍然照刷。 */
  const again: string[] = [];
  const ok = refresher.createRefresher({ load: async () => { again.push('load'); }, reloadHomes: async () => { again.push('homes'); } });
  await ok();
  await ok();
  assert.deepEqual(again, ['load', 'homes', 'load', 'homes'], '去重只在途生效');

  /* 装配层：页头刷新钮与家表重试钮共用同一条管道（旧的无去重 refreshAll 必须消失）。 */
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  assert.ok(panel.includes('createRefresher'), '刷新走统一管道');
  assert.ok(panel.includes('data.load(true)') && panel.includes('data.loadHomes(getWorkspaces)'),
    '一次刷新＝两个真相源各读一遍（漏一个就会出现「刷了还是旧的」）');
  assert.ok(panel.includes('refreshBtn.disabled = busy') && panel.includes('hu-busy'),
    '在途忙态：按钮禁用 + 图标转圈（手动动作必须可见可确认）');
  assert.ok(panel.includes('onRetry: () => void refresh()'), '家表重试钮共用同一管道（同样去重、同样忙态）');
  assert.ok(!panel.includes('refreshAll'), '旧的无去重刷新路径必须消失');
  assert.ok(readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8').includes('.hu-head-acts .hu-busy svg{animation:huSp'),
    '忙态转圈规则必须在绿框样式里（否则「点了没反应」）');
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

test('旧面板能力保留：工具栏四钮顺序（T12 追加「配置」）＋事件制＋文案一字不动', () => {
  const panel = readFileSync(join(COMP, 'panel.ts'), 'utf8');
  /* 工具栏 ＋ 已退场（T6a 重做）：同一个「新建」不再有第三个入口——绿框页头 ＋（随层）
   * 与底部上下文主操作接管；棘轮在此显式释放，理由写进断言名与注释（2026-10-13）。
   * T12 #129 再追加一枚「配置」（复制路径 / 在文件浏览器打开）：插在串门搬家与刷新之间。 */
  assert.ok(panel.includes('radarBtn, adoptBtn, createConfigButton(rpc), refreshBtn'), '按钮顺序（舰队、串门搬家、配置、刷新）');
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
    join(CLIENT, 'data', 'home-edit.ts'),
    join(CLIENT, 'data', 'home-move.ts'),
    join(COMP, 'home-ops.ts'),
    join(COMP, 'home-move-ops.ts'),
    join(COMP, 'home-move-forms.ts'),
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

/* —— 液签几何与滑动（真机两连：①一级目录反复动画/抖动 ②应该在三个 tab 之间滑动）——
 * 行为断言而非源码 grep：给 crumbs/chip 装假布局矩形，跑**真 slideTab**，量它落到 tab 上的宽高位移。 */
test('液签：FLIP 在三个 chip 之间滑动（换层真滑、同点零位移），宽高取自 chip 实测矩形', () => {
  const frame: any = (() => {
    try { return boxReq('./client/components/home-frame.js'); } catch { return boxReq('./components/home-frame.js'); }
  })();
  const rafQueue: Array<() => void> = [];
  const prevRaf = (globalThis as any).requestAnimationFrame;
  (globalThis as any).requestAnimationFrame = (fn: () => void) => { rafQueue.push(fn); return rafQueue.length };
  const flush = (): void => { rafQueue.splice(0).forEach((fn) => fn()); };
  const mk = (chipLeft: number, chipWidth: number, hasCur = true, lv = 'L1'): any => {
    const crumbs: any = domDoc.createElement('div');
    const tab: any = domDoc.createElement('span');
    const chip: any = domDoc.createElement('button');
    const lvEl: any = domDoc.createElement('span');
    lvEl.className = 'hu-lv';
    lvEl.textContent = lv;
    chip.appendChild(lvEl);
    crumbs.querySelector = (sel: string) => (String(sel).indexOf('hu-crumb') >= 0 && hasCur ? chip : null);
    crumbs.scrollLeft = 0;
    crumbs.getBoundingClientRect = () => ({ left: 100, top: 200, width: 540, height: 41.25 });
    chip.getBoundingClientRect = () => ({ left: chipLeft, top: 208, width: chipWidth, height: 25.25 });
    return { crumbs, tab, chip };
  };
  /* 记忆复位（模块级 lastTabRect）：无当前层时清空旧位，保证本测试从「首帧」开始。 */
  const reset = mk(0, 0, false);
  frame.slideTab(reset.crumbs, reset.tab);
  assert.ok(reset.tab.attributes.get('hidden') !== undefined, '无当前层（例如空家）时液签必须隐藏');

  /* 首帧：无旧位可 FLIP ⇒ 直接落位（禁过渡），下一帧恢复过渡。 */
  const a = mk(112, 46.38);
  frame.slideTab(a.crumbs, a.tab);
  assert.equal(a.tab.style.width, '46.38px', '液签宽 = chip 宽');
  assert.equal(a.tab.style.height, '25.25px', '液签高必须 = chip 高（旧实现缺这行 ⇒ 高出 4px）');
  assert.equal(a.tab.style.transform, 'translate(12px, 8px)', '位移取 chip 相对 crumbs 的左上角');
  assert.equal(a.tab.style.transition, 'none', '首帧落位那一刻不得有过渡（否则从 0 位滑过来）');
  flush();
  assert.notEqual(a.tab.style.transition, 'none', '落位后必须恢复过渡（CSS 的 spring 才有机会生效）');

  /* 换层（L1→L2）：液签必须**从旧 chip 滑到新 chip** —— FLIP 先按回旧位，再放开过渡滑走。 */
  const b = mk(300, 60, true, 'L2');
  frame.slideTab(b.crumbs, b.tab);
  assert.equal(b.tab.style.transform, 'translate(12px, 8px)', 'FLIP 第一步必须按回上一次的位置（否则没有起点，无从滑动）');
  assert.equal(b.tab.style.transition, 'none', '按回旧位那一刻不得有过渡');
  flush();
  assert.equal(b.tab.style.transform, 'translate(200px, 8px)', '下一帧放开过渡滑到新 chip（液态 tab）');

  /* 同点（悬停换行不改当前层）：起止重合 ⇒ 零位移，不抖。 */
  const c = mk(300, 60, true, 'L2');
  frame.slideTab(c.crumbs, c.tab);
  const before = c.tab.style.transform;
  flush();
  assert.equal(c.tab.style.transform, before, '目标没变时起止同点 ⇒ 零位移（真机「反复动画/抖动」的根因）');

  /* 同 chip 只变宽（悬停改文案/骨架→真行）：矩形变了但 chip 没换 ⇒ 瞬放，不许滑（入场怪滑的根因）。 */
  const d = mk(320, 70, true, 'L2');
  frame.slideTab(d.crumbs, d.tab);
  assert.equal(d.tab.style.transform, 'translate(220px, 8px)', '同 chip 变宽直接落新位，不许从旧位滑过来');
  flush();

  /* 切回 L1：chip 变了 ⇒ 再滑（矩形恰好回到 a 的位置，起点必须是 d 的旧位）。 */
  const e = mk(112, 46.38, true, 'L1');
  frame.slideTab(e.crumbs, e.tab);
  assert.equal(e.tab.style.transform, 'translate(220px, 8px)', 'FLIP 起点＝上一次落位');
  flush();
  assert.equal(e.tab.style.transform, 'translate(12px, 8px)', '切层滑到新 chip（液态只发生在换 chip 时）');

  (globalThis as any).requestAnimationFrame = prevRaf;

  /* CSS 不得再用 top/bottom 内缩：几何全部由 JS 按实测矩形给。 */
  const css = readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8');
  const rule = /\.hu-tablk\{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.ok(rule.indexOf('bottom:6px') < 0 && rule.indexOf('top:6px') < 0, '液签不得再用 top/bottom 内缩');
  assert.ok(rule.indexOf('top:0') >= 0 && rule.indexOf('left:0') >= 0, '液签原点必须归零（由 translate 定位）');

  /* 调用点契约：FLIP 自己分清「位没变/位变了」⇒ 不再需要瞬时开关，也不再有 lastLevel 记账。 */
  const bodySrc = readFileSync(join(COMP, 'panel-body.ts'), 'utf8');
  assert.ok(!/slideTab\([^;]*,\s*true\)/.test(bodySrc), '调用点不得再传瞬时落位（FLIP 已接管判定）');
  assert.ok(!bodySrc.includes('lastLevel'), 'lastLevel 记账必须退场（瞬时/动画判定归 slideTab）');
  const frameSrc = readFileSync(join(COMP, 'home-frame.ts'), 'utf8');
  assert.ok(frameSrc.includes('lastTabKey'), '换 chip 判定收归 slideTab（lastTabKey），调用点不记账');
  /* 返回向 tab（L2 页的 L1 / L3 页的 L1·L2）：可点就不能是灰字裸奔，必须实心 pill＋hover 强调（owner 2026-10-15 真机）。 */
  const crumbCss = readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8');
  assert.ok(/\.hu-crumb\[data-goto\]:not\(\.off\):not\(\.next\)\{[^}]*background:var\(--hu-panel\)/.test(crumbCss), '返回 tab 有实心底');
  assert.ok(/\.hu-crumb\[data-goto\]:not\(\.off\):not\(\.next\):hover\{[^}]*border-color:var\(--hu-accent\)/.test(crumbCss), '返回 tab hover 有强调');
  /* hover 反馈全覆盖（owner 2026-10-15 真机）：行卡、行内钮、页头星标/反馈，缺一个都不行。 */
  assert.ok(/\.hu-row:hover\{[^}]*border-color:color-mix\(in srgb, var\(--hu-accent\)/.test(crumbCss), '行卡 hover 有强调描边');
  assert.ok(/\.hu-ract:not\(\.danger\):not\(\.planned\):not\(\[disabled\]\):hover\{[^}]*background:var\(--hu-accent-soft\)/.test(crumbCss), '行内钮 hover 有强调（危险/待实现/禁用除外）');
  const fvCss = readFileSync(join(COMP, 'first-view-styles.ts'), 'utf8');
  assert.ok(/\.af-icon-btn\.af-star:hover\s*\{[^}]*border:[^}]*var\(--af-accent\)/.test(fvCss), '星标/反馈钮 hover 有强调');
  /* 浮动主按钮（owner 2026-10-15 真机）：负边距往下坐进宿主缝＋双层投影浮起，贴底不连体。 */
  assert.ok(/\.hu-ffoot\{[^}]*margin:0 0 -?\d+px/.test(crumbCss), 'foot 下边距借位（数值由真机目验定，门禁只查存在）');
  assert.ok(/\.hu-pbtn\{[^}]*box-shadow:0 10px 28px/.test(crumbCss), '主按钮双层投影（立体层级）');
});

/* —— 面包屑默认路径（owner 2026-10-13：「当没有焦点时，默认二级目录 三级目录 tab 上的内容
 * 就是当前列表的第一个，点击 tab 后就自动进去」）—— */
test('面包屑默认路径：无焦点时二级/三级 chip＝列表第一个且可点即进；没有下一级时显式留空', () => {
  const { bodyEl } = renderBox();
  const goto = (root: any, l: string): any => cls(root, 'hu-crumb').filter((c) => c.getAttribute('data-goto') === l)[0];
  assert.deepEqual(crumbInfo(bodyEl).map((c) => c.label), ['家', '助理 · 客厅', '机器人 · 小帅'],
    'L1 无焦点：默认路径＝列表第一行（活跃家 客厅）→ 它的第一位助理（小帅）');
  assert.ok(!goto(bodyEl, 'L2').getAttribute('aria-disabled') && !goto(bodyEl, 'L3').getAttribute('aria-disabled'),
    '后两级必须可点（owner：点击 tab 后就自动进去）——不许留「助理」/「机器人」空 chip');
  clickEl(goto(bodyEl, 'L2'));
  assert.equal(ttlOf(bodyEl).b, '客厅', '点 L2 chip 直接进入该家的助理层');
  assert.deepEqual(crumbInfo(bodyEl).map((c) => c.label), ['家', '客厅', '机器人 · 小帅'],
    'L2 当前层＝家名，L3 预显该家第一位助理');
  clickEl(goto(bodyEl, 'L3'));
  assert.equal(ttlOf(bodyEl).b, '小帅', '点 L3 chip 直接进入该助理的详情层');
  assert.ok(one(bodyEl, 'hu-detail'), 'L3 落点确实是助理详情卡');

  /* 没有下一级可去（空家）⇒ chip 显式留空并禁用：不假装有去处，也不给一个点了没反应的入口。 */
  const empty = renderBox();
  const h2 = rowsOf(empty.bodyEl).filter((r) => r.getAttribute('data-id') === 'h2')[0];
  clickEl(h2);
  assert.deepEqual(crumbInfo(empty.bodyEl).map((c) => c.label), ['家', '书房基地', '机器人'], '空家：L3 没有可预显的助理');
  assert.equal(goto(empty.bodyEl, 'L3').getAttribute('aria-disabled'), 'true', '没有下一级时必须显式禁用');
});

test('T6c 搬家纯逻辑：只换家、目标须在且无墓碑、同家拒收（验收①）', () => {
  const homes = [H({ id: 'h1' }), H({ id: 'h2' }), H({ id: 'h3', tombstone: { at: 9, reason: 'ws-gone' } })];
  const mv: any = moveMod.applyMove(A({ id: 'a1', homeId: 'h1' }), 'h2', homes);
  assert.ok(mv && mv.homeId === 'h2' && mv.botId === 'b1' && mv.status === 'bound', '已绑整户搬：只换 homeId');
  const mvU: any = moveMod.applyMove(A({ id: 'a2', homeId: 'h1', status: 'unbound', botId: null }), 'h2', homes);
  assert.ok(mvU && mvU.homeId === 'h2' && mvU.status === 'unbound', '未绑也能换家');
  assert.equal(moveMod.applyMove(A({ id: 'a1', homeId: 'h1' }), 'h1', homes), null, '同家拒收');
  assert.equal(moveMod.applyMove(A({ id: 'a1', homeId: 'h1' }), 'h9', homes), null, '目标家不存在拒收');
  assert.equal(moveMod.applyMove(A({ id: 'a1', homeId: 'h1' }), 'h3', homes), null, '墓碑家拒收');
  assert.equal(moveMod.applyMove(A({ id: 'a1', homeId: 'h1' }), '', homes), null, '空目标拒收');
});

test('T6c 解绑纯逻辑：只收已绑、user 名保留、bot 头像清零、orphan 留 boundAt（验收②）', () => {
  const u: any = moveMod.applyUnbind(A({ id: 'a1', name: '小帅', nameSource: 'bot', avatar: null, avatarSource: 'bot', boundAt: 8 }), false);
  assert.ok(u && u.status === 'unbound' && u.botId === null && u.boundAt === null
    && u.name === '' && u.nameSource === 'home' && u.avatar === null && u.avatarSource === 'default');
  const o: any = moveMod.applyUnbind(A({ id: 'a1', boundAt: 8 }), true);
  assert.ok(o && o.status === 'orphan' && o.boundAt === 8, '孤儿回落留 boundAt 供认领审计');
  const keep: any = moveMod.applyUnbind(A({ id: 'a1', name: '专属', nameSource: 'user', avatar: '2', avatarSource: 'user' }), false);
  assert.ok(keep && keep.name === '专属' && keep.nameSource === 'user' && keep.avatar === '2', 'user 改名与配图保留');
  assert.equal(moveMod.applyUnbind(A({ id: 'a2', status: 'unbound', botId: null }), false), null, '未绑拒收');
  assert.equal(moveMod.applyUnbind(A({ id: 'a3', status: 'orphan', botId: null }), false), null, '孤儿拒收二次解绑');
});

test('T6c 孤儿判定：bound 失踪即回落、失败渠道不误伤、未绑不参（验收②）', () => {
  const as = [A({ id: 'a1' }), A({ id: 'a2', channel: 'qq', botId: 'q1' }), A({ id: 'a3', status: 'unbound', botId: null })];
  assert.deepEqual(moveMod.findOrphans(as, [{ channel: 'feishu', botId: 'b1' }], []), ['a2'], 'qq 号失踪→回落');
  assert.deepEqual(moveMod.findOrphans(as, [{ channel: 'feishu', botId: 'b1' }], ['qq']), [], '失败渠道 fail-closed');
  assert.deepEqual(moveMod.findOrphans(as, [{ channel: 'feishu', botId: 'b1' }, { channel: 'qq', botId: 'q1' }], []), [], '齐→静默');
});

test('T6c 宿主搬家/解绑：落盘真写、键集合仍是 T3、重复解绑拒收（验收①②④）', async () => {
  const moveHost: any = reqHostFile('home-move.js');
  const dir = mkdtempSync(join(tmpdir(), 'hs-t6c-'));
  const file = join(dir, 'homes.yaml');
  const r1: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  const r2: any = await homeStore.createHomeRow(file, { workspaceId: 'ws-2', path: 'D:\\agents\\shufang', title: '书房' });
  const ca: any = await homeStore.createAssistantRow(file, { homeId: r1.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '' });
  const mv: any = await moveHost.moveAssistantRow(file, { id: ca.assistant.id, targetHomeId: r2.home.id });
  assert.equal(mv.ok, true);
  assert.ok(mv.row.homeId === r2.home.id && mv.row.botId === 'b1' && mv.row.status === 'bound', '搬家不断绑');
  assert.deepEqual(Object.keys(mv.row).sort(), Object.keys(A({})).sort(), '搬家行仍是 T3 键集合');
  assert.equal((await moveHost.moveAssistantRow(file, { id: ca.assistant.id, targetHomeId: r2.home.id })).code, 'bad-request', '同家拒收');
  assert.equal((await moveHost.moveAssistantRow(file, { id: ca.assistant.id, targetHomeId: 'h9' })).code, 'not-found', '坏目标拒收');
  const un: any = await moveHost.unbindAssistantRow(file, { id: ca.assistant.id, orphan: false });
  assert.ok(un.ok && un.row.status === 'unbound' && un.row.botId === null && un.row.boundAt === null);
  assert.equal((await moveHost.unbindAssistantRow(file, { id: ca.assistant.id, orphan: false })).code, 'bad-request', '重复解绑拒收');
  const ca2: any = await homeStore.createAssistantRow(file, { homeId: r1.home.id, channel: 'qq', botId: 'q1', botName: '野号', homeText: '' });
  const or: any = await moveHost.unbindAssistantRow(file, { id: ca2.assistant.id, orphan: true });
  assert.ok(or.ok && or.row.status === 'orphan' && or.row.boundAt !== null, '孤儿回落留 boundAt');
});

test('T6c 宿主分发器真跑：assistant.move → assistant.unbind → 失败码（验收①②）', async () => {
  const { AgentMetaStore } = reqHostFile('meta-store.js');
  const { createAgentFleetHandler } = reqHostFile('rpc.js');
  const dshHome = mkdtempSync(join(tmpdir(), 'home-steel-rpc-t6c-'));
  const call = createAgentFleetHandler(new AgentMetaStore(join(dshHome, 'agents.json')), { dshHome });
  const c1: any = await call('home.create', { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  const c2: any = await call('home.create', { workspaceId: 'ws-2', path: 'D:\\agents\\shufang', title: '书房' });
  const a1: any = await call('assistant.create', { homeId: c1.value.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '' });
  const mv: any = await call('assistant.move', { id: a1.value.assistant.id, targetHomeId: c2.value.home.id });
  assert.equal(mv.ok, true, JSON.stringify(mv.error ?? {}));
  assert.equal(mv.value.assistant.homeId, c2.value.home.id, '分发器搬家换家不断绑');
  const mv2: any = await call('assistant.move', { id: a1.value.assistant.id, targetHomeId: 'h9' });
  assert.ok(mv2.ok === false && mv2.error.code === 'not-found', '坏目标走失败通道');
  const un: any = await call('assistant.unbind', { id: a1.value.assistant.id, orphan: false });
  assert.equal(un.ok, true, JSON.stringify(un.error ?? {}));
  assert.ok(un.value.assistant.status === 'unbound' && un.value.assistant.botId === null, '分发器解绑清号');
  const l1: any = await call('home.list', {});
  assert.equal(l1.value.assistants.length, 1, '搬家解绑不增不减行');
});

test('T6c 编排顺序：已绑先远端跟随再落表、写后先读表再刷新（验收①③）', () => {
  const src = readFileSync(join(COMP, 'home-move-ops.ts'), 'utf8');
  assert.ok(src.indexOf('bindBot') < src.indexOf("'assistant.move'"), '搬家先 bot.workspace.set 再落表');
  assert.ok(src.indexOf("'assistant.remove'") > src.indexOf("''"), '删时先清空工作区再删行');
  assert.ok(src.indexOf('reloadHomes') < src.lastIndexOf('refresh()'), '写后先读表再刷新');
  assert.ok(!strip(src).includes('bot.delete'), '搬家/移除/删除一律不断连接');
});

test('T6c 换工作区弹层：点开列出别家、确认走搬家管道（验收①）', () => {
  const { bodyEl } = renderBox();
  clickEl(rowsOf(bodyEl)[0]);
  clickEl(rowsOf(bodyEl)[0]);
  const mv = byAttr(bodyEl, 'data-item-act', 'move-a')[0];
  assert.ok(mv && !off(mv), '换工作区可用');
  clickEl(mv);
  const pop = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop && txt(pop).includes('换工作区'), '点开搬家弹层');
  assert.ok(txt(pop).includes('书房基地'), '候选列出别家（当前家除外）');
  popMod.closeHomePop(true);
});

test('T10b #127 孤儿家：行内两动作只给孤儿家，重绑走 T8 收养链，删除家两步确认（验收①③④）', async () => {
  const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 0) });
  const dir = 'D:\\agents\\newhome';
  const gone = H({ id: 'h9', workspaceId: 'ws-gone', path: 'D:\\agents\\gone', name: '走丢的家', nameSource: 'system' });
  /* 孤儿家带一位助理：折叠退场后空家也直接成行；这里带助理是为了同时验孤儿行圆点与两动作共存。 */
  const goneAsst = A({ id: 'a9', homeId: 'h9', channel: 'qq', botId: 'q9', status: 'bound', name: '小九', nameSource: 'bot' });
  const picked: string[] = [];
  const adopted: string[] = [];
  const rebound: any[] = [];
  const removed: string[] = [];
  let nextPick = dir;
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state: { homes: BOX_HOMES.concat([gone]), assistants: BOX_ASSTS.concat([goneAsst]), bots: BOX_BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => BOX_WS,
    ops: {
      createHome: async () => {}, createAssistant: async () => {}, connect: () => {},
      pickDirectory: async () => { picked.push(nextPick); return nextPick },
      adoptDirectory: async (d: string) => {
        adopted.push(d);
        return d === 'D:\\agents\\nowhere' ? null : { workspaceId: 'ws-9', path: dir, title: 'newhome' };
      },
      rebindHome: async (id: string, wsId: string, path: string) => { rebound.push([id, wsId, path]) },
      removeHome: async (id: string) => { removed.push(id) },
    },
    onRetry: () => {},
  });
  handle.render();
  const rowById = (id: string): any => rowsOf(bodyEl).filter((r) => r.getAttribute('data-id') === id)[0];
  /* ④ 正常家（工作区在）一个删除/重绑入口都不画——这是结构保证：按钮由 isOrphanHome 决定 */
  const normal = rowById('h1');
  assert.ok(normal && !txt(normal).includes('工作区已不在'), '正常家不显示孤儿态');
  assert.equal(byAttr(normal, 'data-item-act', 'rebind-home').length, 0, '正常家没有「选择工作区」');
  assert.equal(cls(normal, 'hu-ract').filter((b: any) => txt(b) === '删除家').length, 0, '正常家没有「删除家」');
  /* ① 孤儿家：灰字章 ＋ 两个动作 */
  const orow = rowById('h9');
  assert.ok(orow && txt(orow).includes('工作区已不在'), '孤儿家显示「工作区已不在」');
  const rebindBtn = byAttr(orow, 'data-item-act', 'rebind-home')[0];
  const delBtn = cls(orow, 'hu-ract').filter((b: any) => txt(b) === '删除家')[0];
  assert.ok(rebindBtn && txt(rebindBtn) === '选择工作区' && !off(rebindBtn), '孤儿家有「选择工作区」且可用');
  assert.ok(delBtn && !off(delBtn), '孤儿家有「删除家」且可用');
  assert.ok(String(delBtn.className).includes('danger'), '删除家是危险款（.hu-ract.danger 有样式）');
  /* ② 「选择工作区」：选目录 → 收养（唯一实现）→ home.rebind；成功后关弹层并重渲染 */
  clickEl(rebindBtn);
  const pop1 = one(domDoc.body, 'hu-pop');
  assert.ok(pop1 && txt(pop1).includes('选择工作区'), '点开重绑弹层');
  assert.deepEqual(cls(one(pop1, 'hu-phead'), 'hu-pbtn-s').map(txt), ['取消', '重绑'], '取消/重绑在标题栏右上角（owner 2026-10-15 裁定）');
  assert.ok(off(popBtn(pop1, '重绑')), '未选目录时「重绑」禁用');
  clickEl(byAttr(pop1, 'data-act', 'pick-dir')[0]);
  await tick();
  const pop2 = one(domDoc.body, 'hu-pop');
  assert.equal(txt(one(pop2, 'hu-dirpath')), dir, '所选目录回填到路径位');
  assert.ok(!off(popBtn(pop2, '重绑')), '选到目录后「重绑」可用');
  clickEl(popBtn(pop2, '重绑'));
  await tick();
  assert.deepEqual(picked, [dir], '先走选目录');
  assert.deepEqual(adopted, [dir], '再走 T8 收养链（不新开第二条支路）');
  assert.deepEqual(rebound, [['h9', 'ws-9', dir]], '最后 home.rebind 指向 DSH 回来的 canonical 工作区');
  assert.equal(one(domDoc.body, 'hu-pop'), null, '成功后弹层关闭');
  /* ②b 客户端提前判重（与宿主同一把尺）：选到「已经是别人的家」的目录 ⇒ 明文说清是谁的家，不收养、不落表 */
  nextPick = 'D:\\agents\\keting';
  clickEl(byAttr(rowById('h9'), 'data-item-act', 'rebind-home')[0]);
  clickEl(byAttr(one(domDoc.body, 'hu-pop'), 'data-act', 'pick-dir')[0]);
  await tick();
  clickEl(popBtn(one(domDoc.body, 'hu-pop'), '重绑'));
  await tick();
  const dupErr = one(one(domDoc.body, 'hu-pop'), 'hu-err');
  assert.ok(dupErr && txt(dupErr).includes('这个目录已经有家了：客厅'), '提前判重：明文说清那个目录是谁的家');
  assert.deepEqual(adopted, [dir], '判重拦在收养之前（不会白建一个工作区）');
  assert.deepEqual(rebound, [['h9', 'ws-9', dir]], '家表一行没动');
  /* ②c 收养没成（DSH 建区失败）⇒ 弹层留着、灰字原文、可重试 */
  nextPick = 'D:\\agents\\nowhere';
  clickEl(byAttr(one(domDoc.body, 'hu-pop'), 'data-act', 'pick-dir')[0]);
  await tick();
  clickEl(popBtn(one(domDoc.body, 'hu-pop'), '重绑'));
  await tick();
  const popErr = one(domDoc.body, 'hu-pop');
  assert.ok(popErr && one(popErr, 'hu-err'), '建区没成 ⇒ 弹层不关、灰字留在弹层里（可重试）');
  assert.deepEqual(rebound, [['h9', 'ws-9', dir]], '收养没成就一行没写');
  clickEl(popBtn(popErr, '取消'));
  /* ③ 「删除家」两步确认：首点只布防（不发请求），次点才真删 */
  const orow2 = rowById('h9');
  const del2 = cls(orow2, 'hu-ract').filter((b: any) => txt(b) === '删除家')[0];
  clickEl(del2);
  assert.deepEqual(removed, [], '首点只布防：不发 home.remove');
  assert.equal(txt(del2), '再点一次确认删除', '首点后文案变成二次确认');
  clickEl(del2);
  await tick();
  assert.deepEqual(removed, ['h9'], '次点才真删（只发一次）');
  handle.dispose();
});

test('T10b #127 重绑/删家编排：失败一律 throw 带原文、远端先跟随、写后先读表再刷新（验收②③）', async () => {
  const { createMoveOps } = boxReq('./client/components/home-move-ops.js');
  const home = H({ id: 'h9', workspaceId: 'ws-gone', path: 'D:\\agents\\gone' });
  const as = [A({ id: 'a1', homeId: 'h9', channel: 'feishu', botId: 'b1', status: 'bound' })];
  const calls: Array<{ ep: string; p: any }> = [];
  const mkOps = (reply: (ep: string, p: any) => any): any => createMoveOps({
    getRpc: () => async (_path: string, ep: string, p: any) => { calls.push({ ep, p }); return reply(ep, p) },
    getHome: () => home, getAssistant: () => undefined, getAssistants: () => as,
    reloadHomes: async () => { calls.push({ ep: 'reloadHomes', p: null }) },
    refresh: async () => { calls.push({ ep: 'refresh', p: null }) },
  });
  /* ① 成功：已绑助理先远端跟随（bot.workspace.set 新目录）→ home.rebind → 写后 reloadHomes → refresh */
  const okOps = mkOps(() => ({ ok: true, value: {} }));
  await okOps.rebindHome('h9', 'ws-9', 'D:\\agents\\newhome');
  assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set', 'home.rebind', 'reloadHomes', 'refresh'], '顺序铁律：远端跟随 → 落表 → 读表 → 刷新');
  assert.equal(calls[0].p.workspace, 'D:\\agents\\newhome', '远端切到新目录');
  assert.deepEqual(calls[1].p, { id: 'h9', workspaceId: 'ws-9', path: 'D:\\agents\\newhome' });
  /* ② 宿主判重（该工作区已有家）：把原文 throw 出来给弹层显示，且远端回滚到老目录 */
  calls.length = 0;
  const dup = mkOps((ep) => (ep === 'home.rebind'
    ? { ok: false, error: { code: 'already-exists', message: '该工作区已有家' } }
    : { ok: true, value: {} }));
  await assert.rejects(() => dup.rebindHome('h9', 'ws-1', 'D:\\agents\\keting'), /该工作区已有家/, 'already-exists 原文抛给弹层（不静默）');
  assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set', 'home.rebind', 'bot.workspace.set'], '落表失败 ⇒ 回滚远端（两边都不脏）');
  assert.equal(calls[2].p.workspace, 'D:\\agents\\gone', '回滚回原目录');
  /* ③ 远端切不过去：中止在落表之前——家表一行不写 */
  calls.length = 0;
  const badRemote = mkOps((ep) => (ep === 'bot.workspace.set' ? { ok: false, error: { message: '渠道 502' } } : { ok: true, value: {} }));
  await assert.rejects(() => badRemote.rebindHome('h9', 'ws-9', 'D:\\agents\\newhome'), /远端工作区没切过去/, 'fail-closed：远端清不动就不动表');
  assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set'], '一行没写（home.rebind 从未发出）');
  /* ④ 删家：先清远端（空目录）→ home.remove 一次 → 读表 → 刷新 */
  calls.length = 0;
  const delOps = mkOps(() => ({ ok: true, value: {} }));
  await delOps.removeHome('h9');
  assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set', 'home.remove', 'reloadHomes', 'refresh'], '删家顺序：清远端 → 打墓碑 → 读表 → 刷新');
  assert.equal(calls[0].p.workspace, '', '删家前把机器人工作区清空（不留看不见的脏指向）');
  assert.deepEqual(calls[1].p, { id: 'h9' }, 'home.remove 只带 id（墓碑＋级联由宿主做）');
  /* ④b 删家落表失败：原文抛出（不静默）＋回滚远端＋不读表不刷新 */
  calls.length = 0;
  const delFail = mkOps((ep) => (ep === 'home.remove' ? { ok: false, error: { message: '写盘失败' } } : { ok: true, value: {} }));
  await assert.rejects(() => delFail.removeHome('h9'), /写盘失败/, '删家失败也抛原文（界面不许装作删掉了）');
  assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set', 'home.remove', 'bot.workspace.set'], '失败 ⇒ 回滚远端，且不读表不刷新');
  /* ④c 删家前远端清不动：fail-closed——墓碑一行不打 */
  calls.length = 0;
  const delBadRemote = mkOps((ep) => (ep === 'bot.workspace.set' ? { ok: false, error: { message: '渠道 502' } } : { ok: true, value: {} }));
  await assert.rejects(() => delBadRemote.removeHome('h9'), /远端工作区没清掉/, '清不动远端就不打墓碑');
  assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set'], 'home.remove 从未发出（一行没写）');
  /* ⑤ 无 rpc / 家已墓碑：如实拒绝，不发任何请求 */
  calls.length = 0;
  const noRpc: any = createMoveOps({
    getRpc: () => null, getHome: () => home, getAssistant: () => undefined, getAssistants: () => as,
    reloadHomes: async () => {}, refresh: async () => {},
  });
  await assert.rejects(() => noRpc.rebindHome('h9', 'ws-9', 'D:\\x'), /连接服务不可用/);
  await assert.rejects(() => noRpc.removeHome('h9'), /连接服务不可用/, '删家同样如实拒绝（两条路一个口径）');
  assert.deepEqual(calls, [], '没有连接就一个请求都不发');
});

console.log('features/home-steel: ALL PASS');
