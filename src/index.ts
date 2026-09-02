export const name = "dsh-im-companion"
export const inject = []

export function apply(ctx: any, config: any = {}) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : (ctx?.logger ?? console)
  logger.info?.('[agent-fleet] host 启动（解耦伴生，不触碰 dsh-im）')
  ctx.effect(() => {
    if (typeof ctx.provide === 'function') {
      try {
        ctx.provide('agentFleet', {
          version: '0.0.1',
          note: 'dsh-im 解耦伴生，10合1IM机器人辅助 host 已就绪',
          async listMock() {
            return { ok: true, agents: ['小帅','星火','小孙'] }
          }
        })
      } catch {}
    }
    return () => {}
  }, 'agent-fleet: host service')
  logger.info?.('[agent-fleet] host apply 完成，等待 client UI 试验')
}
