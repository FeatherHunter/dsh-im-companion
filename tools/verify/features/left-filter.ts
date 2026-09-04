// B2 自验证（F0 每功能自验证）：left-filter 纯逻辑 + 叠加视图断言（node --test，零第三方依赖）。
// 做法：tsc 转译特性链到临时目录，再断言转译产物；DOM 用最小桩（行/组容器/条带）。
import { mkdtempSync, rmSync } from 'node:fs';
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
  join(REPO, 'src', 'features', 'index.ts'),
  join(REPO, 'src', 'client', 'ui', 'segmented.ts'),
  join(REPO, 'src', 'client', 'dom.ts'),
  join(REPO, 'src', 'client', 'theme.ts'),
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
const req = createRequire(join(tmp, 'run.cjs'));
const model: any = req('./features/left-filter/model.js');
const view: any = req('./features/left-filter/view.js');
const headerBtn: any = req('./features/left-filter/header-btn.js');
const styles: any = req('./features/left-filter/styles.js');
const registry: any = req('./features/index.js');

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

test('model：助理名牌（去重/渠道/无助理）', () => {
  assert.deepEqual(model.assistantsOf(W1, bots), ['小帅']);
  assert.deepEqual(model.assistantsOf('D:\\agents\\dsh-im', bots), []);
  assert.match(model.rowTip(W1, bots), /助理：小帅/);
  assert.equal(model.rowTip('D:\\agents\\dsh-im', bots), '暂无助理认领');
});

test('model：名称映射（basename/Bot名/大小写/搜索归属包含）', () => {
  assert.equal(model.resolveWorkspaceKey('xiaoshuai', bots), W1);
  assert.equal(model.resolveWorkspaceKey('XiaoShuai', bots), W1);
  assert.equal(model.resolveWorkspaceKey('小帅', bots), W1);
  assert.equal(model.resolveWorkspaceKey(W1, bots), W1);
  assert.equal(model.resolveWorkspaceKey('某个空组', bots), '某个空组');
  assert.equal(model.resolveResultKey('星火周报 星火 会议纪要', bots), W2);
  assert.equal(model.resolveResultKey('毫不相关的标题', bots), '毫不相关的标题');
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
let resultRows: any[] = [];
const stubNode: any = (tag: string) => {
  const n: any = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(), children: [] as any[], parentNode: null as any, parentElement: null as any,
    style: {} as Record<string, string>, dataset: {} as Record<string, string>,
    attrs: {} as Record<string, string>, listeners: {} as Record<string, any[]>, _text: '',
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    offsetLeft: 0, offsetWidth: 10,
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
      if (sel === RESULT_SEL) return deep.filter((c: any) => c.tagName === 'BUTTON' && c.attrs?.role === 'treeitem');
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
const RESULT_SEL = 'button[role="treeitem"]';
const docStub: any = {
  createElement: (t: string) => stubNode(t),
  createTextNode: (t: string) => ({ nodeType: 3, text: String(t), parentNode: null }),
  body: stubNode('body'),
  addEventListener() {}, removeEventListener() {},
  querySelectorAll(sel: string) {
    if (sel === GROUP_SEL) return groupRows;
    if (sel === RESULT_SEL) return resultRows;
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
const resultButton = (text: string, container: any) => {
  const b = stubNode('button');
  b._text = text;
  container.appendChild(b);
  resultRows.push(b);
  return b;
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

test('view：条带挂载 + 三段计数 + 整组藏显 + 卸载还原', () => {
  groupRows = []; resultRows = [];
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

test('view：搜索态结果行按归属 AND 过滤 + 空提示', () => {
  groupRows = []; resultRows = [];
  const container = stubNode('div');
  const r1 = resultButton('星火周报 星火', container);
  const r2 = resultButton('dsh-im 试运行 dsh-im', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 2 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '搜索态条带仍有锚点');
  segButton(strip, 'bound').fire('click');
  assert.equal((r1 as any).style.display !== 'none', true, '有助理归属的结果保留');
  assert.equal((r2 as any).style.display, 'none', '无助理归属的结果被藏');
  segButton(strip, 'unbound').fire('click');
  const hint = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-empty'));
  assert.ok(!hint, '搜索未筛空时无空提示');
  segButton(strip, 'all').fire('click');
  dispose();
  assert.equal((r2 as any).style.display, '', '卸载还原结果行');
});

test('view：老代挂载在新代出现后不覆盖（代际哨兵）', () => {
  groupRows = []; resultRows = [];
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
  groupRows = []; resultRows = [];
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
  groupRows = []; resultRows = [];
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
  groupRows = []; resultRows = [];
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
  groupRows = []; resultRows = [];
  const container = stubNode('div');
  sectionWith('小帅', container);
  let snapFn: any = null;
  const dispose = view.mountLeftFilter({ subscribe: (fn: any) => { snapFn = fn; return () => { snapFn = null; }; } });
  snapFn({ bots, failed: [], updatedAt: 8 });
  const strip = container.children.find((c: any) => String(c.attrs?.class ?? '').includes('left-filter-strip'));
  assert.ok(strip, '无头栏也有条带');
  dispose();
});

test('view：空提示（分组全藏时出现，恢复时消失）', () => {
  groupRows = []; resultRows = [];
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
