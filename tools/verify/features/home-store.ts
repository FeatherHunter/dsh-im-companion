// 事故复盘钉子（2026-10-15）：家表存储的**数据保护闸**与**留痕**。
//   由来：真机 `homes.json`（8226 B / 16 家 / 6 助理）整份丢失后，插件按「读不到 ⇒ 空表诚实兜底」
//   写下空 `homes.yaml`，并**每 4–6 分钟用同样内容重写一次**，磁盘上一条日志都没有 ⇒ 事后无从判定
//   「本来就没有」还是「刚丢的」。本文件钉两件事：
//   ① fail-closed：读回不可信（存在但读不出 / 解析不出）⇒ **拒绝落盘**、抛 `config-read-failed`、
//      损坏文件一字不动（原先 `modifyHomesDoc` / `persistDoc` 无条件落盘 ⇒ 下一次写就把权威表抹成空表）；
//   ② 留痕：读回状态（missing / ok / parse-failed / read-failed）与每一次拒写都必须落到注入的日志出口
//      ——`missing` 用 info、`ok` 用 debug（高频不刷盘）、异常用 warn、拒写用 error。
// 变异自证（改 src 的临时副本 ⇒ 本文件必须变红）：把 `assertWritable` 的抛去掉（A2/A3/A4 红）、
//   把 `noteLoad` 的 missing 分支删掉（A5 红）、把 `config.write.reject` 改回 `config.io`（A6 红）、
//   把 dirty 守卫的 `original === text` 判断删掉（A1 红）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();

/* 仓库 tsconfig 转译 src/ → 临时目录 import 真实现（presence-host.ts / config-yaml.ts 同款）。 */
const BUILD = mkdtempSync(join(tmpdir(), 'homestore-'));
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json',
    '--outDir', BUILD, '--declarationDir', join(BUILD, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(BUILD, 'package.json'), '{"type": "module"}\n');
try { symlinkSync(join(REPO, 'node_modules'), join(BUILD, 'node_modules'), 'junction'); } catch { /* 已存在 */ }
const store: any = await import(pathToFileURL(join(BUILD, 'host', 'home-store.js')).href);

const DIRS: string[] = [];
const fresh = (): { dir: string; file: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'hs-'));
  DIRS.push(dir);
  const file = join(dir, 'homes.yaml');
  return { dir, file };
};
after(() => { rmSync(BUILD, { recursive: true, force: true }); for (const d of DIRS) rmSync(d, { recursive: true, force: true }); });

/* 日志出口：注入假 sink 记账（真出口在装配层 src/index.ts，见 log-pipeline.ts 的接缝断言）。 */
const seen: any[] = [];
store.setHomeStoreLog((level: string, event: string, fields: any) => seen.push({ level, event, ...fields }));
const clear = () => { seen.length = 0 };
const find = (op: string, state: string) => seen.find((s) => s.op === op && s.state === state);

const CORRUPT = 'this: [is: not, valid: yaml\n';
const VALID = 'version: 2\nhomes: []\nassistants: []\n';

test('#122 事故复盘：首装（missing）可写，且 dirty 守卫消掉「每 5 分钟一次无意义重写」', async () => {
  const { file } = fresh();
  clear();
  assert.equal((await store.loadHomesDocState(file)).state, 'missing', '文件不存在 ⇒ missing');
  assert.equal(find('load', 'missing')?.level, 'info', 'missing 必须留痕（info）——否则「家表从哪一刻变 0」事后判不出');
  assert.equal(find('load', 'missing')?.event, 'config.io');
  const r = await store.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  assert.equal(r.ok, true, '首装路径不许被闸死');
  assert.ok(readFileSync(file, 'utf8').includes('homes:'), '首装确实落盘');

  /* dirty 守卫：文本没变 ⇒ 不写（真机每 4–6 分钟被同样内容重写一次，就是这条缺位）。 */
  const before = statSync(file).mtimeMs;
  await store.modifyHomesDoc(file, () => { /* 不动文档 */ });
  assert.equal(statSync(file).mtimeMs, before, '无改动不许重写盘（mtime 不变）');
  await store.modifyHomesDoc(file, (doc: any) => { doc.homes[0].name = '改名了' });
  assert.notEqual(statSync(file).mtimeMs, before, '真改动必须落盘');
  clear();
  await store.loadHomesDocState(file);
  assert.equal(find('load', 'ok')?.level, 'debug', '正常读回是高频行 ⇒ debug（调试开关关着不落盘，不刷爆磁盘）');
});

test('#122 事故复盘：解析不出（parse-failed）⇒ 三条写路径全拒，损坏文件一字不动', async () => {
  const { file } = fresh();
  writeFileSync(file, CORRUPT, 'utf8');
  clear();
  assert.equal((await store.loadHomesDocState(file)).state, 'parse-failed');
  assert.equal(find('load', 'parse-failed')?.level, 'warn', '异常态用 warn 留痕');

  for (const [name, run] of [
    ['modifyHomesDoc', () => store.modifyHomesDoc(file, (doc: any) => { doc.homes = [] })],
    ['createHomeRow', () => store.createHomeRow(file, { workspaceId: 'ws-2', path: 'D:\\b', title: 'b' })],
    ['seedDocs', () => store.seedDocs(file, { homes: [], assistants: [] })],
  ] as Array<[string, () => Promise<unknown>]>) {
    await assert.rejects(run(), (e: any) => e?.code === 'config-read-failed', name + ' 必须拒写（抛 config-read-failed）');
  }
  assert.equal(readFileSync(file, 'utf8'), CORRUPT, '三次拒写后损坏文件仍未被碰');
  const rej = seen.filter((s) => s.event === 'config.write.reject');
  assert.equal(rej.length, 3, '每一次拒写都要留一行（只抛不留痕 = 事后磁盘上判不出发生了什么）');
  assert.ok(rej.every((s) => s.level === 'error' && s.op === 'write' && s.state === 'parse-failed'), '拒写行：error / write / 带 state');
  assert.ok(rej.every((s) => String(s.file).includes('homes.yaml')), '拒写行必须带 file 原文（定位字段）');
  clear();
  assert.deepEqual((await store.loadHomesDocState(file)).doc.homes, [], '读回仍是诚实空表（不抛、不猜）');
});

test('#122 事故复盘：存在但读不出（read-failed）⇒ 拒写，不许把读不到的权威表覆盖成空表', async () => {
  const { dir, file } = fresh();
  mkdirSync(file, { recursive: true }); // 路径被目录占位 ⇒ 存在但读不出
  clear();
  assert.equal((await store.loadHomesDocState(file)).state, 'read-failed');
  assert.equal(find('load', 'read-failed')?.level, 'warn');
  await assert.rejects(store.modifyHomesDoc(file, (doc: any) => { doc.homes = [] }), (e: any) => e?.code === 'config-read-failed');
  assert.ok(find('write', 'read-failed'), '拒写留痕');
  assert.ok(statSync(file).isDirectory(), '原物（目录）原样留着');
});

test('#122 事故复盘：日志出口未注入时静默降级（日志绝不许改变控制流）', async () => {
  const { file } = fresh();
  writeFileSync(file, VALID, 'utf8');
  store.setHomeStoreLog(null);
  const st = await store.loadHomesDocState(file);
  assert.equal(st.state, 'ok', '没有 sink 也照常读回');
  const r = await store.createHomeRow(file, { workspaceId: 'ws-3', path: 'D:\\c', title: 'c' });
  assert.equal(r.ok, true, '没有 sink 也照常落盘');
  store.setHomeStoreLog((level: string, event: string, fields: any) => seen.push({ level, event, ...fields }));
});

test('#122 事故复盘：清单声明与调用点对齐（config.io / config.write.reject 都在单点清单里）', () => {
  const events = readFileSync(join(REPO, 'src', 'log-events.ts'), 'utf8');
  assert.match(events, /'config\.io': \{ level: 'warn', kind: 'resident', fields: \['op', 'file', 'state', 'message'\] \}/);
  assert.match(events, /'config\.write\.reject': \{ level: 'error', kind: 'resident', fields: \['op', 'file', 'state', 'message'\] \}/);
  const src = readFileSync(join(REPO, 'src', 'host', 'home-store-io.ts'), 'utf8');
  assert.match(src, /logSink\?\.\('error', 'config\.write\.reject'/, '拒写行的事件名必须与清单一致');
  const storeSrc = readFileSync(join(REPO, 'src', 'host', 'home-store.ts'), 'utf8');
  assert.ok(!/logSink/.test(storeSrc), '领域动作层不许自己碰日志出口（出口单点在 io 层）');
  assert.match(storeSrc, /assertWritable\(file, state\)/, '三条写路径共用同一道闸（不许各写一份判断）');
  const idx = readFileSync(join(REPO, 'src', 'index.ts'), 'utf8');
  assert.match(idx, /setHomeStoreLog\(/, '出口由装配层单点注入（home-store 不自己建库：单写者纪律）');
});

console.log('features/home-store: ALL PASS');
