// #29 接入 QR 倒计时自验证（只测本票触碰面：fleet-api 纯逻辑 + connect-flow 回归钉）
// node --test 运行，零第三方依赖；转译仅 fleet-api+config 两文件。
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../dom-shim.ts';

const REPO = process.cwd();
const ENTRIES = [
  join(REPO, 'src', 'client', 'data', 'config.ts'),
  join(REPO, 'src', 'client', 'data', 'fleet-api.ts'),
  join(REPO, 'src', 'client', 'data', 'meta.ts'),
  join(REPO, 'src', 'client', 'dom.ts'),
  join(REPO, 'src', 'client', 'icons.ts'),
  join(REPO, 'src', 'client', 'ui', 'button.ts'),
  join(REPO, 'src', 'client', 'ui', 'menu.ts'),
  join(REPO, 'src', 'client', 'ui', 'modal.ts'),
  join(REPO, 'src', 'client', 'ui', 'toast.ts'),
  join(REPO, 'src', 'client', 'ui', 'dir-picker.ts'),
  join(REPO, 'src', 'client', 'components', 'connect-flow.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'connect-qr-'));
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

/* 地基修复（同 detail-drawer.ts）：tmp 无 node_modules 上溯链，junction 指回仓库。 */
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction');
} catch {
  /* 已存在则跳过 */
}
const req = createRequire(join(tmp, 'run.cjs'));
const api: any = req(locate(tmp, 'fleet-api.js'));

const doc: any = createDocument();
(globalThis as any).window = (globalThis as any).window ?? {
  addEventListener() {}, removeEventListener() {},
  CustomEvent: class { type: string; detail: unknown; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
  dispatchEvent: () => true,
};
(globalThis as any).document = (globalThis as any).document ?? doc;
const picker: any = req(locate(tmp, 'dir-picker.js'));
const flowMod: any = req(locate(tmp, 'connect-flow.js'));

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

test('fmtCountdown 向上取整：到零才 0:00', () => {
  assert.equal(api.fmtCountdown(300000), '5:00');
  assert.equal(api.fmtCountdown(60000), '1:00');
  assert.equal(api.fmtCountdown(59999), '1:00');
  assert.equal(api.fmtCountdown(59000), '0:59');
  assert.equal(api.fmtCountdown(1000), '0:01');
  assert.equal(api.fmtCountdown(1), '0:01');
  assert.equal(api.fmtCountdown(0), '0:00');
  assert.equal(api.fmtCountdown(-500), '0:00');
  assert.equal(api.fmtCountdown(61000), '1:01');
});

test('normalizeProvisionTiming 单位归一与回退', () => {
  const now = 1700000000000;
  const ms = api.normalizeProvisionTiming({ expiresAt: now + 300000, durationMs: 300000 }, now);
  assert.equal(ms.expiresAt, now + 300000);
  assert.equal(ms.durationMs, 300000);
  const sec = api.normalizeProvisionTiming({ expiresAt: now / 1000 + 150, durationMs: 300000 }, now);
  assert.equal(sec.expiresAt, (now / 1000 + 150) * 1000);
  const str = api.normalizeProvisionTiming({ expiresAt: String(now / 1000 + 150) }, now);
  assert.equal(str.expiresAt, (now / 1000 + 150) * 1000);
  const missing = api.normalizeProvisionTiming({}, now);
  assert.equal(missing.expiresAt, now + 300000);
  assert.equal(missing.durationMs, 300000);
  const secDur = api.normalizeProvisionTiming({ expiresAt: now + 300000, durationMs: 300 }, now);
  assert.equal(secDur.durationMs, 300000);
  const past = api.normalizeProvisionTiming({ expiresAt: now - 5000, durationMs: 300000 }, now);
  assert.equal(past.expiresAt, now - 5000);
});

test('connect-flow 回归钉：三根因不复发', () => {
  const src = readFileSync(join(REPO, 'src', 'client', 'components', 'connect-flow.ts'), 'utf8');
  assert.ok(src.includes('normalizeProvisionTiming'), '应使用归一计时');
  assert.ok(src.includes('fmtCountdown'), '应使用 ceil 展示');
  assert.ok(src.includes('const prev = attemptId'), 'begin 应先取上一轮 id 再清');
  assert.ok(src.includes('onClose'), 'modal 应接 onClose 清理');
  assert.ok(src.includes('pollTimer'), 'poll 应走单链 timeout');
  assert.ok(!src.includes('attemptCleanupPrevious'), '误取消本轮的旧函数不得残留');
  assert.ok(!src.includes('querySelector'), '倒计时不得全局 query，应闭包直写');
  assert.ok(!src.includes('setInterval(() => void poll()'), 'poll 不得每次新建 interval');
});

// ---- #49：P1 选择器统一 + P2 绑定落地 ----
test('#49 resolveNewBotId：prov 优先、单 fresh 兜底、多 fresh 不认', () => {
  const bots = (ids: string[]) => ids.map((botId) => ({ botId }));
  assert.equal(api.resolveNewBotId(bots(['b1']), new Set(), undefined), 'b1');
  assert.equal(api.resolveNewBotId(bots(['b0', 'b1', 'b2']), new Set(['b0']), 'b2'), 'b2');
  assert.equal(api.resolveNewBotId(bots(['b0', 'b1']), new Set(['b0']), 'b1'), 'b1');
  assert.equal(api.resolveNewBotId(bots(['b1', 'b2']), new Set(), undefined), undefined);
  assert.equal(api.resolveNewBotId([], new Set(), undefined), undefined);
  assert.equal(api.resolveNewBotId(bots(['b0', 'b1']), new Set(), 'b1'), 'b1');
  assert.equal(api.resolveNewBotId(bots(['b9']), new Set(), 'bx'), 'b9');
  assert.equal(api.resolveNewBotId(bots(['b1']), null, undefined), undefined);
  assert.equal(api.resolveNewBotId(bots(['b9']), null, 'bx'), undefined);
  assert.equal(api.resolveNewBotId(bots(['b9']), null, 'b9'), 'b9');
  assert.equal(api.resolveNewBotId(bots(['b1']), null, 'b1'), 'b1');
});

test('#49 旧分叉移除：调用方统一到共享选择器', () => {
  const gone = join(REPO, 'src', 'client', 'components', 'workspace-picker.ts');
  assert.equal(existsSync(gone), false, 'workspace-picker.ts 旧分叉应删除');
  const flow = readFileSync(join(REPO, 'src', 'client', 'components', 'connect-flow.ts'), 'utf8');
  const acts = readFileSync(join(REPO, 'src', 'client', 'components', 'panel-actions.ts'), 'utf8');
  for (const [name, src] of [['connect-flow', flow], ['panel-actions', acts]] as const) {
    assert.ok(!src.includes('workspace-picker'), name + ' 不得再引用旧分叉');
    assert.ok(src.includes('openDirPicker'), name + ' 应走共享 openDirPicker');
  }
  assert.ok(flow.includes('resolveNewBotId'), '应使用唯一新机器人识别');
  assert.ok(flow.includes('commitBinding'), '落定应走可测编排');
  assert.ok(flow.includes('removeLocal'), '成功后应清 local 空壳（名字跟人走）');
  assert.ok(flow.includes('createMetaStore'), '改名/清壳应走 MetaStore');
  assert.ok(acts.includes('名字跟人走'), '换家也应名字跟人走');
  assert.ok(acts.includes('尚无机器人'), '无 bot 空壳不得空选家');
  assert.ok(!flow.includes("(e: unknown) => toast('绑定失败"), '吞错旧式 catch 不得残留');
  const preview = readFileSync(join(REPO, 'src', 'dev', 'preview-host.ts'), 'utf8');
  assert.ok(preview.includes('fs.roots'), '预览 mock 应补盘符入口');
  const theme = readFileSync(join(REPO, 'src', 'client', 'theme.ts'), 'utf8');
  const barRule = theme.match(/\.af-dirbar\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(barRule.includes('line-height'), '路径条须自带 line-height（防宿主继承挤压）');
  assert.ok(barRule.includes('align-items'), '路径条须居中对齐');
  assert.ok(barRule.includes('flex: none'), '路径条不得被 flex 压缩（内容要多大给多大）');
  assert.ok(barRule.includes('overflow: visible'), '路径条永不滚动（纵轨禁区）');
  assert.ok(!barRule.includes('max-height'), '路径条不得封顶高度');
});

test('#49 openDirPicker：工作区文案覆盖且默认不变', async () => {
  const fakeRpc = async (_ch: string, ep: string) => {
    if (ep === 'fs.defaultRoot') return { ok: true, value: { path: '/root' } };
    return { ok: true, value: { path: '/root', parent: '/', entries: [{ name: 'a', path: '/root/a' }] } };
  };
  const d = picker.openDirPicker(fakeRpc, '');
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(texts(d.el).join('|').includes('选择目录'));
  d.el.querySelectorAll('.af-btn').find((b: any) => b.textContent === '取消')
    .dispatchEvent({ type: 'click' });
  assert.equal(await d.promise, null);

  const w = picker.openDirPicker(fakeRpc, '', undefined, picker.WORKSPACE_PICKER_COPY);
  await new Promise((r) => setTimeout(r, 30));
  const all = texts(w.el).join('|');
  assert.ok(all.includes('选择工作区'));
  assert.ok(all.includes('作为它的'));
  assert.ok(!all.includes('选择目录'));
  w.el.querySelectorAll('.af-btn').find((b: any) => b.textContent === '取消')
    .dispatchEvent({ type: 'click' });
  assert.equal(await w.promise, null);
});

test('#49 ctxNativePicker：直连优先、get 透传、无则 undefined', async () => {
  let thisOf: unknown = null;
  const direct = { pickDirectory(this: unknown) { thisOf = this; return Promise.resolve('D:\\home'); } };
  const fn1 = picker.ctxNativePicker({ uiWorkspace: direct });
  assert.equal(typeof fn1, 'function');
  assert.equal(await fn1(), 'D:\\home');
  assert.equal(thisOf, direct);
  const via = { pickDirectory: () => Promise.resolve('/v') };
  const fn2 = picker.ctxNativePicker({ get: (n: string) => (n === 'uiWorkspace' ? via : undefined) });
  assert.equal(typeof fn2, 'function');
  assert.equal(await fn2(), '/v');
  assert.equal(picker.ctxNativePicker({}), undefined);
  assert.equal(picker.ctxNativePicker(null), undefined);
  assert.equal(picker.ctxNativePicker({ uiWorkspace: {} }), undefined);
});

test('#49 commitBinding：落定/失败/取消/已绑/关联失败', async () => {
  const run = async (setRes: unknown, opts: any = {}) => {
    const calls: string[] = [];
    const toasts: string[] = [];
    let done = 0;
    const fakeRpc = async (ch: string, ep: string) => {
      calls.push(ch + ' ' + ep);
      if (ch === '/im-companion' && ep === 'ping') return { ok: true, value: {} };
      if (ep === 'meta.rename' || ep === 'meta.local.remove') {
        if (opts.renameThrows) throw new Error('meta down');
        return { ok: true, value: {} };
      }
      if (ep === 'bot.workspace.set') {
        if (opts.setThrows) throw new Error('net down');
        return setRes;
      }
      return { ok: false, error: { code: 'x', message: 'x', details: {} } };
    };
    const ok = await flowMod.commitBinding({
      rpc: fakeRpc, channel: 'wechat',
      toast: (m: string, k?: string) => { toasts.push((k ?? '') + ':' + m); },
      onDone: () => { done++; },
      botId: 'new1', ws: opts.ws === undefined ? 'D:\\home\\xiaoshuai' : opts.ws,
      prevWorkspace: opts.prev ?? '', agentName: opts.name === undefined ? '小帅' : opts.name,
    });
    return { calls, toasts: toasts.join('|'), done, ok };
  };
  {
    const r = await run({ ok: true, value: {} });
    assert.equal(r.ok, true);
    assert.ok(r.calls.includes('/wechat bot.workspace.set'));
    assert.ok(r.calls.includes('/im-companion meta.rename'));
    assert.ok(r.calls.includes('/im-companion meta.local.remove'));
    assert.ok(r.toasts.includes('已接入并绑定工作区'));
    assert.ok(!r.toasts.includes('绑定失败'));
    assert.equal(r.done, 1);
  }
  {
    const r = await run({ ok: false, error: { message: 'denied' } });
    assert.equal(r.ok, false);
    assert.ok(r.toasts.includes('绑定失败：denied'));
    assert.ok(!r.toasts.includes('已接入并绑定工作区'));
    assert.ok(!r.calls.some((c) => c.includes('meta.')));
    assert.equal(r.done, 1);
  }
  {
    const r = await run(null, { setThrows: true });
    assert.equal(r.ok, false);
    assert.ok(r.toasts.includes('绑定失败：net down'));
    assert.ok(!r.toasts.includes('已接入并绑定工作区'));
    assert.equal(r.done, 1);
  }
  {
    const r = await run({ ok: true, value: {} }, { ws: null });
    assert.equal(r.ok, false);
    assert.ok(r.toasts.includes('选择工作区'));
    assert.equal(r.calls.length, 0);
    assert.equal(r.done, 1);
  }
  {
    const r = await run({ ok: true, value: {} }, { prev: 'D:\\old' });
    assert.equal(r.ok, true);
    assert.ok(!r.calls.some((c) => c.includes('meta.')));
    assert.ok(r.toasts.includes('已接入并绑定工作区'));
    assert.equal(r.done, 1);
  }
  {
    const r = await run({ ok: true, value: {} }, { renameThrows: true });
    assert.equal(r.ok, true);
    assert.ok(r.toasts.includes('已接入并绑定工作区'));
    assert.ok(r.toasts.includes('名称关联失败'));
    assert.equal(r.done, 1);
  }
});

rmSync(tmp, { recursive: true, force: true });
