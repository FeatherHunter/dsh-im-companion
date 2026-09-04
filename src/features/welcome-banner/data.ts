/** welcome-banner 纯数据层（DOM-free，可 node 直测）：只消费现成事实（stream 健康/meta 身份/路由投影），无未读数、无时间、无昵称，不知道即 null。P 内容以 PH 为准：五段×三套。 */
import { channelLabel, type HealthKind } from "../../client/data/config";
import { basenameOf, buildModel } from "../../client/data/model";
import type { AgentMetaDoc } from "../../client/data/meta";
import type { AgentPresetCatalog, BotSnap } from "../../client/data/fleet-api";
import { PH_EN } from "./copy-en";

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

/* ---------------- P 时辰引擎 ---------------- */

export type TimeSeg = "wee" | "dawn" | "day" | "dusk" | "night";

export interface TimeOpt {
  t: string;
  s: string;
  b: string;
  bs: string;
}

export interface TimeCopy extends TimeOpt {
  seg: TimeSeg;
  idx: number;
  tab: string;
  sky: string;
  moon: boolean;
  horizon: boolean;
}

interface SegDef {
  tab: string;
  sky: string;
  moon: boolean;
  horizon: boolean;
  opts: [TimeOpt, TimeOpt, TimeOpt];
}

/** PH 原始文案：五段×三套，一字不改：“门开着”是已对过的修订版。 */
const PH: Record<TimeSeg, SegDef> = {
  wee: { tab: "凌晨", sky: "wb-sky-wee", moon: true, horizon: true, opts: [
    { t: "还没睡？灯给你留着", s: "飞书在线 · 整个世界都睡了，除了我", b: "回家", bs: "夜里凉，进来暖暖" },
    { t: "天快亮了，我陪你到天亮", s: "飞书在线 · 失眠和加班都算数", b: "回家", bs: "再陪一会儿" },
    { t: "夜里凉，进来暖暖", s: "飞书在线 · 热茶在桌上", b: "回家", bs: "不问为什么晚睡" },
  ] },
  dawn: { tab: "清晨", sky: "wb-sky-dawn", moon: false, horizon: false, opts: [
    { t: "清晨了，家里先醒了", s: "飞书在线 · 先喝口热的再出门", b: "回家吃早饭", bs: "粥在锅里" },
    { t: "早，今天听你的", s: "飞书在线 · 今天的事，回来再说", b: "回家", bs: "我在呢" },
    { t: "天亮了，我把门口扫好了", s: "飞书在线 · 就等你了", b: "回家", bs: "干净了" },
  ] },
  day: { tab: "白天", sky: "wb-sky-day", moon: false, horizon: false, opts: [
    { t: "家里亮堂，随时回来", s: "飞书在线 · 小帅守着今天", b: "回家", bs: "门开着" },
    { t: "正午了，歇会儿？", s: "飞书在线 · 喝口水再走", b: "回家", bs: "不耽误事" },
    { t: "外头再闹，家里安静", s: "飞书在线 · 1 个会话候着", b: "回家", bs: "进来静静" },
  ] },
  dusk: { tab: "黄昏", sky: "wb-sky-dusk", moon: false, horizon: false, opts: [
    { t: "黄昏了，家里点灯了", s: "飞书在线 · 等你回来", b: "回家吃饭", bs: "饭在热" },
    { t: "天暗了，家亮了", s: "飞书在线 · 灯为你开", b: "回家", bs: "天黑请回家" },
    { t: "下班了？先回家", s: "飞书在线 · 今天辛苦了", b: "回家", bs: "歇歇" },
  ] },
  night: { tab: "深夜", sky: "wb-sky-night", moon: true, horizon: false, opts: [
    { t: "深夜了，家里灯还亮着", s: "飞书在线 · 守着这个夜", b: "回家", bs: "灯不关" },
    { t: "夜深了，别在外面漂太久", s: "飞书在线 · 随时回来", b: "回家", bs: "门没锁" },
    { t: "累了就回来，灯不关", s: "飞书在线 · 不问今天过得怎样", b: "回家", bs: "先睡觉" },
  ] },
};

export const TIME_SEGS: TimeSeg[] = ["wee", "dawn", "day", "dusk", "night"];

/** 时段映射：凌晨2-5陪伴/清晨5-9/白天9-17/黄昏17-20，其余深夜守候；非法回 night。 */
export function segOfHour(h: number): TimeSeg {
  const hour = Math.floor(h);
  if (!(hour >= 0 && hour < 24)) return "night";
  if (hour >= 2 && hour < 5) return "wee";
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/** idx 归一化到 0-2：负数与越界均回绕，永不越界。 */
export function normalizeCopyIdx(idx: number): number {
  const n = Math.floor(idx);
  if (!isFinite(n)) return 0;
  return ((n % 3) + 3) % 3;
}

/** 每日一句：同段三句按日期轮换（零 UI）。月份日取模，非法回 0。 */
export function dailyIdx(dayOfMonth: number): number {
  const n = Math.floor(dayOfMonth);
  if (!isFinite(n) || n < 1) return 0;
  return n % 3;
}

export type HomeLang = "zh" | "en";
/** DSH 系统语言跟随：lang 以 en 开头即英文，其余（含空）回中文。 */
export function homeLangOf(lang: string | null | undefined): HomeLang {
  const s = (lang ?? "").trim().toLowerCase();
  return s === "en" || s.indexOf("en-") === 0 || s.indexOf("en_") === 0 ? "en" : "zh";
}

/** 取某段某句：未知段回 night；lang 选表。 */
export function copyFor(seg: TimeSeg, idx: number, lang: HomeLang = "zh"): TimeCopy {
  const table = lang === "en" ? PH_EN : PH;
  const def = table[seg] ?? table.night;
  const key = (table[seg] ? seg : "night") as TimeSeg;
  const i = normalizeCopyIdx(idx);
  const o = def.opts[i];
  return { seg: key, idx: i, tab: def.tab, sky: def.sky, moon: def.moon, horizon: def.horizon, t: o.t, s: o.s, b: o.b, bs: o.bs };
}

/** 副标题后半句：去 mock 前缀拼真实健康态；计数句填真实路由数（null 去数字）；小帅换真名。 */
export function displaySub(rawSub: string, total: number | null, agentName?: string, lang: HomeLang = "zh"): string {
  const raw = String(rawSub ?? "");
  const dot = raw.indexOf("·");
  let suffix = (dot >= 0 ? raw.slice(dot + 1) : raw).trim();
  if (lang === "en") {
    const e = suffix.match(/^1 sessions? (.+)$/);
    if (e) {
      if (total === null || total === undefined || !isFinite(total)) return "Sessions " + e[1];
      const n = Math.max(0, Math.floor(total));
      return (n === 1 ? "1 session " : n + " sessions ") + e[1];
    }
    return suffix;
  }
  const name = (agentName ?? "").trim();
  if (name) suffix = suffix.split("小帅").join(name);
  const m = suffix.match(/^1 个会话(.+)$/);
  if (m) {
    if (total === null || total === undefined || !isFinite(total)) return "会话" + m[1];
    return Math.max(0, Math.floor(total)) + " 个会话" + m[1];
  }
  return suffix;
}

/** 进门记忆读：旧快照缺 welcomed 字段回空（读方兜底，零破坏）。 */
export function welcomedOf(doc: AgentMetaDoc | null): Record<string, boolean> {
  const w = doc?.welcomed;
  if (!w || typeof w !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(w)) {
    if (k && v === true) out[k] = true;
  }
  return out;
}

/** 解绑清除：welcomed 里无机器人的记录即清除；返回保留集与被清路径（调用方持久化 seen=false）。 */
export function pruneWelcomed(
  welcomed: Record<string, boolean>,
  alivePaths: string[] | Set<string>,
): { kept: Record<string, boolean>; dropped: string[] } {
  const alive = Array.isArray(alivePaths) ? new Set(alivePaths) : alivePaths ?? new Set<string>();
  const kept: Record<string, boolean> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(welcomed ?? {})) {
    if (v !== true) continue;
    if (k && alive.has(k)) kept[k] = true;
    else if (k) dropped.push(k);
  }
  return { kept, dropped };
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

/** 横幅模型：按工作区全路径找 Agent；找不到（未绑定/未知）回 null（调用方零 UI）。 */
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
