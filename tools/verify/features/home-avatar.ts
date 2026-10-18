// T11 #128 头像图片自验证：跑**真宿主代码**（home-avatar/home-store/home-orphan/home-edit）＋真文件 IO。
// 只测外部行为：给一张图 → 盘上有什么、行里写什么、用户能取回什么；给脏输入 → 明文拒且盘上不多东西。
// 断言落点（票面五条口径）：落盘路径/值域、magic-bytes 白名单与 2 MiB 上限、批量 get、clear 回落、
// 删家不级联删图、`img:` 只走 avatar.set（home.update 仍只收 1-9）、seed 清洗不放目录穿越。
import { mkdtempSync, readFileSync, existsSync, readdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, El } from '../dom-shim.ts';

const REPO = process.cwd();
const HOST = join(REPO, 'src', 'host');
const tmpHost = mkdtempSync(join(tmpdir(), 'home-avatar-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(HOST, 'home-avatar.ts'),
    join(HOST, 'home-store.ts'),
    join(HOST, 'home-orphan.ts'),
    join(HOST, 'home-edit.ts'),
    /* 真分发器（rpc.ts）也转译进来：真机走的就是「/api/im-companion → createAgentFleetHandler 的真 switch」，
     * 只调 avatarPhoneFor 会绕开 default 支 ⇒ 见下面那条「真分发器」用例（同 home-steel 口径）。 */
    join(HOST, 'rpc.ts'),
    '--ignoreConfig',
    '--rootDir', join(REPO, 'src'),
    '--outDir', tmpHost, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('HOST-TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const reqHost = createRequire(join(tmpHost, 'run.cjs'));
/* 转译产物要能 import 'yaml'（home-store/config-yaml 链）：把本仓 node_modules 挂进来（同 home-steel 口径）。 */
try { symlinkSync(join(REPO, 'node_modules'), join(tmpHost, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }
const hostFile = (f: string): any => reqHost('./host/' + f);
const av: any = hostFile('home-avatar.js');
const store: any = hostFile('home-store.js');
const orphan: any = hostFile('home-orphan.js');
const edit: any = hostFile('home-edit.js');
const rpcHost: any = hostFile('rpc.js');
const metaHost: any = hostFile('meta-store.js');
const yaml: any = reqHost('yaml');
const readDoc = (file: string): any => yaml.parse(readFileSync(file, 'utf8'));

/** 最小但**魔数合法**的三格式样本：真判据是 magic-bytes（不是 data URL 前缀）。 */
const png = (): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(48, 7)]);
const jpeg = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]);
const webp = (): Buffer => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 0), Buffer.from('WEBP'), Buffer.alloc(32, 9)]);
/** 不在白名单的真格式（判据是魔数，不是 data URL 前缀）：GIF 必须被拒。 */
const gif = (): Buffer => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32, 5)]);
const url = (mime: string, buf: Buffer): string => 'data:' + mime + ';base64,' + buf.toString('base64');

/** 一次真落盘的家表：家 h1 ＋ 助理 a1（同一张表，`avatar.*` 两端点共用）。 */
const mkTable = async (): Promise<{ dshHome: string; file: string; call: any }> => {
  const dshHome = mkdtempSync(join(tmpdir(), 'ha-home-'));
  const file = store.homesFileFor(dshHome);
  const h = await store.createHomeRow(file, { workspaceId: 'ws-1', path: 'D:\\agents\\keting', title: '客厅' });
  await store.createAssistantRow(file, { homeId: h.home.id, channel: 'feishu', botId: 'b1', botName: '小帅', homeText: '' });
  const doc = readDoc(file);
  const call = av.avatarPhoneFor(dshHome);
  return { dshHome, file, call: call as any, homeId: h.home.id, asstId: doc.assistants[0].id } as any;
};

test('T11 #128 上传：先校验再落盘、行改指 img: 标记、重读不清洗（值域唯一放行口）', async () => {
  const { dshHome, file, call, homeId, asstId } = await mkTable();
  const dir = av.avatarDirFor(file);
  assert.equal(dir, join(dshHome, 'integrations', 'dsh-im-companion', 'avatars'), '落点＝配置目录下的 avatars/');
  const r: any = await call('avatar.set', { id: homeId, dataUrl: url('image/png', png()) });
  assert.equal(r.ok, true, JSON.stringify(r.error ?? {}));
  const name = av.stemFor(homeId) + '.png';
  assert.equal(r.value.avatar, 'img:' + name, '回包带 img: 标记');
  assert.ok(existsSync(join(dir, name)), '文件真落盘');
  assert.deepEqual(readFileSync(join(dir, name)), png(), '字节与上传一致（base64 解码无误）');
  let doc = readDoc(file);
  assert.equal(doc.homes.find((h: any) => h.id === homeId).avatar, 'img:' + name, '家行写 img: 标记');
  assert.equal(doc.homes.find((h: any) => h.id === homeId).avatarSource, 'user', '来源＝user');
  /* 助理行同族（同一个端点口，kind 由 id 决定） */
  const ra: any = await call('avatar.set', { id: asstId, dataUrl: url('image/webp', webp()) });
  assert.equal(ra.ok, true, JSON.stringify(ra.error ?? {}));
  assert.ok(existsSync(join(dir, av.stemFor(asstId) + '.webp')), 'webp 后缀按真格式落');
  /* 重读（＝宿主重启）：loadHomesDoc 的清洗必须认 img:，否则重启即丢图 */
  const again = await store.loadHomesDoc(file);
  assert.equal(again.homes.find((h: any) => h.id === homeId).avatar, 'img:' + name, '重读后标记仍在（isAvatarCode 认 img:）');
  assert.equal(again.assistants[0].avatar, 'img:' + av.stemFor(asstId) + '.webp', '助理行同样保住');
});

test('T11 #128 取图：批量 get 只回「有标记且文件真在」的；缺参/空数组明文拒', async () => {
  const { file, call, homeId } = await mkTable();
  await call('avatar.set', { id: homeId, dataUrl: url('image/jpeg', jpeg()) });
  const g: any = await call('avatar.get', { ids: [homeId, 'h-nope'] });
  assert.equal(g.ok, true);
  assert.equal(Object.keys(g.value.images).length, 1, '没有那行/没图的不进结果');
  assert.match(g.value.images[homeId], /^data:image\/jpeg;base64,/, '回包是可直接喂 <img> 的 data URL（按魔数补 mime）');
  assert.equal(g.value.images[homeId], url('image/jpeg', jpeg()), '取回的就是原图');
  assert.equal((await call('avatar.get', { ids: [] })).error.code, 'bad-request', '空数组拒收');
  assert.equal((await call('avatar.get', {})).error.code, 'bad-request', '缺 ids 拒收');
  /* 文件被外部删掉 ⇒ 按「这行没图」处理（回落预设色），不是报错 */
  const dir = av.avatarDirFor(file);
  for (const f of readdirSync(dir)) rmSync(join(dir, f), { force: true });
  const g2: any = await call('avatar.get', { ids: [homeId] });
  assert.equal(g2.ok, true, '文件没了也走成功通道');
  assert.equal(Object.keys(g2.value.images).length, 0, '文件不在 ⇒ 不返回（客户端据此回落预设色）');
});

test('T11 #128 清图：行回落预设色、旧文件删掉、再 get 为空', async () => {
  const { file, call, homeId } = await mkTable();
  await call('avatar.set', { id: homeId, dataUrl: url('image/png', png()) });
  const name = av.stemFor(homeId) + '.png';
  const dir = av.avatarDirFor(file);
  const c: any = await call('avatar.clear', { id: homeId });
  assert.equal(c.ok, true, JSON.stringify(c.error ?? {}));
  assert.equal(c.value.row.avatar, null, 'avatar 回 null');
  assert.equal(c.value.row.avatarSource, 'default', '来源回 default（与 T6b update 口径一致）');
  assert.ok(!existsSync(join(dir, name)), '旧文件删掉');
  assert.equal((await call('avatar.get', { ids: [homeId] })).value.images[homeId], undefined, '清完取不到图');
  assert.equal(readDoc(file).homes.find((h: any) => h.id === homeId).avatar, null, '盘上也是 null');
  assert.equal((await call('avatar.clear', { id: 'h-nope' })).error.code, 'not-found', '不存在的行明文拒');
});

test('T11 #128 改名不改图（验收②）：只带 name 的补丁不碰 avatar，图与文件都还在', async () => {
  const { file, call, homeId, asstId } = await mkTable();
  const r: any = await call('avatar.set', { id: homeId, dataUrl: url('image/png', png()) });
  const marker = r.value.avatar as string;
  const name = av.stemFor(homeId) + '.png';
  const d = av.avatarDirFor(file);

  const up: any = await edit.updateHomeRow(file, { id: homeId, name: '改了个名' });
  assert.equal(up.ok, true, JSON.stringify(up.error ?? {}));
  assert.equal(up.row.name, '改了个名', '名字真改了');
  assert.equal(up.row.avatar, marker, '改名后行里仍是 img: 标记（补丁没带 avatar 就不许动它）');
  assert.equal(up.row.avatarSource, 'user', '图片来源不被改名牵动');
  assert.ok(existsSync(join(d, name)), '图片文件还在');
  const again = await store.loadHomesDoc(file);
  assert.equal(again.homes.find((h: any) => h.id === homeId).avatar, marker, '重读仍在（改名没把图洗掉）');
  assert.equal((await call('avatar.get', { ids: [homeId] })).value.images[homeId], url('image/png', png()), '改名后仍取得到图');

  /* 助理侧同口径；「恢复默认名」（name: ''）也不许顺手把图抹了 */
  const ra: any = await call('avatar.set', { id: asstId, dataUrl: url('image/webp', webp()) });
  const ua: any = await edit.updateAssistantRow(file, { id: asstId, name: '换个名' });
  assert.equal(ua.ok, true, JSON.stringify(ua.error ?? {}));
  assert.equal(ua.row.avatar, ra.value.avatar, '助理改名同样不动图');
  const ub: any = await edit.updateAssistantRow(file, { id: asstId, name: '' });
  assert.equal(ub.ok, true);
  assert.equal(ub.row.nameSource, 'bot', '恢复默认名＝回落机器人名');
  assert.equal(ub.row.avatar, ra.value.avatar, '恢复默认名也不动图');
  assert.ok(existsSync(join(d, av.stemFor(asstId) + '.webp')), '助理改名后文件仍在');
});

test('T11 #128 拒绝口径：非图/超限/缺参一律 bad-request，且一个脏文件都不留', async () => {
  const { file, call, homeId } = await mkTable();
  const dir = av.avatarDirFor(file);
  const before = existsSync(dir) ? readdirSync(dir).length : 0;
  const bad: Array<[string, any]> = [
    ['文本冒充 png（魔数不对）', url('image/png', Buffer.from('hello world'))],
    ['前缀合法但 base64 是垃圾', 'data:image/png;base64,####'],
    ['真格式但不在白名单（GIF 魔数）', url('image/gif', gif())],
    ['不是 data URL', 'D:\\pics\\a.png'],
    ['空串', ''],
    ['超 2 MiB', url('image/png', Buffer.concat([png(), Buffer.alloc(2 * 1024 * 1024 + 8, 1)]))],
  ];
  for (const [why, dataUrl] of bad) {
    const r: any = await call('avatar.set', { id: homeId, dataUrl });
    assert.equal(r.ok, false, why + '：必须拒');
    assert.equal(r.error.code, 'bad-request', why + '：错误码');
    assert.ok(String(r.error.message).length > 0, why + '：必须带明文原因');
  }
  assert.equal((await call('avatar.set', { dataUrl: url('image/png', png()) })).error.code, 'bad-request', '缺 id 拒收');
  assert.equal((await call('avatar.set', { id: homeId })).error.code, 'bad-request', '缺 dataUrl 拒收');
  assert.equal((await call('avatar.set', { id: 'h-nope', dataUrl: url('image/png', png()) })).error.code, 'not-found', '没有那行拒收');
  const after = existsSync(dir) ? readdirSync(dir).length : 0;
  assert.equal(after, before, '拒绝路径不落任何文件（先校验后落盘）');
  assert.equal(readDoc(file).homes.find((h: any) => h.id === homeId).avatar, null, '拒绝不改行');
  assert.equal((await call('avatar.whatever', {})).error.code, 'bad-request', 'avatar. 族内未知端点明文拒');
  assert.equal(await call('home.list', {}), null, '非 avatar. 端点回 null（交回 rpc 的未知端点通道）');
});

test('T11 #128 删家不级联删图：墓碑 ＋ 级联删助理行，图片文件原样保留', async () => {
  const { file, call, homeId, asstId } = await mkTable();
  await call('avatar.set', { id: homeId, dataUrl: url('image/png', png()) });
  await call('avatar.set', { id: asstId, dataUrl: url('image/jpeg', jpeg()) });
  const dir = av.avatarDirFor(file);
  const homeImg = av.stemFor(homeId) + '.png';
  const asstImg = av.stemFor(asstId) + '.jpg';
  const r: any = await orphan.removeHomeRow(file, { id: homeId });
  assert.equal(r.ok, true, JSON.stringify(r.error ?? {}));
  const doc = readDoc(file);
  assert.ok(doc.homes.find((h: any) => h.id === homeId).tombstone, '家打墓碑（不是删行）');
  assert.equal(doc.assistants.filter((a: any) => a.homeId === homeId).length, 0, '该家助理行级联删');
  assert.ok(existsSync(join(dir, homeImg)) && existsSync(join(dir, asstImg)), '图片文件保留（当前口径：不级联删，回收留给后续票）');
});

test('T11 #128 值域钉子：img: 只走 avatar.set；update 仍只收 1-9；seed 清洗不放目录穿越', async () => {
  const { file, call, homeId } = await mkTable();
  const r: any = await call('avatar.set', { id: homeId, dataUrl: url('image/png', png()) });
  const marker = r.value.avatar as string;
  /* ① home.update 不许收 img:（值域仍是 1-9）——收编 UI 后必须走 avatar.set，别把标记塞回 update */
  const up: any = await edit.updateHomeRow(file, { id: homeId, avatar: marker });
  assert.equal(up.ok, false, 'home.update 收 img: 必须拒');
  assert.equal(up.code, 'bad-request', '错误码');
  assert.equal(readDoc(file).homes.find((h: any) => h.id === homeId).avatar, marker, '被拒后行没被改坏');
  assert.equal((await edit.updateHomeRow(file, { id: homeId, avatar: '3' })).ok, true, '预设色码仍照旧可用');
  /* 把图放回去：seed 之后要能证明「已有那行的图没被抹掉」 */
  const back: any = await call('avatar.set', { id: homeId, dataUrl: url('image/png', png()) });
  assert.equal(back.value.avatar, marker, '再传一次得到同一个标记（文件名稳定）');
  /* ② seed 清洗：合法 img: 留、目录穿越形态清成 null */
  const seeded = await store.seedDocs(file, {
    homes: [
      { id: 'hx1', workspaceId: 'ws-x1', path: 'D:\\agents\\x1', name: 'x1', avatar: 'img:ok_1.png' },
      { id: 'hx2', workspaceId: 'ws-x2', path: 'D:\\agents\\x2', name: 'x2', avatar: 'img:../evil.png' },
    ],
    assistants: [],
  });
  assert.equal(seeded.homes[0].avatar, 'img:ok_1.png', '合法标记进表');
  assert.equal(seeded.homes[1].avatar, null, '目录穿越形态被清洗成 null');
  assert.equal(seeded.homes[1].avatarSource, 'default', '清洗后来源回 default');
  const after = readDoc(file);
  assert.equal(after.homes.length, 3, '夹具表本身没被清空（seed 只追加）');
  assert.ok(after.homes.some((h: any) => h.id === homeId && h.avatar === marker), '原有那行的图没被 seed 抹掉');
});

/* ---------- 真机那条路：浏览器 → /api/im-companion → createAgentFleetHandler 的真 switch → avatarPhone ---
 * 上面几条直调 `avatarPhoneFor`，绕开了 `rpc.ts` 的 default 支——真机若漏接那一行，单测仍全绿而面板一张图都看不到。
 * 这里换成**真分发器**再跑一遍（与 home-steel 的「宿主分发器真跑」同款）。 */
test('T11 #128 真分发器：avatar.set/get/clear 经 rpc.ts 真 switch 可达，未知端点没被族路由吞掉', async () => {
  const dshHome = mkdtempSync(join(tmpdir(), 'ha-rpc-'));
  const call = rpcHost.createAgentFleetHandler(new metaHost.AgentMetaStore(join(dshHome, 'agents.json')), { dshHome });
  const c: any = await call('home.create', { workspaceId: 'ws-rpc', path: 'D:\\agents\\rpc', title: '真机路' });
  assert.equal(c.ok, true, JSON.stringify(c.error ?? {}));
  const id = c.value.home.id;
  const dir = av.avatarDirFor(store.homesFileFor(dshHome));
  const name = av.stemFor(id) + '.png';

  const s: any = await call('avatar.set', { id, dataUrl: url('image/png', png()) });
  assert.equal(s.ok, true, '真分发器可达 avatar.set：' + JSON.stringify(s.error ?? {}));
  assert.equal(s.value.avatar, 'img:' + name, '回包带标记');
  assert.ok(existsSync(join(dir, name)), '真分发器这条路也真落盘');
  assert.deepEqual(readFileSync(join(dir, name)), png(), '盘上字节与上传一致');

  const g: any = await call('avatar.get', { ids: [id] });
  assert.equal(g.value.images[id], url('image/png', png()), '真机取图回的字节与上传一致');
  const cl: any = await call('avatar.clear', { id });
  assert.equal(cl.ok, true, JSON.stringify(cl.error ?? {}));
  assert.equal((await call('avatar.get', { ids: [id] })).value.images[id], undefined, '清完真取不到（回落预设色）');
  assert.ok(!existsSync(join(dir, name)), '清完文件也真删');

  assert.equal((await call('avatar.bogus', {})).error.code, 'bad-request', '族内未知端点明文拒');
  assert.equal((await call('home.bogus', {})).error.code, 'bad-request', '非族未知端点没被族路由吞掉（仍回未知端点）');
});

test('T11 #128 客户端接线钉子：面板装配 transport、行/弹层共用一个取图口（不许各自实现）', () => {
  const panel = readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8');
  const rows = readFileSync(join(REPO, 'src', 'client', 'components', 'home-rows.ts'), 'utf8');
  const forms = readFileSync(join(REPO, 'src', 'client', 'components', 'home-forms.ts'), 'utf8');
  const transport = readFileSync(join(REPO, 'src', 'client', 'components', 'home-avatar.ts'), 'utf8');
  const detail = readFileSync(join(REPO, 'src', 'client', 'components', 'home-detail.ts'), 'utf8');
  assert.match(panel, /bindAvatarTransport\(\{/, '面板装配一次 transport（否则 avatar.get 一次都不发）');
  assert.match(rows, /avatarSrc\(/, '列表/详情头像走 avatarSrc（有图用图、无图预设色）');
  assert.match(forms, /avatarImageCell\(/, '弹层色板行收编图片格（第 8 格）');
  assert.match(transport, /'avatar\.get'/, '取图只走 avatar.get');
  assert.doesNotMatch(rows, /'avatar\.get'/, '行渲染不许自己发请求（唯一取图口在 home-avatar）');
  assert.doesNotMatch(forms, /'avatar\.(get|set|clear)'/, '弹层不许自己发请求');
  /* 验收①「列表与详情一致」的**结构**保证：详情头像必须是列表那枚共用元素（avatarEl），
   * 不许另长一份「详情专用头像」。 */
  assert.match(detail, /avatarEl\(/, '详情卡头像走列表共用的 avatarEl');
  assert.doesNotMatch(detail, /avatarSrc\(|imageCover\(|'avatar\./, '详情不许自建取图/画图路径');
});

/* ---------- 客户端半：真跑 `home-avatar-form`（三道校验闸 ＋ 上传链），假 rpc 只记账 ----------
 * 只查源码字符串（下面那条接线钉子）证明不了「用户手滑选了个 11 MB 的文件会怎样」——这里把
 * `avatarFileReject` / `commitAvatarFile` 当普通函数真跑：不给它任何 DOM，也不碰 IO。 */
const tmpCli = mkdtempSync(join(tmpdir(), 'ha-cli-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'client', 'components', 'home-avatar-form.ts'),
    '--ignoreConfig', '--rootDir', join(REPO, 'src'), '--outDir', tmpCli, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node', '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('CLIENT-TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmpCli, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }
const domDoc: any = createDocument();
const domWin: any = {
  document: domDoc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'ha' },
  CustomEvent: class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail } },
  dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {},
};
domDoc.defaultView = domWin;
(globalThis as any).window = domWin;
(globalThis as any).document = domDoc;
try { Object.defineProperty(globalThis, 'navigator', { value: domWin.navigator, configurable: true, writable: true }); } catch { /* 覆盖不了不影响本用例 */ }
for (const n of ['HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLDivElement', 'HTMLSpanElement', 'Node', 'Element']) domWin[n] = El;
const reqCli = createRequire(join(tmpCli, 'run.cjs'));
const formMod: any = reqCli('./client/components/home-avatar-form.js');
const avCli: any = reqCli('./client/components/home-avatar.js');
const buf = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

test('T11 #128 客户端三道闸真跑：超 2 MB 早拒、空文件拒、按字节认格式、存盘上限拒，成功只走 avatar.set', async () => {
  const calls: Array<{ ep: string; p: any }> = [];
  let committed = 0;
  avCli.bindAvatarTransport({
    getRpc: () => async (_path: string, ep: string, p: any) => { calls.push({ ep, p }); return { ok: true, value: { avatar: 'img:' + p.id + '.png' } } },
    onChange: () => {},
    onCommitted: () => { committed += 1 },
  });
  /* ① 纯校验：选文件前的那道闸（不读内存）——上限与票面/宿主同值 2 MB，不给两套口径 */
  assert.equal(formMod.avatarFileReject(null), '没选到文件', '没选到文件');
  assert.match(formMod.avatarFileReject({ size: 11 * 1024 * 1024, type: 'image/png', name: 'big.png' }), /上限 2 MB/, '>2 MB 当场拒，不读进内存');
  assert.match(formMod.avatarFileReject({ size: 3 * 1024 * 1024, type: 'image/png', name: 'mid.png' }), /上限 2 MB/, '3 MB 也是同一句明文（没有 10 MB 的第二套口径）');
  assert.match(formMod.avatarFileReject({ size: 0, type: 'image/png', name: 'empty.png' }), /空文件/, '空文件');
  /* 格式**不在这关判**：声明的 mime 不作数（真 PNG 但 type 为空也得能过这道闸），只认字节 */
  assert.equal(formMod.avatarFileReject({ size: 100, type: 'image/gif', name: 'a.gif' }), null, '格式关不看声明（改由字节判）');
  assert.equal(formMod.avatarFileReject({ size: 100, type: '', name: 'noext' }), null, '没有声明类型也不许在这关被误杀');
  assert.equal(formMod.avatarFileReject({ size: 100, type: 'image/png', name: 'a.png' }), null, '合法文件放行');
  /* ①b 魔数判定本身（与宿主 sniffer 同判据） */
  assert.equal(formMod.sniffImageExt(png()), 'png', 'PNG 魔数');
  assert.equal(formMod.sniffImageExt(jpeg()), 'jpg', 'JPEG 魔数');
  assert.equal(formMod.sniffImageExt(webp()), 'webp', 'WEBP 魔数');
  assert.equal(formMod.sniffImageExt(gif()), null, 'GIF 不在白名单');
  assert.equal(formMod.sniffImageExt(Buffer.from('改个扩展名就想蒙混')), null, '文本冒充一律 null');
  /* ② 票面「≤2 MB，超限明文拒绝」的客户端侧：3 MB 明文拒且一个请求都不发 */
  const big = await formMod.commitAvatarFile('h1', 'home', {
    size: 3 * 1024 * 1024, type: 'image/png', name: 'b.png', arrayBuffer: async () => new ArrayBuffer(3 * 1024 * 1024),
  });
  assert.equal(big.ok, false, '3 MB 必须拒');
  assert.match(big.message, /上限 2 MB/, '明文说清上限');
  assert.deepEqual(calls, [], '超限不落任何请求（更不落盘）');
  /* ②b 声明的类型是图片、字节不是 ⇒ 读字节后明文拒（宿主之前先拦一道，不发请求） */
  const liar = await formMod.commitAvatarFile('h1', 'home', {
    size: gif().length, type: 'image/png', name: 'a.png', arrayBuffer: async () => buf(gif()),
  });
  assert.equal(liar.ok, false, '声明的 mime 不作数：GIF 字节必须拒');
  assert.match(liar.message, /不是有效图片/, '明文说清判据是文件内容');
  assert.deepEqual(calls, [], '格式不符不发请求');
  /* ③ 成功：读字节 → data URL → 唯一写口 avatar.set（kind 带给宿主日志映射） */
  const ok = await formMod.commitAvatarFile('h1', 'home', {
    size: png().length, type: 'image/png', name: 'a.png', arrayBuffer: async () => buf(png()),
  });
  assert.deepEqual(ok, { ok: true }, '合法图上传成功');
  assert.equal(calls.length, 1, '只发一个请求');
  assert.equal(calls[0].ep, 'avatar.set', '写图只走 avatar.set');
  assert.equal(calls[0].p.id, 'h1');
  assert.equal(calls[0].p.kind, 'home');
  assert.equal(calls[0].p.dataUrl, url('image/png', png()), 'data URL 与源字节一致（base64 编码无误）');
  assert.equal(committed, 1, '写成功后必须通知装配方重读家表（否则新图只在旧快照上重画 ⇒ 真机不显示）');
  /* ③b 真 PNG 但**没有声明类型**（去掉扩展名的文件）：按字节放行，且 data URL 用嗅出来的 mime
   *     ——用空声明拼成 `data:;base64,` 会被宿主那条 `^data:image/...` 正则拒掉。 */
  const noType = await formMod.commitAvatarFile('h2', 'home', {
    size: png().length, type: '', name: 'noext', arrayBuffer: async () => buf(png()),
  });
  assert.deepEqual(noType, { ok: true }, '真 PNG 没有声明类型也必须能传（判据是字节）');
  assert.equal(calls[1].p.dataUrl, url('image/png', png()), 'data URL 的 mime 来自嗅探，不来自空声明');
  assert.equal(committed, 2, '每次写成功都要重读一次');
  /* ④ 读不到文件内容：明文拒绝，不发请求 */
  const unreadable = await formMod.commitAvatarFile('h1', 'home', {
    size: 10, type: 'image/png', name: 'x.png', arrayBuffer: async () => { throw new Error('设备没插好') },
  });
  assert.equal(unreadable.ok, false, '读不到就拒');
  assert.match(unreadable.message, /读不到文件内容：设备没插好/, '带原文');
  assert.equal(calls.length, 2, '失败不发请求');
  /* ⑤ 通道没接通：如实拒绝（不静默装作传上了） */
  avCli.bindAvatarTransport({ getRpc: () => null, onChange: () => {} });
  const nolink = await formMod.commitAvatarFile('h1', 'home', {
    size: png().length, type: 'image/png', name: 'a.png', arrayBuffer: async () => buf(png()),
  });
  assert.equal(nolink.ok, false, '没有通道就拒');
  assert.match(nolink.message, /头像通道未接通/, '明文说清是装配问题');
});

/* ---------- 写后重读：真机阻断缺陷的回归钉（#128 真机前抓到） ----------
 * 症状：上传成功、文件与 `img:` 标记都落盘，但列表/详情仍是预设色＋首字母，要手动刷新才出现。
 * 根因：行的 `avatar` 字段才是取图真相，而写图那条路**没有重读家表**（其它写操作走的是
 * `home-ops` 的 `await deps.reloadHomes()`），弹层那边只 `onDone: () => render()` ⇒ 在旧快照上重画。
 * 两半都要钉：① 写口必须通知装配方（行为断言，真跑客户端模块）；② 装配方收到通知必须**重读家表**，
 * 不是再 `render()` 一次旧快照（装配根接线钉：panel.ts 那一行拿不到真 DOM，故用源码钉住它的形状）。 */
test('T11 #128 写后重读：上传/清图都通知装配方，且装配方那一行必须重读家表（不是重画旧快照）', async () => {
  const seen: string[] = [];
  let reloads = 0
  const rpc = async (_path: string, ep: string): Promise<any> => { seen.push(ep); return { ok: true, value: { avatar: 'img:h1.png', images: { h1: url('image/png', png()) } } } };
  avCli.bindAvatarTransport({ getRpc: () => rpc, onChange: () => {}, onCommitted: () => { reloads += 1 } });
  await avCli.uploadAvatarImage('h1', 'home', url('image/png', png()));
  assert.deepEqual(seen, ['avatar.set'], '上传只走 avatar.set');
  assert.equal(reloads, 1, '上传成功 ⇒ 通知装配方一次');
  await avCli.clearAvatarImage('h1', 'home');
  assert.equal(reloads, 2, '清图成功 ⇒ 也要通知（否则格子还挂着旧图与「清除图片」）');
  /* 装配方的重读回调抛错**不许**反蚀写结果：图已落盘成功，重读失败下次刷新自愈。 */
  avCli.bindAvatarTransport({ getRpc: () => rpc, onChange: () => {}, onCommitted: () => { throw new Error('loadHomes 炸了') } });
  await avCli.uploadAvatarImage('h1', 'home', url('image/png', png()));
  /* 走到这里没抛 ⇒ 写结果没被重读失败反蚀 */
  assert.ok(true, '重读失败不许让「已上传成功」变成失败');

  const panel = readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8');
  const bind = /bindAvatarTransport\(\{[\s\S]{0,400}?\}\)/.exec(panel)?.[0] ?? '';
  assert.ok(bind, 'panel.ts 必须装配 avatar transport');
  assert.match(bind, /onCommitted\s*:/, '装配根必须接 onCommitted（不接 ⇒ 写后不重读）');
  assert.match(bind, /loadHomes\(/, 'onCommitted 必须重读家表（loadHomes）；只 render() 就是重画旧快照＝真机不显示');
});

console.log('features/home-avatar: ALL PASS');
