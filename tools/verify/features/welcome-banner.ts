// E4 welcome-banner 自验证（F0 每功能自验证）：纯数据层 + 样式命名空间 + 注册表（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把特性链转译到临时目录，再断言转译产物。
// 覆盖定稿：时段问候边界、路由计数（无时间不断言活跃）、Top3 余数、双槽位无死按钮、
// 横幅模型（身份/预设标签/上下文/缺席回 null）、路由读取静默失败、样式 wb- 命名空间、注册表收录。
import { mkdtempSync, rmSync, existsSync, symlinkSync, readFileSync as readSrcFile } from "node:fs";
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
  join(DATA, "header-overlay.ts"),
  join(WB, "data.ts"),
  join(WB, "styles.ts"),
  join(WB, "view.ts"),
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
// react 解析：tmp 内 junction 回仓库 node_modules（随 tmp 同生共死）。
if (!existsSync(join(tmp, "node_modules"))) symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"), "junction");
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

test("问候边界", () => {
  assert.equal(data.greetingForHour(0), "夜深了");
  assert.equal(data.greetingForHour(5), "夜深了");
  assert.equal(data.greetingForHour(6), "早上好");
  assert.equal(data.greetingForHour(8), "早上好");
  assert.equal(data.greetingForHour(9), "上午好");
  assert.equal(data.greetingForHour(11), "上午好");
  assert.equal(data.greetingForHour(12), "中午好");
  assert.equal(data.greetingForHour(13), "中午好");
  assert.equal(data.greetingForHour(14), "下午好");
  assert.equal(data.greetingForHour(17), "下午好");
  assert.equal(data.greetingForHour(18), "晚上好");
  assert.equal(data.greetingForHour(22), "晚上好");
  assert.equal(data.greetingForHour(23), "夜深了");
  assert.equal(data.greetingForHour(-1), "你好");
  assert.equal(data.greetingForHour(24), "你好");
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

test("Top3 余数", () => {
  const rows = [1, 2, 3, 4, 5].map((i) => ({ chat: "私聊 " + i, sessionId: "s" + i }));
  const t = data.pickTopRoutes(rows, 3);
  assert.equal(t.shown.length, 3);
  assert.equal(t.overflow, 2);
  assert.equal(t.shown[0].sessionId, "s1");
  assert.equal(data.pickTopRoutes(rows.slice(0, 2), 3).overflow, 0);
  assert.equal(data.pickTopRoutes(rows, 0).shown.length, 0);
});

test("双槽位无死按钮", () => {
  assert.deepEqual(data.actionSlotsFor(true), ["detail", "refresh"]);
  assert.deepEqual(data.actionSlotsFor(false), ["refresh"]);
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

test("横幅模型缺席回 null（视图转静态指引）", () => {
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
  assert.ok(css.indexOf("#fff") < 0 && css.indexOf("#000") < 0, "禁止硬编码色值（深色跟随主题别名）");
  const classes = [...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
  const bad = classes.filter((c) => !c.startsWith("wb-"));
  assert.deepEqual(bad, []);
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
    setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
    getAttribute(k: string) { return this.attrs[k] ?? null; },
    addEventListener() {},
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

test("渲染 bound 横幅（问候+身份+路由+双按钮）", () => {
  const bots = [snap({ agentPreset: "cs", contextEnhancement: { groupEnabled: true, directEnabled: false, fields: [], guidance: "" } })];
  const model = data.buildBannerModel(bots, META, W1, CATALOGS);
  const calls: string[] = [];
  const el = view.renderBanner({
    greeting: "早上好", model, workspaceLabel: "xiaoshuai",
    routes: [
      { chat: "私聊 ab12cd", sessionId: "sess-0001", channel: "feishu" },
      { chat: "群聊 ef34gh", sessionId: "sess-0002", channel: "feishu" },
    ],
    callbacks: { onDetail: () => calls.push("detail"), onRefresh: () => calls.push("refresh"), onDismiss: () => calls.push("dismiss") },
  });
  assert.ok(String(el.className).split(" ").includes("wb-banner"), "根节点即 wb-banner 卡片");
  assert.ok(el.querySelector(".wb-name").textContent.indexOf("早上好") >= 0);
  assert.ok(el.querySelector(".wb-name").textContent.indexOf("小帅") >= 0);
  assert.equal(el.querySelectorAll(".wb-route").length, 2);
  assert.ok(el.querySelector(".wb-x"), "可关闭 X 必须存在");
  const btns = el.querySelectorAll("button").map((b: any) => b.textContent);
  assert.ok(btns.includes("Agent 详情") && btns.includes("检查连接"), "双槽位按钮齐全：" + btns.join(","));
  assert.ok(btns.every((t: string) => t !== "去绑定" && t !== "打开工作区"), "无落点的按钮不得出现");
});

test("渲染 unbound 指引（静态文案+单按钮）", () => {
  const el = view.renderBanner({
    greeting: "晚上好", model: null, workspaceLabel: "dsh-im", routes: [],
    callbacks: { onDetail: () => {}, onRefresh: () => {}, onDismiss: () => {} },
  });
  assert.ok(el.querySelector(".wb-guide").textContent.indexOf("绑定") >= 0);
  const btns = el.querySelectorAll("button").map((b: any) => b.textContent);
  assert.deepEqual(btns.filter((t: string) => t !== "✕"), ["检查连接"]);
});

test("渲染类名全在 wb- 命名空间", () => {
  const model = data.buildBannerModel([snap({})], META, W1, CATALOGS);
  const el = view.renderBanner({
    greeting: "你好", model, workspaceLabel: "xiaoshuai", routes: [],
    callbacks: { onDetail: () => {}, onRefresh: () => {}, onDismiss: () => {} },
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

test("槽位注册与卸载（真槽位 conversation.session）", () => {
  const calls: any[] = [];
  let disposed = false;
  const fctx: any = {
    rpc: null,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    meta: { loadMeta: async () => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }) },
    get: () => undefined,
    slots: {
      inject: (name: string, fn: any) => { calls.push(["inject", name]); return fn(); },
      register: (opts: any, comp: any) => {
        calls.push(["register", opts.name, opts.id, opts.key, typeof comp]);
        return () => { disposed = true; };
      },
    },
  };
  const stop = view.mountBanner(fctx);
  assert.deepEqual(calls.map((c) => c[0]), ["inject", "register"]);
  assert.equal(calls[1][1], "conversation.session");
  assert.equal(calls[1][2], "dsh-im-companion:welcome-banner");
  assert.equal(calls[1][3], "dsh-im-companion:welcome-banner");
  assert.equal(calls[1][4], "function");
  stop();
  assert.equal(disposed, true);
});

test("无槽位服务静默无挂载", () => {
  const stop = view.mountBanner({ slots: {} });
  assert.equal(typeof stop, "function");
  stop();
});

rmSync(tmp, { recursive: true, force: true });
