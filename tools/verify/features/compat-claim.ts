// #175（spec #168 故事 53/60）dsh-im 兼容声明门禁：声明字段、构建注入、范围语义、悬停文案、升级回归钉子。
// 跑法：node --test tools/verify/features/compat-claim.ts
//   （单跑前别忘了 npm run build：本文件会读 lib/client.js 证明「产物说的就是声明」；
//    npm run check 里 verify 排在 build 之后，顺序由本文件自己断言。）
// 升级回归钉子（#168 兼容小节）：dsh-im 6.0 之前必须重跑 T1/T2 两份取证（系统提示词注入面 + 会话归属落盘映射），
// 再决定是否扩大范围；绑定表形状、section 注册契约、与上游 order 115/125 的共存、bots/ / accounts/ 双路径
// 由 T8-2（#170）的 persona 注入 verify 钉住——本票只引用，不在这里实现。
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { loadLocales } from "../../../scripts/i18n-locales.mjs";
import assert from "node:assert/strict";

const REPO = process.cwd();
const pkg: any = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const decl: any = pkg?.dshImCompat ?? {};

/* ---------- 最小范围匹配器（只认空格分隔的比较 token，如 ">=5.1.0 <6"） ----------
 * 不引第三方依赖。遇到不认识的写法直接抛错：将来改范围写法必须同时更新本门禁，
 * 「声明」与「可证明的语义」才不会各走各的。 */
type Version = [number, number, number];
const VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

function parseVersion(v: string): Version {
  const m = VERSION.exec(String(v).trim());
  if (!m) throw new Error("版本号必须是 X、X.Y 或 X.Y.Z：" + JSON.stringify(v));
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function compare(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function inRange(range: string, version: string): boolean {
  const v = parseVersion(version);
  return String(range).trim().split(/\s+/).every((token) => {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
    if (!m) throw new Error("无法识别的范围 token：" + token);
    const cmp = compare(v, parseVersion(m[2]));
    switch (m[1] ?? "=") {
      case ">=": return cmp >= 0;
      case "<=": return cmp <= 0;
      case ">": return cmp > 0;
      case "<": return cmp < 0;
      case "=": return cmp === 0;
      default: throw new Error("无法识别的范围 token：" + token);
    }
  });
}

test("#175 声明 = 实际验证过的 dsh-im 5.1.0（范围 >=5.1.0 <6，不再宣称 4.x）", () => {
  assert.deepEqual(decl, { verified: "5.1.0", range: ">=5.1.0 <6" },
    "package.json.dshImCompat 是单点真相：旧写法 range 恒真（>=4.17.1 覆盖全部版本），必须收口到验证过的范围");
});

test("#175 版本门：5.x 通过，4.x / 6.x 与 5.0.x 诚实拒绝", () => {
  const range = decl.range;
  for (const v of ["5.1.0", "5.9.9"]) assert.ok(inRange(range, v), v + " 应落在声明范围内");
  for (const v of ["4.17.1", "4.39.0", "5.0.9", "6.0.0", "6.0.1"]) {
    assert.ok(!inRange(range, v), v + " 必须被拒绝（未验证的范围不宣称）");
  }
  assert.deepEqual(parseVersion(decl.verified), [5, 1, 0], "verified 必须落在 range 内");
  assert.ok(inRange(range, decl.verified), "verified 必须落在 range 内");
});

test("#175 构建注入仍从 package.json 派生，且 check 先 build 后 verify", async () => {
  const cfg: any = await import(pathToFileURL(join(REPO, "tsdown.config.ts")).href);
  const bundleCfg = (cfg.default ?? [])[0];
  assert.deepEqual(JSON.parse(bundleCfg.define.__DSH_IM_COMPAT__), decl,
    "tsdown 的 __DSH_IM_COMPAT__ 必须由 package.json.dshImCompat 派生（改一处 UI 即变，禁止第二份版本号）");
  const scripts = pkg.scripts ?? {};
  assert.ok(String(scripts.check).includes("npm run build") && String(scripts.check).includes("npm run verify"),
    "check 必须同时跑 build 与 verify");
  assert.ok(String(scripts.check).indexOf("npm run build") < String(scripts.check).indexOf("npm run verify"),
    "check 必须先 build 再 verify，否则产物断言读到的是上一版包");
  assert.ok(String(scripts.verify).includes("node --test tools/verify/features/compat-claim.ts"),
    "本门禁必须接进 verify 脚本链（逐条清单、无 glob）");
});

test("#175 构建产物带的就是声明值（运行期胶囊/悬停不会说别的版本）", () => {
  const file = join(REPO, "lib", "client.js");
  assert.ok(existsSync(file), "lib/client.js 不在：先 npm run build（npm run check 会先 build）");
  /* tsdown/rolldown 注入对象字面量时会格式化空白（键与值之间），故对 "key": 的空白宽容，值本身逐字比对。 */
  const bundle = readFileSync(file, "utf8").replace(/"\s*:\s*/g, '":');
  for (const field of ["verified", "range"]) {
    const needle = JSON.stringify(field) + ":" + JSON.stringify(decl[field]);
    assert.ok(bundle.includes(needle), "产物缺声明字段 " + needle);
  }
  assert.equal(bundle.includes("4.17.1"), false, "产物不得残留旧声明口径 4.17.1");
});

test("#175 运行期不硬编码版本（胶囊只从注入取，诚实性落在声明上）", () => {
  const panel = readFileSync(join(REPO, "src", "client", "components", "panel.ts"), "utf8");
  assert.ok(panel.includes("__DSH_IM_COMPAT__"), "panel.ts 必须读取构建注入的兼容信息");
  const code = panel.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/\d+\.\d+\.\d+/.test(code), false, "panel.ts 不得硬编码版本号（否则改声明不会改 UI）");
});

/* ---------- 悬停/胶囊文案（转译源码后断言，precedent：first-view.ts） ---------- */
const tmp = mkdtempSync(join(tmpdir(), "fv-compat-claim-"));
try {
  execFileSync(process.execPath, [
    join(REPO, "node_modules", "typescript", "bin", "tsc"),
    join(REPO, "src", "client", "data", "config.ts"),
    join(REPO, "src", "client", "data", "model.ts"),
    join(REPO, "src", "client", "components", "first-view-copy.ts"),
    join(REPO, "src", "client", "i18n", "core.ts"),
    join(REPO, "src", "client", "i18n", "index.ts"),
    "--ignoreConfig",
    "--rootDir", join(REPO, "src"),
    "--outDir", tmp, "--module", "commonjs", "--target", "es2023",
    "--moduleResolution", "bundler", "--skipLibCheck",
    "--declaration", "false", "--sourceMap", "false",
  ], { stdio: "pipe" });
} catch (e) {
  console.error("TRANPILE-FAIL " + String((e as any).stdout ?? "") + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const copy: any = createRequire(join(tmp, "client", "components", "run.cjs"))("./first-view-copy.js");
/* #184：悬停/胶囊文案改由 YAML 词条提供 —— 先装载词条再断言。 */
const i18nCore: any = createRequire(join(tmp, "client", "components", "run.cjs"))("../i18n/core.js");
const i18nDicts = loadLocales(REPO);
assert.equal(i18nDicts.problems.length, 0, "locales.yaml 校验失败：" + i18nDicts.problems.join("；"));
i18nCore.setDictionaries(i18nDicts.dicts);

test("#175 悬停文案写真实基线（中英同源，5.1.0 + 6.0 前重跑取证；旧 4.17.1+ 口径退场）", () => {
  const zh = copy.firstViewCopy("zh");
  const en = copy.firstViewCopy("en");
  assert.equal(zh.compatChip("5.1.0"), "dsh-im 5.1.0");
  assert.equal(en.compatChip("5.1.0"), "dsh-im 5.1.0");
  const pairs: [string, string][] = [
    ["zh", zh.compatTitle("5.1.0", ">=5.1.0 <6")],
    ["en", en.compatTitle("5.1.0", ">=5.1.0 <6")],
  ];
  for (const [lang, title] of pairs) {
    assert.ok(title.includes("5.1.0"), lang + " 悬停须含已验证基线 5.1.0：" + title);
    assert.ok(title.includes(">=5.1.0 <6"), lang + " 悬停须含声明范围：" + title);
    assert.ok(title.includes("6.0"), lang + " 悬停须提示 6.0 前重跑兼容取证：" + title);
    assert.equal(title.includes("4.17.1"), false, lang + " 悬停不得残留旧范围口径：" + title);
  }
  assert.ok(zh.compatHref.includes("#compat") && en.compatHref.includes("#compat"), "兼容链接锚点不变");
});

test("#175 CHANGELOG 记下 6.0 升级回归钉子（T1/T2 取证重跑 + T8-2 的 persona 注入 verify 引用）", () => {
  const log = readFileSync(join(REPO, "CHANGELOG.md"), "utf8");
  // 发版前钉子写在 [Unreleased]；发版时整节改名为 [<当前版本>]（0.2.20 起），门禁两种形态都要认，
  // 否则「发布一次版本」就会把兼容门禁判红——那会把发版流程和钉子对立起来。
  const start = log.search(/^## \[[^\]]+\]/m);
  assert.ok(start >= 0, "CHANGELOG 顶部须有版本节（[Unreleased] 或 [<version>]）");
  const heading = /^## \[([^\]]+)\]/.exec(log.slice(start))![1];
  assert.ok(heading === "Unreleased" || heading === pkg.version,
    "CHANGELOG 顶部节须是 [Unreleased] 或当前包版本 [" + pkg.version + "]，实际 [" + heading + "]");
  const next = log.indexOf("\n## [", start + 5);
  const section = log.slice(start, next < 0 ? undefined : next);
  for (const needle of ["#175", "5.1.0", ">=5.1.0 <6", "6.0", "T1/T2", "bots/", "accounts/", "#170"]) {
    assert.ok(section.includes(needle), "[" + heading + "] 升级回归钉子区缺：" + needle);
  }
});

rmSync(tmp, { recursive: true, force: true });
