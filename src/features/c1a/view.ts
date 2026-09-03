/** C1a 抽屉视图层：B 变体纯渲染（无 RPC、无订阅，dom-shim 可测）。 */
import { h } from '../../client/dom'
import { makeButton } from '../../client/ui/button'
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import { CTX_LEVELS, PRESET_OPTIONS, type DrawerModel } from './data'

/** 加载态静默回调：除关闭外全是空操作（数据到之前误点不写坏任何东西）。 */
export function quietCallbacks(onClose: () => void): DrawerCallbacks {
  return {
    onPreset: () => undefined,
    onCustomName: () => undefined,
    onToggleCtx: () => undefined,
    onLevel: () => undefined,
    onSaveWorkspace: () => undefined,
    onRemoveBot: () => undefined,
    onTestSend: () => undefined,
    onClose,
  }
}

export interface DrawerCallbacks {
  onPreset(id: string): void
  onCustomName(name: string): void
  onToggleCtx(): void
  onLevel(lv: string): void
  onSaveWorkspace(path: string): void
  onRemoveBot(channel: string, botId: string): void
  onTestSend(): void
  onClose(): void
}

function presetSelect(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sel = h('select', {
    title: '身份预设（改动即时保存）',
    'aria-label': '身份预设',
    onChange: () => cbs.onPreset((sel as HTMLSelectElement).value),
  })
  for (const o of PRESET_OPTIONS) {
    sel.appendChild(h('option', { value: o.id, selected: model.preset === o.id }, o.label))
  }
  return sel
}

function ctxControls(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement[] {
  const toggle = makeButton({
    kind: 'ghost', size: 'sm',
    label: model.ctx.enabled ? '开' : '关',
    title: '上下文增强开关（改动即时保存）',
    onClick: () => cbs.onToggleCtx(),
  })
  toggle.setAttribute('role', 'switch')
  toggle.setAttribute('aria-checked', model.ctx.enabled ? 'true' : 'false')
  const seg = h('span', { className: 'c1a-seg' })
  for (const lv of CTX_LEVELS) {
    seg.appendChild(h('button', {
      type: 'button',
      className: lv.id === model.ctx.level ? 'c1a-on' : undefined,
      onClick: () => cbs.onLevel(lv.id),
    }, lv.label))
  }
  return [toggle, seg]
}

function workspaceSection(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sec = h('details', { className: 'c1a-sec', open: true })
  sec.appendChild(h('summary', null, '绑定工作区'))
  sec.appendChild(h('div', { className: 'c1a-ws' }, model.workspace || '未绑定工作区'))
  const input = h('input', { type: 'text', value: model.workspace, placeholder: '工作区绝对路径', 'aria-label': '工作区路径' }) as HTMLInputElement
  const save = makeButton({
    kind: 'tinted', size: 'sm', label: '保存路径', title: '写入全部已绑机器人',
    onClick: () => cbs.onSaveWorkspace(input.value),
  })
  sec.appendChild(h('div', { className: 'c1a-fld' }, input, save))
  return sec
}

function routesSection(model: DrawerModel): HTMLElement {
  const sec = h('details', { className: 'c1a-sec' })
  sec.appendChild(h('summary', null, '会话路由摘要（' + model.routes.length + '）'))
  if (!model.routes.length) {
    sec.appendChild(h('div', { className: 'c1a-empty' }, '会话路由预览随 E3（#14）落地，席位已留。'))
    return sec
  }
  for (const r of model.routes) {
    const row = h('div', { className: 'c1a-route' })
    row.appendChild(h('span', null, r.chat))
    row.appendChild(h('code', null, '→ ' + r.sessionId))
    sec.appendChild(row)
  }
  return sec
}

function channelsSection(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sec = h('details', { className: 'c1a-sec' })
  sec.appendChild(h('summary', null, '渠道管理（' + model.channels.length + '）'))
  if (!model.channels.length) {
    sec.appendChild(h('div', { className: 'c1a-empty' }, '尚未接入渠道，用行内接入添加。'))
    return sec
  }
  for (const ch of model.channels) {
    const row = h('div', { className: 'c1a-chrow' })
    row.appendChild(h('span', { className: 'c1a-dot ' + ch.status }))
    const label = channelLabel(ch.id)
    const health = HEALTH_LABELS[ch.status] ?? ch.status
    row.appendChild(h('span', { title: label + ' · ' + health + ' · ' + ch.botId }, label))
    const btn = makeButton({
      kind: 'ghost', size: 'sm', label: '解绑', title: '移除该渠道机器人（需二次确认）',
      onClick: () => {
        if (btn.dataset.armed !== '1') {
          btn.dataset.armed = '1'
          btn.textContent = '确认解绑？'
          return
        }
        cbs.onRemoveBot(ch.id, ch.botId)
      },
    })
    row.appendChild(h('span', { style: { marginLeft: 'auto' } }, btn))
    sec.appendChild(row)
  }
  return sec
}

/** 纯渲染（dom-shim 可测）：模型 + 回调 → 抽屉体。 */
export function renderDrawerContent(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const closeBtn = makeButton({ kind: 'ghost', size: 'sm', label: '关闭', title: '关闭抽屉', onClick: () => cbs.onClose() })
  const head = h('div', { className: 'c1a-dhead' },
    h('span', { className: 'c1a-dot ' + model.status }),
    h('span', null, model.name + ' · 详情'),
    h('span', { style: { marginLeft: 'auto' } }, closeBtn))
  const sum = h('div', { className: 'c1a-summary' })
  sum.appendChild(h('div', { className: 'c1a-meta' }, '摘要（改动即时保存）'))
  sum.appendChild(h('div', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, '预设'), presetSelect(model, cbs)))
  if (model.preset === 'custom') {
    const custom = h('input', { type: 'text', value: model.customName, placeholder: '自定义预设名', 'aria-label': '自定义预设名' }) as HTMLInputElement
    custom.addEventListener('change', () => cbs.onCustomName(custom.value))
    sum.appendChild(h('div', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, '自定'), custom))
  }
  sum.appendChild(h('div', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, '上下文'), ...ctxControls(model, cbs)))
  sum.appendChild(h('div', { className: 'c1a-meta' }, '路由 ' + model.routes.length + ' 条 · 渠道 ' + model.channels.length + ' 个 · ' + model.statusLabel))
  const body = h('div', { className: 'c1a-dbody' }, sum, workspaceSection(model, cbs), routesSection(model), channelsSection(model, cbs))
  body.appendChild(h('div', { className: 'c1a-foot' },
    makeButton({ kind: 'primary', size: 'sm', label: '发测试消息', title: '经已保存目标发送（与 B3 同语义）', onClick: () => cbs.onTestSend() })))
  return h('div', { className: 'c1a-drawer' }, head, body)
}
