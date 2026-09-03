/** welcome-banner 纯数据层（DOM-free，可 node 直测）：E4 欢迎横幅 A 变体 v1。
 * 诚实约束：未读 M 无真源（research/05），本层只消费现成事实——stream 健康快照、
 * meta 身份、routes.list 路由投影；无时间、无昵称、无跳转（session 已脱敏），
 * 所有“不知道”都以 null/空表达，由视图转为静态文案，绝不谎报。 */
import { channelLabel, HEALTH_LABELS, type HealthKind } from "../../client/data/config";
import { basenameOf, buildModel } from "../../client/data/model";

export interface WsCandidate {
  path: string;
  name: string;
}

/** 工作区 label 反查路径（hero chip 文本 → 全路径）：名/基名/后缀逐级收敛，
 * 歧义或无匹配一律回 null（宁缺勿错配，错配=把别人的欢迎挂到当前会话）。 */
export function matchWorkspaceLabel(label: string, candidates: WsCandidate[]): string | null {
  const t = (label ?? "").trim();
  if (!t) return null;
  const fold = (s: string): string => s.toLowerCase();
  const ft = fold(t);
  const list = (candidates ?? []).filter((c) => c && typeof c.path === "string" && c.path);
  const byName = list.filter((c) => fold(c.name) === ft);
  if (byName.length === 1) return byName[0].path;
  if (byName.length > 1) return null;
  const byBase = list.filter((c) => fold(basenameOf(c.path)) === ft);
  if (byBase.length === 1) return byBase[0].path;
  if (byBase.length > 1) return null;
  const bySuffix = list.filter((c) => {
    const p = c.path;
    return p === t || fold(p).endsWith("/" + ft) || p.endsWith("\\" + t);
  });
  if (bySuffix.length === 1) return bySuffix[0].path;
  return null;
}
import type { AgentMetaDoc } from "../../client/data/meta";
import type { AgentPresetCatalog, BotSnap } from "../../client/data/fleet-api";

export interface RouteRef {
  chat: string;
  sessionId: string;
  ghost?: boolean;
  channel?: string;
  botId?: string;
}

export interface RouteSummary {
  total: number;
  p2p: number;
  group: number;
  ghost: number;
}

/** 路由计数：只按脱敏前缀分类（私聊/群聊），ghost 单计；无时间不断言活跃。 */
export function summarizeRoutes(routes: RouteRef[]): RouteSummary {
  const list = Array.isArray(routes) ? routes : [];
  let p2p = 0;
  let group = 0;
  let ghost = 0;
  for (const r of list) {
    if (!r || typeof r.chat !== "string") continue;
    if (r.chat.indexOf("私聊") === 0) p2p++;
    else if (r.chat.indexOf("群聊") === 0) group++;
    if (r.ghost === true) ghost++;
  }
  return { total: list.filter((r) => r && typeof r.chat === "string").length, p2p, group, ghost };
}

export interface TopRoutes {
  shown: RouteRef[];
  overflow: number;
}

/** TopN 路由行：保持上游顺序（已按渠道/bot/chat 排过），超长只报余数。 */
export function pickTopRoutes(routes: RouteRef[], n = 3): TopRoutes {
  const list = (Array.isArray(routes) ? routes : []).filter((r) => r && typeof r.chat === "string");
  const count = Math.max(0, Math.floor(n) || 0);
  return { shown: list.slice(0, count), overflow: Math.max(0, list.length - count) };
}

export type WbAction = "detail" | "refresh";

/** 双槽位（无死按钮：detail 走 C1a 抽屉真消费者，refresh 走单份 stream；
 * 去绑定/打开工作区暂无落点，v1 不设按钮，未绑定只给静态指引）。 */
export function actionSlotsFor(bound: boolean): WbAction[] {
  return bound ? ["detail", "refresh"] : ["refresh"];
}

/** 时段问候（本地时间，免费事实；边界含左端）。 */
export function greetingForHour(h: number): string {
  const hour = Math.floor(h);
  if (!(hour >= 0 && hour < 24)) return "你好";
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 23) return "晚上好";
  return "夜深了";
}

export interface BannerChannel {
  id: string;
  label: string;
  status: HealthKind;
}

export interface BannerBot {
  channel: string;
  botId: string;
}

export interface BannerModel {
  key: string;
  name: string;
  initial: string;
  avatar: string | null;
  workspace: string;
  status: HealthKind;
  stateLabel: string;
  channels: BannerChannel[];
  bots: BannerBot[];
  /** null = 上游未读到，不展示该行（防盲写式展示）。 */
  presetText: string | null;
  /** null = 上游未读到，不展示该行。 */
  ctxText: string | null;
}

function presetTextOf(snaps: BotSnap[], catalogs: Record<string, AgentPresetCatalog>): string | null {
  const defined = snaps.filter((s) => s && s.agentPreset !== undefined).map((s) => s.agentPreset as string | null);
  if (!defined.length) return null;
  const ids = [...new Set(defined.map((v) => (v === null ? "" : String(v))))];
  if (ids.length === 1) {
    if (ids[0] === "") return "跟随默认";
    const owner = snaps.find((s) => s && s.agentPreset !== undefined && s.agentPreset !== null);
    const items = (owner && catalogs[owner.channel]?.items) || [];
    const hit = items.find((it) => it && it.id === ids[0]);
    return (hit && hit.label) || ids[0];
  }
  return "多预设";
}

function ctxTextOf(snaps: BotSnap[]): string | null {
  const defined = snaps.filter((s) => s && s.contextEnhancement !== undefined && s.contextEnhancement !== null);
  if (!defined.length) return null;
  const on = defined.filter((s) => {
    const c = s.contextEnhancement as { groupEnabled?: boolean; directEnabled?: boolean };
    return c.groupEnabled === true || c.directEnabled === true;
  }).length;
  if (on === 0) return "上下文增强关";
  if (on === defined.length) return "上下文增强开";
  return "上下文增强部分开";
}

/** 横幅模型：按工作区全路径找 Agent；找不到（未绑定/未知）回 null（调用方渲染静态指引）。 */
export function buildBannerModel(
  bots: BotSnap[],
  meta: AgentMetaDoc,
  workspacePath: string,
  catalogs: Record<string, AgentPresetCatalog> = {},
): BannerModel | null {
  if (!workspacePath) return null;
  const list = Array.isArray(bots) ? bots : [];
  const doc: AgentMetaDoc = meta ?? { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const fleet = buildModel(list, doc, "agent", "");
  const view = fleet.agents.find((a) => a.workspace === workspacePath);
  if (!view) return null;
  const snaps = list.filter((b) => b && b.workspace === workspacePath);
  return {
    key: view.key,
    name: view.name,
    initial: view.initial,
    avatar: view.avatar,
    workspace: view.workspace,
    status: view.status,
    stateLabel: view.stateLabel,
    channels: view.channels.map((c) => ({ id: c.id, label: c.label || channelLabel(c.id), status: c.status })),
    bots: view.bots.map((b) => ({ channel: b.channel, botId: b.botId })),
    presetText: presetTextOf(snaps, catalogs ?? {}),
    ctxText: ctxTextOf(snaps),
  };
}

export function stateLabelOf(status: HealthKind): string {
  return HEALTH_LABELS[status] ?? status;
}
