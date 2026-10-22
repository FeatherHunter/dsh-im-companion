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
const yamlIo: any = await import(pathToFileURL(join(BUILD, 'host', 'config-yaml.js')).href);
const io: any = await import(pathToFileURL(join(BUILD, 'host', 'home-store-io.js')).href);
const edit: any = await import(pathToFileURL(join(BUILD, 'host', 'home-edit.js')).href);

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

/* ─────────────────────────────────────────────────────────────────────────────
 * T8-1 #169：助理两栏（description 简介 / persona 人物设定）的**账本存取与零迁移**。
 * 判据（规格 #168）：不 bump version、不写迁移；老账本读→写回逐字节不变（唯一允许的差异＝trim 后为空的
 * 新键被略过）；盘上已超长的值**原样读回、不截断**（读容忍，只有写才校验）；空串与缺失等价。
 * 变异自证：cleanAssistant 删掉两栏透传（C1/C2 红）、writeGuarded 去掉 stripEmptyFields（C2 红）、
 *   createAssistantRow 不校验（C4/C5 红）、updateAssistantRow 闸门退回 name/avatar（C6 红）。
 * ───────────────────────────────────────────────────────────────────────────── */
const OLD_DOC = {
  version: 2,
  homes: [{
    id: 'h1', workspaceId: 'ws-1', path: 'D:\\agents\\keting', name: '客厅', nameSource: 'system',
    avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1,
  }],
  assistants: [{
    id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'bot1', status: 'bound', name: '小帅', nameSource: 'bot',
    avatar: null, avatarSource: 'default', createdAt: 1, boundAt: 1,
  }],
};
const ROW = OLD_DOC.assistants[0];

test('#169 零迁移：老账本（无两栏键）读→原样写回逐字节不变，version 仍是 2', async () => {
  const { file } = fresh();
  const text = yamlIo.renderConfigText(OLD_DOC, yamlIo.titleForFile(file));
  writeFileSync(file, text, 'utf8');
  const st: any = await store.loadHomesDocState(file);
  assert.equal(st.state, 'ok');
  assert.equal(st.doc.version, 2, '不 bump version（规格 #168：不做版本迁移）');
  assert.deepEqual(Object.keys(st.doc.assistants[0]).filter((k: string) => k === 'description' || k === 'persona'), [], '老行读回不带新键');
  await io.writeGuarded(file, st.doc, st.state, st.original);
  assert.equal(readFileSync(file, 'utf8'), text, '无改动写回＝逐字节不变（dirty 守卫之外也不许 materialize 空键）');
});

test('#169 零迁移：盘上有空串/纯空白的新键 ⇒ 读回视作未设置，写回只删这两行、别的一字不改', async () => {
  const { file } = fresh();
  const dirty = {
    ...OLD_DOC,
    assistants: [{ ...ROW, description: '', persona: '   ' }],
  };
  const text = yamlIo.renderConfigText(dirty, yamlIo.titleForFile(file));
  writeFileSync(file, text, 'utf8');
  const st: any = await store.loadHomesDocState(file);
  assert.equal('description' in st.doc.assistants[0], false, '空串读回＝没有这个键（空与缺失等价）');
  assert.equal('persona' in st.doc.assistants[0], false, '纯空白同理');

  await io.writeGuarded(file, st.doc, st.state, st.original);
  const after = readFileSync(file, 'utf8');
  const dropEmpty = (s: string) => s.split('\n').filter((l) => !/^\s+(description|persona):/.test(l)).join('\n');
  assert.equal(after, dropEmpty(text), '唯一允许的差异＝两行空键被略过（其余逐字节相同）');
  /* 语义等价而非字面等价：解析后把「值为空的那两栏」也摘掉，再比结构（空键读回即视为没有）。 */
  const noEmpty = (doc: any) => JSON.parse(JSON.stringify(doc, (k, v) => ((k === 'description' || k === 'persona') && typeof v === 'string' && !v.trim() ? undefined : v)));
  assert.deepEqual(noEmpty(yamlIo.parseConfigText(after)), noEmpty(yamlIo.parseConfigText(text)), '空键与缺失语义同形（只差这两行）');

  /* 真改动一次：改名落盘后仍不许把空键带回来。 */
  await store.modifyHomesDoc(file, (doc: any) => { doc.assistants[0].name = '小帅2' });
  const modified = readFileSync(file, 'utf8');
  assert.ok(!/^\s+(description|persona):/m.test(modified), '任何一次写都不 materialize 空键');
  const parsed: any = yamlIo.parseConfigText(modified);
  assert.equal(parsed.assistants[0].name, '小帅2');
  assert.equal(parsed.homes[0].name, '客厅', '无关行原样');
});

test('#169 读容忍：盘上已超长的 persona（8001）原样读回、不截断；写回也不截断', async () => {
  const { file } = fresh();
  const long = '字'.repeat(8001);
  writeFileSync(file, yamlIo.renderConfigText({ ...OLD_DOC, assistants: [{ ...ROW, persona: long }] }, yamlIo.titleForFile(file)), 'utf8');
  const st: any = await store.loadHomesDocState(file);
  assert.equal([...st.doc.assistants[0].persona].length, 8001, '超长值必须原样进来（读侧不许截断，否则用户手写的人设被静默毁掉）');
  assert.equal(st.doc.assistants[0].persona, long);
  await store.modifyHomesDoc(file, (doc: any) => { doc.homes[0].name = '改名' });
  const back: any = await store.loadHomesDoc(file);
  assert.equal(back.assistants[0].persona, long, '写回同样不截断（只有写入口的**新值**才校验）');
});

test('#169 行清洗：两栏进白名单、坏类型与未知键不入账（读容忍但不污染）', () => {
  const ids = new Set(['h1']);
  const ok: any = store.cleanAssistant({ ...ROW, description: ' 简介 ', persona: '人设', evil: 'x', personaTypo: 'y' }, ids);
  assert.equal(ok.description, ' 简介 ', '读回原样（归一留给访问器，避免把盘上文本悄悄改写）');
  assert.equal(ok.persona, '人设');
  assert.equal(ok.evil, undefined, '未知键照旧丢弃（白名单）');
  assert.equal(ok.personaTypo, undefined);
  const bad: any = store.cleanAssistant({ ...ROW, description: 42, persona: '  ' }, ids);
  assert.equal('description' in bad, false, '非字符串按未设置读（读容忍，不 coerce）');
  assert.equal('persona' in bad, false, '空白按未设置读');
});

test('#169 建助理：两栏归一后落账；空值不落键；超长/坏类型诚实拒绝且不落盘', async () => {
  const { file } = fresh();
  await store.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\a', title: 'A' });
  const homeId = (await store.loadHomesDoc(file)).homes[0].id;
  const r: any = await store.createAssistantRow(file, {
    homeId, channel: 'feishu', botId: 'bot1', botName: '小空', homeText: '',
    description: '  第一行\r\n第二行  ', persona: '人设',
  });
  assert.equal(r.ok, true);
  assert.equal(r.assistant.description, '第一行\n第二行', 'CRLF 归一 + trim 后再落账');
  assert.equal((await store.loadHomesDoc(file)).assistants[0].persona, '人设');

  const r2: any = await store.createAssistantRow(file, { homeId, channel: 'feishu', botId: 'bot2', botName: 'x', homeText: '', description: '   ', persona: '' });
  assert.equal(r2.ok, true);
  assert.equal('description' in r2.assistant, false, 'trim 后为空＝不设键');
  const row2 = (await store.loadHomesDoc(file)).assistants[1];
  assert.equal('description' in row2, false, '空串/纯空白不落键');
  assert.equal('persona' in row2, false);

  const before = readFileSync(file, 'utf8');
  const over: any = await store.createAssistantRow(file, { homeId, channel: 'feishu', botId: 'bot3', botName: 'x', homeText: '', description: '字'.repeat(201) });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'bad-request');
  assert.equal(over.message, '简介（description）最多 200 字，当前 201 字', '错误文案来自共享单点，带字段定位与字数');
  const typed: any = await store.createAssistantRow(file, { homeId, channel: 'feishu', botId: 'bot4', botName: 'x', homeText: '', persona: 42 });
  assert.equal(typed.ok, false);
  assert.equal(typed.message, '人物设定（persona）必须是字符串');
  assert.equal(readFileSync(file, 'utf8'), before, '被拒两次，盘一字未动');
});

test('#169 改助理：闸门放宽到 name/avatar/description/persona；单改一栏不动另一栏；空串＝清空', async () => {
  const { file } = fresh();
  await store.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\a', title: 'A' });
  const homeId = (await store.loadHomesDoc(file)).homes[0].id;
  const made: any = await store.createAssistantRow(file, { homeId, channel: 'feishu', botId: 'bot1', botName: '小空', homeText: '', description: '旧简介', persona: '旧人设' });
  const id = made.assistant.id;

  const gate: any = await edit.updateAssistantRow(file, { id });
  assert.equal(gate.ok, false, '什么都没有＝拒');
  assert.equal(gate.message, 'name/avatar/description/persona 至少其一', '闸门文案点明四栏');

  const onlyDesc: any = await edit.updateAssistantRow(file, { id, description: '新简介' });
  assert.equal(onlyDesc.ok, true, '只带 description 也放行（#168 放宽闸门）');
  assert.equal(onlyDesc.row.description, '新简介');
  assert.equal(onlyDesc.row.persona, '旧人设', '没提供的栏不许被清掉');
  assert.equal(onlyDesc.row.name, '小空', '名字不动');

  const onlyPersona: any = await edit.updateAssistantRow(file, { id, persona: '人设2' });
  assert.equal(onlyPersona.ok, true, '只带 persona 也放行');
  assert.equal(onlyPersona.row.description, '新简介');

  const clear: any = await edit.updateAssistantRow(file, { id, persona: '   ' });
  assert.equal(clear.ok, true, '清空只要带键（空串算「提供了」）');
  assert.equal('persona' in clear.row, false, '空串＝删键');
  assert.ok(!/^\s+persona:/m.test(readFileSync(file, 'utf8')), '盘上也不留空键');

  const over: any = await edit.updateAssistantRow(file, { id, persona: '字'.repeat(8001) });
  assert.equal(over.ok, false);
  assert.equal(over.message, '人物设定（persona）最多 8000 字，当前 8001 字');
  const max: any = await edit.updateAssistantRow(file, { id, persona: '字'.repeat(8000) });
  assert.equal(max.ok, true, '8000 字整放行（边界闭区间）');
  assert.equal([...max.row.persona].length, 8000);
});

test('#169 种子路径：两栏随行落账（归一后非空才写；坏值只丢那一栏，不拖垮整批）', async () => {
  const { file } = fresh();
  const out: any = await store.seedDocs(file, {
    homes: [{ id: 'tmp-h1', workspaceId: 'ws-1', path: 'D:\\agents\\a', title: 'A' }] as never[],
    assistants: [{
      homeId: 'tmp-h1', channel: 'feishu', botId: 'bot1', status: 'bound', name: '小帅',
      description: ' 简介\r\n二行 ', persona: '字'.repeat(8001),
    }] as never[],
  });
  assert.equal(out.assistants.length, 1, '超长的人设只丢那一栏，行照建');
  assert.equal(out.assistants[0].description, '简介\n二行');
  assert.equal('persona' in out.assistants[0], false, '超长那一栏不入账');
});

console.log('features/home-store: ALL PASS');
