// #184 i18n 门禁：词条装载（YAML 形状 / ns 唯一 / 中英键集一致 / problems 为空）+ core 查词语义。
// 跑法：node --test tools/verify/i18n.ts（本文件不依赖构建产物，先于 build 单跑也可）。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { loadLocales } from "../../scripts/i18n-locales.mjs";

const REPO = process.cwd();
const locales = loadLocales(REPO);

test("#184 词条单一真相：src 下 locales.yaml 全部通过校验", () => {
  assert.equal(locales.problems.length, 0, "locales.yaml 校验失败：\n" + locales.problems.join("\n"));
  assert.ok(locales.files.length >= 3, "至少 common / first-view / left-filter 三份（实际 " + locales.files.length + "）");
  for (const ns of ["common", "first-view", "left-filter"]) {
    assert.ok(locales.dicts[ns], "缺命名空间 " + ns);
  }
});

/* 转译纯查词层（precedent：features/*.ts 的 verify 用仓库自带 tsc 转译后断言产物）。 */
const tmp = mkdtempSync(join(tmpdir(), "i18n-core-"));
try {
  execFileSync(process.execPath, [
    join(REPO, "node_modules", "typescript", "bin", "tsc"),
    join(REPO, "src", "client", "i18n", "core.ts"),
    join(REPO, "src", "client", "i18n", "index.ts"),
    "--ignoreConfig",
    "--rootDir", join(REPO, "src"),
    "--outDir", tmp, "--module", "commonjs", "--target", "es2023",
    "--moduleResolution", "bundler", "--skipLibCheck",
    "--declaration", "false", "--sourceMap", "false",
  ], { stdio: "pipe" });
} catch (e) {
  console.error("TRANSPILE-FAIL " + String((e as any).stdout ?? "") + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const core: any = createRequire(join(tmp, "run.cjs"))("./client/i18n/core.js");
core.setDictionaries(locales.dicts);

test("#184 查词：当前语言 / 回退链（未知→en）/ {name} 插值 / 缺词返回键名", () => {
  core.setActiveLocale("zh");
  assert.equal(core.t("common", "panel.title"), "IM机器人增强");
  assert.equal(core.t("left-filter", "filters.bound"), "有助理");
  core.setActiveLocale("en");
  assert.equal(core.t("common", "panel.title"), "IM Companion");
  core.setActiveLocale("ja");
  assert.equal(core.t("common", "panel.title"), "IM Companion", "未知语言回退 en");
  assert.equal(core.translate("ja", "left-filter", "filters.all"), "All");
  assert.equal(core.translate("zh", "first-view", "byAgent", { n: 12 }), "按助理 (12)");
  assert.equal(core.translate("en", "first-view", "byAgent", { n: 12 }), "By Assistants (12)");
  assert.ok(core.translate("zh", "left-filter", "header.tip", { label: "有助理", n: 2, all: 3, bound: 2, unbound: 1 }).indexOf("有助理 2") >= 0);
  assert.equal(core.translate("zh", "common", "no.such.key"), "no.such.key", "缺词返回键名（不静默空串）");
  assert.equal(core.translate("zh", "no-such-ns", "x"), "x");
  assert.equal(core.translate("zh", "first-view", "byAgent", {}), "按助理 ({n})", "缺参数占位符原样保留");
});

test("#184 键集一致：每个 zh 键都有 en 译法（漏译在门禁暴露）", () => {
  for (const ns of Object.keys(locales.dicts)) {
    for (const key of Object.keys(locales.dicts[ns].zh)) {
      assert.ok(core.hasKey(ns, "en", key), ns + "/" + key + " 缺英文词条");
    }
    for (const key of Object.keys(locales.dicts[ns].en)) {
      assert.ok(core.hasKey(ns, "zh", key), ns + "/" + key + " 缺中文词条");
    }
  }
});

test("#184 语言切换订阅：同语言不通知 / 切换通知 / 退订生效 / 修订号单调", () => {
  core.setActiveLocale("zh");
  let hits = 0;
  const off = core.onLocaleChange(() => { hits++; });
  const before = core.localeRevision();
  core.setActiveLocale("zh");
  assert.equal(hits, 0, "同一语言不应触发通知");
  core.setActiveLocale("en");
  assert.equal(core.activeLocale(), "en");
  assert.ok(hits >= 1, "切语言必须通知订阅者");
  assert.ok(core.localeRevision() > before, "修订号必须单调递增（视图靠它强制重绘）");
  core.setActiveLocale("ja");
  assert.equal(core.activeLocale(), "ja", "未知语言保留原文（查词层再回退 en）");
  off();
  const after = hits;
  core.setActiveLocale("zh");
  core.setActiveLocale("en");
  assert.equal(hits, after, "退订后不应再收到通知");
  core.setActiveLocale("zh");
});

rmSync(tmp, { recursive: true, force: true });
