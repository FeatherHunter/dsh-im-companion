// T7 #90 验证（更新系统宿主侧）· **#99 起按 dsh-plugin-update@0.2.0 重写**。
// 覆盖：三通电话信封 + 包字段原样 + 自动检查调度器 + autoCheck 运行期状态 + 装配点顺序保证。
//
// 为什么整份重写（与前版最大的分别）：
//   0.1.x 时本仓自持 `update-reader.ts` / `update-paths.ts`，靠 `readerOverrides.{runningVersion,profileDir,readInstalled}`
//   把「插件装在哪、跑的是哪版」喂进去，验证器喂的是**假盘 fs 端口**。0.2.0 把这些收进包内并按**包名**解析目标包
//   ⇒ 假 fs 端口这条路没了（包直接读真盘）。现在改用**真盘真布局**夹具：
//     ① 在临时目录造一个 DSH 使用范围：`<FIXTURE>/profiles/web/{package.json, node_modules/dsh-im-companion/**}`；
//     ② 把更新包**真拷贝**进该范围的 `node_modules`（见下：必须真拷贝，不能 junction）；
//     ③ 转译产物的 `node_modules/dsh-plugin-update` 只挂一条 junction 指向那份拷贝。
//   于是三通电话在**生产口径（零解析类 readerOverrides）**下真跑：只有网络与时钟是假的。
//
//   ⚠️ 为什么必须真拷贝：Node 按 **realpath** 解析模块，junction 会让包内 `import.meta.url` 落回本仓，
//   包就"看不见"这个假使用范围（它会解析到本仓的 package.json，再反推不出范围 ⇒ unknown-profile）。
//   这条正是 0.2.0 按包名解析的前提，也是 T1 取证（realpath 链）在验证器里的复用。
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
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
const rpcMod: any = await load('rpc.js');
const schedule: any = await load('update-schedule.js');
const metaMod: any = await load('meta-store.js');
const hostEntry: any = await import(pathToFileURL(join(BUILD, 'index.js')).href);
// 与转译产物**同一份真身**（同一条 junction ⇒ 同一 realpath ⇒ 同一模块实例）：否则 reset 打不到它的单例缓存。
const pkgMod: any = await import(pathToFileURL(join(BUILD, 'node_modules', 'dsh-plugin-update', 'dist', 'host.js')).href);

// 包内共享读取器按 (pluginId, prefix, runningVersion, profileDir, profileName, homeDir, environmentKind, target) 缓存：
// 每个宿主实例一条独立 home ⇒ 天然不同键；这里再显式复位一次，双保险。
beforeEach(() => { pkgMod.__resetSharedUpdateReaderForTests(); });

const proof = (id: string, detail: string): void => { console.log('T7-PROOF ' + id + ' PASS ' + detail); };
// 假时钟只管**排定**，被触发的检查仍是真异步（真 fs + 真 fetch 假件）⇒ 等它落定要用真定时器轮询，不能用 setImmediate。
const tick = (): Promise<void> => new Promise((r) => { setTimeout(r, 5); });
const settle = async (rounds = 8): Promise<void> => { for (let i = 0; i < rounds; i++) await tick(); };
const waitFor = async (fn: () => boolean, label: string): Promise<void> => {
  for (let i = 0; i < 400; i++) { if (fn()) return; await tick(); }
  throw new Error('等待超时：' + label);
};
const stripAuto = (value: any): Record<string, unknown> => { const { autoCheck, ...rest } = value; return rest; };

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

/* ---------- 假时钟 + 假定时器端口（真调度器跑在它上面） ---------- */
function fakeClock(startAt = 1_700_000_000_000) {
  let clock = startAt;
  const tasks: { at: number; ms: number; once: boolean; cb: () => void; dead: boolean }[] = [];
  const releases: string[] = [];
  const arm = (once: boolean) => (cb: () => void, ms: number): (() => void) => {
    const task = { at: clock + ms, ms, once, cb, dead: false };
    tasks.push(task);
    return () => { task.dead = true; releases.push((once ? 'once' : 'every') + '@' + clock); };
  };
  return {
    port: { every: arm(false), once: arm(true) },
    releases, startAt,
    now: (): number => clock,
    pending: (): number => tasks.filter((t) => !t.dead).length,
    /** 只跳到最近的到期点、按序触发：同一段推进里新排的定时器（补查 / 下一档）也能被吃掉。 */
    advance(ms: number): void {
      const target = clock + ms;
      for (;;) {
        const live = tasks.filter((t) => !t.dead && t.at <= target);
        if (live.length === 0) break;
        const next = live.reduce((a, b) => (a.at <= b.at ? a : b));
        clock = next.at;
        if (next.once) { next.dead = true; tasks.splice(tasks.indexOf(next), 1); } else next.at = clock + next.ms;
        next.cb();
      }
      clock = target;
    },
  };
}

/* ---------- 装配：真桥 + 真 rpc 派发 + 真偏好存储（只有网络 / 时钟 / home 是假的，解析全走生产口径） ---------- */
let homeSeq = 0;
type HostOpts = {
  readJob?: () => any; registry?: any; clock?: ReturnType<typeof fakeClock>;
  timerAbsent?: boolean; readerOverrides?: Record<string, unknown>; homeDir?: string;
};
function makeHost(opts: HostOpts = {}) {
  const registry = opts.registry ?? fakeRegistry();
  const clock = opts.clock ?? fakeClock();
  const home = opts.homeDir ?? mkdtempSync(join(FIXTURE, 'home' + (++homeSeq) + '-'));
  const store = new metaMod.AgentMetaStore(join(home, 'meta.json'));
  const warns: string[] = [];
  const logger = { info: (): void => {}, warn: (m: string): void => { warns.push(m); } };
  // 假时钟要喂给读取器：包内 check() 的 2 秒复查窗口与 receipt 有效期全走它自己的 `now` 端口，
  // 不注入就会按**真实**时间判窗口（假时钟推进 6 小时也照样命中缓存 → 假绿/假红）。
  const overrides: Record<string, unknown> = { fetchImpl: registry.fetchImpl, now: clock.now, ...opts.readerOverrides };
  if (opts.readJob) overrides.readJob = opts.readJob;
  const bridge = update.createUpdateHostBridge({
    ctx: {}, store, dshHome: home, readerOverrides: overrides,
    timer: opts.timerAbsent === true ? undefined : clock.port, now: clock.now, logger,
  });
  const handle = rpcMod.createAgentFleetHandler(store, { update: () => bridge });
  return { home, registry, clock, store, bridge, handle, warns };
}
const STATUS = 'imc.updateStatus'; const CHECK = 'imc.updateCheck'; const INSTALL = 'imc.updateInstall';
const JOB = { id: 'j1', state: 'installing', targetVersion: '1.2.3', message: null, requestId: 'r1' };
const withJob = (opts: HostOpts = {}) => makeHost({ ...opts, readJob: async () => ({ ...JOB }) });

/* ---------- ⓪ #99 解耦基线：零解析类 override，在真布局里三通电话全通 ---------- */
test('T7-0 0.2.0 原生解析：不喂 runningVersion/profileDir/readInstalled，仍认得出使用范围与版本', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost(); // overrides 里只有 fetchImpl / now（网络与时钟），没有任何解析输入
  const st: any = await h.handle(STATUS, {});
  assert.equal(st.ok, true, '生产口径必须能自己解析出使用范围（0.1.x 在这里恒 unknown-profile）');
  assert.equal(st.value.snapshot.installedVersion, '1.2.3', '磁盘版本来自真 fixture，不是本仓版本');
  assert.equal(st.value.snapshot.runningVersion, '1.2.3', '运行版本由包按包名解析目标包得到');
  assert.notEqual(st.value.snapshot.runningVersion, '0.1.17', '本仓版本号绝不能出现在这里（那说明解析落回了本仓）');
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

/* ---------- ① 三通电话：经 rpc.ts 端点表派发 + 本仓 RpcResult 信封 + 包字段原样 ---------- */
test('T7-1 三通电话可经 rpc.ts 派发，回包是本仓信封且包字段一个不少', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  assert.deepEqual([...update.UPDATE_ENDPOINTS], [STATUS, CHECK, INSTALL], '端点名常量 = 票面定死三通');
  assert.deepEqual(Object.keys(h.bridge.handlers).sort(), [STATUS, CHECK, INSTALL].sort(), '桥的表键必须是包给的电话名');
  for (const ep of [STATUS, CHECK]) {
    const raw: any = await h.bridge.handlers[ep]({});
    const result: any = await h.handle(ep, {});
    assert.equal(result.ok, true, ep + ' 应回 ok:true');
    assert.equal(result.error, undefined, ep + ' 成功信封不带 error');
    assert.deepEqual(Object.keys(raw).sort(), ['manual', 'ok', 'receipt', 'snapshot'], ep + ' 包载荷字段');
    assert.deepEqual(stripAuto(result.value), raw, ep + ' 包字段原样（ok/snapshot/manual/receipt 一个不少）');
    assert.deepEqual(result.value.snapshot, raw.snapshot, ep + ' snapshot 六字段内容不改');
    assert.equal((h.bridge.reply(raw) as any).value.snapshot, raw.snapshot, ep + ' 翻译层不换壳/不深拷贝掉引用');
    assert.deepEqual(result.value.autoCheck, h.bridge.autoCheck(), ep + ' autoCheck 与 manual 同级注入');
  }
  // install：真装机（spawn 子进程）不在 verify 内跑 ⇒ 走真失败通道；成功载荷的原样翻译用同一段 reply 的合成载荷钉住（含 receipt）。
  const rawFail: any = await h.bridge.handlers[INSTALL]({});
  const failed: any = await h.handle(INSTALL, {});
  assert.equal(failed.ok, false, 'install 缺 checkId 回失败信封（不抛）');
  assert.equal(failed.value, undefined, '失败信封不带 value');
  assert.equal(failed.error.code, 'check-expired', '原因码原样透传（包 README §5.2 的冻结词表）：' + failed.error.message);
  assert.deepEqual(failed.error.details.update, rawFail, '包原始载荷进 details.update，不吞掉');
  assert.ok(!JSON.stringify(failed).includes('autoCheck'), '失败信封里没有 autoCheck（消费方按「无失败可显示」处理）');
  const synthetic = {
    ok: true, snapshot: { runningVersion: '1.2.3', canInstall: false }, manual: null,
    receipt: { checkId: 'c1', checkedAt: 1_700_000_000_000, expiresAt: 1_700_000_600_000 },
  };
  const wrapped: any = h.bridge.reply(synthetic);
  assert.equal(wrapped.ok, true);
  assert.deepEqual(stripAuto(wrapped.value), synthetic, 'install 成功载荷（含 receipt）原样进 value');
  proof('endpoints', '三端点派发 + 原样字段 + 失败码 check-expired 透传');
});

/* ---------- ② snapshot 恰好六字段 ---------- */
test('T7-2 snapshot 恰好六字段（三通电话同源）', async () => {
  installPlugin({ version: '1.2.3' });
  const h = withJob(); // 注入 readJob ⇒ job 字段真的非空，六字段全被走到
  const SIX = ['blockedReason', 'canInstall', 'installedVersion', 'job', 'latestVersion', 'runningVersion'];
  for (const ep of [STATUS, CHECK, INSTALL]) {
    const payload = ep === INSTALL ? { checkId: 'c0', requestId: 'r1' } : {};
    const raw: any = await h.bridge.handlers[ep](payload);
    assert.equal(raw.ok, true, ep + ' 应回 ok（' + JSON.stringify(raw) + '）');
    assert.deepEqual(Object.keys(raw.snapshot).sort(), SIX, ep + ' snapshot 字段集合');
    assert.equal(typeof raw.snapshot.canInstall, 'boolean', ep + ' canInstall 是布尔');
    assert.equal(raw.snapshot.job?.id, 'j1', ep + ' job 原样透出（同一请求号 → 原样回上一条活儿）');
    const result: any = await h.handle(ep, payload);
    assert.deepEqual(stripAuto(result.value), raw, ep + ' 六字段经信封不变');
  }
  proof('snapshot', '三通电话 snapshot 均六字段、job 非空');
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
  // 注意形态：这不是快照里的 blockedReason，而是解析阶段就抛 → 三通电话整通回失败信封。
  installPluginOutside('1.2.3');
  const outside: any = await makeHost().handle(STATUS, {});
  assert.equal(outside.ok, false, '范围外实装 ⇒ 认不出使用范围（0.2.0 的诚实答复）');
  assert.equal(outside.error.code, 'unknown-profile', '失败码是包冻结词表里的 unknown-profile：' + JSON.stringify(outside.error));
  assert.equal(outside.value, undefined, '失败信封不带 value');
  // 集成方的口子：显式交 profileDir（本仓装配不传，只有这类越界布局才需要）⇒ 立刻变成可诊断的 source-install。
  const patched: any = await makeHost({ readerOverrides: { profileDir: PROFILE } }).handle(STATUS, {});
  assert.equal(patched.value.snapshot.blockedReason, 'source-install', '补上 profileDir ⇒ 判据齐全，落源安装');
  assert.equal(patched.value.manual, null, '源安装仍不给命令');
  proof('source-install', 'link: ⇒ source-install/manual=null；版本号 ⇒ 给命令；越界 ⇒ unknown-profile（+profileDir 口子）');
});

/* ---------- ④ 调度器（假时钟 + 假定时器） ---------- */
test('T7-4a 默认不立刻触发，60 秒后首查一次', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  h.bridge.start();
  await waitFor(() => h.clock.pending() === 2, '装配排定两个定时器');
  assert.equal(h.registry.state.calls, 0, '装配后不得立刻打源');
  assert.equal(h.bridge.autoCheck().nextCheckAt, h.clock.startAt + 60_000, 'nextCheckAt = 首查（60s）');
  assert.deepEqual(h.store.updatePrefs(), { autoCheckEnabled: true, intervalHours: 24 }, '默认值单点在 meta-store');
  h.clock.advance(59_999); await settle();
  assert.equal(h.registry.state.calls, 0, '59.999s 还不到点');
  h.clock.advance(1);
  await waitFor(() => h.registry.state.calls === 1, '60s 首查');
  assert.equal(h.clock.pending(), 1, '首查是一次性定时器，跑完即消（周期档位还在）');
  proof('startup-first', '0 次 → 60s 首查 1 次，默认开/24h');
});

test('T7-4b 档位 6/12/24/168 小时到点才触发', async () => {
  const H = 3_600_000;
  installPlugin({ version: '1.2.3' });
  for (const hours of [6, 12, 24, 168]) {
    const h = makeHost();
    await h.store.setUpdate({ autoCheckEnabled: true, intervalHours: hours });
    h.bridge.start();
    await waitFor(() => h.clock.pending() === 2, hours + 'h：档位 + 首查都排定');
    const due = h.clock.startAt + hours * H;
    assert.equal(h.bridge.autoCheck().nextCheckAt, h.clock.startAt + 60_000, hours + 'h：首查更早，先报它');
    h.clock.advance(60_000);
    await waitFor(() => h.registry.state.calls === 1, hours + 'h：首查已发生');
    assert.equal(h.bridge.autoCheck().nextCheckAt, due, hours + 'h 档位在装配时刻排定');
    h.clock.advance(due - 1 - h.clock.now()); await settle();
    assert.equal(h.registry.state.calls, 1, hours + 'h 未到点不得触发');
    h.clock.advance(1);
    await waitFor(() => h.registry.state.calls === 2, hours + 'h 到点触发一次');
    await settle();
    assert.equal(h.registry.state.calls, 2, hours + 'h 到点只触发一次');
  }
  proof('intervals', '6/12/24/168 档位均只在该到点时触发');
});

test('T7-4c 关开关：定时器被真释放，之后推进一周零触发', async () => {
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  h.bridge.start();
  await waitFor(() => h.clock.pending() === 2, '装配排定两个定时器');
  await h.handle('meta.update.set', { autoCheckEnabled: false, intervalHours: 24 }); // 面板走这条 → sync()
  await settle();
  assert.equal(h.clock.pending(), 0, '两个在册定时器都应被释放');
  assert.ok(h.clock.releases.length >= 2, '释放函数必须真被调用：' + JSON.stringify(h.clock.releases));
  assert.equal(h.bridge.autoCheck().nextCheckAt, null, '开关关闭 → nextCheckAt 为 null');
  h.clock.advance(7 * 24 * 3_600_000); await settle();
  assert.equal(h.registry.state.calls, 0, '释放后推进一周也不得再有检查');
  const meta: any = await h.handle('meta.get', {});
  assert.deepEqual(meta.value.update, { autoCheckEnabled: false, intervalHours: 24 }, '偏好落 meta 全量快照（面板读这条）');
  await h.handle('meta.update.set', { autoCheckEnabled: true, intervalHours: 6 }); await settle();
  assert.equal(h.bridge.autoCheck().nextCheckAt, h.clock.now() + 6 * 3_600_000, '重开只排档位，不重跑启动首查');
  proof('switch-off', '释放 ' + h.clock.releases.length + ' 个定时器，推进一周零触发');
});

test('T7-4d 热重载不留双份：释放旧代后重装配，触发次数不翻倍', async () => {
  installPlugin({ version: '1.2.3' });
  const clock = fakeClock();
  const a = makeHost({ clock });
  await a.store.setUpdate({ autoCheckEnabled: true, intervalHours: 6 });
  a.bridge.start();
  await waitFor(() => clock.pending() === 2, '旧代排定两个定时器');
  clock.advance(60_000);
  await waitFor(() => a.registry.state.calls === 1, '旧代首查');
  a.bridge.dispose(); // = src/index.ts 挂的 ctx.effect 卸载释放
  assert.equal(clock.pending(), 0, '旧代释放后不得留任何在册定时器');
  const b = makeHost({ clock, registry: a.registry, homeDir: a.home }); // 同 home / 同源 = 热重载重装配
  b.bridge.start();
  await waitFor(() => clock.pending() === 2, '新代排定两个定时器');
  const base = a.registry.state.calls;
  clock.advance(60_000);
  await waitFor(() => a.registry.state.calls === base + 1, '新代首查');
  clock.advance(6 * 3_600_000 - 60_000);
  await waitFor(() => a.registry.state.calls === base + 2, '新代 6h 档位那一发');
  await settle();
  assert.equal(a.registry.state.calls - base, 2, '本段只应 2 次（新代首查 + 新代档位）；旧代若没释放会多出档位那一发');
  proof('hot-reload', '旧代释放 → 新代 6h 段内 2 次（非 3 次）');
});

test('T7-4e 定时器一律走 ctx 受管服务；没有服务时不排（不用裸 setInterval）', async () => {
  installPlugin({ version: '1.2.3' });
  const clock = fakeClock();
  const used: string[] = [];
  const port = update.ctxTimerPort({
    interval: (cb: () => void, ms: number) => { used.push('interval:' + ms); return clock.port.every(cb, ms); },
    timeout: (cb: () => void, ms: number) => { used.push('timeout:' + ms); return clock.port.once(cb, ms); },
  });
  const h = makeHost({ timerAbsent: true, clock });
  h.bridge.start(); await settle();
  assert.equal(h.clock.pending(), 0, '无受管定时器 ⇒ 不排任何定时器');
  assert.ok(h.warns.some((w) => w.includes('自动检查不启用')), '应诚实 warn：' + JSON.stringify(h.warns));
  const arm = (port as any).once(() => {}, 1_000);
  assert.equal(typeof arm, 'function', 'ctx.timeout 的释放函数原样回给上层');
  assert.match(used.join('|'), /timeout:1000/, '一次性走 ctx.timeout（不是 ctx.interval）');
  assert.equal(update.ctxTimerPort({}), null, '缺服务回 null，上层诚实降级');
  proof('timer-port', 'ctx.interval/timeout 受管；缺服务 → warn 且零定时器');
});

/* ---------- ⑤ autoCheck 运行期状态 ---------- */
test('T7-5a 形状与初值：从未自动检查过 → failing=false、lastFailureAt=null，三通电话都带', async () => {
  installPlugin({ version: '1.2.3' });
  const h = withJob();
  const view = h.bridge.autoCheck();
  assert.deepEqual(Object.keys(view).sort(), ['failing', 'lastFailureAt', 'nextCheckAt'], 'autoCheck 三字段');
  assert.equal(view.failing, false, '绝不能 true 初始化：新装用户一开面板就会看到「自动检查暂时不可用」');
  assert.equal(view.lastFailureAt, null);
  assert.equal(view.nextCheckAt, null, '未装配 ⇒ 无下次时间');
  for (const ep of [STATUS, CHECK, INSTALL]) {
    const payload = ep === INSTALL ? { checkId: 'c0', requestId: 'r1' } : {};
    const result: any = await h.handle(ep, payload);
    assert.equal(result.ok, true, ep);
    assert.ok(['manual', 'snapshot', 'autoCheck'].every((k) => k in result.value), ep + ' autoCheck 与 manual 同级');
    assert.deepEqual(result.value.autoCheck, view, ep + ' 三通电话都带同一份运行期状态');
  }
  proof('autoCheck-shape', JSON.stringify(view));
});

test('T7-5b 自动失败 → failing=true + lastFailureAt；任一成功（手动/自动）清空且不变式成立', async () => {
  const H = 3_600_000;
  installPlugin({ version: '1.2.3' });
  const h = makeHost();
  h.registry.state.mode = 'fail';
  h.bridge.start();
  await waitFor(() => h.clock.pending() === 2, '装配排定定时器');
  h.clock.advance(60_000);
  await waitFor(() => h.bridge.autoCheck().failing === true, '自动检查失败进失败态');
  assert.equal(h.bridge.autoCheck().lastFailureAt, h.clock.startAt + 60_000, '记为失败发生时刻');
  h.clock.advance(300_000);
  await waitFor(() => h.registry.state.calls === 2, '首查失败 5 分钟后补一次');
  assert.equal(h.bridge.autoCheck().failing, true, '补查仍失败 ⇒ 仍在失败态');
  h.registry.state.mode = 'ok';
  const manual: any = await h.handle(CHECK, {});
  assert.equal(manual.ok, true);
  assert.equal(h.bridge.autoCheck().failing, false, '手动成功也清（owner 裁定：成功后自动消失）');
  assert.equal(h.bridge.autoCheck().lastFailureAt, null, '不变式：failing=false ⇒ lastFailureAt=null');
  h.registry.state.mode = 'fail';
  h.clock.advance(h.clock.startAt + 24 * H - h.clock.now());
  await waitFor(() => h.bridge.autoCheck().failing === true, '档位那一发失败又进失败态');
  h.registry.state.mode = 'ok';
  h.clock.advance(24 * H);
  await waitFor(() => h.bridge.autoCheck().failing === false, '自动成功清空');
  assert.equal(h.bridge.autoCheck().lastFailureAt, null);
  proof('autoCheck-fail', '失败 → 补查 → 手动成功清空 → 再失败 → 自动成功清空');
});

/* ---------- ⑥ 装配点（真跑 src/index.ts 的 apply()）：票面 §F.2 断言 ---------- */
// 前六段都只**直接构造桥**，走不到「让位分支不建定时器」这条装配期顺序保证；本段用带
// `interval` / `timeout` 的 mock ctx 真跑 `apply()`，把顺序保证升级成断言（R6 整改项 2）。
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

test('T7-6a 装配点·让位分支：宿主报 already registered ⇒ 零受管定时器在册', async () => {
  installPlugin({ version: '1.2.3' });
  const timers = managedTimers();
  const { ctx, routes } = assemblyCtx(timers, 'connection: exact Fetch route "/api/im-companion" is already registered');
  const home = mkdtempSync(join(FIXTURE, 'assembly-'));
  hostEntry.apply(ctx, { dshHome: home });
  await settle();
  assert.equal(routes.length, 0, '让位分支不得注册路由');
  assert.equal(timers.total(), 0, '让位分支不得留任何在册句柄（§F.2：那个实例不建更新能力）');
  assert.equal(timers.seq.length, 0, '连「排过又释放」都不该有：让位分支在 createUpdateHostBridge 之前就 return 了');
  assert.ok(timers.warns.some((w) => w.includes('already registered')), '应留 warn：' + JSON.stringify(timers.warns));
  proof('assembly-yield', 'already registered ⇒ 0 路由 / 0 受管定时器');
});

test('T7-6b 装配点·正常路径：恰好 2 个在册句柄；经真路由改档位后周期仍一份', async () => {
  const H = 3_600_000;
  installPlugin({ version: '1.2.3' });
  const timers = managedTimers();
  const { ctx, routes } = assemblyCtx(timers);
  const home = mkdtempSync(join(FIXTURE, 'assembly-'));
  hostEntry.apply(ctx, { dshHome: home });
  assert.equal(routes.length, 1, '正常路径必须注册 /api/im-companion 路由');
  await waitFor(() => timers.total() === 2, '装配后排定两个受管定时器');
  assert.equal(timers.live('interval', 24 * H), 1, '周期句柄恰一份（默认档位 24h）');
  assert.equal(timers.live('timeout', 60_000), 1, '启动首查是一次性 60s：走 ctx.timeout，不是 ctx.interval');
  assert.equal(timers.total(), 2, '在册总数恰 2（与实现实际在册数量一致）');
  // 面板改档位：真路由 → `meta.update.set` → 桥 `sync()` → 释放旧档位句柄 + 建新档位句柄（首查槽不动）。
  const response = await routes[0].fetch({
    method: 'POST',
    json: async () => ({
      type: 'client-request', rpcId: 'a1', method: 'im-companion',
      payload: { method: 'meta.update.set', payload: { autoCheckEnabled: true, intervalHours: 6 } },
    }),
  });
  assert.equal(response.status, 200, 'meta.update.set 必须走通装配出来的真路由');
  await waitFor(() => timers.live('interval', 6 * H) === 1, '改档位后新档位句柄在册');
  await settle();
  assert.equal(timers.live('interval'), 1, '周期句柄恒一份：旧档位那一份必须先释放');
  assert.equal(timers.total(), 2, '在册总数仍 2（周期 + 首查）');
  assert.ok(timers.released.includes('interval:' + 24 * H + '#0'), '旧档位句柄真被 dispose：' + JSON.stringify(timers.released));
  proof('assembly-armed', '正常装配 2 个在册句柄；改档位后仍 1 周期 + 1 首查');
});

test('T7-6c 回归①：apply() 早于 start() ⇒ 周期句柄只一份、抢跑那份先释放', async () => {
  const H = 3_600_000;
  const timers = managedTimers();
  const prefs = { autoCheckEnabled: true, intervalHours: 6 };
  const scheduler = schedule.createUpdateScheduler({
    timer: update.ctxTimerPort(timers.base), now: () => 1_700_000_000_000, check: async () => true,
  });
  // 真机时序：装配期读偏好是异步的（update.ts 的 start() 等 store.load() 落定），面板可在那之前
  // 经 `meta.update.set` 走到 `sync()` → `apply()`。此刻档位槽里已经有句柄，而 start() 还没跑。
  scheduler.apply(prefs);
  assert.equal(scheduler.armed(), 1, '抢跑时档位槽已有 1 个句柄');
  const straggler = timers.seq[0];
  scheduler.start(prefs); // 修复前：这里直接覆盖档位槽 ⇒ 老句柄泄漏 + 周期检查双份
  assert.equal(timers.live('interval', 6 * H), 1, '周期句柄恒一份（不双份）');
  assert.equal(timers.total(), 2, '最终在册恰 2：周期 + 启动首查');
  assert.equal(scheduler.armed(), 2, 'armed() 与在册数一致');
  assert.equal(straggler.live, false, '抢跑时那个旧句柄必须先被 dispose（不泄漏）');
  assert.ok(timers.released.includes('interval:' + 6 * H + '#0'), '释放记录：' + JSON.stringify(timers.released));
  assert.equal(scheduler.nextCheckAt(), 1_700_000_000_000 + 60_000, '首查 60s 更早，先报它');
  proof('apply-before-start', '抢跑旧句柄释放 → 周期 1 份、在册 2');
});
