/** T13 #135 L1 家行（B 方案）追加样式：两段式卡片 ＋ 助理条带 ＋ 芯片 ＋ 悬停小气泡。
 *
 * 为什么单开文件、并且只做「追加」：`home-ui-styles.ts` 已顶 300 行红线（契约 §5），而家行改版要
 * 加十几个类。故新增规则一律落这里，经 `installFeatureStyles` 以**独立 id** 注册（与绿框同款机制，
 * 幂等、热重载安全）；本文件不删改既有规则，`.hu-row` 的 grid 布局留给**助理行/渠道行**照旧用，
 * 家行靠 `.hrow` 修饰类切成两段式（见 `home-row-strip.ts`）。
 *
 * 命名空间（契约 §6）：所有规则挂 `.home-ui` 之下；新类一律 `hu-` 前缀；颜色只走 `--hu-*` 令牌
 * ⇒ 深浅主题自动跟随（不写死颜色值）。 */
import { installFeatureStyles } from '../theme'

export const HOME_ROW_STYLE_ID = 'home-row-l1'

export const HOME_ROW_CSS = `
/* 家行＝两段：上段身份（头像/名字/动作），下段条带（助理 / 空家入口 / 孤儿警示）。 */
.home-ui .hu-row.hrow{display:block;padding:10px 11px}
/* B 原型收敛版的行悬停＝只换边框＋底色（老 .hu-row 的投影在这里不出现，还原型） */
.home-ui .hu-row.hrow:hover{box-shadow:none}
/* 孤儿家主动作「选择工作区」：accent 高亮（B 原型 .hu-ract.strong，基表没有这档，落在这里） */
.home-ui .hu-ract.strong{color:var(--hu-accent-deep);border-color:var(--hu-accent);background:var(--hu-accent-soft);font-weight:600}
/* ---- 孤儿家两枚按钮的悬停/布防反馈（owner 2026-10-16：之前悬停没反应）----
 * 根因：基表 hover 把 .danger 排除在外（删除家天然无悬停）；.strong 的 idle 值又与基表 hover 值
 * 撞车（选择工作区悬停“看起来没动”）。⇒ 两枚按钮的反馈都落在这里，不回基表添行。
 * 特异度说明：「.home-ui .hu-acts2 .hu-ract.strong:hover」（5 级）压过基表 hover（4 级），与装配顺序无关。 */
.home-ui .hu-acts2 .hu-ract{transition:background var(--hu-t) var(--hu-ease),border-color var(--hu-t) var(--hu-ease),box-shadow var(--hu-t) var(--hu-ease),transform var(--hu-t-fast) var(--hu-ease)}
.home-ui .hu-acts2 .hu-ract.strong:hover{background:color-mix(in srgb,var(--hu-accent) 30%,transparent);border-color:var(--hu-accent);
  box-shadow:0 2px 10px -3px var(--hu-accent);transform:translateY(-1px)}
.home-ui .hu-acts2 .hu-ract.danger:hover{background:color-mix(in srgb,var(--hu-bad) 26%,transparent);border-color:var(--hu-bad);
  box-shadow:0 2px 10px -3px var(--hu-bad);transform:translateY(-1px)}
.home-ui .hu-acts2 .hu-ract:active{transform:scale(.94)}
/* 删除确认弹的主按钮（要求1 popconfirm）：危险红底白字，与行内 .danger 同口径，不用 accent 冒充。 */
.home-ui .hu-pbtn-s.danger{background:var(--hu-bad);border-color:transparent;color:#fff}
.home-ui .hu-pbtn-s.danger:hover:not([disabled]){background:color-mix(in srgb,var(--hu-bad) 78%,var(--hu-ink))}
.home-ui .hu-acts2 .hu-ract:focus-visible{outline:2px solid var(--hu-accent);outline-offset:2px}
.home-ui .hu-btop{display:grid;grid-template-columns:36px 1fr auto;gap:12px;align-items:center}
/* 手改过名才挂的来源 tag（默认命名规则不写出来 —— owner 2026-10-15） */
.home-ui .hu-scr{font-size:10px;font-weight:600;color:var(--hu-ink-2);background:var(--hu-neutral);border-radius:5px;padding:1px 6px;flex:none}

/* ---- 条带：一行不换行、溢出裁掉；降级由 JS 实测决定（见 home-row-strip.fitOnce） ---- */
.home-ui .hu-strip{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow:hidden;margin-top:9px;padding-top:9px;border-top:1px solid var(--hu-line-soft);min-height:30px}
/* ---- 助理芯片：头像 ＋ 名字 ＋ 状态点（**一个状态字都不写**，owner 2026-10-15）---- */
.home-ui .hu-chip{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:180px;background:var(--hu-panel-2);
  border:1px solid var(--hu-line-soft);border-radius:999px;padding:3px 9px 3px 3px;font-size:11px;font-weight:600;color:var(--hu-ink);
  transition:border-color var(--hu-t) var(--hu-ease),background var(--hu-t) var(--hu-ease),transform var(--hu-t-fast) var(--hu-ease)}
.home-ui .hu-chip:hover{border-color:color-mix(in srgb,var(--hu-accent) 55%,var(--hu-line));background:var(--hu-panel-3);transform:translateY(-1px)}
.home-ui .hu-chip.cmp{padding:3px}
.home-ui .hu-chip .hu-cav{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:9px;font-weight:700;flex:none;position:relative}
.home-ui .hu-chip .hu-cnm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.home-ui .hu-chip.unbound{border-style:dashed;color:var(--hu-ink-2)}
/* 状态点：绿＝在线、红＝离线/未绑定；收起档时贴到头像右下角（描边用面板底色，压出头像外沿） */
.home-ui .hu-cdot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--hu-ink-3)}
.home-ui .hu-cdot.on{background:var(--af-success)}
.home-ui .hu-cdot.off{background:var(--hu-bad)}
.home-ui .hu-cdot.none{background:none;border:1.5px solid var(--hu-ink-3);opacity:.6;box-sizing:border-box}
.home-ui .hu-chip .hu-cav .hu-cdot{position:absolute;right:-1px;bottom:-1px;border:1.5px solid var(--hu-panel-2)}

/* ---- 空家：＋ 建助理（零态即入口；可点控件必须给足交互反馈）---- */
.home-ui .hu-add{display:inline-flex;align-items:center;gap:4px;flex:none;font:inherit;font-size:10.5px;font-weight:650;cursor:pointer;
  color:var(--hu-accent-deep);background:transparent;border:1px dashed color-mix(in srgb,var(--hu-accent) 50%,transparent);
  border-radius:999px;padding:2.5px 9px;transition:background var(--hu-t) var(--hu-ease),border-color var(--hu-t) var(--hu-ease),transform var(--hu-t-fast) var(--hu-ease)}
.home-ui .hu-add:hover{background:var(--hu-accent-soft);border-color:var(--hu-accent);border-style:solid}
.home-ui .hu-add:active{transform:scale(.95)}

/* ---- 计数徽章：完整档与降级档同一个形状，密度说明「一共有几位」 ---- */
.home-ui .hu-cnt{display:inline-flex;align-items:center;flex:none;font-size:11px;font-weight:700;line-height:1.6;padding:1.5px 8px;border-radius:999px;
  background:color-mix(in srgb,var(--hu-accent) 15%,transparent);color:var(--hu-accent)}
.home-ui .hu-cnt.many{background:color-mix(in srgb,var(--hu-accent) 26%,transparent)}

/* ---- 孤儿家：红色警示一条（原工作区目录 ＋ ⚠），卡片红描边（owner 2026-10-15：一律改红）---- */
.home-ui .hu-row.hrow.orphan{background:color-mix(in srgb,var(--hu-bad) 7%,var(--hu-panel));border-color:color-mix(in srgb,var(--hu-bad) 40%,var(--hu-line-soft))}
.home-ui .hu-warnline{display:flex;align-items:center;gap:8px;margin-top:9px;padding-top:9px;border-top:1px solid color-mix(in srgb,var(--hu-bad) 26%,transparent);min-height:30px}
.home-ui .hu-warnline .hu-path{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--hu-ink-3);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.home-ui .hu-pill.alert{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;border-radius:999px;padding:2px 8px;flex:none;
  color:color-mix(in srgb,var(--hu-bad) 62%,var(--hu-ink));background:color-mix(in srgb,var(--hu-bad) 24%,transparent);border:1px solid color-mix(in srgb,var(--hu-bad) 58%,transparent)}

/* ---- 骨架行跟两段式家行同几何（上段头像/名条/动作 ＋ 下段条带灰条）：首屏灰条→真行只换内容不换几何 ---- */
.home-ui .hu-row.hrow.hu-srow{pointer-events:none;cursor:default}
.home-ui .hu-row.hrow.hu-srow:hover{border-color:var(--hu-line-soft);background:var(--hu-panel);box-shadow:none}
.home-ui .hu-sstrip{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:9px;border-top:1px solid var(--hu-line-soft);min-height:30px;overflow:hidden}
.home-ui .hu-sk-chip{width:64px;height:22px}
.home-ui .hu-sk-cnt{width:52px;height:20px}

/* ---- 键盘可达：条带里的可点件必须给焦点环（与既有 focus-visible 口径一致）---- */
.home-ui .hu-add:focus-visible{outline:2px solid var(--hu-accent);outline-offset:2px}

/* ---- 悬停小气泡：body 级 float（宿主同带 .home-ui），不被列表 overflow 裁掉 ----
 * 进 top layer（home-pop.ts 的 showLayer，#112 同款坑：设置页落在 dialog 下时 z-index 再高也没用；
 * 无 Popover API 的老环境退回 z-index（1260 压过 overlay 1250、让着 toast 1300）。盒子自带 af-portal
 * 保令牌作用域（body 在 .af-root 之外，否则 --hu-* 全失效、气泡透明裸奔——同 home-pop 宿主备注）。
 * [popover] 那一行只中和 UA 默认（未 show 前 display:none 藏盒、:popover-open 的 inset:0＋margin:auto
 * 会把按行内 top/left 定位的小盒拉变形）：border/底色/圆角走本表原规则，不动。
 * 方向必显式（真机血案：宿主环境样式给了 flex-direction:column，本表只写 display:flex 就全盘接管——
 * 日志铁证 tip-show flex=column box=113x91；凡依赖初始值的属性一律显式声明，不赌宿主脸色）。 */
.home-ui.hu-tiphost{position:fixed;z-index:1260;pointer-events:none;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:9px;max-width:260px;
  padding:8px 11px;border-radius:12px;background:var(--hu-panel-3);border:1px solid var(--hu-line);
  box-shadow:var(--hu-sh-pop);color:var(--hu-ink);font-size:12px;line-height:1.35;
  opacity:0;transform:translateY(4px) scale(.97);transition:opacity var(--hu-t) var(--hu-ease),transform var(--hu-t) var(--hu-ease)}
.home-ui.hu-tiphost.on{opacity:1;transform:translateY(0) scale(1)}
.home-ui.hu-tiphost .hu-tav{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none}
.home-ui.hu-tiphost .hu-tt{min-width:0}
.home-ui.hu-tiphost .hu-tt b{display:block;font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui.hu-tiphost .hu-tt small{display:flex;flex-direction:row;align-items:center;gap:5px;margin-top:3px;font-size:11px;color:var(--hu-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui.hu-tiphost .hu-tt small .hu-st{font-weight:700;color:var(--hu-ink)}
.home-ui.hu-tiphost .hu-tt small .hu-st-bad{color:var(--hu-bad)}
.home-ui.hu-tiphost .hu-tt small .hu-ch{display:inline-flex;flex-direction:row;align-items:center;gap:4px}
.home-ui.hu-tiphost .hu-tt small .hu-logo{display:inline-grid;place-items:center}
.home-ui.hu-tiphost .hu-tt small .hu-logo svg{display:block}
.home-ui.hu-tiphost .hu-tt small .hu-logo-fb{width:14px;height:14px;border-radius:4px;background:var(--hu-panel-2);border:1px solid var(--hu-line-soft);font-size:9px;color:var(--hu-ink-2)}
.home-ui.hu-tiphost[popover]{margin:0;inset:auto;overflow:visible}
/* ---- 顶栏吸顶（要求2）：页头＋面包屑同一 sticky 容器（home-frame.topEl），列表滚动时粘住，
 * 父容器（.home-ui）到底后随页滑出 —— 原生 sticky 即此语义，不另写 JS。背景不透明否则行会透出来；
 * 下 10px 垫进容器（margin 负抵），与 .hu-fbody 的 10px 上边距视觉同位。基表 home-ui-styles 已 300 行顶格，落这里。 */
.home-ui .hu-top{position:sticky;top:0;z-index:7;background:var(--hu-panel);padding-bottom:10px;margin-bottom:-10px}

/* ---- 绑定弹层空态的主出口（owner 2026-10-17：原来是文本链接「不明显」）----
 * 第一性原理：这里是空态下唯一可走的动作，视觉权重必须压过同弹层里被禁用的「创建」。
 * 与 .go 同底色（accent 实心）但撑满整行＋36px 高＋图标，做「块级主按钮」而不是页脚小按钮。
 * 父容器是列向 flex（.hu-fld），仍显式 width:100% —— 不赌 align-items 的初始值。
 * active 必须单独再写一条：hover 的特异性(5) 高于基表的 .hu-pbtn-s:active(4)，
 * 不给这条，按住时仍浮着 ⇒ 「按下去」的手感消失（同族坑见基表 .go:hover 那条注释）。
 * （本段是模板字符串，注释里一律不写反引号——反引号会提前结束整个 CSS 字符串。） */
.home-ui .hu-pbtn-s.cta{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;height:36px;font-weight:650;
  background:var(--hu-accent);border-color:transparent;color:#fff;box-shadow:0 2px 10px -5px var(--hu-accent)}
.home-ui .hu-pbtn-s.cta:hover:not([disabled]){background:color-mix(in srgb,var(--hu-accent) 74%,var(--hu-ink));
  transform:translateY(-1px);box-shadow:0 5px 16px -6px var(--hu-accent)}
.home-ui .hu-pbtn-s.cta:active:not([disabled]){transform:translateY(0) scale(.97);box-shadow:0 1px 4px -3px var(--hu-accent)}

/* ---- 交互反馈补全（owner 2026-10-17：「所有可点控件都要让人在悬停/点击时感到交互」）----
 * 基表 home-ui-styles.ts 已 300 行顶格（契约 §5 规模红线）⇒ 缺的伪态补在这里，纯追加、不改既有规则。
 * 覆盖三类缺口：① 有悬停无按下（面包屑/菜单项）② 全无（失败行内「重试」按钮）③ 文本链接反馈太弱。 */
.home-ui .hu-crumb:active{transform:scale(.95)}
.home-ui .hu-menu button:active{background:var(--hu-accent-soft)}
/* 失败行内「重试」：原来只有 cursor:pointer，悬停/按下都没变化（最该给出反馈的地方反而最安静） */
.home-ui .hu-err button{transition:background var(--hu-t) var(--hu-ease),transform var(--hu-t-fast) var(--hu-ease)}
.home-ui .hu-err button:hover{background:color-mix(in srgb,var(--hu-bad) 18%,transparent)}
.home-ui .hu-err button:active{transform:scale(.94)}
/* 文本链接（恢复默认名 / 清除图片 / 删除助理）：只变色太弱，悬停加下划线（元素选择器压过基表同特异性规则） */
.home-ui button.hu-plink:hover{text-decoration:underline;text-underline-offset:3px}
.home-ui button.hu-plink:active{transform:scale(.96);text-decoration:underline}
/* 元信息行原语（#139）：主/次靠色阶、注解靠括号、并列靠 gap —— 面板可见文案从此不出现分隔符。
   原语实现在 home-meta.ts；容器类名走 hu-mrow/hu-mi —— 详情卡的 hu-meta 章行另有其用，不许撞名。 */
.home-ui .hu-mrow{display:inline-flex;align-items:baseline;gap:6px;flex-wrap:wrap;min-width:0}
.home-ui .hu-mi{min-width:0}
.home-ui .hu-mi.strong{color:var(--hu-ink);font-weight:600}
.home-ui .hu-mi.weak{color:var(--hu-ink-2)}
.home-ui .hu-mi.note{color:var(--hu-ink-3)}
.home-ui .hu-mi.accent{color:var(--hu-accent-deep);font-weight:600}
.home-ui .hu-mi.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.94em;color:var(--hu-ink-2)}
.home-ui .hu-mi.bad{color:var(--hu-bad);font-weight:600}
.home-ui .hu-crumb b .hu-cr2{display:inline-flex;align-items:baseline;gap:6px}
.home-ui .hu-crumb b .hu-cr2lv{color:var(--hu-ink-2);font-weight:500}
.home-ui .hu-crumb b .hu-cr2nm{color:var(--hu-ink);font-weight:650}
/* owner 2026-10-17 裁定：**在线一律绿**（文字与圆点同色）——面板里「在线」曾有蓝（accent 胶囊）与
 * 黑（气泡状态字）两副面孔，而状态点注释早就写着「绿＝在线」（home-row-styles.ts 状态点一段）。
 * 绿用 --af-success（＝既有 .hu-cdot.on / 会话头呼吸点同款）；文字取绿与 ink 的混合色，
 * 深色模式下自动跟着 ink 变浅，两套主题都保得住对比度。 */
.home-ui .hu-son{color:color-mix(in srgb, var(--af-success) 55%, var(--hu-ink));font-weight:600}
.home-ui.hu-tiphost .hu-tt small .hu-st-on{color:color-mix(in srgb, var(--af-success) 55%, var(--hu-ink))}
/* owner 2026-10-17：行按钮只留两档——未绑定「绑定机器人」走红档（.hu-ract.danger 基表已有），
 * 已绑定「更换机器人」走**琥珀档**（.swap）：不是主行动（不抢 accent），也不是危险动作（不红），
 * 颜色本身示意「会换掉现有的东西」，图标再用 refresh 补一层语义。 */
.home-ui .hu-ract.swap{color:var(--hu-warn);border-color:color-mix(in srgb, var(--hu-warn) 55%, transparent);background:color-mix(in srgb, var(--hu-warn) 12%, transparent)}
.home-ui .hu-abtn.swap{color:var(--hu-warn);border-color:color-mix(in srgb, var(--hu-warn) 55%, transparent);background:color-mix(in srgb, var(--hu-warn) 12%, transparent)}
.home-ui .hu-acts2 .hu-ract.swap:hover{background:color-mix(in srgb, var(--hu-warn) 24%, transparent);border-color:var(--hu-warn)}
.home-ui .hu-abtn.swap:hover:not([disabled]){background:color-mix(in srgb, var(--hu-warn) 24%, transparent);border-color:var(--hu-warn)}
/* owner 2026-10-17：头像本身就是「换头像」的入口（包成 <button> ⇒ 先抹掉按钮底，再补悬停/按下的手感）。 */
.home-ui .hu-avbtn{padding:0;border:0;background:none;line-height:0;border-radius:12px;cursor:pointer;
  transition:transform var(--hu-t-fast) var(--hu-ease),box-shadow var(--hu-t-fast) var(--hu-ease)}
.home-ui .hu-avbtn:hover{box-shadow:0 0 0 3px color-mix(in srgb, var(--hu-accent) 24%, transparent)}
.home-ui .hu-avbtn:active{transform:scale(.94)}
.home-ui .hu-avbtn:focus-visible{outline:2px solid var(--hu-accent);outline-offset:2px}
/* 原位改名的输入框：字号/字重跟展示态（.hu-nm b 是 13.5px/620）对齐，进出编辑态行高不跳。
 * 焦点环走 **inset**（owner 2026-10-17 真机：外环右侧被裁）——输入框长在 .hu-nm／.hu-txt
 * 两层 overflow:hidden 里，只有画在盒内的环才不可能被容器裁掉；色值仍取 accent 22%。 */
.home-ui .hu-nminput{font-family:inherit;font-size:13.5px;font-weight:620;line-height:1.2;color:var(--hu-ink);
  background:var(--hu-panel-2);border:1px solid var(--hu-accent);border-radius:7px;padding:2px 7px;
  min-width:120px;max-width:190px;outline:none;
  box-shadow:inset 0 0 0 3px color-mix(in srgb, var(--af-accent) 22%, transparent)}
.home-ui .hu-nminput::placeholder{color:var(--hu-ink-3);font-weight:400}
/* owner 2026-10-17②：改名确认要出现在**被改的那一行旁边**（列表在顶部），不再沉到视口底部。
 * toast 是 body 级 float ⇒ 宿主自带 .home-ui（同 .home-ui.hu-tiphost 那条纪律：作用域不破、
 * 令牌在），规则也按「只挂 .home-ui 之下」写（home-row-strip.ts 的门禁）。变异只挪位置、
 * 不动基样式：.af-toast.show 的 translateX(-50%) 动画照旧。 */
.home-ui.hu-toast-top{top:16px;bottom:auto}
`

let installed = false

/** 样式标签还在不在（只认 flag 不够：热重载/插件重载可能卸掉标签，#136 左下角裸字即此）。
 * 气泡 paint 前调它验活：死了就不画（宁可不弹也不裸），见 `home-row-tip.ts paint`。
 * 两段查：真 DOM 走 `getElementById` 快路；单测桩的 `getElementById` 只认属性位而
 * `installTag` 写的是 `.id` 属性位（真 DOM 会反射、桩里不反射）⇒ 桩里退到扫 head，
 * 比照 verify 里的同款写法（`home-row-strip.ts` 样式测试那段）。 */
export function homeRowStylesAlive(): boolean {
  try {
    const d = (globalThis as unknown as { document?: {
      getElementById?: (id: string) => unknown,
      head?: { childNodes?: ArrayLike<unknown> },
    } }).document
    const id = 'af-feature-' + HOME_ROW_STYLE_ID
    if (d?.getElementById?.(id)) return true
    const kids = d?.head?.childNodes
    const n = (kids as ArrayLike<unknown> | undefined)?.length ?? 0
    for (let i = 0; i < n; i++) {
      const el = (kids as ArrayLike<any>)[i] as any
      if (String(el?.getAttribute?.('id') ?? el?.id ?? '') === id) return true
    }
    return false
  } catch { return true }
}

/** 幂等装配（首次画家行时调一次就够）：`installFeatureStyles` 按 id 复用同一 <style>，热重载安全。 */
export function ensureHomeRowStyles(): void {
  if (installed && homeRowStylesAlive()) return
  installed = true
  installFeatureStyles(HOME_ROW_STYLE_ID, HOME_ROW_CSS)
}
