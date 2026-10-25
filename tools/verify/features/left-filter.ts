// B2 自验证（F0 每功能自验证）：left-filter 纯逻辑 + 叠加视图断言（node --test，零第三方依赖）。
// 做法：tsc 转译特性链到临时目录，再断言转译产物；DOM 用最小桩（行/组容器/条带）。
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { loadLocales } from '../../../scripts/i18n-locales.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'left-filter');
const ENTRIES = [
  join(FEAT, 'model.ts'),
  join(FEAT, 'view.ts'),
  join(FEAT, 'styles.ts'),
  join(FEAT, 'manifest.ts'),
  join(FEAT, 'header-btn.ts'),
  join(FEAT, 'collapse-all.ts'),
  join(FEAT, 'dom-scope.ts'),
  /* #154：归属解析依据留痕（磁盘日志自证用）。 */
  join(FEAT, 'resolve-log.ts'),
  join(REPO, 'src', 'features', 'index.ts'),
  join(REPO, 'src', 'client', 'ui', 'segmented.ts'),
  join(REPO, 'src', 'client', 'dom.ts'),
  join(REPO, 'src', 'client', 'theme.ts'),
  /* #154：共享层工作区索引（行身份 → 路径）单点真相。 */
  join(REPO, 'src', 'client', 'data', 'workspace-index.ts'),
  /* #184：UI 文案走 YAML 词条 + i18n core（诊断日志仍用 FILTER_LABEL 中文）。 */
  join(REPO, 'src', 'client', 'i18n', 'core.ts'),
  join(REPO, 'src', 'client', 'i18n', 'index.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'b2-left-filter-'));
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
/* 地基修复（同 left-badges.ts）：tmp 无 node_modules 上溯链，junction 指回仓库。 */
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction');
} catch {
  /* 已存在则跳过 */
}
const req = createRequire(join(tmp, 'run.cjs'));
const model: any = req('./features/left-filter/model.js');
const view: any = req('./features/left-filter/view.js');
const headerBtn: any = req('./features/left-filter/header-btn.js');
const collapseAll: any = req('./features/left-filter/collapse-all.js');
const dom: any = req('./client/dom.js');
const styles: any = req('./features/left-filter/styles.js');
const domScope: any = req('./features/left-filter/dom-scope.js');
const registry: any = req('./features/index.js');
const wsIndex: any = req('./client/data/workspace-index.js');
const i18n: any = req('./client/i18n/core.js');
const locales = loadLocales(REPO);
assert.equal(locales.problems.length, 0, 'locales.yaml 校验失败：' + locales.problems.join('；'));
i18n.setDictionaries(locales.dicts);

const W1 = 'D:\\agents\\xiaoshuai';
const W2 = 'D:\\agents\\xinghuo';
const bots = [
  { channel: 'feishu', botId: 'f1', workspace: W1, botName: '小帅', connected: true },
  { channel: 'feishu', botId: 'f2', workspace: W2, botName: '星火', connected: true },
];

test('model：行数口径计数 + 三态放行（stale 仍算绑定）', () => {
  assert.deepEqual(model.countsOf([W1, W2, 'D:\\agents\\dsh-im'], bots), { all: 3, bound: 2, unbound: 1 });
  assert.equal(model.passFilter(W1, 'bound', bots), true);
  assert.equal(model.passFilter('D:\\agents\\dsh-im', 'bound', bots), false);
  assert.equal(model.passFilter('D:\\agents\\dsh-im', 'unbound', bots), true);
  assert.equal(model.passFilter(W1, 'all', bots), true);
  assert.equal(model.passFilter(W1, 'bound', [{ ...bots[0], stale: true, connected: false }]), true);
  assert.equal(model.segLabel('bound', 2), '有助理 2');
  assert.equal(model.segLabel('unbound', 1), '无助理 1');
});

test('#184 文案词条化：三段条 / 悬停 / 空提示 / 收起钮随语言切换（中英同源）', () => {
  assert.equal(model.segLabel('bound', 2), '有助理 2', '默认中文（setup 已装词条）');
  i18n.setActiveLocale('en');
  try {
    assert.equal(model.segLabel('all', 5), 'All 5');
    /* #184 验收修：英文三段词条改短词（原 With assistants 在三段等宽条带里必 ellipsis）。 */
    assert.equal(model.segLabel('bound', 2), 'Assigned 2');
    assert.equal(model.segLabel('unbound', 1), 'Unassigned 1');
    assert.match(model.rowTip(W1, bots), /^Assistants: 小帅/);
    assert.equal(model.rowTip('D:\\agents\\dsh-im', bots), 'No assistants yet');
    assert.ok(headerBtn.headerTip('bound', { all: 3, bound: 2, unbound: 1 }).indexOf('Assigned 2') >= 0, '漏斗悬停走英文模板');
    assert.equal(collapseAll.collapseLabel(), 'Collapse');
  } finally {
    i18n.setActiveLocale('zh');
  }
  assert.equal(model.segLabel('bound', 2), '有助理 2', '切回中文后立即还原');
});

test('model：助理名牌（去重/渠道/无助理）', () => {
  assert.deepEqual(model.assistantsOf(W1, bots), ['小帅']);
  assert.deepEqual(model.assistantsOf('D:\\agents\\dsh-im', bots), []);
  assert.match(model.rowTip(W1, bots), /助理：小帅/);
  assert.equal(model.rowTip('D:\\agents\\dsh-im', bots), '暂无助理认领');
});

test('model：名称映射（basename/Bot名/大小写）+ 未解析哨兵', () => {
  assert.equal(model.resolveWorkspaceKey('xiaoshuai', bots), W1);
  assert.equal(model.resolveWorkspaceKey('XiaoShuai', bots), W1);
  assert.equal(model.resolveWorkspaceKey('小帅', bots), W1);
  assert.equal(model.resolveWorkspaceKey(W1, bots), W1);
  /* #154：解析不出 ⇒ 空串哨兵；绝不把「无法解析的显示名」当工作区标识传下去。 */
  assert.equal(model.resolveWorkspaceKey('某个空组', bots), '');
});

test('#154：默认工作区按行身份解析（显示名本地化 ≠ 绑定路径）', () => {
  const D = 'D:\\deepseek-harness\\default-workspace';
  const index = wsIndex.buildWorkspaceIndex([
    { workspaceId: 'w-default', path: D, title: 'default-workspace' },
    { workspaceId: 'w-renamed', path: 'D:\\agents\\xiaowan', title: 'tttttt' },
    { workspaceId: 'w-plain', path: 'D:\\agents\\plain', title: 'plain' },
  ]);
  const dBots = [{ channel: 'feishu', botId: 'f9', workspace: D, botName: '小助手', connected: true }];
  /* ① 默认工作区：行文本＝本地化显示名，行身份＝data-row-key ⇒ 解析回绑定路径。 */
  const def = model.resolveWorkspaceKey('默认工作区', dBots, 'w-default', index);
  assert.equal(def, D);
  assert.equal(model.isBoundWorkspace(def, dBots), true, '绑定判定成立（不再落进「无助理」）');
  assert.deepEqual(model.countsOf([def], dBots), { all: 1, bound: 1, unbound: 0 });
  /* ② 改名工作区（显示名 ≠ basename）：身份优先。 */
  assert.equal(model.resolveWorkspaceKey('tttttt', dBots, 'w-renamed', index), 'D:\\agents\\xiaowan');
  /* ③ 普通工作区（无行身份）：标题回退。 */
  assert.equal(model.resolveWorkspaceKey('plain', dBots, '', index), 'D:\\agents\\plain');
  /* ④ 全不匹配 ⇒ 未解析哨兵（不是显示名）。 */
  assert.equal(model.resolveWorkspaceKey('毫不相干', dBots, '', index), '');
  /* 行身份取键：data-row-key="workspace:<id>" ⇒ id；别的键 ⇒ 空。 */
  assert.equal(wsIndex.workspaceIdFromRowKey('workspace:w-default'), 'w-default');
  assert.equal(wsIndex.workspaceIdFromRowKey('session:s1'), '');
  /* 解析依据（落盘留痕用）：身份 / 标题 / 老口径字面 / 未解析。 */
  assert.equal(model.resolveWorkspaceRow('默认工作区', dBots, 'w-default', index).source, 'id');
  assert.equal(model.resolveWorkspaceRow('plain', dBots, '', index).source, 'title');
  assert.equal(model.resolveWorkspaceRow('xiaoshuai', bots, '', wsIndex.EMPTY_WORKSPACE_INDEX).source, 'bot');
  assert.equal(model.resolveWorkspaceRow('毫不相干', dBots, '', index).source, 'none');
  /* 注册表读不到 ⇒ 老口径字面匹配仍在。 */
  assert.equal(model.resolveWorkspaceKey('xiaoshuai', bots, '', wsIndex.EMPTY_WORKSPACE_INDEX), W1);
});

test('registry：left-filter 在列，order 11，带样式与槽位', () => {
  const f = registry.FEATURES.find((x: any) => x.id === 'left-filter');
  assert.ok(f);
  assert.equal(f.order, 11);
  assert.equal(typeof f.installStyles, 'function');
  assert.equal(f.slots[0].target, 'workspace-rail');
  assert.equal(typeof f.slots[0].mount, 'function');
});

test('styles：命名空间前缀，不占 .af-', () => {
  assert.match(styles.CSS, /.left-filter-strip/);
  assert.match(styles.CSS, /.left-filter-empty/);
  const afDefs = styles.CSS.split('\n').filter((l: string) => l.trim().startsWith('.af-'));
  assert.equal(afDefs.length, 0, '不得定义 .af-*（仅允许以后代选择器复用共享原语）');
});

/* ---- 最小 DOM 桩 ---- */
const allNodes: any[] = [];
let groupRows: any[] = [];
/* #183：搜索框桩（判据只读 value；空/空白=未搜索，框常驻 DOM）。 */
let searchInputs: any[] = [];
const stubNode: any = (tag: string) => {
  const n: any = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(), children: [] as any[], parentNode: null as any, parentElement: null as any,
    style: {} as Record<string, string>, dataset: {} as Record<string, string>,
    attrs: {} as Record<string, string>, listeners: {} as Record<string, any[]>, _text: '',
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    offsetLeft: 0, offsetWidth: 10,
    width: 0,
    /** #94：布局宽度（默认 0 = 无布局环境，宽度项照旧跳过；需要时由用例显式赋 width）。 */
    getBoundingClientRect() { return { width: n.width, height: 1, top: 0, left: 0, right: n.width, bottom: 1 }; },
    get firstChild() { return n.children[0] ?? null; },
    get textContent(): string {
      return n._text + n.children.map((c: any) => (c.nodeType === 3 ? c.text : (typeof c.textContent === 'string' ? c.textContent : ''))).join('');
    },
    set textContent(v: string) { n._text = String(v); n.children = n.children.filter((c: any) => c.nodeType !== 3); },
    setAttribute(k: string, v: string) { n.attrs[k] = String(v); },
    getAttribute(k: string) { return n.attrs[k] ?? null; },
    removeAttribute(k: string) { delete n.attrs[k]; },
    appendChild(c: any) { c.parentNode = n; c.parentElement = n; n.children.push(c); return c; },
    insertBefore(c: any, ref: any) {
      if (c.parentNode && c.parentNode !== n && typeof c.parentNode.removeChild === 'function') c.parentNode.removeChild(c);
      n.children = n.children.filter((x: any) => x !== c);
      const i = ref ? n.children.indexOf(ref) : -1;
      if (i >= 0) n.children.splice(i, 0, c); else n.children.unshift(c);
      c.parentNode = n; c.parentElement = n; return c;
    },
    removeChild(c: any) { n.children = n.children.filter((x: any) => x !== c); c.parentNode = null; c.parentElement = null; return c; },
    querySelector(sel: string) {
      const deep: any[] = [];
      const walk = (x: any) => { for (const c of x.children ?? []) { deep.push(c); walk(c); } };
      walk(n);
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return deep.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)) ?? null;
      }
      if (sel === 'button') return deep.find((c: any) => c.tagName === 'BUTTON') ?? null;
      return null;
    },
    querySelectorAll(sel: string) {
      const deep: any[] = [];
      const walk = (x: any) => { for (const c of x.children ?? []) { deep.push(c); walk(c); } };
      walk(n);
      if (sel === GROUP_SEL) return deep.filter((c: any) => c.tagName === 'DIV' && c.attrs?.role === 'treeitem' && ('aria-expanded' in (c.attrs ?? {})));
      if (sel === 'button') return deep.filter((c: any) => c.tagName === 'BUTTON');
      if (sel.startsWith('.')) { const cls = sel.slice(1); return deep.filter((c: any) => String(c.attrs?.class ?? '').split(' ').includes(cls)); }
      return [];
    },
    get nextElementSibling() {
      try {
        const p = n.parentElement;
        if (!p) return null;
        const i = p.children.indexOf(n);
        return p.children[i + 1] ?? null;
      } catch { return null; }
    },
    addEventListener(t: string, fn: any) { (n.listeners[t] || (n.listeners[t] = [])).push(fn); },
    removeEventListener() {},
    innerHTML: '',
    contains(c: any) { let found = false; const walk = (x: any) => { for (const k of x.children ?? []) { if (k === c) found = true; walk(k); } }; walk(n); return found; },
    fire(t: string) { for (const fn of n.listeners[t] ?? []) fn(); },
  };
  Object.defineProperty(n, 'className', { get: () => n.attrs.class ?? '', set: (v: string) => { n.attrs.class = String(v); } });
  allNodes.push(n);
  return n;
};
const GROUP_SEL = 'div[role="treeitem"][aria-expanded]';
const SEARCH_INPUT_SEL = 'input[type="text"][maxlength]';
const docStub: any = {
  createElement: (t: string) => stubNode(t),
  createTextNode: (t: string) => ({ nodeType: 3, text: String(t), parentNode: null }),
  body: stubNode('body'),
  addEventListener() {}, removeEventListener() {},
  querySelectorAll(sel: string) {
    if (sel === GROUP_SEL) return groupRows;
    if (sel === SEARCH_INPUT_SEL) return searchInputs;
    if (sel.indexOf('data-left-filter') >= 0) return allNodes.filter((n) => n.attrs['data-left-filter'] === 'hidden');
    if (sel.startsWith('.')) { const cls = sel.slice(1); return allNodes.filter((n) => String(n.attrs?.class ?? '').split(' ').includes(cls)); }
    return [];
  },
};
(globalThis as any).document = docStub;
(globalThis as any).window = {};
(globalThis as any).MutationObserver = class { constructor(_cb: any) {} observe() {} disconnect() {} };

const groupRow = (text: string) => {
  const row = stubNode('div');
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-expanded', 'true');
  row._text = text;
  groupRows.push(row);
  return row;
};
/* #154：带行身份的组行（DSH 真身：data-row-key="workspace:<workspaceId>"）。 */
const groupRowWithKey = (text: string, wsId: string) => {
  const row = stubNode('div');
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-expanded', 'true');
  row.setAttribute('data-row-key', 'workspace:' + wsId);
  row._text = text;
  groupRows.push(row);
  return row;
};
const sessionRow = (text: string) => {
  const s = stubNode('div');
  s.setAttribute('role', 'treeitem');
  s._text = text;
  return s;
};
const sectionWith = (text: string, container: any) => {
  const sec = stubNode('div');
  sec.appendChild(groupRow(text));
  container.appendChild(sec);
  return sec;
};
const nestedSectionWith = (text: string, sessions: string[], container: any) => {
  const sec = stubNode('div');
  const wrap = stubNode('div');
  wrap.appendChild(groupRow(text));
  sec.appendChild(wrap);
  for (const t of sessions) sec.appendChild(sessionRow(t));
  container.appendChild(sec);
  return sec;
};
const segButton = (strip: any, id: string) => {
  const found: any[] = [];
  const walk = (n: any) => { if (n.dataset && n.dataset.id === id) found.push(n); for (const c of n.children ?? []) walk(c); };
  walk(strip);
  return found[0];
};
const segLabels = (strip: any) => {
  const out: string[] = [];
  const walk = (n: any) => { if (n.tagName === 'BUTTON' && n.dataset && n.dataset.id) out.push(n.dataset.id + '=' + n.textContent); for (const c of n.children ?? []) walk(c); };
  walk(strip);
  return out.sort().join('|');
};

test('#154 view：默认工作区组行（本地化显示名 + 行身份）在「有助理」下留得住', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  const sec = stubNode('div');
  sec.appendChild(groupRowWithKey('默认工作区', 'w-default'));
  container.appendChild(sec);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({
    subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; },
    get: (name: string) => (name === 'workspaces'
      ? { list: { getSnapshot: () => ({ items: [{ workspaceId: 'w-default', path: 'D:\\deepseek-harness\\default-workspace', title: 'default-workspace' }] }) } }
      : undefined),
  });
  snapFn({ bots: [{ channel: 'feishu', botId: 'f9', workspace: 'D:\\deepseek-harness\\default-workspace', botName: '小助手', connected: true }], failed: [], updatedAt: 31, catalogs: {} });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '条带挂出');
  assert.ok(segLabels(strip).includes('bound=有助理 1'), '默认工作区计入有助理：' + segLabels(strip));
  segButton(strip, 'bound').fire('click');
  assert.notEqual((sec as any).style.display, 'none', '有助理的默认工作区不被藏');
  dispose();
});

test('view：条带挂载 + 三段计数 + 整组藏显 + 卸载还原', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  const sec1 = sectionWith('小帅', container);
  const sec2 = sectionWith('xinghuo', container);
  const sec3 = sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  assert.ok(snapFn, '订阅已建立');
  snapFn({ bots, failed: [], updatedAt: 1 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '条带插到列表容器顶部');
  assert.equal(container.children[0], strip);
  assert.ok(segLabels(strip).includes('bound=有助理 2'), '计数准确：' + segLabels(strip));
  const boundRow = groupRows[0];
  assert.equal(boundRow.attrs?.title, undefined, '不再写原生 title（自画卡独占悬停，用户裁定 2026-09-04）');
  assert.equal(boundRow.attrs?.['data-lf-tip'], undefined, '旧气泡残留也被清掉');
  const boundBtn = segButton(strip, 'bound');
  const countSpan = boundBtn.querySelector('.left-filter-n');
  assert.ok(countSpan, '数字降级为独立 span');
  assert.equal(countSpan.textContent, '2');
  segButton(strip, 'bound').fire('click');
  assert.equal((sec3 as any).style.display, 'none', '无助理组被藏');
  assert.notEqual((sec1 as any).style.display, 'none');
  segButton(strip, 'unbound').fire('click');
  assert.equal((sec1 as any).style.display, 'none');
  assert.equal((sec2 as any).style.display, 'none');
  assert.notEqual((sec3 as any).style.display, 'none');
  dispose();
  assert.equal((sec1 as any).style.display, '', '卸载还原组行');
  assert.equal(container.children.includes(strip), false, '卸载摘除条带');
});

test('#183 dom-scope：搜索态判据看查询非空（框常驻，空/空白=未搜索）', () => {
  searchInputs = [];
  const mk = (value: string) => { const i = stubNode('input'); i.value = value; return i; };
  assert.equal(domScope.searchQueryActive(), false, '无框 ⇒ 非搜索态');
  searchInputs = [mk('')];
  assert.equal(domScope.searchQueryActive(), false, '空查询 ⇒ 非搜索态');
  searchInputs = [mk('   ')];
  assert.equal(domScope.searchQueryActive(), false, '全空白 ⇒ 非搜索态');
  searchInputs = [mk('星火')];
  assert.equal(domScope.searchQueryActive(), true, '非空查询 ⇒ 搜索态');
  searchInputs = [];
  assert.equal(String(domScope.SEARCH_INPUT_SEL), SEARCH_INPUT_SEL, '选择器契约：type=text + maxlength（与桩同一常量，改选择器即红）');
});

test('#183 header-btn：禁用态 off + aria-disabled + 搜索态 tooltip + 点击无效，恢复后照常循环', () => {
  const header = stubNode('div');
  const counts = { all: 2, bound: 1, unbound: 1 };
  let cycles = 0;
  const btn = headerBtn.ensureHeaderBtn(header, 'all', counts, () => { cycles += 1; }, true);
  assert.ok(btn, '按钮创建');
  assert.ok(String(btn.attrs.class ?? '').split(' ').includes('off'), 'off 形态');
  assert.ok(String(btn.attrs.class ?? '').split(' ').includes('left-filter-hbtn'), '保留命名空间类');
  assert.equal(btn.attrs['aria-disabled'], 'true');
  assert.match(String(btn.attrs.title ?? ''), /搜索态不参与筛选/);
  btn.fire('click');
  assert.equal(cycles, 0, '禁用态点击不循环（不留可点无反馈）');
  headerBtn.ensureHeaderBtn(header, 'all', counts, () => { cycles += 1; }, false);
  assert.equal(btn.attrs['aria-disabled'], undefined, '退出搜索摘除 aria-disabled');
  assert.equal(String(btn.attrs.class ?? '').split(' ').includes('off'), false, 'off 形态摘除');
  assert.match(String(btn.attrs.title ?? ''), /全部 2/, '恢复三数 tooltip');
  btn.fire('click');
  assert.equal(cycles, 1, '恢复后同一颗按钮点击循环一次');
  headerBtn.removeHeaderBtns();
  assert.equal(header.children.length, 0, '清理污染');
});

test('#183 view：搜索态不挂条带、头钮置灰且点击无效；退出搜索自动恢复', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const mid = stubNode('div');
  root.appendChild(mid);
  const container = stubNode('div');
  mid.appendChild(container);
  sectionWith('小帅', container);
  sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 41 });
  const strip0 = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip0, '常规态条带在位');
  const hb = header.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-hbtn'));
  assert.ok(hb, '常规态漏斗在位');
  /* 进入搜索：扁平结果列表替换浏览树 ⇒ 组行 0 + 搜索框 query 非空。 */
  groupRows = [];
  container.children = [];
  const input = stubNode('input');
  input.value = '星火';
  searchInputs = [input];
  snapFn({ bots, failed: [], updatedAt: 42 });
  assert.equal(container.children.some((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip')), false, '搜索态不挂条带');
  assert.equal(hb.attrs['aria-disabled'], 'true', '头钮置灰');
  assert.ok(String(hb.attrs.class ?? '').split(' ').includes('off'), 'off 形态');
  assert.match(String(hb.attrs.title ?? ''), /搜索态不参与筛选/, 'tooltip 说明不参与筛选');
  const title0 = hb.attrs.title;
  hb.fire('click');
  assert.equal(hb.attrs.title, title0, '点击无效（不循环）');
  /* 退出搜索：组行回来（计数换成 2 有助理 / 0 无助理）⇒ 条带回且三段计数/选中态必须刷新。 */
  searchInputs = [];
  sectionWith('小帅', container);
  sectionWith('xinghuo', container);
  snapFn({ bots, failed: [], updatedAt: 43 });
  const strip1 = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip1, '退出搜索条带回来');
  assert.ok(segLabels(strip1).includes('bound=有助理 2'), '退出搜索后三段计数刷新（条带句柄一起重建，不冻结）：' + segLabels(strip1));
  assert.ok(segLabels(strip1).includes('unbound=无助理 0'), '计数换成 0 也必须刷新：' + segLabels(strip1));
  assert.equal(hb.attrs['aria-disabled'], undefined, 'aria-disabled 摘除');
  assert.equal(String(hb.attrs.class ?? '').split(' ').includes('off'), false, 'off 形态撤除');
  assert.match(String(hb.attrs.title ?? ''), /全部 2/, '恢复三数 tooltip');
  hb.fire('click');
  assert.match(String(hb.attrs.title ?? ''), /有助理/, '退出搜索后点击循环照旧');
  dispose();
  assert.equal(header.children.length, 2, '卸载摘除漏斗');
});

test('#184 验收修：换头 / 钮被摘后，下一轮同计数快照把漏斗钮重挂回来（不靠筛选变化）', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const mid = stubNode('div');
  root.appendChild(mid);
  const container = stubNode('div');
  mid.appendChild(container);
  sectionWith('小帅', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 51 });
  const isFunnel = (n: any) => String(n.attrs?.class ?? '').includes('left-filter-hbtn');
  const hb0 = header.children.find(isFunnel);
  assert.ok(hb0, '首轮漏斗在位');
  /* ① 头还在、注入钮被摘（DSH 重渲染带走注入子节点）：同名头 + 同计数快照。
   * 旧签名只记「头栏找得到」（h:1）⇒ 签名不变 ⇒ 短路 return ⇒ 钮永久丢；加 hb 位后必须重挂。 */
  header.removeChild(hb0);
  snapFn({ bots, failed: [], updatedAt: 52 });
  assert.ok(header.children.find(isFunnel), '钮被摘后同计数快照也能重挂（签名 hb 位生效）');
  /* ② 头节点整个换新（切语言真机形态）：新头 + 同计数快照 ⇒ 必须挂到新头（headerChanged 清签名）。 */
  const header2 = stubNode('div');
  header2.appendChild(stubNode('button'));
  root.removeChild(header);
  root.insertBefore(header2, mid);
  snapFn({ bots, failed: [], updatedAt: 53 });
  assert.ok(header2.children.find(isFunnel), '头换新后漏斗挂到新头');
  dispose();
  assert.equal(header2.children.length, 1, '卸载摘除新头里的漏斗');
});

test('#183 view：无容器且非搜索态 ⇒ 头钮保持不摘（行为同改前，避免瞬态摘了再挂）', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const mid = stubNode('div');
  root.appendChild(mid);
  const container = stubNode('div');
  mid.appendChild(container);
  sectionWith('小帅', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 44 });
  assert.equal(header.children.length, 2, '常规态漏斗在位（原生 1 + 注入 1）');
  groupRows = [];
  container.children = [];
  snapFn({ bots, failed: [], updatedAt: 45 });
  assert.equal(header.children.length, 2, '无容器非搜索态 ⇒ 不摘头钮（改前行为：留给下一轮重绘更新）');
  dispose();
});

test('view：老代挂载在新代出现后不覆盖（代际哨兵）', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  sectionWith('小帅', container);
  sectionWith('某个空组', container);
  let snap1: any = null; let snap2: any = null;
  const d1 = view.mountLeftFilter({ subscribe: (fn: any) => { snap1 = fn; return () => {}; } });
  const d2 = view.mountLeftFilter({ subscribe: (fn: any) => { snap2 = fn; return () => {}; } });
  snap2({ bots, failed: [], updatedAt: 5 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  segButton(strip, 'bound').fire('click');
  snap1({ bots, failed: [], updatedAt: 6 });
  assert.equal(segButton(strip, 'bound') !== undefined, true);
  const sec2 = container.children.find((c: any) => c.children.some((x: any) => x.textContent === '某个空组'));
  assert.equal(sec2.style.display, 'none', '老代快照不得复写新代结论');
  segButton(container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip')), 'all').fire('click');
  d1(); d2();
});

test('header-btn：多级上行定位（列表与头栏隔多层容器）', () => {
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const listArea = stubNode('div');
  root.appendChild(listArea);
  const treeBody = stubNode('div');
  listArea.appendChild(treeBody);
  const container = stubNode('div');
  treeBody.appendChild(container);
  assert.equal(headerBtn.resolveHeader(container), header, '上行 3 级找到头栏');
  assert.equal(headerBtn.resolveHeader(stubNode('span')), null, '孤节点返回空');
});

test('header-btn：循环三态 + tooltip 三数 + 原生按钮不动', () => {
  assert.equal(headerBtn.nextFilter('all'), 'bound');
  assert.equal(headerBtn.nextFilter('bound'), 'unbound');
  assert.equal(headerBtn.nextFilter('unbound'), 'all');
  const tip = headerBtn.headerTip('bound', { all: 30, bound: 6, unbound: 24 });
  assert.match(tip, /有助理 6/);
  assert.match(tip, /全部 30/);
  assert.match(tip, /无助理 24/);
});

test('view：头栏第 4 按钮挂载 + 点击循环 + 卸载摘除', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const mid = stubNode('div');
  root.appendChild(mid);
  const container = stubNode('div');
  mid.appendChild(container);
  const sec1 = sectionWith('小帅', container);
  const sec3 = sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 7 });
  const strip0 = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  segButton(strip0, 'all').fire('click');
  const hb = header.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-hbtn'));
  assert.ok(hb, '头栏出现第 4 个按钮');
  assert.equal(header.children.length, 3, '原生两个按钮不动，只追加');
  assert.match(String(hb.attrs.title ?? ''), /全部 2/);
  assert.match(String(hb.attrs.title ?? ''), /无助理 1/);
  hb.fire('click');
  assert.equal((sec3 as any).style.display, 'none', '点击循环到有助理，藏起无助理组');
  assert.match(String(hb.attrs.title ?? ''), /有助理/);
  assert.ok(String(hb.attrs.class ?? '').split(' ').includes('on'), '非全部态着色');
  dispose();
  assert.equal(header.children.length, 2, '卸载摘除头按钮');
  assert.equal((sec3 as any).style.display, '', '卸载还原组行');
});

test('view：嵌套包一层（悬停卡片）整组藏，会话跟随', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  const sec1 = nestedSectionWith('小帅', ['需求讨论', '周报'], container);
  const sec3 = nestedSectionWith('某个空组', ['试运行'], container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 9 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  segButton(strip, 'bound').fire('click');
  assert.equal((sec3 as any).style.display, 'none', '整组容器被藏');
  assert.equal((sec1 as any).style.display !== 'none', true, '命中组 intact');
  segButton(strip, 'all').fire('click');
  dispose();
});

test('view：扁平列表退化（组行+后续会话兄弟，遇下组即停）', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  const g1 = groupRow('某个空组');
  const s1 = sessionRow('会话一');
  const s2 = sessionRow('会话二');
  const g2 = groupRow('小帅');
  const fade = stubNode('span');
  for (const n of [g1, s1, s2, g2, fade]) container.appendChild(n);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 10 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  segButton(strip, 'bound').fire('click');
  assert.equal((g1 as any).style.display, 'none', '组行被藏');
  assert.equal((s1 as any).style.display, 'none', '后续会话跟随');
  assert.equal((s2 as any).style.display, 'none', '后续会话跟随');
  assert.equal((g2 as any).style.display !== 'none', true, '下组 intact');
  assert.equal((fade as any).style.display !== 'none', true, '异物（fade） intact');
  segButton(strip, 'all').fire('click');
  assert.equal((s1 as any).style.display, '', '还原会话行');
  dispose();
});

test('view：无头栏时只留条带（fail-closed 头按钮）', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  sectionWith('小帅', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 8 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '无头栏也有条带');
  dispose();
});

test('view：容器混入头栏按钮即猜大→藏条带（首装全宽回归）', () => {
  groupRows = []; searchInputs = [];
  const sidebar = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  sidebar.appendChild(header);
  const container = stubNode('div');
  sidebar.appendChild(container);
  const sec = sectionWith('小帅', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 11 });
  const strip = allNodes.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-strip') && c.parentNode);
  assert.equal(strip, undefined, '猜大时宁可缺席：不插条带');
  assert.notEqual((sec as any).style.display, 'none', '藏显也不执行，原样还原');
  const hb0 = header.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-hbtn'));
  assert.ok(hb0, '头钮常在：条带藏，漏斗照挂');
  assert.equal(header.children.length, 2, '只追加漏斗，原生不动');
  dispose();
});

test('dom锚点：行内按钮不算混入，行外原生按钮才算（真机回归）', () => {
  const mkRow = () => {
    const r = stubNode('div');
    r.setAttribute('role', 'treeitem');
    r.setAttribute('aria-expanded', 'true');
    return r;
  };
  const listA = stubNode('div');
  const secA = stubNode('div');
  const rowA = mkRow();
  rowA.appendChild(stubNode('button'));
  secA.appendChild(rowA);
  listA.appendChild(secA);
  assert.equal(dom.isPlausibleListContainer(listA), true, '行 hover 操作按钮不算头栏混入');
  const listB = stubNode('div');
  listB.appendChild(stubNode('button'));
  const secB = stubNode('div');
  secB.appendChild(mkRow());
  listB.appendChild(secB);
  assert.equal(dom.isPlausibleListContainer(listB), false, '行外原生按钮=猜大');
  const listC = stubNode('div');
  const strip = stubNode('div');
  strip.setAttribute('class', 'left-filter-strip');
  strip.appendChild(stubNode('button'));
  listC.appendChild(strip);
  const secC = stubNode('div');
  secC.appendChild(mkRow());
  listC.appendChild(secC);
  assert.equal(dom.isPlausibleListContainer(listC), true, '自家条带按钮不算混入');
  const ownStrip = stubNode('div');
  ownStrip.setAttribute('class', 'left-filter-strip');
  assert.equal(dom.isOwnNode(ownStrip), true, '条带是自家节点');
  const plainHeader = stubNode('div');
  plainHeader.appendChild(stubNode('button'));
  assert.equal(dom.isOwnNode(plainHeader), false, '原生头栏不是自家节点');
  const livedHeader = stubNode('div');
  const livedHb = stubNode('button');
  livedHb.setAttribute('class', 'left-filter-hbtn');
  livedHeader.appendChild(livedHb);
  livedHeader.appendChild(stubNode('button'));
  assert.equal(dom.isOwnNode(livedHeader), false, '已挂漏斗的真头栏仍是头栏');
});

test('view：容器猜大时条带藏但漏斗照常挂（头钮常在）', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const mid = stubNode('div');
  root.appendChild(mid);
  const container = stubNode('div');
  container.appendChild(stubNode('button'));
  mid.appendChild(container);
  const sec1 = sectionWith('小帅', container);
  const sec2 = sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 12 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-strip'));
  assert.equal(strip, undefined, '猜大时条带缺席');
  const hb = header.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-hbtn'));
  assert.ok(hb, '漏斗照常挂，不陪条带一起死');
  assert.match(String(hb.attrs.title ?? ''), /全部 2/);
  assert.notEqual((sec1 as any).style.display, 'none', '藏显也不执行');
  assert.notEqual((sec2 as any).style.display, 'none', '藏显也不执行');
  dispose();
  assert.equal(header.children.length, 1, '卸载摘除漏斗');
});

test('view：条带挂出后不被认成头栏（自匹配回归）', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div');
  const header = stubNode('div');
  header.appendChild(stubNode('button'));
  header.appendChild(stubNode('button'));
  root.appendChild(header);
  const mid = stubNode('div');
  root.appendChild(mid);
  const container = stubNode('div');
  mid.appendChild(container);
  sectionWith('小帅', container);
  sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 13 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-strip'));
  assert.ok(strip, '条带先挂出');
  segButton(strip, 'bound').fire('click');
  assert.equal(header.children.length, 3, '漏斗仍在真头栏，不重复');
  assert.equal(strip.querySelector('.left-filter-hbtn'), null, '漏斗没被挂进条带');
  segButton(strip, 'all').fire('click');
  dispose();
});

test('view：空提示（分组全藏时出现，恢复时消失）', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 3 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  segButton(strip, 'bound').fire('click');
  const hint = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-empty'));
  assert.ok(hint, '全藏时给出空提示');
  assert.equal(hint.textContent, '没有匹配的工作区');
  segButton(strip, 'all').fire('click');
  const gone = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-empty'));
  assert.ok(!gone, '恢复后空提示消失');
  dispose();
});

/* ---- #64 一键收起 ---- */

test('collapse-all：只收可见展开组（藏起/已收/血统不动）', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  const sec1 = sectionWith('小帅', container);
  const sec2 = sectionWith('某个空组', container);
  const g1 = groupRows[0];
  const g2 = groupRows[1];
  // 已收起的保持不动
  g2.setAttribute('aria-expanded', 'false');
  // 血统树（主面板）永不动
  const lineage = stubNode('div');
  lineage.setAttribute('role', 'treeitem');
  lineage.setAttribute('aria-expanded', 'true');
  lineage.setAttribute('aria-level', '2');
  lineage._text = '血统父节点';
  container.appendChild(lineage);
  const clicked: any[] = [];
  (g1 as any).click = () => { clicked.push(g1); g1.setAttribute('aria-expanded', 'false'); };
  (g2 as any).click = () => { clicked.push(g2); };
  (lineage as any).click = () => { clicked.push(lineage); };
  assert.equal(collapseAll.isCollapseTarget(g1), true, '可见展开组是目标');
  assert.equal(collapseAll.isCollapseTarget(g2), false, '已收起不动');
  assert.equal(collapseAll.isCollapseTarget(lineage), false, '血统永不动');
  assert.equal(collapseAll.isHiddenByFilter(g1), false);
  // 藏起 sec2 后 g2 更不是目标（已收起 + 被藏，双重排除）
  (sec2 as any).setAttribute('data-left-filter', 'hidden');
  assert.equal(collapseAll.isHiddenByFilter(g2), true, '被筛选藏起即不可见');
  assert.equal(collapseAll.isCollapseTarget(g2), false);
  const targets = collapseAll.collectCollapseTargets(container);
  assert.deepEqual(targets, [g1], '快照只含可见展开组');
  const n = collapseAll.collapseGroups(targets, container);
  assert.equal(n, 1);
  assert.deepEqual(clicked, [g1], '只对可见组触发一次原生点击');
  assert.equal(lineage.getAttribute('aria-expanded'), 'true', '血统 untouched');
  void sec1;
});

test('view：收起钮随条带同行挂载 + 点击只收可见组 + 卸载无残留', () => {
  groupRows = []; searchInputs = [];
  const container = stubNode('div');
  sectionWith('小帅', container);
  sectionWith('xinghuo', container);
  sectionWith('某个空组', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 21 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '条带有');
  const collapseBtn = strip.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('left-filter-collapse'));
  assert.ok(collapseBtn, '收起钮与三段同一条带');
  assert.equal(collapseBtn.attrs.title, '一键收起当前可见分组');
  assert.equal(collapseBtn.attrs['aria-label'], '一键收起当前可见分组');
  assert.match(String((collapseBtn as any).innerHTML ?? ''), /circle/, 'G 方案圈箭头图标（无文本，含义走 tooltip）');
  // 三段仍在同一行
  const seg = strip.children.find((c: any) => String(c.attrs?.class ?? '').split(' ').includes('af-seg'));
  assert.ok(seg, '三段仍在');
  // 切到有助理：无助理组被藏；此时点收起只收两组可见
  segButton(strip, 'bound').fire('click');
  const clicked: any[] = [];
  for (const g of groupRows) (g as any).click = () => { clicked.push(g); };
  collapseBtn.fire('click');
  assert.equal(clicked.length, 2, '只收可见两组，藏起的不动：' + clicked.length);
  for (const g of clicked) assert.equal(collapseAll.isHiddenByFilter(g), false);
  // 计数不动（收起不改变筛选计数）
  assert.ok(segLabels(strip).includes('bound=有助理 2'), '收起不改计数：' + segLabels(strip));
  dispose();
  assert.equal(container.children.includes(strip), false, '卸载摘除条带');
  assert.equal(strip.parentNode, null, '条带已离树（收起钮随条带同灭）');
  assert.equal((collapseBtn as any).parentNode, strip, '收起钮仍在离树条带内，未泄漏到文档');
});

test('styles：收起钮命名空间 + 条带同行不溢出（flex）', () => {
  assert.match(styles.CSS, /.left-filter-collapse/);
  assert.match(styles.CSS, /display:flex/);
  const afDefs = styles.CSS.split('\n').filter((l: string) => l.trim().startsWith('.af-'));
  assert.equal(afDefs.length, 0, '不得定义 .af-*');
});

/* ---- #94 单组树：容器结构兜底（真机同名结构 body > #root > shell > rail > treeBody > list[role=tree] + 真实宽度） ---- */

test('#94 单组树：条带仍锚在 role="tree" 列表里，且藏的是组而不是整页', () => {
  groupRows = []; searchInputs = [];
  const root = stubNode('div'); root.width = 1600;
  const shell = stubNode('div'); shell.width = 1600;
  const rail = stubNode('div'); rail.width = 271;
  const header = stubNode('div'); header.width = 271;
  for (const label of ['搜索', '排序']) { const b = stubNode('button'); b._text = label; header.appendChild(b); }
  const treeBody = stubNode('div'); treeBody.width = 271;
  const list = stubNode('div'); list.setAttribute('role', 'tree'); list.width = 271;
  const sec = stubNode('div'); sec.width = 271;
  const row = stubNode('div');
  row.setAttribute('role', 'treeitem'); row.setAttribute('aria-expanded', 'true'); row._text = '单工作区'; row.width = 271;
  groupRows.push(row);
  sec.appendChild(row);
  const sess = stubNode('div'); sess.setAttribute('role', 'treeitem'); sess._text = '会话一'; sess.width = 271;
  sec.appendChild(sess);
  list.appendChild(sec); treeBody.appendChild(list);
  rail.appendChild(header); rail.appendChild(treeBody);
  shell.appendChild(rail); root.appendChild(shell); docStub.body.appendChild(root);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots: [], failed: [], updatedAt: 21, catalogs: {} });
  const strip = list.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '#94：单组时条带必须仍在官方列表容器里（不许被 380px 宽度门静默摘掉）');
  const hbtn = header.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-hbtn'));
  assert.ok(hbtn, '头栏漏斗照常');
  // 切到有助理：无 bots ⇒ 唯一组不匹配 ⇒ 只许藏该组，绝不许把 #root 藏成空白页
  segButton(strip, 'bound').fire('click');
  assert.equal((sec as any).style.display, 'none', '不匹配的组被藏');
  assert.notEqual((root as any).style.display, 'none', '#94：应用根绝不能被当成隐藏根（否则整页空白）');
  assert.equal(root.getAttribute('data-left-filter'), null, '#94：隐藏标记也不许落在应用根上');
  dispose();
});

/* ---- #159：条带宽度跟随容器 + 三分段悬停/按下反馈（owner 拍板 Q1=A / Q2=A） ---- */

test('styles：#159 条带不吃 360 封顶（宽度跟随容器），三段 hover/active 只做左栏命名空间后代覆盖', () => {
  const stripLine = styles.CSS.split('\n').find((l: string) => l.trim().startsWith('.left-filter-strip{'));
  assert.ok(stripLine, '条带基础规则存在');
  const rule = stripLine.slice(stripLine.indexOf('{') + 1, stripLine.lastIndexOf('}'));
  assert.match(rule, /width:100%/, '条带宽度跟随容器');
  assert.doesNotMatch(rule, /max-width\s*:/, '#159：条带不得有 max-width 封顶（宽度由容器决定，防又改成 380/400 之类字面量）');
  assert.doesNotMatch(rule, /margin\s*:[^;]*\bauto\b/, '#159：不得居中留侧缝');
  /* 三段悬停/按下：沿用设置面板同一套原语表现，但必须挂在 .left-filter-strip 后代上（启动期随 FEATURES 安装）。 */
  assert.match(styles.CSS, /\.left-filter-strip \.af-seg-item:not\(\.active\):hover\s*\{[^}]*color:var\(--af-primary\)/, '非当前段 hover 提升文字对比');
  assert.match(styles.CSS, /\.left-filter-strip \.af-seg-item:not\(\.active\):hover\s*\{[^}]*background:/, '#159 用户验收：悬停要有可见底药丸（深色窄栏纯文字提亮太轻，肉眼看不到）');
  assert.match(styles.CSS, /\.left-filter-strip \.af-seg-item:active\s*\{[^}]*transform:scale\(\.96\)/, '按下缩放反馈');
  /* 行首 .af-* 定义由本文件既有两处守卫覆盖（styles 命名空间测试），此处不重复。 */
});

/* ---- #183：搜索态不参与筛选（维护者 2026-10-23 拍板）—— 防回潮源码扫描 ---- */

test('#183 防回潮：结果行筛选逻辑已清、搜索态不筛口径在、头钮禁用形态在', () => {
  const read = (f: string) => readFileSync(join(FEAT, f), 'utf8');
  /* spec 复核：扫描必须覆盖整个 feature 目录（不止 4 个文件），且单双引号写法都要拦。 */
  const srcFiles = readdirSync(FEAT).filter((f: string) => f.endsWith('.ts'));
  for (const f of srcFiles) {
    const src = read(f);
    assert.doesNotMatch(src, /button\[role=['"]treeitem['"]\]/, f + '：不得再出现结果行按钮选择器');
    assert.doesNotMatch(src, /RESULT_SEL|resolveResultKey|hiddenResults|searchEmpty/, f + '：搜索筛选死代码不得回潮');
  }
  const domScopeSrc = read('dom-scope.ts');
  const viewSrc = read('view.ts');
  const headerBtnSrc = read('header-btn.ts');
  const modelSrc = read('model.ts');
  assert.match(domScopeSrc, /SEARCH_INPUT_SEL/, '搜索态判据锚点在 dom-scope');
  assert.match(domScopeSrc, /export function searchQueryActive/, '判据只读函数导出');
  assert.match(viewSrc, /groups\.length === 0 && searchQueryActive\(\)/, '搜索态必须同时要求组行 0 + 查询非空');
  assert.match(viewSrc, /stripSeg = null/, '摘条带必须连句柄一起置空（#183 spec 复核：否则三段计数冻结）');
  assert.match(headerBtnSrc, /aria-disabled/, '头钮禁用形态');
  assert.match(headerBtnSrc, /SEARCH_TIP/, '搜索态 tooltip 单点');
  assert.match(styles.CSS, /\.left-filter-hbtn\.off/, '禁用态样式');
  assert.equal(model.resolveResultKey, undefined, 'model 不再导出结果行解析');
});
