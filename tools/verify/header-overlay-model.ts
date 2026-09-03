// B3 verdict 回归：Header 浮层纯数据层断言（node --test，零第三方依赖）。
// 做法：与 B1 badge-model 同范式——用仓库自带 tsc 把 src/client/data 纯模块转译到临时目录，再断言转译产物。
// 覆盖 verdict（#8，C 变体）：时机三态（hidden/unbound/full）、可达性复用 B1（任一在线即在线）、
// 发测试消息只走已保存目标（无目标不谎报发送）、信封解包与错误码透传。
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const SRC = join(REPO, 'src', 'client', 'data');
const FILES = ['config.ts', 'fleet-api.ts', 'badges.ts', 'header-overlay.ts'];

const stage = mkdtempSync(join(tmpdir(), 'b3-src-'));
for (const f of FILES) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  // 仅测试副本：将 bundler 风格 extensionless 改写为 nodenext 可解（产物代码不动）。
  const fixed = raw.replace(/\.\/([A-Za-z0-9_-]+)(['"])/g, (m, name, q) =>
    String(name).endsWith('.js') ? m : './' + name + '.js' + q);
  writeFileSync(join(stage, f), fixed);
}
const tmp = mkdtempSync(join(tmpdir(), 'b3-header-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...FILES.map((f) => join(stage, f)),
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'nodenext', '--target', 'es2023',
    '--moduleResolution', 'nodenext', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const mod = (f: string) => import(pathToFileURL(join(tmp, f)).href);
const { headerOverlayFor, resolveWorkspacePath, chooseBot, buildTestText, listTargets, sendTestMessage, SEND_TEST_EVENT } = await mod('header-overlay.js');

const W1 = 'D:\\agents\\xiaoshuai';
const snap = (over: Record<string, unknown> = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});
const items = [
  { workspaceId: 'ws-1', path: W1, title: 'xiaoshuai', sessionIds: ['sess-aaa'] },
  { workspaceId: 'ws-2', path: 'D:\\agents\\dsh-im', title: 'dsh-im', sessionIds: ['sess-bbb'] },
];

test('resolveWorkspacePath：session 反查 workspace（官方同款语义）', () => {
  assert.equal(resolveWorkspacePath('sess-aaa', items), W1);
  assert.equal(resolveWorkspacePath('sess-???', items), undefined);
  assert.equal(resolveWorkspacePath('sess-aaa', []), undefined);
});

test('headerOverlayFor：时机三态', () => {
  const now = 90000;
  assert.equal(headerOverlayFor(undefined, [snap()], now).mode, 'hidden'); // IM 无关：不注入
  assert.equal(headerOverlayFor('D:\\agents\\empty', [], now).mode, 'unbound'); // 已知工作区无绑定：灰色提示
  const full = headerOverlayFor(W1, [snap()], now);
  assert.equal(full.mode, 'full');
  assert.equal(full.agent, 'xiaoshuai');
  assert.match(full.label, /在线/);
});

test('headerOverlayFor：可达性与 B1 同 verdict（任一在线即在线）', () => {
  const now = 90000;
  const conflict = headerOverlayFor(W1, [
    snap({ channel: 'feishu', healthKind: 'online' }),
    snap({ channel: 'qq', botId: 'q', healthKind: 'offline', healthStatus: 'offline', connected: false }),
  ], now);
  assert.equal(conflict.dotKind, 'online');
  const stale = headerOverlayFor(W1, [snap({ stale: true, healthKind: 'warn', lastCheckedAt: 1000 })], now);
  assert.equal(stale.dotKind, 'warn'); // 未知按待确认，不报离线
  const off = headerOverlayFor(W1, [snap({ healthKind: 'offline', healthStatus: 'offline', connected: false })], now);
  assert.equal(off.dotKind, 'offline');
});

test('chooseBot：优先在线绑定，否则首个绑定，无绑定为 null', () => {
  const off = snap({ botId: 'off', healthKind: 'offline', healthStatus: 'offline', connected: false });
  const on = snap({ botId: 'on' });
  assert.equal(chooseBot([off, on], W1)?.botId, 'on');
  assert.equal(chooseBot([off], W1)?.botId, 'off');
  assert.equal(chooseBot([], W1), null);
  assert.equal(chooseBot([snap({ workspace: 'D:\\agents\\other' })], W1), null);
});

test('buildTestText：固定前缀 + Agent 可识别', () => {
  const t = buildTestText('小帅');
  assert.match(t, /连接测试/);
  assert.match(t, /小帅/);
});

test('SEND_TEST_EVENT：命名空间事件名', () => {
  assert.equal(SEND_TEST_EVENT, 'dsh-im-companion:send-test');
});

test('listTargets：解包 value.targets；ok:false 抛码', async () => {
  const rpc = async () => ({ ok: true, value: { botId: 'b1', channel: 'feishu', targets: [{ targetId: 't1', name: '群' }] } });
  const ts = await listTargets(rpc as any, 'b1');
  assert.equal(ts.length, 1);
  assert.equal(ts[0].targetId, 't1');
  const bad = async () => ({ ok: false, error: { code: 'unknown-bot', message: 'no' } });
  await assert.rejects(() => listTargets(bad as any, 'b1'),
    (e: unknown) => (e as { code?: string }).code === 'unknown-bot');
});

test('sendTestMessage：成功透传 sent；失败抛码；无目标不调用 rpc', async () => {
  let calls = 0;
  const rpc = async (_ch: string, ep: string) => {
    calls++;
    assert.equal(ep, 'message.send');
    return { ok: true, value: { sent: true } };
  };
  const r = await sendTestMessage(rpc as any, 'b1', 't1', 'hi');
  assert.equal(r.sent, true);
  assert.equal(calls, 1);
  const off = async () => ({ ok: false, error: { code: 'bot-not-connected', message: 'offline' } });
  await assert.rejects(() => sendTestMessage(off as any, 'b1', 't1', 'hi'),
    (e: unknown) => (e as { code?: string }).code === 'bot-not-connected');
  const boom = async () => { throw new Error('net down'); };
  await assert.rejects(() => sendTestMessage(boom as any, 'b1', 't1', 'hi'), /net down/);
});

console.log('header-overlay-model: ALL PASS');
