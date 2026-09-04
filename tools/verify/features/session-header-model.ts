// SessionHeader verdict 回归：Header 浮层纯数据层断言（node --test，零第三方依赖）。
// 做法：与 B1 badge-model 同范式——用仓库自带 tsc 把 src/client/data 纯模块转译到临时目录，再断言转译产物。
// 覆盖 verdict（#8，C 变体）：时机三态（hidden/unbound/full）、可达性复用 B1（任一在线即在线）、
// 发测试消息只走已保存目标（无目标不谎报发送）、信封解包与错误码透传。
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const SRC = join(REPO, 'src', 'client', 'data');
const FILES = ['config.ts', 'fleet-api.ts', 'bindings.ts', 'header-overlay.ts', 'model.ts', 'meta.ts'];

const stage = mkdtempSync(join(tmpdir(), 'session-header-src-'));
for (const f of ['icons.ts']) {
  writeFileSync(join(stage, f), readFileSync(join(REPO, 'src', 'client', f), 'utf8'));
}
for (const f of FILES) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  // 仅测试副本：将 bundler 风格 extensionless 改写为 nodenext 可解（产物代码不动）。
  const fixed = raw.replace(/\.\/([A-Za-z0-9_-]+)(['"])/g, (m, name, q) =>
    String(name).endsWith('.js') ? m : './' + name + '.js' + q);
  writeFileSync(join(stage, f), fixed);
}
const tmp = mkdtempSync(join(tmpdir(), 'session-header-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...FILES.map((f) => join(stage, f)),
    join(stage, 'icons.ts'),
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
const { headerOverlayFor, resolveWorkspacePath, chooseBot, botsInChannel, buildTestText, listTargets, sendTestMessage, runTestSend, sendToSuggestion, listSuggestions, testDraftTarget, suggestionLabel, channelsOf, SEND_TEST_EVENT } = await mod('header-overlay.js');
const { mergeStaleBots } = await mod('fleet-api.js');
const { buildModel } = await mod('model.js');
const { channelGlyphSvg } = await mod('icons.js');

const W1 = 'D:\\agents\\xiaoshuai';
const snap = (over: Record<string, unknown> = {}) => ({
  channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
  healthStatus: 'healthy', healthKind: 'online', botName: '', avatarUrl: '',
  healthSummary: '', lastCheckedAt: 1000, stale: false, ...over,
});
const items = [
  { workspaceId: 'ws-1', path: W1, title: 'xiaoshuai', sessionIds: ['sess-aaa'] },
  { workspaceId: 'ws-2', path: 'D:\\agents\\dsh-im', title: 'dsh-im', sessionIds: ['sess-bbb'] },
];

test('resolveWorkspacePath：session 反查 workspace（官方同款语义）', () => {
  assert.equal(resolveWorkspacePath('sess-aaa', items), W1);
  assert.equal(resolveWorkspacePath('sess-???', items), undefined);
  assert.equal(resolveWorkspacePath('sess-aaa', []), undefined);
});

test('headerOverlayFor：时机三态', () => {
  const now = 90000;
  assert.equal(headerOverlayFor(undefined, [snap()], now).mode, 'hidden'); // IM 无关：不注入
  assert.equal(headerOverlayFor('D:\\agents\\empty', [], now).mode, 'unbound'); // 已知工作区无绑定：灰色提示
  const full = headerOverlayFor(W1, [snap()], now);
  assert.equal(full.mode, 'full');
  assert.equal(full.agent, 'Xiaoshuai'); // 无自定义名时与面板一致：目录名首字母大写
  assert.match(full.label, /在线/);
  assert.equal(full.channels.length, 1);
  assert.equal(full.channels[0].label, '飞书');
});

test('headerOverlayFor：可达性与 B1 同 verdict（任一在线即在线）', () => {
  const now = 90000;
  const conflict = headerOverlayFor(W1, [
    snap({ channel: 'feishu', healthKind: 'online' }),
    snap({ channel: 'qq', botId: 'q', healthKind: 'offline', healthStatus: 'offline', connected: false }),
  ], now);
  assert.equal(conflict.dotKind, 'online');
  const stale = headerOverlayFor(W1, [snap({ stale: true, healthKind: 'warn', lastCheckedAt: 1000 })], now);
  assert.equal(stale.dotKind, 'warn'); // 未知按待确认，不报离线
  const off = headerOverlayFor(W1, [snap({ healthKind: 'offline', healthStatus: 'offline', connected: false })], now);
  assert.equal(off.dotKind, 'offline');
});

test('chooseBot：优先在线绑定，否则首个绑定，无绑定为 null', () => {
  const off = snap({ botId: 'off', healthKind: 'offline', healthStatus: 'offline', connected: false });
  const on = snap({ botId: 'on' });
  assert.equal(chooseBot([off, on], W1)?.botId, 'on');
  assert.equal(chooseBot([off], W1)?.botId, 'off');
  assert.equal(chooseBot([], W1), null);
  assert.equal(chooseBot([snap({ workspace: 'D:\\agents\\other' })], W1), null);
});

test('buildTestText：固定前缀 + Agent 可识别', () => {
  const t = buildTestText('小帅');
  assert.match(t, /连接测试/);
  assert.match(t, /小帅/);
});

test('SEND_TEST_EVENT：命名空间事件名', () => {
  assert.equal(SEND_TEST_EVENT, 'dsh-im-companion:send-test');
});

test('listTargets：解包 value.targets；ok:false 抛码', async () => {
  const rpc = async () => ({ ok: true, value: { botId: 'b1', channel: 'feishu', targets: [{ targetId: 't1', name: '群' }] } });
  const ts = await listTargets(rpc as any, 'b1');
  assert.equal(ts.length, 1);
  assert.equal(ts[0].targetId, 't1');
  const bad = async () => ({ ok: false, error: { code: 'unknown-bot', message: 'no' } });
  await assert.rejects(() => listTargets(bad as any, 'b1'),
    (e: unknown) => (e as { code?: string }).code === 'unknown-bot');
});

test('sendTestMessage：成功透传 sent；失败抛码；无目标不调用 rpc', async () => {
  let calls = 0;
  const rpc = async (_ch: string, ep: string) => {
    calls++;
    assert.equal(ep, 'message.send');
    return { ok: true, value: { sent: true } };
  };
  const r = await sendTestMessage(rpc as any, 'b1', 't1', 'hi');
  assert.equal(r.sent, true);
  assert.equal(calls, 1);
  const off = async () => ({ ok: false, error: { code: 'bot-not-connected', message: 'offline' } });
  await assert.rejects(() => sendTestMessage(off as any, 'b1', 't1', 'hi'),
    (e: unknown) => (e as { code?: string }).code === 'bot-not-connected');
  const boom = async () => { throw new Error('net down'); };
  await assert.rejects(() => sendTestMessage(boom as any, 'b1', 't1', 'hi'), /net down/);
});

test('runTestSend：全路径如实（无 rpc/无 bot/无目标/成功/失败）', async () => {
  const bot = snap({ botId: 'b1' });
  assert.equal((await runTestSend(null, bot, W1, '小帅')).ok, false);
  assert.match((await runTestSend(async () => ({}), null, W1, '小帅')).text, /尚未绑定/);
  const empty = async () => ({ ok: true, value: { botId: 'b1', targets: [] } });
  assert.match((await runTestSend(empty as any, bot, W1, '小帅')).text, /说一句话/);
  const good = async (_ch: string, ep: string) =>
    ep === 'target.list'
      ? { ok: true, value: { botId: 'b1', targets: [{ targetId: 't1', name: '群' }] } }
      : { ok: true, value: { sent: true } };
  const win = await runTestSend(good as any, bot, W1, '小帅');
  assert.equal(win.ok, true);
  assert.match(win.text, /群/);
  assert.match(win.text, /飞书/); // 成功文案必带渠道
  assert.equal(win.event?.targetId, 't1');
  assert.equal(win.event?.workspace, W1);
  const down = async (_ch: string, ep: string) =>
    ep === 'target.list'
      ? { ok: true, value: { botId: 'b1', targets: [{ targetId: 't1' }] } }
      : { ok: false, error: { code: 'bot-not-connected', message: 'offline' } };
  const lost = await runTestSend(down as any, bot, W1, '小帅');
  assert.equal(lost.ok, false);
  assert.match(lost.text, /bot-not-connected/);
  assert.equal(lost.event, undefined);
});

test('mergeStaleBots：失败渠道保留旧快照标 stale；权威空不保留', () => {
  const prev = [snap({ channel: 'qq', botId: 'q9', lastCheckedAt: 1000 })];
  const kept = mergeStaleBots(prev, [], ['qq']);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].stale, true);
  assert.equal(kept[0].lastCheckedAt, 1000); // 时间冻结
  const fresh = [snap({ channel: 'qq', botId: 'q9', lastCheckedAt: 3000 })];
  const replaced = mergeStaleBots(prev, fresh, ['qq']);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].lastCheckedAt, 3000); // 新快照优先
  assert.equal(mergeStaleBots(prev, [], []).length, 0); // 无失败无保留
});

test('runTestSend：离线/待确认预检 direct 返回，不调 rpc', async () => {
  let calls = 0;
  const rpc = async () => { calls++; return {}; };
  const off = snap({ botId: 'b1', healthKind: 'offline', healthStatus: 'offline', connected: false });
  const r1 = await runTestSend(rpc as any, off, W1, '小帅');
  assert.equal(r1.ok, false);
  assert.match(r1.text, /离线/);
  const stale = snap({ botId: 'b1', stale: true, healthKind: 'warn' });
  const r2 = await runTestSend(rpc as any, stale, W1, '小帅');
  assert.equal(r2.ok, false);
  assert.match(r2.text, /待确认/);
  assert.equal(calls, 0); // 预检拦截，零 RPC
});

test('headerOverlayFor：自定义名与面板一致（全路径优先，旧键兼容）', () => {
  const now = 90000;
  const bots = [snap()];
  assert.equal(headerOverlayFor(W1, bots, now, { [W1]: '小帅' }).agent, '小帅');
  assert.equal(headerOverlayFor(W1, bots, now, { 'xiaoshuai': '旧名' }).agent, '旧名');
  assert.equal(headerOverlayFor(W1, bots, now, {}).agent, 'Xiaoshuai');
  assert.equal(headerOverlayFor('D:\\agents\\empty', [], now, { 'D:\\agents\\empty': '空房' }).agent, '空房');
});

test('草稿测试流：建议列举/草稿发送/展示名', async () => {
  const rpc = async (_ch: string, ep: string) => {
    if (ep === 'target.suggestion.list') return { ok: true, value: { botId: 'b1', suggestions: [{ kind: 'group', route: { chatId: 'oc_abc123' } }] } };
    if (ep === 'target.test') return { ok: true, value: { sent: true } };
    throw new Error('unexpected ' + ep);
  };
  const sgs = await listSuggestions(rpc as any, 'b1');
  assert.equal(sgs.length, 1);
  assert.equal(suggestionLabel(sgs[0]), '群聊·…c123');
  const r = await testDraftTarget(rpc as any, 'b1', sgs[0]);
  assert.equal(r.sent, true);
  const bad = async () => ({ ok: false, error: { code: 'target-rejected', message: 'no' } });
  await assert.rejects(() => testDraftTarget(bad as any, 'b1', sgs[0]),
    (e: unknown) => (e as { code?: string }).code === 'target-rejected');
});

test('runTestSend 无目标分支：1 个直发 / N 个回列表 / 0 个给指引', async () => {
  const bot = snap({ botId: 'b1' });
  const none = async (_ch: string, ep: string) => ({ ok: true, value: ep === 'target.list' ? { targets: [] } : { suggestions: [] } });
  const r0 = await runTestSend(none as any, bot, W1, '小帅');
  assert.equal(r0.ok, false);
  assert.match(r0.text, /说一句话/);
  const one = async (_ch: string, ep: string) => {
    if (ep === 'target.list') return { ok: true, value: { targets: [] } };
    if (ep === 'target.suggestion.list') return { ok: true, value: { suggestions: [{ kind: 'user', route: { openId: 'ou_x' } }] } };
    return { ok: true, value: { sent: true } };
  };
  const r1 = await runTestSend(one as any, bot, W1, '小帅');
  assert.equal(r1.ok, true);
  assert.equal(r1.event?.channel, 'feishu');
  const many = async (_ch: string, ep: string) => {
    if (ep === 'target.list') return { ok: true, value: { targets: [] } };
    return { ok: true, value: { suggestions: [{ kind: 'user', route: { a: 1 } }, { kind: 'group', route: { b: 2 } }] } };
  };
  const rN = await runTestSend(many as any, bot, W1, '小帅');
  assert.equal(rN.ok, false);
  assert.equal(rN.suggestions?.length, 2);
  assert.match(rN.text, /选择/);
  const win = await sendToSuggestion(one as any, bot, { kind: 'user', route: { openId: 'ou_x' } }, W1, '小帅');
  assert.equal(win.ok, true);
  assert.match(win.text, /一次性/);
  assert.match(win.text, /未保存/);
  assert.match(win.text, /飞书/); // 草稿文案同样必带渠道
});

test('channelsOf：多渠道成行，同渠道取最优，stale 按待确认', () => {
  const rows = channelsOf([
    snap({ channel: 'feishu', botId: 'f1' }),
    snap({ channel: 'qq', botId: 'q1', healthKind: 'offline', healthStatus: 'offline', connected: false }),
    snap({ channel: 'qq', botId: 'q2' }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, '飞书');
  assert.equal(rows[0].statusText, '在线');
  assert.match(rows[0].color, /^#/);
  assert.equal(rows[1].label, 'QQ');
  assert.equal(rows[1].statusText, '在线'); // 同渠道任一在线即在线
  const stale = channelsOf([snap({ stale: true, healthKind: 'warn' })]);
  assert.equal(stale[0].statusText, '待确认');
  assert.deepEqual(channelsOf([]), []);
});

test('同名目录不串名：全路径键隔离，旧 basename 键兼容', () => {
  const a = snap({ workspace: 'D:\\a\\xiaoshuai', botId: 'a1' });
  const b = snap({ workspace: 'D:\\b\\xiaoshuai', botId: 'b1' });
  const meta = { names: { 'D:\\a\\xiaoshuai': '小帅', 'xiaoshuai': '旧名' }, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const m = buildModel([a, b], meta, 'agent', '');
  const va = m.agents.find((v) => v.workspace === 'D:\\a\\xiaoshuai');
  const vb = m.agents.find((v) => v.workspace === 'D:\\b\\xiaoshuai');
  assert.equal(va.name, '小帅'); // 全路径键优先
  assert.equal(vb.name, '旧名'); // 无全路径键时旧键仍生效，不丢数据
  const m2 = buildModel([a, b], { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }, 'agent', '');
  assert.equal(m2.agents.find((v) => v.workspace === 'D:\\a\\xiaoshuai').name, 'Xiaoshuai'); // 无名时目录名首字母大写
});

test('channelGlyphSvg：九渠道全覆盖，未知回 null（回退首字徽标）', () => {
  for (const ch of ['feishu', 'weixin', 'qq', 'slack', 'telegram', 'discord', 'whatsapp', 'dingtalk', 'wecom']) {
    const svg = channelGlyphSvg(ch, 18);
    assert.ok(svg && svg.startsWith('<svg'), ch);
    assert.match(svg, new RegExp('data-channel-logo="' + ch + '"'));
    assert.ok(svg.length > 150, ch + ' 疑似截断');
  }
  assert.equal(channelGlyphSvg('nope'), null);
  assert.match(channelGlyphSvg('feishu'), /#00D6B9/); // 品牌色保留
  assert.match(channelGlyphSvg('weixin'), /#07C160/i); // 微信原始绿（用户裁定 2026-09-04，不再 currentColor 变白）
  assert.doesNotMatch(channelGlyphSvg('weixin'), /currentColor/);
  assert.match(channelGlyphSvg('qq'), /#12B7F5/i);
  assert.match(channelGlyphSvg('whatsapp'), /#25D366/i);
});

test('chooseBot 传渠道：只在该渠道内选', () => {
  const bots = [
    snap({ botId: 'f1', channel: 'feishu' }),
    snap({ botId: 'q1', channel: 'qq', healthKind: 'offline', healthStatus: 'offline', connected: false }),
    snap({ botId: 'q2', channel: 'qq' }),
  ];
  assert.equal(chooseBot(bots, W1, 'qq')?.botId, 'q2'); // QQ 内优先在线
  assert.equal(chooseBot(bots, W1, 'feishu')?.botId, 'f1');
  assert.equal(chooseBot(bots, W1, 'nope'), null);
  assert.equal(chooseBot(bots, W1)?.botId, 'f1'); // 不传渠道保持原行为
});

test('botsInChannel：同渠道全量（#32 第二步选择），按工作区隔离', () => {
  const bots = [
    snap({ botId: 'f1', channel: 'feishu', botName: '小帅' }),
    snap({ botId: 'f2', channel: 'feishu', botName: '小腾' }),
    snap({ botId: 'f3', channel: 'feishu', botName: '小匠' }),
    snap({ botId: 'w1', channel: 'weixin', botName: '微信机器人' }),
    snap({ botId: 'x1', channel: 'feishu', workspace: 'D:\\agents\\other', botName: '别家' }),
  ];
  const feishu = botsInChannel(bots, W1, 'feishu');
  assert.equal(feishu.length, 3); // 三个飞书全量，不代选
  assert.deepEqual(feishu.map((b) => b.botId), ['f1', 'f2', 'f3']);
  assert.equal(botsInChannel(bots, W1, 'weixin').length, 1);
  assert.deepEqual(botsInChannel(bots, W1, 'nope'), []);
  assert.deepEqual(botsInChannel([], W1, 'feishu'), []);
});

test('多渠道发送：显式 Bot 决定走谁的目标', async () => {
  const seen: string[] = [];
  const rpc = async (_ch: string, ep: string, payload: any) => {
    if (ep === 'target.list') { seen.push(payload.botId); return { ok: true, value: { targets: [{ targetId: 't1' }] } }; }
    return { ok: true, value: { sent: true } };
  };
  const qq = snap({ botId: 'q1', channel: 'qq' });
  const r = await runTestSend(rpc as any, qq, W1, '小帅');
  assert.equal(r.ok, true);
  assert.deepEqual(seen, ['q1']); // 查的是 QQ 这台的目标，不是首台
});

console.log('header-overlay-model: ALL PASS');
