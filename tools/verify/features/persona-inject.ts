// T8-2 #170 验证：人设系统提示词段 + 会话归属索引（只断外部行为：注入文本、日志事件、可观察标记）。
//
// ① 注册面：模块级 inject 仍只有 connection；apply 末尾后置 ctx.inject(['systemPrompt'])；
//    段名/order/interpolate 正确、无 required/complete；卸载时 disposer 真被调用；
//    宿主无 systemPrompt 服务时 apply 不炸（回调不执行）；同名残留（热重载）只记常驻失败、不打断 apply。；与上游段（order 115/125）共存：名字带插件前缀、order 不撞
// ② 渲染契约：有归属+有人设 ⇒ 固定三段文本；无会话/无归属/无人设/超长/异常 ⇒ ''，永不抛。
// ③ 归属索引（假 fs）：EACCES / 坏 JSON / 删除 / 缓存戳 / 1:N / 负结果 TTL；weixin 面只看 sessions。
// ④ 人设目录：按 channel+botId join homes.yaml，取 name/persona；未绑定行不返回。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeCtx } from '../fixtures/fake-ctx.ts';

const REPO = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'persona-build-'));
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p', 'tsconfig.json', '--outDir', tmp, '--declarationDir', join(tmp, 'types'), '--sourceMap', 'false'],
    { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(tmp, 'package.json'), '{"type": "module"}\n');
try { symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }

const host: any = await import(pathToFileURL(join(tmp, 'index.js')).href);
const { createSessionOwnership } = await import(pathToFileURL(join(tmp, 'host', 'session-ownership.js')).href);
const { createAssistantDirectory } = await import(pathToFileURL(join(tmp, 'host', 'assistant-directory.js')).href);
const { createPersonaSection, PERSONA_SECTION_NAME, PERSONA_SECTION_ORDER } =
  await import(pathToFileURL(join(tmp, 'host', 'prompt-section.js')).href);

const homes: string[] = [];
function freshHome(withHomes: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'persona-home-'));
  homes.push(dir);
  if (withHomes) {
    const cfg = join(dir, 'integrations', 'dsh-im-companion');
    mkdirSync(cfg, { recursive: true });
    writeFileSync(join(cfg, 'homes.yaml'), [
      'version: 2',
      'homes:',
      '  - id: h1',
      '    path: D:/ws/demo',
      '    name: 演示家',
      'assistants:',
      '  - id: a1',
      '    homeId: h1',
      '    channel: wecom',
      '    botId: bot1',
      '    status: bound',
      '    name: 小助手',
      '    persona: "你是一个耐心的助理"',
      '  - id: a2',
      '    homeId: h1',
      '    channel: wecom',
      '    botId: bot2',
      '    status: unbound',
      '    name: 未绑定',
      '    persona: "不该被读到"',
      '',
    ].join('\n'));
  }
  return dir;
}
function writeState(home: string, channel: string, region: string, botId: string, sessions: Record<string, string>, extra: Record<string, unknown> = {}): void {
  const dir = join(home, 'integrations', 'dsh-' + channel, region, botId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ version: 1, sessions, ...extra }, null, 2));
}
after(() => {
  rmSync(tmp, { recursive: true, force: true });
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

function collector(): { rows: Array<{ level: string; event: string; fields: any }>; log: (level: string, event: string, fields: any) => void } {
  const rows: Array<{ level: string; event: string; fields: any }> = [];
  return { rows, log: (level, event, fields) => rows.push({ level, event, fields }) };
}
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const started = Date.now();
  while (!predicate() && Date.now() - started < ms) await tick(10);
}

// ── ① 注册面 ──────────────────────────────────────────────────────────
test('apply 后置 inject systemPrompt：段名/order/interpolate 正确，且无 required/complete', () => {
  const home = freshHome(true);
  writeState(home, 'wecom', 'bots', 'bot1', { 'conv-1': 's1' });
  const fake = makeCtx(host.inject);
  host.apply(fake.ctx, { dshHome: home });
  assert.deepEqual(fake.injected.at(-1), ['systemPrompt'], 'apply 末尾必须后置注入 systemPrompt');
  const spec = fake.sections.find((s) => s.name === PERSONA_SECTION_NAME);
  assert.ok(spec, '应注册 dsh-im-companion:persona');
  assert.equal(spec!.order, PERSONA_SECTION_ORDER);
  assert.equal(spec!.order, 650);
  assert.equal(spec!.interpolate, false);
  assert.ok(!('required' in spec!), '不得设 required');
  assert.ok(!('complete' in spec!), '不得设 complete（排他段会吞掉别人的提示词）');
  console.log('#170-PROOF register name=' + spec!.name + ' order=' + spec!.order + ' PASS');
});

test('与上游共存：段名带插件前缀、order 650 不撞 dsh-im 的 115/125（升级回归钉子）', () => {
  assert.ok(PERSONA_SECTION_NAME.startsWith('dsh-im-companion:'), '段名必须带插件前缀（不得占用上游裸名）');
  for (const upstream of [115, 125]) assert.notEqual(PERSONA_SECTION_ORDER, upstream, 'order 不得与上游 dsh-im 的 ' + upstream + ' 相撞');
  assert.ok(PERSONA_SECTION_ORDER > 600 && PERSONA_SECTION_ORDER < 800, 'order 落在 TEAM_POLICY(600) 与 PTC_ONLY(800) 之间');
  const home = freshHome(false);
  const fake = makeCtx(host.inject);
  fake.prompt.section({ name: 'upstream-dsh-im:sample', order: 115, interpolate: false, text: () => 'upstream' });
  assert.doesNotThrow(() => host.apply(fake.ctx, { dshHome: home }), '上游段已存在不得让 apply 抛错');
  assert.ok(fake.sections.some((s: { name: string }) => s.name === PERSONA_SECTION_NAME), '本段仍能注册（不因上游段已存在而失败）');
  assert.equal(fake.sections.length, 2, '上游段与本段共存（互不顶替）');
  console.log('#170-PROOF coexist upstream=115/125 PASS');
});

test('有归属+有人设 ⇒ 注入固定三段文本', async () => {
  const home = freshHome(true);
  writeState(home, 'wecom', 'bots', 'bot1', { 'conv-1': 's1' });
  const fake = makeCtx(host.inject);
  host.apply(fake.ctx, { dshHome: home });
  const spec = fake.sections.find((s) => s.name === PERSONA_SECTION_NAME)!;
  let text = '';
  await waitFor(() => { text = spec.text({ agent: { session: { id: 's1' } } }); return text.length > 0; });
  assert.equal(text, '## 助理身份：小助手\n\n你是一个耐心的助理\n\n始终以该身份回应');
  console.log('#170-PROOF render-bound PASS');
});

test('卸载：ctx.effect 的清理真调用 section disposer', () => {
  const home = freshHome(true);
  writeState(home, 'wecom', 'bots', 'bot1', { 'conv-1': 's1' });
  const fake = makeCtx(host.inject);
  host.apply(fake.ctx, { dshHome: home });
  assert.equal(fake.sections.length, 1);
  const cleanup = fake.effects[fake.effects.length - 1];
  assert.equal(typeof cleanup, 'function', '人设段必须挂 ctx.effect 清理');
  cleanup();
  assert.equal(fake.sections.length, 0, '清理后旧段必须从服务上摘掉（否则热重载旧 section 残留）');
  assert.equal(fake.promptDisposals, 1);
  console.log('#170-PROOF disposer PASS');
});

test('宿主无 systemPrompt 服务：apply 不炸，回调不执行', () => {
  const home = freshHome(false);
  const fake = makeCtx(host.inject, { withPrompt: false });
  assert.doesNotThrow(() => host.apply(fake.ctx, { dshHome: home }));
  assert.deepEqual(fake.injected, [['systemPrompt']], '仍应发起后置注入（服务缺席只是不回调）');
  assert.equal(fake.sections.length, 0);
  console.log('#170-PROOF no-service PASS');
});

test('同名残留（热重载）：只记常驻失败，不打断 apply', () => {
  const home = freshHome(false);
  const fake = makeCtx(host.inject);
  fake.prompt.section({ name: PERSONA_SECTION_NAME, order: 650, interpolate: false, text: () => 'stale' });
  assert.doesNotThrow(() => host.apply(fake.ctx, { dshHome: home }), 'section 已注册不得让 apply 抛错');
  assert.equal(fake.sections.length, 1, '旧段保留，新段不注册');
  assert.ok(fake.warns.some((w) => w.includes('persona section register failed')), '应留一条可见的注册失败 warn');
  console.log('#170-PROOF duplicate-resident PASS');
});

// ── ② 渲染契约（直接建 section，stub 归属/目录）────────────────────────
function buildSection(ownershipLookup: (id: string) => any, directoryLookup: (c: string, b: string) => any) {
  const log = collector();
  const section = createPersonaSection({
    ownership: { lookup: ownershipLookup },
    directory: { lookup: directoryLookup },
    log,
  });
  return { section, log };
}
const HIT = { hit: true, reason: 'hit', channel: 'wecom', botId: 'bot1', ambiguous: false, candidates: ['wecom/bot1'], cacheAgeMs: 0 };
const ROW = { assistantId: 'a1', name: '小助手', persona: '你是一个耐心的助理', description: '' };

test('渲染：无会话/数字会话/无归属/无人设/超长/异常 ⇒ 空串且不抛', () => {
  const cases: Array<[string, any, (id: string) => any, (c: string, b: string) => any, string]> = [
    ['no-assembly', undefined, () => HIT, () => ROW, ''],
    ['number-id', { agent: { session: { id: 42 } } }, () => HIT, () => ROW, ''],
    ['miss', { agent: { session: { id: 's1' } } }, () => ({ ...HIT, hit: false, reason: 'miss' }), () => ROW, ''],
    ['no-assistant', { agent: { session: { id: 's1' } } }, () => HIT, () => null, ''],
    ['persona-empty', { agent: { session: { id: 's1' } } }, () => HIT, () => ({ ...ROW, persona: '' }), ''],
    ['too-long', { agent: { session: { id: 's1' } } }, () => HIT, () => ({ ...ROW, persona: '字'.repeat(8001) }), ''],
    ['throw', { agent: { session: { id: 's1' } } }, () => { throw new Error('boom'); }, () => ROW, ''],
  ];
  for (const [label, assembly, ownership, directory, expected] of cases) {
    const { section } = buildSection(ownership, directory);
    let out = 'x';
    assert.doesNotThrow(() => { out = section.text(assembly); }, label + ' 不得抛');
    assert.equal(out, expected, label);
  }
  console.log('#170-PROOF render-empty-cases PASS');
});

test('渲染：名字清洗（换行折叠/trim/64 码点/空名占位）', () => {
  const long = '名'.repeat(100);
  const expectName = (name: any) => {
    const { section } = buildSection(() => HIT, () => ({ ...ROW, name }));
    return section.text({ agent: { session: { id: 's1' } } }).split('\n')[0];
  };
  assert.equal(expectName('\r\n 长名字 \r\n'), '## 助理身份：长名字');
  assert.equal(expectName(long), '## 助理身份：' + '名'.repeat(64));
  assert.equal(expectName(''), '## 助理身份：未命名助理');
  assert.equal(expectName(null), '## 助理身份：未命名助理');
  console.log('#170-PROOF name-sanitize PASS');
});

test('首条 miss 记 debug、命中记 debug，正文绝不进日志', () => {
  const { section, log } = buildSection(() => ({ ...HIT, hit: false, reason: 'not-ready' }), () => ROW);
  assert.equal(section.text({ agent: { session: { id: 's1' } } }), '');
  assert.equal(log.rows.length, 1);
  assert.equal(log.rows[0].event, 'persona.resolve');
  assert.equal(log.rows[0].level, 'debug', '逐渲染明细只许 debug');
  assert.equal(log.rows[0].fields.reason, 'not-ready');
  const hitLog = collector();
  const hitSection = createPersonaSection({ ownership: { lookup: () => HIT }, directory: { lookup: () => ROW }, log: hitLog });
  const body = hitSection.text({ agent: { session: { id: 's1' } } });
  assert.ok(body.includes('你是一个耐心的助理'));
  const dump = JSON.stringify(hitLog.rows);
  assert.ok(!dump.includes('你是一个耐心的助理'), '人设正文绝不进日志');
  assert.equal(hitLog.rows[0].fields.personaChars, [...'你是一个耐心的助理'].length);
  assert.equal(hitLog.rows[0].fields.hit, true);
  console.log('#170-PROOF log-no-body PASS');
});

// ── ③ 归属索引（假 fs）──────────────────────────────────────────────
type FakeFile = { text: string; mtimeMs: number };
function fakeFs(tree: Map<string, string[] | { code: string }>, files: Map<string, FakeFile>) {
  let readdirCalls = 0;
  let readFileCalls = 0;
  const fs = {
    async readdir(dir: string) {
      readdirCalls++;
      const entry = tree.get(dir);
      if (!entry) throw Object.assign(new Error('ENOENT: ' + dir), { code: 'ENOENT' });
      if (!Array.isArray(entry)) throw Object.assign(new Error(entry.code + ': ' + dir), { code: entry.code });
      return [...entry];
    },
    async stat(file: string) {
      const f = files.get(file);
      if (!f) throw Object.assign(new Error('ENOENT: ' + file), { code: 'ENOENT' });
      return { mtimeMs: f.mtimeMs, size: Buffer.byteLength(f.text), isFile: () => true };
    },
    async readFile(file: string) {
      readFileCalls++;
      const f = files.get(file);
      if (!f) throw Object.assign(new Error('ENOENT: ' + file), { code: 'ENOENT' });
      return f.text;
    },
  };
  return { fs, calls: () => ({ readdirCalls, readFileCalls }) };
}

function ownershipHome(): { home: string; root: string; tree: Map<string, string[] | { code: string }>; files: Map<string, FakeFile>; statePath: (c: string, r: string, b: string) => string } {
  const home = freshHome(false);
  const root = join(home, 'integrations');
  const statePath = (c: string, r: string, b: string) => join(root, 'dsh-' + c, r, b, 'state.json');
  const tree = new Map<string, string[] | { code: string }>();
  const files = new Map<string, FakeFile>();
  tree.set(root, []);
  return { home, root, tree, files, statePath };
}

test('归属 1:N：mtime 最新者胜，结果变化才 warn', async () => {
  const { home, root, tree, files, statePath } = ownershipHome();
  tree.set(root, ['dsh-wecom', 'dsh-dingtalk']);
  tree.set(join(root, 'dsh-wecom'), ['bots']);
  tree.set(join(root, 'dsh-dingtalk'), ['accounts']);
  tree.set(join(root, 'dsh-wecom', 'bots'), ['botA']);
  tree.set(join(root, 'dsh-dingtalk', 'accounts'), ['botB']);
  files.set(statePath('wecom', 'bots', 'botA'), { text: JSON.stringify({ sessions: { c1: 's1' } }), mtimeMs: 100 });
  files.set(statePath('dingtalk', 'accounts', 'botB'), { text: JSON.stringify({ sessions: { c2: 's1' } }), mtimeMs: 200 });
  const log = collector();
  const { fs } = fakeFs(tree, files);
  const own = createSessionOwnership({ dshHome: home, log, fs });
  await own.refresh('test');
  const hit = own.lookup('s1');
  assert.equal(hit.hit, true);
  assert.equal(hit.channel, 'dingtalk');
  assert.equal(hit.botId, 'botB');
  assert.equal(hit.ambiguous, true);
  const warns = log.rows.filter((r) => r.event === 'persona.ownership.ambiguity');
  assert.equal(warns.length, 1);
  assert.deepEqual(warns[0].fields.bots, ['dingtalk/botB', 'wecom/botA']);
  await own.refresh('again');
  assert.equal(log.rows.filter((r) => r.event === 'persona.ownership.ambiguity').length, 1, '结果没变不得重复 warn');
  console.log('#170-PROOF ownership-1N PASS');
});

test('缓存戳：mtime/size 没变不重读；变了才重读', async () => {
  const { home, root, tree, files, statePath } = ownershipHome();
  tree.set(root, ['dsh-wecom']);
  tree.set(join(root, 'dsh-wecom'), ['bots']);
  tree.set(join(root, 'dsh-wecom', 'bots'), ['botA']);
  const file = statePath('wecom', 'bots', 'botA');
  files.set(file, { text: JSON.stringify({ sessions: { c1: 's1' } }), mtimeMs: 100 });
  const { fs, calls } = fakeFs(tree, files);
  const own = createSessionOwnership({ dshHome: home, log: collector(), fs });
  await own.refresh('first');
  assert.equal(calls().readFileCalls, 1);
  await own.refresh('second');
  assert.equal(calls().readFileCalls, 1, '戳没变不应重读');
  files.set(file, { text: JSON.stringify({ sessions: { c1: 's1' } }), mtimeMs: 300 });
  await own.refresh('third');
  assert.equal(calls().readFileCalls, 2, 'mtime 变了应重读');
  console.log('#170-PROOF cache-stamp PASS');
});

test('文件删除清旧绑定；EACCES 读不到时保留上次绑定', async () => {
  const { home, root, tree, files, statePath } = ownershipHome();
  tree.set(root, ['dsh-wecom']);
  tree.set(join(root, 'dsh-wecom'), ['bots']);
  tree.set(join(root, 'dsh-wecom', 'bots'), ['botA']);
  const file = statePath('wecom', 'bots', 'botA');
  files.set(file, { text: JSON.stringify({ sessions: { c1: 's1' } }), mtimeMs: 100 });
  const log = collector();
  const { fs } = fakeFs(tree, files);
  const own = createSessionOwnership({ dshHome: home, log, fs });
  await own.refresh('first');
  assert.equal(own.lookup('s1').hit, true);
  // 读目录 EACCES：不能把「没看到」当「删了」。
  tree.set(join(root, 'dsh-wecom', 'bots'), { code: 'EACCES' });
  await own.refresh('eacces');
  assert.equal(own.lookup('s1').hit, true, 'EACCES 时应保留上次绑定');
  assert.ok(log.rows.some((r) => r.event === 'persona.refresh.fail' && r.level === 'warn'));
  // 目录恢复但文件真删了 ⇒ 清旧绑定。
  tree.set(join(root, 'dsh-wecom', 'bots'), []);
  files.delete(file);
  await own.refresh('deleted');
  assert.equal(own.lookup('s1').hit, false, '文件删除必须清旧绑定');
  console.log('#170-PROOF delete-keeps PASS');
});

test('坏 JSON 保留上次绑定并记 warn', async () => {
  const { home, root, tree, files, statePath } = ownershipHome();
  tree.set(root, ['dsh-wecom']);
  tree.set(join(root, 'dsh-wecom'), ['bots']);
  tree.set(join(root, 'dsh-wecom', 'bots'), ['botA']);
  const file = statePath('wecom', 'bots', 'botA');
  files.set(file, { text: JSON.stringify({ sessions: { c1: 's1' } }), mtimeMs: 100 });
  const log = collector();
  const { fs } = fakeFs(tree, files);
  const own = createSessionOwnership({ dshHome: home, log, fs });
  await own.refresh('first');
  files.set(file, { text: '{ not json', mtimeMs: 200 });
  await own.refresh('broken');
  assert.equal(own.lookup('s1').hit, true, '坏 JSON 不得抹掉上次绑定');
  assert.ok(log.rows.some((r) => r.event === 'persona.refresh.fail' && r.fields.code === 'parse-failed'));
  console.log('#170-PROOF bad-json PASS');
});

test('负结果 TTL：miss 后 2000ms 内不重复扫盘', async () => {
  const { home, root, tree } = ownershipHome();
  tree.set(root, ['dsh-wecom']);
  tree.set(join(root, 'dsh-wecom'), ['bots']);
  tree.set(join(root, 'dsh-wecom', 'bots'), ['botA']);
  let clock = 1000;
  const { fs, calls } = fakeFs(tree, new Map());
  const own = createSessionOwnership({ dshHome: home, log: collector(), fs, now: () => clock });
  own.lookup('nope');
  await own.refresh('wait');
  const afterFirst = calls().readdirCalls;
  clock += 500;
  assert.equal(own.lookup('nope').reason, 'negative-cache');
  await tick(10);
  assert.equal(calls().readdirCalls, afterFirst, 'TTL 内不得再扫盘');
  clock += 2000;
  own.lookup('nope');
  await tick(10);
  assert.ok(calls().readdirCalls > afterFirst, 'TTL 过了应重新扫盘');
  console.log('#170-PROOF negative-ttl PASS');
});

test('weixin 面只读 sessions：令牌/正文不进索引也不进日志', async () => {
  const { home, root, tree, files, statePath } = ownershipHome();
  tree.set(root, ['dsh-weixin']);
  tree.set(join(root, 'dsh-weixin'), ['accounts']);
  tree.set(join(root, 'dsh-weixin', 'accounts'), ['wx1']);
  const file = statePath('weixin', 'accounts', 'wx1');
  files.set(file, {
    text: JSON.stringify({
      version: 1,
      sessions: { c1: 's1' },
      getUpdatesBuf: 'SECRET-CURSOR',
      contextTokens: { SECRET: 'TOKEN-VALUE' },
      recentOutboundMessages: ['SECRET-MESSAGE'],
    }),
    mtimeMs: 100,
  });
  const log = collector();
  const { fs } = fakeFs(tree, files);
  const own = createSessionOwnership({ dshHome: home, log, fs });
  await own.refresh('test');
  assert.equal(own.lookup('s1').channel, 'weixin');
  const dump = JSON.stringify(log.rows);
  assert.ok(!dump.includes('SECRET'), '非 sessions 键一律不读不记');
  console.log('#170-PROOF weixin-sessions-only PASS');
});

// ── ④ 人设目录 ───────────────────────────────────────────────────────
test('目录按 channel+botId join homes.yaml：取 name/persona，未绑定不返回', async () => {
  const home = freshHome(true);
  const log = collector();
  const directory = createAssistantDirectory({ dshHome: home, log });
  await directory.refresh('test');
  const bound = directory.lookup('wecom', 'bot1');
  assert.equal(bound?.name, '小助手');
  assert.equal(bound?.persona, '你是一个耐心的助理');
  assert.equal(directory.lookup('wecom', 'bot2'), null, 'unbound 行不得参与注入');
  assert.equal(directory.lookup('wecom', 'nope'), null);
  console.log('#170-PROOF directory-join PASS');
});
