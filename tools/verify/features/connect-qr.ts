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
  join(REPO, 'src', 'client', 'components', 'panel-actions.ts'),
  join(REPO, 'src', 'client', 'components', 'compose-bar.ts'),
  join(REPO, 'src', 'client', 'components', 'agent-row.ts'),
  join(REPO, 'src', 'client', 'data', 'model.ts'),
  join(REPO, 'src', 'host', 'meta-store.ts'),
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
(globalThis as any).requestAnimationFrame = (globalThis as any).requestAnimationFrame
  ?? ((fn: (...a: any[]) => void) => setTimeout(() => fn(Date.now()), 0) as unknown as number);
(globalThis as any).cancelAnimationFrame = (globalThis as any).cancelAnimationFrame
  ?? ((id: any) => clearTimeout(id));
const picker: any = req(locate(tmp, 'dir-picker.js'));
const flowMod: any = req(locate(tmp, 'connect-flow.js'));
const clientMeta: any = req(locate(tmp, 'meta.js'));
const modelMod: any = req(locate(tmp, 'model.js'));
const hostStore: any = req(locate(tmp, 'meta-store.js'));
const actsMod: any = req(locate(tmp, 'panel-actions.js'));
const composeMod: any = req(locate(tmp, 'compose-bar.js'));
const rowMod: any = req(locate(tmp, 'agent-row.js'));

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
  }
  /* #62 取代 #49 部分约定：connect-flow 不再走二次选家（创建即带家、扫码直绑）；
   * 共享选择器改由创建表单（panel.ts 接线）与选家动作（panel-actions）使用，不开新分叉。 */
  assert.ok(acts.includes('openDirPicker'), 'panel-actions 选家应走共享 openDirPicker');
  assert.ok(!flow.includes('openDirPicker'), '#62 后 connect-flow 不得再弹二次选家窗');
  assert.ok(!panelComposeSrc().includes('workspace-picker'), '创建表单不得复活旧分叉');
  function panelComposeSrc(): string {
    return readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8')
      + readFileSync(join(REPO, 'src', 'client', 'components', 'compose-bar.ts'), 'utf8');
  }
  assert.ok(flow.includes('resolveNewBotId'), '应使用唯一新机器人识别');
  assert.ok(flow.includes('commitBinding'), '落定应走可测编排');
  /* #62：二次选家分叉已删，尾链兜底改为直绑失败如实报错（禁静默死约定不变）。 */
  assert.ok(flow.includes('绑定工作区失败'), '直绑尾链须有兜底报错（禁静默死）');
  assert.ok(flow.includes('workspace-bot-not-found'), '登记竞态应重试');
  assert.ok(flow.includes('removeLocal'), '成功后应清 local 空壳（名字跟人走）');
  assert.ok(flow.includes('createMetaStore'), '改名/清壳应走 MetaStore');
  assert.ok(acts.includes('名字跟人走'), '换家也应名字跟人走');
  assert.ok(acts.includes('只落家'), '无 bot 只落家（家不以 bot 为前置）');
  assert.ok(acts.includes('setLocalWorkspace'), '落家应走 MetaStore');
  assert.ok(!acts.includes('尚无机器人'), '禁空选家旧逻辑不得残留');
  const modelSrc = readFileSync(join(REPO, 'src', 'client', 'data', 'model.ts'), 'utf8');
  assert.ok(modelSrc.includes("l.workspace ? '工作区·'"), '有家空壳应展示家路径');
  const dirPickerSrc = readFileSync(join(REPO, 'src', 'client', 'ui', 'dir-picker.ts'), 'utf8');
  const doneAt = dirPickerSrc.indexOf('const done');
  const resolveAt = dirPickerSrc.indexOf('resolveFn(v)', doneAt);
  const closeAt = dirPickerSrc.indexOf('modal?.close()', doneAt);
  assert.ok(doneAt !== -1 && resolveAt !== -1 && closeAt !== -1 && resolveAt < closeAt, '先回值再关窗（关窗触发 onClose 会抢占 null）');
  assert.ok(dirPickerSrc.includes('settled'), '回值须幂等');
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
        if (opts.setSeq && opts.setSeq.length) return opts.setSeq.shift();
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
      notFoundRetry: opts.retry,
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
  {
    const notFound = { ok: false, error: { code: 'workspace-bot-not-found', message: '找不到要修改的机器人。' } };
    const r = await run(null, {
      setSeq: [notFound, { ok: true, value: {} }],
      retry: { attempts: 3, gapMs: 1 },
    });
    assert.equal(r.ok, true);
    assert.ok(r.toasts.includes('登记新机器人'));
    assert.ok(r.toasts.includes('已接入并绑定工作区'));
    assert.equal(r.calls.filter((c) => c === '/wechat bot.workspace.set').length, 2);
    assert.equal(r.done, 1);
  }
  {
    const notFound = { ok: false, error: { code: 'workspace-bot-not-found', message: '找不到要修改的机器人。' } };
    const r = await run(null, {
      setSeq: [notFound, notFound, notFound, notFound],
      retry: { attempts: 3, gapMs: 1 },
    });
    assert.equal(r.ok, false);
    assert.ok(r.toasts.includes('绑定失败：找不到要修改的机器人。'));
    assert.ok(!r.toasts.includes('已接入并绑定工作区'));
    assert.equal(r.calls.filter((c) => c === '/wechat bot.workspace.set').length, 3);
    assert.equal(r.done, 1);
  }
});

test('#49 家落 local：host 落盘＋双 Store 写透', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'issue49-home-'));
  try {
    const f = join(dir, 'meta.json');
    const s = new hostStore.AgentMetaStore(f);
    await s.addLocal('小帅');
    await s.setLocalWorkspace('小帅', 'D:\\agents\\xiaoshuai');
    assert.deepEqual(s.snapshot().locals, [{ name: '小帅', workspace: 'D:\\agents\\xiaoshuai' }]);
    await s.setLocalWorkspace('不存在', 'D:\\x');
    await s.setLocalWorkspace('', 'D:\\x');
    assert.deepEqual(s.snapshot().locals, [{ name: '小帅', workspace: 'D:\\agents\\xiaoshuai' }]);
    const s2 = new hostStore.AgentMetaStore(f);
    await s2.load();
    assert.deepEqual(s2.snapshot().locals, [{ name: '小帅', workspace: 'D:\\agents\\xiaoshuai' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const seen: string[] = [];
  const rpcStore = new clientMeta.RpcMetaStore('/im-companion', async (ch: string, ep: string, pl: any) => {
    seen.push(ch + ' ' + ep + ' ' + JSON.stringify(pl));
    return { ok: true, value: {} };
  });
  await rpcStore.setLocalWorkspace('小帅', 'D:\\agents\\xiaoshuai');
  assert.ok(seen.includes('/im-companion meta.local.workspace {"name":"小帅","workspace":"D:\\\\agents\\\\xiaoshuai"}'));
  const bag: Record<string, string> = {};
  const local = new clientMeta.LocalMetaStore({ getItem: (k: string) => bag[k] ?? null, setItem: (k: string, v: string) => { bag[k] = v; } });
  await local.addLocal('小帅');
  await local.setLocalWorkspace('小帅', 'D:\\agents\\xiaoshuai');
  assert.deepEqual((await local.loadMeta()).locals, [{ name: '小帅', workspace: 'D:\\agents\\xiaoshuai' }]);
});

test('#49 无机器人选家：只落家不绑 bot', async () => {
  const calls: string[] = [];
  const stored: string[] = [];
  let refreshed = 0;
  const fakeRpc = async (ch: string, ep: string) => {
    calls.push(ch + ' ' + ep);
    if (ep === 'fs.defaultRoot') return { ok: true, value: { path: 'D:\\agents' } };
    if (ep === 'fs.list') return { ok: true, value: { path: 'D:\\agents', parent: 'D:\\', entries: [] } };
    if (ep === 'meta.local.workspace' || ep === 'meta.rename') {
      stored.push(ep);
      return { ok: true, value: {} };
    }
    if (ep === 'ping') return { ok: true, value: {} };
    return { ok: false, error: { code: 'x', message: 'x', details: {} } };
  };
  const deps = {
    ctx: {}, rpc: fakeRpc,
    getStore: () => new clientMeta.RpcMetaStore('/im-companion', fakeRpc as any),
    getMeta: () => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }),
    refresh: async () => { refreshed++; },
    loadMeta: async () => undefined,
    render: () => undefined,
  };
  const view = { name: '小帅', workspace: '', bots: [] };
  const pending = actsMod.createPanelActions(deps).pickWorkspace(view as any);
  await new Promise((r) => setTimeout(r, 40));
  const choose = doc.body.querySelectorAll('.af-btn').find((b: any) => b.textContent === '选择此目录');
  assert.ok(choose, '选家弹窗应出现且可确认');
  choose.dispatchEvent({ type: 'click' });
  await pending;
  assert.ok(!calls.some((c) => c.includes('bot.workspace.set')), '无 bot 不得调 set');
  assert.ok(stored.includes('meta.local.workspace'), '应落家到 local');
  assert.ok(stored.includes('meta.rename'), '应记家名');
  assert.equal(refreshed, 1);
  const cancelLeft = doc.body.querySelectorAll('.af-btn').find((b: any) => b.textContent === '选择此目录');
  assert.equal(cancelLeft, undefined, '弹窗应已关闭');
});

test('#49 有家空壳展示家路径', () => {
  const metaDoc = { names: {}, avatars: {}, locals: [{ name: '小帅', workspace: 'D:\\agents\\xiaoshuai' }], presets: {}, ctxEnhance: {} };
  const m = modelMod.buildModel([], metaDoc, 'agent', '');
  const row = m.agents.find((v: any) => v.name === '小帅');
  assert.ok(row, '空壳行应在');
  assert.equal(row.workspaceLine, '工作区·D:\\agents\\xiaoshuai');
  assert.equal(row.sub, '尚未接入渠道');
});

// ---- #62：创建时强制选 HOME（源头预防 A；B 移出范围）----
test('#62 canConnect：无家不可接入、有家可接入', () => {
  assert.equal(actsMod.canConnect({ workspace: '' }), false);
  assert.equal(actsMod.canConnect({ workspace: 'D:\\agents\\xiaoshuai' }), true);
});

test('#62 create：无工作区拒绝创建、有工作区原子落家', async () => {
  const calls: string[] = [];
  const fakeStore = {
    addLocal: async (n: string) => { calls.push('addLocal:' + n); },
    setLocalWorkspace: async (n: string, ws: string) => { calls.push('setLocalWorkspace:' + n + '|' + ws); },
    rename: async (k: string, n: string) => { calls.push('rename:' + k + '|' + n); },
  };
  let rendered = 0;
  const deps = issue62Deps({
    rpc: null,
    getStore: () => fakeStore,
    render: () => { rendered++; },
  });
  const acts = actsMod.createPanelActions(deps);
  await acts.create('小帅', '');
  assert.ok(!calls.some((c) => c.startsWith('addLocal')), '无家不得创建空壳：' + calls.join(','));
  assert.equal(rendered, 0);
  await acts.create('小帅', 'D:\\agents\\xiaoshuai');
  assert.ok(calls.includes('addLocal:小帅'), calls.join(','));
  assert.ok(calls.includes('setLocalWorkspace:小帅|D:\\agents\\xiaoshuai'), calls.join(','));
  assert.ok(calls.includes('rename:D:\\agents\\xiaoshuai|小帅'), calls.join(','));
  assert.equal(rendered, 1);
});

test('#62 create：同名已存在不覆写其家', async () => {
  const calls: string[] = [];
  const fakeStore = {
    addLocal: async (n: string) => { calls.push('addLocal:' + n); },
    setLocalWorkspace: async (n: string, ws: string) => { calls.push('setLocalWorkspace:' + n + '|' + ws); },
    rename: async (k: string, n: string) => { calls.push('rename:' + k + '|' + n); },
  };
  const deps = issue62Deps({
    rpc: null,
    getStore: () => fakeStore,
    getMeta: () => ({ names: {}, avatars: {}, locals: [{ name: '小帅', workspace: 'D:\\old' }], presets: {}, ctxEnhance: {} }),
  });
  await actsMod.createPanelActions(deps).create('小帅', 'D:\\new');
  assert.equal(calls.length, 0, '同名复建不得动旧家：' + calls.join(','));
});

test('#62 create：存储未就绪不空报创建', async () => {
  (doc as any).body.replaceChildren();
  let rendered = 0;
  const deps = issue62Deps({ rpc: null, getStore: () => null, render: () => { rendered++; } });
  await actsMod.createPanelActions(deps).create('小帅', 'D:\\agents\\xiaoshuai');
  assert.equal(rendered, 0, '存储未就绪不得渲染成功态');
  assert.ok(texts((doc as any).body).join('|').includes('连接服务不可用'), '应如实报错而非空报创建');
  (doc as any).body.replaceChildren();
});

function issue62Rpc() {
  return async (_ch: string, ep: string) => {
    if (ep === 'ping') return { ok: true, value: {} };
    if (ep === 'fs.defaultRoot') return { ok: true, value: { path: 'D:\\agents' } };
    if (ep === 'fs.list') return { ok: true, value: { path: 'D:\\agents', parent: 'D:\\', entries: [] } };
    if (ep === 'meta.local.workspace' || ep === 'meta.rename') return { ok: true, value: {} };
    return { ok: false, error: { code: 'x', message: 'x' } };
  };
}

function issue62Anchor(): any {
  const a = (doc as any).createElement('button');
  a.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  return a;
}

/** #62 deps 样板（各测按需覆盖 getStore/getMeta/render；默认走 RpcMetaStore 假桥）。 */
function issue62Deps(over: Record<string, any> = {}): any {
  const fakeRpc = issue62Rpc();
  return {
    ctx: {}, rpc: fakeRpc,
    getStore: () => new clientMeta.RpcMetaStore('/im-companion', fakeRpc as any),
    getMeta: () => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }),
    refresh: async () => undefined,
    loadMeta: async () => undefined,
    render: () => undefined,
    ...over,
  };
}

test('#62 connect：无家阻断扫码并引导选家', async () => {
  (doc as any).body.replaceChildren();
  const deps = issue62Deps();
  actsMod.createPanelActions(deps).connect({ name: '小帅', workspace: '', bots: [], isLocal: true }, issue62Anchor());
  await new Promise((r) => setTimeout(r, 40));
  const titles = (doc as any).body.querySelectorAll('.af-modal-title').map((e: any) => e.textContent);
  assert.ok(titles.some((t: string) => t.includes('选择工作区')), '无家应直接引导选家：' + titles.join(','));
  assert.equal((doc as any).body.querySelectorAll('.af-menu').length, 0, '无家不得弹出渠道扫码菜单');
  (doc as any).body.replaceChildren();
});

test('#62 connect：有家仍走扫码菜单（回归）', async () => {
  (doc as any).body.replaceChildren();
  (doc as any).documentElement = (doc as any).documentElement ?? { clientWidth: 1280 };
  const deps = issue62Deps();
  actsMod.createPanelActions(deps).connect({ name: '小帅', workspace: 'D:\\agents\\xiaoshuai', bots: [], isLocal: true }, issue62Anchor());
  await new Promise((r) => setTimeout(r, 20));
  const all = texts((doc as any).body).join('|');
  assert.ok(all.includes('接入'), '有家应保留扫码入口：' + all.slice(0, 200));
  (doc as any).body.replaceChildren();
});

test('#62 compose-bar：选家前不提交、选家后原子提交', async () => {
  const seen: [string, string][] = [];
  let picked: string | null = null;
  const bar = composeMod.makeComposeBar((name: string, ws: string) => { seen.push([name, ws]); }, {
    pickWorkspace: async () => picked,
  });
  (bar.input as any).focus = () => undefined;
  bar.setVisible(true);
  bar.input.value = '小帅';
  bar.input.dispatchEvent({ type: 'input' });
  const byText = (t: string) => (bar.el as any).querySelectorAll('.af-btn').find((b: any) => (b.textContent ?? '').includes(t));
  assert.ok(byText('选择工作区'), '创建表单须内嵌选家按钮');
  /* 双行布局：容器挂新类、两行各就其位（单行 5 元素窄栏必挤折行）。 */
  assert.ok((bar.el as any).classList.contains('af-compose--create'), '创建表单应走双行容器');
  assert.equal((bar.el as any).querySelectorAll('.af-compose-row').length, 2, '名字行与选家行应分开');
  assert.equal(byText('创建').disabled, true, '未选家时创建应置灰');
  byText('创建').dispatchEvent({ type: 'click' });
  assert.equal(seen.length, 0, '未选家不得提交');
  picked = 'D:\\agents\\xiaoshuai';
  byText('选择工作区').dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(((bar.el as any).textContent ?? '').includes('xiaoshuai'), '应回显所选之家');
  assert.ok(!byText('创建').disabled, '选家后创建应可用');
  byText('创建').dispatchEvent({ type: 'click' });
  assert.deepEqual(seen, [['小帅', 'D:\\agents\\xiaoshuai']]);
  byText('取消').dispatchEvent({ type: 'click' });
  bar.setVisible(true);
  assert.equal(byText('创建').disabled, true, '取消后重开不得复用旧家');
  assert.ok(((bar.el as any).textContent ?? '').includes('尚未选择工作区'), '取消后重开应回占位');
});

test('#62 agent-row：无家接入置灰、有家可用', () => {
  const noop = () => undefined;
  const cb = { rename: noop, connect: noop, avatarMenu: noop, pickWorkspace: noop, removeBot: noop, deleteLocal: noop };
  const base = {
    key: 'local:小帅', base: '', name: '小帅', initial: '小', avatar: null, workspace: '',
    channels: [], status: 'offline', stateLabel: '未接入', isLocal: true,
    sub: '尚未接入渠道', workspaceLine: '未绑定工作区', healthDetail: '', bots: [],
  };
  const rowNo = rowMod.makeAgentRow(base, cb, 'agent');
  const joinNo = (rowNo as any).querySelectorAll('.af-btn').find((b: any) => (b.textContent ?? '').includes('接入'));
  assert.ok(joinNo, '应有接入按钮');
  assert.equal(joinNo.disabled, true, '无家接入应置灰');
  assert.ok(((joinNo as any).getAttribute('title') ?? '').includes('选择工作区'), '置灰须说明去选家');
  const rowYes = rowMod.makeAgentRow({ ...base, workspace: 'D:\\agents\\xiaoshuai' }, cb, 'agent');
  const joinYes = (rowYes as any).querySelectorAll('.af-btn').find((b: any) => (b.textContent ?? '').includes('接入'));
  assert.ok(joinYes, '应有接入按钮');
  assert.ok(!(joinYes as any).disabled, '有家接入应可用');
});

test('#62 connect-flow：扫码成功后直绑、不再弹二次选家', () => {
  const src = readFileSync(join(REPO, 'src', 'client', 'components', 'connect-flow.ts'), 'utf8');
  assert.ok(!src.includes('openDirPicker'), '不得再弹可取消的二次选家窗');
  assert.ok(src.includes('target.workspace'), '无家应有守卫');
});

test('#62 commitBinding：空工作区提示须指向真能补绑的卡', async () => {
  const toasts: string[] = [];
  let done = 0;
  const ok = await flowMod.commitBinding({
    rpc: async () => ({ ok: true, value: {} }),
    channel: 'wechat',
    toast: (m: string, k?: string) => { toasts.push((k ?? '') + ':' + m); },
    onDone: () => { done++; },
    botId: 'new1', ws: null, prevWorkspace: '', agentName: '小帅',
  });
  assert.equal(ok, false);
  assert.ok(toasts.join('|').includes('该机器人所在卡片'), '须指明去有 Bot 的卡补绑：' + toasts.join('|'));
  assert.equal(done, 1);
});

test('#62 创建接线：面板创建表单必带选家', () => {
  const panel = readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8');
  const compose = readFileSync(join(REPO, 'src', 'client', 'components', 'compose-bar.ts'), 'utf8');
  assert.ok(compose.includes('选择工作区'), '创建表单须内嵌选家');
  assert.ok(panel.includes('openDirPicker'), '面板须为创建表单接选家器');
});

rmSync(tmp, { recursive: true, force: true });
