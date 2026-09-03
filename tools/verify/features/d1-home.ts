// D1 自验证（F0 每功能自验证）：在家看全换家纯逻辑 + 注册（node --test，零第三方依赖）。
// 只测外部行为：给定归属与动作序列，断言最终归属与用户可见结果，不断言内部形状。
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'd1-home');
const CLIENT = join(REPO, 'src', 'client');
const ENTRIES = [
  join(FEAT, 'model.ts'),
  join(FEAT, 'acts.ts'),
  join(FEAT, 'roster.ts'),
  join(FEAT, 'entry.ts'),
  join(FEAT, 'view.ts'),
  join(FEAT, 'styles.ts'),
  join(FEAT, 'manifest.ts'),
  join(REPO, 'src', 'features', 'protocol.ts'),
  join(CLIENT, 'data', 'fleet-api.ts'),
  join(CLIENT, 'data', 'config.ts'),
  join(CLIENT, 'data', 'connection-stream.ts'),
  join(CLIENT, 'data', 'meta.ts'),
  join(CLIENT, 'data', 'model.ts'),
  join(CLIENT, 'dom.ts'),
  join(CLIENT, 'theme.ts'),
  join(CLIENT, 'icons.ts'),
  join(CLIENT, 'ui', 'toast.ts'),
  join(CLIENT, 'ui', 'modal.ts'),
  join(CLIENT, 'ui', 'button.ts'),
  join(CLIENT, 'ui', 'dir-picker.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'd1-home-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const model: any = req('./features/d1-home/model.js');
const view: any = req('./features/d1-home/view.js');
const styles: any = req('./features/d1-home/styles.js');
const manifest: any = req('./features/d1-home/manifest.js').feature;

const W_A = 'D:\\agents\\xiaoshuai';
const W_B = 'D:\\agents\\ali';
const bots = [
  { channel: 'feishu', botId: 'f1', workspace: '', botName: '', connected: false, healthKind: 'offline' },
  { channel: 'qq', botId: 'q1', workspace: W_A, botName: '小帅', connected: true, healthKind: 'online' },
  { channel: 'feishu', botId: 'f2', workspace: W_B, botName: '阿梨', connected: true, healthKind: 'warn' },
];
const byId = (id: string) => bots.find((b) => b.botId === id);

test('名下有 A 换给 B → 二次确认换绑', () => {
  assert.deepEqual(model.resolveMove(byId('q1'), { kind: 'workspace', workspace: W_B }),
    { kind: 'move-confirm', botId: 'q1', from: W_A, to: W_B });
});

test('换回自己家 → 无操作', () => {
  assert.deepEqual(model.resolveMove(byId('q1'), { kind: 'workspace', workspace: W_A }),
    { kind: 'noop', botId: 'q1' });
});

test('未绑定不在花名册 → 指引去领人', () => {
  assert.deepEqual(model.resolveMove(byId('f1'), { kind: 'workspace', workspace: W_B }),
    { kind: 'reject-unbound', botId: 'f1' });
});

test('空态：名下无机器人（未绑定不算名下）', () => {
  assert.equal(model.isEmptyRoster([{ ...byId('f1') }]), true);
  assert.equal(model.isEmptyRoster(bots), false);
  assert.equal(model.isEmptyRoster([]), true);
});

test('撤销口径：换绑可撤销回到 from；撤销窗口 5 秒', () => {
  assert.equal(model.undoTarget(W_A), W_A);
  assert.equal(model.undoTarget(''), null);
  assert.equal(model.UNDO_WINDOW_MS, 5000);
});

test('撤销过期：窗口内可撤，落定后明确拒绝', () => {
  assert.equal(model.isUndoExpired(1000, 1000 + 4999), false);
  assert.equal(model.isUndoExpired(1000, 1000 + 5000), true);
  assert.equal(model.isUndoExpired(1000, 1000 + 9000), true);
});

test('写守卫：归属必须非空绝对路径', () => {
  assert.equal(model.isAbsWorkspace('/agents/x'), true);
  assert.equal(model.isAbsWorkspace('D:\\agents\\x'), true);
  assert.equal(model.isAbsWorkspace('C:/agents/x'), true);
  assert.equal(model.isAbsWorkspace(''), false);
  assert.equal(model.isAbsWorkspace('relative/path'), false);
  assert.equal(model.isAbsWorkspace('   '), false);
});

test('花名册分组：只收有家、按归属聚合保序', () => {
  const groups = model.groupHomes(bots);
  assert.deepEqual(groups.map((g: any) => g.workspace), [W_A, W_B]);
  assert.deepEqual(groups[0].bots.map((b: any) => b.botId), ['q1']);
  assert.equal(groups[0].name, 'xiaoshuai');
  assert.equal(model.groupHomes([]).length, 0);
});

test('家名：设置中文名优先，无则回退目录基名', () => {
  assert.equal(model.homeName(W_A, { xiaoshuai: '小帅2' }), '小帅2');
  assert.equal(model.homeName(W_A, {}), 'xiaoshuai');
  assert.equal(model.shortName(W_B), 'ali');
});

test('manifest 注册：双槽位（设置主件 + 左栏入口）+ 进 FEATURES', () => {
  assert.equal(manifest.id, 'd1-home');
  assert.deepEqual(manifest.slots.map((s: any) => s.target), ['settings.section', 'workspace-rail']);
  // 注册表为共享装配点，本脚本不 import 它（解耦）；只断言源码装配行存在
  const indexSrc = readFileSync(join(REPO, 'src', 'features', 'index.ts'), 'utf8');
  assert.ok(indexSrc.includes("./d1-home/manifest"), 'FEATURES 缺 d1-home 装配行');
});

test('样式命名空间 d1- 且不占用 .af- 私有约定', () => {
  assert.ok(String(styles.CSS).includes('.d1-'));
  assert.ok(!String(styles.CSS).includes('.af-'));
  assert.ok(String(styles.CSS).includes('z-index:1600'), '确认框在最顶');
  assert.ok(String(styles.CSS).includes('z-index:1400'), 'peek 浮层压过宿主 chrome');
});

test('视图暴露挂载入口', () => {
  assert.equal(typeof view.mountD1Home, 'function');
  assert.equal(typeof view.mountRoster, 'function');
  assert.equal(typeof view.mountEntry, 'function');
});
