/** dsh-im-companion host 后端：元数据持久化 + 自有桥（client 经 DSH 公开 /api 载体调用，见 ADR-0002）。 */
import { homedir } from 'node:os'
import path from 'node:path'
import { AgentMetaStore } from './host/meta-store.js'
import { createAgentFleetHandler } from './host/rpc.js'
import { createUpdateHostBridge } from './host/update.js'
import { createHostLogFor, type HostLogHandle, type LogPhoneRegistry } from './host/log.js'
import { hostBuildId } from './host/build-id.js'
import { configDirFor } from './host/config-yaml.js'
import { migrateConfigToYaml } from './host/config-migrate.js'
import type { InstallVerdict } from './host/update-precheck.js'

export const name = 'dsh-im-companion'
// 载体：DSH 公开的 /api（connection.fetch.register），故 inject 只需 connection。
// 旧写法 ctx.connection.rpc.handle() 会以 connection 服务自身的 Context 去调 webServer.register(...)
// 注册前缀路由，而那个 Context 没有 webServer 注入 → 装配期必抛 cannot get property "webServer" without inject；
// 实测：给本插件加 webServer 声明【无效】，抛错的 Context 不是本插件的 ctx。修法与证据见 docs/adr/0002。
//
// T5 #110 M5 起不再注入 `timer`：自建自动检查调度器已删，宿主不再读 `ctx.interval` / `ctx.timeout`。
// （2026-09-12 冷启动事故的 `timer` 必需注入前提已不存在：那是调度器排受管定时器才需要的。）
export const inject = ['connection']

/** 自有桥端点名（信封 method 字段）与它在 /api 载体上的路径：单点定义，避免两处字面量漂移。 */
const ENDPOINT = 'im-companion'
const ROUTE_PATH = '/api/' + ENDPOINT

/** #126：预检留痕一行（resident ⇒ 调试开关关着也落盘）。`expected` 只在 dev-source 时为真——
 * 「解析不出目标包」不等于「预期」，那种情况由 message 明说「没能归因」（诚实口径）。 */
function logPrecheck(handle: HostLogHandle, v: InstallVerdict): void {
  handle.log('info', 'update.precheck', {
    mode: v.mode, dir: v.dir ?? '', profileDir: v.profileDir ?? '', expected: v.mode === 'dev-source', message: v.message,
  })
}

/** #125（T9 收尾）：从桥内层业务载荷里取出客户端链 id，并把该键**摘掉**再交给分发器。
 * `traceId` 是桥的**元数据**（契约 §4「桥内层 payload 的可选 traceId」），不是业务入参：
 * 不摘的话它会漏进端点与语义行——`home.update` 的 `changedKeys()` 是通用 diff，用户真写了
 * 名叫 traceId 的字段时，语义字段 `changed` 会凭空多一项（污染日志语义）。
 * 非对象载荷 / 无键 / 非字符串 ⇒ traceId 为空串（`withRpcLog` 据此不加字段），载荷原样透传。
 * **只对业务端点摘**：日志电话的入参是包自己的语义面（`logQuery` 的 `traceId` 是过滤条件），
 * 由调用点按电话注册表放行原样透传。 */
function takeTraceId(payload: unknown): { traceId: string; payload: unknown } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { traceId: '', payload }
  const rec = payload as Record<string, unknown>
  if (!Object.hasOwn(rec, 'traceId')) return { traceId: '', payload }
  const { traceId: raw, ...rest } = rec
  return { traceId: typeof raw === 'string' ? raw : '', payload: rest }
}

export function apply(ctx: any, config: any = {}) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : (ctx?.logger ?? console)
  const dshHome = String(config.dshHome ?? process.env.DSH_HOME ?? path.join(homedir(), '.dsh'))
  const configDir = configDirFor(dshHome)
  /* T12 #129 首次启动迁移：homes.json / meta.json → 同名 .yaml（幂等，旧文件留一份 .bak）。
   * 与建日志库是两件互不依赖的异步事：读路径对旧 .json 有诚实回落 ⇒ 这里 fire-and-forget，
   * 迁移结果等日志句柄就绪后补记（resident，出问题只看磁盘日志即可判定）。 */
  const migration = migrateConfigToYaml(configDir).catch(() => [])
  const store = new AgentMetaStore(path.join(configDir, 'meta.yaml'))
  void store.load()

  // 更新系统接线（T7 #90 → T5 M5 起无定时器）：`update` 是**提供函数**，让位分支上它一直是 null ⇒
  // 那个实例不建更新能力、不碰宿主存储（票面 §F.2）。这里只交出函数，实现等让位分支过了才建。
  let update: ReturnType<typeof createUpdateHostBridge> | null = null
  /* 日志（T9 #123）同样取成提供函数：让位分支上不建库——同一日志目录不许出现第二个活跃写者。
   * 电话注册表先建好（handler 按名字查表），实现等让位分支过了再填。 */
  let hostLog: HostLogHandle | null = null
  const logPhones: LogPhoneRegistry = new Map()
  const handler = createAgentFleetHandler(store, { update: () => update, log: () => hostLog, logPhones })
  const reply = (rpcId: string, result: unknown): Response =>
    Response.json({ type: 'server-response', rpcId, result })
  try {
    const dispose = ctx.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request: Request): Promise<Response> {
        // 宿主分发器今天只在 methods 命中时才把请求送到本 handler（GET 等落到 /api 拦截器 → 404）；
        // 保留自查是为了让 handler 语义自洽、不依赖宿主的派发实现（断言见 tools/verify/host-entry.ts）。
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
        let message: any
        try { message = await request.json() } catch { return new Response('body is not JSON', { status: 400 }) }
        const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
        const call = message?.payload
        if (message?.type !== 'client-request' || typeof message.rpcId !== 'string'
          || message.method !== ENDPOINT || !call || typeof call.method !== 'string'
          || !Object.hasOwn(call, 'payload')) {
          return reply(rpcId, { ok: false, error: { code: 'gateway/bad-request', message: 'Invalid companion request.', details: {} } })
        }
        /* #125：链 id 走独立实参（payload 里的那份已摘掉）——业务端点入参面与今天逐字节一致。
         * 日志电话例外：电话入参是包自己的语义面（`logQuery` 的 `traceId` 是过滤条件）⇒ 原样透传、不摘键，
         * 也不给它的日志行带链（电话调用不是业务动作）。注册表在建库后才填：那段窗口内按业务端点处理，
         * 只影响「摘掉一把电话自己会忽略的键」，不会改电话行为。 */
        const phoneCall = logPhones.has(call.method)
        const taken = phoneCall ? { traceId: '', payload: call.payload } : takeTraceId(call.payload)
        try { return reply(rpcId, await handler(call.method, taken.payload, request.signal, taken.traceId)) }
        catch { return new Response('companion handler failed', { status: 500 }) }
      },
    })
    ctx.effect(() => () => dispose(), 'dsh-im-companion: fetch route cleanup')
  } catch (error: any) {
    // 路由注册表是宿主共享单例；重装配（live patch reload / 回滚重放）时同一路由可能已被上一个实例注册。
    // 宿主原话：`connection: exact Fetch route "/api/im-companion" is already registered`
    // （@deepseek-ai/dsh-client-connection/lib/index.js registerFetchRoute）。
    // 退让：让已注册实例继续服务，本实例只挂元数据，不再注册；未注册路由时不挂 cleanup。
    if (/already registered/.test(String(error?.message ?? error))) {
      logger.warn?.('[agent-fleet] route ' + ROUTE_PATH + ' already registered by another instance; yielding')
      return
    }
    throw error
  }

  /* #126：预检判定可能早于建库落地（createHostLogFor 是异步的）⇒ 先缓存，库就绪后补记。 */
  let pendingPrecheck: InstallVerdict | null = null

  // 让位分支之后才建日志：落点 <DSH_HOME>/logs/dsh-im-companion/（生态惯例），失败降级为 no-op。
  // 装配本身保持**同步**（宿主不提供 fetch.register 时必须当场抛——回归钉见 tools/verify/host-entry.ts），
  // 故这里不 await：建库要 mkdir + 读回开关；完成后才填电话注册表并补记启动行（客户端首批约 1s 后到，够快）。
  void createHostLogFor(dshHome)
    .then((handle) => {
      if (!handle) return
      hostLog = handle
      handle.registerPhones(logPhones)
      /* #130：构建身份进启动行——`import.meta.url` ＝运行中的本产物（lib/index.js）⇒ 读回它的 mtime 与包版本。
       * 一份日志据此自证「出自哪一版」，不再依赖事后 stat 库内文件（产物会被并发会话覆写）。 */
      handle.log('info', 'host.start', { route: ROUTE_PATH, dshHome, build: hostBuildId(import.meta.url) })
      handle.log('info', 'host.log.init', { dir: handle.dir, ok: true, reason: '' })
      handle.log('info', 'host.ready', { route: ROUTE_PATH })
      /* T12 #129：迁移结果补记（`no-json` 是「本来就没旧文件」的常态，不留噪音；跃迁与异常必落盘）。 */
      void migration.then((rows) => {
        for (const r of rows) {
          if (!r.migrated && r.reason === 'no-json') continue
          handle.log('info', 'config.migrate', {
            dir: configDir, from: r.name + '.json', to: r.name + '.yaml', ok: r.migrated,
            message: r.reason + (r.backup ? ' backup=' + r.backup : ''),
          })
        }
      })
      /* #126 预检若早于建库落地，判定先缓存、这里补记（绝不静默丢行）。 */
      if (pendingPrecheck) { logPrecheck(handle, pendingPrecheck); pendingPrecheck = null }
    })
    .catch(() => { /* createHostLogFor 内部已吞错：日志绝不拖垮装配 */ })
  update = createUpdateHostBridge({
    ctx,
    logger,
    dshHome,
    /* 更新包的事件口 `fire(level,event,fields)` 直落本仓日志：更新包的关键处自动有据可查。 */
    logCtx: {
      fire: (level, event, fields) => hostLog?.log(
        level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug',
        'host.update.tap',
        { level, event, detail: JSON.stringify(fields ?? {}) },
      ),
    },
    /* #126 只读预检：开发态 Junction／越界实装 ⇒ 更新中心必回 unknown-profile（预期而非缺陷）。
     * 只多留一行 resident 判定，失败本身仍走 host.rpc.fail 原样透传。
     * 建库异步（上面 createHostLogFor 才落地）⇒ 判定先缓存、库就绪后补记，绝不静默丢。 */
    onPrecheck: (v) => {
      if (hostLog) logPrecheck(hostLog, v)
      else pendingPrecheck = v
    },
  })

  try {
    ctx.provide?.('agentFleet', { version: '0.0.2', meta: store })
  } catch {
    /* 服务已被占用时跳过 */
  }
  logger.info?.('[agent-fleet] host ready, fetch route ' + ROUTE_PATH)
}
