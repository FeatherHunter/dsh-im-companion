// T8-4 (#172) 钢线：助理行第 4 图标（编辑简介与人物设定）＋ 编辑资料弹窗四分支 ＋ 家页第三行简介。
// 手法与 home-steel 同源但**不 import 它**（那会重复注册 61 个用例）：DOM 桩 + tsc 现转译面板真渲染，
// 断言点的是点出来的真 DOM、假 ops 收到的载荷与开出来的弹层状态，不碰私有函数名。
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, El } from '../dom-shim.ts';

const REPO = process.cwd();
const CLIENT = join(REPO, 'src', 'client');
const COMP = join(CLIENT, 'components');

/* —— 面板真渲染链：与 home-steel 同一个 tsc 口径（rootDir 钉死 src，产物落 client/components/） —— */
const tmpBox = mkdtempSync(join(tmpdir(), 'home-assistant-profile-box-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(COMP, 'panel-body.ts'),
    join(COMP, 'home-refresh.ts'),
    '--ignoreConfig',
    '--rootDir', join(REPO, 'src'),
    '--outDir', tmpBox, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('BOX-TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmpBox, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }

/* —— DOM 桩：window 做成**真事件总线**（#172 的 OPEN_ASSISTANT_PROFILE_EDIT_EVENT 派发/退订要能被点到） —— */
const domDoc: any = createDocument();
const bus = new Map<string, Set<Function>>();
const domWin: any = {
  document: domDoc, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'home-assistant-profile' },
  innerWidth: 1024, innerHeight: 768,
  CustomEvent: class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail } },
  addEventListener: (t: string, fn: Function) => {
    const k = String(t); if (!bus.has(k)) bus.set(k, new Set()); bus.get(k)!.add(fn);
  },
  removeEventListener: (t: string, fn: Function) => { bus.get(String(t))?.delete(fn); },
  dispatchEvent: (ev: any) => { const set = bus.get(String(ev?.type)); if (set) for (const fn of [...set]) fn(ev); return true; },
};
domDoc.defaultView = domWin;
for (const n of ['HTMLElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLStyleElement', 'Node', 'Element']) domWin[n] = El;
(globalThis as any).window = domWin;
(globalThis as any).document = domDoc;
(globalThis as any).requestAnimationFrame = (fn: (t?: number) => void): number => setTimeout(() => fn(0), 0) as unknown as number;
try { (globalThis as any).localStorage = domWin.localStorage; } catch { /* read-only 忽略 */ }
/* 模块顶若自开轮询，真计时器会吊住事件循环 ⇒ 与 home-steel 同款：换成永不回火的假计时器。 */
(globalThis as any).setInterval = () => 0;

const boxReq = createRequire(join(tmpBox, 'run.cjs'));
const reqBox = (rel: string): any => {
  try { return boxReq('./client/components/' + rel); } catch { return boxReq('./components/' + rel); }
};
const bodyMod: any = reqBox('panel-body.js');
const popMod: any = reqBox('home-pop.js');
const actMod: any = reqBox('home-assistant-profile-act.js');
const cfgMod: any = (() => {
  try { return boxReq('./client/data/config.js'); } catch { return boxReq('./data/config.js'); }
})();

/* —— 夹具：与 home-steel 同形状（A() 默认 11 个键；#169 起可带 description/persona） —— */
const H = (o: any) => ({ id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting', name: '客厅', nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1, ...o });
const A = (o: any) => ({ id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小帅', nameSource: 'bot', avatar: null, avatarSource: 'default', createdAt: 1, boundAt: 1, ...o });
const W = (o: any) => ({ workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅', ...o });
const B = (o: any) => ({ channel: 'feishu', botId: 'b1', workspace: 'D:\\agents\\keting', botName: '小帅', ...o });

const WS = [W({}), W({ workspaceId: 'ws-2', path: 'D:\\agents\\shufang', title: '书房' })];
const HOMES = [H({}), H({ id: 'h2', workspaceId: 'ws-2', path: 'D:\\agents\\shufang', name: '书房基地', nameSource: 'user' })];
const BOTS = [B({ connected: true })];

/* —— DOM 读法（home-steel 同口径） —— */
const nodes = (root: any, out: any[] = []): any[] => {
  for (const c of root?.childNodes ?? []) if (c.nodeType === 1) { out.push(c); nodes(c, out); }
  return out;
};
const cls = (root: any, c: string): any[] => nodes(root).filter((e) => e.classList?.contains(c));
const one = (root: any, c: string): any => cls(root, c)[0] ?? null;
const byAttr = (root: any, k: string, v: string): any[] => nodes(root).filter((e) => e.getAttribute?.(k) === v);
const txt = (e: any): string => String(e?.textContent ?? '').replace(/\s+/g, ' ').trim();
const off = (e: any): boolean => e?.disabled === true || !!e?.hasAttribute?.('disabled');
const clickEl = (e: any): void => { e.dispatchEvent({ type: 'click' }); };
const popBtn = (pop: any, label: string): any => (pop ? cls(pop, 'hu-pbtn-s').find((b: any) => txt(b) === label) ?? null : null);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const flush = async (): Promise<void> => { await sleep(0); await sleep(0); };
const setVal = (el: any, v: string): void => { el.value = v; el.dispatchEvent({ type: 'input' }); };
/** 行内某个动作按钮（L2 助理行）：按行 data-id 收窄，再找 data-item-act。 */
const actBtn = (bodyEl: any, rowId: string, act: string): any => {
  const row = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === rowId);
  return row ? byAttr(row, 'data-item-act', act)[0] ?? null : null;
};
const gotoL2 = (bodyEl: any, homeId = 'h1'): void => {
  const row = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === homeId);
  assert.ok(row, 'L1 应有家行 ' + homeId);
  clickEl(row);
};

type OpsMode = 'ok' | 'fail' | 'hang';
function makeOps(state: any, mode: OpsMode, calls: any[], failMsg = '宿主拒绝：角色权限不足（测试原文）') {
  return {
    createHome: async () => {}, createAssistant: async () => {}, connect: () => {},
    createUnbound: async () => {}, bindAssistant: async () => {}, removeAssistant: async () => {},
    pickDirectory: async () => null, adoptDirectory: async () => null,
    updateHome: async () => true,
    updateAssistant: async (id: string, patch: any, quiet?: boolean, onError?: (m: string) => void) => {
      calls.push({ id, patch, quiet });
      if (mode === 'fail') { if (onError) onError(failMsg); return false; }
      if (mode === 'hang') return new Promise<boolean>(() => {});
      const row = state.assistants.find((a: any) => a.id === id);
      if (row) Object.assign(row, patch);
      return true;
    },
  };
}

function makeBox(o: { assistants?: any[]; mode?: OpsMode; failMsg?: string } = {}) {
  const calls: any[] = [];
  const state: any = {
    homes: HOMES, bots: BOTS, query: '', mode: 'agent', loading: false, failed: [], homesReady: true, volatile: false,
    assistants: o.assistants ?? [A({ description: '小帅简介', persona: '小帅人设' }), A({ id: 'a2', homeId: 'h1', channel: 'weixin', botId: null, status: 'unbound', name: '', nameSource: 'home' })],
  };
  const bodyEl = new El('div', domDoc);
  const handle = bodyMod.createPanelBody({
    state, bodyEl, titleMetaEl: new El('div', domDoc),
    getWorkspaces: () => WS,
    ops: makeOps(state, o.mode ?? 'ok', calls, o.failMsg),
    onRetry: () => {},
  });
  handle.render();
  return { bodyEl, handle, calls, state };
}

/* ① 入口：L2 助理行第 4 个图标，标题/无障碍名逐字，person 图标，顺序在头像之后。 */
test('#172 入口：L2 助理行第 4 个图标是「编辑简介与人物设定」', (t) => {
  const { bodyEl, handle } = makeBox();
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  const btn = actBtn(bodyEl, 'a1', 'profile-a');
  assert.ok(btn, '助理行应有 profile-a 图标');
  assert.equal(btn.getAttribute('aria-label'), '编辑简介与人物设定');
  assert.equal(btn.getAttribute('data-tip'), '编辑简介与人物设定');
  assert.ok(btn.classList.contains('hu-ract') && btn.classList.contains('icon'), '应是行内图标按钮');
  const svg = nodes(btn).find((e: any) => String(e.nodeName).toLowerCase() === 'svg');
  assert.equal(svg?.getAttribute('data-hu-icon'), 'person');
  const row = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === 'a1');
  const acts = row.childNodes.filter((n: any) => n.nodeType === 1).find((n: any) => n.classList?.contains('hu-acts2'));
  const order = acts.childNodes.filter((n: any) => n.nodeType === 1).map((b: any) => b.getAttribute('data-item-act'));
  assert.deepEqual(order, ['change-a', 'rename-a', 'avatar-a', 'profile-a'], '第 4 个图标必须排在头像之后');
});

/* ② 点击开窗：弹层两栏、逐字 aria-label、预填当前值。 */
test('#172 点击开窗：两栏预填当前资料', (t) => {
  const { bodyEl, handle } = makeBox();
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  assert.equal(popMod.homePopOpen(), true, '应开编辑弹层');
  const pop = popMod.homePopNode();
  assert.equal(pop.getAttribute('aria-label'), '编辑助理资料');
  const desc = byAttr(pop, 'aria-label', '助理简介')[0];
  const persona = byAttr(pop, 'aria-label', '助理人物设定')[0];
  assert.ok(desc && persona, '应有两栏（助理简介 / 助理人物设定）');
  assert.equal(desc.value, '小帅简介');
  assert.equal(persona.value, '小帅人设');
  assert.equal(txt(one(pop, 'hu-ptitle')), '编辑助理资料');
});

/* ③ 超限（201 码点）：保存禁用 + 红字带实际字数（定位到「简介」）。 */
test('#172 超限简介：保存禁用且红字指出实际字数', (t) => {
  const long = '简'.repeat(201);
  const { bodyEl, handle } = makeBox({ assistants: [A({ description: long, persona: '' })] });
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  const pop = popMod.homePopNode();
  assert.equal(byAttr(pop, 'aria-label', '助理简介')[0].value, long, '预填不截断');
  assert.equal(off(popBtn(pop, '保存')), true, '超限时保存必须禁用');
  const err = cls(pop, 'hu-flderr')[0];
  assert.match(txt(err), /简介（description）/, '红字要能定位到简介');
  assert.match(txt(err), /201/, '红字要带实际字数');
  assert.match(String(popBtn(pop, '保存').getAttribute('data-tip') ?? ''), /简介/);
});

/* ④ 补丁：磁盘超长历史值（人物设定 9000 码点）⇒ 完整预填、计数 9000/8000、保存禁用。 */
test('#172 超长历史值：完整预填 + 计数显示超限 + 保存禁用', (t) => {
  const long = '设'.repeat(9000);
  const { bodyEl, handle } = makeBox({ assistants: [A({ description: '简短', persona: long })] });
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  const pop = popMod.homePopNode();
  assert.equal(byAttr(pop, 'aria-label', '助理人物设定')[0].value.length, 9000, '历史值必须完整预填');
  const counts = cls(pop, 'hu-count').map((e: any) => txt(e));
  assert.equal(counts[1], '9000/8000', '计数器要显示 9000/8000 形态');
  assert.equal(off(popBtn(pop, '保存')), true);
  assert.match(txt(cls(pop, 'hu-flderr')[1]), /人物设定（persona）[\s\S]*9000/);
});

/* ⑤ 无改动（原样 / 只加首尾空白）⇒ 关窗且零写请求。 */
test('#172 无改动：直接关窗、零写请求（含只加空白）', async (t) => {
  const { bodyEl, handle, calls } = makeBox();
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  let pop = popMod.homePopNode();
  setVal(byAttr(pop, 'aria-label', '助理简介')[0], '  小帅简介  ');
  clickEl(popBtn(pop, '保存'));
  await flush();
  assert.equal(popMod.homePopOpen(), false, '无改动应直接关窗');
  assert.equal(calls.length, 0, '无改动不许发写请求');
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  pop = popMod.homePopNode();
  clickEl(popBtn(pop, '保存'));
  await flush();
  assert.equal(popMod.homePopOpen(), false);
  assert.equal(calls.length, 0);
});

/* ⑥ 成功：载荷两键归一、先关窗再 toast、列表/家页第三行同步刷新。 */
test('#172 保存成功：载荷归一、关窗、toast、第三行同步', async (t) => {
  const { bodyEl, handle, calls } = makeBox();
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  const pop = popMod.homePopNode();
  setVal(byAttr(pop, 'aria-label', '助理简介')[0], '  新简介  ');
  setVal(byAttr(pop, 'aria-label', '助理人物设定')[0], ' 新人物设定 ');
  clickEl(popBtn(pop, '保存'));
  await flush();
  assert.equal(calls.length, 1, '只许一次写请求');
  assert.equal(calls[0].id, 'a1');
  assert.deepEqual(calls[0].patch, { description: '新简介', persona: '新人物设定' }, '载荷应为归一后的两键');
  assert.equal(popMod.homePopOpen(), false, '成功后弹层关闭');
  const toast = one(domDoc.body, 'hu-toast');
  assert.ok(toast, '应弹「已保存助理资料」');
  assert.match(txt(toast), /已保存助理资料/);
  const row = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === 'a1');
  assert.ok(row, '列表已重建');
  assert.equal(txt(one(row, 'hu-desc')), '新简介', '第三行跟着刷新');
});

/* ⑦ 失败：弹窗不关、显示宿主原文、输入保留。 */
test('#172 保存失败：不关窗、显示宿主原文、输入保留', async (t) => {
  const { bodyEl, handle, calls } = makeBox({ mode: 'fail' });
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  const pop = popMod.homePopNode();
  setVal(byAttr(pop, 'aria-label', '助理简介')[0], '改坏了的简介');
  clickEl(popBtn(pop, '保存'));
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(popMod.homePopOpen(), true, '失败必须留窗');
  assert.equal(txt(one(pop, 'hu-err')), '宿主拒绝：角色权限不足（测试原文）', '显示宿主返回原文');
  assert.equal(byAttr(pop, 'aria-label', '助理简介')[0].value, '改坏了的简介', '输入必须保留');
  assert.equal(off(popBtn(pop, '保存')), false, '失败后可以再点保存');
  assert.equal(off(popBtn(pop, '取消')), false);
});

/* ⑧ 超时（timeoutMs=30，假 ops 永不 resolve）⇒ 同样按失败：留窗 + 超时文案。 */
test('#172 保存超时：留窗 + 「保存超时，请稍后重试」', async () => {
  const a = A({ description: '旧简介', persona: '' });
  const anchorEl = new El('div', domDoc);
  domDoc.body.appendChild(anchorEl);
  let done = 0;
  actMod.profileAsstPop(() => anchorEl, {
    view: { assistants: [a] },
    ops: { updateAssistant: () => new Promise<boolean>(() => {}) },
    asstId: 'a1', onDone: () => { done += 1; },
  }, { timeoutMs: 30 });
  const pop = popMod.homePopNode();
  assert.ok(pop, '弹层应打开');
  setVal(byAttr(pop, 'aria-label', '助理简介')[0], '改过的简介'); /* 有改动才会发写请求（否则走 noop 直接关窗） */
  clickEl(popBtn(pop, '保存'));
  await sleep(90);
  assert.equal(popMod.homePopOpen(), true, '超时不许关窗');
  assert.equal(txt(one(pop, 'hu-err')), '保存超时，请稍后重试');
  assert.equal(off(popBtn(pop, '保存')), false, '超时后恢复可点');
  assert.equal(done, 0, '超时不算成功，不刷新');
  popMod.closeHomePop(true);
  anchorEl.remove();
});

/* ⑨ 保存中：保存/取消都禁用、按钮显示「保存中…」；落定后才关窗。 */
test('#172 保存中：保存与取消禁用、按钮显示「保存中…」', async () => {
  const a = A({ description: '旧简介', persona: '' });
  const anchorEl = new El('div', domDoc);
  domDoc.body.appendChild(anchorEl);
  actMod.profileAsstPop(() => anchorEl, {
    view: { assistants: [a] },
    ops: { updateAssistant: () => new Promise<boolean>(() => {}) },
    asstId: 'a1', onDone: () => {},
  }, { timeoutMs: 120 });
  const pop = popMod.homePopNode();
  setVal(byAttr(pop, 'aria-label', '助理简介')[0], '改过的简介'); /* 同上：必须先有改动 */
  clickEl(popBtn(pop, '保存'));
  await flush();
  const save = cls(pop, 'hu-pbtn-s').find((b: any) => txt(b) === '保存中…');
  assert.ok(save, '保存中按钮文案应为「保存中…」');
  assert.equal(off(save), true, '保存中保存按钮禁用');
  assert.equal(off(popBtn(pop, '取消')), true, '保存中取消按钮禁用');
  assert.equal(popMod.homePopOpen(), true, '保存中弹层还在');
  /* 保存中「不能中途关闭」（规格 #168 item 45 / 评审 P2-2）：遮罩与 Esc 都必须被否决。 */
  const scrim = cls(domDoc.body, 'hu-scrim')[0];
  assert.ok(scrim, '弹层有遮罩');
  clickEl(scrim);
  assert.equal(popMod.homePopOpen(), true, '保存中点遮罩不得关窗');
  domDoc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(popMod.homePopOpen(), true, '保存中按 Esc 不得关窗');
  await sleep(180); /* 让 120ms 的兜底定时器落定，测试不留长计时器 */
  popMod.closeHomePop(true);
  anchorEl.remove();
});

/* ⑩ 家页第三行：有简介才显示（文本 + title 全文）、纯空白不占位。 */
test('#172 家页第三行：有简介显示、空白不占位', (t) => {
  const { bodyEl, handle } = makeBox({
    assistants: [A({ description: '  一句话介绍  ', persona: '' }), A({ id: 'a2', homeId: 'h1', channel: 'weixin', botId: null, status: 'unbound', name: '', nameSource: 'home', description: '   ' })],
  });
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  const row1 = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === 'a1');
  const desc = one(row1, 'hu-desc');
  assert.ok(desc, '有简介应显示第三行');
  assert.equal(txt(desc), '一句话介绍');
  assert.equal(desc.getAttribute('title'), '一句话介绍', '悬停看全文靠 title');
  const row2 = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === 'a2');
  assert.equal(one(row2, 'hu-desc'), null, '纯空白简介不占位');
  const sub = one(row1, 'hu-sub');
  const metaSpans = row1.childNodes.filter((n: any) => n.nodeType === 1)[1].childNodes.filter((n: any) => n.nodeType === 1);
  assert.equal(metaSpans[1], sub, '.hu-sub 必须仍是名字块里的第一个 meta span');
});

/* ⑪ 事件入口（补丁 B）：OPEN_ASSISTANT_PROFILE_EDIT_EVENT 开对的那一位；未知 id 无弹层；dispose 后退订。 */
test('#172 事件入口：派发打开对应助理、未知 id 不开、dispose 后退订', async (t) => {
  const { bodyEl, handle } = makeBox();
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  assert.equal(typeof cfgMod.OPEN_ASSISTANT_PROFILE_EDIT_EVENT, 'string', '#173 的契约常量必须在 config.ts（Added-only）');
  assert.equal(cfgMod.OPEN_ASSISTANT_PROFILE_EDIT_EVENT, 'dsh-im-companion:open-assistant-profile-edit');
  domWin.dispatchEvent(new domWin.CustomEvent(cfgMod.OPEN_ASSISTANT_PROFILE_EDIT_EVENT, { detail: { assistantId: 'a1' } }));
  await flush();
  assert.equal(popMod.homePopOpen(), true, '事件应打开编辑弹层');
  let pop = popMod.homePopNode();
  assert.equal(byAttr(pop, 'aria-label', '助理简介')[0].value, '小帅简介', '预填该助理');
  popMod.closeHomePop(true);
  domWin.dispatchEvent(new domWin.CustomEvent(cfgMod.OPEN_ASSISTANT_PROFILE_EDIT_EVENT, { detail: { assistantId: 'zz' } }));
  await flush();
  assert.equal(popMod.homePopOpen(), false, '未知 id 不许开弹层');
  domWin.dispatchEvent(new domWin.CustomEvent(cfgMod.OPEN_ASSISTANT_PROFILE_EDIT_EVENT, { detail: { assistantId: 'a1' } }));
  await flush();
  assert.equal(popMod.homePopOpen(), true);
  handle.dispose();
  popMod.closeHomePop(true);
  domWin.dispatchEvent(new domWin.CustomEvent(cfgMod.OPEN_ASSISTANT_PROFILE_EDIT_EVENT, { detail: { assistantId: 'a1' } }));
  await flush();
  assert.equal(popMod.homePopOpen(), false, 'dispose 后退订必须生效');
});


/* ⑫ 清空（规格 #168「空串与缺失等价」＋ #176 D1）：清空两栏必须显式发空串（宿主删键），成功后第三行消失。 */
test('#172 清空两栏：载荷显式发空串、宿主删键、第三行消失', async (t) => {
  const { bodyEl, handle, calls } = makeBox();
  t.after(() => handle.dispose());
  gotoL2(bodyEl);
  clickEl(actBtn(bodyEl, 'a1', 'profile-a'));
  const pop = popMod.homePopNode();
  setVal(byAttr(pop, 'aria-label', '助理简介')[0], '');
  setVal(byAttr(pop, 'aria-label', '助理人物设定')[0], '');
  clickEl(popBtn(pop, '保存'));
  await flush();
  assert.equal(calls.length, 1, '清空也是一次真写请求');
  assert.deepEqual(calls[0].patch, { description: '', persona: '' }, '清空必须显式发空串（不能按没改吞掉）');
  assert.equal(popMod.homePopOpen(), false, '成功后关窗');
  const row = cls(bodyEl, 'hu-row').find((r: any) => r.getAttribute('data-id') === 'a1');
  assert.equal(one(row, 'hu-desc'), null, '清空简介后家页第三行消失');
});
