// C1b 矩阵总览自验证（F0 每功能自验证）：纯数据层 + 注册/样式断言（node --test，零第三方依赖）。
// 做法：tsc 转译相关链到临时目录再断言（照抄 c1a-drawer.ts 模式）；view/styles 只转译不断言运行时。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'c1b-matrix');
const ENTRIES = [
  join(REPO, 'src', 'client', 'data', 'config.ts'),
  join(REPO, 'src', 'client', 'data', 'fleet-api.ts'),
  join(REPO, 'src', 'client', 'data', 'meta.ts'),
  join(REPO, 'src', 'client', 'data', 'model.ts'),
  join(FEAT, 'data.ts'),
  join(FEAT, 'view.ts'),
  join(FEAT, 'styles.ts'),
  join(FEAT, 'manifest.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'c1b-matrix-'));
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
// view.ts 含 react 运行时（宿主 bundle 侧供给），tmp 目录解析不到——运行时只 require 纯数据链；
// manifest/view/styles 靠 tsc 转译 + 源码断言覆盖。
const req = createRequire(join(tmp, 'run.cjs'));
const data: any = req('./features/c1b-matrix/data.js');
const config: any = req('./client/data/config.js');
const manifestSrc = readFileSync(join(FEAT, 'manifest.ts'), 'utf8');
const stylesSrc = readFileSync(join(FEAT, 'styles.ts'), 'utf8');

function snap(channel: string, botId: string, workspace: string, healthKind: string): any {
  return {
    channel, botId, workspace, connected: true, healthStatus: null, healthKind,
    botName: botId, avatarUrl: '', healthSummary: '', lastCheckedAt: 1,
  };
}
const META: any = { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };

test('列固定 9 序（CHANNEL_ORDER），与共享配置同源', () => {
  const m = data.buildMatrix([], META);
  assert.deepEqual(m.cols.map((c: any) => c.id), [...config.CHANNEL_ORDER]);
  assert.equal(m.cols.length, 9);
});

test('行排序：在线 > 待确认 > 离线 > 未绑定，组内按名', () => {
  const bots = [
    snap('qq', 'b-qq-off', 'D:/ws/off', 'offline'),
    snap('feishu', 'b-fei-on', 'D:/ws/on', 'online'),
    snap('weixin', 'b-wx-warn', 'D:/ws/warn', 'warn'),
    snap('feishu', 'b-orphan', '', 'online'),
  ];
  const m = data.buildMatrix(bots, META);
  assert.deepEqual(m.rows.map((r: any) => r.key), ['D:/ws/on', 'D:/ws/warn', 'D:/ws/off', 'unbound:b-orphan']);
});

test('格语义：有 bot 取健康 + 行级绑定；无 bot 为 empty', () => {
  const bots = [snap('feishu', 'b1', 'D:/ws/a', 'warn')];
  const m = data.buildMatrix(bots, META);
  const row = m.rows[0];
  assert.equal(row.bound, true);
  const fei = row.cells.find((c: any) => c.channel === 'feishu');
  assert.equal(fei.botId, 'b1');
  assert.equal(fei.health, 'warn');
  const qq = row.cells.find((c: any) => c.channel === 'qq');
  assert.equal(qq.health, 'empty');
  assert.equal(qq.botId, '');
});

test('空态：0 行 + 计数归零；全空列仅在有行时计算', () => {
  const m = data.buildMatrix([], META);
  assert.equal(m.rows.length, 0);
  assert.deepEqual(m.counts, { agents: 0, channels: 9, bots: 0 });
  assert.deepEqual(m.emptyColumns, []);
  const m2 = data.buildMatrix([snap('feishu', 'b1', 'D:/ws/a', 'online')], META);
  assert.ok(m2.emptyColumns.includes('qq'));
  assert.ok(!m2.emptyColumns.includes('feishu'));
});

test('钻取载荷：事件名即 C1a 抽屉订阅的 OPEN_DRAWER_EVENT', () => {
  const e = data.drillEventFor('D:/ws/a');
  assert.equal(e.name, config.OPEN_DRAWER_EVENT);
  assert.deepEqual(e.detail, { key: 'D:/ws/a' });
});

test('状态文案：健康 label + 未绑定后缀（单元格/汇总共用）', () => {
  assert.equal(data.statusText('online', true), '在线');
  assert.equal(data.statusText('warn', false), '待确认·未绑定');
  assert.equal(data.statusText('offline', true), '离线');
});

test('双语：字典/状态词/渠道名 EN（默认 zh 保持旧断言）', () => {
  assert.equal(data.statusText('online', true), '在线');
  assert.equal(data.statusText('online', true, 'en'), 'Online');
  assert.equal(data.statusText('warn', false, 'en'), 'Pending · Unbound');
  assert.equal(data.healthLabel('empty', 'en'), 'Not connected');
  assert.equal(data.matrixChannelLabel('feishu', 'en'), 'Feishu');
  assert.equal(data.matrixChannelLabel('weixin', 'zh'), '微信');
  assert.equal(data.strings('en').title, 'Fleet Radar');
  assert.equal(data.strings('zh').title, '舰队雷达');
  assert.match(data.metaLine(3, 9, 5, 'en'), /3 agents/);
  const mEn = data.buildMatrix([snap('feishu', 'b1', 'D:/ws/a', 'online')], META, 'en');
  assert.equal(mEn.cols[0].label, 'Feishu');
});

test('大弹窗装配：矩阵自管模态 + 装配层零感知 + A1 船按钮间距（源码断言）', () => {
  const viewSrc = readFileSync(join(FEAT, 'view.ts'), 'utf8');
  assert.match(viewSrc, /showSheet\(\{ overlayClass: 'c1bm-overlay', panelClass: 'c1bm-modal'/);
  assert.match(viewSrc, /FLEET_VIEW_EVENT/);
  assert.match(viewSrc, /mountRadarView/);
  assert.match(viewSrc, /openRadar/);
  assert.doesNotMatch(viewSrc, /slots\.inject/);
  assert.doesNotMatch(viewSrc, /from 'react'/);
  assert.match(manifestSrc, /mountRadar/);
  const indexSrc = readFileSync(join(REPO, 'src', 'client', 'index.ts'), 'utf8');
  assert.doesNotMatch(indexSrc, /MatrixSection/);
  assert.doesNotMatch(indexSrc, /c1b-matrix/);
  const panelSrc = readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8');
  assert.match(panelSrc, /iconName: 'ship'/);
  assert.match(panelSrc, /emitFleetView\('radar'\)/);
  assert.match(panelSrc, /gap: '12px'/);
  assert.doesNotMatch(panelSrc, /c1b-matrix/);
  assert.match(stylesSrc, /\.c1bm-modal/);
});

test('注册：id/槽位目标 + 样式命名空间（转译已过，此处源码断言）', () => {
  assert.match(manifestSrc, /id: 'c1b-matrix'/);
  assert.match(manifestSrc, /name: '舰队雷达'/);
  assert.match(manifestSrc, /target: 'settings.section'/);
  assert.match(manifestSrc, /installFeatureStyles\('c1b-matrix'/);
  assert.match(stylesSrc, /\.c1bm-table/);
  assert.match(stylesSrc, /\.c1bm-cell/);
  assert.match(stylesSrc, /\.c1bm-lang/);
  assert.doesNotMatch(stylesSrc, /\.af-[a-z]/);
  assert.doesNotMatch(stylesSrc, /\.sp\b/);
});

rmSync(tmp, { recursive: true, force: true });
