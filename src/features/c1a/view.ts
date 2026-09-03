/** C1a 抽屉视图层：A' 纯渲染（无 RPC、无订阅，dom-shim 可测）。
 * 预设下拉读动态目录＋跟随默认；上下文双开关（群/私聊各一）；fields/guidance 只读展示。 */
import { h } from '../../client/dom'
import { makeButton } from '../../client/ui/button'
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import { channelGlyphSvg } from '../../client/icons'
import { PRESET_FOLLOW, PRESET_MIXED, type DrawerChannel, type DrawerModel } from './data'

/** 加载态静默回调：除关闭外全是空操作（数据到之前误点不写坏任何东西）。 */
export function quietCallbacks(onClose: () => void): DrawerCallbacks {
  return {
    onPreset: () => undefined,
    onToggleGroup: () => undefined,
    onToggleDirect: () => undefined,
    onSaveWorkspace: () => undefined,
    onBrowseWorkspace: () => undefined,
    onDraftWorkspace: () => undefined,
    onRemoveBot: () => undefined,
    onTestSend: () => undefined,
    onClose,
  }
}

export interface DrawerCallbacks {
  onPreset(id: string): void
  onToggleGroup(channel: string, botId: string): void
  onToggleDirect(channel: string, botId: string): void
  onSaveWorkspace(path: string): void
  onBrowseWorkspace(): void
  onDraftWorkspace(draft: string): void
  onRemoveBot(channel: string, botId: string): void
  onTestSend(): void
  onClose(): void
}

function presetSelect(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sel = h('select', {
    title: model.presetReady ? '沟通模式（写入真系统，新会话生效）' : '预设真值尚未读到，只读展示',
    'aria-label': '沟通模式',
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

function miniSwitch(label: string, on: boolean, ready: boolean, title: string, onFlip: () => void): HTMLElement {
  const btn = makeButton({
    kind: 'ghost', size: 'sm', label: on ? '开' : '关', title,
    onClick: () => { if (ready) onFlip() },
  })
  btn.setAttribute('role', 'switch')
  btn.setAttribute('aria-checked', on ? 'true' : 'false')
  if (!ready) btn.setAttribute('disabled', 'true')
  return h('span', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, label), btn)
}

/** 上下文增强分渠道卡：每渠道独立开关＋自家字段/引导语只读；该渠道未读到行禁用（防盲写）。 */
function ctxSection(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sec = h('details', { className: 'c1a-sec', open: true })
  sec.appendChild(h('summary', null, '上下文增强（分渠道）'))
  if (!model.channels.length) {
    sec.appendChild(h('div', { className: 'c1a-empty' }, '尚未接入渠道。'))
    return sec
  }
  for (const ch of model.channels) {
    const ready = ch.ctx !== undefined
    const cur = ch.ctx ?? null
    const card = h('div', { className: 'c1a-chctx' })
    const head = h('div', { className: 'c1a-chrow' })
    const logo = channelGlyphSvg(ch.id, 16)
    head.appendChild(logo
      ? h('span', { className: 'c1a-chlogo', html: logo })
      : h('span', { className: 'c1a-chlogo c1a-chbadge', title: ch.label }, ch.label.charAt(0) || '?'))
    head.appendChild(h('span', null, ch.label))
    card.appendChild(head)
    card.appendChild(miniSwitch('群', cur?.groupEnabled === true, ready,
      ready ? '群聊增强（只写本渠道，即时生效）' : '本渠道真值尚未读到，禁用写',
      () => cbs.onToggleGroup(ch.id, ch.botId)))
    card.appendChild(miniSwitch('私', cur?.directEnabled === true, ready,
      ready ? '私聊增强（只写本渠道，即时生效）' : '本渠道真值尚未读到，禁用写',
      () => cbs.onToggleDirect(ch.id, ch.botId)))
    card.appendChild(h('div', { className: 'c1a-meta' },
      '字段：' + (cur && cur.fields.length ? cur.fields.join('、') : '未设置')))
    const g = (cur?.guidance ?? '').trim()
    card.appendChild(h('div', { className: 'c1a-note' },
      g ? (g.length > 120 ? g.slice(0, 120) + '…' : g) : '无引导语'))
    sec.appendChild(card)
  }
  sec.appendChild(h('div', { className: 'c1a-meta' },
    '打开后 AI 能看到消息哪来的（哪个群/谁发的）；字段与引导语请去 dsh-im 上游改。'))
  return sec
}

function workspaceSection(model: DrawerModel, draft: string | null, cbs: DrawerCallbacks): HTMLElement {
  const sec = h('details', { className: 'c1a-sec', open: true })
  sec.appendChild(h('summary', null, '绑定工作区'))
  sec.appendChild(h('div', { className: 'c1a-ws' }, model.workspace || '未绑定工作区'))
  const input = h('input', { type: 'text', value: draft ?? model.workspace, placeholder: '工作区绝对路径', 'aria-label': '工作区路径' }) as HTMLInputElement
  input.addEventListener('change', () => cbs.onDraftWorkspace(input.value))
  const browse = makeButton({
    kind: 'tinted', size: 'sm', iconName: 'folder', label: '浏览', title: '打开文件夹浏览器选择',
    onClick: () => cbs.onBrowseWorkspace(),
  })
  const save = makeButton({
    kind: 'primary', size: 'sm', label: '保存路径', title: '写入全部已绑机器人',
    onClick: () => cbs.onSaveWorkspace(input.value),
  })
  sec.appendChild(h('div', { className: 'c1a-fld' }, input, browse, save))
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
    const logo = channelGlyphSvg(ch.id, 16)
    row.appendChild(logo
      ? h('span', { className: 'c1a-chlogo', html: logo })
      : h('span', { className: 'c1a-chlogo c1a-chbadge', title: label }, label.charAt(0) || '?'))
    row.appendChild(h('span', { title: label + '·' + health + '·' + ch.botId }, label))
    const btn = makeButton({
      kind: 'ghost', size: 'sm', iconName: 'trash', label: '解绑', title: '移除该渠道机器人（需二次确认）',
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
export function renderDrawerContent(model: DrawerModel, cbs: DrawerCallbacks, draftWs: string | null = null, sendTarget: string | null = null): HTMLElement {
  const closeBtn = makeButton({ kind: 'ghost', size: 'sm', label: '关闭', title: '关闭抽屉', onClick: () => cbs.onClose() })
  const head = h('div', { className: 'c1a-dhead' },
    h('span', { className: 'c1a-dot ' + model.status }),
    h('span', null, model.name + '·详情'),
    h('span', { style: { marginLeft: 'auto' } }, closeBtn))
  const sum = h('div', { className: 'c1a-summary' })
  sum.appendChild(h('div', { className: 'c1a-meta' }, '摘要（写入真系统，新会话生效）'))
  sum.appendChild(h('div', { className: 'c1a-fld' }, h('span', { className: 'c1a-lab' }, '模式'), presetSelect(model, cbs)))
  sum.appendChild(h('div', { className: 'c1a-meta' }, '沟通模式：DSH 用哪种方式回话（PTC/标准/创造…），不是角色性格'))
  sum.appendChild(h('div', { className: 'c1a-meta' }, '路由 ' + model.routes.length + ' 条·渠道 ' + model.channels.length + ' 个·' + model.statusLabel))
  const body = h('div', { className: 'c1a-dbody' }, sum, ctxSection(model, cbs), workspaceSection(model, draftWs, cbs), routesSection(model), channelsSection(model, cbs))
  const sendLabel = sendTarget ? '发测试消息（→' + sendTarget + '）' : '发测试消息'
  body.appendChild(h('div', { className: 'c1a-foot' },
    makeButton({
      kind: 'primary', size: 'sm', label: sendLabel,
      title: sendTarget ? '经已保存目标发送到' + sendTarget + '（与 B3 同语义）' : '尚无可发送目标：先绑定在线机器人',
      onClick: () => cbs.onTestSend(),
    })))
  return h('div', { className: 'c1a-drawer' }, head, body)
}
