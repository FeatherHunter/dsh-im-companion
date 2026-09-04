// #17 A线面板联动自验证：共享流订阅 + 失败未知 + 高亮定位（node --test，零第三方依赖）。
// 做法：tsc 转译相关链到临时目录再断言（照抄 c1a-drawer.ts 模式）；DOM 用 dom-shim + 最小 window 事件发射器。
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../dom-shim.ts';

const REPO = process.cwd();
const DATA = join(REPO, 'src', 'client', 'data');
const UIC = join(REPO, 'src', 'client', 'ui');
const COMP = join(REPO, 'src', 'client', 'components');
const ENTRIES = [
  join(DATA, 'config.ts'),
  join(DATA, 'fleet-api.ts'),
  join(DATA, 'meta.ts'),
  join(DATA, 'model.ts'),
  join(DATA, 'bindings.ts'),
  join(DATA, 'connection-stream.ts'),
  join(REPO, 'src', 'client', 'dom.ts'),
  join(REPO, 'src', 'client', 'icons.ts'),
  join(UIC, 'avatar.ts'),
  join(UIC, 'button.ts'),
  join(UIC, 'field.ts'),
  join(UIC, 'list.ts'),
  join(UIC, 'empty.ts'),
  join(UIC, 'segmented.ts'),
  join(UIC, 'menu.ts'),
  join(COMP, 'agent-row.ts'),
  join(COMP, 'row-actions.ts'),
  join(COMP, 'first-view-copy.ts'),
  join(COMP, 'panel-data.ts'),
  join(COMP, 'panel-body.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'a17-'));
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
  console.error('TRANPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction');
} catch {
  /* 已存在则跳过 */
}
const req = createRequire(join(tmp, 'run.cjs'));
const streamMod: any = req('./data/connection-stream.js');
const panelData: any = req('./components/panel-data.js');

const W1 = 'D:\\agents\\xiaoshuai';
const W2 = 'D:\\agents\\xinghuo';
let weixinDown = false;
const botRaw = (id: string, ws: string, st: string) => ({
  botId: id, workspace: ws, connected: st === 'healthy',
  health: { status: st, summary: '', lastCheckedAt: 1000 }, bot: { name: id, avatarUrl: '' },
});
const fakeRpc: any = async (channel: string, endpoint: string) => {
  if (channel === '/im-companion') {
    if (endpoint === 'ping') return { ok: true };
    if (endpoint === 'meta.get') {
      return { ok: true, value: { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} } };
    }
    throw new Error('unknown im-companion endpoint');
  }
  const ch = String(channel).replace(/^\//, '');
  if (endpoint === 'connection.status') {
    if (ch === 'feishu') return { ok: true, value: { bots: [botRaw('bf1', W1, 'healthy')] } };
    if (ch === 'weixin') {
      if (weixinDown) throw new Error('net down');
      return { ok: true, value: { bots: [botRaw('bw1', W2, 'healthy')] } };
    }
    return { ok: false, error: { code: 'NOT_CONFIGURED', message: 'no', details: {} } };
  }
  throw new Error('unknown endpoint');
};

test('共享流单例：同页两次获取为同一实例', () => {
  streamMod.resetSharedStream();
  const a = streamMod.getSharedStream(fakeRpc);
  const b = streamMod.getSharedStream(fakeRpc);
  assert.equal(a, b);
  a.dispose();
  streamMod.resetSharedStream();
});

test('订阅制：失败渠道保留 stale 并记 failed（丢快照判谎报）', async () => {
  streamMod.resetSharedStream();
  weixinDown = false;
  const pd = panelData.createPanelData(fakeRpc);
  let paints = 0;
  pd.setRender(() => { paints++; });
  await pd.load();
  assert.equal(pd.state.loading, false);
  assert.equal(pd.state.bots.length, 2);
  assert.deepEqual(pd.state.failed, []);
  assert.ok(paints > 0);
  weixinDown = true;
  await pd.load(true);
  assert.ok(pd.state.failed.includes('weixin'));
  assert.equal(pd.state.bots.length, 2);
  const kept = pd.state.bots.find((b: any) => b.channel === 'weixin');
  assert.ok(kept && kept.stale === true);
  pd.dispose();
  streamMod.resetSharedStream();
  weixinDown = false;
});

test('行标记 + 失败 tooltip + open-agent 高亮（面板打开时）', async () => {
  streamMod.resetSharedStream();
  weixinDown = true;
  const doc: any = createDocument();
  const listeners = new Map<string, Set<Function>>();
  const win: any = {
    addEventListener: (t: string, fn: Function) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: Function) => { listeners.get(t)?.delete(fn); },
    dispatchEvent: (ev: any) => {
      const set = listeners.get(ev.type);
      if (set) for (const fn of [...set]) fn.call(win, ev);
      return true;
    },
    CustomEvent: class { type: string; detail: unknown; constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; } },
  };
  (globalThis as any).window = win;
  (globalThis as any).document = doc;
  const panelBody: any = req('./components/panel-body.js');
  const bindings: any = req('./data/bindings.js');
  const pd = panelData.createPanelData(fakeRpc);
  pd.setRender(() => {});
  await pd.load();
  const bodyEl: any = doc.createElement('div');
  doc.body.appendChild(bodyEl);
  bodyEl.isConnected = true;
  const titleMeta: any = doc.createElement('div');
  const segStub: any = { setLabel() {}, el: doc.createElement('div'), relayout() {} };
  const noopCb: any = {
    rename() {}, connect() {}, avatarMenu() {}, pickWorkspace() {}, removeBot() {}, deleteLocal() {},
  };
  const body = panelBody.createPanelBody({
    state: pd.state, bodyEl, titleMetaEl: titleMeta, seg: segStub,
    relayout() {}, rowCallbacks: () => noopCb, onRetry() {},
  });
  body.render();
  const rows: any[] = [];
  const walk = (n: any) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeType === 1) {
        try {
          if (c.getAttribute && c.getAttribute('data-agent-key')) rows.push(c);
        } catch { /* 跳过 */ }
        walk(c);
      }
    }
  };
  walk(bodyEl);
  assert.ok(rows.length >= 2, '应渲染出 Agent 行并打标 data-agent-key');
  const w2row = rows.find((r) => r.getAttribute('data-workspace') === W2);
  assert.ok(w2row, '应找到 xinghuo 行');
  const st = w2row.querySelector('.af-status');
  assert.ok(st && String(st.getAttribute('title') ?? '').includes('轮询失败'), '失败渠道 tooltip 透出（轮询失败）');
  bodyEl.querySelectorAll = (sel: string) => (sel === '[data-agent-key]' ? rows : []);
  const w1row = rows.find((r) => r.getAttribute('data-workspace') === W1);
  assert.ok(w1row, '应找到 xiaoshuai 行');
  win.dispatchEvent(new win.CustomEvent(bindings.OPEN_AGENT_EVENT, { detail: { workspace: W1, agent: 'xiaoshuai' } }));
  assert.ok(String(w1row.style?.boxShadow ?? '').includes('ff') || String(w1row.style?.boxShadow ?? '').includes('0a84ff') || String(w1row.style?.boxShadow ?? '').length > 0, '高亮应写入 boxShadow');
  body.dispose();
  pd.dispose();
  streamMod.resetSharedStream();
  weixinDown = false;
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略 */ }
});
