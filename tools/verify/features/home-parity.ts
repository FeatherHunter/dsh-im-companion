// 绿框（T6a）**像素对拍**开发产物：把真面板渲染成候选页，喂与 T4 **认可款**原型
// `prototypes/home-assistant/proto-studio.html` 同一份种子数据，并生成原型的隔离目标页
// （只留 .frame：页头 + 面包屑 + 列表 + 底部主操作；去掉画布壳/搜索框/底部款式条）。
// 产出两页交给真 Chrome 截图 → vision_pixel_diff，用来逐像素核对「布局是否 100% 照原型」。
//   - 候选：src 现转译（同 home-create-flow 手法）→ DOM 桩 → React 挂**真面板** → 只序列化 .home-ui 子树，
//     颜色令牌覆盖成原型原值（布局对拍不受主题色干扰；产品里这些令牌挂 DSH 主题别名，深浅自动跟随）。
//   - 目标：proto-studio.html + 隔离 CSS。
// 跑法：node tools/verify/features/home-parity.ts（HP_OUT 可改输出目录）
// 这不是断言测试：不参与 npm run check 链，只产页；验收判据在像素 diff 报告 + 人工目验。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDocument, El } from '../dom-shim.ts'

const REPO = process.env.HP_REPO || process.cwd()
const OUT = process.env.HP_OUT || join(REPO, '.scratch', 'parity')
const CLIENT = join(REPO, 'src', 'client')
const HOST = join(REPO, 'src', 'host')
const TSC = join(REPO, 'node_modules', 'typescript', 'bin', 'tsc')
const FLAGS = ['--ignoreConfig', '--module', 'commonjs', '--target', 'es2023', '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false']
/** 面板内容宽：proto-studio 的 `.app{max-width:540px}` ⇒ 两侧都按 540 比。 */
const W = 540

function transpile(entries: string[], extra: string[] = []): string {
  const out = mkdtempSync(join(tmpdir(), 'hp-ts-'))
  execFileSync(process.execPath, [TSC, ...entries, '--outDir', out, ...FLAGS, ...extra], { stdio: 'pipe' })
  try { symlinkSync(join(REPO, 'node_modules'), join(out, 'node_modules'), 'junction') } catch { /* 已存在 */ }
  return out
}

/* ---------- DOM 桩（home-create-flow 同款） ---------- */
const doc: any = createDocument()
const win: any = {
  document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  cancelAnimationFrame: (h: any) => clearTimeout(h),
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'hp' },
  CustomEvent: class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail } },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
}
doc.defaultView = win
;(globalThis as any).window = win
;(globalThis as any).document = doc
;(globalThis as any).requestAnimationFrame = win.requestAnimationFrame
;(globalThis as any).cancelAnimationFrame = win.cancelAnimationFrame
try { (globalThis as any).navigator = win.navigator } catch { /* read-only 忽略 */ }
for (const n of ['HTMLElement', 'HTMLIFrameElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLOptionElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLStyleElement', 'HTMLLabelElement', 'HTMLTableElement', 'Node', 'Element']) win[n] = El

const tmpClient = transpile([join(CLIENT, 'components', 'panel.ts')])
const tmpHost = transpile([join(HOST, 'rpc.ts')], ['--types', 'node'])
const reqRepo = createRequire(join(REPO, 'package.json'))
const React: any = reqRepo('react')
const ReactDOMClient: any = reqRepo('react-dom/client')
const panelMod: any = createRequire(join(tmpClient, 'run.cjs'))('./components/panel.js')
const iconsMod: any = createRequire(join(tmpClient, 'run.cjs'))('./components/home-icons.js')
const streamMod: any = createRequire(join(tmpClient, 'run.cjs'))('./data/connection-stream.js')
const hostMod: any = createRequire(join(tmpHost, 'run.cjs'))('./rpc.js')
const storeMod: any = createRequire(join(tmpHost, 'run.cjs'))('./home-store.js')

/* ---------- 夹具：与 proto-studio seed() 同形（同 id、同名、同状态、同归属、同在线） ----------
 * 家表直接写宿主 homes.json（真宿主 loadHomesDoc 读它 ⇒ 渲染走的是产品同一套装载口径）。
 * 与原型的三处已知差异（写在报告里，不当布局差异）：
 *   ① 宿主 v2 要求 path 非空 ⇒ 暂存家给 `…\agents\暂存`（原型 path:null ⇒ 副标「默认名」，这里成「跟随目录名」）；
 *   ② 渠道 id 用本仓的 `weixin`（原型写 `wechat`），标签走 channelLabel 中文（原型直接印原始 id）；
 *   ③ 未实现钮 disabled（owner 裁定「先禁用」）⇒ 行内 ✎/⋯ 比原型淡。
 *   ④ 原型 seed 给 h2/a3 指定了头像序号（avatar:"3"/"2"），但 T6a 的宿主 cleanHome/cleanAssistant 固定
 *      `avatar:null`（头像存储归 T6b）⇒ 这两个 avatar 字段过不了宿主，两侧头像色相按名字哈希回落，
 *      与原型 seed 指定的色相不同（唯一残余色差）。字段先留着：T6b 落地后这份夹具自动变逐像素可比。 */
const AG = 'D:\\DeepSeekHarness\\agents'
const WS = [
  { workspaceId: 'ws-keting', path: AG + '\\keting', title: '客厅' },
  { workspaceId: 'ws-shufang', path: AG + '\\shufang', title: '书房' },
]
const BOTS = [
  { channel: 'feishu', botId: 'bot-fei', botName: '小帅', workspace: AG + '\\keting', online: true },
  { channel: 'feishu', botId: 'bot-free', botName: '待认领', workspace: '', online: true },
  { channel: 'weixin', botId: 'bot-wxa', botName: 'A号', workspace: AG + '\\shufang', online: true },
  { channel: 'weixin', botId: 'bot-wxb', botName: 'B号', workspace: AG + '\\shufang', online: false },
]
const HOMES = [
  { id: 'h1', workspaceId: 'ws-keting', path: AG + '\\keting', name: '客厅', nameSource: 'system' },
  { id: 'h2', workspaceId: 'ws-shufang', path: AG + '\\shufang', name: '书房基地', nameSource: 'user', avatar: '3' },
  { id: 'h-orphan', workspaceId: null, path: AG + '\\旧书房', name: '旧书房', nameSource: 'system', tombstone: { at: 1, reason: '工作区已删除' } },
  { id: 'h-stash', workspaceId: null, path: AG + '\\暂存', name: '暂存', nameSource: 'system' },
]
const ASSTS = [
  { id: 'a1', homeId: 'h1', channel: 'feishu', botId: 'bot-fei', status: 'bound', name: '小帅', nameSource: 'bot' },
  { id: 'a2', homeId: 'h1', channel: 'weixin', botId: null, status: 'unbound', name: '客厅', nameSource: 'home' },
  { id: 'a3', homeId: 'h2', channel: 'weixin', botId: 'bot-wxa', status: 'bound', name: 'A号', nameSource: 'bot', avatar: '2' },
  { id: 'a4', homeId: 'h2', channel: 'weixin', botId: 'bot-wxb', status: 'bound', name: 'B号', nameSource: 'bot' },
  { id: 'a5', homeId: 'h-orphan', channel: 'feishu', botId: null, status: 'orphan', name: '旧书房', nameSource: 'home' },
  { id: 'a6', homeId: 'h-stash', channel: 'feishu', botId: 'bot-free', status: 'bound', name: '待认领', nameSource: 'bot' },
]

const dshHome = mkdtempSync(join(tmpdir(), 'hp-dsh-'))
const homesFile = storeMod.homesFileFor(dshHome)
mkdirSync(dirname(homesFile), { recursive: true })
writeFileSync(homesFile, JSON.stringify({
  version: 2,
  homes: HOMES.map((h) => ({ ...h, avatar: null, avatarSource: 'default', createdAt: 1, updatedAt: 1 })),
  assistants: ASSTS.map((a) => ({ ...a, avatar: null, avatarSource: 'default', createdAt: 1, boundAt: 1 })),
}), 'utf8')

const handler = hostMod.createAgentFleetHandler({ snapshot: () => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }) }, { dshHome })
const okV = (value: any) => ({ ok: true, value })
const bridge = async (endpoint: string, payload: any) => handler(endpoint, payload, AbortSignal.timeout(8000))
const channelCall = (channel: string, method: string) => {
  if (method !== 'connection.status') return { ok: false, error: { code: 'bad-request', message: '未知端点: ' + method } }
  const list = BOTS.filter((b) => b.channel === channel)
  return okV({
    bots: list.map((b) => ({
      botId: b.botId, workspace: b.workspace, connected: b.online,
      health: { status: b.online ? 'healthy' : 'offline', summary: b.online ? '长连接运行正常' : '尚未连接', lastCheckedAt: 1 },
      bot: { name: b.botName },
    })),
    totals: { configured: list.length, connected: list.filter((b) => b.online).length },
  })
}
const call = async (ch: string, ep: string, payload: any) => {
  if (ch === '/api') {
    if (ep === 'im-companion') return bridge(String(payload?.method ?? ''), payload?.payload ?? {})
    if (ep.startsWith('dsh-im/')) return channelCall(ep.slice(7), String(payload?.method ?? ''))
    throw Object.assign(new Error('RPC_NO_ROUTE ' + ep), { code: 'RPC_NO_ROUTE' })
  }
  if (ch === '/im-companion') return bridge(ep, payload ?? {})
  if (ch.startsWith('/')) return channelCall(ch.slice(1), ep)
  throw Object.assign(new Error('RPC_NO_ROUTE ' + ch), { code: 'RPC_NO_ROUTE' })
}
const ctx = {
  logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  effect(fn: any) { const d = fn(); if (typeof d === 'function') d() },
  get(name: string) { return name === 'workspaces' ? { list: { getSnapshot: () => ({ items: WS }) } } : undefined },
  slots: { inject: (_n: string, fn: any) => fn(), register: (_o: any, Comp: any) => Comp },
  connection: { rpc: { call } },
  uiWorkspace: { pickDirectory: async () => null },
  emit() {},
}

const container = doc.createElement('div')
const root = ReactDOMClient.createRoot(container)
root.render(React.createElement(() => {
  const ref = React.useRef(null)
  React.useEffect(() => {
    const el = panelMod.FleetPanel(ctx)
    const mountEl = ref.current as any
    mountEl.replaceChildren()
    mountEl.appendChild(el)
    return () => { try { el?.__afDispose?.() } catch { /* noop */ } }
  }, [])
  return React.createElement('div', { ref })
}))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function all(n: any, out: any[] = []): any[] {
  for (const c of n?.childNodes ?? []) if (c.nodeType === 1) { out.push(c); all(c, out) }
  return out
}

for (let i = 0; i < 200; i++) {
  await sleep(25)
  if (all(container).some((e) => e.classList.contains('home-ui') && all(e).some((x) => x.classList.contains('hu-row')))) break
}
/* 对齐原型 L1 默认态：原型 `selHome='h1'`（首行 .on）+ focusId 空 ⇒ 面包屑 L2/L3 显示
 * 「助理 · 客厅 / 机器人 · 小帅」。真面板 L1 初始没有选中项 ⇒ 这里走真交互：
 * 点首行进 L2 → 点返回键回 L1（selHome 保持）→ 再 pointerover 首行补焦点态。 */
const firstHome = all(container).find((e) => e.classList.contains('hu-row') && e.attributes?.get?.('data-open') === 'L2')
if (!firstHome) throw new Error('没渲染出家行（对拍夹具没挂上）')
firstHome.dispatchEvent({ type: 'click' })
await sleep(80)
const back = all(container).find((e) => e.classList.contains('hu-back'))
if (!back) throw new Error('L2 没渲染出返回键（对拍夹具钻取失败）')
back.dispatchEvent({ type: 'click' })
await sleep(80)
const row1 = all(container).find((e) => e.classList.contains('hu-row') && e.attributes?.get?.('data-open') === 'L2')
if (!row1) throw new Error('返回 L1 后没渲染出家行')
row1.dispatchEvent({ type: 'pointerover' })
await sleep(80)

/* ---------- 序列化（dom-shim 的 innerHTML 只是桩，必须自己走树；自有图标按表补回子路径） ---------- */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const VOID = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK'])
const ICON_PATHS: Record<string, string> = iconsMod.HU_ICON_PATHS ?? {}
const ser = (n: any): string => {
  if (!n) return ''
  if (n.nodeType === 3) return esc(String(n.textContent ?? ''))
  const name = String(n.nodeName || n.tagName || '').toLowerCase()
  if (!name) return ''
  let attrs = ''
  for (const [k, v] of (n.attributes ?? new Map<string, string>())) {
    if (String(k).toLowerCase() === 'class') continue
    attrs += ' ' + k + '="' + esc(String(v)) + '"'
  }
  const cls = n.classList && typeof n.classList.toString === 'function' ? String(n.classList.toString()).trim() : ''
  if (cls) attrs = ' class="' + esc(cls) + '"' + attrs
  const tagUp = String(n.nodeName || '').toUpperCase()
  if ((tagUp === 'INPUT' || tagUp === 'TEXTAREA' || tagUp === 'SELECT') && n._value) attrs += ' value="' + esc(String(n._value)) + '"'
  /* dom-shim 的 `el.style.cssText = …` 落到 `_style['css-text']`：必须原样吐出，
   * 否则内联样式（头像底色/强调色）会被写成非法的 `css-text:…` ⇒ 候选页丢色。 */
  const raw = n._style && (n._style['css-text'] ?? n._style.cssText)
  const css = raw
    ? ' style="' + esc(String(raw)) + '"'
    : n._style && Object.keys(n._style).length
      ? ' style="' + esc(Object.entries(n._style).map(([k, v]) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + String(v)).join(';')) + '"'
      : ''
  const iconName = n.attributes?.get?.('data-hu-icon')
  const kids = iconName && ICON_PATHS[iconName] ? ICON_PATHS[iconName] : (n.childNodes ?? []).map(ser).join('')
  if (VOID.has(name.toUpperCase())) return '<' + name + attrs + css + '>'
  return '<' + name + attrs + css + '>' + kids + '</' + name + '>'
}
const homeUi = all(container).find((e) => e.classList.contains('home-ui'))
if (!homeUi) throw new Error('没找到 .home-ui（绿框根没渲染出来）')
const injected = ((doc as any).head?.childNodes ?? [])
  .map((n: any) => String(n?.textContent ?? '')).filter((s: string) => s.trim()).join('\n')

/* 颜色令牌覆盖成原型原值：像素对拍只该暴露**布局**差异（产品里这些令牌挂 DSH 主题别名，深浅自动跟随）。 */
const PARITY_TOKENS = `
.home-ui{
  --hu-panel:#fff; --hu-panel-2:#F7F8FA; --hu-panel-3:#EFF1F5;
  --hu-ink:#101828; --hu-ink-2:#475467; --hu-ink-3:#98A2B3;
  --hu-line:rgba(16,24,40,.10); --hu-line-soft:rgba(16,24,40,.06);
  --hu-accent:#0D9488; --hu-accent-deep:#0F766E; --hu-accent-soft:rgba(13,148,136,.11);
  --hu-warn:#92400E; --hu-warn-soft:rgba(146,64,14,.11);
  --hu-bad:#B42318; --hu-bad-soft:rgba(180,35,24,.10);
  --hu-neutral:rgba(71,84,103,.10);
  width:${W}px; background:#fff;
}
.home-ui .hu-fbody{max-height:none;overflow:visible}
body{margin:0;padding:0;background:#fff;font:13px/1.5 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;-webkit-font-smoothing:antialiased}`
/* 深色变体：只换颜色令牌（DSH 暗色主题的量级），布局/CSS 与候选页完全同一份 ⇒ 用来目验「深色下是否成立」。 */
const DARK_TOKENS = `
.home-ui{
  --hu-panel:#1C1C1E; --hu-panel-2:#2C2C2E; --hu-panel-3:#3A3A3C;
  --hu-ink:#F2F2F7; --hu-ink-2:#AEAEB2; --hu-ink-3:#8E8E93;
  --hu-line:rgba(255,255,255,.20); --hu-line-soft:rgba(255,255,255,.10);
  --hu-accent:#0A84FF; --hu-accent-deep:#64D2FF; --hu-accent-soft:rgba(10,132,255,.20);
  --hu-warn:#FFD60A; --hu-warn-soft:rgba(255,214,10,.16);
  --hu-bad:#FF453A; --hu-bad-soft:rgba(255,69,58,.18);
  --hu-neutral:rgba(174,174,178,.16);
  width:${W}px; background:#1C1C1E;
}
.home-ui .hu-fbody{max-height:none;overflow:visible}
body{margin:0;padding:0;background:#1C1C1E;font:13px/1.5 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;-webkit-font-smoothing:antialiased}`

mkdirSync(OUT, { recursive: true })
const domHtml = ser(homeUi)
const cand = join(OUT, 'candidate.html')
writeFileSync(cand, '<!doctype html><meta charset="utf-8"><title>候选 · 绿框（真面板）</title>\n'
  + '<style>' + injected + '</style>\n<style>' + PARITY_TOKENS + '</style>\n' + domHtml + '\n', 'utf8')
const candDark = join(OUT, 'candidate-dark.html')
writeFileSync(candDark, '<!doctype html><meta charset="utf-8"><title>候选 · 绿框（真面板 · 深色令牌）</title>\n'
  + '<style>' + injected + '</style>\n<style>' + DARK_TOKENS + '</style>\n' + domHtml + '\n', 'utf8')

/* ---------- 目标页：proto-studio + 隔离 CSS（只留 .frame：页头/面包屑/列表/底部主操作） ---------- */
const protoSrc = readFileSync(join(REPO, 'prototypes', 'home-assistant', 'proto-studio.html'), 'utf8')
const ISO = `<style>
body{padding:0!important;margin:0!important;background:#fff!important}
.app{max-width:${W}px!important;margin:0!important;gap:0!important}
.app > *:not(.frame){display:none!important}
.dock{display:none!important}
#toastHost,#popHost,#modalHost{display:none!important}
.frame{border:0!important;border-radius:0!important;box-shadow:none!important;height:auto!important;overflow:visible!important}
.frame .fsearch{display:none!important}
</style>`
const target = join(OUT, 'target.html')
writeFileSync(target, protoSrc.replace('</head>', ISO + '\n</head>'), 'utf8')

console.log('CANDIDATE ' + cand)
console.log('DARK      ' + candDark)
console.log('TARGET    ' + target)
console.log('（两页都按视口宽 ' + W + ' 截图：vision_html_screenshot fullPage:true → vision_pixel_diff）')
try { streamMod.getSharedStream(null).dispose() } catch { /* 未建忽略 */ }
try { streamMod.resetSharedStream() } catch { /* 忽略 */ }
process.exit(0)
