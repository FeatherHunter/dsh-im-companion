// #79 验证：host 半改走 DSH 公开 /api 载体（connection.fetch.register），不再用 rpc.handle。
//
// 线上故障（DSH Desktop，web profile）：
//   Error: failed to apply loader entry dsh-im-companion (dsh-im-companion):
//          cannot get property "webServer" without inject
// 成因：旧写法 ctx.connection.rpc.handle() 让 connection 服务以【它自己的 Context】去调
//   webServer.register(...) 注册前缀路由，而那个 Context 没有 webServer 注入 → 装配期被 cordis 拒绝。
//   ⚠️ 实测：给本插件加 webServer 声明【无效】—— 抛错的 Context 不是本插件的 ctx。
//   （#79 那条「必须声明 webServer」的结论据此作废。）
// 修法：改用 connection.fetch.register，与 @xmanrui/dsh-im 的 plugin-src/management-rpc.mjs 同构
//   （上游 503a24a 的「管理 RPC 改道」）。
//
// 做法：把 src/index.ts（连带 src/host）转译到临时目录，再用 mock ctx 真跑一次 apply()：
//   ① inject 只声明 connection（不再需要 webServer）；
//   ② apply 通过 connection.fetch.register 注册 /api/im-companion；
//   ③ 该路由的 fetch 说 DSH 信封：client-request → server-response + result；
//   ④ 方法守卫：handler 自身只答 POST（不依赖宿主派发实现）；
//   ⑤ 重装配退让：宿主报 already registered 时不抛、只 warn 且不注册；
//   ⑥ 回归钉：宿主不提供 fetch.register 时 apply 必须失败 —— 证明本测试真的盯着新载体。
// 决策记录：docs/adr/0002（载体迁移 + 首版 webServer 假设为何作废）。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'host-entry-'));
try {
  // 用仓库自己的 tsconfig（NodeNext + types:node）编译 host 半到临时目录，产物形态与 lib/ 一致。
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p', 'tsconfig.json', '--outDir', tmp, '--declarationDir', join(tmp, 'types'), '--sourceMap', 'false'],
    { stdio: 'pipe' });
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message));
  process.exit(1);
}
writeFileSync(join(tmp, 'package.json'), '{"type": "module"}\n');
const host: any = await import(pathToFileURL(join(tmp, 'index.js')).href);
const tmpHome = mkdtempSync(join(tmpdir(), 'host-entry-home-'));
after(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tmpHome, { recursive: true, force: true });
});

type FetchRoute = { path: string; methods?: string[]; requestBody?: string; fetch: (req: any) => Promise<any> };

/** 复刻宿主的 cordis 声明守卫 + connection 服务面（新载体 = fetch.register）。 */
function makeCtx(
  declared: readonly string[],
  opts: { withFetch?: boolean; registerError?: string } = {},
): { ctx: any; routes: FetchRoute[]; warns: string[] } {
  const { withFetch = true, registerError } = opts;
  const routes: FetchRoute[] = [];
  const warns: string[] = [];
  const raw: Record<string, unknown> = {
    logger: { info: () => {}, warn: (m?: unknown) => { warns.push(String(m)); } },
    effect: (fn: () => unknown) => { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
    provide: () => {},
  };
  const ctx: any = new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === 'webServer' || prop === 'connection') {
        if (!declared.includes(prop)) {
          // 与宿主装配失败逐字同款文案（cordis 声明检查）
          throw new Error(`cannot get property "${prop}" without inject`);
        }
        if (prop === 'webServer') {
          return { register: () => () => {} };
        }
        const connection: Record<string, unknown> = {
          // 旧入口保留只为证明「不再被调用」：一旦被调用即抛，测试立刻失败。
          rpc: { handle: () => { throw new Error('rpc.handle must not be used anymore (#79)'); } },
        };
        if (withFetch) {
          connection.fetch = {
            register: (options: FetchRoute) => {
              // 宿主重复注册时的原话（registerFetchRoute）
              if (registerError !== undefined) throw new Error(registerError);
              routes.push(options);
              return () => { const i = routes.indexOf(options); if (i >= 0) routes.splice(i, 1); };
            },
          };
        }
        return connection;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { ctx, routes, warns };
}

test('inject 只声明 connection（不再需要 webServer）', () => {
  assert.ok(Array.isArray(host.inject), 'inject 必须是数组');
  assert.ok(host.inject.includes('connection'), 'inject 必须含 connection');
  assert.ok(!host.inject.includes('webServer'),
    'inject 不应再含 webServer：#79 已改走 connection.fetch.register，抛错的 Context 不是本插件的 ctx');
  console.log('#79-PROOF inject=' + JSON.stringify(host.inject) + ' PASS');
});

test('装配通过，并经 fetch.register 注册 /api/im-companion', () => {
  const { ctx, routes } = makeCtx(host.inject);
  host.apply(ctx, { dshHome: tmpHome });
  assert.ok(routes.some((r) => r.path === '/api/im-companion'),
    '应经 connection.fetch.register 注册 /api/im-companion');
  assert.equal(routes[0]?.requestBody, 'buffered', 'requestBody 应为 buffered');
  console.log('#79-PROOF apply-ok routes=' + JSON.stringify(routes.map((r) => r.path)) + ' PASS');
});

test('路由 fetch 说 DSH 信封：client-request → server-response + result', async () => {
  const { ctx, routes } = makeCtx(host.inject);
  host.apply(ctx, { dshHome: tmpHome });
  const route = routes.find((r) => r.path === '/api/im-companion');
  assert.ok(route, '路由必须已注册');
  const response = await route!.fetch({
    method: 'POST',
    json: async () => ({
      type: 'client-request',
      rpcId: 'x1',
      method: 'im-companion',
      payload: { method: 'ping', payload: {} },
    }),
  });
  const body = await response.json();
  assert.equal(body.type, 'server-response', '回包必须是 server-response 信封');
  assert.equal(body.rpcId, 'x1', 'rpcId 必须原样回带');
  assert.equal(body.result?.ok, true, 'ping 应回 ok:true 信封');
  console.log('#79-PROOF envelope=' + JSON.stringify(body).slice(0, 140) + ' PASS');
});

test('方法守卫：handler 自身只答 POST（不依赖宿主派发实现）', async () => {
  const { ctx, routes } = makeCtx(host.inject);
  host.apply(ctx, { dshHome: tmpHome });
  const route = routes.find((r) => r.path === '/api/im-companion');
  assert.ok(route, '路由必须已注册');
  const res = await route!.fetch({ method: 'GET' });
  assert.equal(res.status, 405, '非 POST 必须被 handler 自己挡下（405）');
  console.log('#79-PROOF method-guard PASS');
});

test('重装配退让：宿主报 already registered 时只 warn、不抛、不重复注册', () => {
  const { ctx, routes, warns } = makeCtx(host.inject, {
    registerError: 'connection: exact Fetch route "/api/im-companion" is already registered',
  });
  assert.doesNotThrow(() => host.apply(ctx, { dshHome: tmpHome }), '退让分支必须吞掉重复注册错误');
  assert.equal(routes.length, 0, '退让时本实例不应注册任何路由');
  assert.ok(warns.some((w) => w.includes('already registered')), '应留一条 warn 说明退让原因');
  console.log('#79-PROOF yield-on-duplicate PASS');
});

test('回归钉：宿主不提供 fetch.register 时装配必须失败（证明测试盯着新载体）', () => {
  const { ctx } = makeCtx(host.inject, { withFetch: false });
  assert.throws(() => host.apply(ctx, { dshHome: tmpHome }));
  console.log('#79-PROOF missing-fetch-register-fails PASS');
});
