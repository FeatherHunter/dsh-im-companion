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
import { channelLabel } from "../../client/data/config";
import { basenameOf } from "../../client/data/model";
import {
  actionSlotsFor, pickTopRoutes, summarizeRoutes,
  type BannerModel, type RouteRef,
} from "./data";

export { PHASE_SELECTOR, heroConfirmed, heroWorkspaceLabel, isVisible } from "./anchor";

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
      "已接入 " + sum.total + " 个会话：私聊 " + sum.p2p + " · 群聊 " + sum.group));
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


