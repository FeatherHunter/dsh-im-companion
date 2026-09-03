// B1 结论回归：左栏徽标纯数据层断言（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把 src/client/data 下的纯模块转译到临时目录，再断言转译产物。
// 覆盖结论：failed→warn（绝不谎报离线）、stale 保留与时间冻结、徽标派生、tooltip 最后检测。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const DATA = join(REPO, 'src', 'client', 'data');
const COMP = join(REPO, 'src', 'client', 'components');
const FILES = ['config.ts', 'badges.ts', 'fleet-api.ts', 'model.ts', 'meta.ts', 'rpc.ts'].map((f) => join(DATA, f));
FILES.push(join(COMP, 'left-badges.ts'));

const tmp = mkdtempSync(join(tmpdir(), 'b1-badge-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...FILES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANPILE-FAIL ' + String(e.stdout ?? '') + String(e.stderr ?? e.message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const { healthOf }: any = req('./data/config.js');
const { badgeForWorkspace }: any = req('./data/badges.js');
const { fetchBots }: any = req('./data/fleet-api.js');
const { buildModel }: any = req('./data/model.js');
const { EMPTY_META }: any = req('./data/meta.js');
const engine: any = req('./components/left-badges.js');
const rpcMod: any = req('./data/rpc.js');

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

test('rpc：extractRpc 空安全 + 轮询节拍 15s', () => {
  assert.equal(rpcMod.CONNECTION_POLL_MS, 15000);
  assert.equal(rpcMod.extractRpc(null), null);
  assert.equal(rpcMod.extractRpc({}), null);
  assert.equal(rpcMod.extractRpc({ connection: {} }), null);
  const call = async () => ({});
  const rpc = rpcMod.extractRpc({ connection: { rpc: { call } } });
  assert.equal(typeof rpc, 'function');
});

test('left-badges：行装饰 + 点击只读事件 + 无变化不碰 DOM', async () => {
  const stubEl: any = (tag: string) => ({
    tag, attrs: {} as Record<string, string>, children: [] as any[], listeners: {} as Record<string, any[]>, text: '',
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
    getAttribute(k: string) { return this.attrs[k] ?? null; },
    appendChild(c: any) { this.children.push(c); return c; },
    addEventListener(t: string, fn: any) { (this.listeners[t] ??= []).push(fn); },
    querySelector(sel: string) {
      const cls = sel.startsWith('.') ? sel.slice(1) : sel;
      return this.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)) ?? null;
    },
    get textContent() { return this.text; },
    set textContent(v: string) { this.text = String(v); },
  });
  const row = stubEl('div');
  row.setAttribute('data-workspace-path', W1);
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body') };
  const events: any[] = [];
  const winStub: any = {
    CustomEvent: class { type: string; detail: any; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
    dispatchEvent(ev: any) { events.push(ev); return true; },
  };
  let observed: any = null;
  let disconnected = false;
  const moStub: any = class {
    constructor(cb: any) { observed = cb; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  (globalThis as any).document = docStub;
  (globalThis as any).window = winStub;
  (globalThis as any).MutationObserver = moStub;
  try {
    const rpc = async () => ({ ok: true, value: { bots: [{ botId: 'f1', workspace: W1, connected: true, health: { status: 'healthy', lastCheckedAt: 5000 } }] } });
    const dispose = engine.startLeftBadges(rpc);
    await new Promise((r) => setTimeout(r, 60));
    const badge = row.querySelector('.af-left-badge');
    assert.ok(badge, '行上注入徽标');
    assert.match(String(badge.attrs.class), /online/);
    assert.match(String(badge.attrs.title), /最后检测/);
    const appends = row.children.length;
    assert.equal(appends, 1);
    observed(); // observer 回调 → 无变化不得再碰 DOM
    assert.equal(row.children.length, appends);
    badge.listeners.click[0]({ stopPropagation() {} });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'dsh-im-companion:open-agent');
    assert.equal(events[0].detail.workspace, W1);
    dispose();
    assert.equal(disconnected, true);
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).MutationObserver;
  }
});

rmSync(tmp, { recursive: true, force: true });
console.log('badge-model: ALL PASS');