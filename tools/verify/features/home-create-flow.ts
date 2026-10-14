// 票 #113 验收①②**点击级**端到端（node --test）：UI 点击 → 宿主真写入 → 刷新后列表可见。
//   ① 建家：L1 底部「新建家」→ 锚定弹层里点选尚无家的已有区 → 「创建」→ home.create 带对 workspaceId →
//      宿主 homes.json 真多一行 → 落到新家 L2，返回 L1 出现该家名（点的是哪个区就是哪个区，不是别的区）。
//   ② 建助理：点家行钻进 L2 → 底部「新建助理」→ 弹层里点选未绑定机器人 → 「创建」→ 先 bot.workspace.set
//      再 assistant.create(homeId=宿主**真 id**) → 宿主 assistants 多一行 → 返回 L2 出现该助理。
//   ③ 点击级幂等：重进建单再提交同一个（陈旧弹层 / 另一窗口抢先）→ 第二次被 already-exists /
//      already-bound 吞掉，家/助理行数都不翻倍。
//   ④ 严格一对一：已被别的助理绑走的机器人不进候选（候选集合精确断言）。
// DOM 口径＝T4 认可款原型（prototypes/home-assistant/proto-studio.html，owner 裁定 2026-10-13，绿框树已整体退役）：
//   根 .home-ui；行 .hu-row[data-open][data-id]（点行＝钻取进下一级，L1 家行 aria-label「家 <名>」、
//   L2 助理行「助理 <名>」）；底部主操作 .hu-pbtn 文案随层（L1「新建家」/L2「新建助理」）；页头 .hu-back 返回。
//   创建走**锚定 popover**（挂 body portal：.home-ui.hu-pophost → .hu-scrim + .hu-pop → .hu-ppo → .hu-opts 内
//   .hu-opt[data-value][aria-selected]，底部 .hu-pfoot 内「取消」/「创建」）——弹层不在 panelEl 子树里，
//   故弹层取件一律扫 doc.body（popNode/popBoxes/clickOpt/clickPop 这一组），行与主操作才扫 panelEl。
// 手法：面板链（src/client/components/panel.ts）与宿主桥链（src/host/rpc.ts）都用仓库自带的 tsgo
//   从 src 现转译到临时目录 → DOM 桩 + ReactDOMClient.createRoot 渲染**真面板**（render-client 的环境手法）；
//   ctx.connection.rpc.call 扮宿主双传输通道（/api + dsh-im/<ch>），home.* 端点直接落 src/host 的真代码
//   （真写临时目录里的 homes.json）——所以断言里的「宿主表」是磁盘上的真文件，不是内存 double。
//   home-degrade 同款收尾：共享 connection-stream 自带 15s interval，跑完 test.after dispose 掉，进程有界退出。
// 为什么不是 load 打好的 lib/client.js：lib 是构建产物，lib 与 src 之间差一次 build——变异自证要求
//   「改 src 的临时副本 ⇒ 这份测试必须变红」，而改 src 不重建 lib 时 bundle 一字不变（验收②会变成假绿）；
//   转译路径同时让 stream.dispose() 可达（bundle 内模块不可 require），有界退出才做得成。
// HCF_REPO 只为变异自证（拿 src 的临时副本当仓库根跑同一份测试），正常跑无需设置。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, El } from '../dom-shim.ts'

const REPO = process.env.HCF_REPO || process.cwd()
const CLIENT = join(REPO, 'src', 'client')
const HOST = join(REPO, 'src', 'host')
const TSC = join(REPO, 'node_modules', 'typescript', 'bin', 'tsc')
/* rootDir 钉死 src：T9 起客户端链会牵到 src/log-events.ts，不钉时产物层级随 import 图漂。 */
const FLAGS = ['--ignoreConfig', '--rootDir', join(REPO, 'src'), '--module', 'commonjs', '--target', 'es2023', '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false']

function transpile(entries: string[], extra: string[] = []): string {
  const out = mkdtempSync(join(tmpdir(), 'hcf-ts-'))
  try {
    execFileSync(process.execPath, [TSC, ...entries, '--outDir', out, ...FLAGS, ...extra], { stdio: 'pipe' })
  } catch (e) {
    console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message))
    process.exit(1)
  }
  try { symlinkSync(join(REPO, 'node_modules'), join(out, 'node_modules'), 'junction') } catch { /* 已存在 */ }
  return out
}
const tmpClient = transpile([join(CLIENT, 'components', 'panel.ts')])
const tmpHost = transpile([join(HOST, 'rpc.ts')], ['--types', 'node'])

/* 被测模块在渲染路径里裸用 document/window（dom.ts / ui/*）与 requestAnimationFrame（toast）：
 * 先铺 node 侧 DOM 桩再 require 任何模块（require React 也要在桩之后）。 */
const doc: any = createDocument()
const win: any = {
  document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  cancelAnimationFrame: (h: any) => clearTimeout(h),
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'hcf' },
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
/* react-dom 会做 `x instanceof win.HTMLIFrameElement` 之类的判定（getActiveElementDeep），
 * 缺一个都崩在 commit 阶段 —— 类名表照 render-client 那份，只加了 option/Node/Element。 */
for (const n of ['HTMLElement', 'HTMLIFrameElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLOptionElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLStyleElement', 'HTMLLabelElement', 'HTMLTableElement', 'Node', 'Element']) win[n] = El

const reqRepo = createRequire(join(REPO, 'package.json'))
const React: any = reqRepo('react')
const ReactDOMClient: any = reqRepo('react-dom/client')
const reqClient = createRequire(join(tmpClient, 'run.cjs'))
const reqHost = createRequire(join(tmpHost, 'run.cjs'))
const panelMod: any = reqClient('./client/components/panel.js')
const popMod: any = reqClient('./client/components/home-pop.js')
const streamMod: any = reqClient('./client/data/connection-stream.js')
const hostMod: any = reqHost('./host/rpc.js')
const storeMod: any = reqHost('./host/home-store.js')

/* ---------- 夹具：DSH 5 个工作区（3 家有家、2 家空闲）＋ 5 个机器人（3 已绑、2 未绑） ---------- */
const KETING = 'D:\\agents\\keting'
const ALI = 'D:\\agents\\ali'
const SHUFANG = 'D:\\agents\\shufang'
const GARAGE = 'D:\\agents\\garage'
const EMPTY = 'D:\\agents\\empty'
const WS = [
  { workspaceId: 'ws-1', path: KETING, title: '客厅' },
  { workspaceId: 'ws-2', path: ALI, title: '' },
  { workspaceId: 'ws-3', path: SHUFANG, title: '书房' },
  { workspaceId: 'ws-4', path: GARAGE, title: '车库' },
  { workspaceId: 'ws-5', path: EMPTY, title: '空房间' },
]
/* 未绑的两枚是「刚连上、还没归属」的机器人（workspace 空），正合 home-model.freeBots 的
 * 「workspace 为空的未绑定机同样可认领」，也是种子路径明确跳过的形状（seedGap/buildSeed 见空 workspace 即 continue）
 * ——于是它们能稳定停在候选位等建单认领（落在有家的区会被首轮缺口种子直接绑走）。 */
const BOTS = [
  { channel: 'feishu', botId: 'bot_aaaa', workspace: KETING, botName: '小帅' },
  { channel: 'weixin', botId: 'wx_1111', workspace: ALI, botName: '微信助手' },
  { channel: 'qq', botId: 'q_2222', workspace: SHUFANG, botName: 'Q仔' },
  { channel: 'feishu', botId: 'bot_dddd', workspace: '', botName: '小空' },
  { channel: 'weixin', botId: 'bot_eeee', workspace: '', botName: '小企' },
]
const BOUND = [['bot_aaaa', 'feishu', '小帅'], ['wx_1111', 'weixin', '微信助手'], ['q_2222', 'qq', 'Q仔']] as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/* T12 #129：配置文件已改 YAML（`storeMod.homesFileFor` 给的就是 homes.yaml）⇒ 读盘换 YAML 解析。
 * 注入注释块是注释行，YAML 解析器天然忽略；此处若仍拿 JSON.parse 硬啃，夹具会红在解析而非产品行为上。 */
const yamlMod: any = reqRepo('yaml')
const readDoc = (file: string) => yamlMod.parse(readFileSync(file, 'utf8'))

function all(root: any): any[] {
  const out: any[] = []
  const walk = (n: any): void => { for (const c of n?.childNodes ?? []) if (c.nodeType === 1) { out.push(c); walk(c) } }
  walk(root)
  return out
}
const hasCls = (e: any, c: string): boolean => !!e && typeof e.classList?.contains === 'function' && e.classList.contains(c)

/* 绿框行（T4 原型 DOM）：L1 家行 data-open="L2" + aria-label「家 <名>」，L2 助理行 data-open="L3" +「助理 <名>」。
 * 用行自述的 aria-label 而不是文本匹配来分家/助理（文本里「助理」到处都是），rowsOf 沿用「L1 家行」语义。 */
const rowsIn = (root: any): any[] => all(root).filter((e) => hasCls(e, 'hu-row'))
const attr = (e: any, k: string): string => String(e?.getAttribute?.(k) ?? '')
const homesOf = (root: any): any[] => rowsIn(root).filter((e) => attr(e, 'data-open') === 'L2' && attr(e, 'aria-label').startsWith('家 '))
const asstsOf = (root: any): any[] => rowsIn(root).filter((e) => attr(e, 'data-open') === 'L3' && attr(e, 'aria-label').startsWith('助理 '))
const rowsOf = homesOf

/* 锚定弹层是 body portal（.home-ui.hu-pophost 挂 document.body），不在 panelEl 子树里 —— 只能扫 doc.body。 */
const popNode = (): any => all(doc.body).find((e) => hasCls(e, 'hu-pop')) ?? null
const popText = (): string => String(popNode()?.textContent ?? '')
const popTitle = (): string => attr(popNode(), 'aria-label')
const popBoxes = (): any[] => { const p = popNode(); return p ? all(p).filter((e) => hasCls(e, 'hu-opts')) : [] }
const boxOpts = (box: any): any[] => all(box).filter((e) => hasCls(e, 'hu-opt'))
const boxValues = (box: any): string[] => boxOpts(box).map((o) => attr(o, 'data-value'))
const boxLabels = (box: any): string[] => boxOpts(box).map((o) => String(o.textContent))

/* 点击一律走 dispatchEvent({type:'click'})（render-client.ts:145-157 同款；行/按钮都是 addEventListener 监听）。
 * 弹层里的「点选」＝点那颗 .hu-opt（选项内部状态由点击处理器改写，不再有 <select> 的 value 可以硬设）。 */
function click(el: any): void { el.dispatchEvent({ type: 'click' }) }
function clickOpt(box: any, value: string): any {
  const o = boxOpts(box).find((x) => attr(x, 'data-value') === value)
  assert.ok(o, '弹层里找不到 data-value「' + value + '」的候选\n当前候选：' + JSON.stringify(boxValues(box)))
  click(o)
  return o
}
function clickPop(label: string): any {
  const p = popNode()
  assert.ok(p, '弹层没开，「' + label + '」无处可点')
  const b = all(p).find((x) => x.tagName === 'BUTTON' && String(x.textContent).trim() === label)
  assert.ok(b, '弹层里找不到按钮「' + label + '」\n当前弹层文本：' + popText().slice(0, 300))
  click(b)
  return b
}
function clickRow(root: any, text: string): any {
  const r = rowsIn(root).find((x) => String(x.textContent).includes(text))
  assert.ok(r, '找不到行「' + text + '」\n当前文本：' + String(root.textContent).slice(0, 500))
  click(r)
  return r
}
/* 底部主操作（原型 footEl）：文案随层（L1「新建家」/L2「新建助理」）是原型契约的一部分，顺手钉住。 */
function clickPrimary(root: any, label: string): any {
  const b = all(root).find((x) => x.tagName === 'BUTTON' && hasCls(x, 'hu-pbtn'))
  assert.ok(b, '找不到底部主操作 .hu-pbtn\n当前文本：' + String(root.textContent).slice(0, 500))
  assert.equal(String(b.textContent).trim(), label, '底部主操作文案随层（原型：L1 新建家 / L2 新建助理）')
  click(b)
  return b
}
/* 页头返回键（.hu-back，L2/L3 才有）：钻取回上一级。 */
function clickBack(root: any): void {
  const b = all(root).find((x) => x.tagName === 'BUTTON' && hasCls(x, 'hu-back'))
  assert.ok(b, '找不到返回键 .hu-back\n当前文本：' + String(root.textContent).slice(0, 500))
  click(b)
}
/* 页头标题（.hu-ttl 里的 b）：当前处在哪一层的唯一真相（L1 家 / L2 家名 / L3 助理名）。 */
function headTitle(root: any): string {
  const t = root.querySelector('.hu-ttl')
  if (!t) return ''
  const b = all(t).find((x: any) => x.tagName === 'B')
  return String(b?.textContent ?? t.textContent ?? '')
}
async function waitFor(what: string, cond: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now()
  for (;;) {
    let hit = false
    try { hit = cond() } catch { hit = false }
    if (hit) return
    if (Date.now() - t0 > ms) throw new Error('WAIT-TIMEOUT: ' + what + '\n当前可见文本：' + textOf())
    await sleep(10)
  }
}
let textOf = (): string => '(面板未挂载)'
function disposeShared(): void {
  try { streamMod.getSharedStream(null).dispose() } catch { /* 未建忽略 */ }
  try { streamMod.resetSharedStream() } catch { /* 忽略 */ }
}

/* ---------- 每 test 一套新夹具：新 homes.json ＋ 新桥 handler ＋ 新 stream ＋ 新 React 根 ---------- */
/* T8 #121 收尾：pickCancel＝原生选择器被用户取消（返回 null）；createFails＝DSH 建工作区失败（明文回错）。 */
async function boot({ freeWs = false, pickCancel = false, createFails = false }: { freeWs?: boolean; pickCancel?: boolean; createFails?: boolean } = {}) {
  const dshHome = mkdtempSync(join(tmpdir(), 'hcf-dsh-'))
  const homesFile = storeMod.homesFileFor(dshHome)
  /* 只有建家测试才暴露「尚无家」的空闲区：建助理点击成功后会瞬时触发一次缺口种子 sweep
   * （那一刻 state.assistants 还没含新行，seedGap 判真），sweep 会给所有未建家的工作区补家、
   * 给有家未绑的机器人补助理 —— 那些 test 用「3 区全有家」的夹具把 sweep 变成空操作。 */
  const wsList = WS.slice(0, freeWs ? WS.length : 3)
  const workspaces = wsList.map((w) => ({ ...w }))
  const bots = BOTS.map((b) => ({ ...b }))
  const calls: any[] = []
  /* 种子三家 + 三个已绑助理：全部经**真 host-store**落盘（夹具与产品同一条写路径）。 */
  for (const w of wsList.slice(0, 3)) await storeMod.createHomeRow(homesFile, { workspaceId: w.workspaceId, path: w.path, title: w.title })
  const seeded = await storeMod.loadHomesDoc(homesFile)
  for (const [botId, channel, name] of BOUND) {
    const home = seeded.homes.find((h) => h.workspaceId === (channel === 'feishu' ? 'ws-1' : channel === 'weixin' ? 'ws-2' : 'ws-3'))
    const r = await storeMod.createAssistantRow(homesFile, { homeId: home.id, channel, botId, botName: name })
    assert.ok(r.ok, '夹具助理落盘失败：' + botId)
  }

  const handler = hostMod.createAgentFleetHandler(
    { snapshot: () => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }) }, { dshHome },
  )
  const okV = (value: any) => ({ ok: true, value })
  const errV = (code: string, message: string) => ({ ok: false, error: { code, message } })
  const bridge = async (endpoint: string, payload: any) => {
    const reply = await handler(endpoint, payload, AbortSignal.timeout(8000))
    calls.push({ channel: 'bridge', endpoint, payload, reply })
    return reply
  }
  /* 渠道侧绑定（dsh-im 的 bot.workspace.set）：只改夹具快照，重试语义归 home-ops.bindBot。 */
  const bindWorkspace = (channel: string, botId: string, workspace: string) => {
    const b = bots.find((x) => x.channel === channel && x.botId === botId)
    if (!b) return errV('workspace-bot-not-found', '机器人不存在')
    b.workspace = String(workspace ?? '')
    return okV({ botId: b.botId, workspace: b.workspace })
  }
  const channelCall = (channel: string, method: string, payload: any) => {
    if (method === 'connection.status') {
      const list = bots.filter((b) => b.channel === channel)
      return okV({
        bots: list.map((b) => ({
          botId: b.botId, workspace: b.workspace, connected: true,
          health: { status: 'healthy', summary: '长连接运行正常', lastCheckedAt: 1 }, bot: { name: b.botName },
        })),
        totals: { configured: list.length, connected: list.length },
      })
    }
    if (method === 'bot.workspace.set') {
      const rec: any = { channel, endpoint: method, payload, reply: null }
      calls.push(rec)
      return (rec.reply = bindWorkspace(channel, String(payload?.botId ?? ''), String(payload?.workspace ?? '')))
    }
    return errV('bad-request', '未知端点: ' + method)
  }
  /* 扮宿主双传输：新载体 /api + dsh-im/<ch>（chain 内部先试这条）；旧形态直通；未知路由抛错（可回退）。 */
  const call = async (ch: string, ep: string, payload: any) => {
    if (ch === '/api') {
      if (ep === 'im-companion') return bridge(String(payload?.method ?? ''), payload?.payload ?? {})
      if (ep.startsWith('dsh-im/')) return channelCall(ep.slice(7), String(payload?.method ?? ''), payload?.payload ?? {})
      throw Object.assign(new Error('RPC_NO_ROUTE ' + ep), { code: 'RPC_NO_ROUTE' })
    }
    if (ch === '/im-companion') return bridge(ep, payload ?? {})
    if (ch.startsWith('/')) return channelCall(ch.slice(1), ep, payload ?? {})
    throw Object.assign(new Error('RPC_NO_ROUTE ' + ch), { code: 'RPC_NO_ROUTE' })
  }
  /* 「另一窗口」＝直接打宿主半（不经面板的 rpc 通道，也不进 calls）：制造「弹层已渲染、宿主已变」的
   * 陈旧表单场景（③ 幂等：陈旧弹层 / 另一窗口抢先）。calls 只记面板自己说过的话，两边互不污染。 */
  const elsewhere = {
    createHome: (payload: Record<string, unknown>) => handler('home.create', payload, AbortSignal.timeout(8000)),
    createAssistant: (payload: Record<string, unknown>) => handler('assistant.create', payload, AbortSignal.timeout(8000)),
    bind: (channel: string, botId: string, workspace: string) => bindWorkspace(channel, botId, workspace),
  }
  /* T10 #124（owner 2026-10-15 裁定）：建家＝「选目录 → DSH 建工作区 → 家永久绑定」，没有复用支路。
   * 夹具给 workspaces 一个真能 create 的假服务（adoptDirectory 走产品真实现），原生选择器给一个还没建区的目录。 */
  const NEWDIR = 'D:\\agents\\brandnew'
  const ctx = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
    effect(fn: any) { const d = fn(); if (typeof d === 'function') d() },
    get(name: string) {
      if (name !== 'workspaces') return undefined
      return {
        list: {
          getSnapshot: () => ({ items: workspaces }),
          create: async (input: { path: string }) => {
            const path = String(input?.path ?? '')
            if (createFails) return { ok: false, error: { code: 'directory-not-found', message: '目录不存在' } }
            const hit = workspaces.find((w: any) => w.path === path)
            if (hit) return { ok: true, value: { workspace: hit, created: false } }
            const row = { workspaceId: 'ws-9', path, title: '新房间' }
            workspaces.push(row)
            return { ok: true, value: { workspace: row, created: true } }
          },
        },
      }
    },
    slots: { inject: (_n: string, fn: any) => fn(), register: (_o: any, Comp: any) => Comp },
    connection: { rpc: { call } },
    uiWorkspace: { pickDirectory: async () => (pickCancel ? null : NEWDIR) },
    emit() {},
  }

  /* 弹层宿主是 home-pop 的模块级单例：跨 test 续跑（node --test 同进程顺序跑）时先清掉上一场的残层。 */
  try { popMod.closeHomePop(true) } catch { /* 未建忽略 */ }

  /* 与 index.ts 的 FleetSettingsTab 同款装配：React 根 + effect 里挂命令式真面板，卸载走 __afDispose。 */
  let panelEl: any = null
  const Host = () => {
    const ref = React.useRef(null)
    React.useEffect(() => {
      panelEl = panelMod.FleetPanel(ctx)
      const mountEl = ref.current as any
      mountEl.replaceChildren()
      mountEl.appendChild(panelEl)
      return () => { try { panelEl?.__afDispose?.() } catch { /* noop */ } }
    }, [])
    return React.createElement('div', { ref, style: { background: 'transparent' } })
  }
  const container = doc.createElement('div')
  const root = ReactDOMClient.createRoot(container)
  root.render(React.createElement(Host))
  const panel = (): any => { assert.ok(panelEl, '面板尚未挂载'); return panelEl }
  textOf = () => String(panelEl?.textContent ?? '(未挂载)') + '｜弹层：' + (popNode() ? popText() : '（无）')
  await waitFor('L1 首屏（绿框家行 .hu-row[data-open=L2]）', () => !!panelEl && homesOf(panelEl).length > 0)

  const homeIdOf = (workspaceId: string): string => {
    const row = readDoc(homesFile).homes.find((h: any) => h.workspaceId === workspaceId)
    assert.ok(row, '夹具里没有 ' + workspaceId + ' 的家')
    return row.id
  }
  return {
    panel, calls, homesFile, homeIdOf, ctx, elsewhere,
    text: () => String(panelEl?.textContent ?? ''),
    async dispose() {
      try { root.unmount() } catch { /* noop */ }
      await sleep(0)
      disposeShared()
    },
  }
}
test.after(() => disposeShared())

/* ---------- ① 建家点击级（T10 #124：选目录 → DSH 建工作区 → 落家） ---------- */
test('①建家点击级：L1 底部「新建家」→ 选目录（DSH 建区＋等投影）→「创建」 → rpc 带 canonical 区、宿主多一行、L1 出现新家名', async () => {
  const b = await boot()
  try {
    assert.deepEqual(readDoc(b.homesFile).homes.map((h: any) => h.workspaceId), ['ws-1', 'ws-2', 'ws-3'], '前提：3 家有家')
    assert.equal(rowsOf(b.panel()).length, 3, 'L1 先有 3 个家行')

    clickPrimary(b.panel(), '新建家')
    await waitFor('建家弹层出现', () => popTitle() === '新建家')
    assert.ok(popText().includes('选中的目录会建成 DSH 工作区'), '唯一支路＝选目录（T10 #124 分段退场）：' + popText().slice(0, 200))
    assert.equal(popBoxes().length, 0, '建家弹层不再有候选列表（「用已有工作区」整段退场）')
    const okBtn = all(popNode()).find((x: any) => x.tagName === 'BUTTON' && String(x.textContent).trim() === '创建')
    assert.ok(okBtn?.hasAttribute('disabled'), '未选目录时「创建」显式禁用（不许点了没反应）')

    clickPop('选择目录')
    await waitFor('路径回填', () => popText().includes('brandnew'))
    assert.equal(all(doc.body).filter((e) => hasCls(e, 'af-dirbar')).length, 0, '原生选择器在场 ⇒ 不开内置浏览（原生优先，T8 #121 验收②）')

    clickPop('创建')
    /* 先钉 rpc：写请求必须带 DSH 回的 canonical 区（夹具假 workspaces.create 回 ws-9）。 */
    await waitFor('home.create 到达宿主', () => b.calls.filter((c) => c.endpoint === 'home.create').length === 1)
    const creates = b.calls.filter((c) => c.endpoint === 'home.create')
    assert.deepEqual(creates[0].payload, { workspaceId: 'ws-9', path: 'D:\\agents\\brandnew', title: '新房间' }, 'rpc 带 DSH 回的 canonical 区')
    assert.equal((creates[0].reply as any).ok, true)
    await waitFor('创建后弹层收掉（落家 → 刷新 → 进新家）', () => !popNode())

    const disk = readDoc(b.homesFile)
    assert.equal(disk.homes.length, 4, '宿主表多出 1 行（3→4）')
    const row = disk.homes.find((h: any) => h.workspaceId === 'ws-9')
    assert.ok(row && row.path === 'D:\\agents\\brandnew' && row.name === '新房间', '新行是新建的那个区：' + JSON.stringify(row))
    assert.equal(disk.homes.filter((h: any) => h.workspaceId === 'ws-9').length, 1, '同区只许一家')

    /* 建完即落到新家的 L2（原型钻取：建家 → 进新家），再返回 L1 看列表。 */
    await waitFor('落到新家 L2', () => headTitle(b.panel()).includes('新房间'))
    assert.equal(rowsOf(b.panel()).length, 0, 'L2 不该有家行')
    clickBack(b.panel())
    await waitFor('回到 L1（家行 3→4、新家名可见）', () => rowsOf(b.panel()).length === 4 && b.text().includes('新房间'))
    assert.ok(rowsOf(b.panel()).some((r) => String(r.textContent).includes('新房间')), '新家出现在列表里')
    assert.equal(b.calls.filter((c) => c.endpoint === 'home.create').length, 1, '一次点击一次 home.create')
  } finally { await b.dispose() }
})

/* ---------- ② 建助理点击级 ---------- */
test('②建助理点击级：点家钻进 L2→「新建助理」→弹层点选未绑机器人→「创建」 → 先绑工作区再落家真 id、宿主多一行、L2 出现', async () => {
  const b = await boot()
  try {
    const ketingId = b.homeIdOf('ws-1')
    assert.ok(b.text().includes('客厅'), 'L1 先有客厅这家')
    clickRow(b.panel(), '客厅') /* 原型：点行＝钻取进下一级 */
    await waitFor('钻进客厅 L2', () => asstsOf(b.panel()).length === 1)
    assert.ok(b.text().includes('小帅'), '客厅下先有 1 个助理（小帅）')

    clickPrimary(b.panel(), '新建助理')
    await waitFor('建助理弹层出现', () => popTitle() === '新建助理')
    assert.equal(popBoxes().length, 2, '弹层两组候选：属于哪个家 / 绑定机器人')
    const [homeBox, botBox] = popBoxes()
    const ketingOpt = boxOpts(homeBox).find((o: any) => attr(o, 'data-value') === ketingId)
    assert.ok(ketingOpt, '「属于哪个家」里必须有当前钻取的家\n当前候选：' + JSON.stringify(boxValues(homeBox)))
    assert.equal(attr(ketingOpt, 'aria-selected'), 'true', '建单必须挂当前选中的家（客厅）')
    assert.deepEqual(boxValues(botBox), ['', 'bot_dddd', 'bot_eeee'], '候选=未绑定的两枚（外加禁用的「以后再绑」占位）')
    assert.ok(!boxOpts(botBox)[0].hasAttribute('disabled'), '「以后再绑」T6b #114 已启用（未绑定占位，不再禁用）')
    assert.ok(boxLabels(botBox)[1].includes('飞书') && boxLabels(botBox)[2].includes('微信'), '候选项带渠道标注：' + JSON.stringify(boxLabels(botBox)))
    const picked = clickOpt(botBox, 'bot_dddd') /* 点选 bot_dddd */
    assert.equal(attr(picked, 'aria-selected'), 'true', '点选即选中')

    clickPop('创建')

    /* 先钉两条 rpc：先绑工作区、再落 assistant.create（带宿主真 homeId —— 传临时 id 必炸）。 */
    await waitFor('assistant.create 到达宿主', () => b.calls.some((c) => c.endpoint === 'assistant.create'))
    const bind = b.calls.find((c) => c.endpoint === 'bot.workspace.set')
    assert.ok(bind, '必须先把机器人绑到这家的工作区')
    assert.deepEqual(bind.payload, { botId: 'bot_dddd', workspace: KETING }, '绑的是这个家的工作区')
    assert.equal((bind.reply as any).ok, true)
    assert.ok(b.calls.indexOf(bind) < b.calls.findIndex((c) => c.endpoint === 'assistant.create'), '顺序：先 bot.workspace.set 再 assistant.create')

    const ac = b.calls.find((c) => c.endpoint === 'assistant.create')
    assert.ok(ac, '必须落助理表')
    assert.deepEqual(
      { homeId: ac.payload.homeId, channel: ac.payload.channel, botId: ac.payload.botId },
      { homeId: ketingId, channel: 'feishu', botId: 'bot_dddd' },
      'assistant.create 必须带宿主真 homeId（种子临时 id 会 not-found）',
    )
    assert.equal((ac.reply as any).ok, true)
    assert.ok(!popNode(), '创建后弹层必须收掉')

    /* 建完即落到新助理的 L3 详情（原型钻取：建助理 → 进详情），再返回 L2 看行。 */
    await waitFor('落到新助理 L3（小空）', () => headTitle(b.panel()).includes('小空'))
    clickBack(b.panel())
    await waitFor('回到 L2（助理行 1→2）', () => asstsOf(b.panel()).length === 2)

    const disk = readDoc(b.homesFile)
    assert.equal(disk.assistants.length, 4, '宿主助理表多出 1 行（3→4）')
    /* 顺序契约（Lead 修 home-ops）：createAssistantFlow 必须**先 reloadHomes 再 refresh**。
     * 倒过来时快照回调拿着旧 state.assistants 判缺口 ⇒ 把刚绑上的这枚误判成「有 workspace 有家却没 bound 行」
     * ⇒ 触发一次 home.seed 全集 sweep（探针实测序列 …assistant.create, meta.get, home.list, home.seed），
     * 而 sweep 会给**尚无家的工作区**顺手建家，无谓缩小「新建家」候选池。故此处钉死：点击级全程不得出现 home.seed。 */
    assert.ok(b.calls.every((c) => c.endpoint !== 'home.seed'), '绑定后不得触发 home.seed 全集 sweep（先 reloadHomes 再 refresh）')
    assert.equal(disk.homes.length, 3, '建助理点击不得动家表')
    const row = disk.assistants.find((a: any) => a.botId === 'bot_dddd')
    assert.ok(row && row.homeId === ketingId && row.status === 'bound' && row.channel === 'feishu', '落在当前家身上：' + JSON.stringify(row))
    assert.ok(!disk.assistants.some((a: any) => a.botId === 'bot_dddd' && a.homeId !== ketingId), '没落到别的家')

    assert.equal(asstsOf(b.panel()).length, 2, '刷新后 L2 助理行 1→2（一对一不合并）')
    assert.ok(asstsOf(b.panel()).some((r) => String(r.textContent).includes('小空') && String(r.textContent).includes('飞书')), '新助理出现在 L2')
  } finally { await b.dispose() }
})

/* ---------- ③ 点击级幂等（T10 #124：同一目录重提不落第二行） ---------- */
test('③点击级幂等：同一目录重提 → DSH 侧复用（created:false）＋客户端查表拒绝，行数不翻倍', async () => {
  /* 阶段 A：家（选同一目录两次：第一次新建并落家，第二次复用但已有家 ⇒ 明文拒绝、不再写） */
  const a = await boot()
  try {
    clickPrimary(a.panel(), '新建家')
    await waitFor('建家弹层', () => popTitle() === '新建家')
    clickPop('选择目录')
    await waitFor('路径回填', () => popText().includes('brandnew'))
    clickPop('创建')
    await waitFor('新家落盘（宿主 3→4）', () => readDoc(a.homesFile).homes.length === 4)
    assert.equal(a.calls.filter((c) => c.endpoint === 'home.create').length, 1)
    await waitFor('落到新家 L2', () => headTitle(a.panel()).includes('新房间'))
    clickBack(a.panel())
    await waitFor('回到 L1（家行 3→4）', () => rowsOf(a.panel()).length === 4 && a.text().includes('新房间'))

    /* 重进建单、选同一个目录：DSH 侧 created:false ⇒ 复用；客户端查表发现该区已有家 ⇒ 直接带用户进那家（不写第二行）。 */
    clickPrimary(a.panel(), '新建家')
    await waitFor('重进建单', () => popTitle() === '新建家')
    clickPop('选择目录')
    await waitFor('路径回填', () => popText().includes('brandnew'))
    clickPop('创建')
    await waitFor('回到已有家（L2 新房间）', () => headTitle(a.panel()).includes('新房间'))
    assert.ok(!popNode(), '已有家时弹层收掉（目标已达成，不是报错停在弹层里）')
    assert.equal(a.calls.filter((c) => c.endpoint === 'home.create').length, 1, '第二次没再写家（客户端一道守卫）')
    const disk = readDoc(a.homesFile)
    assert.equal(disk.homes.length, 4, '宿主家表不翻倍（3 种子 + 新建的那个区）')
    assert.equal(disk.homes.filter((h: any) => h.workspaceId === 'ws-9').length, 1, '同区只许一家')
    assert.ok(a.calls.every((c) => c.endpoint !== 'home.seed'), '全程不该走种子路径（否则翻倍是种子干的）')
  } finally { await a.dispose() }

  /* 阶段 B：助理（重进建单确认客户端守卫 → 陈旧弹层重提同一个机器人） */
  const b = await boot()
  try {
    const ketingId = b.homeIdOf('ws-1')
    clickRow(b.panel(), '客厅')
    await waitFor('钻进客厅 L2', () => asstsOf(b.panel()).length === 1)

    clickPrimary(b.panel(), '新建助理')
    await waitFor('建助理弹层', () => popTitle() === '新建助理')
    clickOpt(popBoxes()[1], 'bot_dddd')
    clickPop('创建')
    await waitFor('新助理落盘（宿主 3→4）', () => readDoc(b.homesFile).assistants.length === 4)
    assert.equal(b.calls.filter((c) => c.endpoint === 'assistant.create').length, 1)
    await waitFor('落到新助理 L3（小空）', () => headTitle(b.panel()).includes('小空'))
    clickBack(b.panel())
    await waitFor('回到 L2（助理行 1→2）', () => asstsOf(b.panel()).length === 2)

    clickPrimary(b.panel(), '新建助理')
    await waitFor('重进建单', () => popTitle() === '新建助理')
    assert.ok(!boxValues(popBoxes()[1]).includes('bot_dddd'), '已绑的机器人不再进候选（客户端一道守卫）')
    assert.deepEqual(boxValues(popBoxes()[1]), ['', 'bot_eeee'], '候选恰余未绑的 bot_eeee（外加禁用占位）')

    /* 陈旧弹层：另一窗口先把 bot_eeee 绑走 + 落表（真宿主写，不进 calls）。 */
    const beforeA = readDoc(b.homesFile).assistants.length
    assert.equal((b.elsewhere.bind('weixin', 'bot_eeee', KETING) as any).ok, true, '另一窗口先绑走 bot_eeee')
    const won = await b.elsewhere.createAssistant({ homeId: ketingId, channel: 'weixin', botId: 'bot_eeee', botName: '小企', homeText: '' })
    assert.equal((won as any).ok, true, '另一窗口先落表')
    assert.equal(readDoc(b.homesFile).assistants.length, beforeA + 1)

    /* 重提同一个机器人（弹层里 picked 仍是 bot_eeee）→ 宿主必须拒。 */
    clickPop('创建')
    await waitFor('第二次 assistant.create 被答复', () => b.calls.filter((c) => c.endpoint === 'assistant.create').length === 2)
    const second = b.calls.filter((c) => c.endpoint === 'assistant.create')[1]
    assert.equal(second.payload.botId, 'bot_eeee', '重提的还是那枚机器人')
    assert.equal((second.reply as any).ok, false, '第二次必须被宿主拒')
    assert.equal((second.reply as any).error.code, 'already-bound', '拒码=already-bound（严格一对一）')
    const disk = readDoc(b.homesFile)
    assert.equal(disk.assistants.length, beforeA + 1, '重提没往宿主助理表里多写一行（不翻倍）')
    assert.equal(disk.assistants.filter((x: any) => x.botId === 'bot_eeee').length, 1, '同一机器人只有一行')
    clickBack(b.panel())
    await waitFor('回到 L2（助理行不翻倍）', () => asstsOf(b.panel()).length === 2)
    assert.ok(b.calls.every((c) => c.endpoint !== 'home.seed'), '全程不该走种子路径（否则翻倍是种子干的）')
  } finally { await b.dispose() }
})

/* ---------- ④ 一对一候选 ---------- */
test('④一对一：已被绑走的机器人不进新建助理候选（候选集合精确断言）', async () => {
  const b = await boot()
  try {
    assert.equal(readDoc(b.homesFile).assistants.length, 3, '前提：3 枚已绑')
    clickRow(b.panel(), '客厅')
    await waitFor('钻进客厅 L2', () => asstsOf(b.panel()).length === 1)
    clickPrimary(b.panel(), '新建助理')
    await waitFor('建助理弹层', () => popTitle() === '新建助理')
    const botBox = popBoxes()[1]
    const values = boxValues(botBox)
    const labels = boxLabels(botBox)

    assert.deepEqual(values, ['', 'bot_dddd', 'bot_eeee'], '候选集合恰为「以后再绑」占位（T6b #114 已启用）+ 未绑定的两枚')
    for (const gone of ['bot_aaaa', 'wx_1111', 'q_2222']) {
      assert.ok(!values.some((v) => v.includes(gone)), gone + ' 已被绑走，不得出现在候选：' + JSON.stringify(values))
    }
    for (const name of ['小帅', '微信助手', 'Q仔']) {
      assert.ok(!labels.some((l) => l.includes(name)), name + '（已绑）不得出现在候选标签：' + JSON.stringify(labels))
    }
    /* 已绑的这几枚分属三个不同的家：跨家一对一也一律排除（不是只排本家）。 */
    assert.deepEqual(readDoc(b.homesFile).assistants.map((x: any) => x.botId).sort(), ['bot_aaaa', 'q_2222', 'wx_1111'])
    assert.equal(b.calls.filter((c) => c.endpoint === 'assistant.create').length, 0, '只看不写')
    assert.equal(readDoc(b.homesFile).assistants.length, 3, '宿主助理表未被动过')
  } finally { await b.dispose() }
})

/* ---------- ⑤ 选目录：原生优先 + 取消静默（T8 #121 验收②） ---------- */
test('⑤选目录点击级：有原生选择器就不开内置浏览；用户取消 ⇒ 静默（不报错、不发请求、弹层照旧）', async () => {
  const b = await boot({ pickCancel: true })
  try {
    clickPrimary(b.panel(), '新建家')
    await waitFor('建家弹层出现', () => popTitle() === '新建家')
    assert.equal(all(doc.body).filter((e) => hasCls(e, 'af-dirbar')).length, 0, '原生选择器在场 ⇒ 不开内置浏览（原生优先）');
    const before = b.calls.length
    clickPop('选择目录')
    await sleep(30)
    assert.ok(popNode(), '取消后弹层不关（选目录是用户的自由动作）');
    assert.equal(all(popNode()).filter((e) => hasCls(e, 'hu-err')).length, 0, '取消不报错、不留灰字');
    const okBtn = all(popNode()).find((x: any) => x.tagName === 'BUTTON' && String(x.textContent).trim() === '创建')
    assert.ok(okBtn?.hasAttribute('disabled'), '取消后「创建」仍显式禁用（没选到目录）');
    assert.equal(b.calls.length, before, '取消一个请求都不发');
    assert.equal(readDoc(b.homesFile).homes.length, 3, '取消不动家表');
  } finally { await b.dispose() }
})

/* ---------- ⑥ 建区失败：弹层不关、灰字原文、可重试、一行没写（T8 #121 验收⑤） ---------- */
test('⑥建区失败点击级：DSH 建工作区失败 ⇒ 弹层不关、灰字原文留在弹层、按钮可重试、一行没写', async () => {
  const b = await boot({ freeWs: true, createFails: true })
  try {
    const before = readDoc(b.homesFile).homes.length
    clickPrimary(b.panel(), '新建家')
    await waitFor('建家弹层出现', () => popTitle() === '新建家')
    clickPop('选择目录')
    await waitFor('路径回填', () => popText().includes('brandnew'))
    clickPop('创建')
    await waitFor('灰字原文出现', () => all(popNode() ?? doc.body).some((e) => hasCls(e, 'hu-err')))
    assert.ok(popNode(), '失败时弹层不关（就地可重试）');
    const err = all(popNode()).find((e) => hasCls(e, 'hu-err'))
    assert.match(String(err.textContent), /建工作区失败/, '灰字原文＝DSH 的失败原因：' + String(err.textContent))
    assert.match(String(err.textContent), /目录不存在/, '原文带底层 message（不吞细节）')
    const okBtn = all(popNode()).find((x: any) => x.tagName === 'BUTTON' && String(x.textContent).trim() === '创建')
    assert.ok(!okBtn?.hasAttribute('disabled'), '失败后「创建」恢复可点（可重试）')
    assert.equal(readDoc(b.homesFile).homes.length, before, '一行没写（失败不脏）')
    assert.equal(b.calls.filter((c) => c.endpoint === 'home.create').length, 0, 'home.create 从未发出（连尝试都没有）')
  } finally { await b.dispose() }
})

console.log('features/home-create-flow: ALL PASS')
