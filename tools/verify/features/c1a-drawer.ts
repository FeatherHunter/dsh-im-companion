// C1a 详情抽屉自验证（F0 每功能自验证）：host 身份持久化 + 抽屉纯数据层 + 注册/样式/渲染断言（node --test，零第三方依赖）。
// 做法：tsc 转译相关链到临时目录再断言（照抄 left-badges.ts 模式）。B 变体 verdict（#9）：摘要直改 + 折叠详情 + 即时写（无保存按钮）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../dom-shim.ts';

const REPO = process.cwd();
const HOST = join(REPO, 'src', 'host');
const DATA = join(REPO, 'src', 'client', 'data');
const UI = join(REPO, 'src', 'client', 'ui');
const FEAT = join(REPO, 'src', 'features', 'c1a');
const ENTRIES = [
  join(HOST, 'meta-store.ts'),
  join(DATA, 'config.ts'),
  join(DATA, 'meta.ts'),
  join(DATA, 'model.ts'),
  join(DATA, 'header-overlay.ts'),
  join(UI, 'sheet.ts'),
  join(FEAT, 'data.ts'),
  join(FEAT, 'drawer.ts'),
  join(FEAT, 'view.ts'),
  join(FEAT, 'manifest.ts'),
  join(REPO, 'src', 'features', 'index.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'c1a-drawer-'));
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
  console.error('TRANPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const storeMod: any = req('./host/meta-store.js');
const config: any = req('./client/data/config.js');
const clientMeta: any = req('./client/data/meta.js');
const data: any = req('./features/c1a/data.js');
const styles: any = req('./features/c1a/styles.js');
const registry: any = req('./features/index.js');

const doc: any = createDocument();
(globalThis as any).window = (globalThis as any).window ?? {
  addEventListener() {}, removeEventListener() {},
  CustomEvent: class { type: string; detail: unknown; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
  dispatchEvent: () => true,
};
(globalThis as any).document = (globalThis as any).document ?? doc;
const view: any = req('./features/c1a/view.js');
const drawerMod: any = req('./features/c1a/drawer.js');
const sheet: any = req('./client/ui/sheet.js');

const W1 = 'D:\\agents\\xiaoshuai';
const bot = (over = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});
const metaDoc = (over = {}) => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {}, ...over });

// ---- host 持久化：预设/上下文校验 + 落盘 ----
test('host：非法预设/强度静默忽略，合法落盘且重载仍在', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'c1a-meta-'));
  try {
    const f = join(dir, 'meta.json');
    const s = new storeMod.AgentMetaStore(f);
    await s.setPreset('', 'cs');
    await s.setPreset('xiaoshuai', '');
    await s.setPreset('xiaoshuai', 'nope');
    await s.setPreset('xiaoshuai', 'custom:');
    await s.setCtx('xiaoshuai', { enabled: true, level: 'ultra' });
    assert.deepEqual(s.snapshot().presets ?? {}, {});
    assert.deepEqual(s.snapshot().ctxEnhance ?? {}, {});
    await s.setPreset('xiaoshuai', 'cs');
    await s.setCtx('xiaoshuai', { enabled: true, level: 'high' });
    await s.setPreset('QQ', 'custom:客服话术A');
    assert.equal(s.snapshot().presets['xiaoshuai'], 'cs');
    assert.deepEqual(s.snapshot().ctxEnhance['xiaoshuai'], { enabled: true, level: 'high' });
    const s2 = new storeMod.AgentMetaStore(f);
    await s2.load();
    assert.equal(s2.snapshot().presets['xiaoshuai'], 'cs');
    assert.equal(s2.snapshot().presets['QQ'], 'custom:客服话术A');
    assert.deepEqual(s2.snapshot().ctxEnhance['xiaoshuai'], { enabled: true, level: 'high' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- data 纯逻辑 ----
test('data：预设/强度归一化 + 标签', () => {
  assert.equal(data.normalizePreset('cs'), 'cs');
  assert.equal(data.normalizePreset('custom:abc'), 'custom:abc');
  assert.equal(data.normalizePreset('nope'), 'default');
  assert.equal(data.normalizePreset(undefined), 'default');
  assert.equal(data.normalizeLevel('high'), 'high');
  assert.equal(data.normalizeLevel('ultra'), 'mid');
  assert.equal(data.presetLabel('cs', ''), '客服话术');
  assert.equal(data.presetLabel('custom:夜间档', ''), '自定义 · 夜间档');
});

test('data：抽屉模型派生（默认/已存/未知键/路由 seat 空）', () => {
  assert.equal(data.buildDrawerModel([bot()], metaDoc(), 'nope:'), null);
  const m0 = data.buildDrawerModel([bot()], metaDoc(), W1);
  assert.equal(m0.name, 'Xiaoshuai');
  assert.equal(m0.preset, 'default');
  assert.deepEqual(m0.ctx, { enabled: false, level: 'mid' });
  assert.equal(m0.bound, true);
  assert.deepEqual(m0.routes, []);
  assert.equal(m0.channels.length, 1);
  const m1 = data.buildDrawerModel([bot()], metaDoc({ presets: { xiaoshuai: 'coder' }, ctxEnhance: { xiaoshuai: { enabled: true, level: 'low' } } }), W1);
  assert.equal(m1.preset, 'coder');
  assert.deepEqual(m1.ctx, { enabled: true, level: 'low' });
  assert.equal(typeof data.OPEN_DRAWER_EVENT ?? config.OPEN_DRAWER_EVENT, 'string');
  assert.equal(config.OPEN_DRAWER_EVENT, 'dsh-im-companion:open-drawer');
});

// ---- client meta 双实现 ----
test('client meta：Rpc/Local 双实现走通 preset/ctx', async () => {
  const calls: { ep: string; p: unknown }[] = [];
  const fakeRpc = async (_ch: string, ep: string, p: unknown) => {
    calls.push({ ep, p });
    if (ep === 'meta.get') return { ok: true, value: { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} } };
    return { ok: true, value: {} };
  };
  const rpcStore = new clientMeta.RpcMetaStore('/im-companion', fakeRpc);
  await rpcStore.setPreset('k', 'cs');
  await rpcStore.setCtx('k', { enabled: false, level: 'low' });
  assert.deepEqual(calls.map((c) => c.ep), ['meta.preset.set', 'meta.ctx.set']);
  const mem: Record<string, string> = {};
  const fakeStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const local = new clientMeta.LocalMetaStore(fakeStorage);
  await local.setPreset('k', 'coder');
  await local.setCtx('k', { enabled: true, level: 'high' });
  const docBack = await local.loadMeta();
  assert.equal(docBack.presets['k'], 'coder');
  assert.deepEqual(docBack.ctxEnhance['k'], { enabled: true, level: 'high' });
});

// ---- 注册/样式/sheet ----
test('manifest：c1a 注册进 FEATURES，样式命名空间干净', () => {
  const found = registry.FEATURES.find((f: any) => f.id === 'c1a');
  assert.ok(found, 'FEATURES 缺 c1a');
  assert.equal(typeof found.installStyles, 'function');
  assert.ok(Array.isArray(found.slots));
  assert.match(styles.CSS, /.c1a-/);
  assert.doesNotMatch(styles.CSS, /.af-/);
  assert.equal(typeof sheet.showSheet, 'function');
});

// ---- 视图渲染（dom-shim） ----
function texts(el: any, out: string[] = []): string[] {
  if (!el || typeof el !== 'object') return out;
  const kids: any[] = Array.isArray(el.childNodes) ? el.childNodes : [];
  if (kids.length === 0) {
    try {
      const t = typeof el.textContent === 'string' && el.textContent
        ? el.textContent
        : (typeof el.nodeValue === 'string' ? el.nodeValue : '');
      if (t) out.push(t);
    } catch { /* ignore */ }
  } else for (const c of kids) texts(c, out);
  return out;
}
function findByClass(el: any, cls: string): any[] {
  const hit: any[] = [];
  const walk = (n: any) => {
    try { if (n?.classList?.contains(cls)) hit.push(n); } catch { /* ignore */ }
    for (const c of n?.children ?? []) walk(c);
  };
  walk(el);
  return hit;
}

test('view：B 变体渲染含摘要直改 + 折叠详情 + 空路由席位', () => {
  const model = data.buildDrawerModel([bot()], metaDoc(), W1);
  const noop = () => {};
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onCustomName: noop, onToggleCtx: noop, onLevel: noop,
    onSaveWorkspace: noop, onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  for (const needle of ['Xiaoshuai', '客服话术', '绑定工作区', '会话路由摘要', '渠道管理', '发测试消息']) {
    assert.ok(all.includes(needle), '缺文案: ' + needle);
  }
  assert.ok(findByClass(root, 'c1a-summary').length >= 1);
  assert.ok(all.includes('随 E3（#14）落地'));
});

test('drawer：抽屉贴面板右沿几何（视口右沿兜底）', () => {
  assert.deepEqual(
    drawerMod.sheetGeometry({ top: 60, right: 1200, bottom: 800, left: 220 }, { width: 1600, height: 900 }),
    { top: 60, right: 400, bottom: 100, width: 360 },
  );
  const narrow = drawerMod.sheetGeometry({ top: 0, right: 300, bottom: 600, left: 0 }, { width: 1440, height: 900 });
  assert.equal(narrow.width, 300);
  assert.equal(drawerMod.sheetGeometry(null, { width: 1600, height: 900 }), null);
  assert.equal(drawerMod.sheetGeometry({ top: 0, right: 0, bottom: 0, left: 0 }, { width: 1600, height: 900 }), null);
});
