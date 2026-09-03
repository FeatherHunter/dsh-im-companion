/** C1a 抽屉数据层（DOM-free，可 node 直测）：B 变体模型派生 + 身份写透键 + 路由 seat（E3 #14 待填）。
 * 预设存 companion meta（host/meta-store.ts）：取值为 default|cs|coder 或 custom:名前缀（与 host 同值，各持一份）。 */
import { OPEN_DRAWER_EVENT, type HealthKind } from '../../client/data/config'
import { buildModel } from '../../client/data/model'
import type { BotSnap } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'

export { OPEN_DRAWER_EVENT }

export const PRESET_OPTIONS = [
  { id: 'default', label: '默认助手' },
  { id: 'cs', label: '客服话术' },
  { id: 'coder', label: '代码助手' },
  { id: 'custom', label: '自定义' },
] as const

export const CTX_LEVELS = [
  { id: 'low', label: '精简' },
  { id: 'mid', label: '均衡' },
  { id: 'high', label: '详尽' },
] as const

export type CtxLevel = 'low' | 'mid' | 'high'

/* bare 'custom' 只是 select 中间态（待输入名），永不持久化（host 拒绝）；落盘值恒为 id 或 custom:<名>。 */
const PRESET_IDS = ['default', 'cs', 'coder', 'custom']

export function normalizePreset(value: unknown): string {
  const s = String(value ?? '').trim()
  if (PRESET_IDS.includes(s)) return s
  if (s.startsWith('custom:') && s.length > 7 && s.length <= 40) return s
  return 'default'
}

export function presetLabel(value: string): string {
  if (value.startsWith('custom:')) return '自定义 · ' + value.slice(7)
  const hit = PRESET_OPTIONS.find((o) => o.id === value)
  return hit ? hit.label : '默认助手'
}

export interface PanelRect {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SheetGeom {
  top: number
  right: number
  bottom: number
  width: number
}

/** 抽屉贴设置面板右沿：fixed 相对视口，用面板矩形反推四边；面板找不到回 null（调用方保持视口右沿兜底）。 */
export function sheetGeometry(panel: PanelRect | null, viewport: { width: number; height: number }): SheetGeom | null {
  if (!panel || !(viewport.width > 0 && viewport.height > 0)) return null
  const pw = panel.right - panel.left
  if (!(pw > 0)) return null
  const width = pw < 420 ? Math.max(0, pw) : 360
  return {
    top: Math.max(0, Math.round(panel.top)),
    right: Math.max(0, Math.round(viewport.width - panel.right)),
    bottom: Math.max(0, Math.round(viewport.height - panel.bottom)),
    width: Math.round(width),
  }
}

export function normalizeLevel(value: unknown): CtxLevel {
  const s = String(value ?? '')
  return s === 'low' || s === 'mid' || s === 'high' ? s : 'mid'
}

export interface RouteEntry {
  chat: string
  sessionId: string
}

export function fetchRoutesFor(): RouteEntry[] {
  return []
}

export interface DrawerChannel {
  id: string
  label: string
  status: HealthKind
  botId: string
}

export interface DrawerCtx {
  enabled: boolean
  level: CtxLevel
}

export interface DrawerModel {
  key: string
  storeKey: string
  name: string
  workspace: string
  statusLabel: string
  status: string
  bound: boolean
  preset: string
  customName: string
  ctx: DrawerCtx
  channels: DrawerChannel[]
  bots: { channel: string; botId: string }[]
  routes: RouteEntry[]
}

/** 等待数据时的占位模型（key 回填，供关闭/重试逻辑识别）。 */
export function loadingModel(key: string): DrawerModel {
  return {
    key, storeKey: key, name: '加载中', workspace: '', statusLabel: '等待数据', status: 'warn',
    bound: false, preset: 'default', customName: '', ctx: { enabled: false, level: 'mid' },
    channels: [], bots: [], routes: [],
  }
}

export function storeKeyOf(base: string, key: string): string {
  return base || key
}

export function buildDrawerModel(bots: BotSnap[], meta: AgentMetaDoc, key: string): DrawerModel | null {
  const fleet = buildModel(bots, meta, 'agent', '')
  const view = fleet.agents.find((a) => a.key === key)
  if (!view) return null
  const skey = storeKeyOf(view.base, view.key)
  const presets = meta.presets ?? {}
  const ctxs = meta.ctxEnhance ?? {}
  const preset = normalizePreset(presets[skey] ?? 'default')
  const rawCtx = ctxs[skey]
  const botOf = (ch: string): string => view.bots.find((b) => b.channel === ch)?.botId ?? ''
  return {
    key: view.key,
    storeKey: skey,
    name: view.name,
    workspace: view.workspace,
    statusLabel: view.stateLabel,
    status: view.status,
    bound: view.workspace !== '',
    preset: preset.startsWith('custom:') ? 'custom' : preset,
    customName: preset.startsWith('custom:') ? preset.slice(7) : '',
    ctx: { enabled: rawCtx?.enabled === true, level: normalizeLevel(rawCtx?.level) },
    channels: view.channels.map((c) => ({ id: c.id, label: c.label, status: c.status, botId: botOf(c.id) })),
    bots: view.bots.map((b) => ({ channel: b.channel, botId: b.botId })),
    routes: fetchRoutesFor(),
  }
}
