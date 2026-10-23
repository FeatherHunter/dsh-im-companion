// #144 分区断言：会话 Header 弹窗身份化＋发送以助理为单位单选（node --test，零第三方依赖）。
// 范式同 session-header-model.ts：tsc 转译纯模块到临时目录再断言转译产物。
// 覆盖：bot→助理匹配优先级、命名链（用户>机器人>家>回落）、状态映射（在线/待确认/离线/未绑定）、
// 脸回落（上传图>机器人头像>色脸首字）、工作区隔离、fetchAssistBriefs 的 home.list/avatar.get 接线。
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const SRC = join(REPO, 'src', 'client', 'data');
const FEAT = join(REPO, 'src', 'features', 'session-header', 'assistants.ts');
const FILES = ['config.ts', 'fleet-api.ts', 'home-model.ts', 'home-channel.ts'];
/* #154：默认区显示名单点真相搬到共享层 src/workspace-default.ts（client + host 共用）⇒ 这条夹具多铺一份。 */
const SHARED_DEFAULT = 'workspace-default.ts';

const stage = mkdtempSync(join(tmpdir(), 'session-header-asst-src-'));
const LOG_STUB = [
  "export type LogLevel = 'error' | 'warn' | 'info' | 'debug'",
  'export function initLog(_rpc?: unknown): void {}',
  'export function logLine(_level: LogLevel, _event: string, _fields?: Record<string, unknown>): void {}',
  'export function logOn(_level: LogLevel): boolean { return false }',
  'export function flushLogs(): void {}',
  'export function reconcileLogSwitch(): void {}',
  'export function droppedLogs(): number { return 0 }',
  '',
].join('\n');
writeFileSync(join(stage, 'log.ts'), LOG_STUB);
writeFileSync(join(stage, SHARED_DEFAULT), readFileSync(join(REPO, 'src', SHARED_DEFAULT), 'utf8'));
for (const f of FILES) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  const fixed = raw
    .replace(/from '\.\.\/log'/g, "from './log'")
    /* #154：共享层文件在 src/ 根 ⇒ 平铺夹具里改写成同目录引用。 */
    .replace(/from '\.\.\/\.\.\/workspace-default'/g, "from './workspace-default.js'")
    .replace(/\.\/([A-Za-z0-9_-]+)(['"])/g, (m, name, q) =>
      String(name).endsWith('.js') ? m : './' + name + '.js' + q);
  writeFileSync(join(stage, f), fixed);
}
{
  const raw = readFileSync(FEAT, 'utf8');
  const fixed = raw
    .replace(/from '\.\.\/\.\.\/client\/data\/([A-Za-z0-9_-]+)'/g, "from './$1'")
    .replace(/\.\/([A-Za-z0-9_-]+)(['"])/g, (m, name, q) =>
      String(name).endsWith('.js') ? m : './' + name + '.js' + q);
  writeFileSync(join(stage, 'assistants.ts'), fixed);
}
const tmp = mkdtempSync(join(tmpdir(), 'session-header-asst-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...[...FILES, SHARED_DEFAULT, 'assistants.ts'].map((f) => join(stage, f)),
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'nodenext', '--target', 'es2023',
    '--moduleResolution', 'nodenext', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const mod = (f: string) => import(pathToFileURL(join(tmp, f)).href);
const {
  matchBotAssistant, buildAssistBriefs, fetchAssistBriefs, channelViewFor,
  hasAssistImage, initialsOf, faceStyle, ASSIST_STATUS_TEXT,
} = await mod('assistants.js');

const WS = 'D:\\agents\\xiaowan';
const home = (over: Record<string, unknown> = {}) => ({
  id: 'h1', workspaceId: 'ws-1', path: WS, name: 'Xiaowan', nameSource: 'system',
  avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1, ...over,
});
const asst = (over: Record<string, unknown> = {}) => ({
  id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'b1', status: 'bound',
  name: '', nameSource: 'bot', avatar: null, avatarSource: 'default',
  createdAt: 1, boundAt: 1, ...over,
});
const bot = (over: Record<string, unknown> = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: WS, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});

test('匹配优先级：同渠道+botId 精确命中优先于跨渠道 botId 兜底', () => {
  const exact = asst({ id: 'exact', channel: 'feishu', botId: 'b1' });
  const cross = asst({ id: 'cross', channel: 'weixin', botId: 'b1' });
  assert.equal(matchBotAssistant([cross, exact], bot()).id, 'exact');
  assert.equal(matchBotAssistant([cross], bot()).id, 'cross');
  assert.equal(matchBotAssistant([], bot()), null);
});

test('命名链：用户改名 > 机器人名（#31 截断） > 家名 > 未命名助理', () => {
  const b = bot({ botName: '小丸子助理' });
  assert.equal(buildAssistBriefs([home()], [asst({ name: 'Xiaowan', nameSource: 'user' })], [b], WS, new Map())[0].name, 'Xiaowan');
  assert.equal(buildAssistBriefs([home()], [asst({})], [b], WS, new Map())[0].name, '小丸子助理');
  const long = bot({ botName: '0123456789abcdef', botId: 'b9' });
  assert.equal(
    buildAssistBriefs([home()], [asst({ botId: 'b9' })], [long], WS, new Map())[0].name,
    '0123456789ab…',
  );
  assert.equal(buildAssistBriefs([home()], [asst({ botId: null, status: 'unbound' })], [], WS, new Map())[0].name, 'Xiaowan');
  assert.equal(buildAssistBriefs([home({ name: '' })], [asst({ botId: null, status: 'unbound' })], [], 'D:\\other', new Map()).length, 0);
});

test('状态映射：在线/待确认(stale)/离线/未绑定（无 bot 占位）', () => {
  const on = buildAssistBriefs([home()], [asst()], [bot()], WS, new Map())[0];
  assert.equal(on.status, 'online');
  assert.equal(on.statusText, ASSIST_STATUS_TEXT.online);
  const stale = buildAssistBriefs([home()], [asst()], [bot({ stale: true })], WS, new Map())[0];
  assert.equal(stale.status, 'warn');
  assert.equal(stale.statusText, '待确认');
  const off = buildAssistBriefs([home()], [asst()], [bot({ healthStatus: 'bad', healthKind: 'offline', connected: false })], WS, new Map())[0];
  assert.equal(off.status, 'offline');
  assert.equal(off.statusText, '离线');
  const unb = buildAssistBriefs([home()], [asst({ botId: null, status: 'unbound' })], [], WS, new Map())[0];
  assert.equal(unb.status, 'unbound');
  assert.equal(unb.statusText, '未绑定');
});

test('脸回落：上传图（已到） > 机器人头像 > 色脸首字；未到图不空等', () => {
  const imgs = new Map([['a1', 'data:image/png;base64,AAA']]);
  const withImg = buildAssistBriefs([home()], [asst({ avatar: 'img:1', name: 'Xiaowan', nameSource: 'user' })], [bot()], WS, imgs)[0];
  assert.equal(withImg.img, 'data:image/png;base64,AAA');
  const pending = buildAssistBriefs([home()], [asst({ avatar: 'img:1', name: 'Xiaowan', nameSource: 'user' })], [bot()], WS, new Map())[0];
  assert.equal(pending.img, null);
  assert.ok(pending.tint.includes('background:') && pending.initial === 'XI');
  const botAv = buildAssistBriefs([home()], [asst()], [bot({ avatarUrl: 'https://x/y.png' })], WS, new Map())[0];
  assert.equal(botAv.img, 'https://x/y.png');
  assert.ok(hasAssistImage('img:1') && !hasAssistImage('3') && !hasAssistImage(null));
  assert.equal(initialsOf('晓丸'), '晓');
  assert.equal(initialsOf(''), '?');
  assert.ok(faceStyle('a1', null).includes('background:'));
});

test('工作区隔离：墓碑家/悬空 homeId/异路助理不渲染，按 createdAt 保序', () => {
  const homes = [home(), home({ id: 'h2', path: WS, tombstone: { at: 9, reason: 'user' } })];
  const list = [
    asst({ id: 'a2', createdAt: 2, botId: 'b2' }),
    asst({ id: 'a1', createdAt: 1, botId: 'b1' }),
    asst({ id: 'ghost', homeId: 'hx', botId: 'b3', createdAt: 0 }),
    asst({ id: 'tomb', homeId: 'h2', botId: 'b4', createdAt: 0 }),
  ];
  const bots = [bot(), bot({ botId: 'b2' })];
  const out = buildAssistBriefs(homes, list, bots, WS, new Map());
  assert.deepEqual(out.map((b: { assistant: { id: string } }) => b.assistant.id), ['a1', 'a2']);
});

test('诚实渠道行：无 Bot 助理不借用同渠道在线（#144 追修）', () => {
  const rows = [{ channel: 'feishu', label: '飞书', kind: 'online', statusText: '在线' }];
  const briefs = buildAssistBriefs(
    [home()], [asst({}), asst({ id: 'a2', botId: null, status: 'unbound' })], [bot()], WS, new Map(),
  );
  const bound = briefs.find((b: { assistant: { id: string } }) => b.assistant.id === 'a1');
  const unb = briefs.find((b: { assistant: { id: string } }) => b.assistant.id === 'a2');
  assert.equal(bound.bot?.botId, 'b1');
  const vBound = channelViewFor(bound, rows);
  assert.equal(vBound.live, true);
  assert.equal(vBound.statusText, '在线');
  assert.equal(unb.bot, null);
  assert.equal(unb.status, 'unbound');
  const vUnb = channelViewFor(unb, rows);
  assert.equal(vUnb.live, false);
  assert.equal(vUnb.statusText, '未绑定');
  assert.ok(!vUnb.statusText.includes('在线'));
});

test('fetchAssistBriefs：home.list + avatar.get 接线；rpc 缺失回 []', async () => {
  const rpc = async (_ch: string, ep: string) => {
    if (ep === 'home.list') return { ok: true, value: { homes: [home()], assistants: [asst({ avatar: 'img:1' })] } };
    if (ep === 'avatar.get') return { ok: true, value: { images: { a1: 'data:image/png;base64,AAA' } } };
    throw new Error('unexpected ' + ep);
  };
  const out = await fetchAssistBriefs(rpc as never, [bot()], WS);
  assert.equal(out.length, 1);
  assert.equal(out[0].img, 'data:image/png;base64,AAA');
  assert.deepEqual(await fetchAssistBriefs(null, [bot()], WS), []);
});
