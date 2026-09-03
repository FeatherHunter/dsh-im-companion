/** C1a 抽屉视图层：A' 纯渲染（无 RPC、无订阅，dom-shim 可测）。
 * 预设下拉读动态目录＋跟随默认；上下文双开关（群/私聊各一）；fields/guidance 只读展示。 */
import { h } from '../../client/dom'
import { makeButton } from '../../client/ui/button'
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import { channelGlyphSvg } from '../../client/icons'
import { PRESET_FOLLOW, PRESET_MIXED, personalityPrefill, type DrawerChannel, type DrawerModel } from './data'

/** 加载态静默回调：除关闭外全是空操作（数据到之前误点不写坏任何东西）。 */
export function quietCallbacks(onClose: () => void): DrawerCallbacks {
  return {
    onPreset: () => undefined,
    onToggleGroup: () => undefined,
    onToggleDirect: () => undefined,
    onSaveWorkspace: () => undefined,
    onBrowseWorkspace: () => undefined,
    onDraftWorkspace: () => undefined,
    onApplyPersonality: () => undefined,
    onDraftPersonality: () => undefined,
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
  onApplyPersonality(text: string): void
  onDraftPersonality(draft: string): void
  onRemoveBot(channel: string, botId: string): void
  onTestSend(channel: string, botId: string): void
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
    sel.appendChild(h('option', { value: PRESET_MIXED, selected: true }, '多渠道不一致，请选择具体预设'))
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

/** B 方向原语：小节 caption＋列表卡＋行（左文右控件）＋胶囊开关。 */
function caption(text: string): HTMLElement {
  return h('div', { className: 'c1a-cap' }, text)
}

function listRow(label: string, control: HTMLElement, title?: string): HTMLElement {
  const row = h('div', { className: 'c1a-row' })
  row.appendChild(h('span', { className: 'c1a-lab' }, label))
  const right = h('span', { className: 'c1a-rval' })
  right.appendChild(control)
  row.appendChild(right)
  if (title) row.setAttribute('title', title)
  return row
}

function pillSwitch(label: string, on: boolean, ready: boolean, title: string, onFlip: () => void): HTMLElement {
  const btn = h('button', { type: 'button', className: 'c1a-sw', role: 'switch', title }) as HTMLButtonElement
  btn.setAttribute('aria-checked', on ? 'true' : 'false')
  if (!ready) btn.setAttribute('disabled', 'true')
  btn.addEventListener('click', () => { if (ready) onFlip() })
  const wrap = h('span', { className: 'c1a-rval' })
  wrap.appendChild(btn)
  wrap.appendChild(h('b', null, on ? '开' : '关'))
  const row = h('div', { className: 'c1a-row' })
  row.appendChild(h('span', { className: 'c1a-lab' }, label))
  row.appendChild(wrap)
  return row
}

/** 上下文增强分渠道（B 列表风）：每渠道 caption＋列表卡；开关胶囊化，字段/引导语右对齐弱化。 */
function ctxSection(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const frag = h('div', null)
  if (!model.channels.length) {
    frag.appendChild(caption('上下文增强'))
    const empty = h('div', { className: 'c1a-list' })
    empty.appendChild(h('div', { className: 'c1a-empty' }, '尚未接入渠道。'))
    frag.appendChild(empty)
    return frag
  }
  for (const ch of model.channels) {
    const ready = ch.ctx !== undefined
    const cur = ch.ctx ?? null
    frag.appendChild(caption('上下文 · ' + ch.label))
    const card = h('div', { className: 'c1a-list' })
    card.appendChild(pillSwitch('群聊增强', cur?.groupEnabled === true, ready,
      ready ? '群聊增强（只写本渠道，即时生效）' : '本渠道真值尚未读到，禁用写',
      () => cbs.onToggleGroup(ch.id, ch.botId)))
    card.appendChild(pillSwitch('私聊增强', cur?.directEnabled === true, ready,
      ready ? '私聊增强（只写本渠道，即时生效）' : '本渠道真值尚未读到，禁用写',
      () => cbs.onToggleDirect(ch.id, ch.botId)))
    const fields = h('span', { style: { fontSize: '12px' } },
      cur && cur.fields.length ? cur.fields.join('、') : '未设置')
    card.appendChild(listRow('字段', fields))
    const g = (cur?.guidance ?? '').trim()
    card.appendChild(h('div', { className: 'c1a-cap' }, '引导语'))
    card.appendChild(h('div', { className: 'c1a-note', title: g || '无引导语' }, g || '无引导语'))
    frag.appendChild(card)
  }
  const note = h('div', { className: 'c1a-meta' }, '打开后 AI 能看到消息哪来的；字段与引导语请去 dsh-im 上游改（或用性格页覆盖）。')
  note.setAttribute('style', 'padding:0 4px')
  frag.appendChild(note)
  return frag
}

function workspaceSection(model: DrawerModel, draft: string | null, cbs: DrawerCallbacks): HTMLElement {
  const frag = h('div', null)
  frag.appendChild(caption('绑定工作区'))
  const card = h('div', { className: 'c1a-list' })
  card.appendChild(h('div', { className: 'c1a-ws' }, model.workspace || '未绑定工作区'))
  const input = h('input', { type: 'text', value: draft ?? model.workspace, placeholder: '工作区绝对路径', 'aria-label': '工作区路径', style: { flex: '1', minWidth: '120px' } }) as HTMLInputElement
  input.addEventListener('change', () => cbs.onDraftWorkspace(input.value))
  const browse = makeButton({
    kind: 'tinted', size: 'sm', iconName: 'folder', label: '浏览', title: '打开文件夹浏览器选择',
    onClick: () => cbs.onBrowseWorkspace(),
  })
  const save = makeButton({
    kind: 'primary', size: 'sm', label: '保存路径', title: '写入全部已绑机器人',
    onClick: () => cbs.onSaveWorkspace(input.value),
  })
  const row = h('div', { className: 'c1a-row' })
  row.appendChild(input)
  row.appendChild(browse)
  row.appendChild(save)
  card.appendChild(row)
  frag.appendChild(card)
  return frag
}

/** 性格/语气：一框写全渠道，应用前二次确认（覆盖各渠道现有引导语，字段开关不动）。 */
function personalitySection(prefill: string, draft: string | null, cbs: DrawerCallbacks): HTMLElement {
  const frag = h('div', null)
  frag.appendChild(caption('性格/语气 · 一框写全渠道'))
  const card = h('div', { className: 'c1a-list c1a-nobox' })
  const area = h('textarea', {
    rows: 4, value: draft ?? prefill,
    placeholder: '比如：说话幽默，像朋友一样；群里严肃、私聊放飞等',
    'aria-label': '性格语气',
  }) as HTMLTextAreaElement
  area.addEventListener('change', () => cbs.onDraftPersonality(area.value))
  const apply = makeButton({
    kind: 'primary', size: 'sm', label: '应用', title: '覆盖全部渠道引导语（字段与开关不动）',
    onClick: () => {
      if (apply.dataset.armed !== '1') {
        apply.dataset.armed = '1'
        apply.textContent = '确认覆盖各渠道引导语？'
        return
      }
      cbs.onApplyPersonality(area.value)
    },
  })
  apply.classList.add('c1a-hero')
  card.appendChild(area)
  card.appendChild(apply)
  frag.appendChild(card)
  frag.appendChild(h('div', { className: 'c1a-meta' }, '应用后覆盖各渠道现有引导语，新会话生效。'))
  return frag
}

function routesSection(model: DrawerModel): HTMLElement {
  const sec = h('details', { className: 'c1a-sec' })
  sec.setAttribute('open', '')
  sec.appendChild(h('summary', null, '会话路由摘要（' + model.routes.length + '）'))
  if (!model.routes.length) {
    sec.appendChild(h('div', { className: 'c1a-empty' }, '暂无已绑定会话映射（只读投影，随轮询刷新）。'))
    return sec
  }
  for (const r of model.routes) {
    const row = h('div', { className: 'c1a-route' + (r.ghost ? ' c1a-ghost' : '') })
    const who = (r.channel ? channelLabel(r.channel) + '·' : '') + r.chat
    row.appendChild(h('span', { className: 'c1a-rchat', title: r.ghost ? '旧 direct: 存量映射，可忽略' : who }, who))
    if (r.ghost) row.appendChild(h('span', { className: 'c1a-meta' }, '旧映射'))
    row.appendChild(h('code', null, '→ ' + r.sessionId))
    const btn = makeButton({
      kind: 'ghost', size: 'sm', label: '复制', title: '复制完整会话标识',
      onClick: () => {
        try {
          const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(s: string): unknown } } }).navigator
          void nav?.clipboard?.writeText(r.sessionId)
          btn.textContent = '已复制'
        } catch {
          /* 剪贴板不可用则静默 */
        }
      },
    })
    row.appendChild(h('span', { className: 'c1a-push' }, btn))
    sec.appendChild(row)
  }
  return sec
}

function channelsSection(model: DrawerModel, cbs: DrawerCallbacks): HTMLElement {
  const sec = h('details', { className: 'c1a-sec' })
  sec.setAttribute('open', '')
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
    const send = makeButton({
      kind: 'tinted', size: 'sm', label: '测试', title: '向本渠道发送测试消息',
      onClick: () => cbs.onTestSend(ch.id, ch.botId),
    })
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
    const tail = h('span', { style: { marginLeft: 'auto', display: 'inline-flex', gap: '6px' } })
    tail.appendChild(send)
    tail.appendChild(btn)
    row.appendChild(tail)
    sec.appendChild(row)
  }
  return sec
}

/** 纯渲染（dom-shim 可测）：模型 + 回调 → 抽屉体。 */
export function renderDrawerContent(model: DrawerModel, cbs: DrawerCallbacks, draftWs: string | null = null, draftPers: string | null = null): HTMLElement {
  const closeBtn = makeButton({ kind: 'ghost', size: 'sm', label: '关闭', title: '关闭抽屉', onClick: () => cbs.onClose() })
  const head = h('div', { className: 'c1a-dhead' },
    h('span', { className: 'c1a-dot ' + model.status }),
    h('span', null, model.name + '·详情'),
    h('span', { style: { marginLeft: 'auto' } }, closeBtn))
  const sum = h('div', { className: 'c1a-summary' })
  sum.appendChild(listRow('模式', presetSelect(model, cbs)))
  const stateVal = h('span', { style: { fontSize: '12px' } },
    '路由 ' + model.routes.length + ' · 渠道 ' + model.channels.length + ' · ' + model.statusLabel)
  sum.appendChild(listRow('状态', stateVal))
  const sumNote = h('div', { className: 'c1a-meta' }, '沟通模式：DSH 用哪种方式回话（如 PTC、标准、创造等），不是角色性格。写入真系统，新会话生效。')
  sumNote.setAttribute('style', 'padding:6px 4px 0')
  const body = h('div', { className: 'c1a-dbody' }, sum, sumNote, ctxSection(model, cbs),
    personalitySection(personalityPrefill(model.bots), draftPers, cbs),
    workspaceSection(model, draftWs, cbs), routesSection(model), channelsSection(model, cbs))
  return h('div', { className: 'c1a-drawer' }, head, body)
}
