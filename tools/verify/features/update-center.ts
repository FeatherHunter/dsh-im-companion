// T8 #91 验证（更新中心客户端）：八种阻塞原因文案 + 两个信封解构 + 失败灰字门 + 轮询规则 + 命令门。
// 做法与 session-header-model 同范式：把 feature 的纯模块复制到临时目录、把 extensionless 相对 import
// 改写成 nodenext 可解，再用仓库自带 tsc 转译后 import **真实现**（不 mock 被测逻辑，只注入 rpc / 定时器两个端口）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const STAGE = mkdtempSync(join(tmpdir(), 't8-uc-src-'));
const OUT = mkdtempSync(join(tmpdir(), 't8-uc-'));
after(() => {
  rmSync(STAGE, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
});
// 临时目录两侧都要 type:module：输入侧决定 tsc 的产物格式，输出侧决定 node 按 ESM 载入（update-host.ts 同款理由）。
writeFileSync(join(STAGE, 'package.json'), '{"type": "module"}\n');
writeFileSync(join(OUT, 'package.json'), '{"type": "module"}\n');
// 宿主侧文件（src/host/meta-store.ts）按裸模块字样 import 'node:fs'/'node:path' ⇒ 临时目录里要能解析到 @types/node：
// 从本仓 node_modules 挂一条 junction（与 update-host.ts 同款理由；运行时用的是内置模块，junction 只为 tsc 解析）。
try { symlinkSync(join(REPO, 'node_modules'), join(STAGE, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }

/** 复制待测源文件到 stage（保留相对路径），并把 './x' 改写成 './x.js'（仅测试副本，产物代码不动）。 */
function stageFile(rel: string): void {
  const src = join(REPO, rel);
  const dst = join(STAGE, rel);
  mkdirSync(dirname(dst), { recursive: true });
  const fixed = readFileSync(src, 'utf8').replace(/(from\s+['"])(\.[^'"]*)(['"])/g, (m, a, spec, c) =>
    String(spec).endsWith('.js') ? m : a + spec + '.js' + c);
  writeFileSync(dst, fixed);
}
const FILES = [
  'src/features/update-center/constants.ts',
  'src/features/update-center/phone.ts',
  'src/features/update-center/reasons.ts',
  'src/features/update-center/text.ts',
  'src/features/update-center/data.ts',
  'src/features/update-center/markdown.ts',
  'src/features/update-center/changelog.ts',
  'src/client/dom.ts',
  'src/host/meta-store.ts',
];
for (const f of FILES) stageFile(f);
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...FILES.map((f) => join(STAGE, f)),
    '--ignoreConfig', '--outDir', OUT, '--rootDir', STAGE,
    '--module', 'nodenext', '--target', 'es2023', '--moduleResolution', 'nodenext',
    '--typeRoots', join(REPO, 'node_modules', '@types'), '--types', 'node', // 宿主文件要 node:fs/node:path 的类型
    '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false', '--strict',
  ], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
const mod = (f: string): Promise<any> => import(pathToFileURL(join(OUT, 'src', f)).href);
const data: any = await mod('features/update-center/data.js');
const phone: any = await mod('features/update-center/phone.js');
const reasons: any = await mod('features/update-center/reasons.js');
const log: any = await mod('features/update-center/changelog.js');
const consts: any = await mod('features/update-center/constants.js');
const text: any = await mod('features/update-center/text.js');
const hostMeta: any = await mod('host/meta-store.js');

const proof = (id: string, detail: string): void => { console.log('T8-PROOF ' + id + ' PASS ' + detail); };
const flush = (): Promise<void> => new Promise((r) => { setImmediate(r); });
const SNACK = { runningVersion: '0.1.8', installedVersion: '0.1.8', latestVersion: null, canInstall: false, blockedReason: null, job: null };
const AUTO_OK = { failing: false, lastFailureAt: null, nextCheckAt: null };
const okValue = (over: Record<string, unknown> = {}): any => ({
  ok: true, snapshot: { ...SNACK, ...(over.snapshot as object ?? {}) }, manual: over.manual ?? null,
  receipt: over.receipt ?? null, autoCheck: over.autoCheck === undefined ? AUTO_OK : over.autoCheck,
});
const envelope = (over: Record<string, unknown> = {}): any => ({ ok: true, value: okValue(over) });

/* ---------- ① 十三种 blockedReason → 中文文案（逐条；表里字符串照抄票面 §六） ----------
 * 来源：前八条是**档案 §B 的镜像**（docs/research/更新系统-T4决策档案.md，「八种 blockedReason → 中文文案」那一段），
 * 逐字一致、不是可以自由改写的第二份文案源——它只是"验证时比对的期望值"，改文案的**唯一**动作是改档案 §B。
 * 因此改文案必须**三处同步**：档案 §B → src/features/update-center/reasons.ts → 本文件 REASON_TEXT；
 * 只改一处即漂移（R10 H15 抓到的正是这里：比档案多了一句「或用下面的命令覆盖安装。」而 reasons.ts 已对齐档案）。
 * 后五条（T10 真机补录，2026-09-12）：更新包 `dist/host.js` 的 known 码表共 13 条，档案 §B 当时只覆盖 8 条；
 * 真机点安装回 `check-expired` 却落到「未知的安装阻塞」兜底，故补齐——档案侧同日在 §7 追加了「补录」小节。 */
const REASON_TEXT: Record<string, string> = {
  'unknown-profile': '认不出当前的使用范围，请把使用范围名或目录修好后再看更新。',
  'source-install': '当前是从源码安装的，想走更新请先按版本号重装一次。',
  'invalid-installation': '已安装的包不完整，请用下面的命令重装当前版本后再检查。',
  'installation-changed': '运行中的版本与磁盘上装好的版本不一致；重启宿主后即生效。',
  'pending-restart': '新版已装好，重启宿主后生效（这不是失败）。',
  'registry-conflict': '使用范围的清单里那一行不是版本号，改成版本号后重试。',
  'incompatible-node': '新版要求更高的 Node，请先升级 Node 到 22 或更高再检查。',
  'recovery-required': '上次安装被打断，请重新点一次安装；一直出现就按更新包文档排错。',
  'check-expired': '检查结果已过期（或缺请求凭证），请重新检查后再安装。',
  'update-busy': '另一次安装还在进行中，稍等片刻再试。',
  'check-failed': '检查更新失败（网络或官方源暂时不可达），请稍后重试。',
  'invalid-release': '官方源上的版本信息不完整，这一版暂时装不了。',
  'install-failed': '安装没成功，请重试；一直失败就用下面的手工命令。',
};
/** 给不出可用命令的六种（档案 §B 两条 + 补录四条）：补救动作是"重新检查/稍等/等网络"，不是重装命令。 */
const NO_COMMAND = ['unknown-profile', 'source-install', 'check-expired', 'update-busy', 'check-failed', 'invalid-release'];
test('T8-1 十三种 blockedReason 逐条译成票面文案（六种不给命令）', () => {
  assert.equal(Object.keys(reasons.REASONS).length, 13, '原因表必须恰好十三条（＝包 known 码表全集）');
  for (const [key, text] of Object.entries(REASON_TEXT)) {
    assert.equal(reasons.reasonText(key), text, key + ' 文案');
    assert.equal(reasons.noCommandOf(key), NO_COMMAND.includes(key), key + ' 是否属「不给命令」态');
  }
  assert.equal(reasons.noCommandOf('registry-conflict'), false, 'registry-conflict 无赋值路径但保留为给命令态（防御性设计）');
  assert.equal(reasons.noCommandOf('install-failed'), false, 'install-failed 正是"给手工命令"那一态');
  assert.match(reasons.reasonText('nobody-knows'), /nobody-knows/, '未知 token 照原样露出，不谎报「未知错误」');
  // 六态优先级：pending-restart 归「待重启」，其余十二种归「装不了」
  for (const key of Object.keys(REASON_TEXT)) {
    const res = phone.decodePhone(envelope({ snapshot: { blockedReason: key } }));
    const want = key === 'pending-restart' ? 'restart' : 'blocked';
    assert.equal(data.deriveState(res, false), want, key + ' → ' + want);
  }
  proof('reasons', '13 条文案逐条一致 + 六态归位（pending-restart→restart）');
});

/* ---------- ② 两个信封都能解构（成功 + 失败通道同名 token） ---------- */
test('T8-2 成功信封 / 失败信封（同名 token 从错误通道回来）都要处理；失败信封无 autoCheck 不算失败', () => {
  const good = phone.decodePhone(envelope({ snapshot: { latestVersion: '0.1.9', canInstall: true } }));
  assert.equal(good.ok, true);
  assert.deepEqual(Object.keys(good.snapshot).sort(),
    ['blockedReason', 'canInstall', 'installedVersion', 'job', 'latestVersion', 'runningVersion'], 'snapshot 六字段');
  assert.equal(data.deriveState(good, false), 'update');
  // 失败通道：同名 token 两种形态（扁平 errorKind / 嵌套 details.update.error）
  const flat = phone.decodePhone({ ok: false, error: 'source-install', errorKind: 'source-install' });
  assert.equal(flat.ok, false);
  assert.equal(phone.blockedTokenOf(flat), 'source-install');
  assert.equal(reasons.reasonText(phone.blockedTokenOf(flat)), REASON_TEXT['source-install'], '失败通道与 snapshot 通道同一词表');
  const deep = phone.decodePhone({ ok: false, error: { code: 'check-expired', message: 'x', details: { update: { ok: false, error: 'source-install' } } } });
  assert.equal(phone.blockedTokenOf(deep), 'source-install', '包原始载荷里的 token 优先于外层 code');
  assert.equal(data.deriveState(deep, false), 'blocked', '失败信封按阻塞渲染，不崩');
  // 失败信封没有 autoCheck ⇒ 按「无失败可显示」处理
  assert.equal(phone.failingOf(flat), false, '取不到 autoCheck 一律不算失败');
  assert.equal(data.deriveState(flat, phone.failingOf(flat)), 'blocked', '不得渲染成「检查失败」态');
  assert.equal(phone.decodePhone({ ok: true }).ok, false, '成功信封缺 value 也要活下来');
  assert.equal(phone.decodePhone(null).token, null, '空回包不抛');
  proof('envelopes', '成功/失败双通道同 token → 同一文案；无 autoCheck ⇒ 不谎报失败');
});

/* ---------- ③ 失败灰字门：failing === false 时绝不出现 ---------- */
test('T8-3 灰字显示条件唯一来源 failing===true（初值 false ⇒ 新装用户看不到「暂时不可用」）', async () => {
  assert.equal(phone.failingOf(phone.decodePhone(envelope())), false, 'failing:false 不显示灰字');
  assert.equal(phone.failingOf(phone.decodePhone(envelope({ autoCheck: null }))), false, 'autoCheck 整体缺席也不显示');
  assert.equal(phone.failingOf(phone.decodePhone(envelope({ autoCheck: { failing: true, lastFailureAt: 1, nextCheckAt: null } }))), true);
  assert.equal(data.deriveState(phone.decodePhone(envelope()), false), 'latest', '无失败 ⇒ 已是最新（不是 failed）');
  assert.equal(data.deriveState(phone.decodePhone(envelope({ autoCheck: { failing: true, lastFailureAt: 1, nextCheckAt: null } })), true), 'failed');
  // 成功检查后灰字消失：同一份 store 上 check 成功 → failing 归 false
  const st = fakeRpc({ autoCheck: { failing: true, lastFailureAt: 111, nextCheckAt: null } });
  const store = data.createUpdateStore({ rpc: st.rpc, meta: null }, { timer: fakeTimer().port, now: () => 1_700_000_000_000 });
  await store.readStatus();
  assert.equal(store.failing(), true, '宿主报失败 ⇒ 灰字条件成立');
  st.state.autoCheck = AUTO_OK;
  await store.check();
  assert.equal(store.failing(), false, '任何一次检查成功（自动或手动）后灰字应消失');
  store.dispose();
  proof('fail-gate', 'failing:false/缺席 ⇒ 无灰字；成功后清空');
});

/* ---------- ④ 轮询规则：只有 installing/verifying 开表、离开即清、至多一个 ---------- */
function fakeTimer() {
  let seq = 0;
  const tasks = new Map<number, { fn: () => void; ms: number; dead: boolean }>();
  const armed: number[] = [];
  const cleared: number[] = [];
  return {
    port: {
      setInterval: (fn: () => void, ms: number): number => { const id = ++seq; tasks.set(id, { fn, ms, dead: false }); armed.push(ms); return id; },
      clearInterval: (id: number): void => { const t = tasks.get(id); if (t && !t.dead) { t.dead = true; cleared.push(id); } },
    },
    armed, cleared,
    live: (): number => [...tasks.values()].filter((t) => !t.dead).length,
    fire: (): void => { for (const t of [...tasks.values()]) if (!t.dead) t.fn(); },
  };
}
function fakeRpc(over: Record<string, unknown> = {}) {
  const calls: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const state: any = { job: null, autoCheck: AUTO_OK, snapshot: { ...SNACK }, manual: null, ...over };
  const rpc = async (_ch: string, endpoint: string, payload: Record<string, unknown>): Promise<unknown> => {
    calls.push({ endpoint, payload });
    const value = okValue({ snapshot: { ...state.snapshot, job: state.job }, manual: state.manual, autoCheck: state.autoCheck, receipt: state.receipt });
    return { ok: true, value };
  };
  return { calls, state, rpc };
}
const JOB = (jobState: string): any => ({ id: 'j1', state: jobState, targetVersion: '0.1.9', message: null, requestId: 'r1' });

test('T8-4a 只有 installing/verifying 开 1s 表，离开立即清；轮询只调 UPD_STATUS', async () => {
  const timer = fakeTimer();
  const st = fakeRpc({ snapshot: { latestVersion: '0.1.9', canInstall: true }, receipt: { checkId: 'c1' } });
  const store = data.createUpdateStore({ rpc: st.rpc, meta: null }, { timer: timer.port, now: () => 1 });
  await store.readStatus();
  assert.equal(timer.live(), 0, '静息态不得开表');
  st.state.job = JOB('installing');
  await store.readStatus();
  assert.equal(timer.live(), 1, '进入 installing 开表');
  assert.deepEqual(timer.armed, [1000], '周期 = UPD_POLL(1000ms)，且只建过一个');
  st.state.job = JOB('verifying');
  await store.readStatus();
  assert.equal(timer.live(), 1, 'verifying 期间仍只有一个定时器');
  assert.equal(timer.armed.length, 1, '不得重复建表（至多一个 update 定时器）');
  timer.fire(); await flush();
  const polled = st.calls.filter((c) => c.endpoint === consts.UPD_STATUS).length;
  assert.ok(polled >= 3, '轮询必须调 UPD_STATUS：' + polled);
  assert.equal(st.calls.filter((c) => c.endpoint === consts.UPD_CHECK).length, 0, '轮询不得夹带 UPD_CHECK（查新版要联网）');
  st.state.job = JOB('installed');
  await store.readStatus();
  assert.equal(timer.live(), 0, '离开 installing/verifying 立即清表');
  assert.equal(timer.cleared.length >= 1, true);
  timer.fire(); await flush();
  assert.equal(st.calls.filter((c) => c.endpoint === consts.UPD_CHECK).length, 0);
  store.dispose();
  proof('poll-lifecycle', 'installing/verifying 开表 1 个 → 离开即清 → 只调 status');
});

test('T8-4b 每拍只发一发 status（不叠加）；dispose 清干净；安装走 install → 先复检拿 receipt', async () => {
  const timer = fakeTimer();
  const st = fakeRpc();
  const store = data.createUpdateStore({ rpc: st.rpc, meta: null }, { timer: timer.port, now: () => 1 });
  await store.readStatus();
  st.state.job = JOB('installing');
  await store.readStatus();
  const before = st.calls.length;
  timer.fire(); timer.fire(); await flush(); // 上一发未回来时连开两枪
  assert.equal(st.calls.length - before, 1, '上一发未落定时再拍一拍必须跳过（不叠加成两发）');
  timer.fire(); await flush();
  assert.equal(st.calls.length - before, 2, '落定后再拍 → 正常一发');
  st.state.job = null;
  st.state.receipt = { checkId: 'c1' };
  await store.readStatus(); // 离开 installing ⇒ 该拍即清
  assert.equal(timer.live(), 0, '离开 installing/verifying ⇒ 立即 clearInterval');
  await store.install(); // 手上有 receipt ⇒ 直接装，不重复联网检查
  assert.deepEqual(st.calls.slice(-1).map((c) => c.endpoint), [consts.UPD_INSTALL], '有 receipt 时 install 不再多查一次');
  assert.equal(st.calls[st.calls.length - 1].payload.checkId, 'c1', 'install 带 receipt 里的 checkId');
  // receipt 归 null（面板重开后 updateStatus 恒为 null）⇒ 先复检拿新 receipt，别让用户撞 check-expired
  st.state.receipt = null;
  await store.readStatus();
  st.state.receipt = { checkId: 'c2' };
  await store.install();
  const seq = st.calls.slice(-2).map((c) => c.endpoint);
  assert.deepEqual(seq, [consts.UPD_CHECK, consts.UPD_INSTALL], '无 receipt ⇒ 先复检再装');
  assert.equal(st.calls[st.calls.length - 1].payload.checkId, 'c2', '用新 receipt 装');
  /* T10 真机回归（2026-09-12）：更新包 `dist/service.js:299` 要 `validRequestId(requestId)`（非空串），
   * 漏传一律抛 `check-expired` ⇒ 面板永远装不了任何版本。此处锁死"必须带非空 requestId"这条契约。 */
  const rid = st.calls[st.calls.length - 1].payload.requestId;
  assert.equal(typeof rid, 'string', 'install 必须带 requestId（漏传 = 包判 check-expired）');
  assert.ok(String(rid).trim().length >= 1 && String(rid).trim().length <= 128, 'requestId 必须落在包的长度闸内');
  const rid1 = st.calls[st.calls.length - 2].payload.requestId;
  assert.notEqual(String(rid1), String(rid), '每次点安装发新凭证（幂等键不该跨次复用）');
  st.state.job = JOB('installing');
  await store.readStatus();
  assert.equal(timer.live(), 1, '又进安装态 ⇒ 重新开表');
  store.dispose();
  assert.equal(timer.live(), 0, 'dispose 必须清表（第二路清理）');
  proof('poll-single', '不叠加；离开即清 + dispose 清表；install 复用/复检 receipt');
});

test('T8-4c 常量冻结值（包真身核对过的五条）', () => {
  assert.deepEqual(
    [consts.UPD_STATUS, consts.UPD_CHECK, consts.UPD_INSTALL, consts.UPD_POLL, consts.UPD_POLL_MIN],
    ['imc.updateStatus', 'imc.updateCheck', 'imc.updateInstall', 1000, 250]);
  proof('constants', '五个常量与 dsh-plugin-update@0.1.1 派生结果一致');
});

/* ---------- ⑤ manual 为空绝不产出命令 ---------- */
test('T8-5 manual 为空/失败信封 ⇒ 不给命令；非空 ⇒ 原样刷新（不缓存旧命令）', () => {
  const empty = phone.decodePhone(envelope({ snapshot: { blockedReason: 'unknown-profile' } }));
  assert.equal(reasons.commandOf(empty), null, 'manual 为空不得自行拼命令');
  assert.equal(reasons.commandOf(phone.decodePhone(envelope({ manual: '   ' }))), null, '纯空白也算空');
  assert.equal(reasons.commandOf(phone.decodePhone({ ok: false, error: 'invalid-installation' })), null, '失败信封里没有 manual ⇒ 不给命令');
  const withCmd = phone.decodePhone(envelope({ manual: 'dsh plugin --profile web add --save-exact dsh-im-companion@0.1.9' }));
  assert.match(String(reasons.commandOf(withCmd)), /^dsh plugin /);
  const next = phone.decodePhone(envelope({ manual: 'dsh plugin --profile desktop add --save-exact dsh-im-companion@0.2.0' }));
  assert.notEqual(reasons.commandOf(next), reasons.commandOf(withCmd), '每次拿到 manual 都刷新，不缓存旧命令');
  proof('manual-gate', '空 ⇒ null（含失败信封）/ 非空 ⇒ 本次值');
});

/* ---------- ⑤-b 相对时间文案（T10 真机：刷新后常显示「下次检查：0 分钟后」） ---------- */
test('T10-1 nextCheckText：剩余不足 30 秒说「马上」，不再四舍五入成「0 分钟后」', () => {
  const now = 1000000;
  assert.equal(text.nextCheckText(now + 3000, now), '马上', '剩余 3 秒 ⇒ 马上（旧实现输出「0 分钟后」）');
  assert.equal(text.nextCheckText(now + 29000, now), '马上', '剩余 29 秒 ⇒ 马上');
  assert.equal(text.nextCheckText(now + 60000, now), '1 分钟后');
  assert.equal(text.nextCheckText(now + 3600000, now), '1 小时后');
  assert.equal(text.nextCheckText(null, now), '暂不可知');
  assert.equal(text.lastCheckText(null, now), '尚未检查', '文案层照旧；显示与否由视图按会话态决定');
  assert.equal(text.lastCheckText(now - 5000, now), '刚刚');
  proof('next-check-text', '不足 30 秒 ⇒ 马上（回归 T10 真机「0 分钟后」）');
});

/* ---------- ⑥ 版本说明解析（行首 ^## 锚；破折号两种；三态文案） ---------- */
test('T8-6 切节锚行首、容忍 U+2014/ASCII-、\r 容忍；三态文案唯一出口', () => {
  const md = ['# 变更日志', '', '## 0.1.9 — 2026-09-08', '', '- 新增更新中心', '- 修复：拥挤', '', '## 0.1.8 - 2026-09-01', '- 旧条目', ''].join('\r\n');
  assert.deepEqual(log.parseSection(md, '0.1.9'), ['新增更新中心', '修复：拥挤']);
  assert.deepEqual(log.parseSection(md, 'v0.1.8'), ['旧条目'], '前导 v 容忍');
  assert.equal(log.parseSection(md, '0.0.1'), null, '无此节');
  assert.deepEqual(log.parseSection(['## 0.1.9', '### 子标题', '', '---'].join('\n'), '0.1.9'), ['子标题'], '切段里的分隔线/空行不算条目');
  assert.equal(log.headingVersion('## 0.1.9 — x'), '0.1.9', 'U+2014 破折号');
  assert.equal(log.parseSection('  ## 0.1.9\n- x', '0.1.9'), null, '锚必须在行首（缩进的不算）');
  assert.equal(log.notesMessage('0.1.9', 'empty'), 'v0.1.9 暂无版本说明');
  assert.equal(log.notesMessage('0.1.9', 'unavailable'), '已发布 v0.1.9，暂时取不到更新说明');
  assert.equal(log.notesMessage('0.1.9', 'ok'), '');
  proof('changelog-parse', '两种破折号 + CRLF + 三态文案');
});

/* ---------- ⑦ 七态判定表逐条（直调真实现 deriveState；表值取自 R10 实测出的权威判定表） ---------- */
const S = (over: Record<string, unknown> = {}): any => phone.decodePhone(envelope(over));

test('T8-7 七态判定表逐条：installing / restart / blocked / update / failed / unavailable / latest', () => {
  // ① installing：job.state ∈ {installing, verifying}，优先级最高（哪怕同时带回 pending-restart 也先进安装态）
  assert.equal(data.deriveState(S({ snapshot: { job: JOB('installing') } }), false), 'installing', 'installing → installing');
  assert.equal(data.deriveState(S({ snapshot: { job: JOB('verifying') } }), false), 'installing', 'verifying → installing');
  assert.equal(data.deriveState(S({ snapshot: { job: JOB('installing'), blockedReason: 'source-install' } }), false),
    'installing', '安装中优先于装不了（别在装的时候喊「装不了」）');
  assert.equal(data.deriveState(S({ snapshot: { job: JOB('installed') } }), false), 'latest', 'installed 不是 busy（装完了）');
  assert.equal(data.deriveState(S({ snapshot: { job: JOB('failed') } }), false), 'latest', 'job 失败态不是 busy（否则 1s 表永远停不下）');
  // ② restart：token === 'pending-restart'
  assert.equal(data.deriveState(S({ snapshot: { blockedReason: 'pending-restart' } }), false), 'restart', 'pending-restart → restart');
  // ③ blocked：其它**非空** token，含失败信封从错误通道带回的同名 token
  assert.equal(data.deriveState(S({ snapshot: { blockedReason: 'source-install' } }), false), 'blocked', 'snapshot 通道 token → blocked');
  assert.equal(data.deriveState(phone.decodePhone({ ok: false, errorKind: 'source-install' }), false),
    'blocked', '失败信封的同名 token 仍算「已知原因」，不得降级成 unavailable');
  assert.equal(data.deriveState(phone.decodePhone({ ok: false, error: 'nobody-knows' }), false), 'blocked', '未知 token 也照原样露出原因（不谎报「未知错误」）');
  // ④ update：成功信封 + canInstall + latest !== running
  assert.equal(data.deriveState(S({ snapshot: { latestVersion: '0.1.9', canInstall: true } }), false), 'update', '有新版且可装 → update');
  assert.equal(data.deriveState(S({ snapshot: { latestVersion: '0.1.9', canInstall: false } }), false), 'latest', '不能装 ⇒ 不喊安装');
  assert.equal(data.deriveState(S({ snapshot: { latestVersion: '0.1.8', canInstall: true } }), false), 'latest', 'latest === running ⇒ 已是最新');
  assert.equal(data.deriveState(S({ snapshot: { latestVersion: '0.1.9', canInstall: true } }), true), 'update', '有新版优先于「上次检查失败」');
  // ⑤ failed：成功信封 + autoCheck.failing === true
  assert.equal(data.deriveState(S({ autoCheck: { failing: true, lastFailureAt: 1, nextCheckAt: null } }), true), 'failed', 'failing → failed');
  // ⑥ latest：仅「成功信封 + 无上述」
  assert.equal(data.deriveState(S(), false), 'latest', '成功信封无新版无阻塞 → latest');
  assert.equal(data.deriveState(S({ autoCheck: { failing: false, lastFailureAt: 1, nextCheckAt: null } }), false),
    'latest', 'failing:false（有失败史但已恢复）不算失败');
  proof('state-table', '七态逐条命中（busy > restart > blocked > update > failed > unavailable > latest）');
});

/* ---------- ⑧ 「断桥绝不说谎」：查不到 ≠ 已是最新（R10 抓到的 P0，没断言就会静默回归） ---------- */
async function viaBrokenRpc(fail: (ch: string, ep: string, p: unknown, s: unknown) => Promise<never>): Promise<any> {
  const store = data.createUpdateStore({ rpc: fail, meta: null }, { timer: fakeTimer().port, now: () => 1 });
  const res = await store.readStatus();
  store.dispose();
  return res;
}
test('T8-8 五种桥失败必须落 unavailable（不是 latest）且带上 message', async () => {
  const boom = await viaBrokenRpc(async () => { throw new Error('boom') });
  assert.equal(boom.message, 'boom', 'rpc 抛错 ⇒ 原话透出（视图 unknownText 优先显示它）');
  const timedOut = await viaBrokenRpc(async () => {
    const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e;
  });
  assert.match(String(timedOut.message), /timeout/i, '超时 ⇒ 带上 TimeoutError 的原话');
  const noBridge = data.createUpdateStore({ rpc: null, meta: null }, { timer: fakeTimer().port, now: () => 1 });
  const noBridgeRes = await noBridge.readStatus();
  assert.equal(noBridgeRes.message, '宿主桥不可用', 'rpc 为 null ⇒ 说清是桥不可用');
  const noReply = phone.decodePhone(null); // 无回包（宿主进程没回任何东西）
  assert.equal(noReply.message, '宿主无回包', '无回包不得静默当成成功');
  const noValue = phone.decodePhone({ ok: true }); // 成功信封缺 value
  assert.equal(noValue.message, '成功信封缺 value', '半截信封也是失败');
  const noToken = phone.decodePhone({ ok: false, error: { code: 42 } }); // 失败信封但 token 取不到
  assert.equal(phone.blockedTokenOf(noToken), null, 'token 取不到 ⇒ 不得猜原因');
  assert.equal(noToken.message, null, '没有原话 ⇒ 视图兜底「检查没能完成，请稍后重试」（view.ts unknownText）');
  const failCases: [string, any, string][] = [
    ['rpc 抛错', boom, 'boom'], ['超时', timedOut, 'timeout'],
    ['rpc 为 null', noBridgeRes, '宿主桥不可用'], ['无回包', noReply, '宿主无回包'], ['成功信封缺 value', noValue, '成功信封缺 value'],
  ];
  for (const [name, res, msg] of failCases) {
    assert.equal(data.deriveState(res, phone.failingOf(res)), 'unavailable', name + ' ⇒ unavailable');
    assert.notEqual(data.deriveState(res, phone.failingOf(res)), 'latest', name + ' 绝不允许说「已是最新」（R10 P0）');
    assert.equal(typeof res.message === 'string' && res.message !== '', true, name + ' 必须带 message');
    assert.match(String(res.message), new RegExp(String(msg).slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), name + ' 的 message 应是原话');
  }
  for (const [name, res] of [['res === null', null], ['失败信封无 token', noToken]] as [string, any][]) {
    assert.equal(data.deriveState(res, false), 'unavailable', name + ' ⇒ unavailable');
  }
  // 反向对照：只有成功信封才可能是 latest —— 防上面整组因「恒等 unavailable」而假绿
  assert.equal(data.deriveState(S(), false), 'latest', '正向对照：成功且无新版才是 latest');
  /* 窄缝 A/B（V3 实证）：两类「没有证据、却长得像有结论」的载荷。同一条不变量：**没有证据，就不许声称**。 */
  // A：伪成功空载荷——成功信封但**取不到 snapshot**（`value:{}` / `value:[]` / 只有 ok）。
  // 旧行为会落 `latest`（发布一句「已是最新」），等于把「回包被截断」谎报成「你不需要更新」。
  for (const [name, raw] of [
    ['value 空对象', { ok: true, value: {} }],
    ['value 空数组', { ok: true, value: [] }],
    ['value 只有 ok', { ok: true, value: { ok: true } }],
    ['value.snapshot 为 null', { ok: true, value: { ok: true, snapshot: null } }],
  ] as [string, unknown][]) {
    const res = phone.decodePhone(raw);
    assert.equal(res.ok, false, name + '：没有 snapshot ⇒ 不是成功载荷（没有 snapshot 就绝不可能是「已是最新」）');
    assert.equal(res.message, '回包缺少更新状态', name + ' 必须带可读原因，不能静默');
    assert.equal(data.deriveState(res, phone.failingOf(res)), 'unavailable', name + ' ⇒ 落 unavailable');
    assert.notEqual(data.deriveState(res, phone.failingOf(res)), 'latest', name + ' 绝不许说「已是最新」');
  }
  // B：空白原因代号（'' / 纯空白，失败通道与快照通道都算）。
  // 旧行为会当「已知原因」收下 ⇒ 面板落「装不了」而原因那行是空白：一块没有解释的失败。
  for (const [name, raw] of [
    ['error 空串', { ok: false, error: '' }],
    ['error 纯空白', { ok: false, error: '   ' }],
    ['errorKind 纯空白', { ok: false, errorKind: '\t' }],
    ['details.update.error 纯空白', { ok: false, error: { message: 'x', details: { update: { error: ' ' } } } }],
  ] as [string, unknown][]) {
    const res = phone.decodePhone(raw);
    const st = data.deriveState(res, phone.failingOf(res));
    assert.equal(phone.blockedTokenOf(res), null, name + ' ⇒ 没有原因代号，绝不许当已知原因（否则面板落「装不了」+ 空白原因）');
    assert.notEqual(st, 'blocked', name + ' 不得落 blocked');
    assert.equal(st, 'unavailable', name + ' ⇒ 落 unavailable（视图给「暂时查不到更新状态」+ 兜底文案）');
    assert.notEqual(st, 'latest', name + ' 也绝不许说「已是最新」');
  }
  // 反向下限：非空 token 的行为一字不改（本次只拦空白），快照通道的空白也不得压掉「有新版可装」
  assert.equal(data.deriveState(phone.decodePhone({ ok: false, error: 'source-install' }), false), 'blocked',
    '非空 token 仍是已知原因 ⇒ blocked（不得被上面那组连坐）');
  const blankSnap = S({ snapshot: { blockedReason: '   ', latestVersion: '0.1.9', canInstall: true } });
  assert.equal(phone.blockedTokenOf(blankSnap), null, '快照通道的纯空白 blockedReason 同样不算原因代号');
  assert.equal(data.deriveState(blankSnap, false), 'update', '空白原因不得把「有新版可装」压成「装不了」');
  // 窄缝 A 的第二道闸（状态机自身，直调 deriveState，不经 decodePhone 兜底）：成功信封但**取不到 snapshot**
  // （`{ok:true}` / `snapshot:null`）也必须 unavailable —— 防「状态机自己把没有证据的载荷说成已是最新（或 latest 之外的谎）」，
  // 同时防它在 blockedTokenOf 处读 undefined/null 抛异常（抛出去面板就是白屏，比说错话更糟）。
  for (const [name, res] of [
    ['成功信封缺 snapshot 字段', { ok: true }],
    ['成功信封 snapshot 为 null', { ok: true, snapshot: null }],
  ] as [string, any][]) {
    assert.equal(data.deriveState(res, false), 'unavailable', name + ' ⇒ 状态机自身也落 unavailable（不得 latest、不得抛）');
  }
  assert.equal(data.deriveState({ ok: false, token: '   ' } as any, false), 'unavailable',
    '窄缝 B 的第二道闸：空白 token 直调状态机也不得落 blocked（否则面板「装不了」+ 原因行空白）');
  assert.equal(data.deriveState({ ok: true, snapshot: { ...SNACK }, autoCheck: null } as any, false), 'latest',
    '反向对照：有完整 snapshot 且确实没有新版 ⇒ 仍 latest（防上面那组因「一律 unavailable」空转）');
  // 正向对照：成功信封 + 完整 snapshot 且确实最新（latest === running）⇒ 仍 latest，防上面整组因「一律 unavailable」空转
  assert.equal(data.deriveState(S({ snapshot: { latestVersion: '0.1.8', canInstall: true } }), false), 'latest',
    '正向对照：完整 snapshot 且确实最新 ⇒ 仍是 latest');
  proof('bridge-honesty', '5 种桥失败 + 空 res/无 token 信封 + 伪成功空载荷/空白原因 ⇒ unavailable 带 message（P0 回归网）');
});

/* ---------- ⑨ 档位 / 偏好读写 ---------- */
test('T8-9 自动检查档位恰为 6/12/24/168 且默认 24', () => {
  assert.deepEqual(text.INTERVALS.map((i: any) => i.hours), [6, 12, 24, 168], '档位取值与顺序即宿主契约（多一个少一个宿主会拒）');
  assert.equal(data.DEFAULT_PREFS.intervalHours, 24, '默认档 = 24 小时');
  assert.equal(text.INTERVALS.filter((i: any) => i.hours === data.DEFAULT_PREFS.intervalHours).length, 1,
    '默认值必须落在档位表里（否则设置面板显示不出当前档）');
  assert.equal(text.intervalLabel(24), '24 小时（默认）', '默认档带「（默认）」后缀');
  assert.equal(text.intervalLabel(999), '24 小时（默认）', '未知档位回落默认文案，不显示 999 小时');
  proof('intervals', '6/12/24/168 + 默认 24 + 未知档回落');
});

test('T8-10 偏好读写：写 meta.update.set{autoCheckEnabled,intervalHours}，读 meta 的 update 段', async () => {
  const calls: { ch: string; endpoint: string; payload: any }[] = [];
  const rpc = async (ch: string, endpoint: string, payload: any): Promise<unknown> => {
    calls.push({ ch, endpoint, payload });
    return { ok: true, value: okValue({}) };
  };
  const doc: any = { update: { autoCheckEnabled: false, intervalHours: 12 } };
  const store = data.createUpdateStore({ rpc, meta: { loadMeta: async () => doc } }, { timer: fakeTimer().port, now: () => 1 });
  await store.loadPrefs();
  assert.deepEqual(store.prefs(), { autoCheckEnabled: false, intervalHours: 12 }, '读的是 meta 文档的 update 段');
  await store.setPrefs({ intervalHours: 6 });
  const w = calls.filter((c) => c.endpoint === 'meta.update.set')[0];
  assert.ok(w, '设置必须落盘到 meta.update.set');
  assert.deepEqual(Object.keys(w.payload).sort(), ['autoCheckEnabled', 'intervalHours'],
    '入参形状：两个字段名与宿主契约一致（不夹带第三个字段）');
  assert.deepEqual([w.payload.autoCheckEnabled, w.payload.intervalHours], [false, 6], '补丁语义：没改的字段沿用旧值');
  assert.equal(w.ch, '/im-companion', '写走自有桥通道（不直写 localStorage）');
  assert.equal(calls.filter((c) => c.endpoint === consts.UPD_STATUS).length >= 1, true, '写完重读 status（拿新的 nextCheckAt）');
  // 坏值不接受：非 number 的 intervalHours 不得进内存态
  doc.update = { autoCheckEnabled: true, intervalHours: 'soon' };
  await store.loadPrefs();
  assert.equal(store.prefs().intervalHours, 24, '非 number 的 intervalHours 不得接受 ⇒ 回默认 24');
  assert.equal(store.prefs().autoCheckEnabled, true, '同一份文档里合法的字段照常生效');
  // 文档缺 update 段 / 存储未就绪 / loadMeta 抛错：一律保持默认，不抛、不打乱
  doc.update = undefined;
  await store.loadPrefs();
  assert.equal(store.prefs().intervalHours, 24, '缺 update 段 ⇒ 保持当前值（不重置）');
  const bare = data.createUpdateStore({ rpc: null, meta: null }, { timer: fakeTimer().port, now: () => 1 });
  await bare.loadPrefs();
  assert.deepEqual(bare.prefs(), { autoCheckEnabled: true, intervalHours: 24 }, 'meta 未就绪 ⇒ 保持默认且不抛');
  const boomMeta = data.createUpdateStore(
    { rpc: null, meta: { loadMeta: async () => { throw new Error('storage down') } } },
    { timer: fakeTimer().port, now: () => 1 });
  await boomMeta.loadPrefs();
  assert.deepEqual(boomMeta.prefs(), { autoCheckEnabled: true, intervalHours: 24 }, 'loadMeta 抛错 ⇒ 保持默认（读失败不得让面板假死）');
  proof('prefs', 'set/load 形状与容错（坏值回默认）');
});

/* ---------- ⑭ 档位归一化：面板说的事 == 宿主真实生效的事 ---------- */
test('T8-14 档位归一化：非档位值一律折回 24、合法档位原样通过（宿主读盘 + 客户端 loadPrefs 同口径）', async () => {
  const DIR = join(STAGE, '__meta__'); // 临时 meta.json 放 STAGE 下，after() 统一清理
  mkdirSync(DIR, { recursive: true });
  const disk = (intervalHours: unknown): string => {
    const file = join(DIR, 'meta-' + String(intervalHours) + '.json');
    writeFileSync(file, JSON.stringify({ version: 1, names: { a: 'A' }, update: { autoCheckEnabled: false, intervalHours } }), 'utf8');
    return file;
  };
  const load = async (intervalHours: unknown): Promise<any> => {
    const s = new hostMeta.AgentMetaStore(disk(intervalHours));
    await s.load();
    return s;
  };
  // ① 宿主读盘：档位表外的值一律折回 24。999 是「数值合法但不在档位表」的典型——原样收下宿主就会按 999 排定时器，
  //    而面板的档位文案回落成「24 小时（默认）」⇒ 面板说一件不真实的事（本条即那个缺陷的回归网）。
  for (const bad of [999, '6', -1, 7, null, 0.5] as unknown[]) {
    const s = await load(bad);
    assert.equal(s.snapshot().update.intervalHours, 24, '宿主读盘归一化：' + JSON.stringify(bad) + ' ⇒ 24');
    assert.equal(s.updatePrefs().intervalHours, 24, '排程用的也是 24：' + JSON.stringify(bad));
    assert.equal(s.snapshot().update.intervalHours, s.updatePrefs().intervalHours, 'meta.get 的值 == 排程值（同一份数据＝唯一真相源）');
    assert.equal(s.snapshot().update.autoCheckEnabled, false, '同段内合法字段不被牵连：' + JSON.stringify(bad));
    assert.equal(s.snapshot().names.a, 'A', '归一化只碰 update 段，其它段原样（不误伤）：' + JSON.stringify(bad));
  }
  // NaN / Infinity 落盘时 JSON 会写成 null（盘上那条已被上面覆盖），函数本体单独再打一次
  assert.equal(hostMeta.normalizeUpdatePrefs({ intervalHours: Number.NaN }).intervalHours, 24, 'NaN ⇒ 24（是 number 但不在档位表内）');
  assert.equal(hostMeta.normalizeUpdatePrefs({ intervalHours: Number.POSITIVE_INFINITY }).intervalHours, 24, 'Infinity ⇒ 24（越界）');
  // ② 宿主读盘：合法档位必须原样通过 —— 归一化不得夹带改写（防「一律折 24」的过度修复）
  for (const good of [6, 12, 24, 168]) {
    const s = await load(good);
    assert.deepEqual(s.snapshot().update, { autoCheckEnabled: false, intervalHours: good }, '合法档位 ' + good + ' 原样通过');
  }
  // ③ 客户端 loadPrefs：读到越界值时内存态与 intervalLabel 显示一致（都落 24）
  for (const bad of [999, '6', -1, 7, Number.NaN, Number.POSITIVE_INFINITY]) {
    const panel = data.createUpdateStore(
      { rpc: null, meta: { loadMeta: async () => ({ update: { autoCheckEnabled: true, intervalHours: bad } }) } },
      { timer: fakeTimer().port, now: () => 1 });
    await panel.loadPrefs();
    assert.equal(panel.prefs().intervalHours, 24, '客户端读到越界值 ' + String(bad) + ' ⇒ 内存态 24（不得原样收下）');
    assert.equal(text.intervalLabel(panel.prefs().intervalHours), '24 小时（默认）', '显示与内存态一致 ⇒ 24：' + String(bad));
    assert.equal(text.INTERVALS.some((i: any) => i.hours === panel.prefs().intervalHours), true,
      '档位必须能在下拉框里选中：' + String(bad) + '（选不中时浏览器退回显示第一项「6 小时」，而宿主按别的值排程）');
  }
  // ④ 端到端对照（两端都是真实现）：盘上 999 → 真宿主归一化 → 真面板读 meta.get 的快照
  const host = await load(999);
  const panel = data.createUpdateStore({ rpc: null, meta: { loadMeta: async () => host.snapshot() } }, { timer: fakeTimer().port, now: () => 1 });
  await panel.loadPrefs();
  assert.equal(panel.prefs().intervalHours, host.updatePrefs().intervalHours, '端到端：面板显示的档位 == 宿主排程用的档位');
  assert.equal(text.intervalLabel(panel.prefs().intervalHours), '24 小时（默认）', '端到端：面板说 24 小时，宿主也就真是 24（不许说一件不真实的事）');
  proof('interval-normalize', '宿主读盘 + 客户端 loadPrefs 同口径：非档位 ⇒ 24，合法档位 6/12/24/168 原样');
});

/* ---------- ⑩ 版本说明：源优先级 + 不编造网络原因 ---------- */
test('T8-11 源优先级 raw → jsDelivr（禁 github.com/.../raw/）+ 按序试源 + 不写「你没有网络」', async () => {
  const urls = consts.UPD_CHANGELOG_URLS as string[];
  assert.equal(urls.length, 2, '只留两个源（多一个就多一条会挂死的路）');
  assert.match(urls[0], /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/master\/CHANGELOG\.md$/, '首选 raw.githubusercontent 的 master/CHANGELOG.md');
  assert.match(urls[1], /^https:\/\/cdn\.jsdelivr\.net\/gh\/[^/]+\/[^/]+\@master\/CHANGELOG\.md$/, '备选 jsDelivr 镜像 @master');
  for (const u of urls) {
    assert.equal(/github\.com\/[^/]+\/[^/]+\/raw\//.test(u), false, '禁用 github.com/.../raw/（跨域必失败，白等一次超时）：' + u);
    assert.equal(/^https:/.test(u), true, '必须 https：' + u);
  }
  const md = '## 0.1.9 — 2026-09-08\n- 更新中心可用\n';
  const notFound: string[] = [];
  const miss = await log.fetchNotes('0.1.9', { fetchImpl: async (url: string) => { notFound.push(url); return { ok: false, text: async () => '' } } });
  assert.deepEqual(notFound, urls, '404 ⇒ 依次试到最后一个源（调用顺序即优先级）');
  assert.equal(miss.state, 'unavailable', '全失败 ⇒ unavailable（不假称「暂无说明」）');
  const hit: string[] = [];
  const okRes = await log.fetchNotes('0.1.9', { fetchImpl: async (url: string) => { hit.push(url); return { ok: true, text: async () => md } } });
  assert.deepEqual(hit, [urls[0]], '首选源拿到就不再打扰备选');
  assert.equal(okRes.state, 'ok', '解析成功 ⇒ ok');
  assert.deepEqual(okRes.items, ['更新中心可用'], '条目来自 CHANGELOG 该节');
  const offline: string[] = [];
  const net = await log.fetchNotes('0.1.9', { fetchImpl: async (url: string) => { offline.push(url); throw new Error('fetch failed') } });
  assert.deepEqual(offline, urls, '网络异常（离线/跨域同形）⇒ 也要把两个源都试完');
  assert.equal(net.state, 'unavailable');
  assert.equal((await log.fetchNotes('0.1.9', { fetchImpl: async () => ({ ok: true, text: async () => '## 0.1.8\n- 旧\n' }) })).state, 'empty', '200 但无该节 ⇒ empty');
  let asked = false;
  assert.equal((await log.fetchNotes(null, { fetchImpl: async () => { asked = true; throw new Error('x') } })).state, 'unavailable', '没有版本号 ⇒ 直接 unavailable');
  assert.equal(asked, false, '没有版本号就不该联网（别白等 8s 超时）');
  assert.equal(log.notesMessage('0.1.9', 'unavailable'), '已发布 v0.1.9，暂时取不到更新说明', '三态文案唯一出口');
  for (const state of ['ok', 'empty', 'unavailable']) {
    assert.equal(/没有网络|请检查网络/.test(log.notesMessage('0.1.9', state)), false,
      '禁写「你没有网络」：离线与跨域在 JS 层同形、不可细分，写了就是编造');
  }
  proof('changelog-source', 'raw → jsDelivr 顺序 + 禁用 github raw + 三态不编造');
});

/* ---------- ⑪ 来源黑名单（R9 票面）：客户端绝不引入更新包 ---------- */
test('T8-12 源码黑名单：src/client/** 与 src/features/update-center/** 无更新包引入；产物 sourcemap 无该包模块', () => {
  // 拦的是**引入语句**而非「整份文本不含包名」：constants.ts 的出处注释（dsh-plugin-update@0.1.1 派生说明）
  // 合法地写着这个包名，粗扫会把注释误判成引入，逼人删掉有用的出处信息。要防的是真的把它 import/require 进来。
  // 四种引入形态都要拦：`from 'pkg'` / `require('pkg')` / 动态 `import('pkg')` / **裸副作用 `import 'pkg'`**。
  // 最后一种最隐蔽（V4 变异实证：只加它，旧正则整组仍 16/16 全绿）：TypeScript 只当副作用语句，
  // typecheck/build 一律不报错，而浏览器产物会把更新包整个内联进单文件——正是这条检查存在的理由。
  const IMPORT_RE = /(?:(?:from|require\s*\(|import\s*\()\s*['"]|import\s*['"])dsh-plugin-update(?:['"]|\/)/;
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((d: any) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
  const files = walk(join(REPO, 'src', 'client')).concat(walk(join(REPO, 'src', 'features', 'update-center')));
  assert.ok(files.length >= 8, '扫到的文件太少 ⇒ 断言等于空转：' + files.length);
  for (const f of files) {
    assert.equal(IMPORT_RE.test(readFileSync(f, 'utf8')), false,
      '客户端不得引入更新包（一旦引入会被整个内联进单文件浏览器产物：体积暴涨甚至页面直接坏掉，而 typecheck/build 都不报错）：' + f);
  }
  // 检测器自证（V4 变异实证驱动的补丁）：在仓库之外（$env:TEMP）造样本，走同一条 walk + 同一个正则，
  // 逐形态验命中——**这条必须能失败**：把裸引入那条替换掉就会红（旧正则正是死在这里）。
  // 绝不往 src/ 里写临时文件（测试中途崩会让样本留在源码树里）；finally 保证清理。
  const sampleDir = mkdtempSync(join(tmpdir(), 't8-uc-blacklist-'));
  try {
    const samples: [string, string, boolean][] = [
      ['bare.ts', "import 'dsh-plugin-update'\n", true], // 裸副作用引入：旧正则漏掉的就是这条
      ['bare-sub.ts', "import 'dsh-plugin-update/lib/derive.js'\n", true], // 裸引入的子路径形态
      ['bare-dq.ts', 'import "dsh-plugin-update"\n', true],
      ['named.ts', "import { x } from 'dsh-plugin-update'\n", true],
      ['dyn.ts', "const m = await import('dsh-plugin-update')\n", true],
      ['req.ts', "const m = require('dsh-plugin-update')\n", true],
      ['mention.ts', " * 出处：dsh-plugin-update@0.1.1 的派生结果；\n", false], // 只提到包名的注释：必须不命中
    ];
    for (const [name, body, want] of samples) writeFileSync(join(sampleDir, name), body);
    const found = new Map(walk(sampleDir).map((f) => [f.split(/[\\/]/).pop() as string, IMPORT_RE.test(readFileSync(f, 'utf8'))]));
    assert.equal(found.size, samples.length, '样本没抓全 ⇒ 这条自证等于空转：' + found.size);
    for (const [name, , want] of samples) {
      assert.equal(found.get(name), want, (want ? '引入语句必须命中（漏了就是假白名单）' : '只提到包名的注释必须不命中（否则逼人删注释）') + '：' + name);
    }
    assert.equal(IMPORT_RE.test(readFileSync(join(REPO, 'src', 'features', 'update-center', 'constants.ts'), 'utf8')), false,
      '真出处注释（constants.ts 头部）不得被误判成引入');
  } finally {
    rmSync(sampleDir, { recursive: true, force: true });
  }
  // 正向对照：同一个抓取器在宿主侧必须命中 —— 否则上面的 false 可能只是正则写错（负向断言必须配正向对照）
  assert.equal(IMPORT_RE.test(readFileSync(join(REPO, 'src', 'host', 'update.ts'), 'utf8')), true,
    '检测器自证：宿主侧确实按这套写法引入更新包，客户端侧是白名单而非漏测');
  // 浏览器产物：sourcemap 的 sources = 真正被打进单文件的模块清单（注释不在其中，故不受上面的注释问题干扰）
  const mapPath = join(REPO, 'lib', 'client.js.map');
  const bundlePath = join(REPO, 'lib', 'client.js');
  // 两种产物取一即可验；**两者都不存在 ⇒ 直接判失败，不许静默跳过**（V4 抓到的假绿路径）。
  // 理由：一条「环境不满足就悄悄跳过」的检查与没有检查等价——它偏偏会在最需要它的场景（压根没 build）
  // 里给出绿。这正是本仓一路在防的「假绿」。
  assert.equal(existsSync(mapPath) || existsSync(bundlePath), true,
    '产物缺失，无法验证客户端未引入更新包；请在跑过 build 后重跑本验证：' + mapPath + ' / ' + bundlePath);
  if (existsSync(mapPath)) {
    const sources = ((JSON.parse(readFileSync(mapPath, 'utf8')) as { sources?: string[] }).sources ?? []) as string[];
    assert.ok(sources.length > 20, 'sourcemap sources 太少 ⇒ 断言空转：' + sources.length);
    assert.equal(sources.some((s) => s.includes('dsh-plugin-update')), false, '产物模块清单里不得出现更新包：' + mapPath);
    assert.equal(sources.filter((s) => s.includes('update-center')).length >= 5, true, '产物确实含本 feature（证明上面那条不是空跑）');
  } else {
    assert.equal(IMPORT_RE.test(readFileSync(bundlePath, 'utf8')), false, '产物内不得出现该包的引入语句：' + bundlePath);
  }
  proof('no-update-dep', '源码 0 处引入 + 四种引入形态自证 + 产物缺失即红（+ 宿主侧正向对照命中）');
});

test('T8-13 样式仍走契约统一入口 + 类前缀 update-center-*（不占 .af-* 私有约定）', () => {
  const manifest = readFileSync(join(REPO, 'src', 'features', 'update-center', 'manifest.ts'), 'utf8');
  assert.match(manifest, /installFeatureStyles\('update-center'/, '样式只经契约 §6 的统一入口注入');
  // 先剥掉注释再扫：styles.ts 的文件头注释里合法地写着「不占用 .af-* 私有约定」，不剥会把注释误判成占了别人的前缀
  const css = readFileSync(join(REPO, 'src', 'features', 'update-center', 'styles.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = Array.from(css.matchAll(/\.([a-z][a-z0-9-]+)/g)).map((m) => String(m[1]));
  assert.ok(classes.length >= 3, '没抓到类名 ⇒ 断言空转：' + classes.length);
  for (const c of classes) {
    assert.equal(c.startsWith('update-center-'), true, '类名必须带 update-center- 前缀（.af-* 是 A1 私有约定）：.' + c);
  }
  proof('style-namespace', '统一样式入口 + 前缀命名空间');
});
