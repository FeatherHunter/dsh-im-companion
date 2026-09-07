// 会话-组颜色不变量验证（stub DOM + 真实 sessions.ts，node --test 运行）。
// 不变量：展开组（有会话行）的组蓝/黄/红 ⇒ 必有同色会话行；无同色行 ⇒ 组旧色必清。
// 收起组（无行）：不动，留 entry 级汇总（例外，见 ADR）。
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const SRC = join(REPO, 'src');
const ENTRIES = [
  join(SRC, 'features', 'design-preview', 'sessions.ts'),
  join(SRC, 'client', 'data', 'activity.ts'),
  join(SRC, 'client', 'data', 'fleet-api.ts'),
  join(SRC, 'client', 'data', 'header-overlay.ts'),
  join(SRC, 'client', 'data', 'bindings.ts'),
  join(SRC, 'client', 'data', 'config.ts'),
  join(SRC, 'client', 'data', 'meta.ts'),
  join(SRC, 'client', 'data', 'model.ts'),
  join(SRC, 'features', 'truth-flags', 'flags.ts'),
  join(SRC, 'features', 'truth-flags', 'dom-state.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'sess-marks-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--lib', 'es2023,dom', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}

function locate(base: string, name: string): string {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const full = join(base, e.name);
    if (e.isDirectory()) {
      try { return locate(full, name); } catch { /* continue */ }
    } else if (e.isFile() && e.name === name) return full;
  }
  throw new Error('not found: ' + name);
}

// ---- stub DOM ----
class FakeSvg {
  parentElement: FakeEl;
  constructor(parent: FakeEl) { this.parentElement = parent; }
}
class FakeEl {
  attrs = new Map<string, string>();
  text = '';
  dot: string | null;
  expanded: boolean;
  iconHost: FakeEl | null; // svg 的 parentElement（真实 DOM 中是独立元素，角标挂这里）
  constructor(text: string, dot: string | null, expanded: boolean, withSvg = false) {
    this.text = text; this.dot = dot; this.expanded = expanded;
    this.iconHost = withSvg ? new FakeEl('', null, false) : null;
  }
  get textContent(): string { return this.text; }
  get attributes(): unknown[] { return []; }
  getAttribute(k: string): string | null {
    if (k === 'aria-expanded') return this.expanded ? '' : null;
    const v = this.attrs.get(k);
    return v === undefined ? null : v;
  }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  hasAttribute(k: string): boolean { return this.attrs.has(k); }
  removeAttribute(k: string): void { this.attrs.delete(k); }
  querySelector(_s: string): any {
    if (_s === 'svg') return this.iconHost ? { parentElement: this.iconHost } : null;
    if (this.dot === null) return null;
    const st = this.dot;
    return { getAttribute: (_k: string) => st };
  }
}

let registry: FakeEl[] = [];
const gDoc: any = {
  querySelectorAll: (sel: string): FakeEl[] => {
    if (sel === '[data-dp-sess]') return registry.filter((e) => e.hasAttribute('data-dp-sess'));
    return registry.slice();
  },
};
const gWin: any = { addEventListener: (_t: string, _f: unknown) => { /* 忽略 */ } };
(globalThis as any).document = gDoc;
(globalThis as any).window = gWin;

const req = createRequire(join(tmp, 'run.cjs'));
const sess: any = req(locate(tmp, 'sessions.js'));

function group(pre: string | null, withSvg = true): FakeEl {
  const g = new FakeEl('ws', null, true, withSvg);
  if (pre) g.setAttribute('data-dp-act', pre);
  return g;
}
function row(text: string, dot: string | null): FakeEl { return new FakeEl(text, dot, false); }
function st(key: string, act: string, top: unknown[]): any {
  return { key, ws: '', act, dir: '', time: 1, via: 'name', top };
}
function top1(name: string, kind: string, title: string, open: boolean): unknown {
  return { name, mtime: 100, open, kind, approval: false, title };
}
function actOf(el: FakeEl, k: string): string | null { return el.getAttribute(k); }

test('蓝不变量：原生 ongoing 行蓝 ⇒ 组蓝', () => {
  const g = group(null);
  const r = row('anything', 'ongoing');
  registry = [g, r];
  sess.markSessions([g as any], [st('k1', 'calm', [])]);
  assert.equal(actOf(r, 'data-dp-sess'), 'exec');
  assert.equal(actOf(g, 'data-dp-act'), 'exec');
});

test('黄不变量：原生 warning 行黄 ⇒ 组黄', () => {
  const g = group(null);
  const r = row('anything', 'warning');
  registry = [g, r];
  sess.markSessions([g as any], [st('k2', 'calm', [])]);
  assert.equal(actOf(r, 'data-dp-sess'), 'seen');
  assert.equal(actOf(g, 'data-dp-act'), 'seen');
});

test('红不变量：402 真相行红 ⇒ 组红（无原生点=无完成提醒，走真相路径）', () => {
  const g = group(null);
  const r = row('Task Alpha', null);
  registry = [g, r];
  sess.markSessions([g as any], [st('k3', 'exec', [top1('f1', '402', 'Task Alpha', false)])]);
  assert.equal(actOf(r, 'data-dp-sess'), 'red');
  assert.equal(actOf(g, 'data-dp-act'), 'need');
});

test('清孤儿蓝：组旧蓝 + 已完成闭合（无原生提醒点） ⇒ 组条清除', () => {
  const g = group('exec');
  const r = row('Task Beta', null);
  registry = [g, r];
  sess.markSessions([g as any], [st('k4', 'exec', [top1('f2', 'completed', 'Task Beta', false)])]);
  assert.equal(actOf(r, 'data-dp-sess'), null);
  assert.equal(actOf(g, 'data-dp-act'), null);
});

test('清孤儿黄：组旧黄 + 全无色会话 ⇒ 组条清除', () => {
  const g = group('seen');
  const r = row('Task Gamma', null);
  registry = [g, r];
  sess.markSessions([g as any], [st('k5', 'calm', [])]);
  assert.equal(actOf(r, 'data-dp-sess'), null);
  assert.equal(actOf(g, 'data-dp-act'), null);
});

test('收起例外：无会话行 + 无缓存 ⇒ 组旧色不动', () => {
  const g = group('exec');
  registry = [g];
  sess.markSessions([g as any], [st('k6', 'exec', [])]);
  assert.equal(actOf(g, 'data-dp-act'), 'exec');
});

test('诊断保留：nosig 组 + 全无色会话 ⇒ nosig 不动', () => {
  const g = group('nosig');
  const r = row('zzz-unknown-ws', null);
  registry = [g, r];
  sess.markSessions([g as any], [st('k7', 'sink', [])]);
  assert.equal(actOf(g, 'data-dp-act'), 'nosig');
});

test('角标残环清理（角标已删）：组条清（孤儿）⇒ 组条清除，无角标残留可断言', () => {
  const g = group('seen');
  const r = row('Task Zeta', null);
  registry = [g, r];
  sess.markSessions([g as any], [st('k10', 'calm', [])]);
  assert.equal(actOf(g, 'data-dp-act'), null);
});

test('绿点必黄：原生 done（官方完成提醒）⇒ 行黄+组黄（#497 真机：绿点无条；绿点=官方待看信号，不看水位看绿点）', () => {
  // 场景 A：组 calm（无 open）——原门禁/水位逻辑会拦真相路径，但原生绿点必须直接黄。
  const gA = group(null);
  const rA = row('[#497] 打开日志目录与复制路径报 path-missing', 'done');
  registry = [gA, rA];
  sess.markSessions([gA as any], [st('k11', 'calm', [top1('f6', 'completed', '[#497] 打开日志目录与复制路径报 path-missing', false)])]);
  assert.equal(actOf(rA, 'data-dp-sess'), 'seen', '原生绿点行必须黄（官方完成提醒）');
  assert.equal(actOf(gA, 'data-dp-act'), 'seen', '组级必须聚合出黄');

  // 场景 B：组 act=exec（有 open 会话）时绿点行同样黄。
  const gB = group(null);
  const rB = row('Task Eta', 'done');
  registry = [gB, rB];
  sess.markSessions([gB as any], [st('k12', 'exec', [top1('f7', 'completed', 'Task Eta', false)])]);
  assert.equal(actOf(rB, 'data-dp-sess'), 'seen');
});

test('折叠缓存 B 方案：展开组蓝→收起（无行）⇒ 组条保持蓝非黄（截图实锤：展开蓝→收起黄）', () => {
  // 第一轮：展开（有行）→ 组蓝。
  const g = group(null);
  const r = row('Task Theta', 'ongoing');
  registry = [g, r];
  sess.markSessions([g as any], [st('k13', 'exec', [top1('f8', 'completed', 'Task Theta', false)])]);
  assert.equal(actOf(g, 'data-dp-act'), 'exec');
  // 第二轮：收起（无行）→ 必须保持 exec（蓝），不得回落到数据层 seen（黄）。
  registry = [g];
  sess.markSessions([g as any], [st('k13', 'calm', [])]);
  assert.equal(actOf(g, 'data-dp-act'), 'exec', '收起后组条必须保持展开时的蓝色，不得变黄');
});

test('折叠缓存 B 方案·清：展开组平静→收起⇒ 组条清（缓存空色生效，不残留旧蓝）', () => {
  const g = group(null);
  const r = row('Task Iota', null);
  registry = [g, r];
  sess.markSessions([g as any], [st('k14', 'calm', [top1('f9', 'completed', 'Task Iota', false)])]);
  assert.equal(actOf(g, 'data-dp-act'), null);
  registry = [g];
  sess.markSessions([g as any], [st('k14', 'calm', [])]);
  assert.equal(actOf(g, 'data-dp-act'), null, '收起后保持平静（缓存空色）');
});

test('折叠缓存 B 方案·首见收起：无缓存⇒不动（留 paint 初稿，不擅自改色）', () => {
  const g = group('need');
  registry = [g];
  sess.markSessions([g as any], [st('k15', 'exec', [])]);
  assert.equal(actOf(g, 'data-dp-act'), 'need', '无缓存时收起组不动，留 entry 级初稿');
});

test('组级优先级：红>黄>蓝（2026-09-07 用户裁定；原为红>蓝>黄，黄被蓝压没——组有待看即显黄）', () => {
  // 蓝行 + 黄行 ⇒ 组黄。
  const g1 = group(null);
  const r1a = row('x-a', 'ongoing');
  const r1b = row('x-b', 'done');
  registry = [g1, r1a, r1b];
  sess.markSessions([g1 as any], [st('g1', 'calm', [])]);
  assert.equal(actOf(r1a, 'data-dp-sess'), 'exec', '前置：蓝行成立');
  assert.equal(actOf(r1b, 'data-dp-sess'), 'seen', '前置：黄行成立');
  assert.equal(actOf(g1, 'data-dp-act'), 'seen', '蓝+黄 ⇒ 组黄（黄压蓝）');

  // 黄行 + 红行 ⇒ 组红。
  const g2 = group(null);
  const r2a = row('Task Mu', null);
  const r2b = row('x-c', 'done');
  registry = [g2, r2a, r2b];
  sess.markSessions([g2 as any], [st('g2', 'exec', [top1('f10', '402', 'Task Mu', false)])]);
  assert.equal(actOf(r2a, 'data-dp-sess'), 'red', '前置：红行成立');
  assert.equal(actOf(g2, 'data-dp-act'), 'need', '黄+红 ⇒ 组红（红压黄）');
});

test('组级优先级·三蓝一黄仍黄：黄行存在⇒黄，蓝行再多也压不过', () => {
  const g = group(null);
  registry = [g,
    row('x-d1', 'ongoing'), row('x-d2', 'ongoing'), row('x-d3', 'ongoing'),
    row('x-e', 'done')];
  sess.markSessions([g as any], [st('g2b', 'calm', [])]);
  assert.equal(actOf(g, 'data-dp-act'), 'seen', '三蓝一黄 ⇒ 组黄');
});

rmSync(tmp, { recursive: true, force: true });
console.log('features/session-marks: ALL PASS');
