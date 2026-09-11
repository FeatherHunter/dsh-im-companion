/** dsh-im-companion host 后端：元数据持久化 + 自有桥（client 经 DSH 公开 /api 载体调用，见 ADR-0002）。 */
import { homedir } from 'node:os'
import path from 'node:path'
import { AgentMetaStore } from './host/meta-store.js'
import { createAgentFleetHandler } from './host/rpc.js'

export const name = 'dsh-im-companion'
// 载体：DSH 公开的 /api（connection.fetch.register），故 inject 只需 connection。
// 旧写法 ctx.connection.rpc.handle() 会以 connection 服务自身的 Context 去调 webServer.register(...)
// 注册前缀路由，而那个 Context 没有 webServer 注入 → 装配期必抛 cannot get property "webServer" without inject；
// 实测：给本插件加 webServer 声明【无效】，抛错的 Context 不是本插件的 ctx。修法与证据见 docs/adr/0002。
export const inject = ['connection']

/** 自有桥端点名（信封 method 字段）与它在 /api 载体上的路径：单点定义，避免两处字面量漂移。 */
const ENDPOINT = 'im-companion'
const ROUTE_PATH = '/api/' + ENDPOINT

export function apply(ctx: any, config: any = {}) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : (ctx?.logger ?? console)
  const dshHome = String(config.dshHome ?? process.env.DSH_HOME ?? path.join(homedir(), '.dsh'))
  const store = new AgentMetaStore(path.join(dshHome, 'integrations', 'dsh-im-companion', 'meta.json'))
  void store.load()

  const handler = createAgentFleetHandler(store)
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
        try { return reply(rpcId, await handler(call.method, call.payload, request.signal)) }
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

  try {
    ctx.provide?.('agentFleet', { version: '0.0.2', meta: store })
  } catch {
    /* 服务已被占用时跳过 */
  }
  logger.info?.('[agent-fleet] host ready, fetch route ' + ROUTE_PATH)
}
