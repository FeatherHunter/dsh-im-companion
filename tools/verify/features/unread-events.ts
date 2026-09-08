// V2-2 事件源验证（node --test）：脚本化快照序列断言 observe/viewed/prune 调用序 + 服务缺失静默。
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const SRC = join(REPO, 'src');
const ENTRIES = [
  join(SRC, 'features', 'unread', 'events.ts'),
  join(SRC, 'features', 'unread', 'manifest.ts'),
  join(SRC, 'features', 'protocol.ts'),
  join(SRC, 'client', 'data', 'header-overlay.ts'),
  join(SRC, 'client', 'data', 'bindings.ts'),
  join(SRC, 'client', 'data', 'config.ts'),
  join(SRC, 'client', 'data', 'fleet-api.ts'),
  join(SRC, 'client', 'data', 'meta.ts'),
  join(SRC, 'client', 'data', 'model.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'unread-events-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--lib', 'es2023,dom', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}

function locate(base: string, name: string): string {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const full = join(base, e.name);
    if (e.isDirectory()) {
      try { return locate(full, name); } catch { /* continue */ }
    } else if (e.isFile() && e.name === name) return full;
  }
  throw new Error('not found: ' + name);
}

const listeners: Record<string, Array<(ev: unknown) => void>> = {};
const gWin: any = {
  addEventListener: (t: string, f: (ev: unknown) => void) => { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener: (t: string, f: (ev: unknown) => void) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
};
const gDoc: any = { querySelectorAll: () => [] };
(globalThis as any).window = gWin;
(globalThis as any).document = gDoc;
(globalThis as any).console = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

const req = createRequire(join(tmp, 'run.cjs'));
const ev: any = req(locate(tmp, 'events.js'));

interface Item { sessionId: string; running: boolean; completed: boolean }
function snap(items: Item[], current: string): any {
  return { items, current };
}
function short(calls: any[]): string[] {
  return calls.map((c) => c.endpoint.split('.').pop() + ':' + String(c.payload.sessionId).slice(0, 1));
}

test('完成边建候选 → 切 current 已看 → 稳态静默', () => {
  const st = ev.freshEventsState();
  let r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: true, completed: false }], ''), 1000);
  assert.deepEqual(short(r.calls), []);
  r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: false, completed: true }], ''), 2000);
  assert.deepEqual(short(r.calls), ['observe:A']);
  assert.equal(r.calls[0].payload.at, 2000);
  r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: false, completed: true }], 'A'), 3000);
  assert.deepEqual(short(r.calls), ['viewed:A']);
  r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: false, completed: true }], 'A'), 4000);
  assert.deepEqual(short(r.calls), [], '稳态（已看 completed）零调用');
});

test('完成时正被看：不建候选只记已看', () => {
  const st = ev.freshEventsState();
  let r = ev.diffSnapshots(st, snap([{ sessionId: 'B', running: true, completed: false }], ''), 1000);
  assert.deepEqual(short(r.calls), []);
  r = ev.diffSnapshots(st, snap([{ sessionId: 'B', running: false, completed: true }], 'B'), 2000);
  assert.deepEqual(short(r.calls), ['viewed:B'], 'observe 被 id===cur 门禁掉');
});

test('成员消失剪枝（带全量 keep 集）', () => {
  const st = ev.freshEventsState();
  ev.diffSnapshots(st, snap([
    { sessionId: 'A', running: false, completed: true },
    { sessionId: 'G', running: false, completed: false },
  ], ''), 1000);
  const r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: false, completed: true }], ''), 2000);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].endpoint, 'im-companion.unread.prune');
  assert.deepEqual(r.calls[0].payload.keep, ['A']);
});

test('服务缺失/畸形快照静默无调用不抛', () => {
  const st = ev.freshEventsState();
  for (const bad of [null, {}, { items: null }, { items: [{ sessionId: '' }] }, { items: 'x' }]) {
    const r = ev.diffSnapshots(st, bad as any, 1000);
    assert.deepEqual(r.calls, []);
  }
});

test('挂载：节拍驱动 + viewed 事件 backup + 卸载', () => {
  const calls: any[] = [];
  let tick: ((snap: unknown) => void) | null = null;
  const ctx: any = {
    rpc: async (_ch: string, ep: string, p: unknown) => { calls.push({ ep, p }); return { ok: true, value: {} }; },
    subscribe: (fn: (snap: unknown) => void) => { tick = fn; return () => { tick = null; }; },
    get: (n: string) => (n === 'sessions'
      ? { list: { getSnapshot: () => snap([{ sessionId: 'A', running: true, completed: false }], '') } }
      : undefined),
  };
  const stop = ev.mountUnreadEvents(ctx);
  assert.equal(typeof stop, 'function');
  tick!({});
  assert.deepEqual(calls, [], '首轮只建基线');
  (ctx.get as any) = () => ({ list: { getSnapshot: () => snap([{ sessionId: 'A', running: false, completed: true }], '') } });
  tick!({});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ep, 'im-companion.unread.observe');
  for (const f of listeners['dsh-im-companion:session-viewed'] || []) f({ detail: { sessionId: 'C' } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].ep, 'im-companion.unread.viewed');
  assert.equal((calls[1].p as any).sessionId, 'C');
  stop();
  assert.equal(tick, null, '退订');
});

test('挂载：无 rpc/无服务下静默', () => {
  const ctx: any = { rpc: null, subscribe: (fn: (s: unknown) => void) => { fn({}); return () => {}; }, get: () => undefined };
  const stop = ev.mountUnreadEvents(ctx);
  assert.equal(typeof stop, 'function');
  stop();
});

test('归档排除：完成边/current 边全跳过', () => {
  const st = ev.freshEventsState();
  const ex = new Set(['X']);
  let r = ev.diffSnapshots(st, snap([{ sessionId: 'X', running: true, completed: false }], ''), 1000, ex);
  assert.deepEqual(short(r.calls), []);
  r = ev.diffSnapshots(st, snap([{ sessionId: 'X', running: false, completed: true }], ''), 2000, ex);
  assert.deepEqual(r.calls, [], '归档完成边不建候选');
  r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: false, completed: false }], 'X'), 3000, ex);
  assert.deepEqual(short(r.calls), [], '归档 current 不记 viewed');
});

test('归档转存量剪枝：keep 剔除归档', () => {
  const st = ev.freshEventsState();
  ev.diffSnapshots(st, snap([
    { sessionId: 'A', running: false, completed: false },
    { sessionId: 'G', running: false, completed: false },
  ], ''), 1000);
  const r = ev.diffSnapshots(st, snap([{ sessionId: 'A', running: false, completed: false }], ''), 2000, new Set(['G']));
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].endpoint, 'im-companion.unread.prune');
  assert.deepEqual(r.calls[0].payload.keep, ['A']);
});

test('readArchivedIds：缺失=空集，脏值清洗', () => {
  assert.deepEqual([...ev.readArchivedIds({ get: () => undefined } as any)], []);
  assert.deepEqual(
    [...ev.readArchivedIds({ get: () => ({ list: { getSnapshot: () => ({ archivedSessionIds: ['x', '', 42] }) } }) } as any)],
    ['x'],
  );
});

test('cleanup', () => {
  rmSync(tmp, { recursive: true, force: true });
});
