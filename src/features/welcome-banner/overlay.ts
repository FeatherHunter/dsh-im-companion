/** welcome-banner 挂载编排（DOM 叠加扫描 + 绘制调度）：与 view.ts 的纯渲染分离，
 * 纯粹为了 300 行红线；逻辑归属仍是 welcome-banner 自包含目录（单向依赖 view 的 render）。
 * P 时辰 v1：出现规则沿用 hero 门 + 可见性门；未绑定零 UI；中央“进门”仅收起卡片；
 * “换一句”按 hero key 记内存 idx，同段三套轮换。 */
import { fetchRouteRows, type BotSnap } from "../../client/data/fleet-api";
import type { AgentMetaDoc } from "../../client/data/meta";
import { basenameOf, viewName } from "../../client/data/model";
import type { FeatureCtx } from "../protocol";
import {
  buildBannerModel, copyFor, displaySub, matchWorkspaceLabel, segOfHour, summarizeRoutes,
  type RouteRef, type WsCandidate,
} from "./data";
import { eachHero, heroConfirmed, heroWorkspaceLabel, isVisible, phaseAttr, textOf } from "./anchor";
import { renderHome } from "./view";

/** 进门关闭记忆（内存态，key = hero label；切会话即新 key，天然恢复）。 */
const DISMISSED = new Set<string>();
/** 换一句记忆（内存态，key = hero label，值 0-2）。 */
const SWAP = new Map<string, number>();
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
  painted: Map<string, { node: unknown; parent: unknown; sig: string }>;
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

function removePainted(st: MountState, key: string): void {
  try {
    const rec = st.painted.get(key);
    if (!rec) return;
    st.painted.delete(key);
    const parent = rec.parent as { removeChild?: (n: unknown) => void } | null;
    if (parent && typeof parent.removeChild === "function") {
      try { parent.removeChild(rec.node); } catch { /* 已被宿主回收 */ }
    }
  } catch { /* ignore */ }
}

function paintHero(fctx: FeatureCtx, st: MountState, heroRoot: unknown): void {
  const text = textOf(heroRoot);
  if (!heroConfirmed(phaseAttr(heroRoot), text)) return;
  const label = heroWorkspaceLabel(heroRoot);
  if (!label) {
    infoOnce("no-label", "发现 hero 空态但读不到工作区 chip 文本，已跳过（等 chip 渲染出来会再扫）。");
    return;
  }
  const key = "hero:" + label;
  if (!isVisible(heroRoot)) {
    infoOnce("hidden-hero", "hero 节点仍在 DOM 但不可见（宿主切走空态后的常驻藏匿），已跳过；这是有消息会话不打扰的保证。");
    removePainted(st, key);
    return;
  }
  if (DISMISSED.has(key)) {
    removePainted(st, key);
    return;
  }
  const path = matchWorkspaceLabel(label, candidatesOf(st.bots, st.metaDoc));
  if (!path) {
    infoOnce("nomatch:" + label, "工作区 \"" + label + "\" 未匹配到已知绑定（快照bots=" + st.bots.length + "），已跳过；若横幅该出未出，把这条日志贴 issue。");
    removePainted(st, key);
    return;
  }
  const emptyMeta = { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const model = path ? buildBannerModel(st.bots, st.metaDoc ?? emptyMeta, path, st.catalogs ?? {}) : null;
  if (!model) {
    infoOnce("unbound:" + label, "工作区 \"" + label + "\" 未绑定 Agent，零 UI（纯净原生空态）。");
    removePainted(st, key);
    return;
  }
  const mine = st.routes.filter((r) => r && typeof r.chat === "string" && model.bots.some((b) => b.channel === r.channel && (!r.botId || b.botId === r.botId)));
  const total = st.routesOk ? summarizeRoutes(mine).total : null;
  const seg = segOfHour(new Date().getHours());
  const copy = copyFor(seg, SWAP.get(key) ?? 0);
  const subSuffix = displaySub(copy.s, total, model.name);
  const showSig = model.key + "|" + seg + "|" + copy.idx + "|" + model.status + "|" + (total === null ? "x" : total);
  let card: unknown = null;
  try {
    card = renderHome({
      copy, status: model.status, stateLabel: model.stateLabel, subSuffix,
      callbacks: {
        onEnter: () => {
          try { DISMISSED.add(key); } catch { /* ignore */ }
          removePainted(st, key);
        },
        onSwap: () => {
          try { SWAP.set(key, (copy.idx + 1) % 3); } catch { /* ignore */ }
          paintHero(fctx, st, heroRoot);
        },
      },
    });
  } catch { return; }
  try {
    const root = heroRoot as { parentNode?: unknown } | null;
    const parent = root?.parentNode as {
      insertBefore?: (n: unknown, ref: unknown) => void;
    } | null;
    if (!parent || typeof parent.insertBefore !== "function") return;
    const prev = st.painted.get(key);
    if (prev && (prev.parent as unknown) === (parent as unknown) && prev.node && prev.sig === showSig) return;
    removePainted(st, key);
    parent.insertBefore(card, heroRoot);
    st.painted.set(key, { node: card, parent, sig: showSig });
    infoOnce("painted:" + key, "P 横幅已挂载到空态上方（" + key + "，时段=" + seg + " 第" + (copy.idx + 1) + "句）。");
  } catch { /* 宿主 DOM 变化即跳过本轮 */ }
}

function scanAll(fctx: FeatureCtx, st: MountState, doc: unknown): void {
  try {
    if (activeGen !== st.gen) return;
    eachHero(doc, (root) => paintHero(fctx, st, root));
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

/** 挂载横幅：零槽位 DOM 叠加。永不调用 slots API（无 SlotCore 抛错面）；
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
    const st: MountState = { gen, bots: [], catalogs: {}, metaDoc: null, routes: [], routesOk: false, painted: new Map(), timer: null };
    let unsub: () => void = noop;
    try {
      unsub = fctx.subscribe((s) => {
        try {
          if (activeGen !== gen) return;
          st.bots = (s && Array.isArray(s.bots) ? s.bots : []) as BotSnap[];
          st.catalogs = (s && s.catalogs) || {};
          st.routesOk = false;
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
        scanAll(fctx, st, doc);
      }).catch(() => undefined);
    } catch { /* 名表失败即回退目录名 */ }
    let obs: { disconnect?: () => void } | null = null;
    try {
      const MO = typeof MutationObserver !== "undefined" ? MutationObserver : null;
      const target = (doc as { documentElement?: unknown }).documentElement ?? doc;
      if (MO && target) {
        const inst = new MO(() => { try { scheduleScan(fctx, st, doc); } catch { /* ignore */ } });
        inst.observe(target as Node, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase", "style", "class"] });
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
