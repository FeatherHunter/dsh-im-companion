// 五时辰预览台生成器（开发工具，只读源码生成静态 HTML，不碰产品代码）。
// 用法：node tools/preview/welcome-panels.ts
// 产物：.scratch/welcome-panels.html（双击即开；下方切换凌晨/清晨/白天/黄昏/深夜）。
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
const panels = segs.map((seg) => {
  const c = data.copyFor(seg, 0);
  const sub = "在线 · " + data.displaySub(c.s, 2, "小帅");
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
  return '<div class="pv-stage" id="pv-' + seg + '"><div class="wb-modal"><div class="wb-backdrop"></div>'
    + '<section class="wb-banner"><div class="wb-sky ' + c.sky + '">' + deco + horizon
    + '<div class="wb-grain"></div><div class="wb-vig"></div>'
    + '<div class="wb-copy"><div class="wb-title">' + esc(c.t) + '</div>'
    + '<div class="wb-sub"><span class="wb-dot wb-online"></span>' + esc(sub) + '</div></div>'
    + '<div class="wb-cta"><button class="wb-enter">' + esc(c.b) + '<small class="wb-enter-sub">' + esc(c.bs) + '</small></button></div>'
    + '</div></section></div></div>';
}).join("\n");
const tabs = segs.map((seg) => '<button data-seg="' + seg + '">' + esc(data.copyFor(seg, 0).tab) + '</button>').join("");
const css = String(styles.CSS ?? "");
const head = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' + '<meta name="viewport" content="width=device-width, initial-scale=1">' + '<title>欢迎页 · 五时辰预览台</title><style>' + css;
const chrome = "*{box-sizing:border-box}body{margin:0;background:#0b0e14;color:#e6edf3;font:14px/1.6 -apple-system,\"PingFang SC\",\"Noto Sans SC\",sans-serif}";
const bar = ".pv-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:6px;background:rgba(17,20,28,.92);border:1px solid #2a313b;border-radius:999px;padding:8px 10px;z-index:50;box-shadow:0 8px 30px rgba(0,0,0,.5)}";
const btn = ".pv-bar button{border:1px solid #2a313b;background:#1a2030;color:#e6edf3;border-radius:999px;padding:8px 18px;font:inherit;cursor:pointer}";
const on = ".pv-bar button.on{background:#1677ff;border-color:#1677ff;color:#ffffff}";
const note = ".pv-note{position:fixed;left:50%;top:14px;transform:translateX(-50%);font-size:12px;color:#8b949e;background:rgba(17,20,28,.85);padding:6px 14px;border-radius:999px;z-index:50;white-space:nowrap}";
const stage = ".pv-stage{position:relative;height:100vh;display:none}.pv-stage.on{display:block}.pv-stage .wb-modal{position:absolute}";
const jsShow = "function show(seg){for(var i=0;i<segs.length;i++){var s=segs[i];document.getElementById('pv-'+s).className='pv-stage'+(s===seg?' on':'');}var b=document.querySelectorAll('.pv-bar button');for(var j=0;j<b.length;j++){b[j].className=b[j].getAttribute('data-seg')===seg?'on':'';}}";
const jsWire = "(function(){var b=document.querySelectorAll('.pv-bar button');for(var j=0;j<b.length;j++){(function(x){x.addEventListener('click',function(){show(x.getAttribute('data-seg'));});})(b[j]);})();";
const jsAuto = "(function(){var h=new Date().getHours();show(h>=2&&h<5?'wee':h>=5&&h<9?'dawn':h>=9&&h<17?'day':h>=17&&h<20?'dusk':'night');})();";
const bodyHtml = '<div class="pv-note">五时辰预览台 · 下方切换 · mock 数据（小帅/在线）</div><div class="pv-bar">' + tabs + '</div>' + panels;
const full = head + chrome + bar + btn + on + note + stage + '</style></head><body>' + bodyHtml + '<script>var segs=' + JSON.stringify(segs) + ';' + jsShow + jsWire + jsAuto + '</scr' + 'ipt></body></html>';
const out = join(REPO, ".scratch", "welcome-panels.html");
writeFileSync(out, full, "utf8");
console.log("PANELS " + segs.join(",") + " -> " + out + " (" + full.length + " chars)");
rmSync(tmp, { recursive: true, force: true });
