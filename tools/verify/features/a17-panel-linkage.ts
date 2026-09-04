// #17 A线面板联动自验证：共享流订阅 + 失败未知 tooltip（直跑：node tools/verify/features/a17-panel-linkage.ts；零第三方依赖）。
// 做法：tsc 转译相关链到临时目录再断言（照抄 detail-drawer.ts 模式）；DOM 用 dom-shim + 最小 window 事件发射器。
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

const dropStream = () => {
  try {
    streamMod.getSharedStream(fakeRpc).dispose();
  } catch { /* 无实例则跳过 */ }
  streamMod.resetSharedStream();
};

test('共享流单例：同页两次获取为同一实例', () => {
  streamMod.resetSharedStream();
  const a = streamMod.getSharedStream(fakeRpc);
  const b = streamMod.getSharedStream(fakeRpc);
  assert.equal(a, b);
  dropStream();
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
  dropStream();
  weixinDown = false;
});

test('失败 tooltip 透出（轮询失败），健康渠道不带后缀', async () => {
  streamMod.resetSharedStream();
  weixinDown = false;
  const doc: any = createDocument();
  (globalThis as any).document = doc;
  const panelBody: any = req('./components/panel-body.js');
  const pd = panelData.createPanelData(fakeRpc);
  pd.setRender(() => {});
  await pd.load();
  weixinDown = true;
  await pd.load(true);
  const bodyEl: any = doc.createElement('div');
  doc.body.appendChild(bodyEl);
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
  const statuses: any[] = [];
  const walk = (n: any) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeType === 1) {
        try {
          if (c.classList && c.classList.contains('af-status')) statuses.push(c);
        } catch { /* 跳过 */ }
        walk(c);
      }
    }
  };
  walk(bodyEl);
  assert.ok(statuses.length >= 2, '应渲染出 Agent 状态行');
  const failedOne = statuses.filter((s) => String(s.getAttribute('title') ?? '').includes('轮询失败'));
  assert.equal(failedOne.length, 1, '仅失败渠道行带（轮询失败）后缀');
  pd.dispose();
  dropStream();
  weixinDown = false;
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略 */ }
});
