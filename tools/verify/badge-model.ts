// B1 verdict 回归：左栏徽标纯数据层断言（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把 src/client/data 下的纯模块转译到临时目录，再断言转译产物。
// 覆盖 verdict：failed→warn（绝不谎报离线）、stale 保留与时间冻结、徽标派生、tooltip 最后检测。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const SRC = join(REPO, 'src', 'client', 'data');
const FILES = ['config.ts', 'badges.ts', 'fleet-api.ts', 'model.ts', 'meta.ts'];

const tmp = mkdtempSync(join(tmpdir(), 'b1-badge-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...FILES.map((f) => join(SRC, f)),
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'nodenext', '--target', 'es2023',
    '--moduleResolution', 'nodenext', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANPILE-FAIL ' + String(e.stdout ?? '') + String(e.stderr ?? e.message));
  process.exit(1);
}
const mod = (f) => import(pathToFileURL(join(tmp, f)).href);
const { healthOf } = await mod('config.js');
const { badgeForWorkspace } = await mod('badges.js');
const { fetchBots } = await mod('fleet-api.js');
const { buildModel } = await mod('model.js');
const { EMPTY_META } = await mod('meta.js');

const W1 = 'D:\\agents\\xiaoshuai';
const snap = (over = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});

test('healthOf：failed 恒为 warn（绝不谎报离线）', () => {
  assert.equal(healthOf('healthy', true, true), 'warn');
  assert.equal(healthOf('offline', false, true), 'warn');
  assert.equal(healthOf('healthy', true), 'online');
  assert.equal(healthOf('degraded', true), 'warn');
  assert.equal(healthOf('unknown', true), 'warn');
  assert.equal(healthOf('offline', false), 'offline');
  assert.equal(healthOf(null, true), 'online');
});

test('fetchBots：失败渠道保留旧快照并标 stale（时间冻结）', async () => {
  const rpc = async (ch) => {
    if (ch === '/feishu') return { ok: true, value: { bots: [{ botId: 'f1', workspace: W1, connected: true, health: { status: 'healthy', lastCheckedAt: 2000 } }] } };
    throw new Error('qq down');
  };
  const prev = [snap({ channel: 'qq', botId: 'q9', workspace: 'D:\\agents\\qq', lastCheckedAt: 1000 })];
  const { bots, failed } = await fetchBots(rpc, prev);
  assert.ok(failed.includes('qq'));
  const qq = bots.find((b) => b.botId === 'q9');
  assert.ok(qq, 'qq 快照被保留');
  assert.equal(qq.stale, true);
  assert.equal(qq.healthKind, 'warn');
  assert.equal(qq.lastCheckedAt, 1000);
  const f1 = bots.find((b) => b.botId === 'f1');
  assert.equal(f1.stale, false);
  assert.equal(f1.healthKind, 'online');
});

test('fetchBots：恢复后 stale 清除', async () => {
  const rpc = async () => ({ ok: true, value: { bots: [{ botId: 'q9', workspace: 'D:\\agents\\qq', connected: true, health: { status: 'healthy', lastCheckedAt: 3000 } }] } });
  const prev = [snap({ channel: 'qq', botId: 'q9', workspace: 'D:\\agents\\qq', stale: true, healthKind: 'warn', lastCheckedAt: 1000 })];
  const { bots } = await fetchBots(rpc, prev);
  // 该 rpc 对所有渠道返回同一快照：只断言 q9 被刷新
  const q9 = bots.find((b) => b.botId === 'q9');
  assert.equal(q9.stale, false);
  assert.equal(q9.healthKind, 'online');
  assert.equal(q9.lastCheckedAt, 3000);
});

test('badgeForWorkspace：四态 + tooltip 最后检测', () => {
  const now = 90000;
  assert.equal(badgeForWorkspace('D:\\agents\\empty', [], now).kind, 'unbound');
  const on = badgeForWorkspace(W1, [
    snap({ channel: 'feishu', healthKind: 'online' }),
    snap({ channel: 'qq', botId: 'q', healthKind: 'offline', healthStatus: 'offline', connected: false }),
  ], now);
  assert.equal(on.kind, 'online'); // 可达性：任一在线即在线
  assert.match(on.tooltip, /最后检测/);
  const stale = badgeForWorkspace(W1, [
    snap({ stale: true, healthKind: 'warn', lastCheckedAt: 1000 }),
    snap({ channel: 'qq', botId: 'q', healthKind: 'offline', healthStatus: 'offline', connected: false }),
  ], now);
  assert.equal(stale.kind, 'warn'); // 未知按待确认，不报离线
  assert.match(stale.tooltip, /未知/);
  const off = badgeForWorkspace(W1, [snap({ healthKind: 'offline', healthStatus: 'offline', connected: false })], now);
  assert.equal(off.kind, 'offline');
});

test('buildModel：stale 通道标待确认（轮询失败）', () => {
  const model = buildModel([snap({ stale: true, healthKind: 'warn' })], EMPTY_META, 'agent', '');
  assert.equal(model.agents[0].status, 'warn');
  assert.match(model.agents[0].healthDetail, /轮询失败/);
  assert.match(model.agents[0].healthDetail, /最后检测/);
});

rmSync(tmp, { recursive: true, force: true });
console.log('badge-model: ALL PASS');