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
/* 「删除家」首点只布防：挂 .armed 先变色（次点才上报，见 home-orphan-row.ts） */
.home-ui .hu-acts2 .hu-ract.danger.armed{background:color-mix(in srgb,var(--hu-bad) 38%,transparent);border-color:var(--hu-bad);
  color:color-mix(in srgb,var(--hu-bad) 72%,var(--hu-ink));font-weight:700}
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

/* ---- 悬停小气泡：body 级 float（宿主同带 .home-ui），不被列表 overflow 裁掉 ---- */
.home-ui.hu-tiphost{position:fixed;z-index:60;pointer-events:none;display:flex;align-items:center;gap:9px;max-width:260px;
  padding:8px 11px;border-radius:12px;background:var(--hu-panel-3);border:1px solid var(--hu-line);
  box-shadow:var(--hu-sh-pop);color:var(--hu-ink);font-size:12px;line-height:1.35;
  opacity:0;transform:translateY(4px) scale(.97);transition:opacity var(--hu-t) var(--hu-ease),transform var(--hu-t) var(--hu-ease)}
.home-ui.hu-tiphost.on{opacity:1;transform:translateY(0) scale(1)}
.home-ui.hu-tiphost .hu-tav{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none}
.home-ui.hu-tiphost .hu-tt{min-width:0}
.home-ui.hu-tiphost .hu-tt b{display:block;font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.home-ui.hu-tiphost .hu-tt small{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:11px;color:var(--hu-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
