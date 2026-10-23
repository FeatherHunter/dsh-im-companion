// T9 #123 验证：日志管道（事件清单 / 调用点不漂移 / 语义映射 / 客户端适配 / 真落盘端到端）。
//
// 为什么值得单独一个验证物：日志的价值全在「事后能判」——
//   ① 事件名与清单漂移（埋了点没进清单、清单里有死条目）⇒ 日志里出现读不懂的代码名；
//   ② resident 标错 ⇒ 调试开关关着时关键 info 静默 `'skipped'`、磁盘零行、丢弃计数还是 0（最难发现）；
//   ③ 落点写错 ⇒ agent 事后按惯例路径找不到文件。
// 做法：把 host 半转译到临时目录（与 lib/ 同形态）真跑，并在临时 dshHome 里**真落一次盘**再读文件。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'log-pipeline-'));
const tmpClient = mkdtempSync(join(tmpdir(), 'log-client-'));
const tmpHome = mkdtempSync(join(tmpdir(), 'log-home-'));
after(() => {
  for (const dir of [tmp, tmpClient, tmpHome]) rmSync(dir, { recursive: true, force: true });
});

// ── 转译：host 半（tsconfig.json → 与 lib/ 同形态）+ 客户端日志适配器（单文件，够跑就行）──
const tsc = join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--outDir', tmp, '--declarationDir', join(tmp, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' });
  execFileSync(process.execPath, [tsc, join(REPO, 'src', 'client', 'log.ts'), join(REPO, 'src', 'log-events.ts'), '--ignoreConfig', '--outDir', tmpClient, '--rootDir', join(REPO, 'src'), '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--skipLibCheck'], { stdio: 'pipe' });
  /* 客户端源码按打包器风格写省略扩展名（bundler 解析）；转译成 Node 能跑的单文件时补上 .js。 */
  const emitted = join(tmpClient, 'client', 'log.js');
  writeFileSync(emitted, readFileSync(emitted, 'utf8').replace(/from '\.\.\/log-events'/g, "from '../log-events.js'"));
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
for (const dir of [tmp, tmpClient]) {
  writeFileSync(join(dir, 'package.json'), '{"type": "module"}\n');
  try { symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }
}

const logPkg: any = await import('dsh-log');
const clientPkg: any = await import('dsh-log/client');
const events: any = await import(pathToFileURL(join(tmp, 'log-events.js')).href);
const sites: any = await import(pathToFileURL(join(tmp, 'host', 'log-sites.js')).href);
const hostLog: any = await import(pathToFileURL(join(tmp, 'host', 'log.js')).href);
const clientLog: any = await import(pathToFileURL(join(tmpClient, 'client', 'log.js')).href);
const { LOG_EVENTS, LOG_EVENT_LIST, LOG_PLUGIN_ID } = events;

// ── 1. 清单本身合法：包能解析、resident 非空、每条声明形状对 ──────────────────
test('事件清单：包能解析、resident 非空、每条声明形状对', () => {
  assert.equal(LOG_PLUGIN_ID, 'dsh-im-companion', '插件标识是落点目录名的一部分，改名会改落点');
  const manifest = logPkg.parseEventListManifest(LOG_EVENT_LIST);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.pluginId, LOG_PLUGIN_ID);
  const counts = logPkg.computeEventCounts(manifest);
  assert.ok(counts.resident > 0, 'resident 事件一条都没有 ⇒ 开关关着时磁盘会是空的');
  for (const [name, spec] of Object.entries<any>(LOG_EVENTS)) {
    assert.match(name, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/, '事件名是稳定代码名（小写点分）: ' + name);
    assert.ok(['error', 'warn', 'info', 'debug'].includes(spec.level), name + ' 级别非法');
    assert.ok(['resident', 'ondemand', 'selfmon'].includes(spec.kind), name + ' kind 非法');
    assert.ok(Array.isArray(spec.fields), name + ' fields 必须是数组');
    assert.equal(spec.kind === 'resident' && spec.level === 'debug', false, name + '：高频 debug 不该标 resident');
  }
});

// ── 2. 调用点与清单不漂移（双向）─────────────────────────────────────────────
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

test('调用点与清单双向不漂移：没有「埋了点没进清单」，也没有死条目', () => {
  const files = sourceFiles(join(REPO, 'src')).filter((f) => !f.endsWith('log-events.ts'));
  const declared = new Set(Object.keys(LOG_EVENTS));
  const called = new Map<string, string>();
  const callRe = /(?:logLine|\.log)\(\s*'(?:error|warn|info|debug)'\s*,\s*'([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+)'/g;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(callRe)) {
      const event = m[1];
      if (!called.has(event)) called.set(event, f.slice(REPO.length + 1));
      assert.ok(declared.has(event), `调用点用了未声明的事件 ${event}（${f.slice(REPO.length + 1)}）`);
    }
  }
  // 反向：清单里每条事件都得在源码里真的出现（log-sites.ts 的 `event: 'x'` 也算）
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const name of declared) {
    assert.ok(all.includes(`'${name}'`), `清单里有死条目 ${name}：源码里没人用`);
  }
  assert.ok(called.size >= 10, '客户端/宿主调用点太少（' + called.size + '），埋点没做完？');
});

// ── 3. 语义映射：字段集必须落在清单声明的 fields 内；失败必带原文 ──────────────
const domainCases: Array<[string, Record<string, unknown>, any]> = [
  ['home.create', { workspaceId: 'ws-1' }, { ok: true, value: { home: { id: 'h-1', name: '工作区甲' } } }],
  ['home.update', { id: 'h-1', name: '新名', avatar: 'a' }, { ok: true, value: { home: { id: 'h-1' } } }],
  ['home.rebind', { id: 'h-1', workspaceId: 'ws-2', path: 'D:\\x' }, { ok: true, value: { home: { id: 'h-1' } } }],
  ['home.remove', { id: 'h-1' }, { ok: true, value: { home: { id: 'h-1' } } }],
  ['home.seed', {}, { ok: true, value: { summary: { created: 1, adopted: 2, skipped: 3 } } }],
  ['assistant.create', { homeId: 'h-1', botId: 'b-1' }, { ok: true, value: { assistant: { id: 'a-1' } } }],
  ['assistant.createUnbound', { homeId: 'h-1' }, { ok: true, value: { assistant: { id: 'a-2' } } }],
  ['assistant.bind', { id: 'a-2', botId: 'b-2' }, { ok: true, value: { assistant: { id: 'a-2', homeId: 'h-1' } } }],
  ['assistant.update', { id: 'a-1', name: 'x' }, { ok: true, value: { assistant: { id: 'a-1' } } }],
  ['assistant.remove', { id: 'a-1' }, { ok: true, value: {} }],
  ['assistant.move', { id: 'a-1', targetHomeId: 'h-2' }, { ok: true, value: { assistant: { id: 'a-1', homeId: 'h-2' } } }],
  ['assistant.unbind', { id: 'a-1' }, { ok: true, value: { assistant: { id: 'a-1', botId: 'b-1' } } }],
  ['meta.rename', { key: 'k', name: 'n' }, { ok: true, value: {} }],
  ['fs.list', { dir: 'C:\\x' }, { ok: true, value: { count: 3 } }],
  ['imc.updateCheck', {}, { ok: true, value: { snapshot: { installedVersion: '0.2.8', latestVersion: '0.2.9' } } }],
  ['imc.updateInstall', {}, { ok: true, value: { snapshot: { latestVersion: '0.2.9' } } }],
];

/** 明细类端点：成功按声明级别、失败只要求「有行 + 字段合法」（失败详情由 host.rpc.fail 兜）。 */
const softCases: Array<[string, Record<string, unknown>, any]> = [
  ['imc.updateStatus', {}, { ok: false, error: { code: 'x', message: 'y' } }],
  ['imc.updateChangelog', {}, { ok: false, error: { code: 'x', message: 'y' } }],
];

test('语义映射（明细类）：成功按声明级别，字段全在清单内', () => {
  for (const [endpoint, payload, result] of softCases) {
    const line = sites.describeCall(endpoint, payload, result);
    assert.ok(line, endpoint + ' 应当有行');
    const allowed = new Set(LOG_EVENTS[line.event].fields);
    for (const key of Object.keys(line.fields)) assert.ok(allowed.has(key), endpoint + ' 字段 ' + key + ' 未声明');
  }
});

test('语义映射：成功 info、失败 error＋原文，字段全在清单声明内', () => {
  for (const [endpoint, payload, result] of domainCases) {
    const line = sites.describeCall(endpoint, payload, result);
    assert.ok(line, endpoint + ' 应当有语义行');
    assert.ok(Object.hasOwn(LOG_EVENTS, line.event), endpoint + ' → 未声明事件 ' + line.event);
    const allowed = new Set(LOG_EVENTS[line.event].fields);
    for (const key of Object.keys(line.fields)) {
      assert.ok(allowed.has(key), `${endpoint} → ${line.event} 的字段 ${key} 没在清单里声明`);
    }
    assert.equal(line.level, LOG_EVENTS[line.event].level, endpoint + ' 成功行级别必须与清单声明一致');
    const bad = sites.describeCall(endpoint, payload, { ok: false, error: { code: 'bad-request', message: 'key 必填' } });
    assert.equal(bad.level, 'error', endpoint + ' 失败应为 error');
    assert.equal(bad.fields.message, 'key 必填', endpoint + ' 失败必须带错误原文');
    assert.equal(bad.fields.ok, false);
  }
});

test('语义映射：纯读端点不产生语义行（只留 host.rpc.call 明细）', () => {
  for (const endpoint of ['ping', 'meta.get', 'home.list', 'routes.list', 'activity.snapshot', 'fs.roots', 'fs.defaultRoot']) {
    assert.equal(sites.describeCall(endpoint, {}, { ok: true, value: {} }), null, endpoint + ' 不该有语义行');
  }
});

// ── 4. resident 判定：开关关着也放行（dsh-log 的三态）────────────────────────
test('resident：关键 info 在开关关着时也放行；未声明事件不落盘；error 恒放行', () => {
  const cl = clientPkg.createClientLog({}, { pluginId: LOG_PLUGIN_ID, prefix: LOG_PLUGIN_ID, eventList: LOG_EVENT_LIST });
  assert.equal(cl.isEnabled('info', 'client.start'), true, 'resident 的 info 必须放行（否则开关关着磁盘零行）');
  assert.equal(cl.isEnabled('info', 'not.declared.event'), false, '未声明的 info 不该放行');
  assert.equal(cl.isEnabled('error', 'not.declared.event'), true, 'error 恒放行');
  assert.equal(cl.isEnabled('warn', 'not.declared.event'), true, 'warn 恒放行');
});

// ── 5. 客户端适配器：没桥也不抛（日志不许影响功能）────────────────────────────
test('客户端适配器：无桥时 logLine/flush/logOn 全不抛', () => {
  clientLog.initLog(null);
  assert.doesNotThrow(() => clientLog.logLine('info', 'client.start', { features: 3 }));
  assert.doesNotThrow(() => clientLog.logLine('error', 'panel.mount.fail', { message: 'boom' }));
  assert.doesNotThrow(() => clientLog.flushLogs());
  assert.doesNotThrow(() => clientLog.reconcileLogSwitch());
  assert.equal(typeof clientLog.logOn('debug'), 'boolean');
  assert.equal(typeof clientLog.droppedLogs(), 'number');
});

// ── 6. 端到端真落盘：临时 dshHome 里写一行，再按惯例路径读回来 ────────────────
test('真落盘：<dshHome>/logs/dsh-im-companion/<日期>.log 里能读到 resident 行（v:3）', async () => {
  const handle = await hostLog.createHostLogFor(tmpHome);
  assert.ok(handle, '建库失败（返回 null）：真实环境里日志会静默降级，这里必须红');
  assert.equal(handle.dir, join(tmpHome, 'logs', LOG_PLUGIN_ID), '落点必须是 <DSH_HOME>/logs/<pluginId>（生态惯例，agent 按它找）');
  handle.log('info', 'host.start', { route: '/api/im-companion', dshHome: tmpHome });
  await handle.synced();
  assert.equal(handle.dropped(), 0, '不该有丢弃行');
  const dir = join(tmpHome, 'logs', LOG_PLUGIN_ID);
  assert.ok(existsSync(dir), '日志目录没建出来: ' + dir);
  const files = readdirSync(dir).filter((f) => f.endsWith('.log'));
  assert.ok(files.length >= 1, '当天日志文件没落盘: ' + files.join(','));
  const text = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  assert.ok(text.includes('"host.start"'), '落盘内容里没有 host.start: ' + text.slice(0, 400));
  assert.ok(/"v":\s*3/.test(text), '0.3.x 行必须带 v:3（0.2.x 兼容期的行没有它）');
  assert.ok(text.includes('"route":"/api/im-companion"'), 'fields 没原样落盘: ' + text.slice(0, 400));
  assert.ok(existsSync(join(tmpHome, 'logs', 'log-switch-' + LOG_PLUGIN_ID + '.json')), '开关文件没物化（会每次启动记误报）');
});

// ── 6b. 开关不被启动覆盖：磁盘上已有的开关（用户的选择）必须原样保留 ──────────
test('开关：启动不覆盖磁盘上已有的调试开关（保住用户的选择）', async () => {
  const home = mkdtempSync(join(tmpdir(), 'log-switch-'));
  const cacheDir = join(home, 'logs');
  mkdirSync(cacheDir, { recursive: true });
  const switchFile = join(cacheDir, 'log-switch-' + LOG_PLUGIN_ID + '.json');
  writeFileSync(switchFile, '{"enabled":true}\n');
  const handle = await hostLog.createHostLogFor(home);
  assert.ok(handle, '建库失败');
  await handle.synced();
  const text = readFileSync(switchFile, 'utf8');
  assert.ok(/"enabled"\s*:\s*true/.test(text), '启动把用户打开的开关写回 false 了: ' + text);
  rmSync(home, { recursive: true, force: true });
});

// ── 7. withRpcLog：逐调用一条 + 语义行，失败带原因码 ──────────────────────────
test('withRpcLog：成功记 debug 明细、失败记 error＋原因码，语义行同时产出', async () => {
  const lines: any[] = [];
  const fake = { log: (level: string, event: string, fields: any) => lines.push({ level, event, fields }) };
  const okDispatch = async () => ({ ok: true, value: { home: { id: 'h-9' } } });
  await hostLog.withRpcLog(okDispatch, () => fake)('home.create', { workspaceId: 'ws-9' }, null);
  assert.deepEqual(lines.map((l) => l.event), ['home.create', 'host.rpc.call']);
  assert.equal(lines[1].level, 'debug');
  assert.equal(lines[0].fields.homeId, 'h-9');
  lines.length = 0;
  const failDispatch = async () => ({ ok: false, error: { code: 'bad-request', message: 'key 必填' } });
  await hostLog.withRpcLog(failDispatch, () => fake)('home.create', {}, null);
  assert.deepEqual(lines.map((l) => l.event), ['home.create', 'host.rpc.fail']);
  assert.equal(lines[1].level, 'error');
  assert.equal(lines[1].fields.code, 'bad-request');
  assert.equal(lines[1].fields.ok, false);
  lines.length = 0;
  // 无日志实例（建库失败/让位分支）⇒ 一行都不记，但业务结果照常返回
  const res = await hostLog.withRpcLog(failDispatch, () => null)('home.create', {}, null);
  assert.equal(res.ok, false);
  assert.equal(lines.length, 0);
});

// ── 8. 接缝在位：rpc.ts 里日志电话优先分发 + index.ts 让位后才建库 ─────────────
test('接缝：rpc.ts 分发日志电话、index.ts 让位分支之后才建库', () => {
  const rpc = readFileSync(join(REPO, 'src', 'host', 'rpc.ts'), 'utf8');
  assert.ok(rpc.includes('opts.logPhones?.has(endpoint)'), 'rpc.ts 必须优先分发 dsh-log 的电话');
  assert.ok(rpc.includes('withRpcLog(dispatch, opts.log)'), 'rpc.ts 必须逐调用记日志');
  const index = readFileSync(join(REPO, 'src', 'index.ts'), 'utf8');
  /* 装配保持同步（宿主缺 fetch.register 要当场抛，见 host-entry.ts 的回归钉）⇒ 建库不 await，走 then 链。 */
  assert.ok(index.includes('createHostLogFor(dshHome)'), 'index.ts 必须建库');
  assert.ok(!/export async function apply/.test(index), 'apply 必须保持同步（装配失败要当场抛）');
  const yieldIdx = index.indexOf('already registered by another instance');
  const logIdx = index.indexOf('createHostLogFor(dshHome)');
  assert.ok(yieldIdx > 0 && logIdx > yieldIdx, '让位分支必须排在建库之前（否则两个实例抢同一日志目录）');
  assert.ok(index.includes("'host.update.tap'"), '更新包事件口要接进日志');
});

// ── 9. 真机日志实证出的两条纪律：一个动作一条 resident 行 + resident 立刻冲刷 ──
test('日志纪律：取径只记一次、resident 行立刻冲刷（2026-10-15 真机日志实证）', () => {
  const picker = readFileSync(join(REPO, 'src', 'client', 'ui', 'dir-picker.ts'), 'utf8');
  const dirMod = readFileSync(join(REPO, 'src', 'client', 'components', 'home-dir.ts'), 'utf8');
  const logMod = readFileSync(join(REPO, 'src', 'client', 'log.ts'), 'utf8');
  /* 一次「选择目录」只许留一条 dir.pick：共享原语记（成功/取消/内置浏览都在那一处），feature 侧再记一次＝两行。 */
  assert.ok(picker.includes("'dir.pick'"), 'dir-picker 必须记 dir.pick（成功/取消/内置浏览同一处）');
  assert.ok(!dirMod.includes("'dir.pick'"), 'home-dir 不许再记一次 dir.pick（同一动作两行，读日志会误判「点了两次」）');
  /* 客户端批量默认约 1s：宿主侧同一操作的行会插到前面去（home.create 出现在 dir.adopt 之前）⇒ resident 立刻冲刷。 */
  assert.ok(logMod.includes("LOG_EVENTS[event]?.kind === 'resident'"), 'resident 行必须立刻 flush（否则跨端时间线错序）');
});
