/** C1a 抽屉视图层：A' 纯渲染（无 RPC、无订阅，dom-shim 可测）。
 * 预设下拉读动态目录＋跟随默认；上下文双开关（群/私聊各一）；fields/guidance 只读展示。 */
import { h } from '../../client/dom'
import { makeButton } from '../../client/ui/button'
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import { PRESET_FOLLOW, PRESET_MIXED, type DrawerModel } from './data'

/** 加载态静默回调：除关闭外全是空操作（数据到之前误点不写坏任何东西）。 */
export function quietCallbacks(onClose: () => void): DrawerCallbacks {
  return {
    onPreset: () => undefined,
    onToggleGroup: () => undefined,
    onToggleDirect: () => undefined,
    onSaveWorkspace: () => undefined,
    onRemoveBot: () => undefined,
    onTestSend: () => undefined,
    onClose,
  }
}

export interface DrawerCallbacks {
  onPreset(id: string): void
  onToggleGroup(): void
  onToggleDirect(): void
  onSaveWorkspace(path: string): void
  onRemoveBot(channel: string, botId: string): void
  onTestSend(): void
  onClose(): void
}

function presetSelect(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sel = h('select', {
    title: model.presetReady ? '身份预设（写入真系统，新会话生效）' : '预设真值尚未读到，只读展示',
    'aria-label': '身份预设',
    disabled: !model.presetReady,
    onChange: () => cbs.onPreset((sel as HTMLSelectElement).value),
  }) as HTMLSelectElement
  if (model.preset === PRESET_MIXED) {
    sel.appendChild(h('option', { value: PRESET_MIXED, selected: true }, '多渠道不一致…'))
  }
  const dflt = model.presetCatalog.defaultId
  sel.appendChild(h('option', { value: PRESET_FOLLOW, selected: model.preset === PRESET_FOLLOW },
    dflt ? '跟随默认（' + dflt + '）' : '跟随默认'))
  for (const o of model.presetCatalog.items) {
    sel.appendChild(h('option', { value: o.id, selected: model.preset === o.id }, o.label))
  }
  if (!model.presetReady) sel.title = '预设真值尚未读到，稍后重试'
  return sel
}

function ctxSwitch(label: string, value: boolean | null, ready: boolean, onFlip: () => void): HTMLElement {
  const btn = makeButton({
    kind: 'ghost', size: 'sm',
    label: value === true ? '开' : value === false ? '关' : '…',
    title: !ready ? '真值尚未读到，禁用写（防覆盖已有配置）'
      : value === null ? label + '各渠道不一致，点按统一打开' : label + '开关（写入真系统即时生效）',
    onClick: () => { if (ready) onFlip() },
  })
  btn.setAttribute('role', 'switch')
  btn.setAttribute('aria-checked', value === true ? 'true' : 'false')
  if (!ready) btn.setAttribute('disabled', 'true')
  return h('span', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, label), btn)
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

function ctxReadonly(model: DrawerModel): HTMLElement {
  const sec = h('details', { className: 'c1a-sec' })
  sec.appendChild(h('summary', null, '上下文来源与引导语（只读）'))
  const fields = model.ctxFields.length ? model.ctxFields.join('、') : '未设置'
  sec.appendChild(h('div', { className: 'c1a-meta' }, '字段：' + fields))
  const g = model.ctxGuidance.trim()
  sec.appendChild(h('div', { className: 'c1a-note' }, g ? (g.length > 120 ? g.slice(0, 120) + '…' : g) : '无引导语'))
  sec.appendChild(h('div', { className: 'c1a-meta' }, '如需修改字段或引导语，请去 dsh-im 上游改，抽屉只动开关。'))
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
    row.appendChild(h('span', { title: label + '·' + health + '·' + ch.botId }, label))
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
    h('span', null, model.name + '·详情'),
    h('span', { style: { marginLeft: 'auto' } }, closeBtn))
  const sum = h('div', { className: 'c1a-summary' })
  sum.appendChild(h('div', { className: 'c1a-meta' }, '摘要（写入真系统，新会话生效）'))
  sum.appendChild(h('div', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, '预设'), presetSelect(model, cbs)))
  sum.appendChild(ctxSwitch('群聊增强', model.ctxGroup, model.ctxReady, () => cbs.onToggleGroup()))
  sum.appendChild(ctxSwitch('私聊增强', model.ctxDirect, model.ctxReady, () => cbs.onToggleDirect()))
  sum.appendChild(h('div', { className: 'c1a-meta' }, '路由 ' + model.routes.length + ' 条·渠道 ' + model.channels.length + ' 个·' + model.statusLabel))
  const body = h('div', { className: 'c1a-dbody' }, sum, ctxReadonly(model), workspaceSection(model, cbs), routesSection(model), channelsSection(model, cbs))
  body.appendChild(h('div', { className: 'c1a-foot' },
    makeButton({ kind: 'primary', size: 'sm', label: '发测试消息', title: '经已保存目标发送（与 B3 同语义）', onClick: () => cbs.onTestSend() })))
  return h('div', { className: 'c1a-drawer' }, head, body)
}
