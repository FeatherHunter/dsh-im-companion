// #26 首屏赢家变体自验证（D 拼装 + 助理 + P2）：头像音节 / 莫兰迪兜底 / 双语文案 / 样式命名空间（node --test，零第三方依赖）。
// 做法：用仓库自带 tsc 把 copy + styles 链转译到临时目录，再断言转译产物（precedent：welcome-banner.ts）。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const REPO = process.cwd();
const COMP = join(REPO, "src", "client", "components");
const ENTRIES = [
  join(REPO, "src", "client", "data", "config.ts"),
  join(REPO, "src", "client", "data", "model.ts"),
  join(COMP, "first-view-copy.ts"),
  join(COMP, "first-view-styles.ts"),
  join(REPO, "src", "client", "theme.ts"),
];

const tmp = mkdtempSync(join(tmpdir(), "fv-first-view-"));
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
const req = createRequire(join(tmp, "components", "run.cjs"));
const copy: any = req("./first-view-copy.js");
const styles: any = req("./first-view-styles.js");

test("Xiao 系取特征音节（A 前两字母 Xi 证伪后的 D 方案）", () => {
  assert.equal(copy.winnerAvatarText("Xiaojiang"), "Ji");
  assert.equal(copy.winnerAvatarText("Xiaoshan"), "Sh");
  assert.equal(copy.winnerAvatarText("Xiaosun"), "Su");
  assert.equal(copy.winnerAvatarText("Xiaowan"), "Wa");
  assert.equal(copy.winnerAvatarText("Xiaoyan"), "Ya");
  assert.equal(copy.winnerAvatarText("  xiaojiang  "), "Ji");
});

test("非 Xiao 系维持首字母（含中文与空值）", () => {
  assert.equal(copy.winnerAvatarText("Dsh-mattpocock-skills-deck"), "D");
  assert.equal(copy.winnerAvatarText("Shujucangkuguanliyuan"), "S");
  assert.equal(copy.winnerAvatarText("小帅"), "小");
  assert.equal(copy.winnerAvatarText(""), "?");
  assert.equal(copy.winnerAvatarText("Xiao"), "X");
});

test("莫兰迪兜底只染 Xiao 系（自定义头像走 img 层，本函数只定渐变类）", () => {
  const got = copy.winnerAvatarClass("Xiaojiang", "af-av-3");
  assert.ok(/^af-av-m[0-3]$/.test(got), "Xiao 系应为 m0-m3，实得 " + got);
  assert.equal(copy.winnerAvatarClass("小帅", "af-av-3"), "af-av-3");
  assert.equal(copy.winnerAvatarClass("Dsh-x", "af-av-1"), "af-av-1");
  assert.equal(
    copy.winnerAvatarClass("Xiaojiang", "af-av-3"),
    copy.winnerAvatarClass("Xiaojiang", "af-av-7"),
    "同名同色（仅兜底，不随传入 fallback 漂移）");
});

test("中文文案 = 赢家口径（助理 / 按助理 / 按渠道 / ghost 同级）", () => {
  const zh = copy.firstViewCopy("zh");
  assert.equal(zh.title, "助理");
  assert.equal(zh.sub, "ASSISTANTS");
  assert.equal(zh.byAgent(12), "按助理 (12)");
  assert.equal(zh.byChannel(2), "按渠道 (2)");
  assert.ok(zh.updatedTip("11:26:13").indexOf("11:26:13") >= 0);
  assert.equal(zh.join, "接入");
  assert.equal(zh.joinTitle, "接入新渠道");
  assert.equal(zh.detail, "详情");
  assert.equal(zh.radar, "舰队视图事件入口");
  assert.equal(zh.starHref, "https://github.com/FeatherHunter/dsh-im-companion");
  assert.equal(zh.promoDeck, "dsh-mattpocock-skills-deck");
  assert.equal(zh.promoPal, "dsh-opencode-palette");
});

test("英文文案成套（实现侧以 key 提供两套，不做切换器）", () => {
  const en = copy.firstViewCopy("en");
  assert.equal(en.title, "Assistants");
  assert.equal(en.byAgent(12), "By Assistants (12)");
  assert.equal(en.byChannel(2), "By Channels (2)");
  assert.equal(en.join, "Connect");
  assert.equal(en.detail, "Details");
  assert.equal(en.promoTitle, "Related projects");
});

test("语言跟随 documentElement.lang（en 开头即英文）", () => {
  assert.equal(copy.firstViewLang({ documentElement: { lang: "en-US" } }), "en");
  assert.equal(copy.firstViewLang({ documentElement: { lang: "zh-CN" } }), "zh");
  assert.equal(copy.firstViewLang({ documentElement: {} }), "zh");
  assert.equal(copy.firstViewLang(null), "zh");
});

test("样式命名空间与关键规则（新增类 only，既有零改动）", () => {
  const css: string = styles.FIRST_VIEW_CSS;
  assert.equal(styles.FIRST_VIEW_STYLE_ID, "first-view");
  for (const cls of [".af-title-sub", ".af-tap", ".af-av-m0", ".af-av-m3", ".af-star", ".af-promo", ".af-promo-item"]) {
    assert.ok(css.indexOf(cls) >= 0, "赢家样式缺失：" + cls);
  }
  assert.ok(css.indexOf(":focus-within") >= 0, "键盘 focus-within 显现必须存在");
  assert.ok(css.indexOf(".af-row.af-tap") >= 0, "触屏点行呼出必须存在");
  assert.ok(css.indexOf(".af-name > span:first-child") >= 0 && css.indexOf("text-overflow: ellipsis") >= 0, "长名省略必须存在");
  assert.ok(css.indexOf("prefers-reduced-motion") >= 0, "动效降级必须存在");
  assert.equal(css.indexOf(".af-btn.primary"), -1, "详情不再整排 primary 高亮，禁回潮");
  assert.equal(css.indexOf("#fff"), -1, "样式禁硬编码 #fff（走别名）");
  assert.equal(css.indexOf("#000"), -1, "样式禁硬编码 #000（走别名）");
});

test("#27 三态说人话（旧 Agent 名词禁回潮）", () => {
  const zh = copy.firstViewCopy("zh").states;
  assert.ok(zh.loading.indexOf("助理") >= 0);
  assert.equal(zh.emptySearchTitle, "没有找到匹配的助理");
  assert.ok(zh.emptySearchSub.indexOf("关键词") >= 0);
  assert.equal(zh.emptyNoneTitle, "还没有助理");
  assert.ok(zh.emptyNoneSub.indexOf("工具栏") >= 0, "＋ 已搬工具栏，文案不得再写右上角");
  assert.ok(zh.errorMsg.indexOf("重试") >= 0);
  assert.equal(zh.retry, "重试");
  for (const v of [zh.loading, zh.emptySearchTitle, zh.emptyNoneTitle]) {
    assert.equal(v.indexOf("Agent"), -1, "中文三态禁旧名词：" + v);
  }
  const en = copy.firstViewCopy("en").states;
  assert.equal(en.emptySearchTitle, "No matching assistants");
  assert.equal(en.emptyNoneTitle, "No assistants yet");
  assert.equal(en.retry, "Retry");
  assert.ok(en.emptyNoneSub.indexOf("toolbar") >= 0);
});

rmSync(tmp, { recursive: true, force: true });
