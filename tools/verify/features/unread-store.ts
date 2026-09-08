// V2-1 未读存储验证（node --test）：单调性/覆盖/清理/剪枝/持久化/双进程交替/锁接管。
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'unread-store-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'host', 'unread-store.ts'),
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--lib', 'es2023', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}

const req = createRequire(join(tmp, 'run.cjs'));

function locate(base: string, name: string): string {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const full = join(base, e.name);
    if (e.isDirectory()) {
      try { return locate(full, name); } catch { /* continue */ }
    } else if (e.isFile() && e.name === name) return full;
  }
  throw new Error('not found: ' + name);
}

const compiledJs = locate(tmp, 'unread-store.js');
const mod: any = req(compiledJs);
const UnreadStore = mod.UnreadStore;

function fresh(name: string): { store: any; file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'unread-' + name + '-'));
  const file = join(dir, 'unread.json');
  return { store: new UnreadStore(file), file, dir };
}

test('observe 定住：首次写入保留，重复观测不刷新', async () => {
  const { store } = fresh('mono');
  await store.noteObserved('s1', 100);
  await store.noteObserved('s1', 200);
  const doc = await store.dump();
  assert.equal(doc.unread.s1.notifyAt, 100);
  assert.equal(doc.unread.s1.seenAt, null);
});

test('viewed 覆盖写 seenAt', async () => {
  const { store } = fresh('view');
  await store.noteObserved('s1', 100);
  await store.noteViewed('s1', 150);
  await store.noteViewed('s1', 180);
  const doc = await store.dump();
  assert.equal(doc.unread.s1.seenAt, 180);
  assert.equal(doc.unread.s1.notifyAt, 100);
});

test('clearNotify 只清候选：无条目 no-op', async () => {
  const { store } = fresh('clear');
  await store.clearNotify('ghost');
  await store.noteObserved('s1', 100);
  await store.noteViewed('s1', 150);
  await store.clearNotify('s1');
  const doc = await store.dump();
  assert.equal(doc.unread.s1.notifyAt, null);
  assert.equal(doc.unread.s1.seenAt, 150);
});

test('prune 删消失会话，保留在场', async () => {
  const { store } = fresh('prune');
  await store.noteObserved('keep', 100);
  await store.noteObserved('gone', 100);
  await store.pruneUnread(new Set(['keep']));
  const doc = await store.dump();
  assert.ok(doc.unread.keep);
  assert.ok(!doc.unread.gone);
});

test('非法输入 no-op + 坏文件兜底空表', async () => {
  const { store, file } = fresh('bad');
  await store.noteObserved('', 100);
  await store.noteObserved('s1', NaN);
  await store.noteViewed('s1', -5);
  let doc = await store.dump();
  assert.deepEqual(doc.unread, {});
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, '{not json', 'utf8');
  doc = await store.dump();
  assert.deepEqual(doc.unread, {});
  writeFileSync(file, JSON.stringify({ version: 999, unread: { s1: { seenAt: 1, notifyAt: 2 } } }), 'utf8');
  doc = await store.dump();
  assert.deepEqual(doc.unread, {});
});

test('持久化往返：新实例读到旧数据', async () => {
  const { store, file } = fresh('roundtrip');
  await store.noteObserved('s1', 100);
  await store.noteViewed('s1', 150);
  const again = new UnreadStore(file);
  const doc = await again.dump();
  assert.equal(doc.unread.s1.notifyAt, 100);
  assert.equal(doc.unread.s1.seenAt, 150);
});

test('双进程交替 50 次零丢条目（notifyAt 取最早，seenAt 取其一）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unread-duel-'));
  const file = join(dir, 'unread.json');
  const worker = join(dir, 'worker.cjs');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(worker, [
    "const { UnreadStore } = require(" + JSON.stringify(compiledJs) + ");",
    'const [file, opsJson] = process.argv.slice(2);',
    'const ops = JSON.parse(opsJson);',
    '(async () => { const s = new UnreadStore(file); for (const o of ops) {',
    "  if (o.m === 'observe') await s.noteObserved(o.id, o.at); else await s.noteViewed(o.id, o.at);",
    '} })().catch((e) => { console.error(e); process.exit(1); });',
    '',
  ].join('\n'), 'utf8');
  const opsA: unknown[] = [];
  const opsB: unknown[] = [];
  for (let i = 0; i < 50; i++) {
    opsA.push({ m: 'observe', id: 'shared', at: 100 });
    opsA.push({ m: 'viewed', id: 'a' + i, at: 300 });
    opsB.push({ m: 'observe', id: 'shared', at: 200 });
    opsB.push({ m: 'viewed', id: 'b' + i, at: 400 });
  }
  const ra = spawnSync(process.execPath, [worker, file, JSON.stringify(opsA)], { stdio: 'pipe' });
  const rb = spawnSync(process.execPath, [worker, file, JSON.stringify(opsB)], { stdio: 'pipe' });
  assert.equal(ra.status, 0, 'worker A: ' + String(ra.stderr));
  assert.equal(rb.status, 0, 'worker B: ' + String(rb.stderr));
  const s = new UnreadStore(file);
  const doc = await s.dump();
  assert.equal(doc.unread.shared.notifyAt, 100, '首次观测胜（最早非空）');
  assert.ok(doc.unread.shared.seenAt === null, '无 viewed 写 shared');
  for (let i = 0; i < 50; i++) {
    assert.ok(doc.unread['a' + i], 'a' + i + ' 不丢');
    assert.ok(doc.unread['b' + i], 'b' + i + ' 不丢');
  }
  assert.equal(Object.keys(doc.unread).length, 101);
  rmSync(dir, { recursive: true, force: true });
});

test('stale 锁接管：过期 lockfile 不阻塞写', async () => {
  const { store, file } = fresh('stale');
  const { writeFileSync, utimesSync } = await import('node:fs');
  writeFileSync(file + '.lock', 'dead-pid', 'utf8');
  const past = new Date(Date.now() - 60000);
  utimesSync(file + '.lock', past, past);
  await store.noteObserved('s1', 100);
  const doc = await store.dump();
  assert.equal(doc.unread.s1.notifyAt, 100);
});

test('diag 落盘：计数清洗 + 可读回', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unread-diag-'));
  await mod.writePaintDiag(dir, { groups: 3, rows: 12, red: 1, yellow: 2, blue: NaN });
  await mod.writePaintDiag(dir, null);
  const { readFileSync } = await import('node:fs');
  const doc = JSON.parse(readFileSync(join(dir, 'diag.json'), 'utf8'));
  assert.equal(typeof doc.at, 'number');
  assert.deepEqual([doc.groups, doc.rows, doc.red, doc.yellow, doc.blue], [0, 0, 0, 0, 0], 'null 覆盖写零值');
  await mod.writePaintDiag(dir, { groups: 3, rows: 12, red: 1, yellow: 2, blue: 0 });
  const doc2 = JSON.parse(readFileSync(join(dir, 'diag.json'), 'utf8'));
  assert.deepEqual([doc2.groups, doc2.rows, doc2.red, doc2.yellow, doc2.blue], [3, 12, 1, 2, 0]);
  rmSync(dir, { recursive: true, force: true });
});

test('cleanup', () => {
  rmSync(tmp, { recursive: true, force: true });
});
