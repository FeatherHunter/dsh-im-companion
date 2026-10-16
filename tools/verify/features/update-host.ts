// T7 #90 验证（更新系统宿主侧）· **T5 #110 M5 起删调度器后的基线；#132 起五通电话（0.17.0 接 logAppend）**。
// 覆盖：五通电话信封 + 包字段原样 + 偏好落盘保留 + 装配点零定时器。
//
// M5 删掉了什么：update-schedule.ts 整文件 + 桥的 autoState/sync/start/dispose/autoCheck +
// rpc.ts 的 sync() 调用 + index.ts 的 timer 注入与 start/dispose 生命周期。
// 本文件同步删除：fakeClock/假定时器端口/调度器 4 件套/autoCheck 运行期/装配定时器断言。
// 保留：真盘真布局夹具（realpath 链约束不变）+ 四通电话生产口径 + meta.update 偏好落盘。
//
// 为什么仍用真盘真布局夹具（与前版相同）：
//   0.2.0 起包按包名解析目标包 ⇒ 假 fs 端口这条路没了（包直接读真盘）。做法：
//     ① 在临时目录造一个 DSH 使用范围：`<FIXTURE>/profiles/web/{package.json, node_modules/dsh-im-companion/**}`；
//     ② 把更新包**真拷贝**进该范围的 `node_modules`（必须真拷贝，不能 junction）；
//     ③ 转译产物的 `node_modules/dsh-plugin-update` 只挂一条 junction 指向那份拷贝。
//   于是四通电话在**生产口径（零解析类 readerOverrides）**下真跑：只有网络是假的。
//
//   ⚠️ 为什么必须真拷贝：Node 按 **realpath** 解析模块，junction 会让包内 `import.meta.url` 落回本仓，
//   包就"看不见"这个假使用范围（它会解析到本仓的 package.json，再反推不出范围 ⇒ dev-source，0.18.3 起；此前为 unknown-profile）。
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const BUILD = mkdtempSync(join(tmpdir(), 't7-update-host-'));
const FIXTURE = mkdtempSync(join(tmpdir(), 't7-update-profile-'));
const PROFILE = join(FIXTURE, 'profiles', 'web');
const PROFILE_MODULES = join(PROFILE, 'node_modules');
const PLUGIN_DIR = join(PROFILE_MODULES, 'dsh-im-companion');
const OUTSIDE_DIR = join(FIXTURE, 'elsewhere', 'dsh-im-companion');
/** 更新包在夹具里的真拷贝位置（= 转译产物那条 junction 的 realpath）。 */
const PKG_DIR = join(PROFILE_MODULES, 'dsh-plugin-update');

after(() => {
  rmSync(BUILD, { recursive: true, force: true });
  rmSync(FIXTURE, { recursive: true, force: true });
});

/* ---------- 转译（同 host-entry.ts 范式：仓库 tsconfig 转译 src/，再 import 产物跑真实现） ---------- */
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json',
    '--outDir', BUILD, '--declarationDir', join(BUILD, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(BUILD, 'package.json'), '{"type": "module"}\n');

/* ---------- 夹具：一个真的使用范围 + 更新包真拷贝（只链 dsh-plugin-update 一个包） ---------- */
mkdirSync(PROFILE_MODULES, { recursive: true });
cpSync(join(REPO, 'node_modules', 'dsh-plugin-update'), PKG_DIR, { recursive: true });
mkdirSync(join(BUILD, 'node_modules'), { recursive: true });
symlinkSync(PKG_DIR, join(BUILD, 'node_modules', 'dsh-plugin-update'), 'junction');
/* T9 #123：宿主链现在还要 `dsh-log/host` + `dsh-log/node`（src/host/log.ts）⇒ 产物目录里也得链上它。 */
symlinkSync(join(REPO, 'node_modules', 'dsh-log'), join(BUILD, 'node_modules', 'dsh-log'), 'junction');
/* T12 #129：配置层现在 import 'yaml'（src/host/config-yaml.ts ← meta-store / home-store / rpc）⇒ 同样得链。 */
symlinkSync(join(REPO, 'node_modules', 'yaml'), join(BUILD, 'node_modules', 'yaml'), 'junction');

/** 删夹具里的插件目录：**先判链接再删**（junction 用 unlink，绝不递归跟随到目标去）。 */
function clearPluginDir(): void {
  try {
    if (lstatSync(PLUGIN_DIR).isSymbolicLink()) unlinkSync(PLUGIN_DIR);
    else rmSync(PLUGIN_DIR, { recursive: true, force: true });
  } catch { /* 不存在即无事 */ }
}

/** 造「按版本号装好的插件」：使用范围清单 + `node_modules/dsh-im-companion/**`（`validPackage` 三处入口都得是真文件）。 */
function installPlugin(opts: { version?: string; spec?: string } = {}): { version: string; spec: string } {
  const version = opts.version ?? '1.2.3';
  const spec = opts.spec ?? version;
  clearPluginDir();
  mkdirSync(PLUGIN_DIR, { recursive: true });
  writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
    name: 'profile-web', version: '0.0.0', dependencies: { 'dsh-im-companion': spec },
  }, null, 2));
  writeFileSync(join(PLUGIN_DIR, 'package.json'), JSON.stringify({
    name: 'dsh-im-companion', version, main: 'index.js',
    exports: { '.': './index.js', './client': './client.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2));
  for (const f of ['index.js', 'client.js', 'cordis.patch.yml']) writeFileSync(join(PLUGIN_DIR, f), '// fixture\n');
  return { version, spec };
}

/** 造「实装目录越出使用范围」：范围里那条是指向范围外的 junction（realpath 落在外面）。 */
function installPluginOutside(version = '1.2.3'): void {
  clearPluginDir();
  mkdirSync(OUTSIDE_DIR, { recursive: true });
  writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
    name: 'profile-web', version: '0.0.0', dependencies: { 'dsh-im-companion': version },
  }, null, 2));
  writeFileSync(join(OUTSIDE_DIR, 'package.json'), JSON.stringify({
    name: 'dsh-im-companion', version, main: 'index.js',
    exports: { '.': './index.js', './client': './client.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2));
  for (const f of ['index.js', 'client.js', 'cordis.patch.yml']) writeFileSync(join(OUTSIDE_DIR, f), '// fixture\n');
  symlinkSync(OUTSIDE_DIR, PLUGIN_DIR, 'junction');
}

const HOST = join(BUILD, 'host');
const load = async (name: string): Promise<any> => import(pathToFileURL(join(HOST, name)).href);
const update: any = await load('update.js');
const updatePre: any = await load('update-precheck.js');
const rpcMod: any = await load('rpc.js');
const metaMod: any = await load('meta-store.js');
const hostEntry: any = await import(pathToFileURL(join(BUILD, 'index.js')).href);
// 与转译产物**同一份真身**（同一条 junction ⇒ 同一 realpath ⇒ 同一模块实例）：否则 reset 打不到它的单例缓存。
const pkgMod: any = await import(pathToFileURL(join(BUILD, 'node_modules', 'dsh-plugin-update', 'dist', 'host.js')).href);

// 包内共享读取器按 (pluginId, prefix, runningVersion, profileDir, profileName, homeDir, environmentKind, target) 缓存：
// 每个宿主实例一条独立 home ⇒ 天然不同键；这里再显式复位一次，双保险。
beforeEach(() => { pkgMod.__resetSharedUpdateReaderForTests(); });

const proof = (id: string, detail: string): void => { console.log('T7-PROOF ' + id + ' PASS ' + detail); };
const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 5); });
const settle = async (rounds = 8): Promise<void> => { for (let i = 0; i < rounds; i++) await tick(); };

/* ---------- 假 npm 源：只截断网络（形状校验仍走包的真代码：name/version/dist.tarball/dist.integrity） ---------- */
function fakeRegistry(version = '9.9.9') {
  const state = { calls: 0, mode: 'ok' as 'ok' | 'fail', url: '' };
  const fetchImpl = async (url: string): Promise<any> => {
    state.calls += 1; state.url = url;
    if (state.mode === 'fail') throw new Error('offline（verify 假源）');
    return {
      ok: true, headers: { get: () => null },
      text: async () => JSON.stringify({
        name: 'dsh-im-companion', version,
        dist: {
          tarball: 'https://registry.npmjs.org/dsh-im-companion/-/dsh-im-companion-' + version + '.tgz',
          integrity: 'sha512-' + 'A'.repeat(86) + '==',
        },
      }),
    };
  };
  return { state, fetchImpl };
}

/* ---------- 装配：真桥 + 真 rpc 派发 + 真偏好存储（只有网络 / home 是假的，解析全走生产口径） ---------- */
let homeSeq = 0;
type HostOpts = {
  readJob?: () => any; registry?: any;
  readerOverrides?: Record<string, unknown>; homeDir?: string;
  onPrecheck?: (v: any) => void;
};
function makeHost(opts: HostOpts = {}) {
  const registry = opts.registry ?? fakeRegistry();
  const home = opts.homeDir ?? mkdtempSync(join(FIXTURE, 'home' + (++homeSeq) + '-'));
  const store = new metaMod.AgentMetaStore(join(home, 'meta.yaml'));
  const warns: string[] = [];
  const logger = { info: (): void => {}, warn: (m: string): void => { warns.push(m); } };
  const overrides: Record<string, unknown> = { fetchImpl: registry.fetchImpl, ...opts.readerOverrides };
  if (opts.readJob) overrides.readJob = opts.readJob;
  const bridge = update.createUpdateHostBridge({
    ctx: {}, dshHome: home, readerOverrides: overrides, logger, onPrecheck: opts.onPrecheck,
  });
  const handle = rpcMod.createAgentFleetHandler(store, { update: () => bridge });
  return { home, registry, store, bridge, handle, warns };
}
const STATUS = 'imc.updateStatus'; const CHECK = 'imc.updateCheck'; const INSTALL = 'imc.updateInstall'; const CHANGELOG = 'imc.updateChangelog'; const LOGAPPEND = 'imc.logAppend';
const JOB = { id: 'j1', state: 'installing', targetVersion: '1.2.3', message: null, requestId: 'r1' };
const withJob = (opts: HostOpts = {}) => makeHost({ ...opts, readJob: async () => ({ ...JOB }) });

/* ---------- ⓪ #99 解耦基线：零解析类 override，在真布局里四通电话全通 ---------- */
test('T7-0 0.9.0 原生解析：不喂 runningVersion/profileDir/readInstalled，仍认得出使用范围与版本', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost(); // overrides 里只有 fetchImpl（网络），没有任何解析输入
  const st: any = await h.handle(STATUS, {});
  assert.equal(st.ok, true, '生产口径必须能自己解析出使用范围（0.1.x 在这里恒 unknown-profile）');
  assert.equal(st.value.snapshot.installedVersion, '1.2.3', '磁盘版本来自真 fixture，不是本仓版本');
  assert.equal(st.value.snapshot.runningVersion, '1.2.3', '运行版本由包按包名解析目标包得到');
  assert.equal(st.value.snapshot.blockedReason, null, '版本号安装 + 实装目录在范围内 ⇒ 无阻塞');
  assert.equal(st.value.snapshot.canInstall, false, '还没查过新版 ⇒ 不能装');
  assert.match(String(st.value.manual), /^dsh plugin --profile web add --save-exact dsh-im-companion@1\.2\.3 /,
    '手工命令里的使用范围名来自反推出来的 profileDir：' + String(st.value.manual));
  const ck: any = await h.handle(CHECK, {});
  assert.equal(ck.ok, true, '联网查新版：' + JSON.stringify(ck));
  assert.equal(ck.value.snapshot.latestVersion, '9.9.9', '假源给的最新版本');
  assert.equal(h.registry.state.calls, 1, '一次 check 打一次源');
  proof('native-resolve', '零解析 override ⇒ installedVersion/runningVersion/profileName 全对');
});

/* ---------- ① 五通电话：经 rpc.ts 端点表派发 + 本仓 RpcResult 信封 + 包字段原样（M5 起无 autoCheck；#132 起第五电话 logAppend） ---------- */
test('T7-1 五通电话可经 rpc.ts 派发，回包是本仓信封且包字段一个不少（无 autoCheck）', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  assert.deepEqual([...update.UPDATE_ENDPOINTS], [STATUS, CHECK, INSTALL, CHANGELOG, LOGAPPEND], '端点名常量 = 票面定死五通');
  assert.deepEqual(Object.keys(h.bridge.handlers).sort(), [STATUS, CHECK, INSTALL, CHANGELOG, LOGAPPEND].sort(), '桥的表键必须是包给的电话名');
  assert.equal(typeof h.bridge.autoCheck, 'undefined', 'M5 起桥不再有 autoCheck 运行期状态');
  assert.equal(typeof (h.bridge as any).sync, 'undefined', 'M5 起桥不再有 sync()');
  assert.equal(typeof (h.bridge as any).start, 'undefined', 'M5 起桥不再有 start()');
  for (const ep of [STATUS, CHECK]) {
    const raw: any = await h.bridge.handlers[ep]({});
    const result: any = await h.handle(ep, {});
    assert.equal(result.ok, true, ep + ' 应回 ok:true');
    assert.equal(result.error, undefined, ep + ' 成功信封不带 error');
    assert.deepEqual(Object.keys(raw).sort(), ['manual', 'ok', 'receipt', 'snapshot'], ep + ' 包载荷字段');
    assert.deepEqual(result.value, raw, ep + ' 包字段原样（ok/snapshot/manual/receipt 一个不少，无 autoCheck）');
    assert.equal('autoCheck' in result.value, false, ep + ' 成功载荷不再注入 autoCheck');
    assert.deepEqual((h.bridge.reply(raw) as any).value, raw, ep + ' 翻译层不换壳/不深拷贝掉引用');
  }
  // install：真装机（spawn 子进程）不在 verify 内跑 ⇒ 走真失败通道；成功载荷的原样翻译用同一段 reply 的合成载荷钉住（含 receipt）。
  const rawFail: any = await h.bridge.handlers[INSTALL]({});
  const failed: any = await h.handle(INSTALL, {});
  assert.equal(failed.ok, false, 'install 缺 checkId 回失败信封（不抛）');
  assert.equal(failed.value, undefined, '失败信封不带 value');
  assert.equal(failed.error.code, 'check-expired', '原因码原样透传（包 README §5.2 的冻结词表）：' + failed.error.message);
  // 0.9.0 起失败载荷带 diag（含 latencyMs 毫秒计时）：两次调用各测一次，计时不同属正常；比对时先把该易变字段对齐再判其余原样。
  assert.equal(typeof failed.error.details?.update?.diag?.latencyMs, 'number', 'diag.latencyMs 为数字计时');
  assert.deepEqual({ ...failed.error.details.update, diag: { ...failed.error.details.update.diag, latencyMs: rawFail?.diag?.latencyMs } }, rawFail, '包原始载荷进 details.update，不吞掉（除计时外逐字同）');
  assert.ok(!JSON.stringify(failed).includes('autoCheck'), '失败信封里没有 autoCheck');
  const synthetic = {
    ok: true, snapshot: { runningVersion: '1.2.3', canInstall: false }, manual: null,
    receipt: { checkId: 'c1', checkedAt: 1_700_000_000_000, expiresAt: 1_700_000_600_000 },
  };
  const wrapped: any = h.bridge.reply(synthetic);
  assert.equal(wrapped.ok, true);
  assert.deepEqual(wrapped.value, synthetic, 'install 成功载荷（含 receipt）原样进 value');
  proof('endpoints', '五端点派发 + 原样字段 + 失败码 check-expired 透传（无 autoCheck）');
});

/* ---------- ①c logAppend 接线：面板日志通道，直通信封 `{accepted,dropped}` 按成功进 value（#132，0.17.0 第五电话） ---------- */
test('T7-1c logAppend 电话已接线：经 rpc.ts 可达，成功按成功信封进 value（不走失败通道）', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  assert.equal(typeof h.bridge.handlers[LOGAPPEND], 'function', '桥必须有 logAppend 处理器（包 phoneNames 第五键）');
  const raw: any = await h.bridge.handlers[LOGAPPEND]({ rows: [] });
  assert.equal(typeof raw?.accepted, 'number', '包回包必有 accepted 数字：' + JSON.stringify(raw)?.slice(0, 200));
  assert.equal(typeof raw?.dropped, 'number', '包回包必有 dropped 数字：' + JSON.stringify(raw)?.slice(0, 200));
  const result: any = await h.handle(LOGAPPEND, { rows: [] });
  assert.equal(result.ok, true, 'logAppend 成功必须走成功信封（否则高频成功会被记成 error 落盘）：' + JSON.stringify(result)?.slice(0, 200));
  assert.deepEqual(result.value, raw, 'logAppend 成功载荷原样进 value');
  proof('logAppend', '第五电话可达 + 成功信封 + 原样载荷');
});

/* ---------- ①b changelog 接线：直通包处理器 + 同款信封（T5 #110，0.9.0 第四电话） ---------- */
test('T7-1b changelog 电话已接线：经 rpc.ts 可达，回包形态合法', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  assert.equal(typeof h.bridge.handlers[CHANGELOG], 'function', '桥必须有 changelog 处理器（包 phoneNames 第四键）');
  const raw: any = await h.bridge.handlers[CHANGELOG]({ version: '9.9.9' });
  assert.equal(typeof raw?.ok, 'boolean', '包回包必有 ok 布尔：' + JSON.stringify(raw)?.slice(0, 200));
  if (raw.ok === true) {
    assert.equal(raw.version, '9.9.9', '成功即回显所查版本');
    assert.ok(raw.markdown === null || typeof raw.markdown === 'string', 'markdown 为全文或 null（取不到不断言内容）');
  } else {
    assert.equal(typeof raw.error, 'string', '失败即带稳定码：' + JSON.stringify(raw)?.slice(0, 200));
  }
  const result: any = await h.handle(CHANGELOG, { version: '9.9.9' });
  if (result.ok === true) {
    assert.deepEqual(result.value, raw, 'changelog 成功载荷原样进 value（无 autoCheck 注入）');
  } else {
    assert.equal(result.value, undefined, '失败信封不带 value');
    assert.notMatch(String(result.error?.code ?? ''), /^bad-request$/, '接线存在，不得报未知端点：' + JSON.stringify(result.error));
  }
  const unknown: any = await h.handle('imc.updateNope', {});
  assert.equal(unknown.ok, false, '未知端点仍走失败信封');
  assert.match(String(unknown.error?.message ?? ''), /未知端点/, '未知端点文案不变（与 changelog 已接线对照）');
  proof('changelog', '第四电话可达 + 形态合法 + 未知端点对照');
});

/* ---------- ② snapshot 恰好七字段（0.17.0 起新增 installed；快照三电话同源；changelog 无 snapshot 不在列） ---------- */
test('T7-2 snapshot 恰好七字段（快照三电话同源；changelog 无 snapshot 不在列）', async () => {
  installPlugin({ version: '1.2.3' });
  const h = withJob(); // 注入 readJob ⇒ job 字段真的非空，七字段全被走到
  const SEVEN = ['blockedReason', 'canInstall', 'installed', 'installedVersion', 'job', 'latestVersion', 'runningVersion'];
  for (const ep of [STATUS, CHECK, INSTALL]) {
    const payload = ep === INSTALL ? { checkId: 'c0', requestId: 'r1' } : {};
    const raw: any = await h.bridge.handlers[ep](payload);
    assert.equal(raw.ok, true, ep + ' 应回 ok（' + JSON.stringify(raw) + '）');
    assert.deepEqual(Object.keys(raw.snapshot).sort(), SEVEN, ep + ' snapshot 字段集合');
    assert.deepEqual(raw.job ?? raw.snapshot.job, raw.snapshot.job, ep + ' job 在 snapshot 内');
  }
  proof('snapshot-seven', '三电话 snapshot 恰七字段');
});

/* ---------- ③ source-install：判据全在包内（本仓不再自算） ---------- */
test('T7-3 link: 说明符 → source-install 且 manual 为 null；版本号说明符对照给得出手工命令', async () => {
  installPlugin({ version: '1.2.3', spec: 'link:../..' });
  const link: any = await makeHost().handle(STATUS, {});
  assert.equal(link.value.snapshot.blockedReason, 'source-install', 'link: 必须落源安装');
  assert.equal(link.value.snapshot.canInstall, false, '源安装恒不可一键装');
  assert.equal(link.value.manual, null, '源安装不给手工命令（包内 manualCommand 判 sourceInstall → null）');
  assert.equal(link.value.snapshot.installedVersion, '1.2.3', '源安装也照报磁盘版本');

  // 对照：同一块盘换成版本号说明符 ⇒ 不再是源安装，manual 给得出命令（证明上面那个 null 是判据产物，不是空实现）
  installPlugin({ version: '1.2.3' });
  const reg: any = await makeHost().handle(STATUS, {});
  assert.equal(reg.value.snapshot.blockedReason, null, '版本号 + 实装 = 运行版本 ⇒ 无阻塞');
  assert.match(String(reg.value.manual), /^dsh plugin --profile web add --save-exact dsh-im-companion@1\.2\.3 /);
  assert.equal(reg.value.snapshot.latestVersion, null, '还没 check 过 → latestVersion 为 null');

  // 实装目录越出使用范围：0.2.0 先按包名解析到它 ⇒ 反推不出范围 ⇒ **诚实失败**（README 排错第 13 条）。
  // 0.18.3 起失败码是独立的 `dev-source`（#153；此前为 `unknown-profile`）。
  installPluginOutside('1.2.3');
  const outside: any = await makeHost().handle(STATUS, {});
  assert.equal(outside.ok, false, '范围外实装 ⇒ 认不出使用范围（0.18.3 起的诚实答复是 dev-source）');
  assert.equal(outside.error.code, 'dev-source', '失败码是包冻结词表里的 dev-source：' + JSON.stringify(outside.error));
  assert.equal(outside.value, undefined, '失败信封不带 value');
  // 集成方的口子：显式交 profileDir（本仓装配不传，只有这类越界布局才需要）⇒ 立刻变成可诊断的 source-install。
  const patched: any = await makeHost({ readerOverrides: { profileDir: PROFILE } }).handle(STATUS, {});
  assert.equal(patched.value.snapshot.blockedReason, 'source-install', '补上 profileDir ⇒ 判据齐全，落源安装');
  assert.equal(patched.value.manual, null, '源安装仍不给命令');
  proof('source-install', 'link: ⇒ source-install/manual=null；版本号 ⇒ 给命令；越界 ⇒ dev-source（+profileDir 口子）');
});

/* ---------- ③b #126 只读预检：开发态实装 ⇒ 判得出 + 留痕，失败语义一字不改 ---------- */
test('T7-3b 只读预检：dev-source 时判出「开发态实装」并留痕一次，失败仍原样透传', async () => {
  // 纯函数：与包内判据（tryInferProfileDir）逐字同形——marker 现算（installMarker），避免两处字面量漂移
  const marker = updatePre.installMarker('dsh-im-companion');
  const realDir = 'C:\\u\\.dsh\\profiles\\web' + marker;
  /* Windows 的 realpath 会把盘符/目录名大小写归一（D:\temp ↔ D:\Temp）⇒ 比路径用大小写无关形态。 */
  const sameDir = (a: unknown, b: string): boolean => typeof a === 'string' &&
    (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  assert.equal(
    updatePre.inferProfileFromDir(realDir, 'dsh-im-companion'),
    'C:\\u\\.dsh\\profiles\\web', '真目录形状：marker 之前那段就是使用范围');
  assert.equal(
    updatePre.inferProfileFromDir('D:\\dsh-plugin\\dsh-im-companion', 'dsh-im-companion'), null,
    'Junction realpath 落在仓库 ⇒ 认不出使用范围（包据此诚实抛 dev-source）');
  const dev = updatePre.judgeInstallDir('D:\\dsh-plugin\\dsh-im-companion', 'dsh-im-companion');
  assert.equal(dev.mode, 'dev-source', '开发态实装判定：' + JSON.stringify(dev));
  assert.match(dev.message, /预期/, '结论里写明这是预期而非缺陷');
  assert.equal(dev.profileDir, null, '认不出范围就不许编一个出来');
  const good = updatePre.judgeInstallDir(realDir, 'dsh-im-companion');
  assert.equal(good.mode, 'profile-install');
  assert.match(good.message, /可用/, '真安装形态：预期可用');
  const unknown = updatePre.judgeInstallDir(null, 'dsh-im-companion');
  assert.equal(unknown.mode, 'unknown', '解析不出目标包 ⇒ unknown（不猜）');
  assert.match(unknown.message, /没能归因/, '判不出不许写成「预期」（诚实口径）');

  // 漂移门：本仓判据必须与**包的真行为**一致（包改 tryInferProfileDir ⇒ 这里红）
  installPlugin({ version: '1.2.3' });
  const realInstall = await updatePre.precheckInstall('dsh-im-companion');
  assert.equal(realInstall.mode, 'profile-install', '真安装形态：包这边可用 ⇒ 本仓也判可用：' + JSON.stringify(realInstall));
  assert.ok(sameDir(realInstall.dir, realpathSync(PLUGIN_DIR)), '解析出的就是夹具里那个真目录：' + String(realInstall.dir));

  // 接线：越界实装（与 Junction 同形：realpath 落在使用范围之外）⇒ 判定一次并留痕
  installPluginOutside('1.2.3');
  const outside = await updatePre.precheckInstall('dsh-im-companion');
  assert.equal(outside.mode, 'dev-source', '越界实装：包回 dev-source ⇒ 本仓也判 dev-source');
  assert.ok(sameDir(outside.dir, realpathSync(OUTSIDE_DIR)), '解析出的是 realpath 后的范围外目录：' + String(outside.dir));
  const seen: any[] = [];
  const h = makeHost({ onPrecheck: (v) => seen.push(v) });
  const st: any = await h.handle(STATUS, {});
  assert.equal(st.ok, false, '预检不改语义：仍回失败信封');
  assert.equal(st.error.code, 'dev-source', '原因码原样透传：' + JSON.stringify(st.error));
  await settle();
  assert.equal(seen.length, 1, '判定一次并留痕');
  assert.equal(seen[0].mode, 'dev-source', '判出开发态实装：' + JSON.stringify(seen[0]));
  await h.handle(STATUS, {});
  await settle();
  assert.equal(seen.length, 1, '每次装配至多一行（不随面板挂载刷屏）');

  // 对照：按版本号装在使用范围内的形态 ⇒ 状态电话成功，预检一次都不触发
  installPlugin({ version: '1.2.3' });
  const seen2: any[] = [];
  const h2 = makeHost({ onPrecheck: (v) => seen2.push(v) });
  const ok: any = await h2.handle(STATUS, {});
  assert.equal(ok.ok, true, '真安装形态可用：' + JSON.stringify(ok.error ?? ''));
  await settle();
  assert.equal(seen2.length, 0, '可用形态不写预检行');
  proof('precheck', 'dev-source 判定 + 与包真行为双向钉住 + 留痕一次 + 失败语义不变 + 可用形态零触发');
});

/* ---------- ④ 偏好落盘保留（M5 起无调度器）：meta.update.set 只写盘，meta.get 可读 ---------- */
test('T7-4 偏好落盘保留：meta.update.set 写盘 + meta.get 可读，不排任何定时器', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  assert.deepEqual(h.store.updatePrefs(), { autoCheckEnabled: true, intervalHours: 24 }, '默认值单点在 meta-store');
  const bad: any = await h.handle('meta.update.set', { autoCheckEnabled: 'yes', intervalHours: 24 });
  assert.equal(bad.ok, false, '非法值仍回 bad-request');
  const setOk: any = await h.handle('meta.update.set', { autoCheckEnabled: false, intervalHours: 6 });
  assert.equal(setOk.ok, true, '合法写应回 ok:true（M5 起无 sync 副作用也应成功）');
  const meta: any = await h.handle('meta.get', {});
  assert.deepEqual(meta.value.update, { autoCheckEnabled: false, intervalHours: 6 }, '偏好落 meta 全量快照（面板读这条）');
  assert.deepEqual(h.store.updatePrefs(), { autoCheckEnabled: false, intervalHours: 6 }, 'store 同步落盘');
  proof('prefs-retained', '偏好只落盘、无调度器副作用');
});

/* ---------- ⑤ 装配点（真跑 src/index.ts 的 apply()）：M5 起零定时器 ---------- */
type ManagedTimer = { kind: 'interval' | 'timeout'; ms: number; id: number; live: boolean };
/** 受管定时器桩：只登记、不真排（回调永不自动触发），按 kind + 延迟统计在册/已释放。 */
function managedTimers() {
  const seq: ManagedTimer[] = [];
  const released: string[] = [];
  const warns: string[] = [];
  const cleanups: (() => void)[] = [];
  const arm = (kind: 'interval' | 'timeout') => (_cb: () => void, ms: number): (() => void) => {
    const entry: ManagedTimer = { kind, ms, id: seq.length, live: true };
    seq.push(entry);
    return () => { if (!entry.live) return; entry.live = false; released.push(kind + ':' + ms + '#' + entry.id); };
  };
  const live = (kind: 'interval' | 'timeout', ms?: number): number =>
    seq.filter((t) => t.live && t.kind === kind && (ms === undefined || t.ms === ms)).length;
  const base = {
    logger: { info: (): void => {}, warn: (m: string): void => { warns.push(m); } },
    effect: (fn: () => unknown): void => { const d = fn(); if (typeof d === 'function') cleanups.push(d as () => void); },
    provide: (): void => {},
    interval: arm('interval'),
    timeout: arm('timeout'),
  };
  return { base, seq, released, warns, cleanups, live, total: (): number => seq.filter((t) => t.live).length };
}

/** 装配用的 mock 宿主 ctx：受管定时器 + `/api` 载体注册表（`registerError` = 宿主重复注册时的原话）。 */
function assemblyCtx(timers: ReturnType<typeof managedTimers>, registerError?: string) {
  const routes: any[] = [];
  const ctx = {
    ...timers.base,
    connection: {
      fetch: {
        register: (options: any) => {
          if (registerError !== undefined) throw new Error(registerError);
          routes.push(options);
          return () => { const i = routes.indexOf(options); if (i >= 0) routes.splice(i, 1); };
        },
      },
    },
  };
  return { ctx, routes };
}

test('T7-5a 装配点·让位分支：宿主报 already registered ⇒ 零受管定时器在册', async () => {
  installPlugin({ version: '1.2.3' });
  const timers = managedTimers();
  const { ctx, routes } = assemblyCtx(timers, 'connection: exact Fetch route "/api/im-companion" is already registered');
  const home = mkdtempSync(join(FIXTURE, 'assembly-'));
  hostEntry.apply(ctx, { dshHome: home });
  await settle();
  assert.equal(routes.length, 0, '让位分支不得注册路由');
  assert.equal(timers.total(), 0, '让位分支不得留任何在册句柄（§F.2：那个实例不建更新能力）');
  assert.equal(timers.seq.length, 0, '连「排过又释放」都不该有：让位分支在 createUpdateHostBridge 之前就 return 了');
  proof('assembly-yield', 'already registered ⇒ 0 路由 / 0 受管定时器');
});

test('T7-5b 装配点·正常路径：零在册句柄；经真路由改偏好后仍零句柄', async () => {
  installPlugin({ version: '1.2.3' });
  const timers = managedTimers();
  const { ctx, routes } = assemblyCtx(timers);
  const home = mkdtempSync(join(FIXTURE, 'assembly-'));
  hostEntry.apply(ctx, { dshHome: home });
  assert.equal(routes.length, 1, '正常路径必须注册 /api/im-companion 路由');
  await settle();
  assert.equal(timers.total(), 0, 'M5 起正常装配也不排任何受管定时器（调度器已删）');
  assert.equal(timers.seq.length, 0, '连排过都不该有：桥内无 timer 引用');
  // 面板改偏好：真路由 → `meta.update.set` → 只落盘（M5 起无 sync 重排）。
  const response = await routes[0].fetch({
    method: 'POST',
    json: async () => ({
      type: 'client-request', rpcId: 'a1', method: 'im-companion',
      payload: { method: 'meta.update.set', payload: { autoCheckEnabled: true, intervalHours: 6 } },
    }),
  });
  assert.equal(response.status, 200, 'meta.update.set 必须走通装配出来的真路由');
  await settle();
  assert.equal(timers.total(), 0, '改偏好后仍零在册（无 sync 重排）');
  proof('assembly-zero', '正常装配 0 句柄；改偏好后仍 0 句柄');
});
