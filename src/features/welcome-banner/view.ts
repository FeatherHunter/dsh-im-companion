/** welcome-banner 视图（E4 P 时辰 v1）：顶层居中弹窗 + 命令式渲染。
 * 启动安全（research/06，事故结论）：conversation.session 是 single 独占槽，任何 register
 * 都会与宿主默认 occupant 撞车致 DSH 无法启动，且注册回调延迟执行、try/catch 兜不住。
 * 本特性永不调用 slots.inject/register（零注册 → 数学上不可能冲突）。
 * 门控证据（一手 bundle）：hero 空态 = div[data-phase="hero"]（data 属性非哈希类名；
 * hero ⟺ blank 会话）；标题“探索未至之境”/Into the Unknown + 徽标“预览版”/Preview 三信号确认。
 * 呈现（用户 verdict）：不占据对话框版面——hero 只做门控，卡片挂到 body 顶层居中弹窗；
 * 点 backdrop 与点“回家”是同一出口（进门，内存+持久双记），无 X、无换一句、无死按钮。
 * 门控：非 hero/信号不全/工作区 label 匹配不出或歧义/未绑定 → 一律不渲染（宁缺勿错）；
 * 未绑定零 UI（纯净原生空态），不画指引卡。 */
import { h } from "../../client/dom";
import type { HealthKind } from "../../client/data/config";
import type { TimeCopy } from "./data";

export { PHASE_SELECTOR, heroConfirmed, heroWorkspaceLabel, isVisible } from "./anchor";

export interface HomeCallbacks {
  onEnter: () => void;
}

function dotClass(status: string): string {
  if (status === "online") return "wb-dot wb-online";
  if (status === "warn") return "wb-dot wb-warn";
  if (status === "offline") return "wb-dot wb-offline";
  return "wb-dot wb-offline";
}

function appendStars(sky: HTMLElement): void {
  for (let k = 0; k < 20; k++) {
    const sx = (k * 37) % 100;
    const sy = (k * 53) % 70;
    sky.appendChild(h("span", {
      className: "wb-star",
      style: "left:" + sx + "%;top:" + sy + "%;animation-delay:" + ((k % 7) * 0.4) + "s",
    }));
  }
}

function appendClouds(sky: HTMLElement): void {
  sky.appendChild(h("div", { className: "wb-cloud wb-c1" }));
  sky.appendChild(h("div", { className: "wb-cloud wb-c2" }));
}

/** P 弹窗渲染：顶层遮罩 + 居中面板（全幅天空 + 大标题 + 真实健康副标题 + 进门按钮）。 */
export function renderHome(input: {
  copy: TimeCopy;
  status: HealthKind;
  stateLabel: string;
  subSuffix: string;
  callbacks: HomeCallbacks;
}): HTMLElement {
  const { copy, status, stateLabel, subSuffix, callbacks } = input;
  const root = h("div", { className: "wb-modal", dataset: { wb: copy.seg } });
  root.appendChild(h("div", { className: "wb-backdrop", onclick: () => callbacks.onEnter() }));
  const card = h("section", { className: "wb-banner" });
  const sky = h("div", { className: "wb-sky " + copy.sky });
  if (copy.moon) sky.appendChild(h("div", { className: "wb-moon" }));
  else sky.appendChild(h("div", { className: "wb-sun" }));
  if (copy.moon) appendStars(sky);
  else appendClouds(sky);
  if (copy.horizon) sky.appendChild(h("div", { className: "wb-horizon" }));
  sky.appendChild(h("div", { className: "wb-copy" },
    h("div", { className: "wb-title" }, copy.t),
    h("div", { className: "wb-sub" },
      h("span", { className: dotClass(status) }),
      stateLabel + " · " + subSuffix,
    ),
  ));
  sky.appendChild(h("div", { className: "wb-cta" },
    h("button", { className: "wb-enter", onclick: () => callbacks.onEnter() },
      copy.b,
      h("small", { className: "wb-enter-sub" }, copy.bs),
    ),
  ));
  card.appendChild(sky);
  root.appendChild(card);
  return root;
}
