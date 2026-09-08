// V2-3 重演真值表（node --test）：红/蓝/黄/平静全分支 + PM 未知 kind 兜底黄 + 候选边界。
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
  join(SRC, 'features', 'unread', 'replay.ts'),
  join(SRC, 'client', 'data', 'session-kind.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'unread-replay-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
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

function locate(base: string, name: string): string {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const full = join(base, e.name);
    if (e.isDirectory()) {
      try { return locate(full, name); } catch { /* continue */ }
    } else if (e.isFile() && e.name === name) return full;
  }
  throw new Error('not found: ' + name);
}

const req = createRequire(join(tmp, 'run.cjs'));
const replay: any = req(locate(tmp, 'replay.js'));
const kind: any = req(locate(tmp, 'session-kind.js'));

function run(input: unknown): any {
  return replay.replaySession(input);
}

test('kind 分类与 flags 旧语义一致', () => {
  assert.equal(kind.classifyKind('completed').isDoneKind, true);
  assert.equal(kind.classifyKind('transient').isDoneKind, true);
  assert.equal(kind.classifyKind('  Completed ').isDoneKind, true);
  assert.equal(kind.classifyKind('error xyz').isError, true);
  assert.equal(kind.classifyKind('402 payment').is402, true);
  assert.equal(kind.classifyKind('aborted by user').isAborted, true);
  assert.equal(kind.classifyKind('').isEmpty, true);
  assert.equal(kind.classifyKind('interrupted').isUnknownOther, true);
  assert.equal(kind.classifyKind('max-tokens').isUnknownOther, true);
});

test('红：402/aborted/error（有候选也压黄）', () => {
  for (const k of ['402', 'aborted', 'some error']) {
    const r = run({ open: false, kind: k, approval: false, seenAt: null, notifyAt: 100 });
    assert.equal(r.flag, 'red', k);
  }
});

test('approval 黄压一切非红；open 蓝', () => {
  assert.equal(run({ open: false, kind: 'completed', approval: true, seenAt: null, notifyAt: 100 }).flag, 'yellow');
  assert.equal(run({ open: true, kind: 'completed', approval: false, seenAt: null, notifyAt: 100 }).flag, 'blue');
  assert.equal(run({ open: true, kind: '', approval: false, seenAt: null, notifyAt: null }).flag, 'blue');
});

test('黄：候选 + completed/transient/空/未知（PM 兜底）', () => {
  for (const k of ['completed', 'transient', '', 'interrupted', 'max-tokens']) {
    const r = run({ open: false, kind: k, approval: false, seenAt: null, notifyAt: 100 });
    assert.equal(r.flag, 'yellow', JSON.stringify(k));
    assert.equal(r.yellowSrc, 'unread');
  }
});

test('候选边界：seenAt>=notifyAt 即平静；同毫秒=已看', () => {
  assert.equal(run({ open: false, kind: 'completed', approval: false, seenAt: 100, notifyAt: 100 }).flag, 'none');
  assert.equal(run({ open: false, kind: 'completed', approval: false, seenAt: 200, notifyAt: 100 }).flag, 'none');
  assert.equal(run({ open: false, kind: 'completed', approval: false, seenAt: null, notifyAt: null }).flag, 'none');
});

test('无候选：completed/空=平静，未知=红（与 live 一致）', () => {
  assert.equal(run({ open: false, kind: 'completed', approval: false, seenAt: null, notifyAt: null }).flag, 'none');
  assert.equal(run({ open: false, kind: '', approval: false, seenAt: 50, notifyAt: null }).flag, 'none');
  const r = run({ open: false, kind: 'interrupted', approval: false, seenAt: null, notifyAt: null });
  assert.equal(r.flag, 'red');
});

test('cleanup', () => {
  rmSync(tmp, { recursive: true, force: true });
});
