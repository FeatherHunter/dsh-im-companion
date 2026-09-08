// V2-3 行染色验证（node --test）：stub DOM（仿 session-marks.ts FakeEl 模式）＋ 真实 paint.ts。
// 断言：组聚合不变量（组蓝/黄/红 ⇒ 有同色行或 store 同色重演兜底）、折叠组无行读 store 仍黄、
// 同名多候选不染、真相红压黄；样式命名空间 data-unread-*（data-dp-* 退役）；挂载单行日志＋整轮＋卸载。
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
  join(SRC, 'features', 'unread', 'paint.ts'),
  join(SRC, 'features', 'unread', 'paint-mount.ts'),
  join(SRC, 'features', 'unread', 'replay.ts'),
  join(SRC, 'features', 'unread', 'styles.ts'),
  join(SRC, 'features', 'unread', 'manifest.ts'),
  join(SRC, 'features', 'unread', 'events.ts'),
  join(SRC, 'features', 'protocol.ts'),
  join(SRC, 'client', 'data', 'activity.ts'),
  join(SRC, 'client', 'data', 'session-kind.ts'),
  join(SRC, 'client', 'data', 'fleet-api.ts'),
  join(SRC, 'client', 'data', 'config.ts'),
  join(SRC, 'client', 'data', 'connection-stream.ts'),
  join(SRC, 'client', 'data', 'header-overlay.ts'),
  join(SRC, 'client', 'data', 'bindings.ts'),
  join(SRC, 'client', 'data', 'meta.ts'),
  join(SRC, 'client', 'data', 'model.ts'),
  join(SRC, 'client', 'theme.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'unread-paint-'));
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

// ---- stub DOM（FakeEl 模式：attr 读写＋文本＋组/行区分；顺序即文档序） ----
class FakeEl {
  attrs = new Map<string, string>();
  text: string;
  expanded: boolean;
  constructor(text: string, expanded: boolean) {
    this.text = text;
    this.expanded = expanded;
  }
  get textContent(): string { return this.text; }
  getAttribute(k: string): string | null {
    if (k === 'aria-expanded') return this.expanded ? '' : null;
    const v = this.attrs.get(k);
    return v === undefined ? null : v;
  }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  hasAttribute(k: string): boolean { return this.attrs.has(k); }
  removeAttribute(k: string): void { this.attrs.delete(k); }
}

let registry: FakeEl[] = [];
const gDoc: any = {
  querySelectorAll: (sel: string): FakeEl[] => {
    if (sel === '[data-unread-sess]' || sel === '[data-unread-act]') {
      const k = sel.slice(1, -1);
      return registry.filter((e) => e.hasAttribute(k));
    }
    return registry.slice();
  },
};
(globalThis as any).document = gDoc;

const req = createRequire(join(tmp, 'run.cjs'));
const paintMod: any = req(locate(tmp, 'paint.js'));
const paintMountMod: any = req(locate(tmp, 'paint-mount.js'));
const stylesMod: any = req(locate(tmp, 'styles.js'));
const manifestMod: any = req(locate(tmp, 'manifest.js'));

function group(pre: string | null): FakeEl {
  const g = new FakeEl('myws', true);
  if (pre) g.setAttribute('data-unread-act', pre);
  return g;
}
function row(text: string): FakeEl { return new FakeEl(text, false); }
function st(key: string, top: unknown[]): any {
  return { key, ws: '', act: 'calm', dir: '', time: 1, via: 'name', top };
}
function top1(name: string, kind: string, title: string, open: boolean, approval = false): unknown {
  return { name, mtime: 100, open, kind, approval, title };
}
function storeOf(...pairs: Array<[string, number | null, number | null]>): any {
  const o: Record<string, unknown> = {};
  for (const [id, seen, notify] of pairs) o[id] = { seenAt: seen, notifyAt: notify };
  return o;
}
function attr(el: FakeEl, k: string): string | null { return el.getAttribute(k); }

test('蓝：open 会话 ⇒ 行 exec＋组 exec（同色行成立）', () => {
  const g = group(null);
  const r = row('Task Alpha');
  registry = [g, r];
  paintMod.paintUnread([g as any], [st('k1', [top1('u1', 'completed', 'Task Alpha', true)])], storeOf());
  assert.equal(attr(r, 'data-unread-sess'), 'exec');
  assert.equal(attr(g, 'data-unread-act'), 'exec');
});

test('黄：completed＋候选 ⇒ 行 seen＋组 seen（同色行成立）', () => {
  const g = group(null);
  const r = row('Task Beta');
  registry = [g, r];
  paintMod.paintUnread(
    [g as any],
    [st('k2', [top1('u2', 'completed', 'Task Beta', false)])],
    storeOf(['u2', null, 200]),
  );
  assert.equal(attr(r, 'data-unread-sess'), 'seen');
  assert.equal(attr(r, 'data-unread-tip'), '待看');
  assert.equal(attr(g, 'data-unread-act'), 'seen');
});

test('真相红压黄：error＋候选 ⇒ 行红＋组 need（红压黄，不被候选压成黄）', () => {
  const g = group(null);
  const r = row('Task Gamma');
  registry = [g, r];
  paintMod.paintUnread(
    [g as any],
    [st('k3', [top1('u3', 'error boom', 'Task Gamma', false)])],
    storeOf(['u3', null, 200]),
  );
  assert.equal(attr(r, 'data-unread-sess'), 'red');
  assert.equal(attr(r, 'data-unread-tip'), '异常 · 需处理');
  assert.equal(attr(g, 'data-unread-act'), 'need');
});

test('同名多候选不染：双胞胎同标题 ⇒ 行无色；组仍由 store 聚合黄（store 兜底）', () => {
  const g = group(null);
  const r = row('[草稿][新增BUG]');
  registry = [g, r];
  paintMod.paintUnread(
    [g as any],
    [st('k4', [
      top1('u4a', 'completed', '[草稿][新增BUG]', false),
      top1('u4b', 'completed', '[草稿][新增BUG]', false),
    ])],
    storeOf(['u4a', null, 200], ['u4b', null, 200]),
  );
  assert.equal(attr(r, 'data-unread-sess'), null, '双候选不押注，行保持无色');
  assert.equal(attr(g, 'data-unread-act'), 'seen', '组色由 store 重演聚合，不依赖行染色');
});

test('折叠组读 store 仍黄：无行＋候选 ⇒ 组 seen（无 B 缓存也成立）', () => {
  const g = group(null);
  registry = [g];
  paintMod.paintUnread(
    [g as any],
    [st('k5', [top1('u5', 'completed', 'Folded Task', false)])],
    storeOf(['u5', null, 200]),
  );
  assert.equal(attr(g, 'data-unread-act'), 'seen', '折叠组直接读 store 重演，不依赖可见行');
});

test('折叠组红/蓝：无行＋error候选 ⇒ 组 need；无行＋open ⇒ 组 exec', () => {
  const g1 = group(null);
  registry = [g1];
  paintMod.paintUnread(
    [g1 as any],
    [st('k6a', [top1('u6', 'error x', 'Folded Red', false)])],
    storeOf(['u6', null, 200]),
  );
  assert.equal(attr(g1, 'data-unread-act'), 'need');
  const g2 = group(null);
  registry = [g2];
  paintMod.paintUnread(
    [g2 as any],
    [st('k6b', [top1('u7', 'completed', 'Folded Blue', true)])],
    storeOf(),
  );
  assert.equal(attr(g2, 'data-unread-act'), 'exec');
});

test('组聚合优先级红>黄>蓝：三色行 ⇒ 组红；蓝＋黄 ⇒ 组黄', () => {
  const g = group(null);
  const rb = row('Blue Job');
  const ry = row('Yellow Job');
  const rr = row('Red Job');
  registry = [g, rb, ry, rr];
  paintMod.paintUnread(
    [g as any],
    [st('k7', [
      top1('u7b', 'completed', 'Blue Job', true),
      top1('u7y', 'completed', 'Yellow Job', false),
      top1('u7r', '402 pay', 'Red Job', false),
    ])],
    storeOf(['u7y', null, 200]),
  );
  assert.equal(attr(rb, 'data-unread-sess'), 'exec');
  assert.equal(attr(ry, 'data-unread-sess'), 'seen');
  assert.equal(attr(rr, 'data-unread-sess'), 'red');
  assert.equal(attr(g, 'data-unread-act'), 'need', '红压黄压蓝');
  const g2 = group(null);
  const rb2 = row('Blue Job');
  const ry2 = row('Yellow Job');
  registry = [g2, rb2, ry2];
  paintMod.paintUnread(
    [g2 as any],
    [st('k7b', [
      top1('u7c', 'completed', 'Blue Job', true),
      top1('u7d', 'completed', 'Yellow Job', false),
    ])],
    storeOf(['u7d', null, 200]),
  );
  assert.equal(attr(g2, 'data-unread-act'), 'seen', '蓝＋黄 ⇒ 组黄（黄压蓝）');
});

test('平静清理：completed 无候选 ⇒ 行组皆清（旧色不残留）', () => {
  const g = group('need');
  const r = row('Task Calm');
  r.setAttribute('data-unread-sess', 'seen');
  registry = [g, r];
  paintMod.paintUnread(
    [g as any],
    [st('k8', [top1('u8', 'completed', 'Task Calm', false)])],
    storeOf(),
  );
  assert.equal(attr(r, 'data-unread-sess'), null);
  assert.equal(attr(g, 'data-unread-act'), null);
});

test('approval 黄：等你选择 ⇒ 行 seen（待确认 tip）＋组 seen', () => {
  const g = group(null);
  const r = row('Task Wait');
  registry = [g, r];
  paintMod.paintUnread(
    [g as any],
    [st('k9', [top1('u9', 'completed', 'Task Wait', false, true)])],
    storeOf(),
  );
  assert.equal(attr(r, 'data-unread-sess'), 'seen');
  assert.equal(attr(r, 'data-unread-tip'), '待确认 · 等你选择');
  assert.equal(attr(g, 'data-unread-act'), 'seen');
});

test('已看收敛：seenAt>=notifyAt ⇒ 无候选 ⇒ 行组皆清', () => {
  const g = group(null);
  const r = row('Task Seen');
  registry = [g, r];
  paintMod.paintUnread(
    [g as any],
    [st('k10', [top1('u10', 'completed', 'Task Seen', false)])],
    storeOf(['u10', 300, 200]),
  );
  assert.equal(attr(r, 'data-unread-sess'), null);
  assert.equal(attr(g, 'data-unread-act'), null);
});

test('样式命名空间：unread 竖条＋标题色齐备，data-dp-* 前缀退役', () => {
  const css: string = String(stylesMod.CSS);
  assert.ok(css.indexOf('data-unread-act') !== -1, '组竖条属性');
  assert.ok(css.indexOf('data-unread-sess') !== -1, '会话标题色属性');
  assert.ok(css.indexOf('::before') !== -1, '竖条伪元素');
  assert.ok(css.indexOf('unread-blink') !== -1 && css.indexOf('unread-breathe') !== -1, '命名空间动画');
  assert.ok(css.indexOf('#f5b26b') !== -1 && css.indexOf('#7ab8ff') !== -1 && css.indexOf('#ff8a80') !== -1, '#45 标题三色');
  assert.ok(css.indexOf('data-dp-') === -1, 'TEMP 前缀退役');
});

test('manifest：双槽位（events＋paint）＋ installStyles', () => {
  const feat: any = manifestMod.feature;
  assert.equal(feat.id, 'unread');
  assert.equal(feat.slots.length, 2);
  assert.ok(feat.slots.every((s: any) => s.target === 'workspace-rail'));
  assert.equal(typeof feat.installStyles, 'function');
});

test('挂载：单行 [unread] 日志＋快照驱动整轮染色＋卸载清属性', async () => {
  const infos: string[] = [];
  const origInfo = console.info;
  console.info = (...a: unknown[]) => {
    infos.push(a.map(String).join(' '));
  };
  try {
    const g = new FakeEl('myws', true);
    const r = new FakeEl('Mount Task', false);
    registry = [g, r];
    const diags: any[] = [];
    const rpc: any = async (_ch: string, ep: string, _p: unknown, _s: unknown) => {
      if (ep === 'im-companion.unread.diag') diags.push(_p);
      if (ep === 'activity.snapshot') {
        return {
          ok: true,
          value: {
            entries: [{
              dir: 'myws', lastActive: 100, sessions: 1, running: false,
              top: [{ name: 'u11', mtime: 100, open: false, kind: 'completed', approval: false, title: 'Mount Task' }],
            }],
          },
        };
      }
      if (ep === 'im-companion.unread.get') {
        return { ok: true, value: { version: 1, unread: { u11: { seenAt: null, notifyAt: 50 } } } };
      }
      return { ok: false };
    };
    let tick: ((snap: unknown) => void) | null = null;
    const ctx: any = {
      rpc,
      subscribe: (fn: (s: unknown) => void) => {
        tick = fn;
        return () => {
          tick = null;
        };
      },
      get: () => undefined,
    };
    const stop = paintMountMod.mountUnreadPaint(ctx);
    assert.equal(typeof stop, 'function');
    assert.equal(infos.filter((m) => m.indexOf('[unread]') === 0).length, 1, 'mount 只许一行 [unread] 日志');
    tick!({ bots: [], updatedAt: 1 });
    await new Promise((res) => setTimeout(res, 50));
    tick!({ bots: [], updatedAt: 2 });
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(attr(r, 'data-unread-sess'), 'seen', '整轮：候选行染黄');
    assert.equal(attr(g, 'data-unread-act'), 'seen', '整轮：组聚合黄');
    const paintLines = infos.filter((m) => m.indexOf('[unread] paint ') === 0);
    assert.equal(paintLines.length, 1, '状态变化打一行 paint 摘要');
    assert.ok(paintLines[0].indexOf('rows=1') !== -1 && paintLines[0].indexOf('red=0') !== -1, '摘要含计数：' + paintLines[0]);
    assert.equal(infos.filter((m) => m.indexOf('[unread]') === 0).length, 2, 'mount 一行 + paint 摘要一行，此后禁刷屏');
    assert.equal(diags.length, 1, '诊断落盘调用一次');
    assert.deepEqual([diags[0].groups, diags[0].rows, diags[0].red, diags[0].yellow, diags[0].blue], [2, 1, 0, 1, 0]);
    stop();
    assert.equal(attr(r, 'data-unread-sess'), null, '卸载清行属性');
    assert.equal(attr(g, 'data-unread-act'), null, '卸载清组属性');
  } finally {
    console.info = origInfo;
  }
});

test('组 tip 点名：红组列出异常会话（无行可染时可发现）', () => {
  const g = group(null);
  registry = [g];
  paintMod.paintUnread(
    [g as any],
    [st('k1', [
      top1('u1', 'error', '评审 C1 尾部扫描', false),
      top1('u2', 'completed', '普通会话', false),
    ])],
    storeOf(),
  );
  assert.equal(attr(g, 'data-unread-act'), 'need');
  const tip = attr(g, 'data-unread-tip') || '';
  assert.ok(tip.indexOf('评审 C1') !== -1, '点名红会话，tip=' + tip);
  assert.ok(tip.indexOf('普通会话') === -1, '不点名正常会话');
});

test('组 tip 点名：黄组列出未看会话（折叠无行）', () => {
  const g = group(null);
  registry = [g];
  paintMod.paintUnread(
    [g as any],
    [st('k1', [
      top1('u9', 'completed', '待看的重要会话', false),
    ])],
    storeOf(['u9', null, 100]),
  );
  assert.equal(attr(g, 'data-unread-act'), 'seen');
  const tip = attr(g, 'data-unread-tip') || '';
  assert.ok(tip.indexOf('待看的重要会话') !== -1, '点名未看会话，tip=' + tip);
});

test('组 tip 点名 capped 3 个', () => {
  const g = group(null);
  registry = [g];
  paintMod.paintUnread(
    [g as any],
    [st('k1', [
      top1('a1', 'error', '红一号会话', false),
      top1('a2', 'error', '红二号会话', false),
      top1('a3', 'error', '红三号会话', false),
      top1('a4', 'error', '红四号会话', false),
    ])],
    storeOf(),
  );
  const tip = attr(g, 'data-unread-tip') || '';
  assert.ok(tip.indexOf('红三号') !== -1 && tip.indexOf('红四号') === -1, '最多 3 个，tip=' + tip);
});

test('归档排除：红归档不染组不染行', () => {
  const g = group(null);
  const r = row('Archived Task');
  registry = [g, r];
  paintMod.paintUnread([g as any], [st('k1', [
    top1('uZ', 'error', 'Archived Task', false),
  ])], storeOf(), new Set(['uZ']));
  assert.equal(attr(g, 'data-unread-act'), null, '归档红不聚合');
  assert.equal(attr(r, 'data-unread-sess'), null, '归档红不染行');
});

test('cleanup', () => {
  rmSync(tmp, { recursive: true, force: true });
});
