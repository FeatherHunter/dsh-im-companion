// T9 #125 落地验证：客户端 traceId 随自有桥内层载荷下行的**贯通与无害性**（node --test，零第三方依赖）。
//
// 做法（真件而不是打桩）：把 src 两半分别转译到两个临时目录——
//   宿主半走仓库 tsconfig（NodeNext + ESM，产物形态与 lib/ 一致），客户端半走独立 entries 转 CJS
//   （同 rpc-dual-transport.ts 的手法，模块导出可打桩）；客户端用**真 dsh-log 客户端实例**
//   （`initLog(真 RpcCall)` ⇒ 真链 id，不是手编字符串），宿主用 mock ctx 真跑 `apply()`（真落盘到临时 dshHome）。
// 覆盖：
//   V4 两端同链 —— 客户端行（包自己写 traceId）与宿主语义行 / rpc 行同一个 traceId，落盘后读回；
//   V3 宿主摘键 —— `home.update` 的语义字段 `changed` 里**没有** traceId（桥元数据没被当业务入参）；
//   V5 读侧   —— 经桥 `logQuery({traceId})` 一次取回该动作的客户端行与宿主行；
//   V1 注入面 —— 业务端点加键、显式键不覆盖、日志电话不加、无链不加、dsh-im 渠道不加；
//   V2 清单   —— `host.rpc.call` / `host.rpc.fail` 的 fields 声明含 traceId（漂移由 log-pipeline.ts 双向核对）。
// 输出：T9-PROOF 行可直接贴 #125 作证（含**真实样本**原文）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
const PLUGIN_ID = String(pkg.name);
const tmpHost = mkdtempSync(join(tmpdir(), 'trace-host-'));
const tmpClient = mkdtempSync(join(tmpdir(), 'trace-client-'));
const tmpHome = mkdtempSync(join(tmpdir(), 'trace-home-'));
after(() => {
  /* TRACE_KEEP=1 保留现场：验收标准第 3 条要拿**真盘上的日志目录**喂 `npx dsh-log tail --trace <id>`
   * （读侧工具面必须真的能取回两端），跑完这条命令再手工删；默认仍然清干净。 */
  if (process.env.TRACE_KEEP === '1') { console.log('T9-PROOF keep-home=' + tmpHome); return; }
  for (const d of [tmpHost, tmpClient, tmpHome]) rmSync(d, { recursive: true, force: true });
});

const TSC = join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');
// 宿主半：仓库 tsconfig（include 只有 src/index.ts + src/host），产物 ESM。
try {
  execFileSync(process.execPath, [TSC, '-p', 'tsconfig.json', '--outDir', tmpHost, '--declarationDir', join(tmpHost, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-HOST-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
// 客户端半：独立 entries 转 CJS（含 log-events 作共同根，产物落在 <tmp>/client/**）。
// 不做类型检查以外的裁剪：rpc.ts 的真身（含注入点）就是被断言的对象。
try {
  execFileSync(process.execPath, [TSC,
    join(REPO, 'src', 'client', 'log.ts'), join(REPO, 'src', 'client', 'data', 'rpc.ts'), join(REPO, 'src', 'log-events.ts'),
    '--ignoreConfig', '--outDir', tmpClient, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false'], { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-CLIENT-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(tmpHost, 'package.json'), '{"type": "module"}\n');
for (const t of [tmpHost, tmpClient]) {
  try { symlinkSync(join(REPO, 'node_modules'), join(t, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }
}
const host: any = await import(pathToFileURL(join(tmpHost, 'index.js')).href);
const req = createRequire(join(tmpClient, 'run.cjs'));
const logMod: any = req('./client/log.js');
const rpcMod: any = req('./client/data/rpc.js');
const { buildPhoneNames, buildLogQueryPhoneName } = req('dsh-log/client');
const PHONES = buildPhoneNames(PLUGIN_ID) as Record<string, string>;
const QUERY_PHONE = buildLogQueryPhoneName(PLUGIN_ID) as string;

type FetchRoute = { path: string; methods?: string[]; requestBody?: string; fetch: (req: any) => Promise<any> };
const routes: FetchRoute[] = [];
/** mock ctx：只给 apply() 真正要用的三样（logger / effect / connection.fetch.register）。
 *  装配守卫（cordis inject 文案）另有专钉（tools/verify/host-entry.ts），这里不重复。 */
const ctx: any = {
  logger: () => ({ info: () => {}, warn: () => {} }),
  effect: (fn: () => unknown) => { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
  provide: () => {},
  connection: { fetch: { register: (o: FetchRoute) => { routes.push(o); return () => {}; } } },
};
host.apply(ctx, { dshHome: tmpHome });
const route = routes.find((r) => r.path === '/api/im-companion');
assert.ok(route, 'apply() 必须注册 /api/im-companion 路由');

/** 宿主路由的「DSH 传输层」替身：把内层载荷包成真信封喂给**真路由**，再把回包 result 交回客户端。
 *  只认新载体方向（`'/api'` + `'im-companion'`）：旧前缀方向直接抛 ⇒ 断言走的是 #79 之后的新载体，
 *  而不是靠一条早就退役的老路蒙混过关（与 rpc-dual-transport.ts 的四象限同口径）。 */
let rpcIdSeq = 0;
const wire: Array<Record<string, unknown>> = [];
const rawCall = async (ch: string, ep: string, p: Record<string, unknown>): Promise<unknown> => {
  if (ch !== '/api' || ep !== 'im-companion') {
    throw Object.assign(new Error('legacy direction not served: ' + ch + '/' + ep), { code: 'RPC_NO_ROUTE' });
  }
  wire.push(p);
  const res = await route!.fetch({
    method: 'POST',
    json: async () => ({ type: 'client-request', rpcId: 'e2e-' + (++rpcIdSeq), method: 'im-companion', payload: p }),
  });
  const env = await res.json();
  return env.result;
};
const rpc: any = rpcMod.extractRpcV2({ connection: { rpc: { call: (ch: string, ep: string, p: Record<string, unknown>) => rawCall(ch, ep, p) } } });
assert.ok(typeof rpc === 'function', '客户端必须能从 ctx 取出 RpcCall');
const signal = () => new AbortController().signal;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 等宿主建库完成（电话注册表填好）：用 logGetSwitch 当就绪探针——建库前它会落到「未知端点」。 */
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  const env: any = await rpc('/im-companion', PHONES.logGetSwitch, {}, signal()).catch(() => null);
  if (env?.ok === true) ready = true; else await sleep(100);
}
assert.ok(ready, '宿主日志电话应在建库后注册（等 logGetSwitch 可用；否则客户端首批行会打到未知端点）');

/** 读回临时 dshHome 里的真日志文件（今日文件名带日期，跨零点也不会读丢）。 */
function readRows(): any[] {
  const dir = join(tmpHome, 'logs', PLUGIN_ID);
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.log')); } catch { return []; }
  const rows: any[] = [];
  for (const f of files) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* 非行内容跳过 */ }
    }
  }
  return rows;
}
async function waitRows(pick: (rows: any[]) => boolean, ms = 6000): Promise<any[]> {
  const until = Date.now() + ms;
  for (;;) {
    const rows = readRows();
    if (pick(rows) || Date.now() > until) return rows;
    await sleep(120);
  }
}

/* ── 客户端接真桥：真 dsh-log 客户端实例 ⇒ 真链 id（第一枪：确认 why().traceId 非 null） ── */
logMod.initLog(rpc);
const tid: string | null = logMod.currentTraceId();
test('第一枪：真客户端实例在真实桥接后产出 16 位十六进制链 id（why().traceId 非 null）', () => {
  assert.equal(typeof tid, 'string', 'initLog(真 RpcCall) 后 currentTraceId() 不应为 null');
  assert.match(String(tid), /^[0-9a-f]{16}$/, '链 id 必须是 16 位十六进制（dsh-log core/ids.genHex(16)）');
  console.log('T9-PROOF V0 traceId=' + String(tid) + ' PASS');
});

test('V4/V3 贯通：业务 RPC 带链 id → 宿主摘键进日志（真请求、真落盘、真读回）', async () => {
  const before = wire.length;
  // 家不存在 ⇒ 端点回失败信封；语义行是 error ⇒ 与 host.rpc.fail 一样必落盘（resident）。
  const env: any = await rpc('/im-companion', 'home.update', { id: 'no-such-home-#125', name: 'x' }, signal());
  assert.equal(env?.ok, false, '不存在的家必须回失败信封（本用例靠它拿到 resident 语义行）');
  // 客户端侧的动作行（resident，包自己写 traceId/spanId/seq）——两端同链的另一半。
  logMod.logLine('info', 'home.action', { action: 'update', homeId: 'no-such-home-#125', ok: false, message: '' });
  logMod.flushLogs();

  const onWire = wire[before] as { method?: string; payload?: Record<string, unknown> } | undefined;
  assert.equal(onWire?.method, 'home.update', '桥内层 method 应是业务端点名');
  assert.equal(onWire?.payload?.traceId, tid, '桥内层 payload 必须带上客户端链 id（落地第一枪的样本）');

  const rows = await waitRows((rs) => rs.some((r) => r.event === 'home.update') && rs.some((r) => r.event === 'home.action'));
  const semantic = rows.find((r) => r.event === 'home.update');
  const rpcFail = rows.find((r) => r.event === 'host.rpc.fail' && r.fields?.method === 'home.update');
  const client = rows.find((r) => r.event === 'home.action');
  assert.ok(semantic, '宿主语义行 home.update 必须落盘');
  assert.ok(rpcFail, '宿主 host.rpc.fail 行必须落盘（resident：调试开关关着也落）');
  assert.ok(client, '客户端 home.action 行必须经桥落进同一份日志');
  assert.equal(semantic.fields.traceId, tid, '宿主语义行必须与触发动作用同一个 traceId');
  assert.equal(semantic.fields.changed, 'name', 'traceId 是桥元数据、不是业务入参：changed 里不许出现它');
  assert.equal(rpcFail.fields.traceId, tid, 'host.rpc.fail 行必须带同一个 traceId');
  assert.equal(client.fields.traceId, tid, '客户端行与宿主行必须同链（V4）');
  console.log('T9-PROOF V4 样本(客户端行)=' + JSON.stringify(client));
  console.log('T9-PROOF V4 样本(宿主语义行)=' + JSON.stringify(semantic));
  console.log('T9-PROOF V3 changed=' + String(semantic.fields.changed) + ' traceId=' + String(semantic.fields.traceId) + ' PASS');
});

test('V5 读侧：经桥 logQuery({traceId}) 一次取回该动作的客户端行与宿主行', async () => {
  const env: any = await rpc('/im-companion', QUERY_PHONE, { traceId: tid }, signal());
  assert.equal(env?.ok, true, 'logQuery 电话必须经桥可达（电话入参原样透传，见 V1 ③）');
  const value: any = env.value ?? env;
  const rows: any[] = Array.isArray(value?.entries) ? value.entries : [];
  const events = rows.map((r: any) => r.event);
  /* 双端命中：宿主写的行（语义行 / host.* 生命周期行）与客户端写的行（home.action）同一条链。
   * 默认档位下 host.rpc.call 不落盘，能查回宿主侧靠的是语义行也带 traceId（见 src/host/log.ts 注释）。 */
  assert.ok(events.includes('home.update'), '按 traceId 查回**宿主语义行**；实为 ' + JSON.stringify(events));
  assert.ok(events.includes('home.action'), '按 traceId 查回**客户端行**（双端命中）');
  console.log('T9-PROOF V5 events=' + JSON.stringify(events) + ' PASS');
});

test('V1 注入面：业务端点加键、显式键不覆盖、日志电话不加、无链不加、dsh-im 渠道不加', async () => {
  const seen: Array<{ ch: string; ep: string; p: Record<string, unknown> }> = [];
  const probe: any = rpcMod.extractRpcV2({
    connection: { rpc: { call: async (ch: string, ep: string, p: Record<string, unknown>) => { seen.push({ ch, ep, p }); return { ok: true }; } } },
  });
  const real = logMod.currentTraceId;
  const stub = (v: string | null) => { logMod.currentTraceId = () => v; };
  try {
    stub('feedfacecafebeef');
    await probe('/im-companion', 'home.update', { id: 'h1' }, signal());                       // ① 业务端点
    await probe('/im-companion', 'home.update', { id: 'h1', traceId: 'explicit-keep-me' }, signal()); // ② 显式键
    await probe('/im-companion', PHONES.logGetSwitch, {}, signal());                            // ③ 日志电话
    stub(null);
    await probe('/im-companion', 'home.update', { id: 'h1' }, signal());                       // ④ 无链
    stub('feedfacecafebeef');
    await probe('/feishu', 'send', { text: 'x' }, signal());                                   // ⑤ 别的渠道
  } finally { logMod.currentTraceId = real; }

  const body = (i: number) => seen[i].p as { method?: string; payload?: Record<string, unknown> };
  assert.equal(body(0).payload?.traceId, 'feedfacecafebeef', '① 业务端点必须带上当前链 id');
  assert.equal(body(0).payload?.id, 'h1', '① 只加键：既有业务键不许动');
  assert.equal(body(1).payload?.traceId, 'explicit-keep-me', '② 载荷里已有的 traceId 永不覆盖（logQuery 的过滤条件）');
  assert.ok(!Object.hasOwn(body(2).payload as object, 'traceId'), '③ 日志电话不加键：电话入参是包自己的语义面');
  assert.ok(!Object.hasOwn(body(3).payload as object, 'traceId'), '④ 无链（null）不加键，不许编造空串');
  assert.ok(!Object.hasOwn(body(4).payload as object, 'traceId'), '⑤ dsh-im 渠道载荷不掺本仓字段');
  assert.equal(seen[4].ep, 'dsh-im/feishu', '⑤ 仍走新载体 endpoint 规则（T5 冻结）');
  console.log('T9-PROOF V1 shapes=' + JSON.stringify(seen.map((s) => ({ ch: s.ch, ep: s.ep, p: s.p }))) + ' PASS');
});

test('V2 清单：两条 rpc 事件的 fields 声明含 traceId（漂移由 log-pipeline.ts 双向核对）', () => {
  const events = (req('./log-events.js') as any).LOG_EVENTS;
  for (const e of ['host.rpc.call', 'host.rpc.fail']) {
    assert.ok(events[e]?.fields?.includes('traceId'), e + ' 的 fields 必须声明 traceId（否则清单核对当场红）');
  }
  assert.equal(events['host.rpc.fail'].kind, 'resident', 'host.rpc.fail 必须是 resident：默认档位下贯通即成立');
  console.log('T9-PROOF V2 events=' + JSON.stringify({ call: events['host.rpc.call'].fields, fail: events['host.rpc.fail'].fields }) + ' PASS');
});
