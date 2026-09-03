/** welcome-banner 视图（E4 A 变体 v1）：零槽位 DOM 叠加 + 命令式横幅渲染。
 * 启动安全（research/06，事故结论）：conversation.session 是 single 独占槽，任何 register
 * 都会与宿主默认 occupant 撞车致 DSH 无法启动，且注册回调延迟执行、try/catch 兜不住。
 * 本特性永不调用 slots.inject/register（零注册 → 数学上不可能冲突）。
 * 锚点证据（一手 bundle）：hero 空态 = div[data-phase="hero"]（data 属性非哈希类名；
 * hero ⟺ blank 会话）；标题“探索未至之境”/Into the Unknown + 徽标“预览版”/Preview 三信号确认；
 * 卡片插到 hero 节点之前（= verdict 空态上方），输入框为独立兄弟节点、互不干扰。
 * 门控：非 hero/信号不全/工作区 label 匹配不出或歧义 → 一律不渲染（宁缺勿错）；X 关闭记内存。
 * 无死按钮：详情走 C1a 抽屉真消费者（OPEN_DRAWER_EVENT），刷新走单份 stream；其余一律静态文案。 */
import { h } from "../../client/dom";
import { OPEN_DRAWER_EVENT, channelLabel } from "../../client/data/config";
import { fetchRouteRows, type BotSnap } from "../../client/data/fleet-api";
import type { AgentMetaDoc } from "../../client/data/meta";
import { basenameOf, viewName } from "../../client/data/model";
import type { FeatureCtx } from "../protocol";
import {
  actionSlotsFor, buildBannerModel, greetingForHour, matchWorkspaceLabel, pickTopRoutes, summarizeRoutes,
  type BannerModel, type RouteRef, type WsCandidate,
} from "./data";

import { eachHero, heroConfirmed, heroWorkspaceLabel, phaseAttr, textOf } from "./anchor";
export { PHASE_SELECTOR, heroConfirmed, heroWorkspaceLabel } from "./anchor";

/** X 关闭记忆（内存态，key = sessionId ?? workspacePath；切会话即新 key，天然恢复）。 */
const DISMISSED = new Set<string>();
/** 热更新/双挂载代际哨兵（同 left-badges）。 */
let activeGen = 0;

export interface BannerCallbacks {
  onDetail: () => void;
  onRefresh: () => void;
  onDismiss: () => void;
}

function dotClass(status: string): string {
  if (status === "online") return "wb-dot wb-online";
  if (status === "warn") return "wb-dot wb-warn";
  if (status === "offline") return "wb-dot wb-offline";
  return "wb-dot wb-unbound";
}

function emitDrawer(key: string): void {
  try {
    if (typeof window === "undefined" || typeof window.CustomEvent !== "function") return;
    window.dispatchEvent(new window.CustomEvent(OPEN_DRAWER_EVENT, { detail: { key } }));
  } catch {
    /* 派发失败不影响展示 */
  }
}

export function renderBanner(input: {
  greeting: string;
  model: BannerModel | null;
  workspaceLabel: string;
  routes: RouteRef[];
  callbacks: BannerCallbacks;
}): HTMLElement {
  const { greeting, model, workspaceLabel, routes, callbacks } = input;
  const bound = !!model;
  const slots = actionSlotsFor(bound);
  const card = h("section", { className: "wb-banner", dataset: { wb: bound ? model.key : "unbound" } });
  const close = h("button", { className: "wb-x", title: "关闭（本会话不再显示）", onclick: () => callbacks.onDismiss() }, "✕");
  card.appendChild(close);
  if (!model) {
    const head = h("div", { className: "wb-head" },
      h("div", { className: "wb-avatar" }, "?"),
      h("div", null,
        h("div", { className: "wb-name" }, greeting + "，这里是" + workspaceLabel + "的对话区"),
        h("div", { className: "wb-sub" }, "当前工作区尚未绑定 Agent"),
      ),
    );
    card.appendChild(head);
    card.appendChild(h("div", { className: "wb-guide" }, "在 IM机器人辅助里把 Bot 绑定到本工作区，绑定后这里会出现欢迎横幅。"));
  } else {
    const avatarBody: (string | HTMLElement)[] = model.avatar
      ? [h("img", { src: model.avatar, alt: model.name })]
      : [model.initial];
    const head = h("div", { className: "wb-head" },
      h("div", { className: "wb-avatar" }, ...avatarBody),
      h("div", null,
        h("div", { className: "wb-name" }, "👋 " + greeting + "，" + model.name),
        h("div", { className: "wb-sub" },
          h("span", { className: dotClass(model.status) }),
          model.stateLabel + " · 家：" + (basenameOf(model.workspace) || model.workspace),
        ),
        h("div", { className: "wb-chips" }, ...model.channels.map((c) =>
          h("span", { className: "wb-chip" },
            h("span", { className: dotClass(c.status) }),
            (c.label || channelLabel(c.id)),
          ))),
      ),
    );
    card.appendChild(head);
    const idBits: string[] = [];
    if (model.presetText) idBits.push("预设·" + model.presetText);
    if (model.ctxText) idBits.push(model.ctxText);
    if (idBits.length) card.appendChild(h("div", { className: "wb-idrow" }, idBits.join(" · ")));
    const mine = (routes ?? []).filter((r) => r && typeof r.chat === "string");
    const sum = summarizeRoutes(mine);
    const top = pickTopRoutes(mine, 3);
    const box = h("div", { className: "wb-routes" });
    box.appendChild(h("div", { className: "wb-routetitle" },
      "已接入 " + sum.total + " 个会话（" + sum.p2p + " 私聊 · " + sum.group + " 群聊）"));
    if (!top.shown.length) {
      box.appendChild(h("div", { className: "wb-noroutes" }, "暂无会话路由：有新的私聊/群聊消息后自动出现。"));
    }
    for (const r of top.shown) {
      const row = h("div", { className: "wb-route" },
        h("span", null,
          h("b", null, r.chat),
          r.ghost ? h("span", { className: "wb-ghost" }, "旧映射") : null,
          h("br", null),
          h("code", { className: "wb-code" }, r.sessionId),
        ),
        h("span", { className: "wb-note" }, (r.channel ? channelLabel(r.channel) : "") + " · 真机直达待联调"),
      );
      box.appendChild(row);
    }
    if (top.overflow > 0) box.appendChild(h("div", { className: "wb-more" }, "还有 " + top.overflow + " 个未列出"));
    card.appendChild(box);
  }
  const bar = h("div", { className: "wb-actions" });
  for (const s of slots) {
    if (s === "detail") {
      bar.appendChild(h("button", { className: "wb-btn wb-btn-primary", onclick: () => callbacks.onDetail() }, "Agent 详情"));
    } else {
      bar.appendChild(h("button", { className: "wb-btn", onclick: () => callbacks.onRefresh() }, "检查连接"));
    }
  }
  card.appendChild(bar);
  return card;
}

interface MountState {
  gen: number;
  bots: BotSnap[];
  catalogs: Record<string, { defaultId: string; items: { id: string; label: string }[] }>;
  metaDoc: AgentMetaDoc | null;
  routes: RouteRef[];
  painted: Map<string, { node: unknown; parent: unknown; sig: string }>;
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
  if (!label) return;
  const key = "hero:" + label;
  if (DISMISSED.has(key)) {
    removePainted(st, key);
    return;
  }
  const path = matchWorkspaceLabel(label, candidatesOf(st.bots, st.metaDoc));
  const emptyMeta = { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const model = path ? buildBannerModel(st.bots, st.metaDoc ?? emptyMeta, path, st.catalogs ?? {}) : null;
  if (path && !model) {
    removePainted(st, key);
    return;
  }
  const mine = model
    ? st.routes.filter((r) => r && typeof r.chat === "string" && model.bots.some((b) => b.channel === r.channel && (!r.botId || b.botId === r.botId)))
    : [];
  const greeting = greetingForHour(new Date().getHours());
  const showLabel = path ? basenameOf(path) || path : label;
  let card: unknown = null;
  try {
    card = renderBanner({
      greeting, model, workspaceLabel: showLabel, routes: mine,
      callbacks: {
        onDetail: () => { if (model) emitDrawer(model.key); },
        onRefresh: () => { try { void fctx.refresh(); } catch { /* ignore */ } },
        onDismiss: () => {
          try { DISMISSED.add(key); } catch { /* ignore */ }
          removePainted(st, key);
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
    const sig = (model ? model.key + "|" + model.name : "unbound") + "|" + mine.length;
    const prev = st.painted.get(key);
    if (prev && (prev.parent as unknown) === (parent as unknown) && prev.node && prev.sig === sig) return;
    removePainted(st, key);
    parent.insertBefore(card, heroRoot);
    st.painted.set(key, { node: card, parent, sig });
  } catch { /* 宿主 DOM 变化即跳过本轮 */ }
}

function scanAll(fctx: FeatureCtx, st: MountState, doc: unknown): void {
  try {
    if (activeGen !== st.gen) return;
    eachHero(doc, (root) => paintHero(fctx, st, root));
  } catch { /* 整轮异常静默 */ }
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
    const st: MountState = { gen, bots: [], catalogs: {}, metaDoc: null, routes: [], painted: new Map() };
    let unsub: () => void = noop;
    try {
      unsub = fctx.subscribe((s) => {
        try {
          if (activeGen !== gen) return;
          st.bots = (s && Array.isArray(s.bots) ? s.bots : []) as BotSnap[];
          st.catalogs = (s && s.catalogs) || {};
          void fetchRouteRows(fctx.rpc, st.bots.map((b) => ({ channel: b.channel, botId: b.botId })))
            .then((r) => { if (activeGen === gen) { st.routes = r; scanAll(fctx, st, doc); } })
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
        const inst = new MO(() => { try { scanAll(fctx, st, doc); } catch { /* ignore */ } });
        inst.observe(target as Node, { childList: true, subtree: true });
        obs = inst;
      }
    } catch { /* 无观察即靠订阅节拍重扫 */ }
    try { scanAll(fctx, st, doc); } catch { /* ignore */ }
    return () => {
      try { if (activeGen === gen) activeGen += 1; } catch { /* ignore */ }
      try { unsub(); } catch { /* ignore */ }
      try { obs?.disconnect?.(); } catch { /* ignore */ }
      try {
        for (const key of [...st.painted.keys()]) removePainted(st, key);
      } catch { /* ignore */ }
    };
  } catch {
    return noop;
  }
}
