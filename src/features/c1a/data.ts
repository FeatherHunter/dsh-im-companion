/** C1a 抽屉数据层（DOM-free，可 node 直测）：A' 方案——读上游真值，写上游真接口。
 * 第一性：dsh-im 是唯一真源，companion 不自持第二账本（host meta presets/ctx 端点保留不断路，抽屉不再用）。
 * 读：connection.status 经 BotSnap.agentPreset/contextEnhancement + catalogs 回流（fleet-api 提取）。
 * 写：bot.preset.set {botId, agentPreset}；bot.context-enhancement.set {botId, config 全量4键，读-改-写}。
 * 守卫：读不到（undefined）就不写——盲写覆盖用户引导语是正确性红线。 */
import { OPEN_DRAWER_EVENT, type HealthKind } from '../../client/data/config'
import { buildModel } from '../../client/data/model'
import type { AgentPresetCatalog, BotSnap, UpstreamCtx } from '../../client/data/fleet-api'
import type { AgentMetaDoc } from '../../client/data/meta'

export { OPEN_DRAWER_EVENT }

/** 跟随默认（上游 null）：改动只对新会话生效，已有会话不受影响。 */
export const PRESET_FOLLOW = '__follow__'
/** 多渠道值不一致：展示占位，不可写出（写时按当前下拉值批量写全部渠道）。 */
export const PRESET_MIXED = '__mixed__'

const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/

export interface DrawerBot {
  channel: string
  botId: string
  preset: string | null | undefined
  ctx: UpstreamCtx | null | undefined
}

export interface DrawerChannel {
  id: string
  label: string
  status: HealthKind
  botId: string
  /** 该渠道真值：undefined = 本轮未读到（该行开关禁用）；null = 上游缺席（按双关理解）。 */
  ctx: UpstreamCtx | null | undefined
}

export interface DrawerModel {
  key: string
  name: string
  workspace: string
  statusLabel: string
  status: string
  bound: boolean
  /** 预设展示值：上游 id | PRESET_FOLLOW | PRESET_MIXED。 */
  preset: string
  presetCatalog: AgentPresetCatalog
  /** false = 还有渠道没读到真值，下拉禁用（只读展示）。 */
  presetReady: boolean
  /** false = 还有渠道没读到上下文真值，该渠道行开关禁用（防盲写）。 */
  ctxReady: boolean
  channels: DrawerChannel[]
  bots: DrawerBot[]
  routes: RouteEntry[]
}

export interface PanelRect { top: number; right: number; bottom: number; left: number }
export interface SheetGeom { top: number; right: number; bottom: number; width: number }

/** 抽屉占满设置面板：fixed 相对视口，用面板矩形反推四边，宽 = 面板全宽；面板找不到回 null（调用方 CSS 视口右沿兜底）。 */
export function sheetGeometry(panel: PanelRect | null, viewport: { width: number; height: number }): SheetGeom | null {
  if (!panel || !(viewport.width > 0 && viewport.height > 0)) return null
  const pw = panel.right - panel.left
  if (!(pw > 0)) return null
  const width = Math.max(0, Math.round(pw))
  return {
    top: Math.max(0, Math.round(panel.top)),
    right: Math.max(0, Math.round(viewport.width - panel.right)),
    bottom: Math.max(0, Math.round(viewport.height - panel.bottom)),
    width: Math.round(width),
  }
}

/** 性格框预填：各渠道引导语一致则回填（接着改），不一致/全空则空（防把别家的话塞进框）。 */
export function personalityPrefill(bots: DrawerBot[]): string {
  const guides = [...new Set(bots.map((b) => ((b.ctx as UpstreamCtx | null)?.guidance ?? '').trim()))]
  return guides.length === 1 ? guides[0] : ''
}

export interface RouteEntry { chat: string; sessionId: string }
export function fetchRoutesFor(): RouteEntry[] { return [] }

/** 等待数据时的占位模型（key 回填，供关闭/重试逻辑识别；读写全禁用）。 */
export function loadingModel(key: string): DrawerModel {
  return {
    key, name: '加载中', workspace: '', statusLabel: '等待数据', status: 'warn',
    bound: false, preset: PRESET_FOLLOW, presetCatalog: { defaultId: '', items: [] }, presetReady: false,
    ctxReady: false,
    channels: [], bots: [], routes: [],
  }
}

/** 上游信封解包：{ok:false} 抛错，其余透传（与 fleet-api unwrap 同语义，抽屉写路径用）。 */
export function unwrapRpc(raw: unknown): void {
  const r = raw as { ok?: boolean; error?: { code?: string; message?: string } } | null
  if (r && r.ok === false) throw new Error(r.error?.message ?? r.error?.code ?? '上游写入失败')
}

/** 预设写 payload：跟随默认→null；非法 id→null（调用方禁用写并提示）。 */
export function presetPayloadFor(botId: string, preset: string): { botId: string; agentPreset: string | null } | null {
  if (!botId) return null
  if (preset === PRESET_FOLLOW) return { botId, agentPreset: null }
  const id = preset.trim()
  if (!PRESET_ID_RE.test(id)) return null
  return { botId, agentPreset: id }
}

/** 上下文写 payload（读-改-写）：只翻一个开关，fields/guidance 原样回填全量4键；未读到→null（禁用写）。 */
export function ctxPayloadFor(
  current: UpstreamCtx | null | undefined, which: 'group' | 'direct', next: boolean,
): { groupEnabled: boolean; directEnabled: boolean; fields: string[]; guidance: string } | null {
  if (current === undefined) return null
  const base = current ?? { groupEnabled: false, directEnabled: false, fields: [], guidance: '' }
  return {
    groupEnabled: which === 'group' ? next : base.groupEnabled,
    directEnabled: which === 'direct' ? next : base.directEnabled,
    fields: [...base.fields],
    guidance: base.guidance,
  }
}

function mergeCatalogs(channels: string[], catalogs: Record<string, AgentPresetCatalog>): AgentPresetCatalog {
  const out: { id: string; label: string }[] = []
  const seen = new Set<string>()
  let defaultId = ''
  for (const ch of channels) {
    const c = catalogs[ch]
    if (!c) continue
    if (!defaultId && c.defaultId) defaultId = c.defaultId
    for (const it of c.items ?? []) {
      if (!it || seen.has(it.id)) continue
      seen.add(it.id)
      out.push({ id: it.id, label: it.label || it.id })
    }
  }
  return { defaultId, items: out }
}

export function buildDrawerModel(
  bots: BotSnap[], meta: AgentMetaDoc, key: string, catalogs: Record<string, AgentPresetCatalog> = {},
): DrawerModel | null {
  const fleet = buildModel(bots, meta, 'agent', '')
  const view = fleet.agents.find((a) => a.key === key)
  if (!view) return null
  const dbots: DrawerBot[] = view.bots.map((b) => {
    const s = bots.find((x) => x && x.channel === b.channel && x.botId === b.botId)
    return { channel: b.channel, botId: b.botId, preset: s?.agentPreset, ctx: s?.contextEnhancement }
  })
  const presetReady = dbots.length > 0 && dbots.every((b) => b.preset !== undefined)
  const pvals = [...new Set(dbots.map((b) => (b.preset ?? null) as string | null))]
  const preset = !presetReady ? PRESET_FOLLOW : pvals.length === 1 ? (pvals[0] ?? PRESET_FOLLOW) : PRESET_MIXED
  const ctxReady = dbots.length > 0 && dbots.every((b) => b.ctx !== undefined)
  const ctxOf = (channel: string, botId: string): UpstreamCtx | null | undefined =>
    dbots.find((b) => b.channel === channel && b.botId === botId)?.ctx
  return {
    key: view.key,
    name: view.name,
    workspace: view.workspace,
    statusLabel: view.stateLabel,
    status: view.status,
    bound: view.workspace !== '',
    preset: preset === '' ? PRESET_FOLLOW : preset,
    presetCatalog: mergeCatalogs(view.channels.map((c) => c.id), catalogs),
    presetReady,
    ctxReady,
    channels: view.channels.map((c) => {
      const botId = view.bots.find((b) => b.channel === c.id)?.botId ?? ''
      return { id: c.id, label: c.label, status: c.status, botId, ctx: ctxOf(c.id, botId) }
    }),
    bots: dbots,
    routes: fetchRoutesFor(),
  }
}
