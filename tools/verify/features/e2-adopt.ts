// E2 自验证（F0 每功能自验证）：拖拽领养纯逻辑 + 注册/样式断言（node --test，零第三方依赖）。
// 只测外部行为：给定绑定关系 + 放置目标 → 断言用户可见结论，不断言内部形状。
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
  join(CLIENT, 'ui', 'modal.ts'),
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
  { channel: 'feishu', botId: 'f1', workspace: '', botName: '', connected: false },
  { channel: 'qq', botId: 'q1', workspace: W_A, botName: '小帅', connected: true },
  { channel: 'feishu', botId: 'f2', workspace: W_B, botName: '阿梨', connected: true },
];
const byId = (id: string) => bots.find((b) => b.botId === id);

test('未绑定 Bot 放到工作区行 → 直绑', () => {
  assert.deepEqual(model.resolveDrop(byId('f1'), { kind: 'workspace', workspace: W_B }), { kind: 'bind', botId: 'f1', to: W_B });
});

test('已属 A 的 Bot 放到 B → 二次确认换绑', () => {
  assert.deepEqual(model.resolveDrop(byId('q1'), { kind: 'workspace', workspace: W_B }), { kind: 'confirm-move', botId: 'q1', from: W_A, to: W_B });
});

test('放到空白处 → 拒绝且关系不变', () => {
  assert.deepEqual(model.resolveDrop(byId('f1'), { kind: 'empty' }), { kind: 'reject', reason: 'empty' });
  assert.deepEqual(model.resolveDrop(byId('q1'), { kind: 'empty' }), { kind: 'reject', reason: 'empty' });
});

test('放回自己所在工作区 → 无操作', () => {
  assert.deepEqual(model.resolveDrop(byId('q1'), { kind: 'workspace', workspace: W_A }), { kind: 'noop', botId: 'q1' });
});

test('撤销窗口为 5 秒（走查 verdict）', () => {
  assert.equal(model.UNDO_WINDOW_MS, 5000);
});

test('撤销口径：换绑可撤销（回到 from），新绑无无损落点（上游要求非空路径）', () => {
  assert.equal(model.undoTarget('D:\\\\agents\\\\xiaoshuai'), 'D:\\\\agents\\\\xiaoshuai');
  assert.equal(model.undoTarget(''), null);
});

test('未绑定池只含未绑定 Bot', () => {
  assert.deepEqual(model.unboundBots(bots).map((b: any) => b.botId), ['f1']);
});

test('行文本映射到规范工作区路径（未知/歧义一律 null，调用方拒绝）', () => {
  assert.equal(model.resolveRowWorkspace('小帅', bots), W_A);
  assert.equal(model.resolveRowWorkspace(W_B, bots), W_B);
  assert.equal(model.resolveRowWorkspace('不存在的行', bots), null);
  const dup = [
    { channel: 'feishu', botId: 'a', workspace: 'D:\\x\\same', botName: '', connected: true },
    { channel: 'qq', botId: 'b', workspace: 'D:\\y\\same', botName: '', connected: true },
  ];
  assert.equal(model.resolveRowWorkspace('same', dup), null);
});

test('manifest 注册：workspace-rail 槽位 + 进 FEATURES', () => {
  assert.equal(manifest.id, 'e2-adopt');
  assert.deepEqual(manifest.slots.map((s: any) => s.target), ['workspace-rail']);
  assert.ok(registry.FEATURES.some((f: any) => f.id === 'e2-adopt'));
});

test('样式命名空间 e2- 且不占用 .af- 私有约定', () => {
  assert.ok(String(styles.CSS).includes('.e2-'));
  assert.ok(!String(styles.CSS).includes('.af-'));
});

test('视图暴露挂载入口', () => {
  assert.equal(typeof view.mountE2Adopt, 'function');
});

/* ---- E2 视图分支：最小 DOM 桩（仿 left-filter 范例，只断言外部行为）---- */
const MIME = 'application/x-e2-adopt-bot';
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]';
const e2Nodes: any[] = [];
let e2Groups: any[] = [];
const docListeners: Record<string, any[]> = {};
const e2StubNode: any = (tag: string) => {
  const n: any = {
    nodeType: 1, tagName: String(tag).toUpperCase(), children: [] as any[],
    parentNode: null as any, parentElement: null as any,
    style: {} as Record<string, string>, dataset: {} as Record<string, string>,
    attrs: {} as Record<string, string>, listeners: {} as Record<string, any[]>, _text: '',
    classList: { add(...cs: string[]) { for (const c of cs) n._cls.add(c); }, remove(...cs: string[]) { for (const c of cs) n._cls.delete(c); }, contains(c: string) { return n._cls.has(c); } },
    _cls: new Set<string>(),
    get firstChild() { return n.children[0] ?? null; },
    get textContent(): string { return n._text + n.children.map((c: any) => (c.nodeType === 3 ? c.text : (typeof c.textContent === 'string' ? c.textContent : ''))).join(''); },
    set textContent(v: string) { n._text = String(v); },
    setAttribute(k: string, v: string) { n.attrs[k] = String(v); },
    getAttribute(k: string) { return n.attrs[k] ?? null; },
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
    closest(sel: string) {
      if (sel === GROUP_SEL && n.attrs['data-e2-row'] === '1') return n;
      if (sel.startsWith('.') && String(n.attrs?.class ?? '').split(' ').includes(sel.slice(1))) return n;
      const p = n.parentElement;
      return p && typeof p.closest === 'function' ? p.closest(sel) : null;
    },
    querySelectorAll(sel: string) {
      const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
      const out: any[] = [];
      const walk = (x: any) => {
        for (const c of x.children ?? []) {
          for (const p of parts) {
            if (p.startsWith('.') && String(c.attrs?.class ?? '').split(' ').includes(p.slice(1))) { out.push(c); break; }
          }
          walk(c);
        }
      };
      walk(n);
      return out;
    },
    addEventListener(t: string, fn: any) { (n.listeners[t] || (n.listeners[t] = [])).push(fn); },
    removeEventListener(t: string, fn: any) { n.listeners[t] = (n.listeners[t] ?? []).filter((f: any) => f !== fn); },
  };
  Object.defineProperty(n, 'className', { get: () => n.attrs.class ?? '', set: (v: string) => { n.attrs.class = String(v); } });
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
let e2Unmount: (() => void) | null = null;
let nonce = 0;
const stageBots = (extra = true) => {
  nonce++;
  const list = bots.map((b) => ({ ...b }));
  if (extra) list.push({ channel: 'wechat', botId: 'w' + nonce, workspace: '', botName: '', connected: false });
  return list;
};
const mountStage = (rpc: any) => {
  try { e2Unmount?.(); } catch { /* ignore */ }
  e2Nodes.length = 0;
  e2Doc.body = e2StubNode('body');
  for (const k of Object.keys(docListeners)) delete docListeners[k];
  e2RpcCalls = [];
  e2RefreshCalls = 0;
  e2Groups = [];
  const container = e2StubNode('div');
  const section = e2StubNode('section');
  container.appendChild(section);
  const mkrow = (text: string) => {
    const r = e2StubNode('div');
    r.setAttribute('data-e2-row', '1');
    r.textContent = text;
    section.appendChild(r);
    e2Groups.push(r);
    return r;
  };
  const ctx: any = {
    rpc,
    subscribe: (fn: any) => { e2Emit = fn; return () => { e2Emit = null; }; },
    refresh: async () => { e2RefreshCalls++; },
    meta: {}, slots: {}, get: () => undefined,
  };
  e2Unmount = view.mountE2Adopt(ctx);
  return { mkrow };
};
const okRpc = async (ch: string, ep: string, payload: any) => { e2RpcCalls.push({ ch, ep, payload }); return {}; };
const lastDoc = (t: string) => (docListeners[t] ?? [])[(docListeners[t] ?? []).length - 1];
const mkTransfer = (desc: any) => ({ types: [MIME], getData: () => JSON.stringify(desc), setData() {}, effectAllowed: '', dropEffect: '' });
const fireDrop = (target: any, desc: any) => lastDoc('drop')({ target, preventDefault() {}, dataTransfer: mkTransfer(desc) });
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
const poolChips = () => {
  const pools = e2Nodes.filter((x) => String(x.attrs?.class ?? '').split(' ').includes('e2-pool'));
  const out: any[] = [];
  for (const p of pools) for (const c of p.children ?? []) if (String(c.attrs?.class ?? '').split(' ').includes('e2-chip')) out.push(c);
  return out;
};

test('view：空池整条隐藏、不占位', () => {
  const { mkrow } = mountStage(okRpc);
  mkrow(W_B);
  e2Emit!({ bots: bots.map((b) => ({ ...b, workspace: b.workspace || W_A })) });
  const pools = e2Nodes.filter((x) => String(x.attrs?.class ?? '').split(' ').includes('e2-pool'));
  assert.equal(pools.length, 0);
  assert.equal(poolChips().length, 0);
});

test('view：未绑定条列出未绑定 Bot（rpc 可用时可拖）', () => {
  const { mkrow } = mountStage(okRpc);
  mkrow(W_B);
  e2Emit!({ bots: stageBots() });
  const chips = poolChips();
  assert.equal(chips.length, 2);
  assert.equal(chips[0].getAttribute('draggable'), 'true');
  assert.ok(String(chips[0].textContent).includes('f1'));
  const pool = e2Nodes.filter((x) => String(x.attrs?.class ?? '').split(' ').includes('e2-pool')).pop();
  assert.ok(String(pool.children[0]?.textContent).includes('未绑定 2 个'));
});

test('view：rpc 不可用时池不可拖', () => {
  const { mkrow } = mountStage(null);
  mkrow(W_B);
  e2Emit!({ bots: stageBots() });
  const chips = poolChips();
  assert.ok(chips.length >= 1);
  assert.ok(chips.every((c: any) => c.getAttribute('draggable') === 'false'));
});

test('view：未绑定 drop 到行 → 写 workspace.set + 刷新', async () => {
  const { mkrow } = mountStage(okRpc);
  const row = mkrow(W_B);
  e2Emit!({ bots: stageBots() });
  fireDrop(row, { botId: 'f1', channel: 'feishu' });
  await sleep(20);
  assert.deepEqual(e2RpcCalls[0], { ch: '/feishu', ep: 'bot.workspace.set', payload: { botId: 'f1', workspace: W_B } });
  assert.equal(e2RefreshCalls, 1);
});

test('view：已属 A drop 到 B → 弹确认、不先写；确认后换绑 + 撤销窗；撤销滚回 A', async () => {
  const { mkrow } = mountStage(okRpc);
  mkrow(W_B);
  e2Emit!({ bots: stageBots() });
  const rowB = e2Groups[e2Groups.length - 1];
  fireDrop(rowB, { botId: 'q1', channel: 'qq' });
  await sleep(20);
  assert.equal(e2RpcCalls.length, 0);
  const overlay = e2Doc.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('af-overlay'));
  assert.ok(overlay, '确认弹窗应打开');
  findTextBtn(overlay, '确认换绑').listeners.click[0]();
  await sleep(20);
  assert.deepEqual(e2RpcCalls[0]?.payload, { botId: 'q1', workspace: W_B });
  const undo = e2Doc.body.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('e2-undo'));
  assert.ok(undo, '换绑应开撤销窗');
  findTextBtn(undo, '撤销').listeners.click[0]();
  await sleep(20);
  assert.deepEqual(e2RpcCalls[1]?.payload, { botId: 'q1', workspace: W_A });
});

test('view：放回原地 / 空白处 → 不写', async () => {
  const { mkrow } = mountStage(okRpc);
  const rowA = mkrow(W_A);
  e2Emit!({ bots: stageBots() });
  fireDrop(rowA, { botId: 'q1', channel: 'qq' });
  await sleep(10);
  const stray = e2StubNode('div');
  fireDrop(stray, { botId: 'f1', channel: 'feishu' });
  await sleep(10);
  assert.equal(e2RpcCalls.length, 0);
});

test('view：撤销窗过期 → 落定提示且窗消失（G1）', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const timers: any[] = [];
  (globalThis as any).setTimeout = ((cb: any, ms: number) => { timers.push({ cb, ms }); return 0; }) as any;
  try {
    const { mkrow } = mountStage(okRpc);
    mkrow(W_B);
    e2Emit!({ bots: stageBots() });
    const rowB = e2Groups[e2Groups.length - 1];
    fireDrop(rowB, { botId: 'q1', channel: 'qq' });
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

test('view：无法识别的行 → 拒绝且不写（M2）', async () => {
  const { mkrow } = mountStage(okRpc);
  const row = mkrow('不存在的行');
  e2Emit!({ bots: stageBots() });
  fireDrop(row, { botId: 'f1', channel: 'feishu' });
  await sleep(10);
  assert.equal(e2RpcCalls.length, 0);
  assert.ok(bodyText().includes('没认出这个工作区'));
});

test('view：有拿起无放下 → 取消提示且不写（G3）', async () => {
  const { mkrow } = mountStage(okRpc);
  mkrow(W_B);
  e2Emit!({ bots: stageBots() });
  const chip = poolChips()[0];
  lastDoc('dragstart')({ target: chip, dataTransfer: { setData() {}, effectAllowed: '' } });
  lastDoc('dragend')();
  await sleep(10);
  assert.equal(e2RpcCalls.length, 0);
  assert.ok(bodyText().includes('已取消拖拽'));
});
