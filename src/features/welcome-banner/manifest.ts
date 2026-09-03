/** welcome-banner 特性唯一出口（E4）：对话区欢迎横幅 A 变体 v1。
 * 挂载：conversation.session 真槽位（scrollBody 内、composer 上方 =  verdict 的“空态上方”），
 * data-phase=hero 门控（仅空会话渲染），sessionId 解析工作区（B3 同款），X 关闭为内存态。 */
import { installFeatureStyles } from "../../client/theme";
import type { FeatureManifest } from "../protocol";
import { mountBanner } from "./view";
import { CSS } from "./styles";

export const feature: FeatureManifest = {
  id: "welcome-banner",
  name: "欢迎横幅",
  order: 21,
  slots: [{ target: "conversation-session", mount: (ctx) => mountBanner(ctx) }],
  installStyles: () => installFeatureStyles("welcome-banner", CSS),
};
