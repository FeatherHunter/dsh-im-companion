// E2 自验证（F0 每功能自验证）：拖拽领养纯逻辑 + 面板视图分支（node --test，零第三方依赖）。
// 只测外部行为：给定绑定关系 + 动作 → 断言用户可见结论，不断言内部形状。
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'e2-adopt');
const CLIENT = join(REPO, 'src', 'client');
const ENTRIES = [
  join(FEAT, 'model.ts'),
  join(FEAT, 'view.ts'),
  join(FEAT, 'panel.ts'),
  join(FEAT, 'acts.ts'),
  join(FEAT, 'styles.ts'),
  join(FEAT, 'manifest.ts'),
  join(REPO, 'src', 'features', 'index.ts'),
  join(REPO, 'src', 'features', 'protocol.ts'),
  join(CLIENT, 'data', 'fleet-api.ts'),
  join(CLIENT, 'data', 'config.ts'),
  join(CLIENT, 'data', 'connection-stream.ts'),
  join(CLIENT, 'data', 'meta.ts'),
  join(CLIENT, 'dom.ts'),
  join(CLIENT, 'theme.ts'),
  join(CLIENT, 'icons.ts'),
  join(CLIENT, 'ui', 'dir-picker.ts'),
  join(CLIENT, 'ui', 'sheet.ts'),
  join(CLIENT, 'ui', 'toast.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'e2-adopt-'));
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
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const model: any = req('./features/e2-adopt/model.js');
const view: any = req('./features/e2-adopt/view.js');
const styles: any = req('./features/e2-adopt/styles.js');
const manifest: any = req('./features/e2-adopt/manifest.js').feature;
const registry: any = req('./features/index.js');

const W_A = 'D:\\agents\\xiaoshuai';
const W_B = 'D:\\agents\\ali';
const bots = [
  { channel: 'feishu', botId: 'f1', workspace: '', botName: '', connected: false, healthKind: 'offline' },
  { channel: 'qq', botId: 'q1', workspace: W_A, botName: '小帅', connected: true, healthKind: 'online' },
  { channel: 'feishu', botId: 'f2', workspace: W_B, botName: '阿梨', connected: true, healthKind: 'warn' },
];
const byId = (id: string) => bots.find((b) => b.botId === id);

test('未绑定 Bot 放到分组 → 直绑', () => {
  assert.deepEqual(model.resolveDrop(byId('f1'), { kind: 'workspace', workspace: W_B }), { kind: 'bind', botId: 'f1', to: W_B });
});

test('已属 A 的 Bot 放到 B → 二次确认换绑', () => {
  assert.deepEqual(model.resolveDrop(byId('q1'), { kind: 'workspace', workspace: W_B }), { kind: 'confirm-move', botId: 'q1', from: W_A, to: W_B });
});

test('放到空白处 → 拒绝且关系不变', () => {
  assert.deepEqual(model.resolveDrop(byId('f1'), { kind: 'empty' }), { kind: 'reject', reason: 'empty' });
  assert.deepEqual(model.resolveDrop(byId('q1'), { kind: 'empty' }), { kind: 'reject', reason: 'empty' });
});

test('放回自己所在分组 → 无操作', () => {
  assert.deepEqual(model.resolveDrop(byId('q1'), { kind: 'workspace', workspace: W_A }), { kind: 'noop', botId: 'q1' });
});

test('撤销窗口为 5 秒（走查 verdict）', () => {
  assert.equal(model.UNDO_WINDOW_MS, 5000);
});

test('撤销口径：换绑可撤销（回到 from），新绑无无损落点（上游要求非空路径）', () => {
  assert.equal(model.undoTarget('D:\\\\agents\\\\xiaoshuai'), 'D:\\\\agents\\\\xiaoshuai');
  assert.equal(model.undoTarget(''), null);
});

test('面板分组：未分配置顶（无则省略）+ 按归属聚合保序', () => {
  const full = model.boardGroups(bots);
  assert.deepEqual(full.unbound.map((b: any) => b.botId), ['f1']);
  assert.deepEqual(full.groups.map((g: any) => g.workspace), [W_A, W_B]);
  assert.equal(full.groups[0].name, 'xiaoshuai');
  assert.deepEqual(full.groups[0].bots.map((b: any) => b.botId), ['q1']);
  const none = model.boardGroups(bots.map((b) => ({ ...b, workspace: b.workspace || W_A })));
  assert.deepEqual(none.unbound, []);
  assert.deepEqual(none.groups.map((g: any) => g.workspace), [W_A, W_B]);
});

test('家单：有人家首见序 + 无人之家追尾去重', () => {
  assert.deepEqual(model.homeList(bots, []), [W_A, W_B]);
  assert.deepEqual(model.homeList(bots, [W_B, 'D:\\agents\\empty', W_A, '']), [W_A, W_B, 'D:\\agents\\empty']);
  assert.deepEqual(model.homeList([], ['D:\\agents\\empty']), ['D:\\agents\\empty']);
});

test('门牌：设置中文名优先，头像字与色板稳定', () => {
  const p = model.homePlate(W_A, { names: { xiaoshuai: '小帅2' } });
  assert.equal(p.name, '小帅2');
  assert.equal(p.sub, 'xiaoshuai');
  assert.equal(p.initial, '小');
  assert.ok(p.color >= 0 && p.color <= 7);
  assert.equal(model.homePlate(W_A, { names: { xiaoshuai: '小帅2' } }).color, p.color);
  const q = model.homePlate(W_B, { names: {} });
  assert.equal(q.name, 'Ali');
  assert.equal(q.sub, '');
});

test('manifest 注册：workspace-rail 槽位 + 进 FEATURES', () => {
  assert.equal(manifest.id, 'e2-adopt');
  assert.deepEqual(manifest.slots.map((s: any) => s.target), ['workspace-rail']);
  assert.ok(registry.FEATURES.some((f: any) => f.id === 'e2-adopt'));
});

test('样式命名空间 e2- 且不占用 .af- 私有约定', () => {
  assert.ok(String(styles.CSS).includes('.e2-'));
  assert.ok(!String(styles.CSS).includes('.af-'));
  assert.ok(String(styles.CSS).includes('z-index:9000'), '面板压过宿主 chrome');
  assert.ok(String(styles.CSS).includes('z-index:9300'), '确认框在最顶');
  assert.ok(String(styles.CSS).includes('.e2-tape{') && String(styles.CSS).includes('text-overflow:ellipsis'), '门牌不出框');
  assert.ok(String(styles.CSS).includes('grid-template-columns:repeat(auto-fit,minmax(215px,1fr))'), 'H 定稿网格');
  assert.ok(String(styles.CSS).includes('transform:rotate(-2deg)'), '胶带歪斜');
  assert.ok(String(styles.CSS).includes('outline-offset:4px'), '落点描边');
  assert.ok(String(styles.CSS).includes('#d9cfbd'), '暖纸底');
  assert.ok(!String(styles.CSS).includes('fit-content'), '内容定宽下线');
  assert.ok(String(styles.CSS).includes('.e2-sec-new{cursor:pointer;display:grid'), '巷子口卡片流（门牌描述通栏，照片多列）');
  assert.ok(!String(styles.CSS).includes('prefers-color-scheme'), '深浅跟宿主牌子，不问系统');
  assert.ok(String(styles.CSS).includes('body[data-ds-dark-theme]'), '深色挂钩宿主');
  assert.ok(String(styles.CSS).includes('Microsoft YaHei'), '中文字体备胎');
  assert.ok(String(styles.CSS).includes('color-mix(in srgb, var(--dsw-alias-bg-base'), '深色纸底跟宿主走（方案三）');
  assert.ok(String(styles.CSS).includes('.e2-sec-empty'), '空家有关灯样式');
  assert.ok(String(styles.CSS).includes('radial-gradient(100% 90% at 50% 0%'), '照片卡顶部晕带');
  assert.ok(String(styles.CSS).includes('.e2-row::before'), '纸面高光线');
  assert.ok(String(styles.CSS).includes('nth-child(3n)'), '胶带角度不全一个样');
  assert.ok(!String(styles.CSS).includes('repeating-linear-gradient'), '墙走了（巷子只留地面+灯）');
  assert.ok(String(styles.CSS).includes('radial-gradient(circle at 8%'), '巷子口路灯光池');
  assert.ok(String(styles.CSS).includes('inset 0 1px 0'), '家里开灯（内嵌灯照）');
  assert.ok(String(styles.CSS).includes('radial-gradient(140% 42%'), '面板天光/夜光');
  assert.ok(String(styles.CSS).includes('#f7eed6'), '白天有朝阳（天光做实）');
  assert.ok(String(styles.CSS).includes('inset 0 1px 0 rgba(255,255,255'), '白天有人家见光（与黑夜开灯镜像）');
  assert.ok(String(styles.CSS).includes('rgba(6,8,16'), '黑夜有夜空');
  assert.ok(String(styles.CSS).includes('at 50% 108%'), '黑夜屋里有灯火');
  assert.ok(String(styles.CSS).includes('255,251,238'), '巷子口白天铺暖地');
  assert.ok(String(styles.CSS).includes('at 50% 45%'), '巷子口黑夜整体提亮（不如家里亮，但亮）');
  assert.ok(String(styles.CSS).split('\n').every((ln: string) => ((ln.match(/\{/g) || []).length === (ln.match(/\}/g) || []).length)), '每行花括号配平（失衡会吞掉后面的规则）');
});

test('视图暴露挂载入口', () => {
  assert.equal(typeof view.mountE2Adopt, 'function');
});

/* ---- E2 面板视图分支：最小 DOM 桩（只断言外部行为）---- */
const MIME = 'application/x-e2-adopt-bot';
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]';
const e2Nodes: any[] = [];
let e2Groups: any[] = [];
const docListeners: Record<string, any[]> = {};
const e2StubNode: any = (tag: string) => {
  const n: any = {
    nodeType: 1, tagName: String(tag).toUpperCase(), children: [] as any[],
    parentNode: null as any, parentElement: null as any,
    style: { setProperty(k: string, v: string) { (this as any)[k] = String(v); } } as Record<string, string>, dataset: {} as Record<string, string>,
    attrs: {} as Record<string, string>, listeners: {} as Record<string, any[]>, _text: '',
    classList: { add(...cs: string[]) { for (const c of cs) n._cls.add(c); n.attrs.class = [...n._cls].join(' '); }, remove(...cs: string[]) { for (const c of cs) n._cls.delete(c); n.attrs.class = [...n._cls].join(' '); }, contains(c: string) { return n._cls.has(c); } },
    _cls: new Set<string>(),
    get firstChild() { return n.children[0] ?? null; },
    get textContent(): string { return n._text + n.children.map((c: any) => (c.nodeType === 3 ? c.text : (typeof c.textContent === 'string' ? c.textContent : ''))).join(''); },
    set textContent(v: string) { n._text = String(v); },
    setAttribute(k: string, v: string) { n.attrs[k] = String(v); if (k === 'class') n._cls = new Set(String(v).split(' ').filter(Boolean)); },
    getAttribute(k: string) { return n.attrs[k] ?? null; },
    hasAttribute(k: string) { return Object.prototype.hasOwnProperty.call(n.attrs, k); },
    removeAttribute(k: string) { delete n.attrs[k]; },
    appendChild(c: any) { c.parentNode = n; c.parentElement = n; n.children.push(c); return c; },
    remove() { try { n.parentNode?.removeChild(n); } catch { /* ignore */ } },
    removeChild(c: any) { n.children = n.children.filter((x: any) => x !== c); c.parentNode = null; c.parentElement = null; return c; },
    insertBefore(c: any, ref: any) {
      if (c.parentNode && c.parentNode !== n && typeof c.parentNode.removeChild === 'function') c.parentNode.removeChild(c);
      n.children = n.children.filter((x: any) => x !== c);
      const i = ref ? n.children.indexOf(ref) : -1;
      if (i >= 0) n.children.splice(i, 0, c); else n.children.unshift(c);
      c.parentNode = n; c.parentElement = n; return c;
    },
    replaceChildren() { for (const c of [...n.children]) n.removeChild(c); },
    cloneNode(deep: boolean) {
      const c: any = e2StubNode(n.tagName.toLowerCase());
      c.attrs = { ...n.attrs };
      c._cls = new Set(n._cls);
      c._text = n._text;
      for (const k of Object.keys(n.style ?? {})) { try { c.style[k] = (n.style as any)[k]; } catch { /* ignore */ } }
      if (deep) for (const ch of n.children ?? []) {
        if (ch.nodeType === 3) c.appendChild({ nodeType: 3, text: ch.text, parentNode: null });
        else if (typeof ch.cloneNode === 'function') c.appendChild(ch.cloneNode(true));
      }
      return c;
    },
    closest(sel: string) {
      if (sel.startsWith('.') && String(n.attrs?.class ?? '').split(' ').includes(sel.slice(1))) return n;
      const p = n.parentElement;
      return p && typeof p.closest === 'function' ? p.closest(sel) : null;
    },
    querySelector(sel: string) {
      const all = n.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll(sel: string) {
      const out: any[] = [];
      const match = (c: any): boolean => {
        if (sel === 'button') return c.tagName === 'BUTTON';
        if (sel === '[role="treeitem"]') return c.attrs?.role === 'treeitem';
        if (sel.startsWith('.')) return String(c.attrs?.class ?? '').split(' ').includes(sel.slice(1));
        return false;
      };
      const walk = (x: any) => { for (const c of x.children ?? []) { if (match(c)) out.push(c); walk(c); } };
      walk(n);
      return out;
    },
    contains(c: any) { let found = false; const walk = (x: any) => { for (const k of x.children ?? []) { if (k === c) found = true; walk(k); } }; walk(n); return found; },
    addEventListener(t: string, fn: any) { (n.listeners[t] || (n.listeners[t] = [])).push(fn); },
    removeEventListener(t: string, fn: any) { n.listeners[t] = (n.listeners[t] ?? []).filter((f: any) => f !== fn); },
  };
  Object.defineProperty(n, 'className', { get: () => n.attrs.class ?? '', set: (v: string) => { n.attrs.class = String(v); n._cls = new Set(String(v).split(' ').filter(Boolean)); } });
  e2Nodes.push(n);
  return n;
};
const e2Doc: any = {
  createElement: (t: string) => e2StubNode(t),
  createElementNS: (_ns: string, t: string) => e2StubNode(t),
  createTextNode: (t: string) => ({ nodeType: 3, text: String(t), parentNode: null }),
  body: null as any,
  addEventListener(t: string, fn: any) { (docListeners[t] || (docListeners[t] = [])).push(fn); },
  removeEventListener(t: string, fn: any) { docListeners[t] = (docListeners[t] ?? []).filter((f: any) => f !== fn); },
  querySelectorAll(sel: string) {
    if (sel === GROUP_SEL) return e2Groups;
    const parts = sel.split(',').map((s: string) => s.trim()).filter(Boolean);
    return e2Nodes.filter((x) => !x.parentNode && parts.some((p: string) => p.startsWith('.') && String(x.attrs?.class ?? '').split(' ').includes(p.slice(1))));
  },
};
e2Doc.body = e2StubNode('body');
(globalThis as any).document = e2Doc;
(globalThis as any).window = {};
(globalThis as any).requestAnimationFrame = () => 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let e2Emit: ((snap: any) => void) | null = null;
let e2RpcCalls: any[] = [];
let e2RefreshCalls = 0;
let e2WsItems: any[] = [];
let e2Meta: any = { names: { xiaoshuai: '小帅2', ali: '阿梨' }, avatars: {} };
let e2Unmount: (() => void) | null = null;
let nonce = 0;
let e2Header: any = null;
const stageBots = () => {
  nonce++;
  const list = bots.map((b) => ({ ...b }));
  list.push({ channel: 'wechat', botId: 'w' + nonce, workspace: '', botName: '', connected: false });
  return list;
};
const mountStage = (rpc: any) => {
  try { e2Unmount?.(); } catch { /* ignore */ }
  e2Nodes.length = 0;
  e2Doc.body = e2StubNode('body');
  for (const k of Object.keys(docListeners)) delete docListeners[k];
  e2RpcCalls = [];
  e2RefreshCalls = 0;
  e2WsItems = [];
  e2Groups = [];
  const page = e2StubNode('div');
  e2Header = e2StubNode('div');
  e2Header.appendChild(e2StubNode('button'));
  page.appendChild(e2Header);
  const container = e2StubNode('div');
  const section = e2StubNode('section');
  container.appendChild(section);
  page.appendChild(container);
  const row = e2StubNode('div');
  row.setAttribute('role', 'treeitem');
  row.textContent = 'xiaoshuai';
  section.appendChild(row);
  e2Groups.push(row);
  const ctx: any = {
    rpc,
    subscribe: (fn: any) => { e2Emit = fn; return () => { e2Emit = null; }; },
    refresh: async () => { e2RefreshCalls++; },
    meta: { loadMeta: async () => e2Meta }, slots: {},
    get: (name: string) => (name === 'workspaces' ? { list: { getSnapshot: () => ({ items: e2WsItems }) } } : undefined),
  };
  e2Unmount = view.mountE2Adopt(ctx);
  return {};
};
const okRpc = async (ch: string, ep: string, payload: any) => { e2RpcCalls.push({ ch, ep, payload }); return {}; };
const lastDoc = (t: string) => (docListeners[t] ?? [])[(docListeners[t] ?? []).length - 1];
const mkTransfer = (desc: any) => ({ types: [MIME], getData: () => JSON.stringify(desc), setData() {}, effectAllowed: '', dropEffect: '' });
const fireDrop = (target: any, desc: any) => lastDoc('drop')({ target, preventDefault() {}, dataTransfer: mkTransfer(desc) });
const findClass = (root: any, cls: string): any[] => {
  const out: any[] = [];
  const walk = (x: any) => { for (const c of x.children ?? []) { if (String(c.attrs?.class ?? '').split(' ').includes(cls)) out.push(c); walk(c); } };
  walk(root);
  return out;
};
const findTextBtn = (root: any, text: string): any => {
  let hit: any = null;
  const walk = (x: any) => {
    if (hit || !x || typeof x !== 'object') return;
    if (x.tagName === 'BUTTON' && (x.children ?? []).some((c: any) => c.nodeType === 3 && String(c.text).includes(text))) { hit = x; return; }
    for (const c of x.children ?? []) walk(c);
  };
  walk(root);
  return hit;
};
const bodyText = () => e2Doc.body.textContent ?? '';
const openPanel = () => {
  const btn = findClass(e2Header, 'e2-entry')[0];
  assert.ok(btn, '头栏应有串门入口按钮');
  btn.listeners.click[0]();
  const overlay = e2Doc.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('e2-overlay'));
  assert.ok(overlay, '面板应打开');
  return overlay;
};
const panelSections = () => {
  const overlay = e2Doc.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('e2-overlay'));
  return findClass(overlay, 'e2-sec');
};
const sectionRows = (sec: any) => findClass(sec, 'e2-row');

test('view：头栏安装串门入口，点击开面板（家 + 巷子口）', async () => {
  mountStage(okRpc);
  e2Emit!({ bots: stageBots() });
  await sleep(10);
  const btn = findClass(e2Header, 'e2-entry')[0];
  assert.ok(String(btn.attrs?.title ?? '').includes('串门'));
  assert.ok(String(btn.innerHTML ?? '').includes('<svg'));
  openPanel();
  const secs = panelSections();
  assert.equal(secs.length, 3);
  assert.equal(sectionRows(secs[0]).length, 1);
  assert.equal(sectionRows(secs[1]).length, 1);
  const plaza = secs[2];
  assert.equal(plaza.getAttribute('data-e2-plaza'), '1');
  assert.equal(sectionRows(plaza).length, 2);
  assert.ok(bodyText().includes('小帅2'), '门牌用设置里的中文名');
  assert.ok(!bodyText().includes('联系方式'), '计数按机器人，不按联系方式');
  assert.ok(!bodyText().includes('个机器人'), '计数文案下线');
  assert.ok(bodyText().includes('永远在线，除了睡着的时候'), 'mock 小传');
  const caps = findClass(e2Doc.body, 'e2-cap');
  assert.ok(caps.some((c: any) => String(c.textContent).includes('QQ')), '成员小传含渠道');
  const tapes = findClass(e2Doc.body, 'e2-tape');
  assert.ok(tapes.some((t: any) => t.textContent === '小帅2'), '胶带门牌中文名');
  const dots = findClass(e2Doc.body, 'e2-hdot');
  assert.ok(dots.some((d: any) => String(d.attrs?.class ?? '').split(' ').includes('e2-h-online')), '在线成员亮绿灯');
});

test('view：面板内组间拖放 → 确认后换绑 + 撤销滚回', async () => {
  mountStage(okRpc);
  e2Emit!({ bots: stageBots() });
  openPanel();
  const secs = panelSections();
  const secB = secs[1];
  const rowQ = sectionRows(secs[0]).find((r: any) => r.getAttribute('data-e2-bot') === 'q1');
  assert.ok(rowQ, 'A 组应有 q1');
  fireDrop(secB, { botId: 'q1', channel: 'qq' });
  await sleep(20);
  assert.equal(e2RpcCalls.length, 0);
  assert.ok(bodyText().includes('小帅 · QQ'), '弹窗标题有人名有渠道');
  assert.ok(bodyText().includes('小帅2'), '弹窗有原家门牌名');
  assert.ok(bodyText().includes('D:\\agents\\xiaoshuai'), '弹窗有原家路径');
  findTextBtn(e2Doc.body, '确认换绑').listeners.click[0]();
  await sleep(20);
  assert.deepEqual(e2RpcCalls[0]?.payload, { botId: 'q1', workspace: W_B });
  const undo = e2Doc.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('e2-undo'));
  assert.ok(undo, '换绑应开撤销窗');
  findTextBtn(undo, '撤销').listeners.click[0]();
  await sleep(20);
  assert.deepEqual(e2RpcCalls[1]?.payload, { botId: 'q1', workspace: W_A });
});

test('view：巷子口歇脚——有家暂存不写，关面板送回', async () => {
  mountStage(okRpc);
  e2Emit!({ bots: stageBots() });
  openPanel();
  const plaza = panelSections().find((s: any) => s.getAttribute('data-e2-plaza') === '1');
  assert.ok(plaza, '应有巷子口公共区');
  assert.ok(findClass(e2Doc.body, 'e2-tape').some((t: any) => t.textContent === '巷子口'), '胶带门牌巷子口');
  fireDrop(plaza, { botId: 'q1', channel: 'qq' });
  await sleep(10);
  assert.equal(e2RpcCalls.length, 0, '歇脚不写服务器');
  const plaza2 = panelSections().find((s: any) => s.getAttribute('data-e2-plaza') === '1');
  const names = sectionRows(plaza2).map((r: any) => findClass(r, 'e2-who')[0]?.textContent);
  assert.ok(names.includes('小帅'), '小帅去巷子口歇着');
  assert.ok(bodyText().includes('歇脚中'), '歇脚徽章');
  assert.ok(bodyText().includes('拖进一家才算搬完'), '歇脚提示');
  const holders = panelSections().filter((s: any) => sectionRows(s).some((r: any) => r.getAttribute('data-e2-bot') === 'q1'));
  assert.equal(holders.length, 1, '小帅只在 computed 一个区');
  assert.equal(holders[0].getAttribute('data-e2-plaza'), '1', '且那个区就是巷子口');
  const secB2 = panelSections().find((s: any) => s.getAttribute('data-e2-ws') === W_B);
  fireDrop(secB2, { botId: 'q1', channel: 'qq' });
  await sleep(10);
  assert.ok(findTextBtn(e2Doc.body, '确认换绑'), '歇脚后进他家要敲门');
  findClass(e2Doc.body, 'e2-x')[0].listeners.click[0]();
  await sleep(10);
  assert.ok(bodyText().includes('已送回原来的家'), '关面板点名送回');
  assert.equal(e2RpcCalls.length, 0, '全程没写服务器');
  openPanel();
  assert.ok(sectionRows(panelSections()[0]).some((r: any) => r.getAttribute('data-e2-bot') === 'q1'), '重进面板小帅回 A 家');
});

test('view：巷子口上悬停 → 允许放下（禁行标是 bug）', async () => {
  mountStage(okRpc);
  e2Emit!({ bots: stageBots() });
  openPanel();
  const plaza = panelSections().find((s: any) => s.getAttribute('data-e2-plaza') === '1');
  const dt: any = { types: [MIME], dropEffect: '' };
  for (const h of docListeners['dragover'] ?? []) h({ target: plaza, clientX: 100, preventDefault() {}, dataTransfer: dt });
  assert.equal(dt.dropEffect, 'move', '巷子口悬停必须 move，不能 none');
  assert.ok(plaza.classList.contains('e2-drop-ok'), '巷子口悬停高亮');
});

test('view：全已分配 → 无未分配组；组内放下 → 不写', async () => {
  mountStage(okRpc);
  e2Emit!({ bots: bots.map((b) => ({ ...b, workspace: b.workspace || W_A })) });
  openPanel();
  const secs = panelSections();
  assert.equal(secs.length, 3);
  const secA = secs[0];
  const rowQ = sectionRows(secA).find((r: any) => r.getAttribute('data-e2-bot') === 'q1');
  fireDrop(secA, { botId: 'q1', channel: 'qq' });
  await sleep(10);
  void rowQ;
  assert.equal(e2RpcCalls.length, 0);
});

test('view：无人之家上墙 + 拖入直接绑定', async () => {
  mountStage(okRpc);
  e2WsItems = [{ workspaceId: 'e', path: 'D:\\agents\\empty' }];
  e2Emit!({ bots: stageBots() });
  openPanel();
  const empty = panelSections().find((s: any) => s.getAttribute('data-e2-ws') === 'D:\\agents\\empty');
  assert.ok(empty, '无人之家上墙');
  assert.ok(String(empty.attrs?.class ?? '').split(' ').includes('e2-sec-empty'), '空家挂关灯 class');
  const plaza0 = panelSections().find((s: any) => s.getAttribute('data-e2-plaza') === '1');
  assert.ok(panelSections().indexOf(plaza0) < panelSections().indexOf(empty), '巷子口是分界线（空家沉底）');
  assert.equal(sectionRows(empty).length, 0, '空家没照片');
  assert.ok(bodyText().includes('空无一人'), '空家提示');
  fireDrop(empty, { botId: 'f1', channel: 'feishu' });
  await sleep(20);
  assert.deepEqual(e2RpcCalls[0]?.payload, { botId: 'f1', workspace: 'D:\\agents\\empty' });
  assert.ok(bodyText().includes('已绑定到'), '绑定落定提示');
});

test('view：面板空白处放下 → 拒绝且不写；拿起无放下 → 静默回原位', async () => {
  mountStage(okRpc);
  e2Emit!({ bots: stageBots() });
  openPanel();
  const overlay = e2Doc.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('e2-overlay'));
  fireDrop(overlay, { botId: 'f1', channel: 'feishu' });
  await sleep(10);
  assert.equal(e2RpcCalls.length, 0);
  assert.ok(bodyText().includes('空白处不可放'));
  const secs = panelSections();
  const rowF = sectionRows(secs[0])[0];
  lastDoc('dragstart')({ target: rowF, clientX: 500, dataTransfer: { setData() {}, effectAllowed: '' } });
  assert.ok(!rowF.classList.contains('e2-ph'), '分发内不动源节点（出生后置）');
  await sleep(10);
  assert.ok(rowF.classList.contains('e2-ph'), '分发后影子晚到');
  for (const h of docListeners['dragover'] ?? []) h({ target: rowF, clientX: 100, preventDefault() {}, dataTransfer: { types: ['application/x-e2-adopt-bot'] } });
  assert.ok(String(findClass(e2Doc.body, 'e2-ph')[0]?.style?.transform ?? '').includes('-4deg'), '往左拖影子向左倒');
  for (const h of docListeners['dragover'] ?? []) h({ target: rowF, clientX: 900, preventDefault() {}, dataTransfer: { types: ['application/x-e2-adopt-bot'] } });
  assert.ok(String(findClass(e2Doc.body, 'e2-ph')[0]?.style?.transform ?? '').includes('rotate(4deg)'), '往右拖影子向右倒');
  assert.equal(rowF.style.display ?? '', '', '原牌不藏源（display:none 会取消拖拽）');
  assert.equal(findClass(e2Doc.body, 'e2-ph').length, 1, '只留一块歪斜影子');
  const ph = findClass(e2Doc.body, 'e2-ph')[0];
  assert.ok(String(ph.textContent).includes('小帅'), '影子名字不少');
  assert.equal(findClass(ph, 'e2-hdot').length, 1, '影子健康灯不少');
  e2Emit!({ bots: [...stageBots(), { channel: 'qq', botId: 'x1', workspace: '', botName: '', connected: false, healthKind: 'offline' }] });
  await sleep(10);
  assert.equal(findClass(e2Doc.body, 'e2-ph').length, 1, '拖拽中快照不掀桌');
  assert.equal(sectionRows(panelSections()[0]).length, 1, '拖拽中 A 组不加塞，新机器人不插队');
  lastDoc('dragend')();
  await sleep(10);
  assert.equal(rowF.style.display ?? '', '', '取消后原牌回来');
  assert.equal(findClass(e2Doc.body, 'e2-ph').length, 0, '影子清理');
  assert.ok(!rowF.classList.contains('e2-dragging'), '放下/取消后 ghost 态清除');
  assert.ok(!bodyText().includes('已取消拖拽'), '取消静默回原位（点一下不骂一句）');
  assert.equal(sectionRows(panelSections()[2]).length, 3, '松手后巷子口补刷冻结期的新机器人');
  assert.ok(bodyText().includes('x1'), '冻结期到的新机器人松手后出现');
});

test('view：按住熔断重绘 + 内容不变跳过', async () => {
  mountStage(okRpc);
  const sent = stageBots();
  e2Emit!({ bots: sent });
  openPanel();
  await sleep(10);
  const row0 = sectionRows(panelSections()[0])[0];
  e2Emit!({ bots: sent.map((b) => ({ ...b })) });
  await sleep(10);
  assert.ok(sectionRows(panelSections()[0])[0] === row0, '空转快照不重建 DOM');
  lastDoc('pointerdown')({ target: row0 });
  e2Emit!({ bots: [...sent.map((b) => ({ ...b })), { channel: 'qq', botId: 'x9', workspace: '', botName: '', connected: false, healthKind: 'offline' }] });
  await sleep(10);
  assert.ok(sectionRows(panelSections()[0])[0] === row0, '按住时节点稳定（原生拖拽才有机会出生）');
  assert.ok(!bodyText().includes('x9'), '熔断期间不渲染');
  lastDoc('pointerup')({});
  await sleep(10);
  assert.ok(bodyText().includes('x9'), '松手后补刷');
});

test('view：撤销窗过期 → 落定提示且窗消失', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const timers: any[] = [];
  (globalThis as any).setTimeout = ((cb: any, ms: number) => { timers.push({ cb, ms }); return 0; }) as any;
  try {
    mountStage(okRpc);
    e2Emit!({ bots: stageBots() });
    openPanel();
    const secs = panelSections();
    fireDrop(secs[1], { botId: 'q1', channel: 'qq' });
    findTextBtn(e2Doc.body, '确认换绑').listeners.click[0]();
    await new Promise((r) => realSetTimeout(r, 20));
    const t = timers.filter((x) => x.ms === 5000).pop();
    assert.ok(t, '应有 5s 过期定时器');
    t.cb();
    assert.ok(bodyText().includes('撤销超时，绑定已生效'));
    assert.equal(e2Doc.body.children.filter((c: any) => String(c.attrs?.class ?? '').split(' ').includes('e2-undo')).length, 0);
  } finally {
    (globalThis as any).setTimeout = realSetTimeout;
  }
});
