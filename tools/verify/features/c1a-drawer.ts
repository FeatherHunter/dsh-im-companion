// C1a 详情抽屉自验证（F0 每功能自验证）：host 身份持久化 + 抽屉纯数据层 + 注册/样式/渲染断言（node --test，零第三方依赖）。
// 做法：tsc 转译相关链到临时目录再断言（照抄 left-badges.ts 模式）。B 变体 verdict（#9）：摘要直改 + 折叠详情 + 即时写（无保存按钮）。
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../dom-shim.ts';

const REPO = process.cwd();
const HOST = join(REPO, 'src', 'host');
const ROUTES = join(HOST, 'routes.ts');
const DATA = join(REPO, 'src', 'client', 'data');
const UI = join(REPO, 'src', 'client', 'ui');
const FEAT = join(REPO, 'src', 'features', 'c1a');
const ENTRIES = [
  join(HOST, 'meta-store.ts'),
  join(HOST, 'rpc.ts'),
  ROUTES,
  join(DATA, 'config.ts'),
  join(DATA, 'fleet-api.ts'),
  join(DATA, 'meta.ts'),
  join(DATA, 'model.ts'),
  join(DATA, 'header-overlay.ts'),
  join(UI, 'sheet.ts'),
  join(UI, 'modal.ts'),
  join(UI, 'dir-picker.ts'),
  join(REPO, 'src', 'client', 'icons.ts'),
  join(FEAT, 'data.ts'),
  join(FEAT, 'actions.ts'),
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
/* 地基修复（同 left-badges.ts）：tmp 无 node_modules 上溯链，junction 指回仓库。 */
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction');
} catch {
  /* 已存在则跳过 */
}
const req = createRequire(join(tmp, 'run.cjs')); 
const storeMod: any = req('./host/meta-store.js');
const config: any = req('./client/data/config.js');
const clientMeta: any = req('./client/data/meta.js');
const data: any = req('./features/c1a/data.js');
const actions: any = req('./features/c1a/actions.js');
const picker: any = req('./client/ui/dir-picker.js');
const fleetApi: any = req('./client/data/fleet-api.js');
const modelMod: any = req('./client/data/model.js');
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
const CTX0 = { groupEnabled: false, directEnabled: true, fields: ['senderId'], guidance: 'hi' };
const bot = (over = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false,
  agentPreset: null, contextEnhancement: { ...CTX0 }, ...over,
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

// ---- fleet-api 上游回流归一 ----
test('fleet-api：上游预设/上下文/目录归一化', () => {
  assert.equal(fleetApi.normalizeUpstreamPreset(null), null);
  assert.equal(fleetApi.normalizeUpstreamPreset(''), null);
  assert.equal(fleetApi.normalizeUpstreamPreset('coder'), 'coder');
  assert.equal(fleetApi.normalizeUpstreamPreset('NOPE_UPPER'), undefined);
  assert.equal(fleetApi.normalizeUpstreamPreset(undefined), undefined);
  assert.deepEqual(fleetApi.normalizeUpstreamCtx(null), null);
  assert.equal(fleetApi.normalizeUpstreamCtx(undefined), undefined);
  assert.deepEqual(fleetApi.normalizeUpstreamCtx({ groupEnabled: true }),
    { groupEnabled: true, directEnabled: false, fields: [], guidance: '' });
  assert.deepEqual(fleetApi.normalizeUpstreamCatalog(null), { defaultId: '', items: [] });
  const cat = fleetApi.normalizeUpstreamCatalog({ defaultId: 'coder', items: [{ id: 'coder', label: '代码' }, 'cs', 'BAD!!'] });
  assert.equal(cat.defaultId, 'coder');
  assert.deepEqual(cat.items.map((i) => i.id), ['coder', 'cs']);
});

// ---- data 纯逻辑：payload 与读守卫 ----
test('data：预设/上下文 payload 与盲写守卫', () => {
  assert.deepEqual(data.presetPayloadFor('b1', data.PRESET_FOLLOW), { botId: 'b1', agentPreset: null });
  assert.deepEqual(data.presetPayloadFor('b1', 'coder'), { botId: 'b1', agentPreset: 'coder' });
  assert.equal(data.presetPayloadFor('b1', data.PRESET_MIXED), null);
  assert.equal(data.presetPayloadFor('', 'coder'), null);
  assert.equal(data.presetPayloadFor('b1', 'BAD ID!!'), null);
  const full = data.ctxPayloadFor({ groupEnabled: false, directEnabled: true, fields: ['senderId'], guidance: 'hi' }, 'group', true);
  assert.deepEqual(full, { groupEnabled: true, directEnabled: true, fields: ['senderId'], guidance: 'hi' });
  assert.equal(data.ctxPayloadFor(undefined, 'group', true), null);
  assert.deepEqual(Object.keys(data.ctxPayloadFor(null, 'direct', true)).sort(), ['directEnabled', 'fields', 'groupEnabled', 'guidance']);
  assert.throws(() => data.unwrapRpc({ ok: false, error: { message: 'nope' } }), /nope/);
  data.unwrapRpc({ ok: true, value: {} });
});

test('data：抽屉模型派生自上游真值（一致/混合/未读/未知键/路由 seat 空）', () => {
  assert.equal(data.buildDrawerModel([bot()], metaDoc(), 'nope:'), null);
  const catalogs = { feishu: { defaultId: 'coder', items: [{ id: 'coder', label: '代码助手' }] } };
  const m0 = data.buildDrawerModel([bot()], metaDoc(), W1, catalogs);
  assert.equal(m0.name, 'Xiaoshuai');
  assert.equal(m0.preset, data.PRESET_FOLLOW);
  assert.equal(m0.presetReady, true);
  assert.equal(m0.presetCatalog.items.length, 1);
  assert.equal(m0.ctxReady, true);
  assert.deepEqual(m0.channels[0].ctx, { groupEnabled: false, directEnabled: true, fields: ['senderId'], guidance: 'hi' });
  assert.equal(m0.bound, true);
  assert.deepEqual(m0.routes, []);
  assert.equal(m0.channels.length, 1);
  const m1 = data.buildDrawerModel([bot({ agentPreset: 'coder' })], metaDoc(), W1, catalogs);
  assert.equal(m1.preset, 'coder');
  const mixed = data.buildDrawerModel(
    [bot({ botId: 'b1' }), bot({ botId: 'b2', channel: 'qq', agentPreset: 'coder', workspace: W1 })],
    metaDoc(), W1, catalogs);
  assert.equal(mixed.preset, data.PRESET_MIXED);
  const unread = data.buildDrawerModel([bot({ agentPreset: undefined, contextEnhancement: undefined })], metaDoc(), W1, catalogs);
  assert.equal(unread.presetReady, false);
  assert.equal(unread.ctxReady, false);
  assert.equal(unread.channels[0].ctx, undefined);
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
  /* 地基修正：c1a 复用共享按钮原语（makeButton → .af-btn），作用域内覆写 .af-btn 合法；禁的是其他 .af-* 串色。 */
  assert.doesNotMatch(styles.CSS, /\.af-(?!btn\b)/);
  assert.doesNotMatch(styles.CSS, /dsw-alias-bg-subtle/);
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

test('view：A\' 渲染含动态目录 + 双开关 + 只读区 + 空路由席位', () => {
  const catalogs = { feishu: { defaultId: '', items: [{ id: 'coder', label: '代码助手' }] } };
  const model = data.buildDrawerModel([bot()], metaDoc(), W1, catalogs);
  const noop = () => {};
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onBrowseWorkspace: noop, onDraftWorkspace: noop,
    onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  for (const needle of ['Xiaoshuai', '跟随默认', '代码助手', '模式', '沟通模式', '上下文', '群聊增强', '私聊增强', 'senderId', '性格', '新会话生效', '浏览', '保存路径', '绑定工作区', '会话路由摘要', '渠道管理', '测试']) {
    assert.ok(all.includes(needle), '缺文案: ' + needle);
  }
  assert.ok(findByClass(root, 'c1a-summary').length >= 1);
  assert.ok(all.includes('暂无已绑定会话映射'));
  const pills = findByClass(root, 'c1a-sw');
  assert.equal(pills.length, 2);
  const states = pills.map((p: any) => p.getAttribute('aria-checked')).sort();
  assert.deepEqual(states, ['false', 'true']);
  pills.forEach((p: any) => assert.equal(p.getAttribute('role'), 'switch'));
});

test('view：路由行渲染全显映射 + 幽灵告警 + 复制按钮', () => {
  const catalogs = { feishu: { defaultId: '', items: [] } };
  const model = data.buildDrawerModel([bot()], metaDoc(), W1, catalogs, [
    { chat: '私聊 ou_zhangsan0123456789', sessionId: 'session-aaa11111-2222', channel: 'feishu' },
    { chat: '旧映射 ou_ghost01', sessionId: 'session-legacy9-0000', ghost: true, channel: 'feishu' },
  ]);
  const noop = () => {};
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onBrowseWorkspace: noop, onDraftWorkspace: noop,
    onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  assert.ok(all.includes('会话路由摘要（2）'));
  assert.ok(all.includes('飞书·私聊 ou_zhangsan0123456789'));
  assert.ok(all.includes('session-aaa11111-2222'));
  assert.ok(all.includes('旧映射'));
  assert.ok(all.includes('复制'));
  assert.equal(findByClass(root, 'c1a-route').length, 2);
  assert.equal(findByClass(root, 'c1a-ghost').length, 1);
});

test('view：多渠道不一致渲染占位且可继续操作', () => {
  const catalogs = { feishu: { defaultId: '', items: [{ id: 'coder', label: '代码助手' }] } };
  const model = data.buildDrawerModel(
    [bot({ botId: 'b1' }), bot({ botId: 'b2', channel: 'qq', agentPreset: 'coder', workspace: W1,
      contextEnhancement: { groupEnabled: true, directEnabled: true, fields: [], guidance: '' } })],
    metaDoc(), W1, catalogs);
  assert.equal(model.preset, data.PRESET_MIXED);
  assert.equal(model.ctxReady, true);
  const noop = () => {};
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  assert.ok(all.includes('多渠道不一致'));
});

test('view：弹窗内无省略号——引导语全文换行展示', () => {
  const longGuide = '你是飞书群里的靠谱助手，说话简洁幽默，重要事项逐条列出并艾特相关人，闲聊时可以接梗但不刷屏。';
  assert.ok(longGuide.length > 40);
  const catalogs = { feishu: { defaultId: '', items: [] } };
  const model = data.buildDrawerModel([bot({
    contextEnhancement: { groupEnabled: true, directEnabled: true, fields: ['senderId'], guidance: longGuide },
  })], metaDoc(), W1, catalogs);
  const noop = () => {};
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onBrowseWorkspace: noop, onDraftWorkspace: noop,
    onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  assert.ok(all.includes(longGuide), '引导语被截断');
  assert.ok(!all.includes('…'), '弹窗内仍有省略号');
  assert.equal(findByClass(root, 'c1a-note').length, 1);
});

test('paint：同构快照指纹稳定，真变才变（15s 轮询不抖动）', () => {
  const mk = (ctx: typeof CTX0) => data.buildDrawerModel([bot({ contextEnhancement: { ...ctx } })], metaDoc(), W1, {});
  const a = mk({ ...CTX0 });
  const b = mk({ ...CTX0 });
  assert.ok(a && b);
  assert.equal(data.modelSig(a), data.modelSig(b));
  const c = mk({ ...CTX0, directEnabled: false });
  assert.ok(c);
  assert.notEqual(data.modelSig(a), data.modelSig(c));
});

test('drawer：抽屉占满面板几何（视口右沿兜底）', () => {
  assert.deepEqual(
    data.sheetGeometry({ top: 60, right: 1200, bottom: 800, left: 220 }, { width: 1600, height: 900 }),
    { top: 60, right: 400, bottom: 100, width: 980 },
  );
  const narrow = data.sheetGeometry({ top: 0, right: 300, bottom: 600, left: 0 }, { width: 1440, height: 900 });
  assert.equal(narrow.width, 300);
  assert.equal(data.sheetGeometry(null, { width: 1600, height: 900 }), null);
  assert.equal(data.sheetGeometry({ top: 0, right: 0, bottom: 0, left: 0 }, { width: 1600, height: 900 }), null);
});

test('drawer：可见矩形裁剪——内容高于面板时底边锁面板底（#9 真机根因）', () => {
  // .af-root 内容顶 200 底 1400（Agent 列表超长）；面板可视 200..800；视口高 900
  const content = { top: 200, right: 1200, bottom: 1400, left: 220 };
  const pane = [{ top: 200, left: 200, right: 1230, bottom: 800 }];
  // 旧逻辑：直接用内容矩形 → bottom 偏移被钳成 0 → 抽屉顶到视口（DSH）底
  const legacy = data.sheetGeometry(content, { width: 1600, height: 900 });
  assert.equal(legacy.bottom, 0);
  // 新逻辑：先裁剪 → 底边锁面板底 → bottom = 视口高 - 面板底 = 100
  const visible = data.clipRect(content, pane);
  assert.deepEqual(visible, { top: 200, right: 1200, bottom: 800, left: 220 });
  const fixed = data.sheetGeometry(visible, { width: 1600, height: 900 });
  assert.deepEqual(fixed, { top: 200, right: 400, bottom: 100, width: 980 });
  // 面板滚出内容顶（.af-root 顶在面板上方）→ 顶边也夹到面板顶
  assert.deepEqual(data.clipRect({ top: -50, right: 1200, bottom: 1200, left: 220 }, pane),
    { top: 200, right: 1200, bottom: 800, left: 220 });
  // 无裁剪祖先：原样返回
  assert.deepEqual(data.clipRect({ top: 10, right: 900, bottom: 600, left: 100 }, []),
    { top: 10, right: 900, bottom: 600, left: 100 });
  // 完全裁没（面板已滚过内容）：null，调用方走兜底
  assert.equal(data.clipRect({ top: 0, right: 500, bottom: 400, left: 100 }, [{ top: 500, left: 0, right: 900, bottom: 900 }]), null);
});

test('model：按渠道视图优先用户头像（与按Agent一致）', () => {
  const m = modelMod.buildModel([bot({ avatarUrl: 'chan.png' })], metaDoc({ avatars: { [W1]: 'user.png' } }), 'channel', '');
  assert.equal(m.channelGroups[0].views[0].avatar, 'user.png');
  const m2 = modelMod.buildModel([bot({ avatarUrl: 'chan.png' })], metaDoc(), 'channel', '');
  assert.equal(m2.channelGroups[0].views[0].avatar, 'chan.png');
});

test('actions：逐渠道写透部分失败点名渠道', async () => {
  const notes: string[] = [];
  let refreshed = 0;
  const deps = {
    rpc: async (ch: string) => {
      if (ch === '/qq') throw new Error('nope');
      return { ok: true, value: {} };
    },
    refresh: async () => { refreshed++; },
    reloadMeta: async () => undefined,
    paint: () => undefined,
    notify: (msg: string) => { notes.push(msg); },
  };
  const m = { bots: [{ channel: 'feishu', botId: 'b1' }, { channel: 'qq', botId: 'b2' }] };
  await actions.writeBots(m, deps, '预设', (b: any) => actions.rpcOf(deps.rpc, b.channel, 'bot.preset.set', { botId: b.botId }));
  assert.ok(notes.join('|').includes('部分写入'));
  assert.ok(notes.join('|').includes('qq'));
  assert.equal(refreshed, 1);
});

test('dir-picker：列出子目录并可取消', async () => {
  const fakeRpc = async (_ch: string, ep: string) => {
    if (ep === 'fs.defaultRoot') return { ok: true, value: { path: '/root' } };
    return { ok: true, value: { path: '/root', parent: '/', entries: [{ name: 'a', path: '/root/a' }] } };
  };
  const { promise, el } = picker.openDirPicker(fakeRpc, '');
  await new Promise((r) => setTimeout(r, 30));
  const all = texts(el).join('|');
  assert.ok(all.includes('选择目录'));
  assert.ok(all.includes('/root'));
  assert.match((el as any).style?.height ?? '', /min\(/
  );
  const listBox = el.querySelectorAll('.af-list')[0] as any;
  assert.equal(listBox?.style?.flex, '1 1 auto');
  const btns = el.querySelectorAll('.af-btn');
  const cancel = btns.find((b: any) => b.textContent === '取消');
  assert.ok(cancel);
  const goBtn = btns.find((b: any) => b.textContent === '前往');
  assert.ok(goBtn);
  goBtn.dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(texts(el).join('|').includes('绝对路径'));
  cancel.dispatchEvent({ type: 'click' });
  assert.equal(await promise, null);
  assert.equal(doc.body.contains(el), false);
});

test('dir-picker：原生优先（成功/取消类抛错静默，真故障回退内置）', async () => {
  const calls: string[] = [];
  const fakeRpc = async (_ch: string, ep: string) => {
    calls.push(ep);
    return { ok: true, value: { path: '/x', parent: '/', entries: [] } };
  };
  const p1 = picker.openDirPicker(fakeRpc, '', async () => 'D:\\picked');
  assert.equal(await p1.promise, 'D:\\picked');
  const p2 = picker.openDirPicker(fakeRpc, '', async () => null);
  assert.equal(await p2.promise, null);
  const p3 = picker.openDirPicker(fakeRpc, '', async () => { throw new Error('dismissed'); });
  assert.equal(await p3.promise, null);
  assert.ok(!calls.includes('fs.list'));
  const p4 = picker.openDirPicker(fakeRpc, '', async () => { throw new Error('boom'); });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(texts(doc).join('|').includes('选择目录'));
  const cancel4 = doc.body.querySelectorAll('.af-btn').find((b: any) => b.textContent === '取消');
  assert.ok(cancel4);
  cancel4.dispatchEvent({ type: 'click' });
  assert.equal(await p4.promise, null);
});

test('data：性格预填一致回填、分歧置空', () => {
  const same = [{ ctx: { ...CTX0, guidance: 'warm' } }, { ctx: { ...CTX0, guidance: ' warm ' } }];
  assert.equal(data.personalityPrefill(same), 'warm');
  const diff = [{ ctx: { ...CTX0, guidance: 'a' } }, { ctx: { ...CTX0, guidance: 'b' } }];
  assert.equal(data.personalityPrefill(diff), '');
  assert.equal(data.personalityPrefill([]), '');
});

test('actions：性格应用覆盖各渠道引导语且保留字段开关', async () => {
  const sent: any[] = [];
  const deps = {
    rpc: async (_ch: string, _ep: string, p: any) => { sent.push(p); return { ok: true, value: {} }; },
    refresh: async () => undefined,
    reloadMeta: async () => undefined,
    paint: () => undefined,
    notify: (_m: string) => undefined,
  };
  const m = { bots: [{ channel: 'feishu', botId: 'b1', ctx: { ...CTX0 } }] };
  await actions.applyPersonality(m, deps, '幽默一点');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.guidance, '幽默一点');
  assert.deepEqual(sent[0].config.fields, ['senderId']);
  assert.equal(sent[0].config.directEnabled, true);
  await actions.applyPersonality(m, deps, '   ');
  assert.equal(sent.length, 1);
});

test('data：路由取数经自有通道，失败静默空数组', async () => {
  const calls: any[] = [];
  const fakeRpc = async (ch: string, ep: string, p: any) => {
    calls.push([ch, ep, p]);
    return { ok: true, value: { routes: [{ channel: 'feishu', botId: 'b1', chat: '私聊 ou_zhangsan0123456789', session: 'session-aaa11111-2222', ghost: false }], skipped: [] } };
  };
  const bots = [{ channel: 'feishu', botId: 'b1' }];
  assert.deepEqual(await data.fetchRoutes(fakeRpc, bots), [
    { chat: '私聊 ou_zhangsan0123456789', sessionId: 'session-aaa11111-2222', ghost: false, channel: 'feishu' },
  ]);
  assert.deepEqual(await data.fetchRoutes(async () => ({ ok: true, value: { routes: [{ chat: 'x' }] } }), bots), []);
  assert.deepEqual(calls[0][0], '/im-companion');
  assert.equal(calls[0][1], 'routes.list');
  assert.deepEqual(await data.fetchRoutes(null, bots), []);
  assert.deepEqual(await data.fetchRoutes(async () => ({ ok: false, error: { message: 'x' } }), bots), []);
  assert.deepEqual(await data.fetchRoutes(async () => { throw new Error('down'); }, bots), []);
});

test('view：渠道行自带发送测试按钮（分渠道直发）', () => {
  const catalogs = { feishu: { defaultId: '', items: [] } };
  const model = data.buildDrawerModel([bot()], metaDoc(), W1, catalogs);
  const noop = () => {};
  const cbs = {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onBrowseWorkspace: noop, onDraftWorkspace: noop,
    onRemoveBot: noop, onTestSend: noop, onClose: noop,
  };
  const all = texts(view.renderDrawerContent(model, cbs)).join('|');
  assert.ok(all.includes('测试'));
  assert.ok(!all.includes('发测试消息'));
  const seen: string[] = [];
  const cbs2 = { ...cbs, onTestSend: (ch: string, id: string) => { seen.push(ch + '/' + id); } };
  const root2 = view.renderDrawerContent(model, cbs2);
  const btns = root2.querySelectorAll('.af-btn');
  const send = btns.find((b: any) => b.textContent === '测试');
  assert.ok(send);
  send.dispatchEvent({ type: 'click' });
  assert.deepEqual(seen, ['feishu/b1']);
});

// ---- E3 路由投影（#14 砍完形态）：只读 bound 投影，无名版脱敏 + direct 幽灵 key ----
const routesMod: any = req('./host/routes.js');
const hostRpc: any = req('./host/rpc.js');

test('routes：落盘解析只收字符串映射，其余丢弃', () => {
  assert.deepEqual(
    routesMod.parseSessionsText('{"sessions":{"p2p:ou_1":"sess-aaa11111","group:oc_2":"sess-bbb22222"}}'),
    { 'p2p:ou_1': 'sess-aaa11111', 'group:oc_2': 'sess-bbb22222' });
  assert.deepEqual(routesMod.parseSessionsText('{"sessions":{"a":1,"b":null,"c":"","d":"sess-ok"}}'), { d: 'sess-ok' });
  assert.deepEqual(routesMod.parseSessionsText('not json'), {});
  assert.deepEqual(routesMod.parseSessionsText('{"nope":{}}'), {});
  assert.deepEqual(routesMod.parseSessionsText('{"sessions":[]}'), {});
});

test('routes：自展面板全显（用户决议 2026-09-03）', () => {
  assert.equal(routesMod.formatChat('p2p:ou_zhangsan01'), '私聊 ou_zhangsan01');
  assert.equal(routesMod.formatChat('group:oc_project9'), '群聊 oc_project9');
  assert.equal(routesMod.formatChat('p2p:ou_zhangsan0123456789'), '私聊 ou_zhangsan0123456789');
  assert.equal(routesMod.formatChat('direct:ou_zhangsan01', 'feishu'), '旧映射 ou_zhangsan01');
  assert.equal(routesMod.formatChat('direct:12345', 'telegram'), '会话 12345');
  assert.equal(routesMod.isGhost('direct:ou_1', 'feishu'), true);
  assert.equal(routesMod.isGhost('p2p:ou_1', 'feishu'), false);
  assert.equal(routesMod.isGhost('direct:12345', 'telegram'), false);
  assert.equal(routesMod.isGhost('group:oc_1', 'feishu'), false);
  assert.equal(routesMod.formatChat('p2p:ab'), '私聊 ab');
  assert.equal(routesMod.formatChat('foo:bar'), '其他 foo:bar');
  assert.equal(routesMod.formatSession('sess-aaa11111'), 'sess-aaa11111');
  assert.equal(routesMod.formatSession('sess-1'), 'sess-1');
  assert.equal(routesMod.formatSession('session-abcdef1234567890'), 'session-abcdef1234567890');
});

test('routes：候选路径按上游落盘规则（bots 下 + 飞书 legacy）', () => {
  const home = join(tmpdir(), 'fake-home');
  assert.deepEqual(routesMod.candidateStateFiles(home, 'feishu', 'b1'), [
    join(home, 'integrations', 'dsh-feishu', 'bots', 'b1', 'state.json'),
    join(home, 'integrations', 'dsh-feishu', 'state.json'),
  ]);
  assert.deepEqual(routesMod.candidateStateFiles(home, 'qq', 'b2'), [
    join(home, 'integrations', 'dsh-qq', 'bots', 'b2', 'state.json'),
  ]);
  assert.deepEqual(routesMod.candidateStateFiles(home, 'feishu', '../evil'), []);
  assert.deepEqual(routesMod.candidateStateFiles(home, '../x', 'b1'), []);
});

test('routes：聚合读盘跳过缺失/损坏，direct 标幽灵', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'e3-routes-'));
  try {
    const botsDir = join(dir, 'integrations', 'dsh-feishu', 'bots', 'b1');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(botsDir, { recursive: true });
    writeFileSync(join(botsDir, 'state.json'), JSON.stringify({ sessions: {
      'p2p:ou_zhangsan0123456789': 'session-aaa11111-2222',
      'direct:ou_ghost0123456789': 'session-legacy9-0000',
    } }));
    const qqDir = join(dir, 'integrations', 'dsh-qq', 'bots', 'b9');
    mkdirSync(qqDir, { recursive: true });
    writeFileSync(join(qqDir, 'state.json'), JSON.stringify({ sessions: { 'direct:12345': 'sess-qq00001' } }));
    const out = await routesMod.collectRoutes(dir, [
      { channel: 'feishu', botId: 'b1' },
      { channel: 'qq', botId: 'b9' },
      { channel: 'qq', botId: 'nobody' },
    ]);
    assert.equal(out.routes.length, 3);
    const byChat = Object.fromEntries(out.routes.map((r: any) => [r.chat, r]));
    assert.deepEqual(byChat['私聊 ou_zhangsan0123456789'], { channel: 'feishu', botId: 'b1', chat: '私聊 ou_zhangsan0123456789', session: 'session-aaa11111-2222', ghost: false });
    assert.equal(byChat['旧映射 ou_ghost0123456789'].ghost, true);
    assert.equal(byChat['旧映射 ou_ghost0123456789'].session, 'session-legacy9-0000');
    assert.deepEqual(byChat['会话 12345'], { channel: 'qq', botId: 'b9', chat: '会话 12345', session: 'sess-qq00001', ghost: false });
    assert.deepEqual(out.skipped, [{ channel: 'qq', botId: 'nobody', reason: 'no-state' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('routes.list：端点只读聚合，缺席不炸', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'e3-ep-'));
  try {
    const botsDir = join(dir, 'integrations', 'dsh-feishu', 'bots', 'b1');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(botsDir, { recursive: true });
    writeFileSync(join(botsDir, 'state.json'), JSON.stringify({ sessions: { 'group:oc_proj9xxx': 'session-ccc33333-yyyy' } }));
    const handler = hostRpc.createAgentFleetHandler({}, { dshHome: dir });
    const res = await handler('routes.list', { bots: [{ channel: 'feishu', botId: 'b1' }] });
    assert.equal(res.ok, true);
    assert.deepEqual(res.value.routes, [
      { channel: 'feishu', botId: 'b1', chat: '群聊 oc_proj9xxx', session: 'session-ccc33333-yyyy', ghost: false },
    ]);
    assert.deepEqual(res.value.skipped, []);
    const empty = await handler('routes.list', { bots: [] });
    assert.deepEqual(empty.value.routes, []);
    const bad = await handler('routes.list', { bots: 'nope' });
    assert.equal(bad.ok, false);
    const ignored = await handler('routes.list', { bots: [{ channel: 'feishu', botId: 'b1' }], dshHome: '/definitely/not/here' });
    assert.equal(ignored.ok, true);
    assert.equal(ignored.value.routes.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
