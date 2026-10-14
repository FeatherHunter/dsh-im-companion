// T12 #129 验证：配置 YAML 化（迁移幂等 / 注释权威 / 原子写 / 长标量不折行）＋面板「配置」入口两通电话。
//   A 宿主半：仓库 tsconfig 转译 src/ → 临时目录 import 真实现（config-yaml / config-migrate / home-store /
//     open-dir），只把「盘」换成临时目录（presence-host.ts 同款；node_modules 挂 junction 供 'yaml' 解析）。
//   B 客户端半：tsc 现转译 config-pop 链 → dom-shim 渲染**真按钮＋真锚定弹层**，假 rpc 只记账端点名 ⇒
//     「客户端只说意图、平台配方归宿主」（验收③）是点出来的，不是读源码看出来的。
// 变异自证（改 src 的临时副本 ⇒ 本文件必须变红）：lineWidth 改回默认（A5）、迁移不改名备份（A1）、
//   写回不重建注释块（A3）、tmp→rename 换成直接写（A4）、配方表加/减一个平台（A6）、客户端改端点名（B1）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { stringify as stringifyYaml } from 'yaml';
import { createDocument, El } from '../dom-shim.ts';

const REPO = process.cwd();

/* ---------- A 宿主半 ---------- */
const BUILD = mkdtempSync(join(tmpdir(), 't129-cfg-'));
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json',
    '--outDir', BUILD, '--declarationDir', join(BUILD, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(BUILD, 'package.json'), '{"type": "module"}\n');
try { symlinkSync(join(REPO, 'node_modules'), join(BUILD, 'node_modules'), 'junction'); } catch { /* 已存在 */ }
const load = async (name: string): Promise<any> => import(pathToFileURL(join(BUILD, 'host', name)).href);
const cfg: any = await load('config-yaml.js');
const migrate: any = await load('config-migrate.js');
const homeStore: any = await load('home-store.js');
const openDirMod: any = await load('open-dir.js');

const DIRS: string[] = [];
const freshDir = (): string => { const d = mkdtempSync(join(tmpdir(), 't129-')); DIRS.push(d); return d; };
after(() => { rmSync(BUILD, { recursive: true, force: true }); for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

const LEGACY = {
  version: 2,
  homes: [{ id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting', name: '客厅', nameSource: 'user', avatar: '2', updatedAt: 1750000000000, tombstone: false }],
  assistants: [{ id: 'a1', homeId: 'h1', channel: 'qq', botId: 'b9', botName: '野号', name: '野号', nameSource: 'bot', status: 'bound', boundAt: 1 }],
};
const legacyText = JSON.stringify(LEGACY, null, 2) + '\n';
/** 造一份「迁移前」的目录：homes.json ＋ meta.json 都是旧格式。 */
function legacyDir(): { dir: string; homesYaml: string; homesJson: string } {
  const dir = freshDir();
  writeFileSync(join(dir, 'homes.json'), legacyText, 'utf8');
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ version: 1, names: { k: '小帅' } }), 'utf8');
  return { dir, homesYaml: join(dir, 'homes.yaml'), homesJson: join(dir, 'homes.json') };
}

test('#129 迁移幂等：homes.json → homes.yaml（数据一分不丢、旧文件留 .bak、重跑不重复迁移）', async () => {
  const { dir, homesYaml, homesJson } = legacyDir();
  const outs: any[] = await migrate.migrateConfigToYaml(dir);
  assert.deepEqual(outs.map((o: any) => [o.name, o.migrated, o.reason, o.backup]),
    [['homes', true, 'migrated', 'homes.json.bak'], ['meta', true, 'migrated', 'meta.json.bak']]);
  const text = readFileSync(homesYaml, 'utf8');
  /* 注释块整块在最前（验收②前半），正文解析回原文档（验收①不丢数据）。 */
  assert.ok(text.startsWith(cfg.commentBlockFor(cfg.titleForFile(homesYaml))), '注入注释块必须整块在最前');
  assert.ok(text.includes('dsh-im-companion · 家'), '说明行认得出是哪个文件');
  assert.deepEqual((await import('yaml')).parse(text), LEGACY, '迁移后读回必须与原 JSON 等值');
  assert.equal(existsSync(homesJson), false, '旧文件已改名，不再原地留着');
  assert.equal(readFileSync(join(dir, 'homes.json.bak'), 'utf8'), legacyText, '备份＝原字节（改名而非重写）');
  /* 幂等：旧文件已改名成备份 ⇒ 重跑时没有可迁移的输入（reason 诚实回 no-json），
   * 关键是「不重迁移、不覆盖、不新造备份」。 */
  const before = readdirSync(dir).sort();
  const again: any[] = await migrate.migrateConfigToYaml(dir);
  assert.deepEqual(again.map((o: any) => [o.migrated, o.reason]), [[false, 'no-json'], [false, 'no-json']],
    '重跑不许再迁移一次');
  assert.equal(readFileSync(homesYaml, 'utf8'), text, '重跑不许改写已迁移的 .yaml');
  assert.deepEqual(readdirSync(dir).sort(), before, '重跑不许新造备份（.bak-2 不该出现）');
  assert.equal((await migrate.migrateConfigFile(join(dir, 'nope.json'), join(dir, 'nope.yaml'))).reason, 'no-json');
  /* 半迁移态（.json 与 .yaml 同时在场，如上次跑到一半 / 人手放回旧文件）：认已有 .yaml，
   * 不覆盖它、也不动那份 .json —— 覆盖会把用户手上的配置悄悄换掉。 */
  const dir2 = freshDir();
  const yaml2 = join(dir2, 'homes.yaml');
  writeFileSync(join(dir2, 'homes.json'), legacyText, 'utf8');
  writeFileSync(yaml2, 'version: 2\nhomes: []\nassistants: []\n', 'utf8');
  const both: any = await migrate.migrateConfigFile(join(dir2, 'homes.json'), yaml2);
  assert.deepEqual([both.migrated, both.reason, both.backup], [false, 'yaml-exists', '']);
  assert.equal(readFileSync(yaml2, 'utf8'), 'version: 2\nhomes: []\nassistants: []\n', '已有 .yaml 一个字都不改');
  assert.equal(existsSync(join(dir2, 'homes.json')), true, '半迁移态不动旧文件（留给人处置）');
});

test('#129 回落读＋诚实兜底：迁移没跑完时读旧 .json；旧文件坏了既不猜也不删', async () => {
  const dir = freshDir();
  writeFileSync(join(dir, 'homes.json'), legacyText, 'utf8');
  const yamlPath = join(dir, 'homes.yaml');
  const read: any = await cfg.readConfigText(yamlPath);
  assert.deepEqual([read.legacy, read.text], [true, legacyText], '.yaml 缺席 ⇒ 回落读同名 .json 并标明 legacy');
  const doc: any = await homeStore.loadHomesDoc(yamlPath);
  assert.deepEqual([doc.version, doc.homes.length, doc.assistants.length], [2, 1, 1], '回落读不静默空表');
  /* 坏文件：不猜、不覆盖、不删；读回是诚实空表而不是抛。 */
  writeFileSync(join(dir, 'homes.json'), '{ 这不是 JSON 也不是 YAML', 'utf8');
  const bad: any = await migrate.migrateConfigFile(join(dir, 'homes.json'), yamlPath);
  assert.deepEqual([bad.migrated, bad.reason, bad.backup], [false, 'json-invalid', '']);
  assert.equal(existsSync(yamlPath), false, '解析不出来就不许写出半份 .yaml');
  assert.equal(readFileSync(join(dir, 'homes.json'), 'utf8'), '{ 这不是 JSON 也不是 YAML', '坏文件原样留着');
  assert.deepEqual((await homeStore.loadHomesDoc(yamlPath)).homes, [], '读回空表（不抛、不猜）');
});

test('#129 注释权威：手改注释 + 手改结构字段 → 写回时注释被整块恢复、数据字段听用户的', async () => {
  const { dir, homesYaml } = legacyDir();
  await migrate.migrateConfigToYaml(dir);
  const tricked = '# 我手改的注释：这一行不该活过下一次写回\n'
    + stringifyYaml({ ...LEGACY, homes: [{ ...LEGACY.homes[0], name: '手改客厅' }] });
  writeFileSync(homesYaml, tricked, 'utf8');
  const w: any = await homeStore.createAssistantRow(homesYaml, { homeId: 'h1', channel: 'feishu', botId: 'b1', botName: '小帅' });
  assert.equal(w.ok, true);
  const back = readFileSync(homesYaml, 'utf8');
  assert.ok(back.startsWith(cfg.commentBlockFor(cfg.titleForFile(homesYaml))), '我们的注释块被整块重建（覆盖手改）');
  assert.ok(!back.includes('我手改的注释'), '手改的注释行必须消失');
  const doc: any = (await import('yaml')).parse(back);
  assert.equal(doc.homes[0].name, '手改客厅', '结构字段是用户的：手改名不许被写回盖掉');
  assert.equal(doc.assistants.length, 2, '写回是在手改后的文档上追加（不是拿内存旧档覆盖）');
});

test('#129 原子写：tmp→rename；写失败不脏（目标原样、无半截文件）', async () => {
  const dir = freshDir();
  const target = join(dir, 'meta.yaml');
  writeFileSync(target, '旧内容：一个字都不许动\n', 'utf8');
  /* 让写 .tmp 这一步必失败（同名目录占位）⇒ 目标文件必须毫发无伤。 */
  mkdirSync(target + '.tmp');
  await assert.rejects(cfg.writeConfigTextAtomic(target, '新内容\n'), '写 .tmp 失败必须抛（不许假装成功）');
  assert.equal(readFileSync(target, 'utf8'), '旧内容：一个字都不许动\n', '写失败不脏：目标仍是旧内容');
  rmSync(target + '.tmp', { recursive: true, force: true });
  await cfg.writeConfigTextAtomic(target, '新内容\n');
  assert.equal(readFileSync(target, 'utf8'), '新内容\n');
  assert.equal(existsSync(target + '.tmp'), false, '成功路径不留 .tmp（rename 已消费）');
  assert.deepEqual(readdirSync(dir), ['meta.yaml'], '目录里只剩目标文件');
});

test('#129 长标量不折行：data URL round-trip 无损（lineWidth:0 不是装饰）', async () => {
  const dataUrl = 'data:image/png;base64,' + 'A'.repeat(4096);
  const doc = { version: 1, avatars: { k: dataUrl }, names: { k: '小帅' } };
  const text = cfg.renderConfigText(doc, 'meta');
  assert.ok(text.split('\n').some((l: string) => l.includes(dataUrl)), '长标量必须留在一行里（折行的换行会在解析时变空格）');
  assert.deepEqual((await import('yaml')).parse(text), doc, 'round-trip 无损');
  assert.ok(stringifyYaml(doc).split('\n').length > 2, '库默认会折行 ⇒ 我们显式关掉它是有理由的（棘轮）');
});

test('#129 三系统 opener 配方＋假 spawn：成功 / error / 抛 / 未知平台 / 空路径 全路径', async () => {
  const dir = 'D:\\agents\\keting 带空格';
  assert.deepEqual([openDirMod.openRecipeFor('win32').exe, openDirMod.openRecipeFor('win32').args(dir)], ['explorer.exe', [dir]]);
  assert.deepEqual([openDirMod.openRecipeFor('darwin').exe, openDirMod.openRecipeFor('darwin').args(dir)], ['open', [dir]]);
  assert.deepEqual([openDirMod.openRecipeFor('linux').exe, openDirMod.openRecipeFor('linux').args(dir)], ['xdg-open', [dir]]);
  assert.equal(openDirMod.openRecipeFor('aix'), null, '没配方的平台必须诚实回 null');
  const fake = () => {
    const hs: Record<string, (a?: unknown) => void> = {};
    const child: any = { unrefed: false, unref() { child.unrefed = true; }, once(ev: string, cb: any) { hs[ev] = cb; return child; }, fire(ev: string, a?: unknown) { hs[ev]?.(a); } };
    return child;
  };
  const calls: any[] = [];
  const c1 = fake();
  const p1 = openDirMod.openDir(dir, { platform: 'win32', spawnFn: (exe: string, args: string[], opts: any) => { calls.push({ exe, args, opts }); return c1; } });
  await new Promise((r) => setTimeout(r, 0));
  c1.fire('spawn');
  const r1: any = await p1;
  assert.deepEqual([r1.ok, r1.opener, r1.message], [true, 'explorer.exe', '']);
  assert.deepEqual(calls[0].args, [dir], '路径原样进 args（不拼命令行、不引号转义）');
  assert.deepEqual([calls[0].opts.detached, calls[0].opts.stdio, calls[0].opts.windowsHide], [true, 'ignore', true]);
  assert.equal(c1.unrefed, true, '等到 spawn 事件即放掉句柄（不拖住宿主）');
  const c2 = fake();
  const p2 = openDirMod.openDir('/tmp/x', { platform: 'darwin', spawnFn: () => c2 });
  await new Promise((r) => setTimeout(r, 0));
  c2.fire('error', new Error('没有这个程序'));
  const r2: any = await p2;
  assert.deepEqual([r2.ok, r2.opener, r2.message], [false, 'open', '没有这个程序'], '失败原因原文透传给面板');
  const r3: any = await openDirMod.openDir('/tmp/x', { platform: 'linux', spawnFn: () => { throw new Error('EACCES'); } });
  assert.deepEqual([r3.ok, r3.message], [false, 'EACCES'], 'spawn 同步抛也不许漏出去');
  const r4: any = await openDirMod.openDir('/tmp/x', { platform: 'aix' });
  assert.equal(r4.ok, false);
  assert.match(r4.message, /aix/, '不支持就说清是哪个平台');
  assert.equal((await openDirMod.openDir('   ', { platform: 'win32' })).ok, false, '空路径不许当成功');
});

/* ---------- B 客户端半：真渲染 config-pop（dom-shim） ---------- */
const tmpClient = mkdtempSync(join(tmpdir(), 't129-client-'));
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'client', 'components', 'config-pop.ts'),
    '--ignoreConfig', '--rootDir', join(REPO, 'src'), '--outDir', tmpClient, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node', '--declaration', 'false', '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('CLIENT-TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmpClient, 'node_modules'), 'junction'); } catch { /* 已存在 */ }
const copied: string[] = [];
const domDoc: any = createDocument();
/* dom-shim 是桩，缺浏览器自带的 `isConnected`（真值＝节点是否挂在文档树上）。config-pop 的锚点是
 * `() => (btn.isConnected ? btn : null)`（config-pop.ts:52），而 home-pop 对「锚点解析不出来」的处理是
 * **按设计收掉弹层**（`place()` → `closeHomePop(true)`，home-pop.ts:148-153，绝不兜底跳位）⇒ 桩里缺这一个
 * 属性 = 点开即空（实测 hostKids=0）。只在本文件补浏览器语义，不动共享 dom-shim（免得影响其它套件）。 */
const inDocument = (el: any): boolean => { let n = el; while (n?.parentNode) n = n.parentNode; return n === domDoc; };
Object.defineProperty(El.prototype, 'isConnected', { get(this: any) { return inDocument(this); }, configurable: true });
const domWin: any = {
  document: domDoc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: (h: any) => clearTimeout(h),
  navigator: { userAgent: 'node-shim', clipboard: { writeText: async (t: string) => { copied.push(t); } } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 't129' },
  CustomEvent: class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail; } },
  dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {},
};
domDoc.defaultView = domWin;
(globalThis as any).window = domWin;
(globalThis as any).document = domDoc;
(globalThis as any).requestAnimationFrame = domWin.requestAnimationFrame;
(globalThis as any).cancelAnimationFrame = domWin.cancelAnimationFrame;
/* Node 的 `globalThis.navigator` 是内置只读访问器（赋值静默无效）：必须 defineProperty 覆盖，
 * 否则 copyText（config-pop.ts:35 读 `globalThis.navigator?.clipboard`）永远看到 Node 内置的那份、
 * 退到 execCommand，而桩里没有 execCommand ⇒ 用例只能验到失败分支。 */
try { Object.defineProperty(globalThis, 'navigator', { value: domWin.navigator, configurable: true, writable: true }); } catch { /* 覆盖不了就只能验兜底失败分支 */ }
for (const n of ['HTMLElement', 'HTMLIFrameElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
  'HTMLOptionElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLDivElement', 'HTMLSpanElement',
  'HTMLStyleElement', 'HTMLLabelElement', 'HTMLTableElement', 'Node', 'Element']) domWin[n] = El;
const reqClient = createRequire(join(tmpClient, 'run.cjs'));
const popMod: any = reqClient('./client/components/config-pop.js');

const allIn = (root: any): any[] => {
  const out: any[] = [];
  const walk = (n: any): void => { for (const c of n?.childNodes ?? []) if (c.nodeType === 1) { out.push(c); walk(c); } };
  walk(root);
  return out;
};
const pop = (): any => allIn(domDoc.body).find((e) => e.classList?.contains('hu-pop')) ?? null;
const popText = (): string => String(pop()?.textContent ?? '');
const popBtn = (label: string): any => allIn(pop()).find((x) => x.tagName === 'BUTTON' && String(x.textContent).trim() === label);
const wait = async (what: string, cond: () => boolean, ms = 3000): Promise<void> => {
  const t0 = Date.now();
  for (;;) { if (cond()) return; if (Date.now() - t0 > ms) throw new Error('WAIT-TIMEOUT: ' + what + '｜当前：' + popText().slice(0, 200)); await new Promise((r) => setTimeout(r, 10)); }
};

test('#129 面板「配置」入口：目录取自宿主、复制路径走剪贴板、在文件浏览器打开只发意图（同一份客户端代码）', async () => {
  const CFG_DIR = 'D:\\dsh-home\\integrations\\dsh-im-companion';
  const calls: string[] = [];
  const fakeRpc: any = async (channel: string, endpoint: string) => {
    calls.push(channel + ' ' + endpoint);
    if (endpoint === 'config.path') return { ok: true, value: { dir: CFG_DIR, files: ['homes.yaml', 'meta.yaml'] } };
    if (endpoint === 'config.openDir') return { ok: true, value: { opener: 'explorer.exe' } };
    throw new Error('未知端点 ' + endpoint);
  };
  const btn: any = popMod.createConfigButton(fakeRpc);
  domDoc.body.appendChild(btn);
  assert.equal(btn.getAttribute('aria-label'), '配置', '页头按钮就是这一枚');
  assert.equal(btn.getAttribute('title'), '配置：复制路径 / 在文件浏览器打开');
  btn.dispatchEvent({ type: 'click' });
  await wait('config.path 回包渲染', () => popText().includes(CFG_DIR));
  assert.ok(popText().includes('homes.yaml') && popText().includes('meta.yaml'), '目录内文件清单来自宿主');
  popBtn('复制路径').dispatchEvent({ type: 'click' });
  await wait('剪贴板写入', () => copied.length > 0);
  assert.deepEqual(copied, [CFG_DIR], '复制的就是配置目录绝对路径本身');
  popBtn('在文件浏览器打开').dispatchEvent({ type: 'click' });
  /* 等**回包渲染**而不是等「电话发出」：calls 在 rpc 被调的那一刻就记上了，await 链还没走完。 */
  await wait('opener 回包渲染', () => popText().includes('explorer.exe'));
  assert.deepEqual(calls, ['/im-companion config.path', '/im-companion config.openDir'], '只发这两通电话：客户端不认 OS、不拼命令');
  assert.ok(popText().includes('已交给系统打开（explorer.exe）'), '宿主回了哪个 opener 就照原样显示（三系统同一份客户端代码）');
});

test('#129 契约对齐：客户端写的电话名 = 宿主的 case 名（字符串钉，迁移后仍是一处真相）', () => {
  const popSrc = readFileSync(join(REPO, 'src', 'client', 'components', 'config-pop.ts'), 'utf8');
  const rpcSrc = readFileSync(join(REPO, 'src', 'host', 'rpc.ts'), 'utf8');
  assert.match(popSrc, /'config\.path'/);
  assert.match(popSrc, /'config\.openDir'/);
  assert.ok(!/explorer|xdg-open|darwin|win32/.test(popSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')),
    '客户端不许出现任何平台配方（配方只在 src/host/open-dir.ts 一处）');
  assert.match(rpcSrc, /case 'config\.path':/);
  assert.match(rpcSrc, /case 'config\.openDir':/);
  const openSrc = readFileSync(join(REPO, 'src', 'host', 'open-dir.ts'), 'utf8');
  assert.match(openSrc, /explorer\.exe/);
  assert.match(openSrc, /'xdg-open'/);
});

console.log('features/config-yaml: ALL PASS');
