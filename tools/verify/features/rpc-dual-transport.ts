// T5 落地验证（#77）：双传输翻译 + 组行 outerHTML 基线（node --test，零第三方依赖）。
// 做法：仓库 tsc 转译真实 rpc.ts / view.ts 闭包到临时目录，再断言转译产物（与 left-badges.ts 同款）。
// 覆盖：outerHTML 三断言（无嵌套会话行/textContent 非 concat/加前缀前后 key 稳定）
//   + 双传输四象限（新/旧/超时/Abort）+ ok:false 永不回退 + 回得来 + 自有桥/delivery 经新载体 + 双路 contract。
// 输出：T5-PROOF 行可直接贴 #77 作证（双方输出格式）。
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const ENTRIES = [join(REPO, 'src', 'client', 'data', 'rpc.ts'), join(REPO, 'src', 'features', 'left-badges', 'view.ts')];
const tmp = mkdtempSync(join(tmpdir(), 't5-rpc-dual-'));
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), ...ENTRIES,
    '--ignoreConfig', '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false'],
    { stdio: 'pipe' });
} catch (e) {
  console.error('TRANPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }
const req = createRequire(join(tmp, 'run.cjs'));
const rpcMod: any = req('./client/data/rpc.js');
const view: any = req('./features/left-badges/view.js');
const { dualTransportCallV2, extractRpc, extractRpcV2 } = rpcMod;
const proof = (id: string, detail: string): void => { console.log('T5-PROOF ' + id + ' PASS ' + detail); };

/* ---------- 传输 mock：seen 记录每次 raw 调用形状 ---------- */
type Seen = { ch: string; ep: string; p: unknown };
const abortErr = (): Error => new DOMException('aborted', 'AbortError');
const timeoutErr = (): Error => new DOMException('timeout', 'TimeoutError');
const transportErr = (): Error => Object.assign(new Error('old DSH: no route'), { code: 'RPC_NO_ROUTE' });

/* ---------- outerHTML 三断言：真实 paint 路径（mountLeftBadges + stub document） ---------- */
type StubEl = {
  tag: string; attrs: Record<string, string>; kids: (StubEl | string)[];
  setAttribute(k: string, v: string): void; getAttribute(k: string): string | null;
  removeAttribute(k: string): void; appendChild(c: StubEl): StubEl; closest(s: string): null;
  readonly textContent: string; readonly outerHTML: string;
};
const stubEl = (tag: string, attrs: Record<string, string>, kids: (StubEl | string)[] = []): StubEl => ({
  tag, attrs: { ...attrs }, kids,
  setAttribute(k, v) { this.attrs[k] = String(v); },
  getAttribute(k) { return this.attrs[k] ?? null; },
  removeAttribute(k) { delete this.attrs[k]; },
  appendChild(c) { this.kids.push(c); return c; },
  closest() { return null; },
  get textContent(): string {
    return this.kids.map((k) => typeof k === 'string' ? k : k.textContent).join('');
  },
  get outerHTML(): string {
    const a = Object.entries(this.attrs).map(([k, v]) => ' ' + k + '="' + v + '"').join('');
    return '<' + this.tag + a + '>' + this.kids.map((k) => typeof k === 'string' ? k : k.outerHTML).join('') + '</' + this.tag + '>';
  },
});
const botSnap = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  channel: 'feishu', botId: 'b1', workspace: 'D:/agents/xiaoshuai', connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '茶话会', avatarUrl: '',
  healthSummary: '', lastCheckedAt: Date.now(), ...over,
});
/* 会话行：上游 logos.js 装饰形态（aria-selected + 渠道 logo 标记 + 加前缀标题），组行永无此形态。 */
const sessionRow = (title: string): StubEl =>
  stubEl('div', { role: 'treeitem', 'aria-selected': 'true', 'data-dsh-im-session-channel': 'feishu' },
    [stubEl('span', { class: 'logo' }, []), title]);
const groupRow = (label: string): StubEl =>
  stubEl('div', { role: 'treeitem', 'aria-expanded': 'true' }, [stubEl('span', { class: 'twisty' }, []), label]);

test('T5 outerHTML(1/3)：分组行无嵌套会话行——paint 只装饰组行', () => {
  const g = groupRow('xiaoshuai');
  const s = sessionRow('飞书·茶话会');
  (globalThis as any).document = {
    querySelectorAll: (sel: string) => ({ forEach: (fn: (e: StubEl) => void) => { if (String(sel).includes('aria-expanded')) [g].forEach(fn); } }),
    addEventListener() {}, removeEventListener() {}, body: null, documentElement: null,
  };
  let sub: ((snap: any) => void) | null = null;
  const unmount = view.mountLeftBadges({ rpc: null, subscribe: (fn: any) => { sub = fn; return () => {}; }, refresh: async () => {} });
  try {
    sub!({ bots: [botSnap()], failed: [], updatedAt: Date.now(), catalogs: {} });
    assert.equal(g.getAttribute('data-lb-kind'), 'online');
    assert.equal(g.getAttribute('data-lb-label'), '在线');
    assert.equal(s.getAttribute('data-lb-kind'), null, '会话行必须无 data-lb-*');
    assert.ok(!g.outerHTML.includes('aria-selected'), '组行 outerHTML 无会话标记：' + g.outerHTML);
    proof('outerHTML-1', '组行=' + g.outerHTML + ' 会话行未装饰');
  } finally { try { unmount(); } catch { /* 忽略 */ } delete (globalThis as any).document; }
});

test('T5 outerHTML(2/3)：textContent 非 concat——拼串 key 不绑定', () => {
  const g1 = groupRow('xiaoshuai');
  const g2 = groupRow('xiaoshuai茶话会');
  (globalThis as any).document = {
    querySelectorAll: (sel: string) => ({ forEach: (fn: (e: StubEl) => void) => { if (String(sel).includes('aria-expanded')) [g1, g2].forEach(fn); } }),
    addEventListener() {}, removeEventListener() {}, body: null, documentElement: null,
  };
  let sub: ((snap: any) => void) | null = null;
  const unmount = view.mountLeftBadges({ rpc: null, subscribe: (fn: any) => { sub = fn; return () => {}; }, refresh: async () => {} });
  try {
    sub!({ bots: [botSnap()], failed: [], updatedAt: Date.now(), catalogs: {} });
    assert.equal(g1.getAttribute('data-lb-label'), '在线');
    assert.equal(g2.getAttribute('data-lb-kind'), null, '拼串 key 判未绑定：' + JSON.stringify(g2.textContent));
    assert.equal(view.resolveWorkspace('xiaoshuai', [botSnap()]), 'D:/agents/xiaoshuai');
    proof('outerHTML-2', '本名绑定在线，拼串未绑定');
  } finally { try { unmount(); } catch { /* 忽略 */ } delete (globalThis as any).document; }
});

test('T5 outerHTML(3/3)：加前缀前后 key 稳定——会话标题改写不污染组行', () => {
  const g = groupRow('xiaoshuai');
  const s = sessionRow('飞书·茶话会');
  (globalThis as any).document = {
    querySelectorAll: (sel: string) => ({ forEach: (fn: (e: StubEl) => void) => { if (String(sel).includes('aria-expanded')) [g].forEach(fn); } }),
    addEventListener() {}, removeEventListener() {}, body: null, documentElement: null,
  };
  let sub: ((snap: any) => void) | null = null;
  const unmount = view.mountLeftBadges({ rpc: null, subscribe: (fn: any) => { sub = fn; return () => {}; }, refresh: async () => {} });
  try {
    sub!({ bots: [botSnap()], failed: [], updatedAt: Date.now(), catalogs: {} });
    const before = g.getAttribute('data-lb-label');
    s.kids[s.kids.length - 1] = '茶话会';
    sub!({ bots: [botSnap()], failed: [], updatedAt: Date.now(), catalogs: {} });
    assert.equal(before, '在线');
    assert.equal(g.getAttribute('data-lb-label'), before, '前后缀改写前后一致');
    assert.equal(s.getAttribute('data-lb-kind'), null);
    proof('outerHTML-3', '前缀改写前后 label=' + before);
  } finally { try { unmount(); } catch { /* 忽略 */ } delete (globalThis as any).document; }
});

/* ---------- 双传输四象限 + 保守回退 ---------- */
test('T5 quad-新：新 DSH 首打新载体一次命中（contract 新断言）', async () => {
  const seen: Seen[] = [];
  const raw = async (ch: string, ep: string, p: unknown): Promise<unknown> => {
    seen.push({ ch, ep, p });
    return { ok: true, value: { bots: [] } };
  };
  const out = await dualTransportCallV2(raw, '/feishu', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { ch: '/api', ep: 'dsh-im/feishu', p: { method: 'connection.status', payload: {} } });
  assert.deepEqual(out, { ok: true, value: { bots: [] } });
  proof('quad-new', JSON.stringify(seen[0]));
});

test('T5 quad-旧：旧 DSH 传输 reject 回退旧直调并记忆方向（contract 旧断言）', async () => {
  const seen: Seen[] = [];
  const raw = async (ch: string, ep: string, p: unknown): Promise<unknown> => {
    seen.push({ ch, ep, p });
    if (ch === '/api') throw transportErr();
    return { ok: true, value: { bots: [{ botId: 'w1' }] } };
  };
  await dualTransportCallV2(raw, '/weixin', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.deepEqual(seen.map((s) => s.ch), ['/api', '/weixin']);
  assert.deepEqual(seen[1], { ch: '/weixin', ep: 'connection.status', p: {} });
  seen.length = 0;
  await dualTransportCallV2(raw, '/weixin', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.deepEqual(seen.map((s) => s.ch), ['/weixin'], '记忆方向后旧优先单打');
  proof('quad-old', '回退形状 ch=/weixin ep=connection.status，次轮单打旧路');
});

test('T5 quad-超时：新路超时 reject 回退旧路', async () => {
  const seen: Seen[] = [];
  const raw = async (ch: string): Promise<unknown> => {
    seen.push({ ch, ep: '', p: null });
    if (ch === '/api') throw timeoutErr();
    return { ok: true, value: { bots: [] } };
  };
  await dualTransportCallV2(raw, '/qq', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.deepEqual(seen.map((s) => s.ch), ['/api', '/qq']);
  proof('quad-timeout', 'TimeoutError 回退旧路');
});

test('T5 quad-Abort：调用方取消永不回退（单打即抛）', async () => {
  const seen: Seen[] = [];
  const raw = async (ch: string, _e: string, _p: unknown, s: AbortSignal): Promise<unknown> => {
    seen.push({ ch, ep: '', p: null });
    if (s.aborted) throw abortErr();
    return { ok: true, value: {} };
  };
  const signal = AbortSignal.abort();
  await assert.rejects(dualTransportCallV2(raw, '/slack', 'connection.status', {}, signal), (e: unknown) =>
    (e as Error).name === 'AbortError');
  assert.equal(seen.length, 1, 'Abort 只打一次，不换路');
  proof('quad-abort', 'AbortError 单打重抛');
});

test('T5 conservative：ok:false 是权威答复，永不回退', async () => {
  const seen: Seen[] = [];
  const raw = async (ch: string): Promise<unknown> => {
    seen.push({ ch, ep: '', p: null });
    return { ok: false, error: { code: 'CHANNEL_NOT_CONFIGURED', message: '渠道未配置', details: {} } };
  };
  const out = await dualTransportCallV2(raw, '/telegram', 'connection.status', {}, AbortSignal.timeout(5000)) as any;
  assert.equal(seen.length, 1);
  assert.equal(out.ok, false);
  proof('conservative-okfalse', 'ok:false 原样返回，单打');
});

test('T5 recover：旧恢复后回得来（环境升级方向回正）', async () => {
  const seen: Seen[] = [];
  let upgraded = false;
  const raw = async (ch: string): Promise<unknown> => {
    seen.push({ ch, ep: '', p: null });
    if (!upgraded) {
      if (ch === '/api') throw transportErr();
      return { ok: true, value: { bots: [] } };
    }
    if (ch === '/discord') throw transportErr();
    return { ok: true, value: { bots: [] } };
  };
  await dualTransportCallV2(raw, '/discord', 'connection.status', {}, AbortSignal.timeout(5000));
  upgraded = true;
  await dualTransportCallV2(raw, '/discord', 'connection.status', {}, AbortSignal.timeout(5000));
  seen.length = 0;
  await dualTransportCallV2(raw, '/discord', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.deepEqual(seen.map((s) => s.ch), ['/api'], '回正后新优先单打');
  proof('recover', '升级后方向回正为新路');
});

test('T5 passthrough：/im-companion 经新载体（/api + im-companion）+ delivery 翻译', async () => {
  const seen: Seen[] = [];
  const raw = async (ch: string, ep: string, p: unknown): Promise<unknown> => {
    seen.push({ ch, ep, p });
    return { ok: true, value: {} };
  };
  // 自有桥不再直通：host 侧已由 connection.rpc.handle（前缀路由，装配期即抛 webServer）改为
  // connection.fetch.register（DSH 公开 /api 载体），client 侧同步经新载体翻译。
  await dualTransportCallV2(raw, '/im-companion', 'routes.list', { bots: [] }, AbortSignal.timeout(5000));
  assert.deepEqual(seen[0], { ch: '/api', ep: 'im-companion', p: { method: 'routes.list', payload: { bots: [] } } });
  seen.length = 0;
  await dualTransportCallV2(raw, '/dsh-im-delivery', 'target.test', { botId: 'b' }, AbortSignal.timeout(5000));
  assert.deepEqual(seen[0], { ch: '/api', ep: 'dsh-im/dsh-im-delivery', p: { method: 'target.test', payload: { botId: 'b' } } });
  proof('passthrough', '自有桥与 delivery 均经新载体');
});

test('T5 contract：冻结 extractRpc 仍旧直调一次 / extractRpcV2 走新载体一次', async () => {
  const seen: Seen[] = [];
  const ctx = { connection: { rpc: { call: async (ch: string, ep: string, p: unknown) => { seen.push({ ch, ep, p }); return { ok: true, value: {} }; } } } };
  const oldFn = extractRpc(ctx)!;
  await oldFn('/feishu', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.deepEqual(seen[0], { ch: '/feishu', ep: 'connection.status', p: {} });
  seen.length = 0;
  const newFn = extractRpcV2(ctx)!;
  await newFn('/feishu', 'connection.status', {}, AbortSignal.timeout(5000));
  assert.deepEqual(seen[0], { ch: '/api', ep: 'dsh-im/feishu', p: { method: 'connection.status', payload: {} } });
  assert.equal(extractRpc({}), null);
  assert.equal(extractRpcV2({}), null);
  proof('contract', '旧直调一次，新载体一次，无连接返回 null');
});

process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略 */ } });
