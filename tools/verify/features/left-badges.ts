// B1 结论回归（F0 每功能自验证）：left-badges 特性纯数据层 + 视图断言（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把特性链转译到临时目录，再断言转译产物。
// 覆盖结论：单份 stream（stale 保留/时间冻结/ok:false 不保留/订阅广播）、徽标四态、行装饰、样式命名空间。
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
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
  join(REPO, 'src', 'client', 'components', 'home-identity.ts'),
  /* #154：共享层工作区索引（行身份 → 路径）单点真相。 */
  join(DATA, 'workspace-index.ts'),
  /* #190：字形 parity 目标（home-icons 的 home/bot 路径逐字镜像）。 */
  join(REPO, 'src', 'client', 'components', 'home-icons.ts'),
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
/* 地基修复：tmp 无 node_modules 上溯链，转译产物里的 react 等第三方 require 会挂；junction 指回仓库（随末尾 rmSync 清理，目标不受影响）。 */
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction');
} catch {
  /* 已存在则跳过 */
}
const req = createRequire(join(tmp, 'run.cjs')); 
const streamMod: any = req('./client/data/connection-stream.js');
const bindings: any = req('./client/data/bindings.js');
const view: any = req('./features/left-badges/view.js');
const styles: any = req('./features/left-badges/styles.js');
const registry: any = req('./features/index.js');
const hover: any = req('./features/left-badges/hover-card.js');
const fleetApi: any = req('./client/data/fleet-api.js');
const face: any = req('./features/left-badges/assistant-face.js');
const panelIdentity: any = req('./features/left-badges/panel-identity.js');
const cardModel: any = req('./features/left-badges/card-model.js');
const cardRender: any = req('./features/left-badges/card-render.js');
const homeIcons: any = req('./client/components/home-icons.js');
const identity: any = req('./client/components/home-identity.js');
const wsIndex: any = req('./client/data/workspace-index.js');

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

/* 悬浮层测试桩：行带几何，元素带 style/尺寸/父子链。 */
const stubEl: any = (tag: string) => ({
  tag, attrs: {} as Record<string, string>, children: [] as any[], listeners: {} as Record<string, any[]>, text: '',
  style: {} as Record<string, string>, parentNode: null as any,
  offsetWidth: 64, offsetHeight: 18,
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
  getAttribute(k: string) { return this.attrs[k] ?? null; },
  removeAttribute(k: string) { delete this.attrs[k]; },
  appendChild(c: any) { c.parentNode = this; this.children.push(c); return c; },
  removeChild(c: any) { this.children = this.children.filter((x: any) => x !== c); return c; },
  addEventListener(t: string, fn: any) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); },
  removeEventListener() {},
  querySelector(sel: string) {
    const cls = sel.startsWith('.') ? sel.slice(1) : sel;
    return this.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)) ?? null;
  },
  getBoundingClientRect() { return { top: 10, left: 10, right: 200, bottom: 44, width: 190, height: 34 }; },
  closest(s: string) { return this; },
  get textContent() { return this.text; },
  set textContent(v: string) { this.text = String(v); },
});
const layerOf = (body: any) => body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-badges-layer')) ?? null;
const chipOf = (layer: any) => (layer ? layer.querySelector('.left-badges-badge') : null);

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
  assert.equal(on.tooltip.match(/在线/g)?.length ?? 0, 1, '状态词不复读');
  assert.equal(on.tooltip.split('\n')[0], 'xiaoshuai', '首行是名字不是状态');
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
  assert.equal(bindings.lastCheckedText([snap({ lastCheckedAt: 5000 })]), '最后检测 ' + new Date(5000).toLocaleTimeString('zh-CN', { hour12: false }));
  assert.equal(bindings.lastCheckedText([snap({ lastCheckedAt: null })]), '最后检测 暂无');
  assert.equal(bindings.lastCheckedText([]), '最后检测 暂无');
});

test('view：resolveWorkspace 名称匹配（basename/Bot名/大小写）+ 未解析哨兵', () => {
  const bots = [snap({ workspace: W1, botName: '小帅' })];
  assert.equal(view.resolveWorkspace('xiaoshuai', bots), W1);
  assert.equal(view.resolveWorkspace('XiaoShuai', bots), W1);
  assert.equal(view.resolveWorkspace('小帅', bots), W1);
  assert.equal(view.resolveWorkspace(W1, bots), W1);
  /* #154：解析不出 ⇒ 空串哨兵（绝不把显示名当工作区标识）。 */
  assert.equal(view.resolveWorkspace('dsh-im', bots), '');
});

test('#154 view：默认工作区按行身份解析（本地化显示名 ⇒ 绑定路径）', () => {
  const D = 'D:\\deepseek-harness\\default-workspace';
  const index = wsIndex.buildWorkspaceIndex([{ workspaceId: 'w-default', path: D, title: 'default-workspace' }]);
  const bots = [snap({ workspace: D, botName: '小助手' })];
  const ws = view.resolveWorkspace('默认工作区', bots, 'w-default', index);
  assert.equal(ws, D, '默认工作区解析回绑定路径');
  assert.equal(bindings.badgeForWorkspace(ws, bots).kind, 'online', '徽标不再判未绑定');
  /* 改名工作区（显示名 ≠ basename）同样按身份解析。 */
  const index2 = wsIndex.buildWorkspaceIndex([{ workspaceId: 'w-renamed', path: 'D:\\agents\\xiaowan', title: 'tttttt' }]);
  assert.equal(view.resolveWorkspace('tttttt', bots, 'w-renamed', index2), 'D:\\agents\\xiaowan');
  /* 全不匹配 ⇒ 哨兵。 */
  assert.equal(view.resolveWorkspace('毫不相干', bots, '', index), '');
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
  assert.match(styles.CSS, /data-lb-kind/);
  assert.match(styles.CSS, /::after/);
  assert.ok(!styles.CSS.includes('.af-'), '不得占用 .af-* 私有约定');
});

test('styles：悬浮卡桥接 --hu-*（色脸在左栏也有色）', () => {
  const m = /\.left-badges-card\s*\{([^}]*)\}/.exec(styles.CSS);
  assert.ok(m && m[1], '卡规则在');
  const body = String(m && m[1]);
  assert.match(body, /--hu-panel\s*:\s*var\(--dsw-alias-bg-base/, '面板底桥到左栏底');
  assert.match(body, /--hu-ink\s*:\s*var\(--dsw-alias-label-primary/, '墨色桥到左栏主字');
});

test('view：行属性徽标 + 悬停标题 + 复写幂等', () => {
  const row = stubEl('div');
  row.textContent = 'xiaoshuai';
  const heardDoc: string[] = [];
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body'), addEventListener(t: string) { heardDoc.push(t); }, removeEventListener() {} };
  const events: any[] = [];
  const winStub: any = {
    CustomEvent: class { type: string; detail: any; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
    dispatchEvent(ev: any) { events.push(ev); return true; },
    innerWidth: 1024, innerHeight: 768,
    addEventListener() {}, removeEventListener() {},
  };
  (globalThis as any).document = docStub;
  (globalThis as any).window = winStub;
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
  try {
    const heard: any[] = [];
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: [snap({ lastCheckedAt: 5000 })], failed: [], updatedAt: 60000 }); heard.push(fn); return () => {}; } };
    const dispose = view.mountLeftBadges(ctx);
    assert.equal(row.getAttribute('data-lb-kind'), 'online');
    assert.equal(row.getAttribute('data-lb-label'), '在线');
    assert.equal(row.getAttribute('title'), null, '原生title让位自画卡');
    assert.equal(row.children.length, 0, '行内不增节点');
    heard[0]({ bots: [snap({ lastCheckedAt: 5000 })], failed: [], updatedAt: 61000 });
    assert.equal(row.getAttribute('data-lb-kind'), 'online', '复写幂等');
    assert.equal(row.children.length, 0);
    assert.ok(heardDoc.includes('mouseover') && heardDoc.includes('mouseout'), '悬停委托已注册');
    dispose();
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).MutationObserver;
  }
});

test('view：老代挂载在新代出现后不覆盖（代际哨兵）', () => {
  const row = stubEl('div');
  row.textContent = 'xiaoshuai';
  const win: any = {};
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body'), addEventListener() {}, removeEventListener() {} };
  (globalThis as any).document = docStub;
  (globalThis as any).window = win;
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
  try {
    let fn: any = null;
    const ctx: any = { subscribe: (f: any) => { fn = f; f({ bots: [snap({ lastCheckedAt: 5000 })], failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountLeftBadges(ctx);
    assert.equal(row.getAttribute('data-lb-kind'), 'online', '首轮打标');
    win.__lbGen = 999;
    fn({ bots: [snap({ lastCheckedAt: 5000, healthKind: 'offline', healthStatus: 'offline', connected: false })], failed: [], updatedAt: 61000 });
    assert.equal(row.getAttribute('data-lb-kind'), 'online', '老代不覆盖');
    dispose();
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).MutationObserver;
  }
});

test('view：未绑定无属性且行内不写节点', () => {
  const row = stubEl('div');
  row.textContent = 'dsh-im';
  const docStub: any = { querySelectorAll: () => [row], createElement: (t: string) => stubEl(t), body: stubEl('body'), addEventListener() {}, removeEventListener() {} };
  (globalThis as any).document = docStub;
  (globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };
  try {
    const ctx: any = { subscribe: (fn: any) => { fn({ bots: [snap({})], failed: [], updatedAt: 60000 }); return () => {}; } };
    const dispose = view.mountLeftBadges(ctx);
    assert.equal(row.getAttribute('data-lb-kind'), null, '未绑定无属性');
    assert.equal(row.getAttribute('title'), null, '未绑定无标题');
    assert.equal(row.children.length, 0, '行内不写节点');
    dispose();
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
  }
});


/* ===== #190：实体驱动卡片（家行 / 助理行 / 游离机器人行） ===== */

const HOME = (over = {}) => ({ id: 'h1', workspaceId: 'w1', path: W1, name: '小帅家', nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1, ...over });
const ASST = (over = {}) => ({ id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'f1', status: 'bound', name: '小洋', nameSource: 'user', avatar: null, avatarSource: 'user', createdAt: 1, boundAt: 1, ...over });
const srcOf = (over = {}) => ({ workspacePath: W1, bots: [], homes: [HOME()], assistants: [], images: new Map(), ...over });

test('card-model：实体三态（家行 + 已绑/未绑定助理；无绑定 bot 也出卡，#190 Q1/Q2/Q3）', () => {
  const bots = [snap({ botId: 'f1', botName: '小洋bot', lastCheckedAt: 5000 })];
  const assistants = [
    ASST({ id: 'a1', botId: 'f1', name: '小洋' }),
    ASST({ id: 'a2', botId: null, status: 'unbound', channel: 'weixin', name: '调色板🎨', nameSource: 'user', createdAt: 2 }),
  ];
  const d = cardModel.buildCardData(srcOf({ bots, assistants }));
  assert.ok(d, '有家即出卡');
  assert.equal(d.agent, 'xiaoshuai', '家行名=行显示口径');
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows[0].kind, 'assistant');
  assert.equal(d.rows[0].unbound, false);
  assert.equal(d.rows[0].name, '小洋');
  assert.equal(d.rows[0].state, 'online');
  assert.equal(d.rows[0].tag, '');
  assert.ok(String(d.rows[0].glyph).includes('data-channel-logo="feishu"'), '助理行首格渠道 logo');
  assert.equal(d.rows[1].kind, 'assistant', '未绑定助理也是助理行');
  assert.equal(d.rows[1].unbound, true);
  assert.equal(d.rows[1].name, '调色板🎨');
  assert.equal(d.rows[1].tag, '未绑定');
  assert.equal(d.rows[1].state, null, '未绑定不出状态点');
  assert.equal(d.rows[1].face.icon, 'bot', '未绑定走机器人字形');
  assert.equal(d.rows[1].face.tint, '', '未绑定灰化不给色板');
  assert.equal(d.rows[1].glyph, null, '未绑定没有渠道，不给渠道 logo（验收反馈一）');
  // Q3=B：没有任何绑定 bot 的家，悬停也出卡（家 + 未绑定助理）
  const solo = cardModel.buildCardData(srcOf({ assistants: [assistants[1]] }));
  assert.ok(solo, '无绑定 bot 的家也出卡');
  assert.equal(solo.rows.length, 1);
  assert.equal(solo.rows[0].tag, '未绑定');
  assert.equal(solo.time, '最后检测 暂无');
  // 无家且无 bot ⇒ 无卡
  assert.equal(cardModel.buildCardData(srcOf({ homes: [] })), null);
});

test('card-model：游离机器人两档（未归属/无助理；已绑本家不重复出机器人行，#190 Q4）', () => {
  const bots = [
    snap({ channel: 'weixin', botId: 'wx1', botName: '微信机器人', lastCheckedAt: 5000 }),
    snap({ channel: 'qq', botId: 'qq1', botName: '', lastCheckedAt: 3000 }),
  ];
  const other = [ASST({ id: 'a9', homeId: 'h9', channel: 'weixin', botId: 'wx1', name: '微信机器人', nameSource: 'user', createdAt: 9 })];
  const d = cardModel.buildCardData(srcOf({ bots, assistants: other }));
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows[0].kind, 'robot');
  assert.equal(d.rows[0].role, 'other-home', '匹配到助理但助理属于别家');
  assert.equal(d.rows[0].tag, '未归属');
  assert.equal(d.rows[0].name, '微信机器人', '机器人行用机器人名，不用助理名/脸');
  assert.equal(d.rows[0].face, null);
  assert.ok(String(d.rows[0].glyph).includes('data-channel-logo="weixin"'), '游离机器人行首格=渠道 logo（验收反馈三）');
  assert.equal(d.rows[1].kind, 'robot');
  assert.equal(d.rows[1].role, 'no-assistant', 'botId 无匹配即无助理');
  assert.equal(d.rows[1].tag, '无助理');
  assert.equal(d.rows[1].name, '…qq1', '无名 Bot 用后四位占位');
  // 已绑本家的 bot 只出助理行
  const own = cardModel.buildCardData(srcOf({ bots: [snap({ botId: 'f1' })], assistants: [ASST({ botId: 'f1' })] }));
  assert.equal(own.rows.filter((r) => r.kind === 'robot').length, 0, '已绑 bot 不重复出机器人行');
  assert.equal(own.rows.length, 1);
});

test('card-model：Q2 头像规则（有配置头像就展示头像；无图走归属身份）', () => {
  const imgs = new Map([['h1', 'data:image/png;base64,HOME'], ['a1', 'data:image/png;base64,A']]);
  const withImg = cardModel.buildCardData(srcOf({
    images: imgs,
    homes: [HOME({ avatar: 'img:home.png' })],
    bots: [snap({ botId: 'f1' })],
    assistants: [ASST({ botId: 'f1', avatar: 'img:a.png' })],
  }));
  assert.equal(withImg.face.img, 'data:image/png;base64,HOME', '家上传图');
  assert.equal(withImg.rows[0].face.img, 'data:image/png;base64,A', '助理上传图优先');
  const plain = cardModel.buildCardData(srcOf({ bots: [snap({ botId: 'f1' })], assistants: [ASST({ botId: 'f1', avatar: '3' })] }));
  assert.equal(plain.face.img, null);
  assert.equal(plain.face.icon, 'home', '无图家行=房子图标');
  assert.equal(plain.face.tint, identity.avatarStyleFor('home', 'h1', null), '家色板与面板同口径');
  assert.equal(plain.rows[0].face.img, null);
  assert.equal(plain.rows[0].face.icon, 'bot', '无图助理行=机器人图标');
  assert.equal(plain.rows[0].face.tint, identity.avatarStyleFor('assistant', 'a1', '3'), '助理色板与面板同口径');
});

test('card-model：家行名优先级 + 无家回退（行显示名>用户命名>目录基名）', () => {
  assert.equal(cardModel.buildCardData(srcOf()).agent, 'xiaoshuai', '默认目录基名');
  assert.equal(cardModel.buildCardData(srcOf({ displayName: '小帅2' })).agent, '小帅2', '行显示名优先');
  assert.equal(cardModel.buildCardData(srcOf({ homes: [HOME({ name: '我的家', nameSource: 'user' })] })).agent, '我的家', '面板用户命名');
  assert.equal(cardModel.buildCardData(srcOf({ homes: [HOME({ name: '小帅家', nameSource: 'system' })] })).agent, 'xiaoshuai', '系统名不参与（与面板同链）');
  const orphan = cardModel.buildCardData(srcOf({ homes: [], bots: [snap({ botId: 'f1' })] }));
  assert.ok(orphan, '无家但有 bot 仍出卡');
  assert.equal(orphan.homeId, '');
  assert.equal(orphan.face.icon, undefined, '无家不挂房子图标');
  assert.equal(orphan.rows[0].kind, 'robot');
});

test('fleet-api：botDisplayLabel（有名优先/超长截断/占位不空）', () => {
  assert.equal(fleetApi.botDisplayLabel({ botName: '客服小美', botId: 'abc123' }), '客服小美');
  assert.equal(fleetApi.botDisplayLabel({ botName: '  ', botId: 'feishu-xyz9876' }), '…9876');
  assert.equal(fleetApi.botDisplayLabel({ botName: '', botId: '' }), '未命名');
  assert.ok(fleetApi.botDisplayLabel({ botName: '0123456789abcdef', botId: 'x' }).endsWith('…'));
});

test('card-model：助理行名可辨别（同渠道多 Bot / 占位不空）', () => {
  const bots = [
    snap({ botId: 'f1', botName: '客服小美', lastCheckedAt: 5000 }),
    snap({ botId: 'f2', botName: '夜班小美', lastCheckedAt: 5000 }),
    snap({ channel: 'qq', botId: 'qq123456', botName: '', lastCheckedAt: 5000 }),
  ];
  const assistants = [
    ASST({ id: 'a1', botId: 'f1', nameSource: 'bot', name: '', createdAt: 1 }),
    ASST({ id: 'a2', botId: 'f2', nameSource: 'bot', name: '', createdAt: 2 }),
    ASST({ id: 'a3', channel: 'qq', botId: 'qq123456', nameSource: 'bot', name: '', createdAt: 3 }),
  ];
  const d = cardModel.buildCardData(srcOf({ bots, assistants }));
  assert.equal(d.rows.length, 3);
  assert.equal(d.rows[0].name, '客服小美');
  assert.equal(d.rows[1].name, '夜班小美');
  assert.notEqual(d.rows[0].name, d.rows[1].name, '同渠道多 Bot 必须可辨别');
  assert.equal(d.rows[2].name, '…3456', '无名 Bot 用 botId 后四位占位');
  assert.ok(d.rows.every((r) => typeof r.name === 'string' && r.name.length > 0), '不留纯图标行');
});

test('card-model：同渠道组内槽位均分（#33v2，构造错开不靠运气）', () => {
  const bots = [
    snap({ botId: 'f1', botName: '小帅', lastCheckedAt: 5000 }),
    snap({ botId: 'f2', botName: '小赡', lastCheckedAt: 5000 }),
    snap({ botId: 'f3', botName: '小匠', lastCheckedAt: 5000 }),
  ];
  const assistants = [
    ASST({ id: 'a1', botId: 'f1', nameSource: 'bot', name: '', createdAt: 1 }),
    ASST({ id: 'a2', botId: 'f2', nameSource: 'bot', name: '', createdAt: 2 }),
    ASST({ id: 'a3', botId: 'f3', nameSource: 'bot', name: '', createdAt: 3 }),
  ];
  const d = cardModel.buildCardData(srcOf({ bots, assistants }));
  assert.equal(d.rows.map((r) => r.bot).join(','), 'f1,f2,f3', '行带 Bot 身份');
  const seen = {};
  const phases = d.rows.map((r) => {
    const i = seen[r.channel] || 0;
    seen[r.channel] = i + 1;
    return styles.breathPhase(r.channel, r.name + '#' + (r.bot || ''), (i * 997) % 1600);
  });
  const delays = phases.map((q) => q.delay);
  assert.equal(new Set(delays).size, 3, '组内三行 delay 必错开：' + delays.join(','));
  const ms = delays.map((s) => Math.round(parseFloat(s) * 1000));
  let gap = 1600;
  for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) {
    const g = Math.abs(ms[a] - ms[b]);
    gap = Math.min(gap, g, 1600 - g);
  }
  assert.ok(gap >= 300, '两两最小间隔 0.3s，实测 ' + (gap / 1000) + 's');
  assert.equal(styles.breathPhase('feishu').delay, styles.breathPhase('feishu').delay, '无种子走旧口径且稳定');
  assert.equal(styles.breathPhase('feishu', 'x', 0).delay, styles.breathPhase('feishu').delay, '组内首个=旧口径');
  assert.equal(styles.breathPhase('feishu', 'x', 0).delay, styles.breathPhase('feishu', 'x', 0).delay, '重渲染不跳变');
});

test('hover-card：悬浮卡三飞书绿点 animationDelay 端到端错开（#33）', async () => {
  const bots = [
    snap({ botId: 'f1', botName: '小帅', lastCheckedAt: 5000 }),
    snap({ botId: 'f2', botName: '小赡', lastCheckedAt: 5000 }),
    snap({ botId: 'f3', botName: '小匠', lastCheckedAt: 5000 }),
  ];
  const assistants = [
    ASST({ id: 'a1', botId: 'f1', nameSource: 'bot', name: '', createdAt: 1 }),
    ASST({ id: 'a2', botId: 'f2', nameSource: 'bot', name: '', createdAt: 2 }),
    ASST({ id: 'a3', botId: 'f3', nameSource: 'bot', name: '', createdAt: 3 }),
  ];
  const row = stubEl('div');
  const body = stubEl('body');
  const listeners = {};
  const docStub = {
    createElement: (t) => stubEl(t),
    body,
    documentElement: stubEl('html'),
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: () => {},
  };
  const winStub = { innerWidth: 1024, innerHeight: 768, addEventListener: () => {}, removeEventListener: () => {} };
  globalThis.document = docStub;
  globalThis.window = winStub;
  try {
    const data = cardModel.buildCardData(srcOf({ bots, assistants }));
    const dispose = hover.mountHoverCard({ matchRow: (n) => (n === row ? row : null), resolve: () => data }, 0);
    try {
      for (const fn of listeners.mouseover || []) fn({ target: row });
      await new Promise((r) => setTimeout(r, 20));
      const card = body.children.find((c) => String(c.attrs && c.attrs.class || '').split(' ').includes('left-badges-card'));
      assert.ok(card, '悬浮卡已挂载');
      const rows = card.children.filter((c) => String(c.attrs && c.attrs.class || '').split(' ').includes('left-badges-card-row'));
      assert.equal(rows.length, 3);
      const delays = rows.map((r) => {
        const dot = r.children.find((c) => String(c.attrs && c.attrs.class || '').split(' ').includes('left-badges-card-dot'));
        return dot.style.animationDelay;
      });
      assert.equal(new Set(delays).size, 3, '三行绿点 delay 端到端错开：' + delays.join(','));
    } finally {
      dispose();
    }
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});

test('card-render：结构（家行/分隔线/三种行/脚注；未绑定虚线无 logo；机器人行渠道 logo，#190 Q2/Q4 + 验收反馈）', () => {
  const bots = [
    snap({ botId: 'f1', botName: '小洋', lastCheckedAt: 5000 }),
    snap({ channel: 'weixin', botId: 'wx1', botName: '微信机器人', lastCheckedAt: 4000 }),
    snap({ channel: 'qq', botId: 'qq1', botName: '', lastCheckedAt: 3000 }),
  ];
  const assistants = [
    ASST({ id: 'a1', botId: 'f1', name: '小洋' }),
    ASST({ id: 'a2', botId: null, status: 'unbound', channel: 'weixin', name: '调色板🎨', nameSource: 'user', createdAt: 2 }),
    ASST({ id: 'a9', homeId: 'h9', channel: 'weixin', botId: 'wx1', name: '微信机器人', nameSource: 'user', createdAt: 9 }),
  ];
  const data = cardModel.buildCardData(srcOf({ bots, assistants }));
  const body = stubEl('body');
  globalThis.document = { createElement: (t) => stubEl(t), body, documentElement: stubEl('html'), addEventListener: () => {}, removeEventListener: () => {} };
  try {
    const card = stubEl('div');
    assert.equal(cardRender.renderCard(card, data), true);
    const cls = (n) => String(n.attrs && n.attrs.class || '').split(' ');
    const head = card.children[0];
    assert.ok(cls(head).includes('left-badges-card-head'), '首块=家行');
    assert.ok(cls(head.children[0]).includes('left-badges-card-avatar'), '家行头像在前');
    assert.ok(String(head.children[0].innerHTML || '').includes('data-lb-glyph="home"'), '家行=房子图标');
    assert.ok(cls(head.children[1]).includes('left-badges-card-name'), '家行名在后');
    assert.equal(head.children[1].text, 'xiaoshuai');
    assert.ok(cls(card.children[1]).includes('left-badges-card-sep'), '家行与助理行之间一条轻量分隔线');
    const rows = card.children.filter((c) => cls(c).includes('left-badges-card-row'));
    assert.equal(rows.length, 4, '已绑 + 未绑定 + 未归属机器人 + 无助理机器人');
    // 行0：已绑助理＝logo + 脸 + 名 + 状态点
    assert.ok(String(rows[0].children[0].innerHTML || '').includes('data-channel-logo="feishu"'), '首格渠道 logo');
    assert.ok(cls(rows[0].children[1]).includes('left-badges-card-avatar'));
    assert.equal(rows[0].children[2].text, '小洋');
    assert.ok(cls(rows[0].children[rows[0].children.length - 1]).includes('left-badges-card-dot'), '已绑有状态点');
    // 行1：未绑定＝虚线灰化 + 「未绑定」标签 + 无状态点 + 无渠道 logo
    assert.ok(cls(rows[1]).includes('unbound'), '未绑定行标记');
    assert.equal(rows[1].children.some((c) => String(c.innerHTML || '').includes('data-channel-logo')), false, '未绑定行不挂渠道 logo');
    const dashed = rows[1].children.find((c) => cls(c).includes('left-badges-card-avatar'));
    assert.ok(cls(dashed).includes('dashed'), '未绑定虚线');
    const tag1 = rows[1].children.find((c) => cls(c).includes('left-badges-card-tag'));
    assert.equal(tag1.text, '未绑定');
    assert.equal(rows[1].children.find((c) => cls(c).includes('left-badges-card-dot')), undefined, '未绑定无状态点');
    // 行2：未归属机器人＝渠道 logo + 机器人名 + 「未归属」+ 状态点
    assert.ok(cls(rows[2]).includes('robot') && cls(rows[2]).includes('other-home'), '未归属机器人行');
    assert.ok(String(rows[2].children[0].innerHTML || '').includes('data-channel-logo="weixin"'), '机器人行首格=渠道 logo（验收反馈三）');
    assert.ok(cls(rows[2].children[0]).includes('logo'), '渠道 logo 首格不套机器人字形圆底');
    assert.equal(rows[2].children.find((c) => cls(c).includes('left-badges-card-avatar')), undefined, '不用助理脸');
    assert.equal(rows[2].children[1].text, '微信机器人', '用机器人名');
    const tag2 = rows[2].children.find((c) => cls(c).includes('left-badges-card-tag'));
    assert.equal(tag2.text, '未归属');
    // 行3：无助理机器人
    assert.ok(cls(rows[3]).includes('no-assistant'));
    const tag3 = rows[3].children.find((c) => cls(c).includes('left-badges-card-tag'));
    assert.equal(tag3.text, '无助理');
    const foot = card.children[card.children.length - 1];
    assert.ok(cls(foot).includes('left-badges-card-foot'));
    assert.match(foot.text, /最后检测/);
  } finally {
    delete globalThis.document;
  }
});

test('card-render：家上传头像铺图（有配置头像就展示头像，#190 Q2）', () => {
  const data = cardModel.buildCardData(srcOf({ homes: [HOME({ avatar: 'img:home.png' })], images: new Map([['h1', 'data:image/png;base64,HOME']]) }));
  const body = stubEl('body');
  globalThis.document = { createElement: (t) => stubEl(t), body, documentElement: stubEl('html'), addEventListener: () => {}, removeEventListener: () => {} };
  try {
    const card = stubEl('div');
    assert.equal(cardRender.renderCard(card, data), true);
    const head = card.children[0];
    const img = head.children[0].children.find((c) => c.tag === 'img');
    assert.ok(img, '家上传图挂 img');
    assert.equal(img.attrs.src, 'data:image/png;base64,HOME');
    assert.equal(head.children[1].text, 'xiaoshuai');
  } finally {
    delete globalThis.document;
  }
});

test('assistant-face：matchAssistant（精确/兜底/同路家/无）', () => {
  const A = (over = {}) => ({ id: 'a', homeId: 'h1', channel: 'feishu', botId: null, status: 'bound', name: '', nameSource: 'bot', avatar: null, ...over });
  const H = (over = {}) => ({ id: 'h1', path: W1, ...over });
  const bot = snap({ botId: 'f1', lastCheckedAt: 1 });
  assert.equal(face.matchAssistant([A({ id: 'a-qq', channel: 'qq', botId: 'f1' }), A({ id: 'a-ok', channel: 'feishu', botId: 'f1' })], [], bot, W1).id, 'a-ok', '渠道+botId 精确优先');
  assert.equal(face.matchAssistant([A({ id: 'a-loose', channel: 'qq', botId: 'f1' })], [], { ...bot, channel: 'weixin' }, W1).id, 'a-loose', 'botId 兜底');
  assert.equal(face.matchAssistant([A({ id: 'a-home', botId: null })], [H()], { ...bot, botId: '' }, W1).id, 'a-home', '同路家首助理');
  assert.equal(face.matchAssistant([], [], { ...bot, botId: '' }, W1), null, '无家无助理回 null');
  assert.equal(face.matchAssistant([A({ id: 'a-tomb', botId: null })], [H({ tombstone: { at: 1, reason: 'x' } })], { ...bot, botId: '' }, W1), null, '墓碑家不进');
});

test('assistant-face：faceFor 优先级（上传图>归属色脸>渠道图>首字）', () => {
  const A = (over = {}) => ({ id: 'a-xw', homeId: 'h1', channel: 'feishu', botId: 'f1', status: 'bound', name: '', nameSource: 'bot', avatar: null, ...over });
  const H = [{ id: 'h1', path: W1 }];
  const bot = snap({ botId: 'f1', botName: '旧名', avatarUrl: 'https://c/b.png', lastCheckedAt: 1 });
  const up = face.faceFor(bot, [A({ name: '小婉', nameSource: 'user', avatar: 'img:face.png' })], H, W1, new Map([['a-xw', 'data:image/png;base64,ZZZ']]));
  assert.equal(up.name, '小婉', '用户改名优先作助理名');
  assert.equal(up.desc.img, 'data:image/png;base64,ZZZ', '助理上传图优先');
  const tint = face.faceFor(bot, [A({ name: '小婉', nameSource: 'user', avatar: '3' })], H, W1, new Map());
  assert.equal(tint.desc.img, null);
  assert.equal(tint.desc.tint, identity.avatarStyleFor('assistant', 'a-xw', '3'), '助理暖亮色板（与面板同口径）');
  assert.equal(tint.desc.icon, 'bot', '无图助理=机器人字形');
  assert.equal(tint.desc.initial, '小', 'CJK 取首字');
  assert.equal(tint.name, '小婉');
  const ch = face.faceFor(bot, [], [], W1, new Map());
  assert.equal(ch.desc.img, 'https://c/b.png', '无助理时渠道图兜底');
  const bare = face.faceFor(snap({ botId: '', botName: '', avatarUrl: '', lastCheckedAt: 1 }), [], [], W1, new Map());
  assert.equal(bare.desc.img, null);
  assert.equal(bare.desc.initial, '未', '占位名首字');
});

test('assistant-face：视觉 parity（旧色板 + kind 归属色板/图标 + 字形逐字）', () => {
  for (const [id, av] of [['a1', null], ['a1', '3'], ['x', 'img:zzz'], ['n', '9'], ['k', '1']]) {
    assert.equal(face.faceStyle(id, av), identity.avatarStyle(id, av), '旧家色板一致：' + id + '/' + av);
  }
  for (const n of ['小婉', '客服小美', 'dsh-log', 'ab', 'x', '', '  ']) {
    assert.equal(face.initialsOf(n), identity.initialsOf(n), '字形一致：' + JSON.stringify(n));
  }
  for (const kind of ['home', 'assistant']) {
    for (const [id, av] of [['a1', null], ['a1', '3'], ['n', '9'], ['k', '1'], ['z', null]]) {
      assert.equal(panelIdentity.avatarStyleFor(kind, id, av), identity.avatarStyleFor(kind, id, av), '归属色板一致：' + kind + '/' + id + '/' + av);
      assert.deepEqual(panelIdentity.presetFor(kind, av), identity.presetFor(kind, av), '预置档一致：' + kind + '/' + av);
    }
    assert.equal(panelIdentity.avatarIconFor(kind), identity.avatarIconFor(kind), '归属图标一致：' + kind);
  }
  assert.equal(panelIdentity.GLYPH_PATHS.home, homeIcons.HU_ICON_PATHS.home, '房子字形逐字镜像');
  assert.equal(panelIdentity.GLYPH_PATHS.bot, homeIcons.HU_ICON_PATHS.bot, '机器人字形逐字镜像');
  assert.ok(panelIdentity.glyphSvg('home').includes('data-lb-glyph="home"'));
  assert.ok(panelIdentity.glyphSvg('bot', 12).includes('width="12"'));
  assert.equal(face.hasFaceImage('img:face.png'), true);
  assert.equal(face.hasFaceImage('3'), false);
  assert.equal(face.hasFaceImage(null), false);
});

test('assistant-face：paintFace（img/色脸/归属图标）', () => {
  const body = stubEl('body');
  globalThis.document = { createElement: (t) => stubEl(t), body, documentElement: stubEl('html'), addEventListener: () => {}, removeEventListener: () => {} };
  try {
    const withImg = face.paintFace({ img: 'data:image/png;base64,Z', tint: '', initial: '' });
    assert.ok(withImg, '有图成格');
    assert.equal(String(withImg.attrs.class).split(' ').includes('left-badges-card-avatar'), true);
    const img = withImg.children.find((c) => c.tag === 'img');
    assert.equal(img.attrs.src, 'data:image/png;base64,Z');
    const tinted = face.paintFace({ img: null, tint: 'background:X;color:Y', initial: '小' });
    assert.equal(tinted.children.length, 0);
    assert.equal(tinted.attrs.style, 'background:X;color:Y');
    assert.equal(tinted.text, '小');
    const icon = face.paintFace({ img: null, tint: 'background:X;color:Y', initial: '小', icon: 'bot' });
    assert.ok(String(icon.innerHTML).includes('data-lb-glyph="bot"'), '归属图标挂 svg');
    assert.equal(icon.text, '', '有图标不再写首字');
    const home = face.paintFace({ img: null, tint: '', initial: 'X', icon: 'home' });
    assert.ok(String(home.innerHTML).includes('data-lb-glyph="home"'));
    const bare = face.paintFace({ img: null, tint: '', initial: '' });
    assert.equal(bare.text, '?', '空首字回 ?');
  } finally {
    delete globalThis.document;
  }
});

test('assistant-face：mountAssistantFaces（home.list + avatar.get，snapshot 直通，rpc 空回落）', async () => {
  const homes = [{ id: 'h1', path: W1 }];
  const assistants = [{ id: 'a-xw', homeId: 'h1', channel: 'feishu', botId: 'f1', status: 'bound', name: '小婉', nameSource: 'user', avatar: 'img:face.png' }];
  const seen = [];
  const rpc = async (ch, endpoint, payload, signal) => {
    seen.push(endpoint);
    if (endpoint === 'home.list') return { ok: true, value: { homes, assistants } };
    if (endpoint === 'avatar.get') return { ok: true, value: { images: { 'a-xw': 'data:image/png;base64,ZZZ' } } };
    throw new Error('bad ' + endpoint);
  };
  const faces = face.mountAssistantFaces(rpc);
  await faces.refresh();
  assert.ok(seen.includes('home.list') && seen.includes('avatar.get'), '家表+取图都走自有桥');
  const hit = faces.faceOf(snap({ botId: 'f1', botName: '旧名', lastCheckedAt: 1 }), W1);
  assert.equal(hit.name, '小婉', '助理名');
  assert.equal(hit.desc.img, 'data:image/png;base64,ZZZ', '助理上传图');
  const snap1 = faces.snapshot();
  assert.equal(snap1.homes[0].id, 'h1', 'snapshot 带家表（卡片实体分类数据源）');
  assert.equal(snap1.assistants[0].id, 'a-xw');
  assert.equal(snap1.images.get('a-xw'), 'data:image/png;base64,ZZZ');
  const mute = face.mountAssistantFaces(null);
  await mute.refresh();
  const fb = mute.faceOf(snap({ botId: 'f1', botName: '旧名', avatarUrl: 'https://c/b.png', lastCheckedAt: 1 }), W1);
  assert.equal(fb.desc.img, 'https://c/b.png', '无 rpc 回落渠道图');
});

test('assistant-face：取图失败可重试（异常重试到账；宿主明确无图负缓存不再问，#190 验收问题二）', async () => {
  const homes = [{ id: 'h1', path: W1 }];
  const assistants = [{ id: 'a-xw', homeId: 'h1', channel: 'feishu', botId: 'f1', status: 'bound', name: '小婉', nameSource: 'user', avatar: 'img:face.png' }];
  let avatarCalls = 0;
  const rpc = async (ch, endpoint) => {
    if (endpoint === 'home.list') return { ok: true, value: { homes, assistants } };
    if (endpoint === 'avatar.get') {
      avatarCalls += 1;
      if (avatarCalls === 1) throw new Error('bridge timeout');
      return { ok: true, value: { images: { 'a-xw': 'data:image/png;base64,ZZZ' } } };
    }
    throw new Error('bad ' + endpoint);
  };
  const faces = face.mountAssistantFaces(rpc);
  await faces.refresh();
  assert.equal(faces.snapshot().images.get('a-xw'), undefined, '首次取图异常不落图（旧实现从此不再问）');
  await faces.refresh();
  assert.equal(avatarCalls, 2, '失败后可再问一次');
  assert.equal(faces.snapshot().images.get('a-xw'), 'data:image/png;base64,ZZZ', '重试后头像到账');
  let asks = 0;
  const gone = [{ id: 'a-gone', homeId: 'h1', channel: 'feishu', botId: 'f2', status: 'bound', name: '无图', nameSource: 'user', avatar: 'img:gone.png' }];
  const rpc2 = async (ch, endpoint) => {
    if (endpoint === 'home.list') return { ok: true, value: { homes, assistants: gone } };
    if (endpoint === 'avatar.get') { asks += 1; return { ok: true, value: { images: {} } }; }
    throw new Error('bad ' + endpoint);
  };
  const muted = face.mountAssistantFaces(rpc2);
  await muted.refresh();
  await muted.refresh();
  assert.equal(asks, 1, '宿主明确答复无图：负缓存不再重复问');
});

test('assistant-face：homeFaceFor（家上传图>归属色脸（房子图标）>无家首字）', () => {
  const H = (over = {}) => ({ id: 'h1', path: W1, avatar: null, ...over });
  const imgs = new Map([['h1', 'data:image/png;base64,HOME']]);
  const up = face.homeFaceFor(W1, 'xiaowan', [H({ avatar: 'img:face.png' })], imgs);
  assert.equal(up.desc.img, 'data:image/png;base64,HOME', '家上传图');
  assert.equal(up.name, 'xiaowan', '名用顶栏名');
  const tint = face.homeFaceFor(W1, 'xiaowan', [H({ avatar: '3' })], new Map());
  assert.equal(tint.desc.img, null);
  assert.equal(tint.desc.tint, face.faceStyle('h1', '3'), '家预设色脸');
  assert.equal(tint.desc.icon, 'home', '无图家=房子图标');
  assert.equal(tint.desc.initial, 'XI', '拉丁取前两字母');
  const cjk = face.homeFaceFor(W1, '小婉的区', [H({ avatar: null })], new Map());
  assert.equal(cjk.desc.initial, '小');
  assert.equal(cjk.desc.tint, face.faceStyle('h1', null), '默认按家 id 派生');
  const bare = face.homeFaceFor(W1, 'xiaowan', [], new Map());
  assert.equal(bare.desc.img, null);
  assert.equal(bare.desc.tint, '');
  assert.equal(bare.desc.icon, undefined, '无家不挂房子图标');
  assert.equal(bare.desc.initial, 'XI');
  const tomb = face.homeFaceFor(W1, 'xiaowan', [H({ tombstone: { at: 1, reason: 'x' } })], new Map());
  assert.equal(tomb.desc.tint, '', '墓碑家视同无家');
});

test('assistant-face：mountAssistantFaces 兼取家图 + homeFaceOf + snapshot', async () => {
  const homes = [{ id: 'h1', path: W1, avatar: 'img:home.png' }];
  const assistants = [];
  let askedIds = [];
  const rpc = async (ch, endpoint, payload, signal) => {
    if (endpoint === 'home.list') return { ok: true, value: { homes, assistants } };
    if (endpoint === 'avatar.get') { askedIds = payload.ids; return { ok: true, value: { images: { h1: 'data:image/png;base64,HOME' } } }; }
    throw new Error('bad ' + endpoint);
  };
  const faces = face.mountAssistantFaces(rpc);
  await faces.refresh();
  assert.ok(askedIds.includes('h1'), '家 img: 标记也进批量取图：' + askedIds.join(','));
  const hit = faces.homeFaceOf(W1, 'xiaowan');
  assert.equal(hit.desc.img, 'data:image/png;base64,HOME', '顶栏家图');
  assert.equal(hit.name, 'xiaowan');
  assert.equal(faces.snapshot().images.get('h1'), 'data:image/png;base64,HOME');
});
rmSync(tmp, { recursive: true, force: true });
console.log('features/left-badges: ALL PASS');
