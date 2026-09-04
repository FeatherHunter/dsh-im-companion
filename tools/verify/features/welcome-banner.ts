// E4 welcome-banner 自验证（F0 每功能自验证）：纯数据层 + 样式命名空间 + 注册表（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把特性链转译到临时目录，再断言转译产物。
// 覆盖 P 时辰：时段映射、十五句文案锁死、copy 回绕、诚实 sub 模板、路由计数、
// 横幅模型（身份/预设标签/上下文/缺席回 null）、路由读取静默失败、样式 wb- 命名空间、注册表收录、
// hero 门/可见性门/未绑定零 UI/卸载即净。
import { mkdtempSync, rmSync, readFileSync as readSrcFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const REPO = process.cwd();
const DATA = join(REPO, "src", "client", "data");
const FEAT = join(REPO, "src", "features");
const WB = join(FEAT, "welcome-banner");
const ENTRIES = [
  join(DATA, "config.ts"),
  join(DATA, "model.ts"),
  join(DATA, "fleet-api.ts"),
  join(DATA, "bindings.ts"),
  join(DATA, "meta.ts"),
  join(REPO, "src", "client", "dom.ts"),
  join(REPO, "src", "client", "theme.ts"),
  join(WB, "data.ts"),
  join(WB, "anchor.ts"),
  join(WB, "styles.ts"),
  join(WB, "view.ts"),
  join(WB, "overlay.ts"),
  join(WB, "manifest.ts"),
  join(REPO, "src", "client", "theme.ts"),
];

const tmp = mkdtempSync(join(tmpdir(), "e4-welcome-banner-"));
try {
  execFileSync(process.execPath, [
    join(REPO, "node_modules", "typescript", "bin", "tsc"),
    ...ENTRIES,
    "--ignoreConfig",
    "--outDir", tmp, "--module", "commonjs", "--target", "es2023",
    "--moduleResolution", "bundler", "--skipLibCheck",
    "--declaration", "false", "--sourceMap", "false",
  ], { stdio: "pipe" });
} catch (e) {
  console.error("TRANPILE-FAIL " + String((e as any).stdout ?? "") + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const req = createRequire(join(tmp, "run.cjs"));
const indexSrc = readSrcFile(join(FEAT, "index.ts"), "utf8");
const data: any = req("./features/welcome-banner/data.js");
const styles: any = req("./features/welcome-banner/styles.js");
const manifest: any = req("./features/welcome-banner/manifest.js");
const fleetApi: any = req("./client/data/fleet-api.js");

const W1 = "D:\\agents\\xiaoshuai";
const snap = (over: Record<string, unknown> = {}) => ({
  channel: "feishu", botId: "b1", workspace: W1, connected: true,
  healthStatus: "healthy", healthKind: "online", botName: "", avatarUrl: "",
  healthSummary: "", lastCheckedAt: 1000, stale: false, ...over,
});
const META = { names: { [W1]: "小帅" }, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
const CATALOGS = { feishu: { defaultId: "default", items: [{ id: "cs", label: "客服话术" }] } };

test("时段映射边界（凌晨≠深夜）", () => {
  assert.equal(data.segOfHour(2), "wee");
  assert.equal(data.segOfHour(4), "wee");
  assert.equal(data.segOfHour(5), "dawn");
  assert.equal(data.segOfHour(8), "dawn");
  assert.equal(data.segOfHour(9), "day");
  assert.equal(data.segOfHour(16), "day");
  assert.equal(data.segOfHour(17), "dusk");
  assert.equal(data.segOfHour(19), "dusk");
  assert.equal(data.segOfHour(20), "night");
  assert.equal(data.segOfHour(0), "night");
  assert.equal(data.segOfHour(1), "night");
  assert.equal(data.segOfHour(23), "night");
  assert.equal(data.segOfHour(-1), "night");
  assert.equal(data.segOfHour(24), "night");
  assert.equal(data.segOfHour(NaN), "night");
});

test("路由计数只按脱敏前缀", () => {
  const s = data.summarizeRoutes([
    { chat: "私聊 ab12cd", sessionId: "s1" },
    { chat: "群聊 ef34gh", sessionId: "s2" },
    { chat: "旧映射 xy99", sessionId: "s3", ghost: true },
    { chat: 42, sessionId: "sx" },
    null,
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.p2p, 1);
  assert.equal(s.group, 1);
  assert.equal(s.ghost, 1);
  assert.deepEqual(data.summarizeRoutes(null), { total: 0, p2p: 0, group: 0, ghost: 0 });
});

test("copyFor 归一化与回绕", () => {
  assert.equal(data.copyFor("day", 0).t, "家里亮堂，随时回来");
  assert.equal(data.copyFor("day", 3).idx, 0);
  assert.equal(data.copyFor("day", -1).idx, 2);
  assert.equal(data.copyFor("day", 2).idx, 2);
  assert.equal(data.normalizeCopyIdx(4), 1);
  assert.equal(data.copyFor("nope", 0).seg, "night");
  assert.equal(data.copyFor("wee", 0).horizon, true);
  assert.equal(data.copyFor("wee", 0).moon, true);
  assert.equal(data.copyFor("night", 1).moon, true);
  assert.equal(data.copyFor("night", 1).horizon, false);
  assert.equal(data.copyFor("dawn", 2).moon, false);
});

test("displaySub 诚实模板", () => {
  assert.equal(data.displaySub("飞书在线 · 整个世界都睡了，除了我", 3, "小帅"), "整个世界都睡了，除了我");
  assert.equal(data.displaySub("飞书在线 · 1 个会话已就位", 5, "小帅"), "5 个会话已就位");
  assert.equal(data.displaySub("飞书在线 · 1 个会话候着", 0, "小帅"), "0 个会话候着");
  assert.equal(data.displaySub("飞书在线 · 1 个会话已就位", null, "小帅"), "会话已就位");
  assert.equal(data.displaySub("飞书在线 · 小帅守着今天", 1, "星火"), "星火守着今天");
  assert.equal(data.displaySub("飞书在线 · 小帅守着今天", 1, "小帅"), "小帅守着今天");
});

test("PH 十五句完整性（原型冻结文案锁死）", () => {
  const segs = ["wee", "dawn", "day", "dusk", "night"];
  assert.deepEqual(data.TIME_SEGS, segs);
  for (const seg of segs) {
    for (let i = 0; i < 3; i++) {
      const c = data.copyFor(seg, i);
      assert.equal(c.seg, seg);
      assert.equal(c.idx, i);
      assert.ok(c.t.length > 0 && c.s.length > 0 && c.b.length > 0 && c.bs.length > 0);
      assert.ok(c.s.indexOf("·") >= 0, seg + "#" + i + " 副标题须带“·”分隔 mock 健康前缀");
      assert.ok(c.sky.indexOf("wb-sky-") === 0);
    }
  }
  assert.equal(data.copyFor("day", 0).bs, "门开着");
  assert.equal(data.copyFor("dawn", 0).b, "回家吃早饭");
  assert.equal(data.copyFor("dusk", 0).b, "回家吃饭");
});

test("横幅模型映射身份与上游标签", () => {
  const bots = [snap({ agentPreset: "cs", contextEnhancement: { groupEnabled: true, directEnabled: false, fields: [], guidance: "" } })];
  const m = data.buildBannerModel(bots, META, W1, CATALOGS);
  assert.ok(m);
  assert.equal(m.name, "小帅");
  assert.equal(m.initial, "小");
  assert.equal(m.workspace, W1);
  assert.equal(m.status, "online");
  assert.equal(m.presetText, "客服话术");
  assert.equal(m.ctxText, "上下文增强开");
  assert.deepEqual(m.bots, [{ channel: "feishu", botId: "b1" }]);
});

test("横幅模型缺席回 null（调用方零 UI）", () => {
  assert.equal(data.buildBannerModel([snap()], META, "D:\\agents\\nobody", CATALOGS), null);
  assert.equal(data.buildBannerModel([snap()], META, "", CATALOGS), null);
  assert.equal(data.buildBannerModel([], META, W1, CATALOGS), null);
});

test("预设未读到不展示该行", () => {
  const m = data.buildBannerModel([snap({})], META, W1, CATALOGS);
  assert.ok(m);
  assert.equal(m.presetText, null);
  assert.equal(m.ctxText, null);
});

test("跟随默认与多预设", () => {
  const f = data.buildBannerModel([snap({ agentPreset: null })], META, W1, CATALOGS);
  assert.equal(f.presetText, "跟随默认");
  const multi = data.buildBannerModel(
    [snap({ agentPreset: "cs" }), snap({ botId: "b2", agentPreset: "coder" })], META, W1, CATALOGS);
  assert.equal(multi.presetText, "多预设");
});

test("路由读取静默失败", async () => {
  assert.deepEqual(await fleetApi.fetchRouteRows(null, [{ channel: "feishu", botId: "b1" }]), []);
  assert.deepEqual(await fleetApi.fetchRouteRows(async () => { throw new Error("down"); }, [{ channel: "feishu", botId: "b1" }]), []);
  const ok = await fleetApi.fetchRouteRows(async () => ({
    ok: true, value: { routes: [{ chat: "私聊 ab", session: "sess-1", ghost: false, channel: "feishu" }, { chat: 7, session: "sess-2" }] },
  }), [{ channel: "feishu", botId: "b1" }]);
  assert.deepEqual(ok, [{ chat: "私聊 ab", sessionId: "sess-1", ghost: false, channel: "feishu" }]);
});

test("样式命名空间 wb-", () => {
  const css = String(styles.CSS ?? "");
  assert.ok(css.length > 100);
  assert.ok(css.indexOf(".wb-") >= 0);
  assert.ok(!/#fff(?![0-9a-fA-F])/.test(css) && !/#000(?![0-9a-fA-F])/.test(css), "禁止裸硬编码色值（var() fallback 如 #ffffff 是主题令牌 sanctioned 写法）");
  const classes = [...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
  const bad = classes.filter((c) => !c.startsWith("wb-"));
  assert.deepEqual(bad, []);
  assert.ok(css.indexOf("--af-accent:") >= 0, "TOKEN_BLOCK 必须随横幅下发（对话树无 .af-root，缺此则全部 var(--af-*) 被丢弃）");
  assert.ok(css.indexOf(".wb-banner{") >= 0, "token 必须声明在 .wb-banner 根上");
  assert.ok(css.indexOf("min-height:") >= 0, "HOME 气场：横幅必须有最小高度占领对话区");
  assert.ok(css.indexOf(".wb-modal") >= 0 && css.indexOf("position: fixed") >= 0, "必须顶层弹窗挂 body，不占据对话框版面");
  assert.ok(css.indexOf(".wb-backdrop") >= 0, "遮罩必须存在");
  assert.ok(css.indexOf("top: 50%") >= 0 && css.indexOf("translateY(-50%)") >= 0, "文案块必须在天空区垂直居中");
  assert.ok(css.indexOf("bottom: 7%") >= 0, "进门按钮必须沉底（标题居中、按钮靠下，好点）");
  assert.ok(css.indexOf("min(960px, 94vw)") >= 0, "面板大而有度：1040 过大回调一档");
  assert.equal(css.indexOf("repeating-conic-gradient"), -1, "旋转放射芒已砍：低级感来源，禁回潮");
  assert.ok(css.indexOf(".wb-haze") >= 0, "天空光晕必须存在");
  assert.ok(css.indexOf(".wb-cirrus") >= 0, "卷云丝必须存在");
  assert.ok(css.indexOf("feTurbulence") >= 0, "胶片噪点必须存在");
  assert.ok(css.indexOf("min-width: min(320px") >= 0, "按钮必须加宽不加高");
  for (const cls of [".wb-sky-wee", ".wb-sky-dawn", ".wb-sky-day", ".wb-sky-dusk", ".wb-sky-night", ".wb-sun", ".wb-haze", ".wb-cirrus", ".wb-moon", ".wb-cloud", ".wb-star", ".wb-s1", ".wb-horizon", ".wb-grain", ".wb-vig", ".wb-host", ".wb-host-avatar", ".wb-host-name", ".wb-title", ".wb-enter"]) {
    assert.ok(css.indexOf(cls) >= 0, "P 天空样式缺失：" + cls);
  }
  for (const dead of [".wb-x", ".wb-route", ".wb-guide", ".wb-avatar", ".wb-swaprow", ".wb-swap", ".wb-rays"]) {
    assert.equal(css.indexOf(dead), -1, "旧 A 样式必须移除：" + dead);
  }
});

test("manifest 与注册表收录", () => {
  const f = manifest.feature;
  assert.equal(f.id, "welcome-banner");
  assert.ok(typeof f.order === "number");
  assert.ok(Array.isArray(f.slots) && f.slots.length === 1);
  assert.equal(typeof f.slots[0].mount, "function");
  assert.equal(typeof f.installStyles, "function");
  // 注册表：index.ts 在并行 session 手中变红（hover-card 上游破环），本文件不断言其转译，
  // 只做静态收录检查（import 行 + 数组项），全量类型检查归 npm run check。
  assert.ok(indexSrc.indexOf("welcome-banner/manifest") >= 0, "FEATURES 必须 import welcome-banner");
  assert.ok(indexSrc.indexOf("welcomeBanner") >= 0, "FEATURES 数组必须收录 welcomeBanner");
});

/* 手写 stub DOM（h() 只用 createElement/createTextNode/appendChild/属性读写）。 */
function stubText(t: unknown) {
  return { nodeType: 3, text: String(t), parentNode: null as any };
}
function stubEl(tag: string): any {
  const el: any = {
    tag, nodeType: 1, children: [] as any[], attrs: {} as Record<string, string>,
    className: "", style: {} as Record<string, string>, dataset: {} as Record<string, string>,
    parentNode: null as any,
    _listeners: {} as Record<string, ((...a: any[]) => void)>[],
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
    getAttribute(k: string) { return this.attrs[k] ?? null; },
    addEventListener(type: string, fn: (...a: any[]) => void) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    appendChild(c: any) { c.parentNode = this; this.children.push(c); return c; },
    replaceChildren() { this.children = []; },
    textContent: "",
  };
  Object.defineProperty(el, "textContent", {
    get() {
      const walk = (n: any): string => {
        if (!n) return "";
        if (n.nodeType === 3) return n.text;
        return (n.children ?? []).map(walk).join("");
      };
      return walk(this);
    },
  });
  el.querySelectorAll = (sel: string): any[] => {
    const out: any[] = [];
    const match = (n: any): boolean => {
      if (!n || n.nodeType !== 1) return false;
      if (sel.startsWith(".")) return String(n.className ?? "").split(" ").includes(sel.slice(1));
      return n.tag === sel;
    };
    const walk = (n: any) => {
      for (const c of n.children ?? []) {
        if (match(c)) out.push(c);
        walk(c);
      }
    };
    walk(el);
    return out;
  };
  el.querySelector = (sel: string) => el.querySelectorAll(sel)[0] ?? null;
  return el;
}
(globalThis as any).document = { createElement: stubEl, createTextNode: stubText };
const view: any = req("./features/welcome-banner/view.js");
const overlay: any = req("./features/welcome-banner/overlay.js");

test("渲染 P 弹窗（遮罩+面板+标题+进门）", () => {
  const copy = data.copyFor("day", 0);
  const calls: string[] = [];
  const bots2 = [snap({ agentPreset: "cs", contextEnhancement: { groupEnabled: true, directEnabled: false, fields: [], guidance: "" } })];
  const META2 = { names: { [W1]: "小帅2" }, avatars: {}, locals: [], presets: {}, ctxEnhance: {}, welcomed: {} };
  const model2 = data.buildBannerModel(bots2, META2, W1, CATALOGS);
  const el = view.renderHome({
    copy, model: model2,
    subSuffix: data.displaySub(copy.s, 2, model2.name),
    callbacks: { onEnter: () => calls.push("enter") },
  });
  assert.equal(el.querySelector(".wb-host-name").textContent, "小帅2", "主人行必须显示自取名（原名兜底）");
  assert.ok(el.querySelector(".wb-host-avatar"), "主人头像必须存在");
  assert.ok(String(el.className).split(" ").includes("wb-modal"), "根节点即 wb-modal 顶层弹窗");
  assert.ok(el.querySelector(".wb-backdrop"), "遮罩必须存在");
  assert.ok(el.querySelector(".wb-banner"), "居中面板必须存在");
  assert.deepEqual(el.querySelector(".wb-backdrop")._listeners.click ?? [], [], "点区域外必须不消失（backdrop 零监听）");
  assert.ok(el.querySelector(".wb-sky"), "天空层必须存在");
  assert.ok(el.querySelector(".wb-sky-day"), "白天须用 day 天空");
  assert.ok(el.querySelector(".wb-sun"), "白天须有太阳");
  assert.equal(el.querySelector(".wb-rays"), null, "放射芒必须移除");
  assert.ok(el.querySelector(".wb-haze"), "白天须有天空光晕");
  assert.ok(el.querySelector(".wb-cirrus"), "白天须有卷云丝");
  assert.ok(el.querySelector(".wb-grain"), "噪点层必须存在");
  assert.ok(el.querySelector(".wb-vig"), "暗角层必须存在");
  assert.equal(el.querySelector(".wb-title").textContent, "家里亮堂，随时回来");
  const sub = el.querySelector(".wb-sub").textContent;
  assert.ok(sub.indexOf("在线") >= 0 && sub.indexOf("小帅2守着今天") >= 0, "副标题=真实健康+文案后缀（改名联动）：" + sub);
  const btns = el.querySelectorAll("button").map((b: any) => b.textContent);
  assert.ok(btns.some((t: string) => t.indexOf("回家") >= 0 && t.indexOf("门开着") >= 0), "进门按钮主副文案齐全：" + btns.join("|"));
  assert.equal(el.querySelector(".wb-swaprow"), null, "换一句控件必须移除");
  assert.equal(el.querySelector(".wb-swap"), null, "换一句控件必须移除");
  assert.equal(el.querySelector(".wb-x"), null, "P 无 X（进门即关闭）");
  assert.equal(el.querySelectorAll(".wb-route").length, 0, "P 无路由列表");
  assert.ok(btns.every((t: string) => t.indexOf("Agent 详情") < 0 && t.indexOf("检查连接") < 0), "旧 A 按钮不得出现");
});

test("未绑定工作区零绘制（纯净原生空态）", async () => {
  const inserted: any[] = [];
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 nobody",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "nobody" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: { insertBefore: (n: any) => { inserted.push(n); }, removeChild: () => {} },
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel.indexOf("data-phase") >= 0 ? [heroStub] : [],
  };
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      fn({ bots: [snap({})], failed: [], updatedAt: 3, catalogs: CATALOGS });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(inserted.length, 0, "未绑定必须零 UI");
  stop();
});

test("渲染类名全在 wb- 命名空间", () => {
  const wee = data.copyFor("wee", 2);
  const weeModel = data.buildBannerModel([snap({})], META, W1, CATALOGS);
  const el = view.renderHome({
    copy: wee, model: weeModel,
    subSuffix: data.displaySub(wee.s, null, "小帅"),
    callbacks: { onEnter: () => {} },
  });
  const seen = new Set<string>();
  const walk = (n: any) => {
    for (const c of n.children ?? []) {
      for (const cls of String(c.className ?? "").split(" ").filter(Boolean)) seen.add(cls);
      walk(c);
    }
  };
  walk(el);
  const css = String(styles.CSS ?? "");
  for (const cls of seen) assert.ok(css.indexOf("." + cls) >= 0, "渲染类 ." + cls + " 必须在 styles.ts 有定义");
});

test("label 反查路径（歧义宁缺勿错配）", () => {
  const cands = [
    { path: "D:\\agents\\xiaoshuai", name: "小帅" },
    { path: "D:\\agents\\xinghuo", name: "星火" },
  ];
  assert.equal(data.matchWorkspaceLabel("小帅", cands), "D:\\agents\\xiaoshuai");
  assert.equal(data.matchWorkspaceLabel("xiaoshuai", cands), "D:\\agents\\xiaoshuai");
  assert.equal(data.matchWorkspaceLabel("agents\\xiaoshuai", cands), "D:\\agents\\xiaoshuai");
  assert.equal(data.matchWorkspaceLabel("不存在", cands), null);
  assert.equal(data.matchWorkspaceLabel("", cands), null);
  assert.equal(data.matchWorkspaceLabel("小帅", [
    { path: "D:\\a\\same", name: "小帅" },
    { path: "D:\\b\\same", name: "小帅" },
  ]), null);
  assert.equal(data.matchWorkspaceLabel("same", [
    { path: "D:\\a\\same", name: "甲" },
    { path: "D:\\b\\same", name: "乙" },
  ]), null);
  assert.equal(data.matchWorkspaceLabel("XIAOSHUAI", cands), "D:\\agents\\xiaoshuai");
  assert.equal(data.matchWorkspaceLabel("  小帅  ", cands), "D:\\agents\\xiaoshuai");
});

test("hero 三信号确认", () => {
  assert.equal(view.heroConfirmed("hero", "探索未至之境 预览版 other"), true);
  assert.equal(view.heroConfirmed("hero", "Into the Unknown Preview"), true);
  assert.equal(view.heroConfirmed("active", "探索未至之境 预览版"), false);
  assert.equal(view.heroConfirmed("hero", "探索未至之境"), false);
  assert.equal(view.heroConfirmed("hero", "预览版"), false);
  assert.equal(view.heroConfirmed(null, "探索未至之境 预览版"), false);
});

test("hero chip 文本读取", () => {
  const root = (label: string | null) => ({
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 && label !== null
      ? { textContent: "  " + label + "  " }
      : (sel.indexOf("Choose workspace") >= 0 && label !== null ? { textContent: label } : null),
  });
  assert.equal(view.heroWorkspaceLabel(root("xiaoshuai")), "xiaoshuai");
  assert.equal(view.heroWorkspaceLabel(root(null)), "");
  assert.equal(view.heroWorkspaceLabel(null), "");
  assert.equal(view.heroWorkspaceLabel({}), "");
});

test("挂载永不抛错（ hostile 环境全静默）", () => {
  const badCtx: any = {
    rpc: null,
    subscribe: () => { throw new Error("no sub"); },
    refresh: async () => { throw new Error("no refresh"); },
    meta: { loadMeta: async () => { throw new Error("no meta"); } },
    get: () => { throw new Error("no get"); },
    slots: { inject: () => { throw new Error("must never be called"); } },
  };
  const stop = overlay.mountBanner(badCtx);
  assert.equal(typeof stop, "function");
  stop();
  const stop2 = overlay.mountBanner({} as any);
  assert.equal(typeof stop2, "function");
  stop2();
});

test("顶层弹窗挂载：hero 门控、body 挂载、卸载即净", async () => {
  const inserted: any[] = [];
  const removed: any[] = [];
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 xiaoshuai",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "xiaoshuai" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: {},
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel === '[data-phase="hero"]' ? [heroStub] : [],
    body: { appendChild: (n: any) => { inserted.push(n); }, removeChild: (n: any) => { removed.push(n); } },
  };
  const subFns: any[] = [];
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      subFns.push(fn);
      fn({ bots: [snap({})], failed: [], updatedAt: 1, catalogs: CATALOGS });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META },
    get: () => undefined,
    slots: { inject: () => { throw new Error("zero-slot: must never touch slots"); } },
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(inserted.length >= 1, "至少绘制一次");
  const card = inserted[inserted.length - 1];
  assert.ok(String(card.className).split(" ").includes("wb-modal"), "根节点即顶层弹窗");
  assert.ok(card.querySelector(".wb-backdrop"), "遮罩必须挂载");
  assert.ok(card.querySelector(".wb-banner"), "居中面板必须挂载");
  assert.ok(card.querySelector(".wb-sky"), "P 天空必须绘制");
  assert.ok(card.querySelector(".wb-title").textContent.length > 0, "标题必须有文案");
  const btns = card.querySelectorAll("button").map((n: any) => n.textContent);
  assert.ok(btns.some((t: string) => t.indexOf("回家") >= 0), "进门按钮必须存在：" + btns.join("|"));
  assert.ok(btns.every((t: string) => t.indexOf("换一句") < 0), "换一句控件必须移除");
  stop();
  assert.equal(removed.length, inserted.length, "每次绘制都要在卸载时回收");
});

test("藏起来的 hero 不绘制（有消息会话不打扰）", async () => {
  const inserted: any[] = [];
  const hiddenHero: any = {
    textContent: "探索未至之境 预览版 选择工作区 xiaoshuai",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "xiaoshuai" } : null,
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
    parentNode: { insertBefore: (n: any) => { inserted.push(n); }, removeChild: () => {} },
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel === '[data-phase="hero"]' ? [hiddenHero] : [],
  };
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      fn({ bots: [snap({})], failed: [], updatedAt: 2, catalogs: CATALOGS });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(inserted.length, 0, "不可见 hero 必须零绘制");
  stop();
});

test("copyFor 同段回绕（数据层）", () => {
  const seg = "dusk";
  assert.equal(data.copyFor(seg, 0).idx, 0);
  assert.equal(data.copyFor(seg, 1).idx, 1);
  assert.equal(data.copyFor(seg, 2).idx, 2);
  assert.equal(data.copyFor(seg, 3).idx, 0);
  const titles = [0, 1, 2].map((i) => data.copyFor(seg, i).t);
  assert.equal(new Set(titles).size, 3, "同段三句互不相同");
});

test("welcomedOf 旧快照兜底", () => {
  assert.deepEqual(data.welcomedOf(null), {});
  assert.deepEqual(data.welcomedOf({}), {});
  assert.deepEqual(data.welcomedOf({ welcomed: { [W1]: true } }), { [W1]: true });
  assert.deepEqual(data.welcomedOf({ welcomed: null }), {});
});

test("pruneWelcomed 只清无机器人的家", () => {
  const r = data.pruneWelcomed({ [W1]: true, "D:\\gone": true }, [W1]);
  assert.deepEqual(r.kept, { [W1]: true });
  assert.deepEqual(r.dropped, ["D:\\gone"]);
  assert.deepEqual(data.pruneWelcomed({}, []).kept, {});
  assert.deepEqual(data.pruneWelcomed({ [W1]: true }, new Set([W1])).dropped, []);
});

test("播种零绘制：欢迎过的家不再出现", async () => {
  const inserted: any[] = [];
  const W2 = "D:\\agents\\laoer";
  const META2 = { names: { [W2]: "老二" }, avatars: {}, locals: [], presets: {}, ctxEnhance: {}, welcomed: { [W2]: true } };
  const snap2 = { channel: "feishu", botId: "b2", workspace: W2, connected: true, healthStatus: "healthy", healthKind: "online", botName: "", avatarUrl: "", healthSummary: "", lastCheckedAt: 1000, stale: false };
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 laoer",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "laoer" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: { insertBefore: (n: any) => { inserted.push(n); }, removeChild: () => {} },
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel.indexOf("data-phase") >= 0 ? [heroStub] : [],
  };
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      fn({ bots: [snap2], failed: [], updatedAt: 5, catalogs: {} });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META2 },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(inserted.length, 0, "持久化欢迎过必须零绘制");
  stop();
});

test("进门持久化：点击回家即记 welcomed", async () => {
  const inserted: any[] = [];
  const removed: any[] = [];
  const saved: any[] = [];
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 xiaoshuai",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "xiaoshuai" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: {},
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel.indexOf("data-phase") >= 0 ? [heroStub] : [],
    body: { appendChild: (n: any) => { inserted.push(n); }, removeChild: (n: any) => { removed.push(n); } },
  };
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      fn({ bots: [snap({})], failed: [], updatedAt: 6, catalogs: CATALOGS });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META, setWelcomed: async (w: string, s: boolean) => { saved.push({ w, seen: s }); } },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(inserted.length, 1, "首次进入应出现");
  const card = inserted[0];
  const btn = card.querySelector(".wb-enter");
  assert.ok(btn, "进门按钮必须存在");
  for (const fn of (btn._listeners.click ?? [])) fn();
  assert.ok(saved.some((r) => r.w === W1 && r.seen === true), "必须持久化 welcomed：" + JSON.stringify(saved));
  assert.ok(removed.includes(card), "点击后卡片必须移除");
  stop();
});

test("删光重现：解绑清记忆，重绑再欢迎", async () => {
  const W4 = "D:\\agents\\lingshi";
  const META4 = { names: { [W4]: "老四" }, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const snap4 = { channel: "feishu", botId: "b9", workspace: W4, connected: true, healthStatus: "healthy", healthKind: "online", botName: "", avatarUrl: "", healthSummary: "", lastCheckedAt: 1000, stale: false };
  const inserted: any[] = [];
  const removed: any[] = [];
  const saved: any[] = [];
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 lingshi",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "lingshi" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: {},
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel.indexOf("data-phase") >= 0 ? [heroStub] : [],
    body: { appendChild: (n: any) => { inserted.push(n); }, removeChild: (n: any) => { removed.push(n); } },
  };
  let subFn: any = null;
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      subFn = fn;
      fn({ bots: [snap4], failed: [], updatedAt: 7, catalogs: {} });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META4, setWelcomed: async (w: string, s: boolean) => { saved.push({ w, seen: s }); } },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(inserted.length >= 1, "绑定后首次进入应出现");
  const first = inserted[inserted.length - 1];
  for (const fn of (first.querySelector(".wb-enter")._listeners.click ?? [])) fn();
  assert.ok(saved.some((r) => r.w === W4 && r.seen === true), "进门应记 true");
  subFn({ bots: [], failed: [], updatedAt: 8, catalogs: {} });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(saved.some((r) => r.w === W4 && r.seen === false), "删光应清 false：" + JSON.stringify(saved));
  const beforeRebind = inserted.length;
  subFn({ bots: [snap4], failed: [], updatedAt: 9, catalogs: {} });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(inserted.length > beforeRebind, "重绑后应重现");
  assert.ok(inserted[inserted.length - 1].querySelector(".wb-title"), "重现的必须是完整 P 卡");
  stop();
});

test("切换工作区清扫孤儿卡", async () => {
  const W5 = "D:\\agents\\diwu";
  const META5 = { names: { [W5]: "老五" }, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const snap5 = { channel: "feishu", botId: "b5", workspace: W5, connected: true, healthStatus: "healthy", healthKind: "online", botName: "", avatarUrl: "", healthSummary: "", lastCheckedAt: 1000, stale: false };
  const inserted: any[] = [];
  const removed: any[] = [];
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 diwu",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "diwu" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: {},
  };
  const docStub: any = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel.indexOf("data-phase") >= 0 ? [heroStub] : [],
    body: { appendChild: (n: any) => { inserted.push(n); }, removeChild: (n: any) => { removed.push(n); } },
  };
  (globalThis as any).document = docStub;
  let subFn: any = null;
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      subFn = fn;
      fn({ bots: [snap5], failed: [], updatedAt: 10, catalogs: {} });
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META5 },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(inserted.length >= 1, "切前应有卡");
  const card = inserted[inserted.length - 1];
  docStub.querySelectorAll = (sel: string) => [];
  subFn({ bots: [snap5], failed: [], updatedAt: 11, catalogs: {} });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(removed.includes(card), "hero 消失后孤儿卡必须被清扫");
  stop();
});

test("同拍重放不重绘（防15s闪刷）", async () => {
  const W6 = "D:\\agents\\diliu";
  const META6 = { names: { [W6]: "老六" }, avatars: {}, locals: [], presets: {}, ctxEnhance: {} };
  const snap6 = { channel: "feishu", botId: "b6", workspace: W6, connected: true, healthStatus: "healthy", healthKind: "online", botName: "", avatarUrl: "", healthSummary: "", lastCheckedAt: 1000, stale: false };
  const inserted: any[] = [];
  const heroStub: any = {
    textContent: "探索未至之境 预览版 选择工作区 diliu",
    closest: (sel: string) => sel === "[data-phase]" ? { getAttribute: () => "hero" } : null,
    querySelector: (sel: string) => sel.indexOf("选择工作区") >= 0 ? { textContent: "diliu" } : null,
    getBoundingClientRect: () => ({ width: 600, height: 200 }),
    parentNode: {},
  };
  (globalThis as any).document = {
    createElement: (t: string) => stubEl(t),
    createTextNode: (t: unknown) => stubText(t),
    querySelectorAll: (sel: string) => sel.indexOf("data-phase") >= 0 ? [heroStub] : [],
    body: { appendChild: (n: any) => { inserted.push(n); }, removeChild: () => {} },
  };
  let subFn: any = null;
  const snap = { bots: [snap6], failed: [], updatedAt: 12, catalogs: {} };
  const fctx: any = {
    rpc: null,
    subscribe: (fn: any) => {
      subFn = fn;
      fn(snap);
      return () => undefined;
    },
    refresh: async () => undefined,
    meta: { loadMeta: async () => META6 },
    get: () => undefined,
    slots: {},
  };
  const stop = overlay.mountBanner(fctx);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(inserted.length >= 1, "应已绘制");
  const settled = inserted.length;
  subFn({ bots: [snap6], failed: [], updatedAt: 13, catalogs: {} });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(inserted.length, settled, "相同快照重放必须零重绘（否则每轮询闪刷一次）");
  stop();
});

test("中文新版三处（门口迎+进门办事）", () => {
  assert.equal(data.copyFor("dawn", 1).t, "早，今天听你的");
  assert.equal(data.copyFor("dawn", 1).bs, "我在呢");
  assert.equal(data.copyFor("dawn", 2).s, "飞书在线 · 就等你了");
  assert.equal(data.copyFor("dawn", 2).b, "回家");
});

test("homeLangOf 跟随 DSH 系统语言", () => {
  assert.equal(data.homeLangOf("en-US"), "en");
  assert.equal(data.homeLangOf("en"), "en");
  assert.equal(data.homeLangOf("EN-gb"), "en");
  assert.equal(data.homeLangOf("zh-CN"), "zh");
  assert.equal(data.homeLangOf(""), "zh");
  assert.equal(data.homeLangOf(null), "zh");
  assert.equal(data.homeLangOf(undefined), "zh");
  assert.equal(data.homeLangOf("fr"), "zh");
});

test("EN 十五句完整性（结构对齐中文）", () => {
  for (const seg of data.TIME_SEGS) {
    for (let i = 0; i < 3; i++) {
      const c = data.copyFor(seg, i, "en");
      assert.equal(c.seg, seg);
      assert.equal(c.idx, i);
      assert.ok(c.t.length > 0 && c.s.length > 0 && c.b.length > 0 && c.bs.length > 0);
      assert.ok(c.s.indexOf("·") >= 0, seg + "#" + i + " EN副标题须带分隔符");
      assert.ok(c.sky.indexOf("wb-sky-") === 0);
    }
  }
  assert.equal(data.copyFor("day", 0, "en").bs, "Door's open");
  assert.equal(data.copyFor("dawn", 0, "en").b, "Home for breakfast");
  assert.equal(data.copyFor("dusk", 0, "en").b, "Home for dinner");
  assert.equal(data.copyFor("nope", 0, "en").seg, "night");
  assert.equal(data.copyFor("day", 0).bs, "门开着");
});

test("displaySub 英文计数模板", () => {
  assert.equal(data.displaySub("Online · 1 session ready", 5, undefined, "en"), "5 sessions ready");
  assert.equal(data.displaySub("Online · 1 session ready", 1, undefined, "en"), "1 session ready");
  assert.equal(data.displaySub("Online · 1 session waiting", 0, undefined, "en"), "0 sessions waiting");
  assert.equal(data.displaySub("Online · 1 session ready", null, undefined, "en"), "Sessions ready");
  assert.equal(data.displaySub("Online · Waiting on you", 3, undefined, "en"), "Waiting on you");
  assert.equal(data.displaySub("飞书在线 · 整个世界都睡了，除了我", 3, "小帅"), "整个世界都睡了，除了我");
});

rmSync(tmp, { recursive: true, force: true });
