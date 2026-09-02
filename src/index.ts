/** dsh-im-companion host 后端：元数据持久化 + /im-companion RPC 桥（client 经 ctx.connection.rpc 调用）。 */
import { homedir } from 'node:os'
import path from 'node:path'
import { AgentMetaStore } from './host/meta-store.js'
import { createAgentFleetHandler } from './host/rpc.js'

export const name = 'dsh-im-companion'
export const inject = ['connection']

export function apply(ctx: any, config: any = {}) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : (ctx?.logger ?? console)
  const dshHome = String(config.dshHome ?? process.env.DSH_HOME ?? path.join(homedir(), '.dsh'))
  const store = new AgentMetaStore(path.join(dshHome, 'integrations', 'dsh-im-companion', 'meta.json'))
  void store.load()

  const CHANNEL = '/im-companion'
  const dispose = ctx.connection.rpc.handle(CHANNEL, createAgentFleetHandler(store))
  ctx.effect(() => () => dispose(), 'dsh-im-companion: rpc channel cleanup')

  try {
    ctx.provide?.('agentFleet', { version: '0.0.2', meta: store })
  } catch {
    /* 服务已被占用时跳过 */
  }
  logger.info?.('[agent-fleet] host ready, rpc channel ' + CHANNEL)
}
