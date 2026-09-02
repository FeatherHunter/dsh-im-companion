/**
 * @dsh-external/dsh-agent-fleet — client 面板（conversation.view slot）。
 * 构建：npm run build:client（tsdown，产物 lib/client.js，ModuleLoader.load 注册）。
 * ⚠️ 两个必坑（2026-08 实测）：① apply 用 ctx.slots 必须 export const inject
 * = ['slots']（服务注入声明）；② register 必须带 name 字段（= slot 名，
 * 如 conversation.view）——缺 name 报 "slot undefined is not declared"。
 */
import type { SlotsService } from '@deepseek-ai/dsh-client-ui-slots'

type ClientContext = {
  slots: SlotsService
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: '@dsh-external/dsh-agent-fleet-panel',
      label: () => "@dsh-external/dsh-agent-fleet",
      component: () => ({
        render() {
          const el = document.createElement('div')
          el.textContent = "@dsh-external/dsh-agent-fleet" + ' 面板（host API: /@dsh-external/dsh-agent-fleet/api）'
          el.style.padding = '12px'
          el.style.fontFamily = 'monospace'
          return el
        },
      }),
    }),
  ), '@dsh-external/dsh-agent-fleet: panel')
}
