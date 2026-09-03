// E1 自验证（F0 每功能自验证）：presence 动效总控断言（node --test，零第三方依赖）。
// 方向 A（用户裁定 2026-09-04）：不画点，只定档位——full（B1 原生）/ reduced（>20 → 2.8s）/
// static（手动/系统）；跨边界只读覆盖 B1 既有呼吸（B1 文件零触碰，摘除即恢复原生）。
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
// 注意：不经过 features/index（它牵引 left-badges/hover-card，后者在 TS 7.0.2 下有预存转译错误，
// 属 B1 文件，本票按解耦军规不碰；注册断言改走源码文本 + manifest 字段，见下）。
const ENTRIES = [
  join(DATA, 'connection-stream.ts'),
  join(DATA, 'bindings.ts'),
  join(FEAT, 'presence', 'manifest.ts'),
  join(FEAT, 'presence', 'motion.ts'),
  join(FEAT, 'presence', 'view.ts'),
  join(FEAT, 'presence', 'styles.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'e1-presence-'));
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
const motion: any = req('./features/presence/motion.js');
const view: any = req('./features/presence/view.js');
const styles: any = req('./features/presence/styles.js');
const manifest: any = req('./features/presence/manifest.js');
const bindings: any = req('./client/data/bindings.js');
import { readFileSync } from 'node:fs';
const indexSrc = readFileSync(join(REPO, 'src', 'features', 'index.ts'), 'utf8');

const W1 = 'D:\\agents\\xiaoshuai';
const snap = (over = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});

/* 最小 DOM 桩：行带 parentElement 链（row→sec→list），容器支持 appendChild 锚定开关。 */
const stubEl: any = (tag: string) => ({
  tag, attrs: {} as Record<string, string>, children: [] as any[],
  parentNode: null as any, parentElement: null as any, text: '',
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
  getAttribute(k: string) { return this.attrs[k] ?? null; },
  removeAttribute(k: string) { delete this.attrs[k]; },
  appendChild(c: any) { c.parentNode = this; c.parentElement = this; this.children.push(c); return c; },
  removeChild(c: any) { this.children = this.children.filter((x: any) => x !== c); return c; },
  listeners: {} as Record<string, any[]>,
  addEventListener(t: string, fn: any) { ((this as any).listeners[t] || ((this as any).listeners[t] = [])).push(fn); },
  removeEventListener() {},
  click() { for (const fn of ((this as any).listeners.click ?? [])) fn(); },
  querySelector(sel: string) {
    const cls = sel.startsWith('.') ? sel.slice(1) : sel;
    return this.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)) ?? null;
  },
  get textContent() { return this.text; },
  set textContent(v: string) { this.text = String(v); },
});

function harness(nRows: number, botOf: (i: number) => any) {
  const list = stubEl('div');
  const sec = stubEl('div');
  list.appendChild(sec);
  const rows: any[] = [];
  const bots: any[] = [];
  for (let i = 0; i < nRows; i++) {
    const r = stubEl('div');
    const b = botOf(i);
    bots.push(b);
    r.textContent = 'ws' + i;
    (b as any).workspace = 'D:\\agents\\ws' + i;
    r.parentElement = sec;
    sec.children.push(r);
    rows.push(r);
  }
  const body = stubEl('body');
  const created: any[] = [];
  const docStub: any = {
    body,
    createElement: (t: string) => { const e = stubEl(t); created.push(e); return e; },
    querySelectorAll: (sel: string) => {
      if (String(sel).includes('treeitem')) return rows;
      if (String(sel).includes('data-presence-kind')) return rows.filter((r: any) => r.getAttribute('data-presence-kind') !== null);
      return [];
    },
  };
  return { list, sec, rows, bots, body, docStub, created };
}

function installGlobals(docStub: any, winExtra: any = {}) {
  (globalThis as any).document = docStub;
  (globalThis as any).window = { __presenceGen: undefined, ...winExtra };
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
}
function clearGlobals() {
  delete (globalThis as any).document;
  delete (globalThis as any).window;
  delete (globalThis as any).MutationObserver;
}

test('motion：分级真值表（full/reduced/static）', () => {
  assert.deepEqual(motion.resolveMotion({ count: 5, manualReduced: false, sysReduced: false }), { level: 'full', reason: '全动效（原生呼吸）' });
  assert.equal(motion.resolveMotion({ count: 20, manualReduced: false, sysReduced: false }).level, 'full', '阈值边界 20 不降');
  const r21 = motion.resolveMotion({ count: 21, manualReduced: false, sysReduced: false });
  assert.equal(r21.level, 'reduced');
  assert.match(r21.reason, /> 20/);
  assert.match(r21.reason, /2\.8s/);
  assert.equal(motion.resolveMotion({ count: 60, manualReduced: true, sysReduced: false }).level, 'static');
  assert.equal(motion.resolveMotion({ count: 5, manualReduced: false, sysReduced: true }).level, 'static', '系统偏好即 static');
  assert.equal(motion.PRESENCE_THRESHOLD, 20);
});

test('motion：非浏览器环境 systemReduced() 为 false', () => {
  assert.equal(motion.systemReduced(), false);
});

test('registry：presence 已注册（源码文本）+ manifest 字段正确', () => {
  assert.match(indexSrc, /presence\/manifest/);
  assert.match(indexSrc, /presence/);
  const f = manifest.feature;
  assert.equal(f.id, 'presence');
  assert.equal(f.order, 13);
  assert.equal(typeof f.installStyles, 'function');
  assert.equal(f.slots[0].target, 'workspace-rail');
  assert.equal(typeof f.slots[0].mount, 'function');
});

test('styles：总控覆盖（body 档位 → B1 既有呼吸）+ 自有开关，keyframe 零新增', () => {
  assert.match(styles.CSS, /data-presence-level/);
  assert.match(styles.CSS, /data-lb-kind/);
  assert.match(styles.CSS, /.left-badges-card-dot/);
  assert.match(styles.CSS, /animation-duration: 2\.8s/);
  assert.match(styles.CSS, /.presence-toggle/);
  assert.match(styles.CSS, /position: fixed/, '开关悬浮于自有图层，永不插入行间');
  assert.match(styles.CSS, /z-index: 50/);
  assert.ok(!styles.CSS.includes('::before'), '方向 A：不画点，无 ::before');
  assert.ok(!styles.CSS.includes('presence-breathe'), '方向 A：不新增 keyframe，只调 B1 既有时长/开关');
  assert.ok(!styles.CSS.includes('@keyframes'), '方向 A：零新增 keyframe');
  assert.ok(!styles.CSS.includes('.af-'), '不得占用 .af-* 私有约定');
  assert.ok(!styles.CSS.includes('data-presence-kind'), '行属性已退役');
});

test('view：resolveWorkspace 名称匹配（basename/Bot名/大小写）', () => {
  const bots = [snap({ workspace: W1, botName: '小帅' })];
  assert.equal(view.resolveWorkspace('xiaoshuai', bots), W1);
  assert.equal(view.resolveWorkspace('XiaoShuai', bots), W1);
  assert.equal(view.resolveWorkspace('小帅', bots), W1);
  assert.equal(view.resolveWorkspace(W1, bots), W1);
  assert.equal(view.resolveWorkspace('dsh-im', bots), 'dsh-im');
});

test('view：行零写入 + 计数 + body 全档 + 开关挂载', () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  h.rows[1].textContent = 'no-such-ws';
  installGlobals(h.docStub);
  try {
    assert.equal(view.countBound(h.bots, h.rows), 1, '未绑定行不计入实例数');
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountPresence(ctx);
    assert.equal(h.rows[0].getAttribute('data-presence-kind'), null, '方向 A：行上零写入');
    assert.equal(h.rows[1].getAttribute('data-presence-kind'), null, '方向 A：行上零写入');
    assert.equal(h.body.getAttribute('data-presence-level'), null, 'full 档不写 body（B1 原生 1.6s）');
    const sw = h.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('presence-toggle'));
    assert.ok(sw, '手动开关已挂 body 自有图层');
    assert.equal(sw.getAttribute('aria-pressed'), 'false');
    assert.ok(!h.list.children.includes(sw), '开关不在 rail 行间');
    dispose();
  } finally { clearGlobals(); }
});

test('view：>20 实例自动 reduced（此处验 body 档位，慢呼吸由覆盖规则承载）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountPresence(ctx);
    assert.equal(h.body.getAttribute('data-presence-level'), 'reduced');
    dispose();
  } finally { clearGlobals(); }
});

test('view：手动开关翻转 → static，再点恢复', () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountPresence(ctx);
    const sw: any = h.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('presence-toggle'));
    assert.ok(sw);
    sw.click();
    assert.equal(sw.getAttribute('aria-pressed'), 'true', '手动开 → 开关态翻转');
    assert.equal(h.body.getAttribute('data-presence-level'), 'static', '手动开 → body static（动画全停）');
    sw.click();
    assert.equal(sw.getAttribute('aria-pressed'), 'false', '再点恢复');
    assert.equal(h.body.getAttribute('data-presence-level'), null, '恢复后回 full（body 无属性）');
    dispose();
  } finally { clearGlobals(); }
  assert.ok(bindings.badgeForWorkspace, '共享 bindings 可读（ Smoke）');
});

test('view：21 行全未绑定 → 计数 0 → 仍 full（衰减语义由 B1 原生承担）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }));
  h.rows.forEach((r: any, i: number) => { r.textContent = 'ghost-' + i; });
  installGlobals(h.docStub);
  try {
    assert.equal(view.countBound(h.bots, h.rows), 0);
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountPresence(ctx);
    assert.equal(h.body.getAttribute('data-presence-level'), null, '计数 0 → full');
    dispose();
  } finally { clearGlobals(); }
});

test('view：dispose 卸载即净（body 档位/开关清除，行零触碰）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountPresence(ctx);
    assert.equal(h.body.getAttribute('data-presence-level'), 'reduced');
    dispose();
    assert.equal(h.body.getAttribute('data-presence-level'), null, 'body 档位已清（B1 恢复原生）');
    const sw = h.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('presence-toggle'));
    assert.equal(sw, undefined, '开关已摘');
    assert.ok(h.rows.every((r: any) => r.getAttribute('data-presence-kind') === null), '行零触碰');
  } finally { clearGlobals(); }
});

rmSync(tmp, { recursive: true, force: true });
console.log('features/presence: ALL PASS');
