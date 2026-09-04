// #29 接入 QR 倒计时自验证（只测本票触碰面：fleet-api 纯逻辑 + connect-flow 回归钉）
// node --test 运行，零第三方依赖；转译仅 fleet-api+config 两文件。
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const ENTRIES = [
  join(REPO, 'src', 'client', 'data', 'config.ts'),
  join(REPO, 'src', 'client', 'data', 'fleet-api.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'connect-qr-'));
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
const api: any = req(locate(tmp, 'fleet-api.js'));

test('fmtCountdown 向上取整：到零才 0:00', () => {
  assert.equal(api.fmtCountdown(300000), '5:00');
  assert.equal(api.fmtCountdown(60000), '1:00');
  assert.equal(api.fmtCountdown(59999), '1:00');
  assert.equal(api.fmtCountdown(59000), '0:59');
  assert.equal(api.fmtCountdown(1000), '0:01');
  assert.equal(api.fmtCountdown(1), '0:01');
  assert.equal(api.fmtCountdown(0), '0:00');
  assert.equal(api.fmtCountdown(-500), '0:00');
  assert.equal(api.fmtCountdown(61000), '1:01');
});

test('normalizeProvisionTiming 单位归一与回退', () => {
  const now = 1700000000000;
  const ms = api.normalizeProvisionTiming({ expiresAt: now + 300000, durationMs: 300000 }, now);
  assert.equal(ms.expiresAt, now + 300000);
  assert.equal(ms.durationMs, 300000);
  const sec = api.normalizeProvisionTiming({ expiresAt: now / 1000 + 150, durationMs: 300000 }, now);
  assert.equal(sec.expiresAt, (now / 1000 + 150) * 1000);
  const str = api.normalizeProvisionTiming({ expiresAt: String(now / 1000 + 150) }, now);
  assert.equal(str.expiresAt, (now / 1000 + 150) * 1000);
  const missing = api.normalizeProvisionTiming({}, now);
  assert.equal(missing.expiresAt, now + 300000);
  assert.equal(missing.durationMs, 300000);
  const secDur = api.normalizeProvisionTiming({ expiresAt: now + 300000, durationMs: 300 }, now);
  assert.equal(secDur.durationMs, 300000);
  const past = api.normalizeProvisionTiming({ expiresAt: now - 5000, durationMs: 300000 }, now);
  assert.equal(past.expiresAt, now - 5000);
});

test('connect-flow 回归钉：三根因不复发', () => {
  const src = readFileSync(join(REPO, 'src', 'client', 'components', 'connect-flow.ts'), 'utf8');
  assert.ok(src.includes('normalizeProvisionTiming'), '应使用归一计时');
  assert.ok(src.includes('fmtCountdown'), '应使用 ceil 展示');
  assert.ok(src.includes('const prev = attemptId'), 'begin 应先取上一轮 id 再清');
  assert.ok(src.includes('onClose'), 'modal 应接 onClose 清理');
  assert.ok(src.includes('pollTimer'), 'poll 应走单链 timeout');
  assert.ok(!src.includes('attemptCleanupPrevious'), '误取消本轮的旧函数不得残留');
  assert.ok(!src.includes('querySelector'), '倒计时不得全局 query，应闭包直写');
  assert.ok(!src.includes('setInterval(() => void poll()'), 'poll 不得每次新建 interval');
});

rmSync(tmp, { recursive: true, force: true });
