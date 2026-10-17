// FleetRadar 矩阵总览自验证（F0 每功能自验证）：纯数据层 + 注册/样式断言（node --test，零第三方依赖）。
// 做法：tsc 转译相关链到临时目录再断言（照抄 detail-drawer.ts 模式）；view/styles 只转译不断言运行时。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'fleet-radar');
const ENTRIES = [
  join(REPO, 'src', 'client', 'data', 'config.ts'),
  join(REPO, 'src', 'client', 'icons.ts'),
  join(REPO, 'src', 'client', 'data', 'fleet-api.ts'),
  join(REPO, 'src', 'client', 'data', 'meta.ts'),
  join(REPO, 'src', 'client', 'data', 'model.ts'),
  join(REPO, 'src', 'client', 'data', 'home-channel.ts'),
  join(REPO, 'src', 'client', 'data', 'home-model.ts'),
  join(FEAT, 'data.ts'),
  join(FEAT, 'home-matrix.ts'),
  join(FEAT, 'cell-pop.ts'),
  join(FEAT, 'view.ts'),
  join(FEAT, 'styles.ts'),
  join(FEAT, 'manifest.ts'),
];

const tmp = mkdtempSync(join(tmpdir(), 'fleet-radar-'));
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
const data: any = req('./features/fleet-radar/data.js');
const hm: any = req('./features/fleet-radar/home-matrix.js');
const config: any = req('./client/data/config.js');
const iconsMod: any = req('./client/icons.js');
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
  assert.equal(fei.count, 1);
  assert.deepEqual(fei.names, []);
  assert.deepEqual(fei.mates, [], '旧 fallback 格无助理明细（悬浮只走家矩阵）');
  const qq = row.cells.find((c: any) => c.channel === 'qq');
  assert.equal(qq.health, 'empty');
  assert.equal(qq.botId, '');
  assert.equal(qq.count, 0);
  assert.deepEqual(qq.mates, []);
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

test('钻取载荷：事件名即 DetailDrawer 抽屉订阅的 OPEN_DRAWER_EVENT', () => {
  const e = data.drillEventFor('D:/ws/a');
  assert.equal(e.name, config.OPEN_DRAWER_EVENT);
  assert.deepEqual(e.detail, { key: 'D:/ws/a' });
});

test('家矩阵：行＝家；墓碑与悬空 homeId 不渲染；同家同渠道多助理合并', () => {
  const homes = [
    { id: 'h1', path: 'D:/ws/a', name: 'A家' },
    { id: 'h2', path: 'D:/ws/b', name: 'B家', tombstone: { at: 1 } },
    { id: 'h3', path: 'D:/ws/c', name: 'C家' },
  ];
  const assistants = [
    { id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小助' },
    { id: 'a2', homeId: 'h1', channel: 'feishu', botId: 'b2', status: 'bound', name: '二助' },
    { id: 'a3', homeId: 'h1', channel: 'qq', botId: null, status: 'unbound', name: '待助' },
    { id: 'a4', homeId: 'hX', channel: 'qq', botId: 'b9', status: 'bound', name: '悬空' },
    { id: 'a5', homeId: 'h3', channel: 'weixin', botId: null, status: 'orphan', name: '旧助' },
  ];
  const bots = [snap('feishu', 'b1', 'D:/ws/a', 'online'), snap('feishu', 'b2', 'D:/ws/a', 'warn')];
  const m = hm.buildHomeMatrix(bots, homes, assistants);
  assert.deepEqual(m.rows.map((r: any) => r.key), ['h1', 'h3'], '在线家在前，墓碑/悬空不占行');
  const h1 = m.rows[0];
  assert.equal(h1.drillKey, 'D:/ws/a', '钻取走 home.path（抽屉兼容）');
  assert.equal(h1.assistantCount, 3);
  assert.equal(h1.boundCount, 2);
  assert.equal(h1.unboundCount, 1);
  assert.equal(h1.orphanCount, 0);
  assert.equal(h1.status, 'online');
  const fei = h1.cells.find((c: any) => c.channel === 'feishu');
  assert.equal(fei.health, 'online');
  assert.equal(fei.count, 2);
  assert.deepEqual(fei.names, ['小助', '二助']);
  assert.deepEqual(fei.mates, [
    { id: 'a1', name: '小助', avatar: null, botId: 'b1', health: 'online', stale: false },
    { id: 'a2', name: '二助', avatar: null, botId: 'b2', health: 'warn', stale: false },
  ], '悬浮明细：一行一位，各自快照健康');
  const qq = h1.cells.find((c: any) => c.channel === 'qq');
  assert.equal(qq.health, 'empty', '待绑（unbound）不进渠道列');
  assert.deepEqual(qq.mates, []);
  const h3 = m.rows[1];
  const wx = h3.cells.find((c: any) => c.channel === 'weixin');
  assert.equal(wx.health, 'orphan', '全员孤儿才标失联');
  assert.equal(wx.count, 1);
  assert.deepEqual(wx.mates, [{ id: 'a5', name: '旧助', avatar: null, botId: '', health: 'orphan', stale: false }]);
  assert.equal(m.counts.assistants, 4);
});

test('悬浮明细带取图键：id＋avatar 透传（img 标记才取图，无标记回落首字块）', () => {
  const list = [
    { id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小助', avatar: 'img:mark1' },
    { id: 'a2', homeId: 'h1', channel: 'feishu', botId: 'b2', status: 'bound', name: '二助', avatar: null },
  ];
  const bots = [snap('feishu', 'b1', 'D:/ws/a', 'online'), snap('feishu', 'b2', 'D:/ws/a', 'online')];
  const c = hm.cellForHome(list, bots, 'feishu');
  assert.equal(c.mates[0].id, 'a1');
  assert.equal(c.mates[0].avatar, 'img:mark1');
  assert.equal(c.mates[1].id, 'a2');
  assert.equal(c.mates[1].avatar, null);
});

test('家矩阵：空家沉底＋行汇总文案（助理构成/待绑/失联）', () => {
  const homes = [
    { id: 'h1', path: 'D:/ws/a', name: 'A家' },
    { id: 'h0', path: 'D:/ws/z', name: 'Z家' },
  ];
  const assistants = [
    { id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小助' },
    { id: 'a3', homeId: 'h1', channel: 'qq', botId: null, status: 'unbound', name: '待助' },
  ];
  const m = hm.buildHomeMatrix([snap('feishu', 'b1', 'D:/ws/a', 'online')], homes, assistants);
  assert.deepEqual(m.rows.map((r: any) => r.key), ['h1', 'h0'], '空家（0 助理）沉底');
  assert.equal(m.rows[1].bound, false);
  assert.equal(data.rowCrewNote(m.rows[0], 'zh'), '2助理，1已绑，1待绑');
  assert.equal(data.rowCrewNote(m.rows[1], 'zh'), '');
  assert.equal(data.rowCrewNote(m.rows[0], 'en'), '2 assistants, 1 bound, 1 pending');
  assert.equal(data.metaCrewLine(4, 2, 'zh'), '4助理，2机器人');
  assert.equal(data.metaCrewLine(4, 2, 'en'), '4 assistants, 2 bots');
  assert.equal(data.healthLabel('orphan', 'zh'), '失联');
  assert.equal(data.healthLabel('orphan', 'en'), 'Orphaned');
});

test('状态文案：健康 label + 未绑定后缀（单元格/汇总共用；#140 逗号口径）', () => {
  assert.equal(data.statusText('online', true), '在线');
  assert.equal(data.statusText('warn', false), '待确认，未绑定');
  assert.equal(data.statusText('offline', true), '离线');
  const parts = data.statusParts('warn', false);
  assert.equal(parts.health, '待确认');
  assert.equal(parts.note, '未绑定', '可见处拆两个节点（分隔靠 gap），statusText 只喂不可见 title');
});

test('双语：字典/状态词/渠道名 EN（默认 zh 保持旧断言）', () => {
  assert.equal(data.statusText('online', true), '在线');
  assert.equal(data.statusText('online', true, 'en'), 'Online');
  assert.equal(data.statusText('warn', false, 'en'), 'Pending, Unbound');
  assert.equal(data.healthLabel('empty', 'en'), 'Not connected');
  assert.equal(data.matrixChannelLabel('feishu', 'en'), 'Feishu');
  assert.equal(data.matrixChannelLabel('weixin', 'zh'), '微信');
  assert.equal(data.strings('en').title, 'Fleet Radar');
  assert.equal(data.strings('zh').title, '舰队雷达');
  assert.match(data.metaGridLine(3, 9, 'en'), /3 homes/);
  assert.equal(data.metaBotsLine(5, 'en'), '5 bots');
  assert.ok(data.metaGridLine(3, 9, 'en').indexOf('·') < 0, '头部计数零分隔符（#140）');
  const mEn = data.buildMatrix([snap('feishu', 'b1', 'D:/ws/a', 'online')], META, 'en');
  assert.equal(mEn.cols[0].label, 'Feishu');
});

test('语言跟随：langOf 归一（DSH 只发 zh/en，空按中文兜底）', () => {
  assert.equal(data.langOf('zh-CN'), 'zh');
  assert.equal(data.langOf('zh'), 'zh');
  assert.equal(data.langOf('en'), 'en');
  assert.equal(data.langOf(''), 'zh');
  assert.equal(data.langOf(null), 'zh');
  assert.equal(data.langOf(undefined), 'zh');
});

test('LOGO：9 渠道全覆盖 + 未知回退（dsh-im 同款 glyph）', () => {
  for (const id of config.CHANNEL_ORDER) {
    const svg = iconsMod.channelGlyphSvg(id, 14);
    assert.equal(typeof svg, 'string', id);
    assert.match(svg, /<svg/);
    assert.match(svg, /<path/);
  }
  assert.equal(iconsMod.channelGlyphSvg('nope-channel', 14), null);
  for (const id of config.CHANNEL_ORDER) {
    assert.match(data.LOGO_TILE_BG[id], /^#/, 'tile:' + id);
  }
});

test('大弹窗装配：矩阵自管模态 + 装配层零感知 + A1 船按钮间距（源码断言）', () => {
  const viewSrc = readFileSync(join(FEAT, 'view.ts'), 'utf8');
  assert.match(viewSrc, /showSheet\(\{ overlayClass: 'fleet-radar-overlay', panelClass: 'fleet-radar-modal'/);
  assert.match(viewSrc, /FLEET_VIEW_EVENT/);
  assert.match(viewSrc, /mountRadarView/);
  assert.match(viewSrc, /openRadar/);
  assert.match(viewSrc, /docLang/);
  assert.match(viewSrc, /MutationObserver/);
  assert.match(viewSrc, /channelGlyphSvg/);
  assert.match(viewSrc, /fleet-radar-logo/);
  assert.doesNotMatch(viewSrc, /onLang/);
  assert.doesNotMatch(viewSrc, /fleet-radar-lang/);
  assert.doesNotMatch(viewSrc, /slots\.inject/);
  assert.doesNotMatch(viewSrc, /from 'react'/);
  assert.match(manifestSrc, /mountRadar/);
  const indexSrc = readFileSync(join(REPO, 'src', 'client', 'index.ts'), 'utf8');
  assert.doesNotMatch(indexSrc, /MatrixSection/);
  assert.doesNotMatch(indexSrc, /fleet-radar/);
  const panelSrc = readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8');
  assert.match(panelSrc, /iconName: 'ship'/);
  assert.match(panelSrc, /emitFleetView\('radar'\)/);
  /* 上部区域定稿（owner 裁定 2026-10-13）：船按钮从 A1 工具栏并进绿框页头动作簇，
   * 簇间距改由绿框样式表管（.hu-head-acts）；装配层照旧只负责派事件，特性侧零感知。 */
  assert.match(panelSrc, /headActions/);
  assert.match(readFileSync(join(REPO, 'src', 'client', 'components', 'home-ui-styles.ts'), 'utf8'),
    /\.hu-head-acts\{[^}]*gap:6px/);
  assert.doesNotMatch(panelSrc, /fleet-radar/);
  assert.match(stylesSrc, /\.fleet-radar-modal/);
});

test('家行装配：家表主路径＋回落＋钻取 drillKey（源码断言）', () => {
  const viewSrc = readFileSync(join(FEAT, 'view.ts'), 'utf8');
  const dataSrc = readFileSync(join(FEAT, 'data.ts'), 'utf8');
  assert.match(viewSrc, /buildHomeMatrix/);
  assert.match(viewSrc, /home\.list/);
  assert.match(viewSrc, /drillKey/);
  assert.match(viewSrc, /renderHomeHead/);
  assert.match(viewSrc, /rowCrewNote/);
  assert.match(viewSrc, /metaCrewLine/);
  assert.doesNotMatch(viewSrc, /renderAgentHead/);
  assert.match(dataSrc, /agentCol: '家 ＼ 渠道'/);
  assert.match(stylesSrc, /\.fleet-radar-dot\.orphan/);
});

test('格悬浮：助理明细 popover 接线（home-row-tip 纪律：fixed 盒/延迟/拆盒/量后亮）', () => {
  const viewSrc = readFileSync(join(FEAT, 'view.ts'), 'utf8');
  const popSrc = readFileSync(join(FEAT, 'cell-pop.ts'), 'utf8');
  assert.match(viewSrc, /showCellPop/);
  assert.match(viewSrc, /hideCellPop/);
  assert.match(viewSrc, /mouseenter/);
  assert.match(viewSrc, /mouseleave/);
  /* 重画换格 ⇒ 旧悬停作废：paint 与 dispose 都先收盒 */
  assert.match(viewSrc, /hideCellPop\(\)\n    const lang = docLang/);
  assert.match(popSrc, /fleet-radar-poprow/);
  assert.match(popSrc, /fleet-radar-av/);
  assert.match(popSrc, /healthLabel\(m\.health/);
  assert.match(popSrc, /pointer-events:none/);
  assert.match(popSrc, /120/);
  assert.match(popSrc, /querySelectorAll\('\.fleet-radar-pop'\)/);
  assert.match(popSrc, /classList\.add\('on'\)/);
  assert.match(popSrc, /avatarColor\(m\.name/);
  /* 真头像：img 标记走 avatar.get 直读（与绿框同端点同形状）；到图重画补上 */
  assert.match(popSrc, /IMG_MARK = 'img:'/);
  assert.match(popSrc, /avatar\.get/);
  assert.match(popSrc, /imageCover\(url\)/);
  assert.match(popSrc, /imgCache/);
  assert.match(popSrc, /setCellPopRpc/);
  assert.match(popSrc, /disposeCellPop/);
  assert.match(popSrc, /data:image\//);
  assert.match(viewSrc, /setCellPopRpc\(\(\) => fctx\.rpc\)/);
  assert.match(viewSrc, /disposeCellPop\(\)/);
  /* 不引写管道：cell-pop 不 import home-avatar/home-ops/connect-flow（禁引 A1 私有，传导也不行） */
  assert.doesNotMatch(popSrc, /import[^\n;]*home-avatar/);
  assert.doesNotMatch(popSrc, /import[^\n;]*home-ops/);
  assert.doesNotMatch(popSrc, /import[^\n;]*connect-flow/);
  assert.match(stylesSrc, /\.fleet-radar-pop\b/);
  assert.match(stylesSrc, /\.fleet-radar-poprow/);
  /* 首行渠道 LOGO：复用共享 icons＋底色（不 import view，免循环）；未知渠道只剩文字 */
  assert.match(popSrc, /logoNode\(cell\.channel\)/);
  assert.match(popSrc, /channelGlyphSvg\(channel, 12\)/);
  assert.match(popSrc, /LOGO_TILE_BG\[channel\]/);
  assert.match(popSrc, /fleet-radar-logo/);
  /* 预热：随表预热全格有图助理 ⇒ 首悬即见真图（同缓存同端点；通道未就绪留队不丢） */
  assert.match(popSrc, /export function warmCellPopImages/);
  assert.match(popSrc, /if \(!rpc \|\| imgPending\.size === 0\) return/);
  assert.match(viewSrc, /warmCellPopImages\(all\)/);
  assert.doesNotMatch(popSrc, /from '\.\/view'/);
  assert.match(stylesSrc, /\.fleet-radar-pop-hd \{[^}]*display: flex/);
  assert.match(stylesSrc, /\.fleet-radar-pop\.on/);
});

test('空格不可点：渠道无机器人 ⇒ 纯展示 span，不进详情抽屉；悬浮头像与名字同高', () => {
  const viewSrc = readFileSync(join(FEAT, 'view.ts'), 'utf8');
  /* 空格分支：span、无 onClick（全文件 span 一律无点击，button 才有） */
  assert.match(viewSrc, /if \(cell\.health === 'empty'\) \{\n    return h\('span'/);
  assert.doesNotMatch(viewSrc, /h\('span', \{[^}\n]*onClick/);
  /* 空格 title 不带钻取提示（cellTitle 空分支无 drillHint，button 分支仍有） */
  assert.doesNotMatch(viewSrc, /empty'\) return cell\.label.*drillHint/);
  assert.match(stylesSrc, /\.fleet-radar-cell\.ghost \{[^}]*cursor: default/);
  assert.match(stylesSrc, /\.fleet-radar-poprow \.fleet-radar-av \{[^}]*width: 16px/);
  assert.match(stylesSrc, /\.fleet-radar-poprow \.fleet-radar-av \{[^}]*height: 16px/);
});

test('LOGO 洗白：单色 7 渠道白 glyph + feishu/wecom 豁免（BUG #30 根因锁）', () => {
  const viewSrc = readFileSync(join(FEAT, 'view.ts'), 'utf8');
  assert.match(viewSrc, /dataset: \{ ch: channel \}/);
  assert.match(stylesSrc, /\.fleet-radar-logo:not\(\[data-ch="feishu"\]\)/);
  assert.match(stylesSrc, /fill: #fff/);
  for (const id of ['weixin', 'qq', 'slack', 'telegram', 'discord', 'whatsapp', 'dingtalk']) {
    assert.match(data.LOGO_TILE_BG[id], /^#/);
    assert.notEqual(data.LOGO_TILE_BG[id].toLowerCase(), '#ffffff');
  }
  assert.equal(data.LOGO_TILE_BG.feishu, '#ffffff');
  assert.equal(data.LOGO_TILE_BG.wecom, '#ffffff');
});

test('注册：id/槽位目标 + 样式命名空间（转译已过，此处源码断言）', () => {
  assert.match(manifestSrc, /id: 'fleet-radar'/);
  assert.match(manifestSrc, /name: '舰队雷达'/);
  assert.match(manifestSrc, /target: 'settings.section'/);
  assert.match(manifestSrc, /installFeatureStyles\('fleet-radar'/);
  assert.match(stylesSrc, /\.fleet-radar-table/);
  assert.match(stylesSrc, /\.fleet-radar-cell/);
  assert.match(stylesSrc, /\.fleet-radar-logo/);
  assert.match(stylesSrc, /\.fleet-radar-modal/);
  assert.doesNotMatch(stylesSrc, /\.fleet-radar-lang/);
  assert.doesNotMatch(stylesSrc, /\.af-[a-z]/);
  assert.doesNotMatch(stylesSrc, /\.sp\b/);
});

rmSync(tmp, { recursive: true, force: true });
