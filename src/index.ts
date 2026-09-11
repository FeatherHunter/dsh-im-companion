/** dsh-im-companion host 后端：元数据持久化 + /im-companion RPC 桥（client 经 ctx.connection.rpc 调用）。 */
import { homedir } from 'node:os'
import path from 'node:path'
import { AgentMetaStore } from './host/meta-store.js'
import { createAgentFleetHandler } from './host/rpc.js'

export const name = 'dsh-im-companion'
// #80：迁移到 DSH 公开的 /api 载体后，不再需要 webServer。
// 旧写法 ctx.connection.rpc.handle() 会以 connection 服务自身的 Context 去调
// webServer.register(...) 注册前缀路由，而那个 Context 没有 webServer 注入 → 装配期必抛
// cannot get property "webServer" without inject。
// 实测：给本插件加 webServer 声明【无效】—— 抛错的 Context 不是本插件的 ctx。
// 新入口与 @xmanrui/dsh-im 的 plugin-src/management-rpc.mjs 同构（上游 503a24a 的改道）。
export const inject = ['connection']

export function apply(ctx: any, config: any = {}) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : (ctx?.logger ?? console)
  const dshHome = String(config.dshHome ?? process.env.DSH_HOME ?? path.join(homedir(), '.dsh'))
  const store = new AgentMetaStore(path.join(dshHome, 'integrations', 'dsh-im-companion', 'meta.json'))
  void store.load()

  const CHANNEL = '/im-companion'
  const handler = createAgentFleetHandler(store)
  const reply = (rpcId: string, result: unknown): Response =>
    Response.json({ type: 'server-response', rpcId, result })
  try {
    const dispose = ctx.connection.fetch.register({
      path: '/api/im-companion',
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request: Request): Promise<Response> {
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
        let message: any
        try { message = await request.json() } catch { return new Response('body is not JSON', { status: 400 }) }
        const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
        const call = message?.payload
        if (message?.type !== 'client-request' || typeof message.rpcId !== 'string'
          || message.method !== 'im-companion' || !call || typeof call.method !== 'string'
          || !Object.hasOwn(call, 'payload')) {
          return reply(rpcId, { ok: false, error: { code: 'gateway/bad-request', message: 'Invalid companion request.', details: {} } })
        }
        try { return reply(rpcId, await handler(call.method, call.payload, request.signal)) }
        catch { return new Response('companion handler failed', { status: 500 }) }
      },
    })
    ctx.effect(() => () => dispose(), 'dsh-im-companion: fetch route cleanup')
  } catch (error: any) {
    // 路由注册表是宿主共享单例；重装配（live patch reload / 回滚重放）时
    // 同一路由可能已被上一个实例注册。此时退让：让已注册实例继续
    // 服务，本实例只挂元数据，不再注册。未注册路由时不挂 cleanup。
    if (/(duplicate prefix route|already registered)/.test(String(error?.message ?? error))) {
      logger.warn?.('[agent-fleet] rpc channel ' + CHANNEL + ' already registered by another instance; yielding')
      return
    }
    throw error
  }

  try {
    ctx.provide?.('agentFleet', { version: '0.0.2', meta: store })
  } catch {
    /* 服务已被占用时跳过 */
  }
  logger.info?.('[agent-fleet] host ready, rpc channel ' + CHANNEL)
}
