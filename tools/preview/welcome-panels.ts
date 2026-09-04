// 五时辰预览台生成器（开发工具，只读源码生成静态 HTML，不碰产品代码）。
// 用法：node tools/preview/welcome-panels.ts
// 产物：.scratch/welcome-panels.html（双击即开；下方切换凌晨/清晨/白天/黄昏/深夜）。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const REPO = process.cwd();
const DATA = join(REPO, "src", "client", "data");
const WB = join(REPO, "src", "features", "welcome-banner");
const ENTRIES = [join(DATA, "config.ts"), join(DATA, "model.ts"), join(DATA, "fleet-api.ts"), join(DATA, "bindings.ts"), join(DATA, "meta.ts"), join(REPO, "src", "client", "theme.ts"), join(WB, "data.ts"), join(WB, "styles.ts")];
const tmp = mkdtempSync(join(tmpdir(), "wb-panels-"));
try {
  execFileSync(process.execPath, [join(REPO, "node_modules", "typescript", "bin", "tsc"), ...ENTRIES, "--ignoreConfig", "--outDir", tmp, "--module", "commonjs", "--target", "es2023", "--moduleResolution", "bundler", "--skipLibCheck", "--declaration", "false", "--sourceMap", "false"], { stdio: "pipe" });
} catch (e) {
  console.error("TRANPILE-FAIL " + String((e as any).stdout ?? "") + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
const req = createRequire(join(tmp, "run.cjs"));
const data: any = req("./features/welcome-banner/data.js");
const styles: any = req("./features/welcome-banner/styles.js");
const esc = (s: unknown): string => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const segs: string[] = data.TIME_SEGS;
const langs: string[] = ["zh", "en"];
const realId = (() => {
  try {
    const doc = JSON.parse(readFileSync(join(homedir(), ".dsh", "integrations", "dsh-im-companion", "meta.json"), "utf8"));
    const names = (doc && typeof doc.names === "object" ? doc.names : {}) as Record<string, unknown>;
    const avatars = (doc && typeof doc.avatars === "object" ? doc.avatars : {}) as Record<string, unknown>;
    const path = Object.keys(names).find((k) => typeof names[k] === "string" && (names[k] as string).trim());
    if (!path) return null;
    const av = avatars[path];
    return { path, name: String(names[path]), avatar: typeof av === "string" && av.indexOf("data:image") === 0 ? av : null };
  } catch { return null; }
})();
const hostName = { zh: realId ? realId.name : "小帅", en: "Xiaoshuai" };
const hostAvatar: string | null = realId ? realId.avatar : null;
const hostFrom: string = realId ? realId.path : "mock";
const idxs = [0, 1, 2];
const panels = langs.map((lang) => segs.map((seg) => idxs.map((idx) => {
  const c = data.copyFor(seg, idx, lang);
  const sub = (lang === "en" ? "Online" : "在线") + " · " + data.displaySub(c.s, 2, hostName[lang], lang);
  let deco = "";
  if (c.moon) {
    let stars = "";
    for (let k = 0; k < 26; k++) {
      const sx = (k * 37) % 100;
      const sy = (k * 53) % 72;
      stars += '<span class="wb-star wb-s' + ((k % 3) + 1) + '" style="left:' + sx + '%;top:' + sy + '%;animation-delay:' + ((k % 9) * 0.35) + 's"></span>';
    }
    deco = '<div class="wb-moon"></div>' + stars;
  } else {
    deco = '<div class="wb-haze"></div><div class="wb-cirrus"></div><div class="wb-sun"></div><div class="wb-cloud wb-c1"></div><div class="wb-cloud wb-c2"></div>';
  }
  const horizon = c.horizon ? '<div class="wb-horizon"></div>' : "";
  return '<div class="pv-stage" id="pv-' + lang + '-' + seg + '-' + idx + '"><div class="wb-modal"><div class="wb-backdrop"></div>'
    + '<section class="wb-banner"><div class="wb-sky ' + c.sky + '">' + deco + horizon
    + '<div class="wb-grain"></div><div class="wb-vig"></div>'
    + '<div class="wb-copy"><div class="wb-host"><div class="wb-host-avatar">' + (hostAvatar ? '<img src="' + hostAvatar + '" alt="">' : esc(hostName[lang].slice(0, 1))) + '</div><div class="wb-host-name">' + esc(hostName[lang]) + '</div><span class="wb-dot wb-online"></span></div><div class="wb-title">' + esc(c.t) + '</div>'
    + '<div class="wb-sub"><span class="wb-dot wb-online"></span>' + esc(sub) + '</div></div>'
    + '<div class="wb-cta"><button class="wb-enter">' + esc(c.b) + '<small class="wb-enter-sub">' + esc(c.bs) + '</small></button></div>'
    + '</div></section></div></div>';
}).join("\n")).join("\n")).join("\n");
const tabs = '<button data-lang="zh" class="pv-lang">中文</button><button data-lang="en" class="pv-lang">EN</button>' + segs.map((seg) => '<button data-seg="' + seg + '">' + esc(data.copyFor(seg, 0).tab) + '</button>').join("") + idxs.map((i) => '<button data-idx="' + i + '">第' + (i + 1) + '句</button>').join("");
const css = String(styles.CSS ?? "");
const head = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' + '<meta name="viewport" content="width=device-width, initial-scale=1">' + '<title>欢迎页 · 五时辰预览台</title><style>' + css;
const chrome = "*{box-sizing:border-box}body{margin:0;background:#0b0e14;color:#e6edf3;font:14px/1.6 -apple-system,\"PingFang SC\",\"Noto Sans SC\",sans-serif}";
const bar = ".pv-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:6px;background:rgba(17,20,28,.92);border:1px solid #2a313b;border-radius:999px;padding:8px 10px;z-index:50;box-shadow:0 8px 30px rgba(0,0,0,.5)}";
const btn = ".pv-bar button{border:1px solid #2a313b;background:#1a2030;color:#e6edf3;border-radius:999px;padding:8px 18px;font:inherit;cursor:pointer}";
const on = ".pv-bar button.on{background:#1677ff;border-color:#1677ff;color:#ffffff}";
const note = ".pv-note{position:fixed;left:50%;top:14px;transform:translateX(-50%);font-size:12px;color:#8b949e;background:rgba(17,20,28,.85);padding:6px 14px;border-radius:999px;z-index:50;white-space:nowrap}";
const stage = ".pv-stage{position:relative;height:100vh;display:none}.pv-stage.on{display:block}.pv-stage .wb-modal{position:absolute}";
const jsShow = "var curLang='zh';var curSeg='day';var curIdx=0;function show(seg,idx,lang){if(seg)curSeg=seg;if(idx!==null&&idx!==undefined)curIdx=idx;if(lang)curLang=lang;for(var li=0;li<langs.length;li++){for(var i=0;i<segs.length;i++){for(var k=0;k<3;k++){var el=document.getElementById('pv-'+langs[li]+'-'+segs[i]+'-'+k);if(el)el.className='pv-stage'+(langs[li]===curLang&&segs[i]===curSeg&&k===curIdx?' on':'');}}}var b=document.querySelectorAll('.pv-bar button');for(var j=0;j<b.length;j++){var bs=b[j].getAttribute('data-seg');var bi=b[j].getAttribute('data-idx');var bl=b[j].getAttribute('data-lang');b[j].className=((bs&&bs===curSeg)||(bi!==null&&Number(bi)===curIdx)||(bl&&bl===curLang))?'on':'';}}";
const jsWire = "(function(){var b=document.querySelectorAll('.pv-bar button');for(var j=0;j<b.length;j++){(function(x){x.addEventListener('click',function(){var s=x.getAttribute('data-seg');var k=x.getAttribute('data-idx');var l=x.getAttribute('data-lang');if(s)show(s,null,null);else if(k!==null)show(null,Number(k),null);else if(l)show(null,null,l);});})(b[j]);})();";
const jsAuto = "(function(){var h=new Date().getHours();var d=new Date().getDate();show(h>=2&&h<5?'wee':h>=5&&h<9?'dawn':h>=9&&h<17?'day':h>=17&&h<20?'dusk':'night',((d%3)+3)%3,null);})();";
const idNote = hostFrom === "mock" ? "mock 数据" : "真实身份：" + hostFrom;
const bodyHtml = '<div class="pv-note">五时辰 × 三句 × 中英预览台 · 下方切换 · ' + esc(idNote) + '</div><div class="pv-bar">' + tabs + '</div>' + panels;
const full = head + chrome + bar + btn + on + note + stage + '</style></head><body>' + bodyHtml + '<script>var segs=' + JSON.stringify(segs) + ';var langs=' + JSON.stringify(["zh", "en"]) + ';' + jsShow + jsWire + jsAuto + '</scr' + 'ipt></body></html>';
const out = join(REPO, ".scratch", "welcome-panels.html");
writeFileSync(out, full, "utf8");
console.log("PANELS " + segs.join(",") + " -> " + out + " (" + full.length + " chars)");
rmSync(tmp, { recursive: true, force: true });
