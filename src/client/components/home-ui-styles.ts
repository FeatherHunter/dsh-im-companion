/** 绿框（家→助理→机器人）样式表：布局值逐字取自 T4 认可款原型 proto-studio.html，
 * 颜色令牌改挂 DSH 主题别名（--af-*）⇒ 深浅色自动跟随（owner 裁定 2026-10-12）。
 * 命名空间：所有规则挂 .home-ui 之下（契约 §6，不占 .af-*，不污染全局 .row/.btn）。
 * 类前缀 hu-*；popover 走 body 级 portal（宿主同样带 .home-ui 类，作用域不破）。 */
import { installFeatureStyles } from '../theme'

export const HOME_UI_STYLE_ID = 'home-greenbox'

export const HOME_UI_CSS = `
.home-ui{
  --hu-panel:var(--af-bg); --hu-panel-2:var(--af-surface); --hu-panel-3:var(--af-surface-2);
  --hu-ink:var(--af-primary); --hu-ink-2:var(--af-secondary); --hu-ink-3:var(--af-tertiary);
  --hu-line:var(--af-hairline-strong); --hu-line-soft:var(--af-hairline);
  --hu-accent:var(--af-accent); --hu-accent-deep:var(--af-accent);
  --hu-accent-soft:color-mix(in srgb, var(--af-accent) 12%, transparent);
  --hu-warn:var(--af-warn); --hu-warn-soft:color-mix(in srgb, var(--af-warn) 12%, transparent);
  --hu-bad:var(--af-danger); --hu-bad-soft:color-mix(in srgb, var(--af-danger) 12%, transparent);
  --hu-neutral:color-mix(in srgb, var(--af-secondary) 12%, transparent);
  --hu-r:10px; --hu-r-lg:14px;
  --hu-sh:0 1px 2px rgba(16,24,40,.05);
  --hu-sh-2:0 18px 40px -18px rgba(16,24,40,.28);
  --hu-sh-pop:0 0 0 1px rgba(16,24,40,.04),0 2px 4px rgba(16,24,40,.06),0 22px 52px -18px rgba(16,24,40,.5);
  --hu-ring:0 0 0 3px color-mix(in srgb, var(--af-accent) 22%, transparent);
  --hu-t-fast:120ms; --hu-t:160ms; --hu-t-med:220ms;
  --hu-ease:cubic-bezier(.2,.7,.2,1); --hu-spring:cubic-bezier(.34,1.36,.4,1);
  box-sizing:border-box; display:flex; flex-direction:column; color:var(--hu-ink);
  font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif;
  -webkit-font-smoothing:antialiased; font-feature-settings:"tnum" 1}
.home-ui *,.home-ui *::before,.home-ui *::after{box-sizing:border-box}
.home-ui .hu-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
.home-ui [hidden]{display:none!important}
.home-ui .hu-i{width:15px;height:15px;display:block;flex:none}
.home-ui button:focus-visible,.home-ui input:focus-visible,.home-ui select:focus-visible,.home-ui [tabindex]:focus-visible{outline:2px solid var(--hu-accent);outline-offset:2px}

/* ============ frame ============ */
.home-ui .hu-fhead{display:flex;align-items:center;gap:8px;padding:11px 10px 3px;flex:none}
.home-ui .hu-fhead .hu-ttl{min-width:0;flex:1}
.home-ui .hu-fhead .hu-ttl b{display:block;font-size:15px;font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-fhead .hu-ttl small{display:block;font-size:11.5px;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-ibtn{width:32px;height:32px;display:grid;place-items:center;background:none;border:1px solid transparent;border-radius:9px;color:var(--hu-ink-2);cursor:pointer;transition:all var(--hu-t) var(--hu-ease);flex:none}
.home-ui .hu-ibtn:hover{background:var(--hu-panel-3);color:var(--hu-ink)}
.home-ui .hu-ibtn:active{transform:scale(.94)}
.home-ui .hu-ibtn.solid{background:var(--hu-accent);color:#fff}
.home-ui .hu-ibtn[disabled]{opacity:.4;cursor:not-allowed}
.home-ui .hu-back{width:32px;height:32px;display:grid;place-items:center;background:var(--hu-panel-3);border:0;border-radius:9px;color:var(--hu-ink-2);cursor:pointer;transition:all var(--hu-t) var(--hu-ease);flex:none}
.home-ui .hu-back:hover{color:var(--hu-ink)}
.home-ui .hu-back:active{transform:scale(.94)}

/* ============ crumbs（液签面包屑） ============ */
.home-ui .hu-crumbs{position:relative;display:flex;align-items:center;gap:6px;margin:8px 0 0;padding:7px 10px;border:1px solid var(--hu-line-soft);border-radius:12px;flex:none;background:var(--hu-panel-2);overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.home-ui .hu-crumbs::-webkit-scrollbar{display:none}
.home-ui .hu-crumbs::-webkit-scrollbar{display:none}
.home-ui .hu-crumb{font:inherit;font-size:11.5px;display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid transparent;flex:none;border-radius:999px;padding:3px 9px;color:var(--hu-ink-3);cursor:pointer;white-space:nowrap;transition:color var(--hu-t) var(--hu-ease);position:relative;z-index:1}
.home-ui .hu-crumb:hover{color:var(--hu-ink-2)}
.home-ui .hu-crumb[aria-current="true"]{color:var(--hu-ink);font-weight:650;background:var(--hu-panel);border-color:var(--hu-line)}
.home-ui .hu-crumb[aria-current="true"]:hover{background:var(--hu-accent-soft);border-color:var(--hu-accent);color:var(--hu-accent-deep)}
.home-ui .hu-crumb.off{opacity:.42;cursor:not-allowed;border-style:dotted}
.home-ui .hu-crumb.next{border:1px dashed var(--hu-line);color:var(--hu-ink-2);background:var(--hu-panel)}
.home-ui .hu-crumb.next:hover{background:var(--hu-accent-soft);border-color:var(--hu-accent);color:var(--hu-accent-deep);border-style:solid}
.home-ui .hu-crumb .hu-lv{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:var(--hu-ink-3)}
.home-ui .hu-crumb b{max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.home-ui .hu-crumb.next .hu-go{width:12px;height:12px;opacity:.65}
.home-ui .hu-crumb.next:hover .hu-go{opacity:1}
.home-ui .hu-csplit{color:var(--hu-ink-3);font-size:11px;flex:none;opacity:.8}
.home-ui .hu-tablk{position:absolute;left:0;top:0;border-radius:999px;background:var(--hu-panel);border:1px solid var(--hu-line);box-shadow:var(--hu-sh);transition:transform 300ms var(--hu-spring),width 300ms var(--hu-spring),height 300ms var(--hu-spring);pointer-events:none}

/* ============ list ============ */
/* 绿框不自造滚动容器：整页只留宿主一条滚动条（内层滚动既丑又与页面滚动嵌套打架）。
   另外：一旦给元素写 webkit 滚动条伪元素，Chromium 会切回「经典滚动条」渲染（带上下箭头按钮），
   所以这里连 width/thumb 都不写。 */
.home-ui .hu-fbody{flex:1;min-height:0;margin:10px 0 8px;padding:10px;display:flex;flex-direction:column;gap:8px;background:var(--hu-panel-2);border:1px solid var(--hu-line-soft);border-radius:14px}
.home-ui .hu-row{position:relative;display:grid;grid-template-columns:36px 1fr auto;gap:13px;align-items:center;width:100%;text-align:left;font:inherit;color:inherit;
  background:var(--hu-panel);border:1px solid var(--hu-line-soft);border-radius:var(--hu-r);padding:9px 10px;cursor:pointer;
  transition:border-color var(--hu-t) var(--hu-ease),box-shadow var(--hu-t) var(--hu-ease),transform var(--hu-t-fast) var(--hu-ease);min-height:56px}
.home-ui .hu-row:hover{border-color:var(--hu-line);box-shadow:var(--hu-sh)}
.home-ui .hu-row:active{transform:scale(.994)}
.home-ui .hu-row.on{border-color:var(--hu-accent);background:color-mix(in srgb, var(--af-accent) 5%, var(--hu-panel));box-shadow:var(--hu-sh)}
.home-ui .hu-row.hu-flash{animation:huRowIn var(--hu-t-med) var(--hu-spring)}
.home-ui .hu-row.off .hu-av{filter:grayscale(.45);opacity:.8}
@keyframes huRowIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.home-ui .hu-row .hu-txt{min-width:0;overflow:hidden}
.home-ui .hu-row .hu-nm{display:flex;align-items:baseline;gap:7px;min-width:0;overflow:hidden}
.home-ui .hu-row .hu-nm b{font-size:13.5px;font-weight:620;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;margin-right:1px}
.home-ui .hu-row .hu-sub{display:block;margin-top:5px;font-size:11.5px;line-height:1.4;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-names{display:block;margin-top:4px;font-size:11px;line-height:1.45;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-acts2{display:flex;align-items:center;gap:5px;flex:none;padding-left:2px}
.home-ui .hu-dots{display:inline-flex;align-items:center;gap:4px;flex:none;align-self:center;padding-left:1px}
.home-ui .hu-dots .hu-dot.on{background:var(--af-success);box-shadow:none}
.home-ui .hu-dots .hu-dot.off{background:var(--hu-bad);box-shadow:none}
.home-ui .hu-av{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-weight:650;font-size:14px;letter-spacing:-.02em;flex:none}
.home-ui .hu-av.round{border-radius:50%}
.home-ui .hu-av.sm{width:30px;height:30px;font-size:12.5px;border-radius:9px}
.home-ui .hu-pill{font-size:10.5px;font-weight:600;border-radius:999px;padding:2px 7px;white-space:nowrap;flex:none;align-self:center}
.home-ui .hu-pill.ok{color:var(--hu-accent-deep);background:var(--hu-accent-soft)}
.home-ui .hu-pill.warn{color:var(--hu-warn);background:var(--hu-warn-soft)}
.home-ui .hu-pill.bad{color:var(--hu-bad);background:var(--hu-bad-soft)}
.home-ui .hu-pill.dim{color:var(--hu-ink-2);background:var(--hu-neutral)}
.home-ui .hu-dot{width:7px;height:7px;border-radius:50%;flex:none}
.home-ui .hu-dot.on{background:var(--hu-accent);box-shadow:0 0 0 3px var(--hu-accent-soft)}
.home-ui .hu-dot.off{background:color-mix(in srgb, var(--hu-ink-3) 70%, var(--hu-panel))}
.home-ui .hu-dot.zero{background:none;border:1.5px solid var(--hu-ink-3);opacity:.55;box-sizing:border-box}
.home-ui .hu-online{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--hu-accent-deep);background:var(--hu-accent-soft);border-radius:999px;padding:2px 7px;white-space:nowrap;flex:none;align-self:center}
.home-ui .hu-online.off{color:var(--hu-ink-2);background:var(--hu-neutral)}

/* ============ row action buttons + tooltip ============ */
.home-ui .hu-ract{font:inherit;font-size:11.5px;height:26px;padding:0 9px;display:inline-flex;align-items:center;gap:5px;background:var(--hu-panel);border:1px solid var(--hu-line);
  border-radius:7px;color:var(--hu-ink-3);cursor:pointer;white-space:nowrap;transition:all var(--hu-t) var(--hu-ease);flex:none;position:relative}
.home-ui .hu-ract:hover{background:var(--hu-panel-3);color:var(--hu-ink)}
.home-ui .hu-ract:active{transform:scale(.94)}
.home-ui .hu-ract.connect{border-color:var(--hu-accent);background:var(--hu-accent-soft);color:var(--hu-accent-deep);font-weight:600}
.home-ui .hu-ract.icon{width:26px;padding:0;justify-content:center}
/* 危险动作（T10b #127「删除家」）：与 .hu-abtn.danger 同口径——孤儿家才出现，正常家没有这个入口。 */
.home-ui .hu-ract.danger{color:var(--hu-bad);border-color:var(--hu-bad);background:var(--hu-bad-soft)}
/* 未实现钮（T6b/T6c）：语义化禁用——**常态对比度** + 虚线边，不再 opacity .45（深色下读起来像坏了）。
   悬停仍出 tooltip 说明归属票号。 */
.home-ui .hu-ract.planned,.home-ui .hu-abtn.planned,.home-ui .hu-ibtn.planned,.home-ui .hu-pbtn.planned{
  opacity:1;background:var(--hu-panel-2);border-style:dashed;color:var(--hu-ink-3);cursor:not-allowed}
.home-ui .hu-ract.planned:hover,.home-ui .hu-abtn.planned:hover,.home-ui .hu-ibtn.planned:hover{background:var(--hu-panel-2);color:var(--hu-ink-3)}
.home-ui .hu-ract[disabled]:not(.planned),.home-ui .hu-abtn[disabled]:not(.planned){opacity:.45;cursor:not-allowed}
/* 「待实现」清单：替掉 5 枚假按钮（真机反馈 2026-10-13） */
.home-ui .hu-soon{margin:0;font-size:11px;color:var(--hu-ink-3);line-height:1.6}
.home-ui [data-tip]{position:relative}
.home-ui [data-tip]::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%) translateY(3px) scale(.96);
  background:var(--hu-ink);color:var(--hu-panel);font-size:11px;font-weight:500;line-height:1;padding:6px 8px;border-radius:7px;white-space:nowrap;
  opacity:0;pointer-events:none;transition:opacity var(--hu-t) var(--hu-ease),transform var(--hu-t) var(--hu-spring);z-index:80;
  /* 未悬停时不参与布局：待实现钮的提示文案比原型长，常驻会撑出面板横向滚动条 */
  display:none}
.home-ui [data-tip]:hover::after,.home-ui [data-tip]:focus-visible::after{display:block;opacity:1;transform:translateX(-50%) translateY(0) scale(1)}

/* ============ detail ============ */
.home-ui .hu-detail{border:1px solid var(--hu-line-soft);border-radius:var(--hu-r);background:var(--hu-panel-2);padding:12px;display:flex;flex-direction:column;gap:10px;
  transform-style:preserve-3d;transition:transform var(--hu-t-med) var(--hu-ease),box-shadow var(--hu-t-med) var(--hu-ease)}
.home-ui .hu-dhead{display:flex;align-items:center;gap:10px;min-width:0}
.home-ui .hu-dhead .hu-txt{min-width:0;flex:1}
.home-ui .hu-dhead b{display:block;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-dhead small{display:block;font-size:11.5px;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-meta{display:flex;flex-wrap:wrap;gap:6px;min-width:0;align-items:center}
.home-ui .hu-mchip{font-size:11px;color:var(--hu-ink-2);background:var(--hu-panel);border:1px solid var(--hu-line-soft);border-radius:7px;padding:4px 8px;display:inline-flex;align-items:center;gap:5px;max-width:100%;min-width:0}
.home-ui .hu-steps3{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--hu-ink-3);flex-wrap:wrap}
.home-ui .hu-steps3 i{display:block;width:12px;height:1px;background:var(--hu-line);flex:none}
.home-ui .hu-chain{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px}
.home-ui .hu-chain span{color:var(--hu-ink-3);background:var(--hu-panel);border:1px solid var(--hu-line-soft);border-radius:999px;padding:3px 9px;white-space:nowrap}
.home-ui .hu-chain span.on{color:var(--hu-accent-deep);background:var(--hu-accent-soft);border-color:var(--hu-accent);font-weight:650}
.home-ui .hu-chain i{width:10px;height:1px;background:var(--hu-line);display:block;flex:none}
.home-ui .hu-botblock{border-top:1px solid var(--hu-line-soft);padding-top:11px;margin-top:2px;display:flex;flex-direction:column;gap:8px}
.home-ui .hu-big{display:flex;align-items:center;gap:9px;min-width:0}
.home-ui .hu-big .hu-bic{width:34px;height:34px;border-radius:50%;background:var(--hu-ink);color:var(--hu-panel);display:grid;place-items:center;flex:none}
.home-ui .hu-big .hu-bic.off{background:var(--hu-panel-3);color:var(--hu-ink-2)}
.home-ui .hu-big .hu-txt{min-width:0;flex:1}
.home-ui .hu-big b{display:block;font-size:13px;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-big small{display:block;font-size:11px;color:var(--hu-ink-3)}
.home-ui .hu-mchip .hu-i{width:13px;height:13px;color:var(--hu-ink-3)}
.home-ui .hu-acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(94px,1fr));gap:8px}
.home-ui .hu-acts.danger{margin-top:6px;padding-top:14px;border-top:1px dashed var(--hu-line)}
.home-ui .hu-abtn{font:inherit;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:33px;padding:0 10px;background:var(--hu-panel);
  border:1px solid var(--hu-line);border-radius:8px;color:var(--hu-ink);cursor:pointer;transition:all var(--hu-t) var(--hu-ease)}
.home-ui .hu-abtn:hover{background:var(--hu-panel-3)}
.home-ui .hu-abtn:active{transform:scale(.96)}
.home-ui .hu-abtn.go{border-color:var(--hu-accent);background:var(--hu-accent-soft);color:var(--hu-accent-deep);font-weight:600}
.home-ui .hu-abtn.danger{color:var(--hu-bad);border-color:var(--hu-bad);background:var(--hu-bad-soft)}
.home-ui .hu-abtn[disabled]{opacity:.45;cursor:not-allowed}

/* ============ footer ============ */
.home-ui .hu-ffoot{position:sticky;bottom:0;z-index:6;flex:none;padding:4px 0 0;background:linear-gradient(to bottom,transparent,var(--hu-panel) 60%);border-top:0;display:flex;gap:8px}
.home-ui .hu-pbtn{position:relative;overflow:hidden;flex:1;font:inherit;font-size:13px;font-weight:600;height:38px;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  background:var(--hu-accent);color:#fff;border:1px solid transparent;border-radius:9px;cursor:pointer;transition:transform var(--hu-t-fast) var(--hu-ease),background var(--hu-t) var(--hu-ease);
  box-shadow:0 1px 2px rgba(13,148,136,.3);will-change:transform}
.home-ui .hu-pbtn:hover{background:color-mix(in srgb, var(--af-accent) 84%, #000)}
.home-ui .hu-pbtn:active{transform:scale(.975)}
.home-ui .hu-pbtn.ghost{background:var(--hu-panel);color:var(--hu-ink);border-color:var(--hu-line)}
.home-ui .hu-pbtn.ghost:hover{background:var(--hu-panel-3)}
.home-ui .hu-pbtn[disabled]{opacity:.5;cursor:not-allowed}

/* ============ empty / skeleton / banner ============ */
.home-ui .hu-empty{padding:34px 18px;text-align:center;color:var(--hu-ink-3)}
.home-ui .hu-empty .hu-eic{width:40px;height:40px;margin:0 auto 10px;border-radius:13px;background:var(--hu-panel-3);display:grid;place-items:center}
.home-ui .hu-empty b{display:block;color:var(--hu-ink-2);font-size:13px;margin-bottom:3px}
.home-ui .hu-empty p{margin:0;font-size:11.5px;line-height:1.5}
.home-ui .hu-sk{display:block;border-radius:9px;background:linear-gradient(90deg,var(--hu-panel-3) 0%,var(--hu-panel-2) 50%,var(--hu-panel-3) 100%);background-size:200% 100%;animation:huSk 1.15s linear infinite}
@keyframes huSk{from{background-position:200% 0}to{background-position:-200% 0}}
/* 骨架行复用 .hu-row 的几何（网格/内距/最小高/圆角），行内灰条占**与真行文字相同的行盒**
 * （名字 20px / 副标 17px+5 / 清单 17px+4，取自 .hu-nm b / .hu-sub / .hu-names 的实际行高）
 * ⇒ 加载完只换内容，行高与总高逐像素不变。 */
.home-ui .hu-srow{pointer-events:none;cursor:default}
.home-ui .hu-srow:hover{border-color:var(--hu-line-soft);background:var(--hu-panel)}
.home-ui .hu-sk-av{width:36px;height:36px;border-radius:11px}
.home-ui .hu-scol{display:block;min-width:0}
.home-ui .hu-sline{display:flex;align-items:center;height:20px}
.home-ui .hu-sline:nth-child(2){height:17px;margin-top:5px}
.home-ui .hu-sline:nth-child(3){height:17px;margin-top:4px}
.home-ui .hu-sk-t1{width:38%;height:11px}
.home-ui .hu-sk-t2{width:64%;height:10px}
.home-ui .hu-sk-t3{width:46%;height:10px}
.home-ui .hu-sk-act{width:26px;height:26px;border-radius:7px}
/* 页头右侧动作簇（船 / 串门搬家 / 刷新）：与 ＋ 同行成簇，吃掉原工具栏行。
 * 只定义「槽位里孩子的几何」，不写任何 .af-* 私有类名——装配层交进来什么就排什么（契约 §6）。 */
.home-ui .hu-head-acts{margin-left:auto;display:flex;align-items:center;gap:6px;flex:none}
.home-ui .hu-head-acts > *{width:32px;height:32px;border-radius:10px;flex:none}
.home-ui .hu-spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--hu-accent-soft);border-top-color:var(--hu-accent);animation:huSp .7s linear infinite;flex:none}
/* 刷新钮在途态：图标原地转圈 + 整体压暗（禁用态由 button[disabled] 自己管）。
 * 手动动作必须在 100ms 内可见——「点了没反应」和「点了没变化」是两回事。 */
.home-ui .hu-head-acts .hu-busy svg{animation:huSp .9s linear infinite}
.home-ui .hu-head-acts .hu-busy{opacity:.6}
@keyframes huSp{to{transform:rotate(360deg)}}
.home-ui .hu-err{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--hu-warn);background:var(--hu-warn-soft);border:1px solid var(--hu-warn-soft);border-radius:9px;padding:8px 10px}
.home-ui .hu-err button{font:inherit;font-size:11.5px;color:inherit;background:none;border:1px solid currentColor;border-radius:7px;padding:2px 8px;cursor:pointer;flex:none}

/* ============ popover（锚定，禁底部弹窗） ============ */
/* 宿主（document.body 上的 portal）在支持 Popover API 的宿主里进 top layer——真机实测设置页可能
 * 落在比 z-index 更高的层（原生 dialog / top layer），只靠 z-index 会被整层盖住、点了像没反应（#112）。 */
.home-ui.hu-pophost{position:fixed;inset:0;z-index:71;pointer-events:none}
.home-ui.hu-pophost[popover]{width:100%;height:100%;margin:0;padding:0;border:0;background:transparent;color:inherit;
  overflow:visible;max-width:none;max-height:none;inset:0}
.home-ui .hu-scrim{position:fixed;inset:0;z-index:70;background:rgba(16,24,40,.30);animation:huFade var(--hu-t) var(--hu-ease);pointer-events:auto}
@keyframes huFade{from{opacity:0}to{opacity:1}}
.home-ui .hu-pop{position:fixed;z-index:71;max-width:calc(100vw - 20px);background:var(--hu-panel);border:1px solid var(--hu-line);border-radius:14px;box-shadow:var(--hu-sh-pop);
  animation:huPopIn var(--hu-t-med) var(--hu-spring);max-height:min(70vh,520px);display:flex;flex-direction:column;pointer-events:auto}
@keyframes huPopIn{from{opacity:0;transform:scale(.94) translateY(-6px)}to{opacity:1;transform:none}}
.home-ui .hu-pop .hu-arrow{position:absolute;top:-6px;width:12px;height:12px;background:var(--hu-panel);border-left:1px solid var(--hu-line);border-top:1px solid var(--hu-line);transform:rotate(45deg);border-radius:2px}
.home-ui .hu-pop .hu-arrow.b{top:auto;bottom:-6px;border-left:0;border-top:0;border-right:1px solid var(--hu-line);border-bottom:1px solid var(--hu-line)}
.home-ui .hu-ppo{padding:10px 14px 13px;overflow-y:auto;display:flex;flex-direction:column;gap:11px}
.home-ui .hu-phead{display:flex;align-items:center;gap:7px;padding:10px 12px 10px 14px;border-bottom:1px solid var(--hu-line-soft)}
.home-ui .hu-phead>.hu-pbtn-s:first-of-type{margin-left:auto}
.home-ui .hu-ptitle{font-size:12.5px;font-weight:650;display:flex;align-items:center;gap:7px;color:var(--hu-ink)}
.home-ui .hu-ptitle .hu-i{color:var(--hu-accent-deep)}
.home-ui .hu-pfoot{display:flex;justify-content:flex-end;gap:7px;padding:10px 12px;border-top:1px solid var(--hu-line-soft);background:var(--hu-panel-2);flex:none}
.home-ui .hu-pbtn-s{font:inherit;font-size:12.5px;font-weight:600;height:32px;padding:0 13px;border-radius:8px;cursor:pointer;border:1px solid var(--hu-line);background:var(--hu-panel);color:var(--hu-ink);transition:all var(--hu-t) var(--hu-ease)}
.home-ui .hu-pbtn-s:hover:not([disabled]){background:color-mix(in srgb,var(--hu-ink) 15%,var(--hu-panel))}
.home-ui .hu-pbtn-s.go{background:var(--hu-accent);border-color:transparent;color:#fff}
.home-ui .hu-pbtn-s[disabled]{opacity:.5;cursor:not-allowed}
.home-ui .hu-pbtn-s[disabled]:hover{background:var(--hu-panel)}
.home-ui .hu-pbtn-s.go[disabled]:hover{background:var(--hu-accent)}
/* 主按钮（.go）的底色是强调色，普通 :hover 被 .go 的同等特异性盖掉 ⇒ 单独给一条，否则悬停主按钮毫无变化（真机实测）。 */
.home-ui .hu-pbtn-s.go:hover:not([disabled]){background:color-mix(in srgb,var(--hu-accent) 74%,var(--hu-ink))}
.home-ui .hu-menu{display:flex;flex-direction:column;gap:2px;padding:5px;min-width:168px}
.home-ui .hu-menu button{font:inherit;font-size:12.5px;display:flex;align-items:center;gap:9px;text-align:left;background:none;border:0;border-radius:8px;padding:9px 10px;color:var(--hu-ink);cursor:pointer;transition:background var(--hu-t-fast) var(--hu-ease)}
.home-ui .hu-menu button:hover{background:var(--hu-panel-3)}
.home-ui .hu-menu button.danger{color:var(--hu-bad)}
.home-ui .hu-menu .hu-sep{height:1px;background:var(--hu-line-soft);margin:4px 6px}
.home-ui .hu-fld{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--hu-ink-2)}
.home-ui .hu-fld>span{font-weight:600;color:var(--hu-ink);font-size:12.5px}
.home-ui .hu-fld input,.home-ui .hu-fld select{font:inherit;font-size:13px;height:36px;padding:0 10px;color:var(--hu-ink);background:var(--hu-panel);border:1px solid var(--hu-line);border-radius:9px}
.home-ui .hu-fld input:focus,.home-ui .hu-fld select:focus{outline:0;border-color:var(--hu-accent);box-shadow:var(--hu-ring)}
.home-ui .hu-fhint{margin:0;font-size:11.5px;color:var(--hu-ink-3);line-height:1.5}
.home-ui .hu-err{color:var(--hu-bad)}
/* T8 #121：目录字段＝左侧按钮、右侧虚线输入位，两者等高同排一行（框＝路径位本体；未选＝虚线灰、已选＝实线亮）。
 * T10 #124：分段（用已有工作区/新建工作区）整体退场——家＝工作区的镜像，建家永远是新建工作区。 */
.home-ui .hu-dirrow{display:flex;flex-direction:row;gap:9px;align-items:stretch}
.home-ui .hu-dirpath{flex:1;min-width:0;display:flex;align-items:center;padding:0 10px;background:var(--hu-panel-2);border:1px dashed var(--hu-line);border-radius:9px;cursor:pointer;transition:border-color 160ms}
.home-ui .hu-dirpath:hover{border-color:color-mix(in srgb, var(--hu-ink) 42%, var(--hu-line))}
.home-ui .hu-dirpath.picked{border-style:solid}
.home-ui .hu-dirtext{min-width:0;font-size:11.5px;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-dirpath.picked .hu-dirtext{color:var(--hu-ink)}
.home-ui .hu-opts{display:flex;flex-direction:column;gap:4px;max-height:190px;overflow:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--hu-ink-3) 45%,transparent) transparent}
/* 弹层内的列表是唯一保留的内滚区域：用主题令牌画细滚动条，并显式关掉经典滚动条的箭头按钮 */
.home-ui .hu-opts::-webkit-scrollbar{width:6px;height:6px}
.home-ui .hu-opts::-webkit-scrollbar-button{display:none;width:0;height:0}
.home-ui .hu-opts::-webkit-scrollbar-track{background:transparent}
.home-ui .hu-opts::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--hu-ink-3) 40%,transparent);border-radius:999px}
.home-ui .hu-opts::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--hu-ink-3) 62%,transparent)}
.home-ui .hu-opt{display:flex;align-items:center;gap:9px;width:100%;text-align:left;font:inherit;font-size:12.5px;background:var(--hu-panel);border:1px solid var(--hu-line-soft);border-radius:9px;padding:8px 10px;cursor:pointer;color:var(--hu-ink);transition:all var(--hu-t) var(--hu-ease)}
.home-ui .hu-opt:hover{background:var(--hu-panel-3);border-color:color-mix(in srgb,var(--hu-ink) 24%,var(--hu-line))}
.home-ui .hu-opt[aria-selected="true"]{border-color:var(--hu-accent);background:var(--hu-accent-soft);box-shadow:var(--hu-ring)}
.home-ui .hu-opt[disabled]{opacity:.5;cursor:not-allowed}
.home-ui .hu-opt .hu-oi{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--hu-panel-3);flex:none;font-size:11px;font-weight:650}
.home-ui .hu-opt .hu-ot{min-width:0;flex:1}
.home-ui .hu-opt .hu-ot b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-opt .hu-ot small{display:block;font-size:11px;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-locked{display:flex;align-items:center;gap:9px;font-size:12.5px;background:var(--hu-panel);border:1px solid var(--hu-line-soft);border-radius:9px;padding:8px 10px;color:var(--hu-ink)}
.home-ui .hu-locked .hu-ot{min-width:0;flex:1}
.home-ui .hu-locked .hu-ot b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui .hu-locked .hu-ot small{display:block;font-size:11px;color:var(--hu-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.home-ui .hu-avrow{display:flex;gap:6px;flex-wrap:wrap}
.home-ui .hu-avopt{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:12px;font-weight:650;cursor:pointer;border:2px solid transparent}
.home-ui .hu-avopt[aria-selected="true"]{border-color:var(--hu-accent);box-shadow:var(--hu-ring)}
.home-ui .hu-plink{font:inherit;font-size:12px;text-align:left;background:none;border:0;color:var(--hu-accent-deep);cursor:pointer;padding:2px 0}
.home-ui .hu-plink.danger{color:var(--hu-bad)}
/* owner 2026-10-14：弹层里每个可点控件都要有交互反馈（悬停变样 + 按下回弹），不许「看着能点、点了没反应」。 */
.home-ui .hu-pbtn-s:active:not([disabled]){transform:scale(.97)}
.home-ui .hu-opt:active:not([disabled]){transform:scale(.995)}
.home-ui .hu-plink:hover{color:color-mix(in srgb,var(--hu-accent-deep) 70%,var(--hu-ink))}
.home-ui .hu-plink:active{transform:scale(.98)}
.home-ui .hu-plink.danger:hover{color:color-mix(in srgb,var(--hu-bad) 78%,var(--hu-ink))}
.home-ui .hu-avopt:hover:not([aria-selected="true"]){border-color:color-mix(in srgb,var(--hu-ink) 32%,var(--hu-line))}
.home-ui .hu-avopt:active{transform:scale(.94)}
.home-ui .hu-dirpath:active{border-color:var(--hu-accent);background:var(--hu-panel-3)}

@media (max-width:470px){.home-ui .hu-hide-narrow{display:none}}
@media (prefers-reduced-motion:reduce){.home-ui *,.home-ui *::before,.home-ui *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`

export function installHomeUiStyles(): () => void {
  return installFeatureStyles(HOME_UI_STYLE_ID, HOME_UI_CSS)
}
