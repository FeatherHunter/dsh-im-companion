/** welcome-banner 样式出口（wb- 命名空间，installFeatureStyles 挂载）。
 * 注意：横幅渲染在对话树（.af-root 之外），--af-* 在此无定义，必须在 .wb-banner 根上
 * 重声明 TOKEN_BLOCK（B3 弹窗同款做法），否则全部 var(--af-*) 声明会被浏览器丢弃。
 * 天空渐变是装饰性天相（固定色），文字/按钮走 --af-* 主题别名，深色自动跟随。 */
import { TOKEN_BLOCK } from "../../client/theme";
export const WB_TOKENS = ".wb-banner{" + TOKEN_BLOCK + "}";
const SKY: string[] = [
".wb-banner { position: relative; width: 100%; align-self: stretch; flex-shrink: 0; box-sizing: border-box; max-width: var(--dsh-chat-content-width, 880px); min-height: min(66vh, 600px); margin: 5vh auto; padding: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; border: 1px solid var(--af-hairline-strong); border-radius: 20px; background: var(--af-bg); color: var(--af-primary); box-shadow: 0 12px 44px color-mix(in srgb, var(--af-accent) 14%, transparent); font-size: 14px; line-height: 1.6; }",
".wb-sky { position: relative; width: 100%; height: 420px; overflow: hidden; }",
".wb-sky-wee { background: linear-gradient(#070b1e 0%,#131a3d 52%,#3c2c50 78%,#a05a44 100%); }",
".wb-sky-dawn { background: linear-gradient(#3a4a7a 0%,#e8909c 60%,#ffd9a0 100%); }",
".wb-sky-day { background: linear-gradient(#7db9f0 0%,#cfe8fa 70%,#eef7ee 100%); }",
".wb-sky-dusk { background: linear-gradient(#2b2a5e 0%,#b4528b 60%,#ff9d5c 100%); }",
".wb-sky-night { background: linear-gradient(#060913 0%,#101a33 70%,#1b2a4a 100%); }",
".wb-sun { position: absolute; left: 50%; top: 120px; width: 110px; height: 110px; margin-left: -55px; border-radius: 50%; background: radial-gradient(circle at 50% 42%,#fff7cf 0%,#ffd21f 62%,#ffae00 100%); box-shadow: 0 0 30px 18px rgba(255,205,60,.85); animation: wb-sunpulse 5s ease-in-out infinite; }",
"@keyframes wb-sunpulse { 50% { box-shadow: 0 0 60px 22px rgba(255,205,60,.9); } }",
".wb-moon { position: absolute; left: 50%; top: 100px; width: 84px; height: 84px; margin-left: -42px; border-radius: 50%; background: radial-gradient(circle at 35% 35%,#f4f1de,#c9c5ae 70%); box-shadow: 0 0 40px 10px rgba(220,225,240,.35); }",
".wb-cloud { position: absolute; background: #ffffff; opacity: .85; border-radius: 999px; animation: wb-drift linear infinite; }",
".wb-cloud:before { content: \"\"; position: absolute; background: #ffffff; border-radius: 50%; }",
".wb-cloud:after { content: \"\"; position: absolute; background: #ffffff; border-radius: 50%; }",
".wb-c1 { width: 120px; height: 34px; top: 70px; animation-duration: 47s; }",
".wb-c1:before { width: 44px; height: 44px; top: -22px; left: 18px; }",
".wb-c1:after { width: 30px; height: 30px; top: -14px; left: 62px; }",
".wb-c2 { width: 90px; height: 26px; top: 150px; animation-duration: 68s; animation-delay: -30s; opacity: .7; }",
".wb-c2:before { width: 34px; height: 34px; top: -17px; left: 14px; }",
".wb-c2:after { width: 24px; height: 24px; top: -11px; left: 48px; }",
"@keyframes wb-drift { from { left: -160px; } to { left: 110%; } }",
".wb-star { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #ffffff; animation: wb-tw 2.8s ease-in-out infinite; }",
"@keyframes wb-tw { 50% { opacity: .15; } }",
".wb-horizon { position: absolute; left: 0; right: 0; bottom: 0; height: 130px; background: linear-gradient(transparent,rgba(255,150,80,.4)); pointer-events: none; }",
".wb-copy { position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box; padding: 26px; text-align: center; }",
".wb-title { font-size: 24px; font-weight: 800; color: #ffffff; text-shadow: 0 2px 14px rgba(0,0,0,.35); opacity: 0; transform: translateY(26px); animation: wb-rise .7s cubic-bezier(.2,.7,.2,1) forwards; }",
".wb-sub { font-size: 13px; color: #ffffff; opacity: 0; transform: translateY(26px); text-shadow: 0 1px 8px rgba(0,0,0,.35); margin-top: 4px; animation: wb-rise .7s cubic-bezier(.2,.7,.2,1) forwards; animation-delay: .12s; }",
".wb-cta { margin-top: 26px; text-align: center; opacity: 0; transform: translateY(26px); animation: wb-rise .7s cubic-bezier(.2,.7,.2,1) forwards; animation-delay: .24s; }",
"@keyframes wb-rise { to { opacity: 1; transform: none; } }",
".wb-enter { display: inline-block; border: 0; cursor: pointer; background: var(--af-accent); color: #ffffff; border-radius: 999px; padding: 12px 44px; font-size: 17px; font-weight: 800; font-family: inherit; box-shadow: 0 8px 26px rgba(0,0,0,.3); }",
".wb-enter-sub { display: block; font-size: 12px; font-weight: 400; opacity: .88; margin-top: 2px; }",
".wb-swaprow { text-align: center; padding: 12px; background: var(--af-bg); }",
".wb-swap { background: none; border: 0; color: var(--af-accent); cursor: pointer; font-size: 12px; font-family: inherit; }",
".wb-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: baseline; }",
".wb-online { background: var(--af-success); animation: wb-breathe 1.6s infinite; }",
".wb-warn { background: var(--af-warn); }",
".wb-offline { background: var(--af-danger); }",
".wb-unbound { background: var(--af-tertiary); }",
"@keyframes wb-breathe { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--af-success) 50%, transparent); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }",
"@media (prefers-reduced-motion: reduce) { .wb-sun { animation: none; } .wb-cloud { animation: none; } .wb-star { animation: none; } .wb-title { opacity: 1; transform: none; animation: none; } .wb-sub { opacity: 1; transform: none; animation: none; } .wb-cta { opacity: 1; transform: none; animation: none; } }",
];
export const CSS = WB_TOKENS + SKY.join("\n");
