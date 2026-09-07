// truth-flags 自验证（只测本票触碰面：flags 纯逻辑 + manifest 空槽 + 红环断言）。
// node --test 运行，零第三方依赖；转译仅 protocol+flags+manifest 三文件。
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'truth-flags');
const ENTRIES = [
  join(REPO, 'src', 'features', 'protocol.ts'),
  join(FEAT, 'flags.ts'),
  join(FEAT, 'manifest.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'truth-flags-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
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
const flags: any = req(locate(tmp, 'flags.js'));
const manifest: any = req(locate(tmp, 'manifest.js'));
const flagsSrc = readFileSync(join(FEAT, 'flags.ts'), 'utf8');
const manifestSrc = readFileSync(join(FEAT, 'manifest.ts'), 'utf8');

const base = {
  open: false, kind: '', approval: false,
  amber: false, green: false, isNew: false, justFinished: false, titleHit: true,
};

function tipClean(tip: unknown) {
  assert.equal(typeof tip, 'string');
  const s = String(tip);
  assert.ok(s.length > 0, 'tip 非空');
  assert.ok(!/[0-9]:/.test(s), 'tip 不拼时间：' + s);
  assert.ok(s.indexOf('Date') < 0 && s.indexOf('time') < 0, 'tip 不拼时间：' + s);
}

test('open真+isNew=>blue（running）', () => {
  const r = flags.flagsForSession({ ...base, open: true, isNew: true });
  assert.equal(r.flag, 'blue');
  assert.equal(r.blueSrc, 'running');
  tipClean(r.tip);
});

test('402+isNew=>red（forbidden402）', () => {
  const r = flags.flagsForSession({ ...base, kind: '402', isNew: true });
  assert.equal(r.flag, 'red');
  assert.equal(r.redReason, 'forbidden402');
  tipClean(r.tip);
});

test('aborted=>red', () => {
  const r = flags.flagsForSession({ ...base, kind: 'aborted' });
  assert.equal(r.flag, 'red');
  assert.equal(r.redReason, 'aborted');
  tipClean(r.tip);
});

test('completed闭合=>none 不染蓝（旧完成即平静）', () => {
  const r = flags.flagsForSession({ ...base, kind: 'completed' });
  assert.equal(r.flag, 'none');
  assert.notEqual(r.flag, 'red');
  tipClean(r.tip);
});

test('completed+open 重试中=>blue（running）', () => {
  const r = flags.flagsForSession({ ...base, kind: 'completed', open: true, isNew: true });
  assert.equal(r.flag, 'blue');
  assert.equal(r.blueSrc, 'running');
  tipClean(r.tip);
});

test('error终止未恢复=>red（unknown-default）', () => {
  const r = flags.flagsForSession({ ...base, kind: 'error', isNew: true });
  assert.equal(r.flag, 'red');
  assert.equal(r.redReason, 'unknown-default');
  tipClean(r.tip);
});

test('approval 等弹窗=>yellow 非 red（P1 废）', () => {
  const r = flags.flagsForSession({ ...base, approval: true });
  assert.equal(r.flag, 'yellow');
  assert.notEqual(r.flag, 'red');
  tipClean(r.tip);
});

test('approval 压 open=>yellow（弹窗阻塞等你拍板）', () => {
  const r = flags.flagsForSession({ ...base, approval: true, open: true, isNew: true });
  assert.equal(r.flag, 'yellow');
  tipClean(r.tip);
});

test('amber=>yellow（system-amber 优先）', () => {
  const r = flags.flagsForSession({ ...base, amber: true });
  assert.equal(r.flag, 'yellow');
  assert.equal(r.yellowSrc, 'system-amber');
  tipClean(r.tip);
});

test('沉默 open（open 真+!isNew+!justFinished+approval 假）=>none', () => {
  const r = flags.flagsForSession({ ...base, open: true, isNew: false, justFinished: false, approval: false });
  assert.equal(r.flag, 'none');
  tipClean(r.tip);
});

test('首见 running=>blue（信任首见，防种子水位误杀）', () => {
  const r = flags.flagsForSession({ ...base, open: true, isNew: false, justFinished: false, approval: false, observedBefore: false });
  assert.equal(r.flag, 'blue');
  assert.equal(r.blueSrc, 'running');
  tipClean(r.tip);
});

test('持续无进展 running=>none（静默残留）', () => {
  const r = flags.flagsForSession({ ...base, open: true, isNew: false, justFinished: false, approval: false, observedBefore: true });
  assert.equal(r.flag, 'none');
  tipClean(r.tip);
});

test('isStaleOpen 仅持续无进展才真', () => {
  assert.equal(flags.isStaleOpen(true, false, false, false, false), false);
  assert.equal(flags.isStaleOpen(true, false, false, false, true), true);
  assert.equal(flags.isStaleOpen(true, true, false, false, true), false);
  assert.equal(flags.isStaleOpen(false, false, false, false, true), false);
});

test('green+isNew=>yellow（native-dot 压 water-level）', () => {
  const r = flags.flagsForSession({ ...base, green: true, isNew: true });
  assert.equal(r.flag, 'yellow');
  assert.equal(r.yellowSrc, 'native-dot');
  tipClean(r.tip);
});

test('justFinished=>done', () => {
  const r = flags.flagsForSession({ ...base, justFinished: true });
  assert.equal(r.flag, 'done');
  tipClean(r.tip);
});

test('titleHit 假=>none+diag null（无标题默认无色）', () => {
  const r = flags.flagsForSession({ ...base, titleHit: false, open: true, isNew: true });
  assert.equal(r.flag, 'none');
  assert.equal(r.diag, null);
  tipClean(r.tip);
});

test('红环：flags 纯逻辑（无 DOM、无 Node API、无样式）', () => {
  for (const ban of ['document', 'window', 'localStorage', 'querySelector', 'appendChild', 'createElement',
    'node:fs', 'node:path', "from 'node", 'from "node', 'process.env', 'installFeatureStyles', '.css', 'setInterval']) {
    assert.equal(flagsSrc.indexOf(ban), -1, 'flags.ts 不得出现 ' + ban);
  }
  assert.ok(flagsSrc.indexOf('P1') >= 0, '须写明 P1 废注释');
  assert.ok(flagsSrc.indexOf('approval-pending') >= 0 || flagsSrc.indexOf('永不产red') >= 0, '须写明 approval 永不产 red');
  const lines = flagsSrc.split('\n').length;
  assert.ok(lines <= 200, 'flags.ts ≤200 行，实际 ' + lines);
});

test('manifest：id truth-flags，slots 空数组，仅注册逻辑', () => {
  const f = manifest.feature;
  assert.equal(f.id, 'truth-flags');
  assert.ok(Array.isArray(f.slots) && f.slots.length === 0, 'slots 须为空数组');
  assert.equal(f.installStyles, undefined, '无样式不注册 installStyles');
  for (const ban of ['document', 'window', 'querySelector', 'createElement', 'installFeatureStyles']) {
    assert.equal(manifestSrc.indexOf(ban), -1, 'manifest 不得出现 ' + ban);
  }
});

rmSync(tmp, { recursive: true, force: true });
console.log('features/truth-flags: ALL PASS');
