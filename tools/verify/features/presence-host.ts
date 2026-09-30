// #98 验证（presence 宿主侧）：动效开关偏好的落盘与读回（`meta.motion.set` + `meta.get` 全量快照）。
//
// 为什么单独立一个宿主侧验证器：真机宿主进程加载的是**已装版本**，本票改的 `src/host/*` 不经一次宿主重载
// 不会生效（AGENTS.md 生效门：客户端 Ctrl+F5 即可，宿主侧要重载/重启）⇒ 持久化这一半必须由测试兜住，
// 不能只靠真机截图。做法与 update-host.ts 同款：用仓库 tsconfig 把 src/（连带 src/host）转译到临时目录，
// 再 import 产物跑**真实现**（真 AgentMetaStore + 真端点分发），只把「盘」换成临时目录。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const BUILD = mkdtempSync(join(tmpdir(), 't98-presence-host-'));
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json',
    '--outDir', BUILD, '--declarationDir', join(BUILD, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(BUILD, 'package.json'), '{"type": "module"}\n');
// host 半有裸模块依赖（src/host/update.ts 按包真身 import 'dsh-plugin-update'），临时目录挂 junction 指回本仓。
try { symlinkSync(join(REPO, 'node_modules'), join(BUILD, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }

const HOST = join(BUILD, 'host');
const load = async (name: string): Promise<any> => import(pathToFileURL(join(HOST, name)).href);
const metaMod: any = await load('meta-store.js');
const rpcMod: any = await load('rpc.js');

const FIXTURE = mkdtempSync(join(tmpdir(), 't98-fixture-'));
after(() => {
  rmSync(BUILD, { recursive: true, force: true });
  rmSync(FIXTURE, { recursive: true, force: true });
});

let seq = 0;
/** 一盘一档：<FIXTURE>/r<n>/meta.json 为真存储文件；handler 用真分发器（dshHome 指向同一临时家目录）。 */
function makeStore(seed?: string) {
  const n = ++seq;
  const home = join(FIXTURE, 'r' + n);
  const file = join(home, 'meta.json');
  mkdirSync(home, { recursive: true });
  if (seed !== undefined) writeFileSync(file, seed, 'utf8');
  const store = new metaMod.AgentMetaStore(file);
  const handler = rpcMod.createAgentFleetHandler(store, { dshHome: home });
  return { store, handler, file };
}

test('#98 host：默认值单点——没写过偏好即动效开（false）', async () => {
  const { store, handler } = makeStore();
  await store.load();
  const got: any = await handler('meta.get', {});
  assert.equal(got.ok, true);
  assert.deepEqual(got.value.motion, { manualReduced: false }, '默认 false = 动效开');
  assert.equal(metaMod.DEFAULT_MOTION_PREFS.manualReduced, false);
});

test('#98 host：旧 meta.json 无 motion 段 → 折回默认 false（不报错、不 undefined）', async () => {
  const legacy = JSON.stringify({ version: 1, names: { k: '小帅' }, avatars: {}, locals: [], presets: {}, ctxEnhance: {} });
  const { store, handler } = makeStore(legacy);
  await store.load();
  const got: any = await handler('meta.get', {});
  assert.deepEqual(got.value.motion, { manualReduced: false });
  assert.equal(got.value.names.k, '小帅', '旧字段照常可读（Added-only 零破坏）');
  assert.equal(metaMod.normalizeMotionPrefs({ manualReduced: 'yes' }).manualReduced, false, '非字面 true 一律 false');
  assert.equal(metaMod.normalizeMotionPrefs(null).manualReduced, false);
});

test('#98 host：写 → 读 → 盘上真值（meta.motion.set + meta.get）', async () => {
  const { store, handler, file } = makeStore();
  const write: any = await handler('meta.motion.set', { manualReduced: true });
  assert.equal(write.ok, true, '合法写入回 ok');
  const got: any = await handler('meta.get', {});
  assert.deepEqual(got.value.motion, { manualReduced: true }, '快照读回已关');
  const onDisk = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(onDisk.motion, { manualReduced: true }, '盘上真值（meta.json）已落');
  const back: any = await handler('meta.motion.set', { manualReduced: false });
  assert.equal(back.ok, true);
  assert.deepEqual((await handler('meta.get', {}) as any).value.motion, { manualReduced: false }, '可翻回动效开');
});

test('#98 host：非法值回 bad-request 且不动盘（校验与 meta.update.set 同款）', async () => {
  const { store, handler, file } = makeStore();
  const bad: any = await handler('meta.motion.set', { manualReduced: 'yes' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'bad-request');
  const missing: any = await handler('meta.motion.set', {});
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'bad-request');
  // 两次非法写都没碰盘：文件都没被建出来（读回仍是默认 false）。
  const onDiskText = existsSync(file) ? readFileSync(file, 'utf8') : '';
  assert.equal(onDiskText.includes('motion'), false, '两次非法写都没碰盘');
  assert.deepEqual((await handler('meta.get', {}) as any).value.motion, { manualReduced: false });
});

test('#98 host：换一个 store 实例重读同一文件 → 偏好仍在（跨进程/重启语义）', async () => {
  const { handler, file } = makeStore();
  await handler('meta.motion.set', { manualReduced: true });
  const freshStore = new metaMod.AgentMetaStore(file);
  await freshStore.load();
  const freshHandler = rpcMod.createAgentFleetHandler(freshStore, { dshHome: join(FIXTURE, 'r' + seq) });
  assert.deepEqual((await freshHandler('meta.get', {}) as any).value.motion, { manualReduced: true }, '重启后仍记得「已关」');
});

test('#98 契约对齐：客户端写的端点名 = 宿主的 case 名（字符串钉）', () => {
  const prefsSrc = readFileSync(join(REPO, 'src', 'features', 'presence', 'prefs.ts'), 'utf8');
  const rpcSrc = readFileSync(join(REPO, 'src', 'host', 'rpc.ts'), 'utf8');
  assert.match(prefsSrc, /MOTION_ENDPOINT = 'meta\.motion\.set'/);
  assert.match(rpcSrc, /case 'meta\.motion\.set': \{/);
  assert.match(prefsSrc, /MOTION_CHANNEL = '\/im-companion'/);
  const prefsCode = prefsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/localStorage/.test(prefsCode), '九律 ③：偏好不得直写 localStorage（注释里提到不算）');
});

console.log('features/presence-host: ALL PASS');
