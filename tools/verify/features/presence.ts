// E1 自验证（F0 每功能自验证）：presence 动效总控断言（node --test，零第三方依赖）。
// 方向 A（用户裁定 2026-09-04）：不画点，只定档位——full（B1 原生）/ reduced（>20 → 2.8s）/
// static（手动/系统）；跨边界只读覆盖 B1 既有呼吸（B1 文件零触碰，摘除即恢复原生）。
// #98 搬家（用户裁定 2026-09-24）：开关从 body 右下角悬浮胶囊改挂左栏筛选条（收起钮左侧）；
// 偏好经 ctx.rpc('meta.motion.set') 落盘、读回走既有 meta.get 快照；条带缺席 fail-closed 不画。
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
  join(DATA, 'meta.ts'),
  join(FEAT, 'presence', 'manifest.ts'),
  join(FEAT, 'presence', 'motion.ts'),
  join(FEAT, 'presence', 'view.ts'),
  join(FEAT, 'presence', 'prefs.ts'),
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
const prefs: any = req('./features/presence/prefs.js');
const styles: any = req('./features/presence/styles.js');
const manifest: any = req('./features/presence/manifest.js');
const bindings: any = req('./client/data/bindings.js');
const metaMod: any = req('./client/data/meta.js');
import { readFileSync } from 'node:fs';
const indexSrc = readFileSync(join(REPO, 'src', 'features', 'index.ts'), 'utf8');
const viewSrc = readFileSync(join(FEAT, 'presence', 'view.ts'), 'utf8');

const W1 = 'D:\\agents\\xiaoshuai';
const snap = (over = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});

/* 最小 DOM 桩：行带 parentElement 链（row→sec→list），条带支持 querySelector/insertBefore 锚定绿点。 */
const stubEl: any = (tag: string) => ({
  tag, attrs: {} as Record<string, string>, children: [] as any[],
  parentNode: null as any, parentElement: null as any, text: '',
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
  getAttribute(k: string) { return this.attrs[k] ?? null; },
  removeAttribute(k: string) { delete this.attrs[k]; },
  appendChild(c: any) { c.parentNode = this; c.parentElement = this; this.children.push(c); return c; },
  insertBefore(c: any, ref: any) {
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, c);
    c.parentNode = this; c.parentElement = this; return c;
  },
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

/** 条带桩：.left-filter-strip 内自带对家一键收起钮（.left-filter-collapse）。 */
function makeStrip(withCollapse = true) {
  const strip = stubEl('div');
  strip.setAttribute('class', 'left-filter-strip');
  if (withCollapse) {
    const collapse = stubEl('button');
    collapse.setAttribute('class', 'left-filter-collapse');
    strip.appendChild(collapse);
  }
  return strip;
}

function harness(nRows: number, botOf: (i: number) => any, opts: { strip?: boolean } = {}) {
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
  const strip = opts.strip === false ? null : makeStrip();
  const created: any[] = [];
  const docStub: any = {
    body,
    createElement: (t: string) => { const e = stubEl(t); created.push(e); return e; },
    querySelector: (sel: string) => (String(sel).includes('left-filter-strip') ? strip : null),
    querySelectorAll: (sel: string) => {
      if (String(sel).includes('treeitem')) return rows;
      if (String(sel).includes('data-presence-kind')) return rows.filter((r: any) => r.getAttribute('data-presence-kind') !== null);
      return [];
    },
  };
  return { list, sec, rows, bots, body, strip, docStub, created };
}

/** ctx 桩：subscribe 立即回放一帧；可带 meta（偏好读回）与 rpc（偏好落盘）探针。 */
function makeCtx(h: any, extra: { meta?: any; rpc?: any } = {}) {
  const calls: any[] = [];
  const holder: any = { emit: null as any };
  const ctx: any = {
    subscribe: (fn: any) => { holder.emit = fn; fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; },
    rpc: extra.rpc !== undefined
      ? extra.rpc
      : ((channel: string, endpoint: string, payload: any) => { calls.push({ channel, endpoint, payload }); return Promise.resolve({ ok: true, value: {} }); }),
  };
  if (extra.meta !== undefined) ctx.meta = extra.meta;
  return { ctx, calls, holder };
}

const dotOf = (h: any) => (h.strip ? h.strip.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('presence-motion-btn')) : undefined);
const flush = () => new Promise((r) => setTimeout(r, 0));

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

test('styles：#98 绿点两态 + 悬浮层退役 + 档位覆盖，keyframe 零新增', () => {
  assert.match(styles.CSS, /data-presence-level/);
  assert.match(styles.CSS, /data-lb-kind/);
  assert.match(styles.CSS, /.left-badges-card-dot/);
  assert.match(styles.CSS, /animation-duration: 2\.8s/);
  assert.match(styles.CSS, /.presence-motion-btn/);
  assert.match(styles.CSS, /.presence-motion-dot/);
  assert.match(styles.CSS, /width: 8px/);
  assert.match(styles.CSS, /--dsw-alias-state-success-primary/, '开 = 绿点');
  assert.match(styles.CSS, /--dsw-alias-label-tertiary/, '关 = 灰点（两态，非空心）');
  assert.match(styles.CSS, /width: 14px/, '#98 真机反馈：按钮盒收紧到 14×14（点 8px + 每侧 3px 余量）');
  assert.match(styles.CSS, /margin: 0 -8px 0 -2px/, '#98 真机反馈：负外边距吃掉条带 gap ⇒ 左右视觉间距各 ~7px');
  assert.ok(!styles.CSS.includes('position: fixed'), '#98：右下角悬浮图层已退役');
  assert.ok(!styles.CSS.includes('.presence-toggle'), '#98：旧胶囊选择器已清干净');
  assert.ok(!styles.CSS.includes('::before'), '方向 A：不画点，无 ::before');
  assert.ok(!styles.CSS.includes('presence-breathe'), '方向 A：不新增 keyframe，只调 B1 既有时长/开关');
  assert.ok(!styles.CSS.includes('@keyframes'), '方向 A：零新增 keyframe');
  assert.ok(!styles.CSS.includes('.af-'), '不得占用 .af-* 私有约定');
  assert.ok(!styles.CSS.includes('data-presence-kind'), '行属性已退役');
});

test('prefs：#98 偏好读写走契约通道（meta.get 读 / meta.motion.set 写）', async () => {
  assert.equal(prefs.MOTION_CHANNEL, '/im-companion');
  assert.equal(prefs.MOTION_ENDPOINT, 'meta.motion.set');
  assert.equal(await prefs.readMotionOff(null), false, '无 ctx 一律 false（动效开）');
  assert.equal(await prefs.readMotionOff({}), false, '无 meta 一律 false');
  assert.equal(await prefs.readMotionOff({ meta: { loadMeta: async () => ({}) } }), false, '缺字段一律 false');
  assert.equal(await prefs.readMotionOff({ meta: { loadMeta: async () => ({ motion: { manualReduced: true } }) } }), true);
  assert.equal(await prefs.readMotionOff({ meta: { loadMeta: async () => { throw new Error('boom') } } }), false, '读失败不关用户动效');
  const calls: any[] = [];
  prefs.writeMotionOff({ rpc: (c: string, e: string, p: any) => { calls.push({ c, e, p }); return Promise.resolve({ ok: true }) } }, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].e, 'meta.motion.set');
  assert.deepEqual(calls[0].p, { manualReduced: true });
});

test('#98 prefs：重启语义——meta 未就绪时直读宿主真值（绕开 metaCache 竞态）', async () => {
  // 真机：mount 瞬间 ctx.meta 抛「meta 未就绪」，但 ctx.rpc 同步可用 → 直读 meta.get 即得盘上真值。
  const throwingCtx: any = {};
  Object.defineProperty(throwingCtx, 'meta', { get() { throw new Error('meta 未就绪') } });
  throwingCtx.rpc = async (c: string, e: string) => {
    assert.equal(c, '/im-companion');
    assert.equal(e, 'meta.get');
    return { ok: true, value: { motion: { manualReduced: true } } };
  };
  const r: any = await prefs.readMotionOffResult(throwingCtx);
  assert.equal(r.ok, true, '直读成功即定稿（ok:true）');
  assert.equal(r.off, true, '盘上 true 即读回已关');
  assert.equal(await prefs.readMotionOff(throwingCtx), true);
  // 未知态：meta 抛 + 直读也失败 → ok:false（调用方下次快照再试，绝不当「开」定稿）。
  const deadCtx: any = {};
  Object.defineProperty(deadCtx, 'meta', { get() { throw new Error('meta 未就绪') } });
  deadCtx.rpc = async () => { throw new Error('host down') };
  const r2: any = await prefs.readMotionOffResult(deadCtx);
  assert.equal(r2.ok, false);
  assert.equal(r2.off, false);
  // 裸 doc 桩（无信封）也认——单测桩直回 doc 时不误判为失败。
  const bareCtx: any = {};
  Object.defineProperty(bareCtx, 'meta', { get() { throw new Error('meta 未就绪') } });
  bareCtx.rpc = async () => ({ motion: { manualReduced: true } });
  assert.equal((await prefs.readMotionOffResult(bareCtx)).off, true);
});

test('#98 prefs：双写——host 盘 + MetaStore 本地镜像（fire-and-forget，失败不抛）', async () => {
  const rpcCalls: any[] = [];
  let mirrored: unknown = null;
  const ctx: any = {
    rpc: (c: string, e: string, p: any) => { rpcCalls.push({ c, e, p }); return Promise.resolve({ ok: true, value: {} }); },
    meta: { loadMeta: async () => ({}), setMotion: async (off: boolean) => { mirrored = off } },
  };
  prefs.writeMotionOff(ctx, true);
  await flush();
  assert.equal(rpcCalls.length, 1, 'host 盘写一份（meta.motion.set）');
  assert.deepEqual(rpcCalls[0].p, { manualReduced: true });
  assert.equal(mirrored, true, '本地镜像写一份（LocalMetaStore.setMotion）');
  // meta 未就绪时只写 host 那份，不抛。
  const throwingCtx: any = { rpc: (c: string, e: string, p: any) => { rpcCalls.push({ c, e, p }); return Promise.resolve({ ok: true }) } };
  Object.defineProperty(throwingCtx, 'meta', { get() { throw new Error('meta 未就绪') } });
  prefs.writeMotionOff(throwingCtx, false);
  await flush();
});

test('#98 client/meta：Local 降级也有 motion 镜像（host 不可用时同 profile 重启仍在）', async () => {
  const mem = new Map<string, string>();
  const storage: any = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
  };
  const local = new metaMod.LocalMetaStore(storage);
  assert.deepEqual((await local.loadMeta()).motion, { manualReduced: false }, '没写过即动效开');
  await local.setMotion(true);
  assert.deepEqual((await local.loadMeta()).motion, { manualReduced: true }, '本地镜像读回已关');
  await local.setMotion(false);
  assert.deepEqual((await local.loadMeta()).motion, { manualReduced: false }, '可翻回');
  const rpc = new metaMod.RpcMetaStore('/im-companion', async (_c: string, e: string, p: any) => {
    assert.equal(e, 'meta.motion.set');
    assert.deepEqual(p, { manualReduced: true });
    return { ok: true, value: {} };
  });
  await rpc.setMotion(true);
});

test('view：resolveWorkspace 名称匹配（basename/Bot名/大小写）', () => {
  const bots = [snap({ workspace: W1, botName: '小帅' })];
  assert.equal(view.resolveWorkspace('xiaoshuai', bots), W1);
  assert.equal(view.resolveWorkspace('XiaoShuai', bots), W1);
  assert.equal(view.resolveWorkspace('小帅', bots), W1);
  assert.equal(view.resolveWorkspace(W1, bots), W1);
  assert.equal(view.resolveWorkspace('dsh-im', bots), 'dsh-im');
});

test('#98 view：绿点挂筛选条内、收起钮左侧；body 不挂开关、行零写入', () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  h.rows[1].textContent = 'no-such-ws';
  installGlobals(h.docStub);
  try {
    assert.equal(view.countBound(h.bots, h.rows), 1, '未绑定行不计入实例数');
    const { ctx } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    assert.equal(h.rows[0].getAttribute('data-presence-kind'), null, '方向 A：行上零写入');
    assert.equal(h.body.getAttribute('data-presence-level'), null, 'full 档不写 body（B1 原生 1.6s）');
    const dot = dotOf(h);
    assert.ok(dot, '绿点已挂条带内');
    assert.equal(dot.getAttribute('aria-pressed'), 'false');
    assert.equal(dot.getAttribute('title'), null, '#98 Q7/Q10：无可见气泡（不写 title）');
    assert.equal(dot.getAttribute('aria-label'), '在场感动效：开，点击关闭');
    const ids = h.strip.children.map((c: any) => String(c.attrs?.class ?? ''));
    assert.ok(ids.indexOf('presence-motion-btn') < ids.indexOf('left-filter-collapse'), '绿点在收起钮左侧');
    assert.ok(!h.body.children.some((c: any) => String(c.attrs?.class ?? '').includes('presence-motion-btn')), '悬浮层已退役：body 上无开关');
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：点击翻转 → static/灰点 + 落盘；再点恢复 + 落盘 false', () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const { ctx, calls } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    const dot: any = dotOf(h);
    assert.ok(dot);
    const writes = () => calls.filter((c: any) => c.endpoint === 'meta.motion.set').map((c: any) => c.payload);
    dot.click();
    assert.equal(dot.getAttribute('aria-pressed'), 'true', '手动关 → 开关态翻转');
    assert.equal(dot.getAttribute('aria-label'), '在场感动效：已关，点击开启');
    assert.equal(h.body.getAttribute('data-presence-level'), 'static', '手动关 → body static（呼吸全停）');
    assert.deepEqual(writes(), [{ manualReduced: true }], '翻转即落盘（meta.motion.set；直读 meta.get 不计入）');
    dot.click();
    assert.equal(dot.getAttribute('aria-pressed'), 'false', '再点恢复');
    assert.equal(h.body.getAttribute('data-presence-level'), null, '恢复后回 full（body 无属性）');
    assert.deepEqual(writes(), [{ manualReduced: true }, { manualReduced: false }]);
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：偏好回填（meta.get 说出已关 → 挂载即 static + 灰点）', async () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const { ctx, calls } = makeCtx(h, { meta: { loadMeta: async () => ({ motion: { manualReduced: true } }) } });
    const dispose = view.mountPresence(ctx);
    await flush();
    assert.equal(h.body.getAttribute('data-presence-level'), 'static', '读回的偏好进档位');
    const dot: any = dotOf(h);
    assert.equal(dot.getAttribute('aria-pressed'), 'true', '读回的偏好进点色（灰）');
    assert.equal(calls.length, 0, '只是回填，不产生写');
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：重启语义——meta 未就绪（抛错）但直读宿主有值 → 照样回填已关（根因回归）', async () => {
  // 根因：client 入口 metaCache 异步 ping，mount 瞬间 ctx.meta 必抛；旧实现读一次即放弃 → 重启后还原。
  // 新实现：抛错后直调 ctx.rpc('meta.get') 读盘上真值，首帧即回填。
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const holder: any = { emit: null };
    const rpcCalls: any[] = [];
    const ctx: any = {
      subscribe: (fn: any) => { holder.emit = fn; fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; },
      rpc: (c: string, e: string, p: any) => {
        rpcCalls.push({ e, p });
        if (e === 'meta.get') return Promise.resolve({ ok: true, value: { motion: { manualReduced: true } } });
        return Promise.resolve({ ok: true, value: {} });
      },
    };
    Object.defineProperty(ctx, 'meta', { get() { throw new Error('[dsh-im-companion] meta 未就绪') } });
    const dispose = view.mountPresence(ctx);
    await flush();
    await flush();
    assert.equal(h.body.getAttribute('data-presence-level'), 'static', '直读到的已关进档位（重启后仍灰）');
    const dot: any = dotOf(h);
    assert.ok(dot, '绿点在位');
    assert.equal(dot.getAttribute('aria-pressed'), 'true', '直读到的已关进点色（灰）');
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：未知态不误定稿——首帧读不到保持开，下次快照读到即跟回；用户先动手不再被覆盖', async () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const holder: any = { emit: null };
    let mode: 'dead' | 'off' = 'dead';
    const ctx: any = {
      subscribe: (fn: any) => { holder.emit = fn; fn({ bots: h.bots, failed: [], updatedAt: 60000 }); return () => {}; },
      rpc: () => (mode === 'dead' ? Promise.reject(new Error('host down')) : Promise.resolve({ ok: true, value: { motion: { manualReduced: true } } })),
    };
    Object.defineProperty(ctx, 'meta', { get() { throw new Error('meta 未就绪') } });
    const dispose = view.mountPresence(ctx);
    await flush();
    assert.equal(h.body.getAttribute('data-presence-level'), null, '未知态保持默认开（绝不因读不到就关）');
    assert.equal((dotOf(h) as any).getAttribute('aria-pressed'), 'false');
    // 下次快照宿主可达 → 跟回已关。
    mode = 'off';
    holder.emit({ bots: h.bots, failed: [], updatedAt: 61000 });
    await flush();
    await flush();
    assert.equal(h.body.getAttribute('data-presence-level'), 'static', '下次快照读到即跟回');
    // 用户动手后（翻回开），再来一次快照不再被旧偏好覆盖。
    (dotOf(h) as any).click();
    assert.equal(h.body.getAttribute('data-presence-level'), null, '用户翻回开');
    holder.emit({ bots: h.bots, failed: [], updatedAt: 62000 });
    await flush();
    assert.equal(h.body.getAttribute('data-presence-level'), null, '用户意图优先，不被回填覆盖');
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：宿主是旧代码 / 写失败（rpc reject 或没有 rpc）→ 开关照翻、绝不抛', async () => {
  // 真机场景：宿主半未经重载时 `meta.motion.set` 不存在 → 写被回错信封；此处用 reject 与「无 rpc」两种最坏情况钉住降级行为。
  for (const rpc of [(_c: string, _e: string, _p: any) => Promise.reject(new Error('bad-request')), undefined]) {
    const h = harness(2, (i) => snap({ botId: 'b' + i }));
    installGlobals(h.docStub);
    try {
      const { ctx } = makeCtx(h, rpc === undefined ? { rpc: null } : { rpc });
      const dispose = view.mountPresence(ctx);
      const dot: any = dotOf(h);
      dot.click();
      assert.equal(dot.getAttribute('aria-pressed'), 'true', '写不出去也要翻（内存态即时生效）');
      assert.equal(h.body.getAttribute('data-presence-level'), 'static', '写不出去也要停呼吸');
      await flush();
      dot.click();
      assert.equal(dot.getAttribute('aria-pressed'), 'false', '再点照常翻回');
      assert.equal(h.body.getAttribute('data-presence-level'), null);
      dispose();
    } finally { clearGlobals(); }
  }
});

test('#98 view：条带缺席 → fail-closed（不画绿点、不报错、档位照常）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }), { strip: false });
  installGlobals(h.docStub);
  try {
    const { ctx } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    assert.equal(dotOf(h), undefined, '无条带 ⇒ 无绿点');
    assert.equal(h.body.getAttribute('data-presence-level'), 'reduced', '档位照常（>20 自动降级）');
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：对家重建条带 → 下一次重绘绿点自动跟回', () => {
  const h = harness(2, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const { ctx, holder } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    assert.ok(dotOf(h));
    h.strip.children = []; // 模拟对家 removeStrip + 重建：自产节点随旧条带消失
    holder.emit({ bots: h.bots, failed: [], updatedAt: 61000 });
    const again = dotOf(h);
    assert.ok(again, '绿点跟回新条带');
    assert.equal(h.strip.children.filter((c: any) => String(c.attrs?.class ?? '').includes('presence-motion-btn')).length, 1, '无重复挂载');
    dispose();
  } finally { clearGlobals(); }
});

test('view：>20 实例自动 reduced（此处验 body 档位，慢呼吸由覆盖规则承载）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const { ctx } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    assert.equal(h.body.getAttribute('data-presence-level'), 'reduced');
    dispose();
  } finally { clearGlobals(); }
});

test('view：21 行全未绑定 → 计数 0 → 仍 full（衰减语义由 B1 原生承担）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }));
  h.rows.forEach((r: any, i: number) => { r.textContent = 'ghost-' + i; });
  installGlobals(h.docStub);
  try {
    assert.equal(view.countBound(h.bots, h.rows), 0);
    const { ctx } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    assert.equal(h.body.getAttribute('data-presence-level'), null, '计数 0 → full');
    dispose();
  } finally { clearGlobals(); }
});

test('#98 view：dispose 卸载即净（绿点摘除、body 档位清除、行零触碰）', () => {
  const h = harness(21, (i) => snap({ botId: 'b' + i }));
  installGlobals(h.docStub);
  try {
    const { ctx } = makeCtx(h);
    const dispose = view.mountPresence(ctx);
    assert.equal(h.body.getAttribute('data-presence-level'), 'reduced');
    assert.ok(dotOf(h), '挂载期绿点在位');
    dispose();
    assert.equal(h.body.getAttribute('data-presence-level'), null, 'body 档位已清（B1 恢复原生）');
    assert.equal(dotOf(h), undefined, '绿点已摘');
    assert.ok(h.rows.every((r: any) => r.getAttribute('data-presence-kind') === null), '行零触碰');
  } finally { clearGlobals(); }
  assert.ok(bindings.badgeForWorkspace, '共享 bindings 可读（Smoke）');
  assert.match(viewSrc, /\.left-filter-strip/, '#98 锚点类名在源码里可查（跨特性只读锚点）');
});

rmSync(tmp, { recursive: true, force: true });
console.log('features/presence: ALL PASS');
