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
    /* rootDir 钉死 src：#154 起 home-model 链牵到 src/workspace-default.ts（共享层），
     * 不钉时 tsc 推断的公共根上移到 src/，产物层级随 import 图漂移（同 T9 log-events 的老坑）。 */
    '--rootDir', join(REPO, 'src'),
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
/* rootDir 钉死 src ⇒ 产物在 client/data/ 下（见上方注释）。 */
const model: any = req('./client/data/home-model.js');
const editMod: any = req('./client/data/home-edit.js');
const moveMod: any = req('./client/data/home-move.js');

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
/* 表单零件（在线绿档副标等）：同箱取，验的是真渲染出来的节点，不是抄一段字符串。 */
const formsMod: any = (() => {
  try { return boxReq('./client/components/home-forms.js'); } catch { return boxReq('./components/home-forms.js'); }
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

/** owner 2026-10-17：行内改名走 `ops.updateHome`（面板不再为改名开弹层）⇒ 桩里记下来当回执。 */
const renamed: Array<{ id: string; patch: any }> = [];
/** 助理侧同口径（owner 2026-10-17：L2 与 L1 功能一致）：铅笔提交走 `ops.updateAssistant`。 */
const asstRenamed: Array<{ id: string; patch: any }> = [];
/** owner 2026-10-17③：行内改名必须**走 quiet**（成功提示让给锚定提示，否则两条一起冒）⇒ 把标记也记下来。 */
const renamedQuiet: boolean[] = [];
function renderBox(mode = 'agent'): { bodyEl: any; handle: any } {
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state: { homes: BOX_HOMES, assistants: BOX_ASSTS, bots: BOX_BOTS, query: '', mode, loading: false, failed: [], homesReady: true, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),


    getWorkspaces: () => BOX_WS,
    ops: {
      createHome: async () => {}, createAssistant: async () => {}, connect: () => {},
      updateHome: async (id: string, patch: any, quiet?: boolean) => { renamed.push({ id, patch }); renamedQuiet.push(quiet === true); return true },
      updateAssistant: async (id: string, patch: any, quiet?: boolean) => { asstRenamed.push({ id, patch }); renamedQuiet.push(quiet === true); return true },
    },
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
/** chip 文案：两段式（层级名 + 对象名，#139）在 DOM 里是两个 span、textContent 会紧贴，
 *  断言里补一个空格还原视觉间距——断言的形状与「读起来像什么」一致，而不是与节点数一致。 */
const crumbLabel = (c: any): string => {
  const b = tag(c, 'b')
  if (!b) return ''
  const lv = nodes(b).filter((e: any) => e.classList?.contains('hu-cr2lv'))[0]
  if (!lv) return txt(b)
  return txt(lv) + ' ' + txt(nodes(b).filter((e: any) => e.classList?.contains('hu-cr2nm'))[0])
}
const crumbInfo = (root: any): Array<{ lv: string; label: string; cur: boolean; goto: string | null }> =>
  cls(root, 'hu-crumb').map((c) => ({ lv: txt(tag(c, 'span')), label: crumbLabel(c), cur: c.getAttribute('aria-current') === 'true', goto: c.getAttribute('data-goto') }));
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

test('缺口判定：任一工作区缺家→补；齐→静默；「绑了机器人但没有助理行」不再是缺口（#141）', () => {
  assert.equal(model.seedGap([W({})], [], []), true);
  assert.equal(model.seedGap([], [B({})], []), true);
  assert.equal(model.seedGap([], [], []), false);
  assert.equal(model.seedGap([W({})], [B({})], [H({})]), false);
  /* #141（真机实证的抢跑）：这条原来是 true——「某 bot 的工作区有家、但没有 bound 助理行」曾被当成缺口，
   * 于是接入留下的「已绑工作区·无主」窗口被对账补成一条**新**助理，把用户本想绑的那行挤成孤儿。
   * 现在绑定是显式动作（assistant.bind），对账不再按机器人快照补行。 */
  assert.equal(model.seedGap([W({})], [B({}), B({ botId: 'b2' })], [H({})]), false, '#141：不再按机器人快照补助理行');
  /* T10 #124（owner 裁定 2026-10-15）：家＝工作区的镜像 ⇒ 任何工作区缺家都要自动补同名家。
   * 于是「用已有工作区」支路没有存在意义（工作区刚被 DSH 加进来就会被补家），整个分段退场。 */
  assert.equal(model.seedGap(
    [W({}), W({ workspaceId: 'ws-9', path: 'D:\\agents\\new', title: '新区' })],
    [B({})], [H({})]), true, '任何缺家工作区都要自动补同名家（T10 #124）');
  /* T10 #124 验收②的原形：DSH 里新建一个工作区、**没有任何机器人**（旧规则在这里必漏补）。 */
  assert.equal(model.seedGap(
    [W({}), W({ workspaceId: 'ws-new', path: 'D:\\agents\\fresh', title: '新房间' })],
    [], [H({})]), true, '无机器人的新工作区也必须补家（T10 #124 验收②）');
  assert.equal(model.seedGap([W({}), W({ workspaceId: 'ws-new', path: 'D:\\agents\\fresh' })], [], [H({}), H({ id: 'h2', workspaceId: 'ws-new', path: 'D:\\agents\\fresh' })]), false,
    '补过之后再判＝齐（幂等，不会每轮重种）');
});

test('#141 抢跑回归：对账不许替「无主机器人」补行，也不许复活删掉的绑定助理', () => {
  /* ① 真机形状：家 h1 在册、机器人 b1 已绑到 keting、但没有任何 bound 助理行（接入留下的窗口）⇒ 不是缺口。 */
  assert.equal(model.seedGap([W({})], [B({})], [H({})]), false, '#141：有家＋机器人已绑工作区＋无 bound 行 ⇒ 不补');
  /* ② 对账种子对**已进账**的工作区不再从机器人快照凭空造行（删掉绑定助理后不会被下一轮复活）。 */
  const known: any = model.buildSeed([W({})], [B({}), B({ botId: 'b9' })], null, 7, [H({})]);
  assert.equal(known.homes.length, 1);
  assert.equal(known.assistants.length, 0, '#141：已在家表里的工作区不补 bound 行（复活被堵）');
  /* ③ 第一次进账（家表里没有这个工作区）照旧补——历史首迁与「新工作区里已有已绑机器人」不能误伤。 */
  const fresh: any = model.buildSeed([W({})], [B({})], null, 7, []);
  assert.equal(fresh.assistants.filter((a: any) => a.status === 'bound' && a.botId === 'b1').length, 1, '#141：首迁照旧补行');
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
  assert.equal(editMod.applyHomeUpdate(H({}), { avatar: '10' }), null, '非法配图拒收');
  assert.ok(editMod.applyHomeUpdate(H({}), { avatar: '9' }), '9 档合法（2026-10-18 由 6 扩 9）');
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
  assert.equal(editMod.isAvatarCode('7'), true);
  assert.equal(editMod.isAvatarCode('9'), true);
  assert.equal(editMod.isAvatarCode('10'), false);
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
  const bad: any = await homeEdit.updateHomeRow(file, { id: hid, avatar: '10' });
  assert.equal((await homeEdit.updateHomeRow(file, { id: hid, avatar: '9' })).ok, true, '9 档宿主放行');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'bad-request');
  assert.equal((await homeEdit.updateHomeRow(file, { id: hid })).ok, false, '无字段→拒收');
  assert.equal((await homeEdit.updateHomeRow(file, { id: 'nope', name: 'x' })).code, 'not-found');
  const c: any = await homeEdit.createUnboundRow(file, { homeId: hid, name: '' });
  assert.equal(c.ok, true);
  assert.ok(c.row.botId === null && c.row.status === 'unbound' && c.row.boundAt === null);
  assert.equal(c.row.channel, '', '#138：未绑定占位落空渠道，不再替用户编一个');
  assert.equal((await homeEdit.createUnboundRow(file, { homeId: 'nope' })).code, 'not-found');
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
  const c2: any = await homeEdit.createUnboundRow(file, { homeId: hid });
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
  /* #169：另允许仓库根的 `assistant-fields.js`——无 IO 的纯校验/归一共享层（同 src/log-events.ts 先例），
   * 落盘仍只经 home-store；除此之外任何 import 都算旁路。 */
  assert.ok(hostEditSrc.match(/^import .*$/gm)?.every((l) => l.includes('home-store') || l.includes('assistant-fields')),
    '宿主 home-edit 只引 home-store 与纯共享层（同队列落盘，无旁路）');
});

test('T6b 绿框呈现：纯头像弹层＋行内改名（owner 2026-10-17 口径）', () => {
  const { bodyEl } = renderBox();
  const row = rowsOf(bodyEl)[0];
  /* owner 2026-10-17：行上不再有「更多」；铅笔＝就地改名，头像钮／头像本身＝换头像弹层；
   * 改名与头像就此分家（服务端 updateHomeRow 的 name/avatar 仍是同一张行、同一个口径）。 */
  assert.equal(byAttr(row, 'data-item-act', 'more-home').length, 0, '家行不再有「更多」按钮');
  const renameBtn = byAttr(row, 'data-item-act', 'rename-h')[0];
  assert.ok(renameBtn && !off(renameBtn), '铅笔（改名）在');
  assert.ok(byAttr(row, 'data-item-act', 'avatar-h')[0], '更换头像钮在');
  const avBtn = cls(row, 'hu-avbtn')[0];
  assert.equal(avBtn?.getAttribute('data-item-act'), 'avatar-h', '头像本身也是换头像入口（真 <button>，键盘可达）');
  clickEl(avBtn);
  const pop = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop, '点头像→换头像弹层');
  assert.ok(txt(pop).includes('更换头像') && !txt(pop).includes('家设置'), '是纯换头像弹层（不再顶着「家设置」的名）');
  assert.equal(cls(pop, 'hu-fld').length, 1, '只有一个字段（头像）——名字不在这一层改');
  assert.equal(cls(pop, 'hu-avopt').length, 10, '配图行＝照片首格＋9 预置（2026-10-18，默认格退场）');
  assert.equal(cls(pop, 'hu-avimg-cell').length, 1, '图片格在色板行里（第 1 格，照片入口）');
  assert.equal(one(pop, 'hu-avrow').children[0].classList.contains('hu-avimg-cell'), true, '照片格在第一位');
  assert.equal(byAttr(pop, 'data-avatar', 'img').length, 1, '照片入口唯一（data-avatar=img）');
  assert.equal(byAttr(byAttr(pop, 'data-avatar', 'img')[0], 'data-hu-icon', 'camera').length, 1, '照片格是相机 SVG（不再写「图」字）');
  assert.ok(!txt(pop).includes('清除图片'), '无图时不出现「清除图片」（回落预设色）');
  assert.ok(popBtn(pop, '保存') && !off(popBtn(pop, '保存')), '主按钮＝保存（可点）');
  popMod.closeHomePop(true);
  /* 两个入口同一张卡：头像本身与「更换头像」图标钮。 */
  clickEl(byAttr(row, 'data-item-act', 'avatar-h')[0]);
  assert.ok(txt(cls(domDoc.body, 'hu-pop')[0]).includes('更换头像'), '图标钮与头像本身落同一张弹层');
  clickEl(cls(domDoc.body, 'hu-scrim')[0]);
  assert.equal(popMod.homePopOpen(), false, '点遮罩→弹层逻辑关闭（DOM 渐隐 130ms 后移除）');
  popMod.closeHomePop(true);
  /* 铅笔＝原位改名：不开弹层，名字处直接变输入框；回车落盘、Esc 不落盘。 */
  const before = renamed.length;
  clickEl(renameBtn);
  assert.equal(cls(domDoc.body, 'hu-pop').length, 0, '改名不再开弹层（就地改）');
  const input = one(one(row, 'hu-nm'), 'hu-nminput');
  assert.ok(input, '名字处就地变输入框');
  input.value = '湖畔';
  input.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(renamed.length, before + 1, '回车→落盘一次');
  assert.equal(renamed.at(-1)?.id, 'h1', '落盘到这一家');
  assert.equal(renamed.at(-1)?.patch.name, '湖畔', '补丁只带名字');
  assert.equal(one(row, 'hu-nminput'), null, '提交后退出编辑态（输入框撤掉、展示态回来）');
  clickEl(renameBtn);
  const i2 = one(row, 'hu-nminput');
  assert.ok(i2, '再点铅笔又进编辑态');
  i2.value = '不要这个名字';
  i2.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(renamed.length, before + 1, 'Esc 不落盘');
  assert.equal(one(row, 'hu-nminput'), null, 'Esc 也退回展示态');
  assert.equal(one(row, 'hu-nm') && txt(one(row, 'hu-nm')), '客厅', '展示的还是原名');
  /* 清空＝「恢复默认名（跟随工作区）」的老能力，改走行内：空串就是回落。
   * 挑 h2（书房基地，nameSource: user）——h1 是 system 取名，清空本来就是「没有改动」。 */
  const row2 = rowsOf(bodyEl)[1];
  clickEl(byAttr(row2, 'data-item-act', 'rename-h')[0]);
  const i3 = one(row2, 'hu-nminput');
  assert.ok(i3, '第二家也走行内改名');
  i3.value = '   ';
  i3.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(renamed.length, before + 2, '清空也落盘（不静默丢弃）');
  assert.equal(renamed.at(-1)?.id, 'h2', '落在被改的那一家');
  assert.equal(renamed.at(-1)?.patch.name, '', '空名字＝回落跟随工作区（老「恢复默认名」按钮的等价物）');
  /* L1→L2→未绑助理行点绑机器人→绑定弹层（空闲号 野号 可选） */
  clickEl(rowsOf(bodyEl)[0]);
  const l2rows = rowsOf(bodyEl);
  const bindBtn = byAttr(l2rows[1], 'data-item-act', 'bind-a')[0];
  assert.ok(bindBtn && !off(bindBtn));
  clickEl(bindBtn);
  const pop2 = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop2 && txt(pop2).includes('绑定机器人') && txt(pop2).includes('野号'), '绑定弹层列出空闲机器人');
  /* owner 2026-10-17：主按钮文案＝「绑定」——「创建」会被读成「新建一个机器人」，与这一步（认领现成的）相反。 */
  assert.ok(!off(popBtn(pop2, '绑定')), '非空态主按钮＝绑定（可点）');
  assert.equal(popBtn(pop2, '创建'), null, '绑定弹层不再出现「创建」');
  clickEl(cls(domDoc.body, 'hu-scrim')[0]);
  assert.equal(popMod.homePopOpen(), false);
  popMod.closeHomePop(true);
});

/* owner 2026-10-17⑤：预置头像配色重做——7 档各自可辨、内含 DeepSeek 蓝白与黑白两档；色块 34→46px。
 * 断「算得出来的东西」：实色表、字底 WCAG 对比、两两 RGB 距离、样式表里的真尺寸（不抄字符串）＝对抗式自查。 */
test('头像预置色：DeepSeek 蓝白/黑白＋实色高对比＋色块放大（owner 2026-10-17）', () => {
  const idMod: any = (() => {
    try { return boxReq('./client/components/home-identity.js'); } catch { return boxReq('./components/home-identity.js'); }
  })();
  const presets: Array<[string, string]> = idMod.PRESETS;
  assert.equal(presets.length, 9, '预置 9 档（弹层里照片首格＋9 预置＝10 格，默认格退场）');
  assert.equal(presets[0][0].toUpperCase(), '#17181C', '第 1 档＝黑白（近黑底＋白字，2026-10-18 前移到首位）');
  assert.equal(presets[1][0].toUpperCase(), '#4D6BFE', '第 2 档＝DeepSeek 蓝白（品牌蓝）');
  assert.equal(presets[2][0].toUpperCase(), '#2F4A44', '第 3 档＝墨绿（新莫兰迪）');
  assert.equal(presets[3][0].toUpperCase(), '#4E6E8E', '第 4 档＝深雾蓝（新莫兰迪）');
  assert.equal(presets[4][0].toUpperCase(), '#7A3E5A', '第 5 档＝梅子（新莫兰迪）');
  assert.equal(presets[5][0].toUpperCase(), '#C4B49A', '第 6 档＝燕麦（浅色深字，新莫兰迪）');
  assert.equal(presets[6][0].toUpperCase(), '#B5473A', '第 7 档＝砖红（新莫兰迪，代旧玫红）');
  assert.equal(presets[7][0].toUpperCase(), '#7C3AED', '第 8 档＝紫罗兰（旧锚，保可辨距离）');
  assert.equal(presets[8][0].toUpperCase(), '#0E8A43', '第 9 档＝翠绿（旧锚，保可辨距离）');
  const rgb = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const lum = (hex: string): number => {
    const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (hi + 0.05) / (lo + 0.05);
  };
  presets.forEach(([bg, fg], i) => {
    assert.ok(ratio(bg, fg) >= 4.3, '第 ' + (i + 1) + ' 档字底对比 ≥4.3：' + bg + '/' + fg + ' ≈ ' + ratio(bg, fg).toFixed(2));
  });
  /* 两两可辨：旧的混色版把彩度压到 ~40%、明度压到 ~20%，多档肉眼分不开 ⇒ 钉 RGB 距离（含明度差）。 */
  for (let i = 0; i < presets.length; i += 1) {
    for (let j = i + 1; j < presets.length; j += 1) {
      const d = Math.hypot(...rgb(presets[i][0]).map((v, k) => v - rgb(presets[j][0])[k]));
      assert.ok(d >= 60, '第 ' + (i + 1) + ' 与第 ' + (j + 1) + ' 档底色可辨（RGB 距离 ' + d.toFixed(0) + ' ≥ 60）');
    }
  }
  assert.equal(idMod.avatarStyle('h1', '1'), 'background:#17181C;color:#FFFFFF', '选色＝实色（1 档黑白前移，旧蓝白到 2 档）');
  assert.equal(idMod.avatarStyle('h1', '2'), 'background:#4D6BFE;color:#FFFFFF', '2 档＝DeepSeek 蓝白');
  assert.equal(idMod.avatarStyle('h1', '9'), 'background:#0E8A43;color:#FFFFFF', '9 档＝翠绿（旧锚）');
  assert.ok(idMod.avatarStyle('h1', null).includes('hsl('), '未选色仍按 id 派生色相（改名不换色）');
  assert.notEqual(idMod.avatarStyle('h1', null), idMod.avatarStyle('h2', null), '不同 id 派生不同色（列表身份感）');
  const avCss = readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8');
  assert.ok(avCss.includes('.home-ui .hu-avrow{display:grid;grid-template-columns:repeat(5,46px);gap:8px}'),
    '色板＝5 列网格（10 格整齐两行：照片＋9 预置）');
  assert.ok(avCss.includes('.home-ui .hu-avopt{width:46px;height:46px'), '色块 46×46（旧 34×34 显小）');
});

/* owner 2026-10-17：L2 助理行与 L1 家行在这件事上**功能一致**——铅笔就地改名、头像（图标钮与头像本身）
 * 开同一张纯换头像弹层，「更多」退场。两行共用 home-row-edit / home-avatar-act，不许各写一份。 */
test('L2 助理行＝L1 家行（owner 2026-10-17）：「更多」退场＋铅笔就地改名＋头像开纯换头像弹层', () => {
  const { bodyEl, handle } = renderBox();
  clickEl(rowsOf(bodyEl)[0]);
  const row = rowsOf(bodyEl)[0];
  assert.equal(byAttr(row, 'data-item-act', 'more-asst').length, 0, '「更多」退场（L2 与 L1 一致）');
  assert.ok(byAttr(row, 'data-item-act', 'rename-a')[0], '铅笔＝改名（行内就地）');
  const avBtn = one(row, 'hu-avbtn');
  assert.equal(avBtn?.getAttribute('data-item-act'), 'avatar-a', '头像本身也是换头像入口（真 <button>，键盘可达）');
  clickEl(byAttr(row, 'data-item-act', 'rename-a')[0]);
  assert.equal(popMod.homePopOpen(), false, '铅笔不许开弹层（在名字处就地改）');
  const input = one(one(row, 'hu-nm'), 'hu-nminput');
  assert.ok(input, '名字处出现输入框');
  input.value = '小婉';
  input.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(one(row, 'hu-nminput'), null, '回车退出编辑态');
  assert.deepEqual(asstRenamed.at(-1), { id: 'a1', patch: { name: '小婉' } }, '回车落盘走 updateAssistant（与家侧同一条写路径）');
  clickEl(avBtn);
  const pop = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop && txt(pop).includes('更换头像'), '头像入口开换头像弹层');
  assert.equal(cls(pop, 'hu-fld').length, 1, '纯换头像：只有头像一个字段（不带名字字段）');
  assert.equal(cls(pop, 'hu-avopt').length, 10, '照片首格＋9 预置（与家侧同一份 avatarRow）');
  assert.ok(popBtn(pop, '保存') && !off(popBtn(pop, '保存')), '保存可点');
  popMod.closeHomePop(true);
  handle.dispose();
});

/* owner 2026-10-17 真机②（旧口令）：「改名成功」的 toast 沉在视口底部，离被改的那一行太远。
 * 本票只钉**弹层类写操作**那条路（行内就地改名已改走锚定提示，见下一条）。 */
test('owner 2026-10-17②：弹层类改名把确认挪到顶部变异（不改基样式）', async () => {
  const css = readFileSync(join(COMP, 'home-row-styles.ts'), 'utf8');
  const top = css.slice(css.indexOf('.home-ui.hu-toast-top{'), css.indexOf('.home-ui.hu-toast{'));
  assert.ok(top.includes('top:') && top.includes('bottom:auto'), '顶部变异只挪位置（基样式与 .show 动画不动）：' + top);
  /* owner 2026-10-17④：「改名成功」走的正是这条共享 toast，而共享 .af-toast 的底是
   * color-mix(--af-primary 86%, --af-bg)——color-mix 的 alpha 是**加权平均**，宿主 label 色带 alpha
   * 时混出来仍半透明（真机「背景是透明的」就是它）。故本命名空间必须补不透明底：先铺 --hu-panel，
   * 再把同一档 86% 混色当渐变叠上去。别被后来人当成冗余合并掉。 */
  assert.ok(top.includes('background-color:var(--hu-panel)'), '加固：共享 toast 用不透明令牌打底（宿主 label 带 alpha 也不透）');
  assert.ok(top.includes('linear-gradient(color-mix(in srgb, var(--hu-ink) 86%, var(--hu-panel))'), '加固：同档 86% 混色当渐变叠上去（观感与共享基样式一致）');
  assert.ok(top.includes('color:var(--hu-panel)'), '加固：字色用页面底色令牌（与实色块互为反色）');
  /* 行为级：走真 updateHome／updateAssistant 的名字支路 ⇒ 真 toast 节点带变异类；头像支路照旧。 */
  const opsMod: any = (() => {
    try { return boxReq('./client/components/home-ops.js'); } catch { return boxReq('./components/home-ops.js'); }
  })();
  const rpc: any = async () => ({ ok: true, value: { home: H({ id: 'h9' }), assistant: A({ id: 'a9' }) } });
  const lastToast = (): any => nodes(domDoc.body).filter((n) => n.classList?.contains('af-toast')).at(-1);
  /* 宿主自带 `home-ui`（同 `.hu-tiphost` 那条纪律：body 级 float 只有带上它，规则才挂得上、作用域才不破）。 */
  const atTop = (): boolean => !!lastToast()?.classList.contains('hu-toast-top') && !!lastToast()?.classList.contains('home-ui');
  await opsMod.updateHome(rpc, { id: 'h9', name: '湖畔' });
  assert.equal(txt(lastToast()), '改名成功', '名字支路如实报成功（位置改动不影响文案）');
  assert.ok(atTop(), '改名成功的 toast 走顶部——落在被改的那一行旁边');
  await opsMod.updateHome(rpc, { id: 'h9', name: '' });
  assert.ok(atTop(), '清空＝恢复默认名，同一条顶部口径');
  await opsMod.updateHome(rpc, { id: 'h9', avatar: 'blue' });
  assert.ok(!lastToast()?.classList.contains('hu-toast-top'), '头像支路不被顺手改（照旧落底部）');
  await opsMod.updateAssistant(rpc, { id: 'a9', name: '小婉' });
  assert.ok(atTop(), '助理改名同口径（同一张列表、同一个道理）');
  /* quiet＝true：那条路自带锚定提示，这里必须闭嘴（否则两处同时冒）。 */
  const afBefore = nodes(domDoc.body).filter((n) => n.classList?.contains('af-toast')).length;
  await opsMod.updateHome(rpc, { id: 'h9', name: '湖畔' }, true);
  assert.equal(nodes(domDoc.body).filter((n) => n.classList?.contains('af-toast')).length, afBefore, 'quiet 不再新增 toast（写盘与日志照旧）');
});

/* owner 2026-10-17③：① 焦点特效重做——不加任何环，只把边框点亮（前两版环都被 .hu-nm／.hu-txt 的
 * overflow:hidden 裁过，内环虽不越界仍像盒子套盒子）；② 改名确认要**贴在被改的名字控件正上方**、
 * 对比度够。②的落点是纯函数 `toastPlace`（可单测），本用例同时钉几何与真 DOM 行为。 */
test('owner 2026-10-17③：改名提示锚在被改的控件正上方（反色令牌保对比度），焦点只点亮边框', async () => {
  const css = readFileSync(join(COMP, 'home-row-styles.ts'), 'utf8');
  const toastSrc = readFileSync(join(COMP, 'home-toast.ts'), 'utf8');
  const inp = css.slice(css.indexOf('.home-ui .hu-nminput{'), css.indexOf('.hu-nminput::placeholder'));
  assert.ok(!inp.includes('box-shadow'), '焦点不再画环（外环被裁、内环像套盒子 ⇒ owner 口径：只点亮边框）：' + inp);
  assert.ok(inp.includes('border:1px solid var(--hu-line)'), '静止态是 hairline 边框（聚焦才有对比可言）');
  assert.ok(inp.includes('transition:border-color'), '过渡只做边框色（动画特效重做：不加缩放/不加位移）');
  const focus = css.slice(css.indexOf('.home-ui .hu-nminput:focus'), css.indexOf('.hu-nminput::placeholder'));
  assert.ok(focus.includes('border-color:var(--hu-accent)'), '聚焦＝边框变亮（owner 口径：亮一些即可）');
  assert.ok(focus.includes('outline:none'), '连全局的 focus-visible 外描边也要收掉（同一条裁切原因）');
  const tip = css.slice(css.indexOf('.home-ui.hu-toast{'));
  /* owner 2026-10-17④：chip 必须**实色**。宿主可能把 --hu-ink（← --dsw-alias-label-primary）定义成带 alpha 的
   * 语义色，直接拿它当 background 就会透出面板、看不清字 ⇒ 用**不透明**的 --hu-panel 打底，再把 ink 叠上去
   * （两层写法的用意别被后来人当成冗余合并掉）。 */
  assert.ok(tip.includes('background-color:var(--hu-panel)'), '提示底：用不透明令牌打底（宿主 label 带 alpha 也不透）');
  assert.ok(tip.includes('background-image:linear-gradient(var(--hu-ink),var(--hu-ink))'),
    '提示底：再把正文色叠上去（实际观感仍是不透明反色块，不是面板色）');
  assert.ok(tip.includes('color:var(--hu-panel)'), '提示字用页面底色令牌：与叠出来的实色块互为反色');
  assert.ok(!/background:var\(--hu-ink\)/.test(tip), '不许退回单层 background:var(--hu-ink)（半透明时会糊）');
  assert.ok(tip.includes('position:fixed'), 'body 级 float，坐标系与锚框一致（都在视口坐标）');
  /* owner 2026-10-17④ 真机「背景是透明的」：提示挂 document.body（在 .af-root 之外）⇒ 光有 .home-ui 不够，
   * `.home-ui` 只把 --hu-* 映射到 --af-*，而 --af-* 由 theme.ts 的令牌块只发给 .af-root/.af-menu/.af-toast/
   * .af-overlay/.af-portal（theme.ts:23-37）。少这一个类 ⇒ --hu-* 全成计算期无效值 ⇒ background 整条失效
   * （computed 透明）、color 退回继承（浅色）。两道门：元素自带 af-portal ＋ 抵消那组选择器上的 780px 限宽。 */
  assert.ok(tip.includes('max-width:none'), '抵消 .af-portal 那组选择器上的 780px 限宽（否则长文案被截）');
  assert.ok(toastSrc.includes("'hu-toast home-ui af-portal'"), '提示元素自带 af-portal（body 级挂载的令牌载体，缺它整块透明）');
  assert.ok(tip.includes('.home-ui.hu-toast.show'), '进场动画在（od 淡入＋上浮 4px），不靠 JS 写内联样式');
  /* 纯几何：默认落在控件**正上方**，顶上放不下才翻到下方，左右夹进视口；无锚框＝顶部居中兜底。 */
  const tm: any = (() => {
    try { return boxReq('./client/components/home-toast.js'); } catch { return boxReq('./components/home-toast.js'); }
  })();
  const anchor = { left: 400, top: 300, width: 120, height: 22 };
  assert.deepEqual(tm.toastPlace(180, 32, anchor, 1024, 768), { left: 370, top: 260, above: true }, '贴在控件正上方（gap 8、水平居中）');
  assert.equal(tm.toastPlace(180, 32, { ...anchor, top: 10 }, 1024, 768).above, false, '上方放不下 ⇒ 翻到下方（宁可翻，不丢）');
  assert.equal(tm.toastPlace(180, 32, { ...anchor, left: -60 }, 1024, 768).left, 8, '左越界夹进视口');
  assert.equal(tm.toastPlace(180, 32, { ...anchor, left: 1000 }, 1024, 768).left, 836, '右越界夹进视口');
  assert.deepEqual(tm.toastPlace(180, 32, null, 1024, 768), { left: 422, top: 16, above: true }, '没有锚框（桩 DOM／控件已重建）＝顶部居中，提示不丢');
  assert.equal(tm.boxOf(undefined), null, '拿不到元素＝null（调用方据此走兜底）');
  /* 行为级：面板里就地改名 ⇒ 走 quiet ＋ 锚定提示带文案；且不再出现系统 .af-toast（owner 说的「太远」那条）。 */
  const afBefore = cls(domDoc.body, 'af-toast').length;
  const { bodyEl, handle } = renderBox();
  const row = rowsOf(bodyEl)[0];
  clickEl(byAttr(row, 'data-item-act', 'rename-h')[0]);
  const box = one(one(row, 'hu-nm'), 'hu-nminput');
  box.value = '湖畔';
  box.dispatchEvent({ type: 'keydown', key: 'Enter' });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(renamed.at(-1), { id: 'h1', patch: { name: '湖畔' } }, '照旧落盘一次（写路径不变）');
  assert.equal(renamedQuiet.at(-1), true, '行内改名必须走 quiet：成功提示由锚定提示独占');
  assert.equal(cls(domDoc.body, 'af-toast').length, afBefore, '系统 toast 不再新增（这就是「离输入框太远」那条）');
  const shown = cls(domDoc.body, 'hu-toast').at(-1);
  assert.ok(shown, '锚定提示挂上了');
  assert.ok(shown.classList.contains('home-ui'), '宿主自带 .home-ui（body 级 float 也要拿得到 --hu-* 令牌）');
  assert.ok(shown.classList.contains('af-portal'),
    '还必须自带 af-portal：令牌块（theme.ts:23-37）只发给 .af-root/.af-menu/.af-toast/.af-overlay/.af-portal，'
    + '少这一个类 ⇒ --hu-* 全成计算期无效值 ⇒ 底透明、字继承（owner 2026-10-17④ 真机形态）');
  assert.ok(txt(shown).includes('已改名：湖畔'), '文案说清改成了什么：' + txt(shown));
  handle.dispose();
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
  const ra = byAttr(bodyEl, 'data-item-act', 'settings-a')[0];
  assert.ok(ra && !off(ra));
  clickEl(ra);
  const pop = cls(domDoc.body, 'hu-pop')[0];
  assert.ok(pop && txt(pop).includes('助理设置'));
  const links = cls(pop, 'hu-plink');
  const del = links.find((b: any) => txt(b).includes('删除助理'));
  assert.ok(del, '助理设置弹层有删除助理（恢复默认旁，不再是假按钮）');
  assert.equal(cls(pop, 'hu-avopt').length, 10, '助理设置弹层也有配图行＝照片首格＋9 预置（T11 #128 追修）');
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

test('渠道诚实性（#138）：channelOf 三分支 + 空渠道未绑定行不许被丢（第 0 号风险）', async () => {
  const co = model.channelOf as any;
  /* 判据是 status，不是 botId——孤儿 botId 也是 null，但它的渠道是真历史（失联前绑的就是它）。 */
  assert.equal(co({ status: 'bound', channel: 'feishu' }), 'feishu');
  assert.equal(co({ status: 'orphan', channel: 'weixin' }), 'weixin', '孤儿＝真历史，照常显示');
  assert.equal(co({ status: 'unbound', channel: 'feishu' }), null, '旧版客户端编的占位值不算渠道');
  assert.equal(co({ status: 'unbound', channel: '' }), null);
  assert.equal(co(null), null);
  assert.equal((model.bucketOf as any)({ status: 'unbound', channel: 'feishu' }), '', '未绑定归「待接入」桶');

  const { mkdtempSync: mk, writeFileSync } = await import('node:fs');
  const { tmpdir: td } = await import('node:os');
  const { join: j } = await import('node:path');
  const file = j(mk(j(td(), 'hs-chan-')), 'homes.yaml');
  writeFileSync(file, JSON.stringify({
    version: 2,
    homes: [{ id: 'h1', workspaceId: null, path: 'D:\\agents\\keting', name: '客厅', nameSource: 'user', avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1 }],
    assistants: [
      { id: 'a1', homeId: 'h1', channel: '', botId: null, status: 'unbound', name: '待接入的', nameSource: 'user', avatar: null, avatarSource: 'default', createdAt: 1, boundAt: null },
      { id: 'a2', homeId: 'h1', channel: '', botId: null, status: 'orphan', name: '失联的', nameSource: 'user', avatar: null, avatarSource: 'default', createdAt: 2, boundAt: 1 },
    ],
  }), 'utf8');
  /* 老写法 `if (!channel || …) continue` 会把这两行**整行丢掉** = 静默数据丢失；这条断言钉住读侧已放行。 */
  const doc: any = await homeStore.loadHomesDoc(file);
  assert.equal(doc.assistants.length, 2, '空渠道的未绑定/孤儿行不许被丢掉');
  assert.deepEqual(doc.assistants.map((a: any) => a.channel), ['', '']);
  /* 再存一次（幂等重跑）：掉一行就说明写侧也还在丢。 */
  const again: any = await homeStore.seedDocs(file, { homes: doc.homes, assistants: doc.assistants });
  assert.equal(again.assistants.length, 2, '重跑后仍是两行');
});

test('渠道诚实性（#138）＋显示规范（#139）：未绑定不露渠道，面板可见文案零分隔符', () => {
  const { bodyEl } = renderBox();
  /* 页头副标＝元信息原语：主数强 + 括号注解，两个节点靠 gap 分开。 */
  assert.deepEqual(cls(bodyEl, 'hu-mi').map(txt), ['2 个家', '（每个家对应一个工作区）'], '副标＝主数＋括号注解');
  assert.equal(cls(one(bodyEl, 'hu-ttl'), 'hu-mrow').length, 1, '副标走 hu-mrow 原语容器');
  assert.ok(!txt(bodyEl).includes('·'), 'L1 可见文案零分隔符');

  /* 面包屑两段式（owner 选 b）：层级名弱 + 对象名强，两个节点，信息不丢。 */
  const chip = cls(bodyEl, 'hu-crumb')[1];
  const cb = tag(chip, 'b');
  assert.equal(txt(cls(cb, 'hu-cr2lv')[0]), '助理', '层级名是独立节点');
  assert.equal(txt(cls(cb, 'hu-cr2nm')[0]), '客厅', '对象名是独立节点');
  assert.equal(txt(cb), '助理客厅', '零符号（视觉间距由 CSS gap 给，不在文案里）');

  clickEl(rowsOf(bodyEl)[0]);
  const row = rowsOf(bodyEl).find((r: any) => r.getAttribute('data-id') === 'a2');
  assert.ok(row, '未绑定助理行在场');
  const sub = cls(row, 'hu-sub')[0];
  const parts = cls(sub, 'hu-mi').map(txt);
  assert.equal(parts[0], '待接入', '未绑定格写「待接入」（与接入 CTA 同词）');
  assert.ok(parts[1].indexOf('工作区 ') === 0, '第二格是工作区路径（等宽弱化）');
  assert.ok(!txt(sub).includes('微信') && !txt(sub).includes('weixin'), '旧版编的占位渠道不许露出来');
  assert.ok(!txt(bodyEl).includes('·'), 'L2 可见文案零分隔符');

  clickEl(row);
  const chip2 = cls(bodyEl, 'hu-mchip')[1];
  assert.equal(txt(chip2), '尚未接入', 'L3 详情渠道章：未绑定＝尚未接入');
  assert.ok(!txt(bodyEl).includes('·'), 'L3 可见文案零分隔符');
});

test('渠道视图（#138/#139 Q3）：待接入是显式一组，计数诚实，未绑定助理不从视野消失', () => {
  const { bodyEl } = renderBox('channel');
  assert.equal(ttlOf(bodyEl).b, '渠道', '渠道模式 L1 标题');
  assert.deepEqual(cls(one(bodyEl, 'hu-ttl'), 'hu-mi').map(txt), ['1 个渠道', '（1 位待接入）'],
    '页头＝真渠道数＋待接入人数（qa 修的假渠道不进这个数）');

  const rows = rowsOf(bodyEl);
  assert.deepEqual(rows.map((r: any) => r.getAttribute('data-id')), ['feishu', ''],
    '桶键顺序：真渠道在前、空键（待接入）殿后');
  assert.deepEqual(rows.map((r: any) => txt(tag(cls(r, 'hu-nm')[0], 'b'))), ['飞书', '待接入'],
    '空键的显示名是「待接入」，不是空字符串');
  assert.deepEqual(rows.map((r: any) => cls(r, 'hu-mi').map(txt)),
    [['1 位助理', '（1 位已绑）'], ['1 位助理', '（0 位已绑）']], '组内计数＝总数＋括号注解');
  assert.ok(!txt(bodyEl).includes('·'), '渠道模式 L1 可见文案零分隔符');

  clickEl(rows[1]);
  assert.equal(ttlOf(bodyEl).b, '待接入', '二级标题＝组名');
  assert.equal(rowsOf(bodyEl).filter((r: any) => r.getAttribute('data-id') === 'a2').length, 1,
    '这位没绑的助理就在「待接入」组里——不许从视野里消失');
  assert.ok(!txt(bodyEl).includes('·'), '渠道模式 L2 可见文案零分隔符');
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
  /* 头像底色 owner 2026-10-17 重做：预置 6 档＝**显式实色表**（含 DeepSeek 蓝白/黑白），不再与主题底混色；
   * 未选色的默认档仍按 id 派生色相，但也是实色 hsl(… 62% 42%)。老口径「混色比例 ≥25%」随混色一起退役——
   * 它保的是「深色主题下看得见色相」，新口径直接钉彩度/明度，同一件事更硬（见上面 PRESETS 的对比/可辨断言）。 */
  const identSrc = srcOf('home-identity.ts');
  assert.ok(identSrc.includes('export const PRESETS'), '预置表是显式常量（唯一真相，别处不再抄一份色值）');
  const defHsl = /hsl\(\$\{hueOf\(id, null\)\} (\d+)% (\d+)%\)/.exec(identSrc);
  assert.ok(defHsl, '默认档仍由 id 派生色相（改名不换色）');
  assert.ok(Number(defHsl?.[1] ?? '0') >= 55, '默认档彩度 ≥55%（深色主题下要看得见色相）');
  assert.ok(Number(defHsl?.[2] ?? '0') >= 30, '默认档明度 ≥30%（别再混成灰；42% 的青绿档白字只有 2.7:1，34% 起才够）');
  assert.ok(identSrc.includes('color:${p[1]}'), '字色由预置表给定（不跟主题 ink 混）');
  assert.ok(identSrc.includes('hash32(String(id'), '色相必须由不可变 id 派生（改名不许换色）');

  /* —— 真渲染：DOM 桩 + 真 panel-body。下面每条断言点的是点出来的真 DOM，不是源码文本。 —— */
  const { bodyEl, handle } = renderBox();
  const ttl = (): { b: string; small: string } => ttlOf(bodyEl);
  const foot = (): any => footOf(bodyEl);
  const rows = (): any[] => rowsOf(bodyEl);

  /* L1：无返回键、家行 data-open="L2"（点行进下一级，不是展开树）、底部主操作「新建家」。
   * 呈现策略（非数据规则）：有助理的家在前、空家在后直接成行（折叠退场，owner 2026-10-15）。 */
  assert.ok(one(bodyEl, 'home-ui'), '绿框根 .home-ui 必须在');
  assert.deepEqual(ttl(), { b: '家', small: '2 个家（每个家对应一个工作区）' }, 'L1 页头标题/副标');
  assert.equal(cls(bodyEl, 'hu-back').length, 0, 'L1 不显示返回键（原型：最上层无返回）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L2', 'L2'], '家行带 data-open="L2"（空家也是行）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['h1', 'h2'], '两行都在（T3 一区一家含无人之家仍成立）');
  assert.equal(cls(bodyEl, 'hu-more-row').length, 0, '折叠行退场（owner 2026-10-15：空家直接成行）');
  /* T13 #135（owner 选定 B 方案）：家行＝两段式——上段身份（头像/名字/动作），下段条带。
     老「N 位助理 · 跟随工作区名」副标与圆点条退役：计数交给芯片＋「N 助理」徽章，默认命名规则不再提示；
     「每助理一状态点」保住了（完整档在芯片里、收起档贴头像右下角）。 */
  assert.equal(cls(bodyEl, 'hu-dots').length, 0, '老圆点条退役（点已进芯片）');
  assert.equal(cls(bodyEl, 'hu-strip').length, 2, '两家各一条条带（有助理＋空家都画）');
  assert.equal(cls(bodyEl, 'hu-warnline').length, 0, '本夹具无孤儿家 ⇒ 没有红色警示行');
  const chips = cls(one(rows()[0], 'hu-strip'), 'hu-chip');
  assert.equal(chips.length, 2, 'h1 两位助理两枚芯片（一助理一芯片）');
  assert.deepEqual(chips.map((c) => txt(one(c, 'hu-cnm'))), ['小帅', '客厅'], '芯片带名字（a2 未命名 ⇒ 回落家名）');
  assert.equal(cls(one(rows()[0], 'hu-strip'), 'hu-cdot').filter((d) => d.classList.contains('on')).length, 1, '绿＝在线（a1 已绑在线）');
  assert.equal(cls(one(rows()[0], 'hu-strip'), 'hu-cdot').filter((d) => d.classList.contains('none')).length, 1, '空心＝未绑定（a2 无渠道）');
  assert.ok(chips.every((c) => String(c.getAttribute?.('aria-label') ?? '').includes('：')), '芯片带 aria-label（名字：状态）');
  assert.ok(chips.some((c) => c.classList.contains('unbound')), '未绑定芯片虚线（不加任何状态文字）');
  assert.equal(txt(one(rows()[0], 'hu-cnt')), '2 助理', '条带末端计数徽章：N 助理');
  assert.equal(one(rows()[0], 'hu-strip').getAttribute?.('data-rung'), 'full', '量不到宽度（桩环境）时保持完整档，不许瞎降级');
  /* 空家（h2）：零态即入口 —— 「＋ 建助理」虚线胶囊，且必须是 data-item-act（否则点它会被当成进 L2） */
  const addBtn = one(rows()[1], 'hu-add');
  assert.ok(addBtn, '空家条带＝「＋ 建助理」');
  assert.equal(txt(addBtn), '＋ 建助理', '空家文案（不再写「这个家还没有助理 · 建一个」长句）');
  assert.equal(addBtn.getAttribute?.('data-item-act'), 'new-asst', '空家入口走 item-act 拦截（不会误触进 L2）');
  assert.equal(cls(one(rows()[1], 'hu-strip'), 'hu-chip').length, 0, '空家没有芯片');
  for (const c of ['hu-av', 'hu-txt', 'hu-nm', 'hu-acts2', 'hu-btop', 'hu-strip']) assert.ok(one(rows()[0], c), '家行解剖缺件：' + c);
  assert.equal(cls(one(rows()[0], 'hu-btop'), 'hu-av').length, 1, '头像在上段（条带里没有家头像）');
  assert.deepEqual(crumbInfo(bodyEl), [
    { lv: 'L1', label: '家', cur: true, goto: null },
    { lv: 'L2', label: '助理 客厅', cur: false, goto: 'L2' },
    { lv: 'L3', label: '机器人 小帅', cur: false, goto: 'L3' },
  ], '链路条三级：当前层 aria-current，后两级带默认去处（列表第一个，见「面包屑默认路径」）');
  assert.ok(cls(bodyEl, 'hu-crumb').slice(1).every((c) => !c.getAttribute('aria-disabled')),
    '无焦点时后两级必须可点即进（owner：点击 tab 后就自动进去）');
  assert.equal(txt(foot()), '新建家', 'L1 底部主操作＝新建家');
  /* 命名回落（渲染口径）：手改名冻结＞工作区标题＞目录名；**默认规则不写出来**，只有手改过名才挂 tag */
  assert.equal(txt(tag(one(rows()[0], 'hu-nm'), 'b')), '客厅', '家名回落：没手改 ⇒ 用工作区标题');
  assert.equal(cls(one(rows()[0], 'hu-nm'), 'hu-scr').length, 0, '默认命名（跟随工作区）不挂来源 tag');
  assert.equal(cls(bodyEl, 'hu-sub').length, 0, '老副标「N 位助理 · 跟随工作区名」整条退役');
  assert.equal(cls(bodyEl, 'hu-names').length, 0, '老「助理：名字、名字」灰字行退役（改由芯片承担）');
  assert.equal(txt(tag(one(rows()[1], 'hu-nm'), 'b')), '书房基地', '家名冻结：手改过就不跟工作区（书房）');
  assert.equal(txt(one(one(rows()[1], 'hu-nm'), 'hu-scr')), '你取的名', '手改过名才挂「你取的名」tag');
  /* T6b #114：家行重命名/更多已启用（开家设置弹层：改名＋配图＋恢复默认） */
  assert.equal(cls(bodyEl, 'hu-ract').length, 4, 'L1 家行两枚行动作 ×2 行');
  assert.ok(cls(bodyEl, 'hu-ract').every((b) => !off(b)), '家行的重命名/更多全部可用');
  assert.ok(cls(bodyEl, 'hu-ract').every((b) => !b.classList.contains('planned')), 'L1 不再有 planned 假按钮');
  /* T13 #135 键盘把关：焦点在行上回车＝进 L2；焦点落在行内按钮（「＋ 建助理」）上回车＝只触发按钮，
   * 行不许顺手钻取（一键两事：又开弹层又进 L2）。 */
  rows()[1].dispatchEvent({ type: 'keydown', key: 'Enter', target: one(rows()[1], 'hu-add') });
  assert.deepEqual(ttl(), { b: '家', small: '2 个家（每个家对应一个工作区）' }, '按钮上回车不钻取（仍在 L1）');
  assert.equal(txt(foot()), '新建家', '按钮上回车不钻取（底部仍是新建家）');
  rows()[0].dispatchEvent({ type: 'keydown', key: 'Enter', target: rows()[0] });
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L3', 'L3'], '行上回车＝进 L2（助理行）');
  clickEl(byAttr(bodyEl, 'data-goto', 'L1')[0]);
  assert.deepEqual(ttl(), { b: '家', small: '2 个家（每个家对应一个工作区）' }, '面包屑回 L1（键盘测试复位，后续流程继续）');

  /* 点家行 → L2（钻取，不是展开）：页头换家名、返回键出现、行变助理、底部换「新建助理」 */
  clickEl(rows()[0]);
  assert.deepEqual(ttl(), { b: '客厅', small: '2 位助理（跟随工作区名）' }, 'L2 页头＝家名＋回落来源');
  assert.equal(cls(bodyEl, 'hu-back').length, 1, 'L2 出现返回键 .hu-back');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-open')), ['L3', 'L3'], '助理行带 data-open="L3"（再点进一级）');
  assert.deepEqual(rows().map((r) => r.getAttribute('data-id')), ['a1', 'a2'], '助理行带助理 id');
  assert.equal(txt(curCrumb(bodyEl)), 'L2客厅', '当前层＝L2 家（链路条跟着钻取走）');
  assert.equal(txt(foot()), '新建助理', 'L2 底部主操作＝新建助理');
  assert.ok(txt(rows()[0]).includes('已绑') && txt(rows()[0]).includes('小帅'), '已绑助理行：机器人名回落＋已绑章');
  /* owner 2026-10-17：行上**没有「接入」**——已绑定＝琥珀档「更换机器人」，未绑定＝红档「绑定机器人」。 */
  assert.equal(txt(one(rows()[0], 'hu-ract')), '更换机器人', '已绑助理行：右侧按钮＝更换机器人（不是接入）');
  assert.ok(one(rows()[0], 'hu-ract').className.includes('swap'), '更换机器人走 .swap 琥珀档（暗示「会换掉现有的」）');
  assert.ok(!off(one(rows()[1], 'hu-ract')) && txt(one(rows()[1], 'hu-ract')) === '绑定机器人',
    '未绑助理的「绑定机器人」可用（开绑定弹层，T6b #114）');
  assert.ok(one(rows()[1], 'hu-ract').className.includes('danger'), '未绑定＝红档控件（owner 2026-10-17）');
  assert.ok(cls(rows()[1], 'hu-pill').map(txt).includes('未绑定'), '未绑定胶囊在场');
  assert.equal(one(rows()[1], 'hu-pill').className.includes('bad'), true, '未绑定文字走红档 .hu-pill.bad（owner 2026-10-17）');

  /* 点助理行 → L3 详情：T6b #114 更换机器人/详情/改名与头像/删除助理全可用；T6c #115 换工作区/移除渠道已启用 */
  clickEl(rows()[0]);
  assert.ok(one(bodyEl, 'hu-detail'), 'L3 详情卡 .hu-detail 必须在');
  const acts = cls(bodyEl, 'hu-abtn');
  assert.deepEqual(acts.filter((b) => !off(b)).map((b) => txt(b)), ['更换机器人', '详情', '改名与头像', '删除助理', '换工作区', '移除渠道'], 'L3 六枚全可用（已绑助理，T6c #115）');
  assert.equal(acts.filter(off).length, 0, 'L3 无禁用钮');
  assert.deepEqual(acts.map((b) => b.getAttribute('data-item-act')), ['change-a', 'detail-a', 'settings-a', 'remove-a', 'move-a', 'unbind-a'], '行动作 data-item-act 口径（L3 的「改名与头像」＝settings-a；L2 行上的铅笔＝rename-a 行内改）');
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
  assert.deepEqual(actsU.filter((b) => !off(b)).map((b) => txt(b)), ['绑定机器人', '详情', '改名与头像', '删除助理', '换工作区'], 'L3 未绑五枚可用（无移除渠道，T6c #115）');

  /* 面包屑可向前钻取：点 L1 章回到 L1 */
  clickEl(byAttr(bodyEl, 'data-goto', 'L1')[0]);
  assert.deepEqual(ttl(), { b: '家', small: '2 个家（每个家对应一个工作区）' }, '面包屑点回 L1（链路条可向前钻取）');
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
  /* T8-3 #171：名字之后内嵌两栏（简介 / 人物设定）——建单字段从三项变五项，顺序即视觉顺序。 */
  assert.deepEqual(cls(pop, 'hu-fld').map((f) => txt(tag(f, 'span'))), ['属于哪个家', '绑定机器人', '名字', '简介', '人物设定'], '建单字段');
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
  /* owner 2026-10-14 起、2026-10-17 扩到全量：所有可点控件都要有交互反馈（悬停变样＋按下回弹），
   * 不许「看着能点、点了没反应」。判据＝该类**同时**有 :hover 与 :active 各一条（基表 theme.ts
   * ＋四张 feature 样式表合起来看，因为缺口是逐张补的）；缺一即红。名单逐个钉死，不靠扫
   * cursor:pointer —— 桩里跑，谁删了伪态当场红。 */
  const themeCss = readFileSync(join(CLIENT, 'theme.ts'), 'utf8');
  const rowCss = readFileSync(join(COMP, 'home-row-styles.ts'), 'utf8');
  const fvCssAll = readFileSync(join(COMP, 'first-view-styles.ts'), 'utf8');
  const dmCss = readFileSync(join(COMP, 'dual-mode-styles.ts'), 'utf8');
  const allCss = [themeCss, dirCss, rowCss, fvCssAll, dmCss].join('\n');
  const hasState = (cls: string, state: string): boolean =>
    new RegExp('\\.' + cls + '(?![a-z0-9-])[^{}]*:' + state).test(allCss);
  const clickables = [
    'hu-ibtn', 'hu-back', 'hu-crumb', 'hu-row', 'hu-ract', 'hu-abtn', 'hu-pbtn', 'hu-pbtn-s',
    'hu-dirpath', 'hu-opt', 'hu-avopt', 'hu-plink', 'hu-add',
    'af-btn', 'af-icon-btn', 'af-more-btn', 'af-menu-item', 'af-rename', 'af-seg-item',
    'af-diritem', 'af-row', 'af-cap', 'af-promo-item', 'dm-opt',
  ];
  for (const cls of clickables) {
    assert.ok(hasState(cls, 'hover'), '可点控件缺悬停反馈：' + cls);
    assert.ok(hasState(cls, 'active'), '可点控件缺按下反馈：' + cls);
  }
  /* 空态接入出口＝块级主按钮（owner 2026-10-17）：实心 accent ＋ 悬停抬起 ＋ 按下回弹。
   * 按下那条必须单独存在：hover 的 5 级特异性会压过基表 `.hu-pbtn-s:active`（4 级），否则按住时还浮着。 */
  assert.match(rowCss, /\.hu-pbtn-s\.cta\{[^}]*background:var\(--hu-accent\)/, '接入按钮＝实心 accent 块级主按钮');
  assert.match(rowCss, /\.hu-pbtn-s\.cta:hover:not\(\[disabled\]\)\{[^}]*translateY\(-1px\)/, '接入按钮悬停抬起');
  assert.match(rowCss, /\.hu-pbtn-s\.cta:active:not\(\[disabled\]\)\{[^}]*scale\(\.97\)/, '接入按钮按下回弹');
  /* owner 2026-10-17：未绑定＝红档（文字与胶囊同色），已绑定＝琥珀档「更换机器人」（颜色本身示意「会换掉」）。 */
  assert.match(rowCss, /\.hu-mi\.bad\{[^}]*color:var\(--hu-bad\)/, '未绑定/待接入文字走红档 .hu-mi.bad');
  assert.match(rowCss, /\.hu-ract\.swap\{[^}]*var\(--hu-warn\)/, '行上「更换机器人」＝琥珀档 .hu-ract.swap');
  assert.match(rowCss, /\.hu-abtn\.swap\{[^}]*var\(--hu-warn\)/, '详情面板「更换机器人」同一琥珀档 .hu-abtn.swap');
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
  /* 0.2.20 真机回归（「骨架非常窄」）：首帧骨架出现在任何真行之前，两段式家行样式原本只由 homeStrip
   * 在真行渲染时装配 ⇒ 骨架的 .hu-btop/.hu-sstrip 落进基表 .hu-row 的三列 grid，被挤成左侧一窄条。
   * 先摘掉样式标签（前面用例可能已装），骨架渲染必须自己把它装回来。 */
  const styleId = 'af-feature-home-row-l1';
  try { domDoc.getElementById(styleId)?.remove() } catch { /* 桩里摘不掉就照常判 */ }
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
  const styleTag = domDoc.getElementById(styleId);
  assert.ok(styleTag, '骨架渲染即装配两段式家行样式（0.2.20 骨架过窄回归）');
  assert.ok(String(styleTag?.textContent ?? '').includes('.hu-row.hrow{display:block'), '装配的是两段式家行样式表');
  assert.equal(txt(footOf(bodyEl)), '新建家', '骨架也要有底部主操作');
  /* 真机事故（2026-10-13）：state.failed 是失败端点数组（空数组也 truthy），
   * 只要家表没读完就命中错误分支 ⇒ 进面板瞬间闪出「家表读取失败」横条。这里连非空 failed 也不许出横条。 */
  assert.equal(cls(bodyEl, 'hu-err').length, 0, '首屏不得出现报错横条');
  handle.dispose();
});

test('顶栏吸顶（要求2）：页头＋面包屑包一层 sticky，列表未到底时粘住、到底后随页滑出', () => {
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
  const top = one(bodyEl, 'hu-top');
  assert.ok(top, '页头＋面包屑包在 .hu-top 同一容器里（一起吸顶）');
  assert.ok(one(top, 'hu-fhead') && one(top, 'hu-crumb'), '容器里同时有页头与面包屑');
  assert.ok(top.firstChild === one(top, 'hu-fhead'), '页头在上、面包屑在下（与截图两行同序）');
  const frameSrc = readFileSync(join(COMP, 'home-frame.ts'), 'utf8');
  assert.ok(frameSrc.includes('export function topEl'), '吸顶容器由 home-frame.topEl 唯一出口（panel-body 只调用，不自造）');
  handle.dispose();
  /* 骨架分支同包裹：首屏几何与真框架一致，吸顶不断 */
  const skelEl = new El('div', domDoc);
  const skel = bodyMod.createPanelBody({
    state: { homes: [], assistants: [], bots: [], query: '', mode: 'agent', loading: true, failed: [], homesReady: false, volatile: false },
    bodyEl: skelEl,
    titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => BOX_WS,
    ops: { createHome: async () => {}, createAssistant: async () => {}, connect: () => {} },
    onRetry: () => {},
  });
  skel.render();
  assert.ok(one(skelEl, 'hu-top'), '骨架也包 .hu-top（几何与真框架一致）');
  skel.dispose();
});

test('绑定空态打通接入：无空闲时创建禁用＋给接入出口（死胡同回归）', () => {
  /* 唯一机器人被别的助理占着 ⇒ 未绑定助理无候选：旧弹层创建高亮可点却静默无事，新弹层必须禁用＋指路接入。 */
  const solo = B({ channel: 'feishu', botId: 'b1', workspace: 'D:\\agents\\keting', botName: '小帅', connected: true });
  const holder = A({ id: 'ah', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '占位', nameSource: 'bot' });
  const lone = A({ id: 'a9', homeId: 'h1', channel: 'feishu', botId: null, status: 'unbound', name: '', nameSource: 'home' });
  const connected: Array<{ homeId: string; anchor?: any; asst?: string; after?: (ok: boolean) => void }> = [];
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state: { homes: [H({ id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting' })], assistants: [holder, lone], bots: [solo], query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => BOX_WS,
    ops: {
      createHome: async () => {}, createAssistant: async () => {},
      bindAssistant: async () => {},
      connect: (homeId: string, anchor: unknown, assistantId?: string, after?: (ok: boolean) => void) => {
        connected.push({ homeId, anchor, asst: assistantId, after })
      },
    },
    onRetry: () => {},
  });
  handle.render();
  clickEl(rowsOf(bodyEl)[0]);
  const rows = nodes(bodyEl).filter((r: any) => r.getAttribute?.('data-id') === 'a9');
  assert.ok(rows.length, '未绑定助理行在场');
  const bindBtn = byAttr(rows[0], 'data-item-act', 'bind-a')[0];
  assert.ok(bindBtn, '未绑定行有绑定入口');
  clickEl(bindBtn);
  const pop = one(domDoc.body, 'hu-pop');
  assert.ok(pop && txt(pop).includes('都绑满了'), '空态说清无候选');
  const bind = popBtn(pop, '绑定');
  assert.ok(bind && off(bind), '空态「绑定」必须禁用（不再假装可点）');
  const go = byAttr(pop, 'data-act', 'to-connect')[0];
  assert.ok(go, '空态给新增出口');
  /* owner 2026-10-17：出口原来是 `.hu-plink` 文本链接，真机反馈「现在是文本不明显」⇒ 升格为块级主按钮；
   * 同日再订正：文案「接入新机器人」→「新机器人」，图标由链条（link）改成**加号**——一眼看出会新增一个。
   * 钉四件：① 不再文本链接 ② 走块级主按钮类 ③ 文案＝新机器人 ④ 图标＝plus。 */
  assert.ok(!String(go.className).includes('hu-plink'), '唯一动作不再用文本链接承载（不明显）');
  assert.ok(String(go.className).includes('hu-pbtn-s') && String(go.className).includes('cta'),
    '空态出口＝明显的块级主按钮（.hu-pbtn-s.cta）');
  assert.equal(txt(go), '新机器人', '按钮文案＝新机器人');
  const goIcon = nodes(go).find((n: any) => n.attributes?.get?.('data-hu-icon'));
  assert.equal(goIcon?.attributes?.get?.('data-hu-icon'), 'plus', '图标＝加号（暗示新增一个，不是把现有东西连起来）');
  clickEl(go);
  assert.equal(popMod.homePopOpen(), false, '点接入先关弹层');
  assert.deepEqual(connected.map((c) => c.homeId), ['h1'], '接入带对家（复用 connect 全链路）');
  /* owner 2026-10-17：渠道菜单要落在**被点的「新机器人」按钮**旁边（原来贴着行按钮，离点击处很远）。
   * 锚点因此必须是那个 CTA；`showMenu` 同步读 rect ⇒ 顺序必须是「先开菜单、再关弹层」。 */
  assert.equal(connected[0].anchor?.getAttribute?.('data-act'), 'to-connect',
    '锚点＝被点的「新机器人」按钮（不是行按钮）——菜单才贴着点击处出现');
  /* #141 A：只带家不带助理 ⇒ 接入落成「无主机器人」，会被家表对账补成一条新助理（真机实证）。
   * 发起方必须把本助理身份带下去。 */
  assert.equal(connected[0].asst, 'a9', '#141：接入必须带上本助理身份（只传家会让机器人无主）');
  /* #141 C：落定失败回执 ⇒ 回**同一个助理**的绑定面；成功回执不弹（A 已把它绑上）。 */
  connected[0].after?.(false);
  assert.equal(popMod.homePopOpen(), true, '#141 C：接入没落定要回到本助理的绑定面');
  popMod.closeHomePop(true);
  connected[0].after?.(true);
  assert.equal(popMod.homePopOpen(), false, '#141：落定成功不弹（免得给已绑助理开绑定弹层）');
  /* owner 2026-10-17：已绑定行＝「更换机器人」——开的是**同一张弹层**，只把动词说准（换＝挑另一个空闲机器人，
   * 或「新机器人」造一个）。状态对不上时动作层 fail-closed，所以这里只有已绑定的 holder 能点开。 */
  const holderRow = nodes(bodyEl).filter((r: any) => r.getAttribute?.('data-id') === 'ah')[0];
  assert.equal(txt(one(holderRow, 'hu-ract')), '更换机器人', '已绑定行右侧＝更换机器人（不再有「接入」）');
  assert.ok(one(holderRow, 'hu-ract').className.includes('swap'), '更换机器人＝琥珀档 .swap');
  clickEl(byAttr(holderRow, 'data-item-act', 'change-a')[0]);
  const popCh = one(domDoc.body, 'hu-pop');
  assert.ok(popCh && txt(one(popCh, 'hu-ptitle')).includes('更换机器人'), '弹层标题＝更换机器人（动词跟着状态走）');
  assert.ok(txt(popCh).includes('现在没有空闲的机器人可以换。'), '空态文案也说「换」（不再说「都绑满了」）');
  assert.ok(off(popBtn(popCh, '更换')), '无空闲时「更换」禁用（不假装可点）');
  popMod.closeHomePop(true);
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
    join(COMP, 'home-workspace.ts'),
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
  assert.deepEqual(crumbInfo(bodyEl).map((c) => c.label), ['家', '助理 客厅', '机器人 小帅'],
    'L1 无焦点：默认路径＝列表第一行（活跃家 客厅）→ 它的第一位助理（小帅）');
  assert.ok(!goto(bodyEl, 'L2').getAttribute('aria-disabled') && !goto(bodyEl, 'L3').getAttribute('aria-disabled'),
    '后两级必须可点（owner：点击 tab 后就自动进去）——不许留「助理」/「机器人」空 chip');
  clickEl(goto(bodyEl, 'L2'));
  assert.equal(ttlOf(bodyEl).b, '客厅', '点 L2 chip 直接进入该家的助理层');
  assert.deepEqual(crumbInfo(bodyEl).map((c) => c.label), ['家', '客厅', '机器人 小帅'],
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
  /* ③ 「删除家」popconfirm（要求1）：点按钮只开确认弹，不直接删；确认才真删，取消一行不写 */
  const orow2 = rowById('h9');
  const del2 = cls(orow2, 'hu-ract').filter((b: any) => txt(b) === '删除家')[0];
  assert.equal(del2.getAttribute('data-item-act'), 'remove-home', '删除家走通用派发（popconfirm 在弹层里确认）');
  clickEl(del2);
  assert.deepEqual(removed, [], '点删除只开弹：不发 home.remove');
  const delPop = one(domDoc.body, 'hu-pop');
  assert.ok(delPop && txt(delPop).includes('删除家'), '删除确认弹打开');
  assert.ok(txt(delPop).includes('确定删除'), '弹层说清在做删除确认（不是直接删）');
  assert.ok(txt(delPop).includes('1 位助理'), '弹层点名连带影响（家下还有 1 位助理）');
  assert.deepEqual(cls(one(delPop, 'hu-phead'), 'hu-pbtn-s').map(txt), ['取消', '确认删除'], '取消/确认删除在标题栏右上角');
  clickEl(popBtn(delPop, '取消'));
  await tick();
  assert.equal(popMod.homePopOpen(), false, '取消逻辑关闭（DOM 渐隐 130ms 后移除，以 homePopOpen 为准）');
  assert.deepEqual(removed, [], '取消一行不写');
  clickEl(byAttr(rowById('h9'), 'data-item-act', 'remove-home')[0]);
  const delPop2 = one(domDoc.body, 'hu-pop');
  clickEl(popBtn(delPop2, '确认删除'));
  await tick();
  assert.deepEqual(removed, ['h9'], '确认才真删（只发一次）');
  assert.equal(one(domDoc.body, 'hu-pop'), null, '确认后弹层关闭');
  handle.dispose();
});

test('T10b #127 重绑/删家编排：失败一律 throw 带原文、重绑远端先跟随、写后先读表再刷新；#156 删家不写远端（验收②③）', async () => {
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
  /* ④ 删家（#156 Q1(a) 拍板）：**不写远端工作区**——上游 dsh-im 没有「清空/释放工作区」的语义
   *   （落盘强制非空绝对路径），先前那一步必被拒收 ⇒ 删家必现失败。现在只打墓碑：
   *   home.remove 一次 → 读表 → 刷新；机器人的远端指针原样留着（连接不断，指针由后续绑定/重绑覆盖自愈）。 */
  calls.length = 0;
  const delOps = mkOps(() => ({ ok: true, value: {} }));
  await delOps.removeHome('h9');
  assert.deepEqual(calls.map((c) => c.ep), ['home.remove', 'reloadHomes', 'refresh'], '删家顺序：打墓碑 → 读表 → 刷新（不碰远端）');
  assert.equal(calls.filter((c) => c.ep === 'bot.workspace.set').length, 0, '删家不写远端工作区（远端指针原样保留）');
  assert.deepEqual(calls[0].p, { id: 'h9' }, 'home.remove 只带 id（墓碑＋级联由宿主做）');
  /* ④b 删家落表失败：原文抛出（不静默）＋不读表不刷新（没有远端可回滚） */
  calls.length = 0;
  const delFail = mkOps((ep) => (ep === 'home.remove' ? { ok: false, error: { message: '写盘失败' } } : { ok: true, value: {} }));
  await assert.rejects(() => delFail.removeHome('h9'), /写盘失败/, '删家失败也抛原文（界面不许装作删掉了）');
  assert.deepEqual(calls.map((c) => c.ep), ['home.remove'], '失败 ⇒ 不读表不刷新');
  /* ④c 删家没有远端失败点：远端再坏也照发 home.remove（解绑链不该有可失败点） */
  calls.length = 0;
  const delBadRemote = mkOps((ep) => (ep === 'bot.workspace.set' ? { ok: false, error: { message: '渠道 502' } } : { ok: true, value: {} }));
  await delBadRemote.removeHome('h9');
  assert.deepEqual(calls.map((c) => c.ep), ['home.remove', 'reloadHomes', 'refresh'], '不写远端 ⇒ 远端失败挡不住删家');
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

/* #156 Q1(a)：移除渠道 / 删除助理**不写远端工作区**——上游 dsh-im 没有「清空/释放工作区」的语义
 * （落盘强制非空绝对路径、对外状态恒非空），先前那一步必被拒收 ⇒ 这两条链必现失败（点「确认移除」没反应）。
 * 契约钉死：这两条链**一个远端请求都不许发**（本地解绑/删除即完成；机器人指针原样保留，连接不断）。 */
test('#156 移除渠道/删除助理：不写远端工作区（解绑链没有可失败点）', async () => {
  const { createMoveOps } = boxReq('./client/components/home-move-ops.js');
  const home = H({ id: 'h9', workspaceId: 'ws-9', path: 'D:\\agents\\h9' });
  const asst = A({ id: 'a1', homeId: 'h9', channel: 'feishu', botId: 'b1', status: 'bound' });
  const calls: Array<{ ep: string; p: any }> = [];
  const mkOps = (): any => createMoveOps({
    getRpc: () => async (_path: string, ep: string, p: any) => { calls.push({ ep, p }); return { ok: true, value: {} } },
    getHome: () => home, getAssistant: () => asst, getAssistants: () => [asst],
    reloadHomes: async () => { calls.push({ ep: 'reloadHomes', p: null }) },
    refresh: async () => { calls.push({ ep: 'refresh', p: null }) },
  });
  /* ① 移除渠道：本地解绑即完成，不碰远端 */
  calls.length = 0;
  await mkOps().unbindAssistant('a1');
  assert.deepEqual(calls.map((c) => c.ep), ['assistant.unbind', 'reloadHomes', 'refresh'], '移除渠道：只解本地归属');
  assert.equal(calls.filter((c) => c.ep === 'bot.workspace.set').length, 0, '不写远端工作区（远端指针原样保留）');
  assert.deepEqual(calls[0].p, { id: 'a1', orphan: false }, '解绑走 assistant.unbind（显式移除，非孤儿回落）');
  /* ② 删除助理：只删本地行，不碰远端 */
  calls.length = 0;
  await mkOps().removeAssistant('a1');
  assert.deepEqual(calls.map((c) => c.ep), ['assistant.remove', 'reloadHomes'], '删除助理：只删本地行');
  assert.equal(calls.filter((c) => c.ep === 'bot.workspace.set').length, 0, '不写远端工作区（机器人连接保留）');
});

/* #158 Q2(a)/Q5(a)：绑定前在客户端挡下非绝对路径——上游只收非空绝对路径，坏路径走到 RPC 只会换回难懂的上游报错。
 * 契约：拒绝发生在任何远端请求之前（零 RPC），且如实报原因（toast + 客户端 assistant.action 行带原文）；
 * 合法路径行为不变（照旧一次 bot.workspace.set，且不改写调用方给的路径）。 */
test('#158 bindBot 前置守卫：非绝对路径零 RPC 且如实报原因，合法路径照旧一次下发', async () => {
  const ops: any = boxReq('./client/components/home-ops.js');
  const logMod: any = boxReq('./client/log.js');
  const logBatches: any[] = [];
  const logRpc: any = async (_path: string, _phone: string, args: any) => {
    logBatches.push(args);
    const n = Array.isArray(args?.entries) ? args.entries.length : 0;
    return { ok: true, accepted: n, skipped: 0, rejected: 0 };
  };
  logMod.initLog(logRpc);
  const calls: Array<{ path: string; ep: string; p: any }> = [];
  const rpc: any = async (path: string, ep: string, p: any) => { calls.push({ path, ep, p }); return { ok: true, value: {} } };
  try {
    /* ① 非法：空串 / 纯空白 / 相对路径 / 裸盘符 / 家目录缩写 => 一个远端请求都不发 */
    for (const bad of ['', '   ', 'agents/x', 'C:', '~/.dsh']) {
      calls.length = 0;
      const ok = await ops.bindBot(rpc, 'feishu', 'b1', bad);
      assert.equal(ok, false, '非法工作区必须直接拒绝：' + JSON.stringify(bad));
      assert.deepEqual(calls, [], '拒绝发生在 RPC 之前（零请求）：' + JSON.stringify(bad));
    }
    logMod.flushLogs();
    await new Promise((r) => setTimeout(r, 30));
    const reasonRows = logBatches.flatMap((a) => Array.isArray(a?.entries) ? a.entries : [])
      .filter((e: any) => e?.event === 'assistant.action' && e?.fields?.action === 'bind-bot');
    assert.equal(reasonRows.length, 5, '五次拒绝各留一条客户端动作行（如实报原因，不只弹 toast）');
    for (const row of reasonRows) {
      assert.equal(row.fields.ok, false);
      assert.match(String(row.fields.message), /工作区路径(为空|不是绝对路径)/, '日志带可读原因：' + row.fields.message);
    }
    assert.match(JSON.stringify(reasonRows), /~\/\.dsh/, 'offending 原文进日志（排障要看到收到的到底是什么）');
    /* ② 合法：盘符正/反斜杠、UNC、根路径都放行，且恰好一次 bot.workspace.set（守卫不改写路径） */
    for (const good of ['D:\\agents\\x', 'D:/agents/x', '\\\\server\\share', '/home/x']) {
      calls.length = 0;
      const ok = await ops.bindBot(rpc, 'feishu', 'b1', good);
      assert.equal(ok, true, '合法绝对路径必须放行：' + good);
      assert.deepEqual(calls.map((c) => c.ep), ['bot.workspace.set'], '合法路径照旧一次下发：' + good);
      assert.equal(calls[0].p.workspace, good, '下发的就是调用方给的路径（守卫不改写）');
    }
  } finally {
    logMod.initLog(null);
  }
});

test('T14 #136 孤儿置顶：工作区不存在的家排在 L1 最顶部（红卡＋警示行跟着一起上去）', () => {
  const bodyEl = new El('div', domDoc);
  const homes = [
    H({ id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting', name: '客厅', nameSource: 'system', updatedAt: 5 }),
    H({ id: 'h2', workspaceId: 'ws-2', path: 'D:\\agents\\shufang', name: '书房基地', nameSource: 'user', updatedAt: 6 }),
    /* hx：工作区 ws-gone 已不在（BOX_WS 里没有），且 updatedAt 最老——置顶必须赢过「最近更新」 */
    H({ id: 'hx', workspaceId: 'ws-gone', path: 'D:\\agents\\gone', name: '旧车库', nameSource: 'system', updatedAt: 1 }),
  ];
  const handle = bodyMod.createPanelBody({
    state: { homes, assistants: BOX_ASSTS, bots: BOX_BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false },
    bodyEl,
    titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => BOX_WS,
    ops: { createHome: async () => {}, createAssistant: async () => {}, connect: () => {} },
    onRetry: () => {},
  });
  handle.render();
  const ids = byAttr(bodyEl, 'data-open', 'L2').map((r) => r.getAttribute('data-id'));
  assert.deepEqual(ids, ['hx', 'h1', 'h2'], '孤儿置顶，其次有助理的家（h1），空家（h2）最后');
  const top = byAttr(bodyEl, 'data-id', 'hx')[0];
  assert.ok(top.classList.contains('orphan'), '置顶的是红卡（不是换了个位置的普通行）');
  assert.ok(one(top, 'hu-warnline'), '红色警示行跟着一起上去');
  assert.equal(txt(one(top, 'hu-path')), 'D:\\agents\\gone', '原工作区目录带着走');
});

test('在线一律绿（owner 2026-10-17）：圆点 / 在线胶囊 / 气泡状态字 / 列表副标同一个绿档', () => {
  /* 面板里「在线」曾有三副面孔：蓝胶囊（accent）、黑状态字（ink）、灰列表副标；而状态点注释早写着
   * 「绿＝在线」（.hu-cdot.on 就是 --af-success）。owner 裁定：**属于在线的文字与圆点都必须是绿**。
   * 绿档取 `--af-success`，文字用「绿 × ink」的混合色 ⇒ 深浅两套主题都保得住对比度。 */
  const uiCss = readFileSync(join(COMP, 'home-ui-styles.ts'), 'utf8');
  assert.ok(/\.hu-dot\.on\{[^}]*background:var\(--af-success\)/.test(uiCss), '在线圆点＝绿（--af-success，与会话头呼吸点同款）');
  assert.ok(/\.hu-online\{[^}]*color:color-mix\(in srgb, var\(--af-success\) 55%, var\(--hu-ink\)\)/.test(uiCss),
    '「在线」胶囊文字＝绿（随 ink 走，深色模式自动变浅）');
  assert.ok(/\.hu-online\{[^}]*background:color-mix\(in srgb, var\(--af-success\) 14%, transparent\)/.test(uiCss),
    '在线胶囊底色＝同色淡染（不再是 accent 蓝）');
  const rowCss = readFileSync(join(COMP, 'home-row-styles.ts'), 'utf8');
  assert.ok(rowCss.includes('.home-ui .hu-son{') && rowCss.includes('.hu-tt small .hu-st-on{'),
    '列表副标与气泡状态字共用同一绿档类（不许再出现第三种颜色）');
  const tipSrc = readFileSync(join(COMP, 'home-row-tip.ts'), 'utf8');
  assert.ok(tipSrc.includes("data.status === 'on' ? ' hu-st-on'") && tipSrc.includes("data.status === 'unbound' ? ' hu-st-bad'"),
    '气泡在线挂绿档、未绑定仍挂红档（只把在线染绿）');
  /* 真渲染：机器人副标「渠道（在线）」的在线二字带绿档类，离线不染。 */
  const on = formsMod.botSubNode('feishu', true);
  const off = formsMod.botSubNode('feishu', false);
  assert.equal(txt(on), '飞书（在线）', '副标文案不变（渠道名＋括号注解）');
  assert.equal(cls(on, 'hu-son').length, 1, '在线二字走绿档（真节点，不是字符串拼接）');
  assert.equal(cls(off, 'hu-son').length, 0, '离线不染绿（保持脚注灰）');
  assert.equal(txt(off), '飞书（离线）');
});

console.log('features/home-steel: ALL PASS');
