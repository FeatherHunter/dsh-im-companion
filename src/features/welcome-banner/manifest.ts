/** welcome-banner 特性唯一出口（E4）：对话区 P 时辰主页。
 * 挂载：零槽位 body 顶层弹窗（research/06 事故结论：conversation.session 系 single 独占槽，
 * 任何 register 都会撞车致 DSH 无法启动；本特性永不调用 slots API）。
 * data-phase=hero 三信号门控（仅空会话渲染）+ 可见性门；未绑定零 UI；
 * 中央“进门”与点 backdrop 同出口（内存+持久双记），无换一句。 */
import { installFeatureStyles } from "../../client/theme";
import type { FeatureManifest } from "../protocol";
import { mountBanner } from "./overlay";
import { CSS } from "./styles";

export const feature: FeatureManifest = {
  id: "welcome-banner",
  name: "欢迎横幅",
  order: 21,
  slots: [{ target: "conversation-session", mount: (ctx) => mountBanner(ctx) }],
  installStyles: () => installFeatureStyles("welcome-banner", CSS),
};
