// B1 结论回归（F0 每功能自验证）：left-badges 特性纯数据层 + 视图断言（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把特性链转译到临时目录，再断言转译产物。
// 覆盖结论：单份 stream（stale 保留/时间冻结/ok:false 不保留/订阅广播）、徽标四态、行装饰、样式命名空间。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const DATA = join(REPO, 'src', 'client', 'data');
const FEAT = join(REPO, 'src', 'features');
const ENTRIES = [
  join(DATA, 'connection-stream.ts'),
  join(DATA, 'bindings.ts'),
  join(FEAT, 'index.ts'),
  join(FEAT, 'left-badges', 'manifest.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'b1-left-badges-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const streamMod: any = req('./client/data/connection-stream.js');
const bindings: any = req('./client/data/bindings.js');
const view: any = req('./features/left-badges/view.js');
const styles: any = req('./features/left-badges/styles.js');
const registry: any = req('./features/index.js');
const dbgReport: any = req('./features/left-badges/debug-report.js');

const W1 = 'D:\\agents\\xiaoshuai';
const snap = (over = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});
const feishuOk = (lastCheckedAt: number) => async (ch: string) => {
  if (ch !== '/feishu') throw new Error(ch + ' down');
  return { ok: true, value: { bots: [{ botId: 'f1', workspace: W1, connected: true, health: { status: 'healthy', lastCheckedAt } }] } };
};

test('stream：失败渠道保留旧快照（stale+冻结），ok:false 不保留', async () => {
  const s = streamMod.createConnectionStream(feishuOk(2000), () => 90000);
  try {
    await s.refresh();
    const failNone = s.get();
    assert.equal(failNone.failed.length, 8);
    const s2 = streamMod.createConnectionStream(async () => ({ ok: false }), () => 90001);
    try {
      await s2.refresh();
      assert.equal(s2.get().bots.length, 0);
    } finally {
      s2.dispose();
    }
  } finally {
    s.dispose();
  }
});

test('stream：stale 保留与恢复（时间冻结/更新）', async () => {
  let qqDown = false;
  const rpc = async (ch: string) => {
    if (ch === '/qq' && qqDown) throw new Error('qq down');
    const botId = ch === '/qq' ? 'q9' : 'f1';
    const ws = ch === '/qq' ? 'D:\\agents\\qq' : W1;
    return { ok: true, value: { bots: [{ botId, workspace: ws, connected: true, health: { status: 'healthy', lastCheckedAt: 1000 } }] } };
  };
  const s = streamMod.createConnectionStream(rpc, () => 50000);
  try {
    await s.refresh();
    qqDown = true;
    await s.refresh();
    const mid = s.get();
    const qq = mid.bots.find((b: any) => b.botId === 'q9');
    assert.ok(qq, 'qq 快照被保留');
    assert.equal(qq.stale, true);
    assert.equal(qq.healthKind, 'warn');
    assert.equal(qq.lastCheckedAt, 1000);
    qqDown = false;
    await s.refresh();
    const back = s.get().bots.find((b: any) => b.botId === 'q9');
    assert.ok(!back.stale, '恢复后非 stale');
    assert.equal(back.healthKind, 'online');
  } finally {
    s.dispose();
  }
});

test('stream：订阅即时首拍 + 广播 + 退订', async () => {
  const s = streamMod.createConnectionStream(feishuOk(7000), () => 60000);
  try {
    const seen: any[] = [];
    const unsub = s.subscribe((snap: any) => seen.push(snap));
    await s.refresh();
    assert.ok(seen.length >= 2);
    assert.equal(seen[seen.length - 1].bots.length, 1);
    unsub();
    const n = seen.length;
    await s.refresh();
    assert.equal(seen.length, n);
  } finally {
    s.dispose();
  }
});

test('bindings：四态 + tooltip 最后检测 + 暂无占位', () => {
  const now = 90000;
  assert.equal(bindings.badgeForWorkspace('D:\\agents\\empty', [], now).kind, 'unbound');
  const on = bindings.badgeForWorkspace(W1, [
    snap({}),
    snap({ channel: 'qq', botId: 'q', healthKind: 'offline', healthStatus: 'offline', connected: false }),
  ], now);
  assert.equal(on.kind, 'online');
  assert.match(on.tooltip, /最后检测/);
  const stale = bindings.badgeForWorkspace(W1, [
    snap({ stale: true, healthKind: 'warn', lastCheckedAt: 1000 }),
    snap({ channel: 'qq', botId: 'q', healthKind: 'offline', healthStatus: 'offline', connected: false }),
  ], now);
  assert.equal(stale.kind, 'warn');
  assert.match(stale.tooltip, /未知/);
  const off = bindings.badgeForWorkspace(W1, [snap({ healthKind: 'offline', healthStatus: 'offline', connected: false })], now);
  assert.equal(off.kind, 'offline');
  const noTime = bindings.badgeForWorkspace(W1, [snap({ lastCheckedAt: null })], now);
  assert.match(noTime.tooltip, /最后检测 暂无/);
});

test('view：resolveWorkspace 名称匹配（basename/Bot名/大小写）', () => {
  const bots = [snap({ workspace: W1, botName: '小帅' })];
  assert.equal(view.resolveWorkspace('xiaoshuai', bots), W1);
  assert.equal(view.resolveWorkspace('XiaoShuai', bots), W1);
  assert.equal(view.resolveWorkspace('小帅', bots), W1);
  assert.equal(view.resolveWorkspace(W1, bots), W1);
  assert.equal(view.resolveWorkspace('dsh-im', bots), 'dsh-im');
});

test('registry：left-badges 在列，带样式与槽位', () => {
  const f = registry.FEATURES.find((x: any) => x.id === 'left-badges');
  assert.ok(f);
  assert.equal(typeof f.installStyles, 'function');
  assert.equal(f.slots[0].target, 'workspace-rail');
  assert.equal(typeof f.slots[0].mount, 'function');
});

test('styles：命名空间前缀，不占 .af-', () => {
  assert.match(styles.CSS, /.left-badges-badge/);
  assert.ok(!styles.CSS.includes('.af-'), '不得占用 .af-* 私有约定');
});

test('view：行装饰 + 点击只读事件 + 无变化不碰 DOM', () => {
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
  row.textContent = 'xiaoshuai';
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body') };
  const events: any[] = [];
  const winStub: any = {
    CustomEvent: class { type: string; detail: any; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
    dispatchEvent(ev: any) { events.push(ev); return true; },
  };
  (globalThis as any).document = docStub;
  (globalThis as any).window = winStub;
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
  try {
    const heard: any[] = [];
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: [snap({ lastCheckedAt: 5000 })], failed: [], updatedAt: 60000 }); heard.push(fn); return () => {}; } };
    const dispose = view.mountLeftBadges(ctx);
    const badge = row.querySelector('.left-badges-badge');
    assert.ok(badge, '行上注入徽标');
    assert.match(String(badge.attrs.class), /online/);
    assert.match(String(badge.attrs.title), /最后检测/);
    assert.equal(row.children.length, 1);
    heard[0]({ bots: [snap({ lastCheckedAt: 5000 })], failed: [], updatedAt: 61000 });
    assert.equal(row.children.length, 1);
    badge.listeners.click[0]({ stopPropagation() {} });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'dsh-im-companion:open-agent');
    assert.equal(events[0].detail.workspace, W1);
    dispose();
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).MutationObserver;
  }
});

test('view：老代挂载在新代出现后静默（代际哨兵）', () => {
  const stubEl: any = (tag: string) => ({
    tag, attrs: {} as Record<string, string>, children: [] as any[], text: '',
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
    getAttribute(k: string) { return this.attrs[k] ?? null; },
    appendChild(c: any) { this.children.push(c); return c; },
    addEventListener() {},
    querySelector(sel: string) {
      const cls = sel.startsWith('.') ? sel.slice(1) : sel;
      return this.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)) ?? null;
    },
    get textContent() { return this.text; },
    set textContent(v: string) { this.text = String(v); },
  });
  const row = stubEl('div');
  row.textContent = 'xiaoshuai';
  const win: any = {};
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body') };
  (globalThis as any).document = docStub;
  (globalThis as any).window = win;
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
  try {
    let fn: any = null;
    const ctx: any = { subscribe: (f: any) => { fn = f; f({ bots: [snap({ lastCheckedAt: 5000 })], failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountLeftBadges(ctx);
    const badge = row.querySelector('.left-badges-badge');
    assert.ok(badge, '首轮画上徽标');
    assert.match(String(badge.attrs.class), /online/);
    win.__lbGen = 999;
    fn({ bots: [snap({ lastCheckedAt: 5000, healthKind: 'offline', healthStatus: 'offline', connected: false })], failed: [], updatedAt: 61000 });
    assert.match(String(row.querySelector('.left-badges-badge').attrs.class), /online/, '老代不再重绘');
    dispose();
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).MutationObserver;
  }
});

test('view：未绑定不行徽标（残留旧徽标摘除）', () => {
  const stubEl: any = (tag: string) => ({
    tag, attrs: {} as Record<string, string>, children: [] as any[], text: '',
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
    getAttribute(k: string) { return this.attrs[k] ?? null; },
    appendChild(c: any) { this.children.push(c); return c; },
    querySelector(sel: string) {
      const cls = sel.startsWith('.') ? sel.slice(1) : sel;
      return this.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)) ?? null;
    },
    get textContent() { return this.text; },
    set textContent(v: string) { this.text = String(v); },
  });
  const row = stubEl('div');
  row.textContent = 'dsh-im';
  const old = stubEl('span');
  old.setAttribute('class', 'left-badges-badge unbound');
  old.remove = () => { row.children = row.children.filter((c: any) => c !== old); };
  row.children.push(old);
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body') };
  (globalThis as any).document = docStub;
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
  try {
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: [snap({})], failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountLeftBadges(ctx);
    assert.equal(row.querySelector('.left-badges-badge'), null);
    assert.equal(row.children.length, 0);
    dispose();
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
  }
});

test('debug-report（TEMP-DEBUG）：无 DOM 归零 + rpc 空 no-op 不抛', () => {
  assert.deepEqual(dbgReport.collectCensus(), { treeitem: 0, expanded: 0, selected: 0, badges: 0 });
  dbgReport.reportDebug(null, { kind: 't' });
  dbgReport.reportDebug(undefined, { kind: 't' });
});

rmSync(tmp, { recursive: true, force: true });
console.log('features/left-badges: ALL PASS');
