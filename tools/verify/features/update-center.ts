// T5 #110 M6 → #118 接线断言（单按钮+dialog默认主题）；T6 回归修补追加「解信封」运行时断言。
// 只断言接线层，不测包内核。旧 699 行随旧面板删除而退役；包自带 888 例，本仓只验四件事：
// ① manifest 注册形状（order 24 / settings.section / 事件制容器）；② view 是包入口件的薄挂载（button+always+mount+default）；
// ③ 旧 11 文件已删、产物含薄层不含旧自画标记；④ **回包信封必须拆**（不然面板永远「正在读取更新状态…」）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const read = (rel: string): string => readFileSync(join(REPO, rel), 'utf8');
/** 去注释后代码（注释里提旧名不算引用，避免自证误报）。 */
const codeOf = (rel: string): string => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*\/\/.*/gm, '');
const proof = (id: string, detail: string): void => { console.log('T5-PROOF ' + id + ' PASS ' + detail); };

/* ---------- ① manifest 注册形状 ---------- */
test('T5-1 manifest 薄层注册：order 24 / settings.section / 事件制，无自产样式', () => {
  const manifest = read('src/features/update-center/manifest.ts');
  assert.match(manifest, /id:\s*'update-center'/, 'id 保持 update-center');
  assert.match(manifest, /order:\s*24/, 'order 保持 24');
  assert.match(manifest, /settings\.section/, '槽位保持 settings.section');
  assert.match(manifest, /mountUpdateCenter/, '仍经 view.mountUpdateCenter 挂载');
  const manifestCode = codeOf('src/features/update-center/manifest.ts');
  assert.equal(manifestCode.includes('installFeatureStyles'), false, '薄层无自产 CSS，不再经 installFeatureStyles');
  assert.equal(manifestCode.includes("from './styles'"), false, '不再引用已删 styles.ts');
  proof('manifest', 'order 24 / settings.section / 无自产样式');
});

/* ---------- ② view 薄挂载：包入口件 + 事件制 + 电话桥 ---------- */
test('T5-2 view 是 mountUpdateEntry 薄挂载（button+always+mount+default，事件制原样）', () => {
  const view = read('src/features/update-center/view.ts');
  assert.match(view, /from\s+'dsh-plugin-update\/entry'/, '必须 import 包入口件');
  assert.match(view, /mountUpdateEntry/, '必须调 mountUpdateEntry');
  assert.match(view, /variant:\s*'button'/, 'U1：variant button（单更新按钮）');
  assert.match(view, /openOn:\s*'always'/, '#118：openOn always（点开总有完整五章 dialog）');
  assert.match(view, /theme:\s*'default'/, '#118：theme default（最小可用深色，不用 archive）');
  assert.match(view, /autoCheck:\s*'mount'/, '挂载静默查一次（旧 P1-c 语义由包接管）');
  assert.match(view, /prefix:\s*PREFIX|prefix:\s*'imc'/, '前缀 imc（与宿主 UPDATE_PHONE_PREFIX 同值）');
  assert.match(view, /pluginId:\s*PLUGIN_ID|pluginId:\s*'dsh-im-companion'/, 'pluginId 为本插件');
  assert.match(view, /\/im-companion/, '电话走自有桥载体 /im-companion');
  assert.match(view, /UPDATE_CENTER_HOST_EVENT/, '事件制保留（A1 零改）');
  assert.match(view, /imc-update-center/, '容器 id 保留（P0-b 主动认领）');
  assert.match(view, /claimHost/, 'P0-b 主动认领保留');
  assert.match(codeOf('src/features/update-center/view.ts'), /\.unmount\(\)/, 'detach 必须 unmount 包控制器（卸载即净）');
  const viewCode = codeOf('src/features/update-center/view.ts');
  assert.equal(viewCode.includes('ctx.meta'), false, 'P0-a：mount 内不读 ctx.meta');
  assert.equal(viewCode.includes("from './data'"), false, '不再引用旧自画 data.ts');
  assert.equal(viewCode.includes("from './phone'"), false, '不再引用旧 phone.ts');
  assert.equal(viewCode.includes("from './dialog'"), false, '不再引用旧 dialog.ts');
  proof('thin-mount', 'button+always+mount+default / 事件制 / 电话桥');
});

/* ---------- ③ 旧 11 文件已删 ---------- */
test('T5-3 旧自画 11 文件已删（仅 manifest+view 存活）', () => {
  const dir = join(REPO, 'src', 'features', 'update-center');
  const names = new Set(readdirSync(dir));
  assert.deepEqual([...names].sort(), ['manifest.ts', 'view.ts'], 'update-center 目录只剩 manifest+view');
  for (const f of ['data.ts', 'phone.ts', 'reasons.ts', 'text.ts', 'settings.ts', 'changelog.ts', 'markdown.ts', 'dialog.ts', 'styles.ts', 'constants.ts', 'derived.ts']) {
    assert.equal(existsSync(join(dir, f)), false, '旧文件已删：' + f);
  }
  assert.equal(existsSync(join(REPO, 'scripts', 'gen-update-constants.mjs')), false, '派生生成器已退役');
  proof('deleted', '11 旧文件 + 生成器已删');
});

/* ---------- ④ 宿主四电话对齐（文本层，运行时由 update-host.ts 覆盖） ---------- */
test('T5-4 宿主四电话文本对齐（update.ts 端点表 + rpc.ts case 含 changelog）', () => {
  const update = read('src/host/update.ts');
  assert.match(update, /imc\.updateChangelog/, '宿主端点表含第四电话');
  const rpc = read('src/host/rpc.ts');
  assert.match(rpc, /imc\.updateChangelog/, 'rpc.ts case 含第四电话');
  proof('host-4phones', '宿主文本层含 changelog（运行时见 update-host.ts T7-1/T7-1b）');
});

/* ---------- ⑤ 产物含薄层、不含旧自画标记 ---------- */
test('T5-5 浏览器产物含薄层挂载点、不含旧自画弹窗标记', () => {
  const bundlePath = join(REPO, 'lib', 'client.js');
  assert.equal(existsSync(bundlePath), true, '产物缺失，请先跑 build：' + bundlePath);
  const bundle = readFileSync(bundlePath, 'utf8');
  assert.ok(bundle.includes('imc-update-center'), '产物含薄层容器 id（证明 view 被打进产物）');
  assert.ok(bundle.includes('dsh-im-companion:update-center-host'), '产物含事件名（证明事件制被打进产物）');
  assert.equal(bundle.includes('update-center-dialog-body'), false, '产物不含旧自画弹窗类（证明旧 dialog 已删干净）');
  assert.equal(bundle.includes('deriveState'), false, '产物不含旧七态状态机（证明旧 data 已删干净）');
  proof('bundle', '含薄层挂载点、不含旧自画标记');
});

/* ---------- ⑥ 解信封（T6 回归修补）：交给包的 call 回包必须是包认的扁平形状 ----------
 * 为什么补这条：宿主刻意把包载荷裹进本仓 RpcResult 信封（成功 `value`、失败 `error.details.update`），
 * 而包 README §5 只读顶层 `ok`/`snapshot`/`error`/`errorKind`。薄挂载重写时丢了这层解码，
 * 面板拿到 `{ok:true,value:{…}}` ⇒ 外层 ok 判成功、顶层无 snapshot ⇒ 快照与错误恒 null ⇒ 永远空转
 * （2026-10-10 真机实证：截图与「直返信封」逐字相同；本断言把该形状错钉死在门禁里，此前只有产物文本断言，抓不到）。
 * 转译只为取运行时 JS（类型门禁归 npm run typecheck）；外链包类型在 node10 解析下可能报 TS2307，tsc 默认仍落盘。 */
const FEAT = join(REPO, 'src', 'features', 'update-center');
const OUT = mkdtempSync(join(tmpdir(), 't5-update-center-'));
let tscLog = '';
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), join(FEAT, 'view.ts'),
    '--ignoreConfig', // TS7：命令行点名文件时必须显式忽略 tsconfig（本仓 tsconfig 不含 features）
    '--module', 'commonjs', '--target', 'es2022', '--moduleResolution', 'node10',
    '--outDir', OUT, '--rootDir', join(REPO, 'src'), '--skipLibCheck', '--noEmitOnError', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e: any) {
  tscLog = String(e?.stdout ?? '') + String(e?.stderr ?? e?.message ?? '');
}
/** 转译产物里的 view.js 要 require 包：建一条 junction 指回本仓 node_modules（照 update-host.ts 范式）。 */
mkdirSync(join(OUT, 'node_modules'), { recursive: true });
symlinkSync(join(REPO, 'node_modules', 'dsh-plugin-update'), join(OUT, 'node_modules', 'dsh-plugin-update'), 'junction');
const VIEW_JS = join(OUT, 'features', 'update-center', 'view.js');
after(() => rmSync(OUT, { recursive: true, force: true }));

test('T5-6 toPackageReply：信封拆 value + 失败还原包载荷（直返信封 = 面板永远读取中）', () => {
  assert.equal(existsSync(VIEW_JS), true, '视图产物未落盘（转译失败）：' + tscLog);
  const require_ = createRequire(import.meta.url);
  const { toPackageReply } = require_(VIEW_JS) as { toPackageReply: (raw: unknown) => any };

  // ① 成功信封 ⇒ 包载荷：顶层必须能读到 snapshot（旧行为在这里就断——信封自己没有 snapshot）
  const success = { ok: true, value: { ok: true, snapshot: { runningVersion: '1.0.0' }, manual: 'dsh plugin add …', receipt: null } };
  assert.equal((success as any).snapshot, undefined, '信封顶层没有 snapshot —— 直返信封就是面板空转的根因');
  assert.equal(toPackageReply(success), success.value, '成功信封必须原样拆出 value');
  assert.equal(toPackageReply(success).snapshot.runningVersion, '1.0.0', '拆出后包能读到 snapshot（面板才会离开 loading）');
  // ② 成功信封里包自己 ok:false（install 缺 checkId 等）：原样直通，不许二次加工
  const innerFail = { ok: false, error: 'check-expired', errorKind: 'check-expired' };
  assert.equal(toPackageReply({ ok: true, value: innerFail }), innerFail, 'value 行内的包失败载荷原样直通');
  // ③ 宿主失败通道：还原包原始载荷（error/errorKind/diag 全在）⇒ 包的原因码不降级成兜底 check-failed
  const pkgFail = { ok: false, error: 'source-install', errorKind: 'environment', diag: { code: 'source-install' } };
  const envFail = { ok: false, error: { code: 'source-install', message: 'source-install', details: { errorKind: 'environment', update: pkgFail } } };
  assert.equal(toPackageReply(envFail), pkgFail, '失败信封还原包载荷（含 diag）');
  // ④ 宿主自产失败（端点未接线等）：只给码，包仍能落失败分支而不是空转
  assert.deepEqual(toPackageReply({ ok: false, error: { code: 'bad-request', message: '更新端点未接线' } }), { ok: false, error: 'bad-request' }, '宿主自产失败给码');
  // ⑤ 成功信封缺 value：宁可报失败，也不许落成「永远读取中」
  assert.deepEqual(toPackageReply({ ok: true }), { ok: false, error: 'internal' }, '成功信封缺 value 落失败');
  // ⑥ 认形状不认来源：已是包自己的扁平回包（成功带 snapshot / 失败 error 是字符串）一律原样直通
  assert.equal(toPackageReply(innerFail), innerFail, '包自己的扁平失败载荷不许被洗成 internal');
  assert.equal(toPackageReply({ ok: true, snapshot: { runningVersion: '9.9.9' } }).snapshot.runningVersion, '9.9.9', '包自己的扁平成功载荷原样直通');
  assert.equal(toPackageReply(null), null);
  assert.equal(toPackageReply('x'), 'x');

  // ⑦ 接线断言：产物里必须出现 toPackageReply 且**包在 call 的 rpc 回包上** —— 只加函数不接调用点会被
  //    tree-shake 掉；而「函数在不在产物里」是空断言（rolldown 会留下未用的导出函数，实测过），
  //    故这里咬调用点形状。本断言正是为了钉住「函数写了但 call 没包上」这类空心修复（第一版就踩过）。
  const bundle = readFileSync(join(REPO, 'lib', 'client.js'), 'utf8');
  assert.match(bundle, /toPackageReply\(\s*await\s+rpc\(/, '产物里的 call 没有把 rpc 回包交给 toPackageReply ⇒ 空心修复');
  proof('reply-envelope', '拆 value + 失败还原包载荷 + 缺 value 落失败 + 非信封直通 + 产物咬调用点');
});

/* ---------- ⑦ 挂载点位置（#120）：页头右上组、star 左侧，其余契约零改 ----------
 * 位置是 owner 裁定（2026-10-10）：从「工具栏之后、撰写条之前」挪进 af-hd-right。
 * 容器节点只挪位置——id（P0-b 认领把手）/ 类名前缀 / 事件派发三项一律不变，故这里同时钉住「没被顺手改坏」。 */
test('T5-7 挂载点在页头右上组 star 左侧（id/类名/派发不变）', () => {
  const panel = read('src/client/components/panel.ts');
  const hdRightLine = panel.split('\n').find((l) => l.includes("className: 'af-hd-right'")) ?? '';
  assert.ok(hdRightLine.includes('updateCenterHost'), '右上组必须含更新挂载点');
  assert.ok(hdRightLine.indexOf('updateCenterHost') < hdRightLine.indexOf('starLink'), '挂载点必须在 starLink 左侧');
  assert.ok(panel.indexOf("const updateCenterHost = h('div'") < panel.indexOf('const hdRight ='), '容器必须先建好再进右上组');
  const rootLine = panel.split('\n').find((l) => l.includes("className: 'af-root'")) ?? '';
  assert.equal(rootLine.includes('updateCenterHost'), false, 'root 序列里不再出现（已挪进页头）');
  assert.match(panel, /id: 'imc-update-center'/, 'id 保留（P0-b：事件无重放，靠它主动认领）');
  assert.match(panel, /className: 'update-center-host'/, '类名走 <feature>-* 前缀契约');
  assert.match(panel, /emitUpdateCenterHost\(updateCenterHost\)/, '容器仍经事件广播（A1 对特性零感知）');
  proof('host-in-header', '页头右上组 star 左侧 / id+类名+派发不变');
});
