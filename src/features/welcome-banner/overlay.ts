/** welcome-banner 挂载编排：hero 门控 + 顶层弹窗（与 view 纯渲染分离，为 300 行红线）。
 * 门控 hero 门+可见性门，未绑定零 UI，进门（key=工作区全路径）后内存+持久双记、删光双清；
 * 已绘卡按 hero 节点键控，每轮清扫 hero 已消失的卡；名表每拍重读（改名即时生效）。 */
import { fetchRouteRows, type BotSnap } from "../../client/data/fleet-api";
import type { AgentMetaDoc } from "../../client/data/meta";
import { basenameOf, viewName } from "../../client/data/model";
import type { FeatureCtx } from "../protocol";
import {
  buildBannerModel, copyFor, dailyIdx, displaySub, homeLangOf, matchWorkspaceLabel, pruneWelcomed, segOfHour, summarizeRoutes, welcomedOf,
  type HomeLang, type RouteRef, type WsCandidate,
} from "./data";
import { eachHero, heroConfirmed, heroWorkspaceLabel, isVisible, phaseAttr, textOf } from "./anchor";
import { renderHome } from "./view";

/** 进门记忆（key = 工作区全路径）：内存态 + meta.welcomed 持久化双写，见文件头语义。 */
const DISMISSED = new Set<string>();
/** 热更新/双挂载代际哨兵（同 left-badges）。 */
let activeGen = 0;
/** 决策日志（验收排障用：横幅没出现时看第一条 info 就知道卡在哪一关）。 */
const logOnce = new Set<string>();
function infoOnce(key: string, msg: string): void {
  try {
    if (logOnce.has(key)) return;
    logOnce.add(key);
    console.info("[dsh-im-companion] welcome-banner：" + msg);
  } catch { /* 无 console 环境静默 */ }
}

interface MountState {
  gen: number;
  bots: BotSnap[];
  catalogs: Record<string, { defaultId: string; items: { id: string; label: string }[] }>;
  metaDoc: AgentMetaDoc | null;
  routes: RouteRef[];
  routesOk: boolean;
  welcomed: Record<string, boolean>;
  metaReady: boolean;
  painted: Map<unknown, { node: unknown; parent: unknown; sig: string; path: string }>;
  timer: unknown;
}

function candidatesOf(bots: BotSnap[], meta: AgentMetaDoc | null): WsCandidate[] {
  const doc: AgentMetaDoc = meta ?? { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const seen = new Map<string, string>();
  for (const b of bots ?? []) {
    const ws = b && typeof b.workspace === "string" ? b.workspace : "";
    if (!ws || seen.has(ws)) continue;
    const base = basenameOf(ws);
    seen.set(ws, viewName(base, doc, base || ws, ws));
  }
  return [...seen.entries()].map(([path, name]) => ({ path, name }));
}

function removePainted(st: MountState, hero: unknown): void {
  try {
    const rec = st.painted.get(hero);
    if (!rec) return;
    st.painted.delete(hero);
    const parent = rec.parent as { removeChild?: (n: unknown) => void } | null;
    if (parent && typeof parent.removeChild === "function") {
      try { parent.removeChild(rec.node); } catch { /* 已被宿主回收 */ }
    }
  } catch { /* ignore */ }
}

function saveWelcomed(fctx: FeatureCtx, path: string, seen: boolean): void {
  try {
    const setter = (fctx as unknown as { meta?: { setWelcomed?: unknown } }).meta?.setWelcomed;
    if (typeof setter !== "function") return;
    void (setter as (w: string, s: boolean) => Promise<unknown>).call(fctx.meta, path, seen).catch(() => undefined);
  } catch { /* 持久化失败不影响展示（内存态照常） */ }
}

/** 顶层挂载位：hero 只做门控，弹窗一律挂 body，不占据对话框版面。 */
function topLayer(): unknown {
  try {
    const d = typeof document !== "undefined" ? (document as unknown as { body?: unknown }) : null;
    return d?.body ?? null;
  } catch { return null; }
}

/** DSH 系统语言（documentElement.lang）：en 开头即英文，切语言宿主改该属性即重绘。 */
function docLang(doc: unknown): HomeLang {
  try {
    const el = (doc as { documentElement?: { lang?: unknown; getAttribute?: (k: string) => unknown } } | null)?.documentElement;
    const v = (el && typeof el.lang === "string" ? el.lang : undefined)
      ?? (el && typeof el.getAttribute === "function" ? el.getAttribute("lang") : undefined);
    return homeLangOf(typeof v === "string" ? v : null);
  } catch { return "zh"; }
}

function paintHero(fctx: FeatureCtx, st: MountState, heroRoot: unknown, lang: HomeLang): void {
  const text = textOf(heroRoot);
  if (!heroConfirmed(phaseAttr(heroRoot), text)) return;
  const label = heroWorkspaceLabel(heroRoot);
  if (!label) {
    infoOnce("no-label", "发现 hero 空态但读不到工作区 chip 文本，已跳过（等 chip 渲染出来会再扫）。");
    return;
  }
  if (!st.metaReady) return;
  const path = matchWorkspaceLabel(label, candidatesOf(st.bots, st.metaDoc));
  if (!isVisible(heroRoot)) {
    infoOnce("hidden-hero", "hero 节点仍在 DOM 但不可见（宿主切走空态后的常驻藏匿），已跳过；这是有消息会话不打扰的保证。");
    removePainted(st, heroRoot);
    return;
  }
  if (path && DISMISSED.has(path)) {
    removePainted(st, heroRoot);
    return;
  }
  if (!path) {
    infoOnce("nomatch:" + label, "工作区 \"" + label + "\" 未匹配到已知绑定（快照bots=" + st.bots.length + "），已跳过；若横幅该出未出，把这条日志贴 issue。");
    removePainted(st, heroRoot);
    return;
  }
  const emptyMeta = { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  try {
    const names = ((st.metaDoc ?? emptyMeta).names ?? {}) as Record<string, unknown>;
    const n = typeof names === "object" ? Object.keys(names).length : -1;
    const hit = !!(names[path] ?? names[basenameOf(path)]);
    infoOnce("namehit:" + path, "工作区 \"" + path + "\" 名表" + (hit ? "命中" : "未命中") + "（名表共 " + n + " 条；0 条=读到空表，>0 未命中=键对不上）。");
  } catch { /* ignore */ }
  const model = path ? buildBannerModel(st.bots, st.metaDoc ?? emptyMeta, path, st.catalogs ?? {}) : null;
  if (!model) {
    infoOnce("unbound:" + label, "工作区 \"" + label + "\" 未绑定 Agent，零 UI（纯净原生空态）。");
    removePainted(st, heroRoot);
    return;
  }
  const mine = st.routes.filter((r) => r && typeof r.chat === "string" && model.bots.some((b) => b.channel === r.channel && (!r.botId || b.botId === r.botId)));
  const total = st.routesOk ? summarizeRoutes(mine).total : null;
  const now = new Date();
  const seg = segOfHour(now.getHours());
  const copy = copyFor(seg, dailyIdx(now.getDate()), lang);
  const subSuffix = displaySub(copy.s, total, model.name, lang);
  const showSig = lang + "|" + model.key + "|" + model.name + "|" + seg + "|" + copy.idx + "|" + model.status + "|" + (total === null ? "x" : total);
  let card: unknown = null;
  try {
    card = renderHome({
      copy, model, subSuffix,
      callbacks: {
        onEnter: () => {
          try { DISMISSED.add(path); } catch { /* ignore */ }
          try { st.welcomed[path] = true; } catch { /* ignore */ }
          saveWelcomed(fctx, path, true);
          removePainted(st, heroRoot);
        },
      },
    });
  } catch { return; }
  try {
    const parent = topLayer() as { appendChild?: (n: unknown) => void } | null;
    if (!parent || typeof parent.appendChild !== "function") return;
    const prev = st.painted.get(heroRoot);
    if (prev && prev.node && prev.sig === showSig) return;
    removePainted(st, heroRoot);
    parent.appendChild(card);
    st.painted.set(heroRoot, { node: card, parent, sig: showSig, path });
    infoOnce("painted:" + path, "P 弹窗已挂载到顶层（" + path + "，时段=" + seg + "，语言=" + lang + "）。");
  } catch { /* 宿主 DOM 变化即跳过本轮 */ }
}

function scanAll(fctx: FeatureCtx, st: MountState, doc: unknown): void {
  try {
    if (activeGen !== st.gen) return;
    const live = new Set<unknown>();
    const lang = docLang(doc);
    eachHero(doc, (root) => {
      live.add(root);
      paintHero(fctx, st, root, lang);
    });
    for (const hero of [...st.painted.keys()]) {
      if (!live.has(hero)) removePainted(st, hero);
    }
  } catch { /* 整轮异常静默 */ }
}

/** 合并扫描：聊天流式渲染时观察器高频触发，合并到一次定时再扫；订阅节拍走同步直扫。 */
function scheduleScan(fctx: FeatureCtx, st: MountState, doc: unknown): void {
  try {
    if (activeGen !== st.gen) return;
    if (st.timer !== null && st.timer !== undefined) return;
    if (typeof setTimeout !== "function") {
      scanAll(fctx, st, doc);
      return;
    }
    st.timer = setTimeout(() => {
      try { st.timer = null; } catch { /* ignore */ }
      try { scanAll(fctx, st, doc); } catch { /* ignore */ }
    }, 0);
  } catch { /* ignore */ }
}

/** 挂载横幅：hero 只做门控，弹窗一律挂 body 顶层（不占据对话框版面）。永不调用 slots API（无 SlotCore 抛错面）；
 * 无 document/MutationObserver 环境回 noop；所有异常内部消化，绝不向上传播。 */
export function mountBanner(fctx: FeatureCtx): () => void {
  activeGen += 1;
  const gen = activeGen;
  const noop = () => undefined;
  try {
    const doc: unknown = typeof document !== "undefined" ? document : null;
    if (!doc) {
      return () => { try { if (activeGen === gen) activeGen += 1; } catch { /* ignore */ } };
    }
    const st: MountState = { gen, bots: [], catalogs: {}, metaDoc: null, routes: [], routesOk: false, welcomed: {}, metaReady: false, painted: new Map(), timer: null };
    let unsub: () => void = noop;
    try {
      unsub = fctx.subscribe((s) => {
        try {
          if (activeGen !== gen) return;
          st.bots = (s && Array.isArray(s.bots) ? s.bots : []) as BotSnap[];
          st.catalogs = (s && s.catalogs) || {};
          try {
            void fctx.meta.loadMeta().then((m) => {
              if (activeGen !== gen) return;
              st.metaDoc = m;
              try {
                const fresh = welcomedOf(m);
                for (const p of Object.keys(fresh)) if (fresh[p] === true && !st.welcomed[p]) { st.welcomed[p] = true; DISMISSED.add(p); }
              } catch { /* ignore */ }
              scanAll(fctx, st, doc);
            }).catch(() => undefined);
          } catch { /* ignore */ }
          /* 路由 stale-while-revalidate：不断电复用上轮已知数，等新数到了再换。
           * 若每拍都先置 routesOk=false，总数会在 null↔N 之间来回翻，sig 每 15s 翻两次、
           * 入场动画跟着重播——就是“不点也会全面刷新”的根因。首挂载仍从 false 起步，保守一次。 */
          try {
            const stamp = s && typeof s.updatedAt === "number" ? s.updatedAt : 0;
            if (stamp > 0) {
              const alive = new Set<string>();
              for (const b of st.bots) {
                const ws = b && typeof b.workspace === "string" ? b.workspace : "";
                if (ws) alive.add(ws);
              }
              const pruned = pruneWelcomed(st.welcomed, alive);
              if (pruned.dropped.length) {
                st.welcomed = pruned.kept;
                for (const p of pruned.dropped) {
                  try { DISMISSED.delete(p); } catch { /* ignore */ }
                  saveWelcomed(fctx, p, false);
                }
                infoOnce("unbound-reset", "有工作区机器人被删光，进门记忆已清除，重绑后 welcome 重现。");
              }
            }
          } catch { /* 剪枝失败不影响展示 */ }
          void fetchRouteRows(fctx.rpc, st.bots.map((b) => ({ channel: b.channel, botId: b.botId })))
            .then((r) => { if (activeGen === gen) { st.routes = r; st.routesOk = true; scanAll(fctx, st, doc); } })
            .catch(() => undefined);
          scanAll(fctx, st, doc);
        } catch { /* 单拍异常静默 */ }
      });
    } catch { /* 无订阅即只首扫 */ }
    try {
      void fctx.meta.loadMeta().then((m) => {
        if (activeGen !== gen) return;
        st.metaDoc = m;
        try {
          st.welcomed = welcomedOf(m);
          for (const p of Object.keys(st.welcomed)) {
            if (st.welcomed[p] === true) DISMISSED.add(p);
          }
        } catch { /* 播种失败即内存态 */ }
        st.metaReady = true;
        scanAll(fctx, st, doc);
      }).catch(() => {
        if (activeGen !== gen) return;
        infoOnce("meta-fail", "meta 加载失败，本次降级为内存态（进门记忆不断电但不跨页）。");
        st.metaReady = true;
        scanAll(fctx, st, doc);
      });
    } catch {
      st.metaReady = true;
    }
    let obs: { disconnect?: () => void } | null = null;
    try {
      const MO = typeof MutationObserver !== "undefined" ? MutationObserver : null;
      const target = (doc as { documentElement?: unknown }).documentElement ?? doc;
      if (MO && target) {
        const inst = new MO(() => { try { scheduleScan(fctx, st, doc); } catch { /* ignore */ } });
        inst.observe(target as Node, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase", "style", "class", "lang"] });
        obs = inst;
      }
    } catch { /* 无观察即靠订阅节拍重扫 */ }
    try { scanAll(fctx, st, doc); } catch { /* ignore */ }
    return () => {
      try { if (activeGen === gen) activeGen += 1; } catch { /* ignore */ }
      try { unsub(); } catch { /* ignore */ }
      try { if (st.timer !== null && st.timer !== undefined && typeof clearTimeout === "function") clearTimeout(st.timer as never); } catch { /* ignore */ }
      try { st.timer = null; } catch { /* ignore */ }
      try { obs?.disconnect?.(); } catch { /* ignore */ }
      try {
        for (const key of [...st.painted.keys()]) removePainted(st, key);
      } catch { /* ignore */ }
    };
  } catch {
    return noop;
  }
}
