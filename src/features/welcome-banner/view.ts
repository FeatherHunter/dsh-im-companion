/** welcome-banner 视图（E4 A 变体 v1）：conversation.session 真槽位挂载 + 命令式横幅渲染。
 * 证据链（一手）：hero 空态 = div[data-phase="hero"]（ConversationRoot.module 计算 phase；
 * hero ⟺ blank 会话）；槽位 conversation.session 位于 scrollBody 内 composer 上方（= verdict 空态上方）。
 * 门控三重：data-phase 非 hero 不渲染；workspace 解析不出不渲染；X 关闭记内存 dismissed。
 * 无死按钮：详情走 C1a 抽屉真消费者（OPEN_DRAWER_EVENT），刷新走单份 stream；其余一律静态文案。 */
import * as React from "react";
import { h, mount } from "../../client/dom";
import { OPEN_DRAWER_EVENT, channelLabel } from "../../client/data/config";
import { resolveWorkspacePath, type WorkspaceItem } from "../../client/data/header-overlay";
import { fetchRouteRows, type BotSnap } from "../../client/data/fleet-api";
import type { StreamSnapshot } from "../../client/data/connection-stream";
import type { AgentMetaDoc } from "../../client/data/meta";
import { basenameOf } from "../../client/data/model";
import type { FeatureCtx } from "../protocol";
import {
  actionSlotsFor, buildBannerModel, greetingForHour, pickTopRoutes, summarizeRoutes,
  type BannerModel, type RouteRef,
} from "./data";

export const SLOT_NAME = "conversation.session";
export const ENTRY_ID = "dsh-im-companion:welcome-banner";

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

interface SlotServices {
  inject?: (name: string, fn: () => unknown) => unknown;
  register?: (opts: Record<string, unknown>, comp: unknown) => unknown;
}

function readWorkspaces(fctx: FeatureCtx): WorkspaceItem[] {
  try {
    const get = (fctx as unknown as { get?: (n: string) => unknown }).get;
    if (typeof get !== "function") return [];
    const svc = get("workspaces") as { list?: { getSnapshot?: () => { items?: WorkspaceItem[] } } } | null;
    const items = svc?.list?.getSnapshot?.()?.items;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function phaseOf(node: { closest?: (s: string) => Element | null } | null): string {
  try {
    const root = node && typeof node.closest === "function" ? node.closest("[data-phase]") : null;
    const ph = root && typeof (root as Element).getAttribute === "function"
      ? (root as Element).getAttribute("data-phase") : null;
    return typeof ph === "string" ? ph : "";
  } catch {
    return "";
  }
}

interface ShellProps {
  sessionId?: string;
  fctx: FeatureCtx;
  gen: number;
}

function BannerShell(props: ShellProps): React.ReactElement | null {
  const { sessionId, fctx, gen } = props;
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [snap, setSnap] = React.useState<StreamSnapshot>({ bots: [], failed: [], updatedAt: 0, catalogs: {} });
  const [metaDoc, setMetaDoc] = React.useState<AgentMetaDoc | null>(null);
  const [routes, setRoutes] = React.useState<RouteRef[]>([]);
  const [phase, setPhase] = React.useState<string | null>(null);
  const [, setTick] = React.useState(0);
  const alive = () => {
    try { return activeGen === gen; } catch { return true; }
  };

  React.useEffect(() => {
    let stop: () => void = () => undefined;
    try { stop = fctx.subscribe((s) => { if (alive()) setSnap(s); }); } catch { /* 无订阅即静态 */ }
    try {
      void fctx.meta.loadMeta().then((m) => { if (alive()) setMetaDoc(m); }).catch(() => undefined);
    } catch { /* 名表失败即回退目录名 */ }
    return () => { try { stop(); } catch { /* ignore */ } };
  }, [sessionId]);

  React.useEffect(() => {
    let dead = false;
    try {
      void fetchRouteRows(fctx.rpc, (snap.bots ?? []).map((b: BotSnap) => ({ channel: b.channel, botId: b.botId })))
        .then((r) => { if (!dead && alive()) setRoutes(r); }).catch(() => undefined);
    } catch { /* 路由失败即空态 */ }
    return () => { dead = true; };
  }, [snap.updatedAt]);

  React.useEffect(() => {
    const read = () => { if (alive()) setPhase(phaseOf(boxRef.current)); };
    read();
    let obs: MutationObserver | null = null;
    try {
      if (typeof MutationObserver !== "undefined" && boxRef.current) {
        obs = new MutationObserver(read);
        const root = boxRef.current.closest("[data-phase]");
        if (root) obs.observe(root, { attributes: true, attributeFilter: ["data-phase"] });
      }
    } catch { /* 无观察即首帧判定 */ }
    return () => { try { obs?.disconnect(); } catch { /* ignore */ } };
  }, [sessionId]);

  if (phase !== "hero") return React.createElement("div", { ref: boxRef, className: "wb-slot", style: { display: "none" } });
  const workspacePath = sessionId ? resolveWorkspacePath(sessionId, readWorkspaces(fctx)) : undefined;
  const key = sessionId ?? workspacePath ?? "unknown";
  if (DISMISSED.has(key)) return React.createElement("div", { ref: boxRef, className: "wb-slot", style: { display: "none" } });
  const model = workspacePath
    ? buildBannerModel(snap.bots ?? [], metaDoc ?? { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }, workspacePath, snap.catalogs ?? {})
    : null;
  const mine = model
    ? routes.filter((r) => r && typeof r.chat === "string" && model.bots.some((b) => b.channel === r.channel && (!r.botId || b.botId === r.botId)))
    : [];
  const greeting = greetingForHour(new Date().getHours());
  const label = workspacePath ? basenameOf(workspacePath) || workspacePath : "当前";
  return React.createElement("div", {
    ref: boxRef,
    className: "wb-slot",
  }, React.createElement(BannerMount, {
    greeting, model, label, routes: mine,
    onDetail: () => { if (model) emitDrawer(model.key); },
    onRefresh: () => { try { void fctx.refresh(); } catch { /* ignore */ } },
    onDismiss: () => { DISMISSED.add(key); if (alive()) setTick((t) => t + 1); },
  }));
}

function BannerMount(input: {
  greeting: string; model: BannerModel | null; label: string; routes: RouteRef[];
  onDetail: () => void; onRefresh: () => void; onDismiss: () => void;
}): React.ReactElement {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    try {
      mount(host, renderBanner({
        greeting: input.greeting, model: input.model, workspaceLabel: input.label,
        routes: input.routes,
        callbacks: { onDetail: input.onDetail, onRefresh: input.onRefresh, onDismiss: input.onDismiss },
      }));
    } catch { /* 渲染失败留空壳 */ }
  });
  return React.createElement("div", { ref });
}

/** 挂载横幅：向 conversation.session 注册条目；任何异常静默无挂载（绝不影响原生会话）。 */
export function mountBanner(fctx: FeatureCtx): () => void {
  activeGen += 1;
  const gen = activeGen;
  let unregister: (() => void) | null = null;
  try {
    const slots = (fctx.slots ?? {}) as SlotServices;
    if (typeof slots.inject !== "function" || typeof slots.register !== "function") return () => undefined;
    const comp = (p: { sessionId?: string }) => BannerShell({ sessionId: p?.sessionId, fctx, gen });
    let injected: unknown = null;
    try {
      injected = slots.inject(SLOT_NAME, () => {
        const r = slots.register?.(
          { name: SLOT_NAME, id: ENTRY_ID, key: ENTRY_ID, order: 10, inject: () => ({}) }, comp);
        if (typeof r === "function") unregister = r as () => void;
        return unregister;
      });
    } catch { /* 老宿主无该槽位就跳过 */ }
    void injected;
  } catch {
    unregister = null;
  }
  return () => {
    try { if (activeGen === gen) activeGen += 1; } catch { /* ignore */ }
    try { unregister?.(); } catch { /* ignore */ }
  };
}
