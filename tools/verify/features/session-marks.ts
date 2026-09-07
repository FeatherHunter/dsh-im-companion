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
class FakeEl {
  attrs = new Map<string, string>();
  text = '';
  dot: string | null;
  expanded: boolean;
  constructor(text: string, dot: string | null, expanded: boolean) {
    this.text = text; this.dot = dot; this.expanded = expanded;
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
const act: any = req(locate(tmp, 'activity.js'));

function group(pre: string | null): FakeEl {
  const g = new FakeEl('ws', null, true);
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

test('红不变量：402 真相行红 ⇒ 组红', () => {
  const g = group(null);
  const r = row('Task Alpha', 'done');
  registry = [g, r];
  sess.markSessions([g as any], [st('k3', 'exec', [top1('f1', '402', 'Task Alpha', false)])]);
  assert.equal(actOf(r, 'data-dp-sess'), 'red');
  assert.equal(actOf(g, 'data-dp-act'), 'need');
});

test('清孤儿蓝：组旧蓝 + 已完成且已看（水位不新） ⇒ 组条清除', () => {
  const g = group('exec');
  const r = row('Task Beta', 'done');
  registry = [g, r];
  act.seedSessionSeen([{ key: 'k4/f2', mtime: 100 }]);
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

test('收起例外：无会话行 ⇒ 组旧色不动', () => {
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

rmSync(tmp, { recursive: true, force: true });
console.log('features/session-marks: ALL PASS');
