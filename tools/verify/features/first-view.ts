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

test("中文文案 = 赢家口径（增强标题 / 按助理 / 按渠道 / ghost 同级）", () => {
  const zh = copy.firstViewCopy("zh");
  assert.equal(zh.title, "IM机器人增强");
  assert.equal(zh.sub, "IM COMPANION · 辅助插件");
  assert.equal(zh.byAgent(12), "按助理 (12)");
  assert.equal(zh.byChannel(2), "按渠道 (2)");
  assert.ok(zh.updatedTip("11:26:13").indexOf("11:26:13") >= 0);
  assert.equal(zh.join, "接入");
  assert.equal(zh.joinTitle, "接入新渠道");
  assert.equal(zh.detail, "详情");
  assert.equal(zh.radar, "扬帆远航！");
  assert.equal(zh.adopt, "串门搬家");
  assert.equal(zh.starHref, "https://github.com/FeatherHunter/dsh-im-companion");
  assert.equal(zh.promoDeck, "dsh-mattpocock-skills-deck");
  assert.equal(zh.promoPal, "dsh-opencode-palette");
});

test("#78 版本组文案：两个版本号各自带标签（一眼分得清谁是谁）", () => {
  const zh = copy.firstViewCopy("zh");
  assert.equal(zh.versionLabel("v0.1.5"), "IM Companion v0.1.5", "自家版本必须带品牌名");
  assert.equal(zh.compatChip("4.17.1"), "兼容 dsh-im 4.17.1", "兼容版本必须带「兼容」二字 + 产品名");
  assert.ok(zh.compatTitle("4.17.1", ">=4.17.1 || <=4.17.0").indexOf("已在 dsh-im 4.17.1") >= 0, "悬停说明须含已验证口径");
  assert.ok(zh.compatTitle("4.17.1", ">=4.17.1 || <=4.17.0").indexOf(">=") >= 0, "悬停说明须含兼容范围");
  assert.ok(zh.compatHref.indexOf("dsh-im-companion") >= 0 && zh.compatHref.indexOf("#compat") >= 0, "兼容标记须跳兼容性说明锚点");
  const en = copy.firstViewCopy("en");
  assert.equal(en.versionLabel("v0.1.5"), "IM Companion v0.1.5");
  assert.equal(en.compatChip("4.17.1"), "compatible dsh-im 4.17.1");
  assert.ok(en.compatTitle("4.17.1", ">=4.17.1 || <=4.17.0").indexOf("Verified against dsh-im 4.17.1") >= 0);
  assert.ok(en.compatHref.indexOf("#compat") >= 0);
});

test("#78 顶部单行硬约束：.af-hd 不换行 + 右组不压缩 + 左块先让位", () => {
  const css: string = styles.FIRST_VIEW_CSS;
  assert.ok(css.indexOf(".af-hd { flex-wrap: nowrap; }") >= 0, "顶部禁止换行（用户裁定：不许变 2 行）");
  assert.ok(css.indexOf(".af-hd-right { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex: none; }") >= 0, "右组 flex:none 不压缩");
  assert.ok(css.indexOf(".af-hd-left { min-width: 0; }") >= 0, "左块 min-width:0 先让位");
  assert.ok(css.indexOf(".af-hd-left .af-title") >= 0 && css.indexOf("text-overflow: ellipsis") >= 0, "左块 ellipsis 兜底");
  assert.ok(css.indexOf(".af-verbox") >= 0 && css.indexOf(".af-compat") >= 0, "版本组样式必须存在");
});

test("英文文案成套（实现侧以 key 提供两套，不做切换器）", () => {
  const en = copy.firstViewCopy("en");
  assert.equal(en.title, "IM Companion");
  assert.equal(en.byAgent(12), "By Assistants (12)");
  assert.equal(en.byChannel(2), "By Channels (2)");
  assert.equal(en.join, "Connect");
  assert.equal(en.detail, "Details");
  assert.equal(en.radar, "Set sail!");
  assert.equal(en.adopt, "Visit & move");
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
  for (const cls of [".af-title-sub", ".af-tap", ".af-av-m0", ".af-av-m3", ".af-star", ".af-promo", ".af-promo-item", ".af-verbox", ".af-compat"]) {
    assert.ok(css.indexOf(cls) >= 0, "赢家样式缺失：" + cls);
  }
  assert.ok(css.indexOf(":focus-within") >= 0, "键盘 focus-within 显现必须存在");
  assert.ok(css.indexOf(".af-row.af-tap") >= 0, "触屏点行呼出必须存在");
  assert.ok(css.indexOf(".af-name > span:first-child") >= 0 && css.indexOf("text-overflow: ellipsis") >= 0, "长名省略必须存在");
  assert.ok(css.indexOf("prefers-reduced-motion") >= 0, "动效降级必须存在");
  assert.equal(css.indexOf(".af-btn.primary"), -1, "详情不再整排 primary 高亮，禁回潮");
  assert.equal(css.indexOf("#fff"), -1, "样式禁硬编码 #fff（走别名）");
  assert.equal(css.indexOf("#000"), -1, "样式禁硬编码 #000（走别名）");
  assert.ok(css.indexOf(".af-toolbar") >= 0 && css.indexOf("nowrap") >= 0, "工具栏须单行不断行（4 按钮与搜索同行）");
  assert.ok(css.indexOf(".af-toolbar .af-icon-btn") >= 0, "工具栏按钮应收紧（32px，防挤换行）");
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

// ---- T4 双模式 8 键文案（#69 辅接缝：新增 8 键中英断言 + 既有三态未动）----
const dmTmp2 = mkdtempSync(join(tmpdir(), "fv-dual-mode-"));
try {
  execFileSync(process.execPath, [
    join(REPO, "node_modules", "typescript", "bin", "tsc"),
    join(REPO, "src", "client", "data", "config.ts"),
    join(REPO, "src", "client", "data", "model.ts"),
    join(COMP, "first-view-copy.ts"),
    join(COMP, "dual-mode-copy.ts"),
    "--ignoreConfig",
    "--outDir", dmTmp2, "--module", "commonjs", "--target", "es2023",
    "--moduleResolution", "bundler", "--skipLibCheck",
    "--declaration", "false", "--sourceMap", "false",
  ], { stdio: "pipe" });
} catch (e) {
  console.error("TRANPILE-FAIL " + String((e as any).stdout ?? "") + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const dmReq2 = createRequire(join(dmTmp2, "components", "run.cjs"));
const dmCopy: any = dmReq2("./dual-mode-copy.js");

test("T4 双模式 8 键中文（T2 定稿一字不差）", () => {
  const zh = dmCopy.dualModeCopy("zh");
  assert.equal(zh.choiceTitle, "选择接入方式");
  assert.equal(zh.choiceSub("小帅", "飞书"), "为「小帅」创建飞书机器人，请选择方式");
  assert.equal(zh.choiceQr, "扫码创建");
  assert.equal(zh.choiceManual, "手动填写");
  assert.equal(zh.manualTitle("飞书"), "手动填写飞书信息");
  assert.equal(zh.manualSubmit, "提交并接入");
  assert.equal(zh.back, "返回选择");
  assert.equal(zh.fail("denied"), "接入失败：denied");
});

test("T4 双模式 8 键英文（自然语序）", () => {
  const en = dmCopy.dualModeCopy("en");
  assert.equal(en.choiceTitle, "Choose a connection method");
  assert.equal(en.choiceQr, "Create by scanning");
  assert.equal(en.choiceManual, "Enter manually");
  assert.equal(en.manualSubmit, "Submit and connect");
  assert.equal(en.back, "Back to options");
  assert.ok(en.choiceSub("X", "Slack").indexOf("choose how to proceed") >= 0);
  assert.equal(en.fail("denied"), "Connection failed: denied");
});

test("T4 前置提示零硬门 + 脱敏分级 helper", () => {
  assert.ok((dmCopy.manualHint("slack", "zh") ?? "").indexOf("Manifest") >= 0);
  assert.ok((dmCopy.manualHint("discord", "zh") ?? "").indexOf("Intent") >= 0);
  assert.equal(dmCopy.manualHint("weixin", "zh"), null);
  assert.equal(dmCopy.maskPreview("1234567"), "••••");
  assert.equal(dmCopy.maskPreview("abcdef1234"), "•••1234");
  assert.ok(dmCopy.secretPlaceholder("configured", "zh").indexOf("已配置") >= 0);
});

test("T4 既有三态一字不动（8 键只新增，不回写旧页）", () => {
  const zh = copy.firstViewCopy("zh").states;
  assert.equal(zh.emptySearchTitle, "没有找到匹配的助理");
  assert.equal(zh.emptyNoneTitle, "还没有助理");
  assert.equal(zh.retry, "重试");
});

rmSync(dmTmp2, { recursive: true, force: true });

rmSync(tmp, { recursive: true, force: true });
