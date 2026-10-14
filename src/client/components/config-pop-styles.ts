/** 配置弹层样式（T12 #129）：命名空间 `.cfg-*`，只服务配置入口那一个弹层。
 *  走 `installFeatureStyles`（契约 §6）⇒ 不占 .af-*、不动 hu-* 既有规则；删掉本文件即整块退场。
 *  颜色只用 `--hu-*` 令牌（弹层宿主带 .home-ui ⇒ 令牌已定义，深浅色自动跟随）。 */
import { installFeatureStyles } from '../theme'

export const CONFIG_POP_STYLE_ID = 'imc-config-pop'

export const CONFIG_POP_CSS = `
.home-ui .cfg-path{
  margin:6px 0 0; padding:7px 9px; border-radius:9px;
  background:var(--hu-panel-3); color:var(--hu-ink);
  font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  word-break:break-all; user-select:all; -webkit-user-select:all;
}
.home-ui .cfg-files{margin:6px 0 0; color:var(--hu-ink-3); font-size:11.5px; line-height:1.5; word-break:break-all}
.home-ui .cfg-status{margin:8px 0 0; min-height:15px; color:var(--hu-ink-2); font-size:12px; line-height:1.5; word-break:break-word}
.cfg-copy-src{position:fixed; left:-9999px; top:0; opacity:0}
`

export function installConfigPopStyles(): () => void {
  return installFeatureStyles(CONFIG_POP_STYLE_ID, CONFIG_POP_CSS)
}
