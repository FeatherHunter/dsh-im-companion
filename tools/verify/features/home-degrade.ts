// 绿框降级自验证（node --test）：宿主半为旧代码 / 自有桥 home.* 端点不可用时的降级与恢复。
// 钉住三件事：
//   ① 读表与落盘都失败 → 内存临时呈现（家=工作区、助理=有归属 bot），volatile=true、homesReady=true；
//   ② 宿主恢复（家表可读，或 home.seed 真落盘）→ volatile=false 且换成宿主真 id；
//   ③ 恢复重试落盘前先清掉内存临时行 → 一区一家，绝不翻倍（不出现同一工作区两家）。
// 渲染断言走真 panel-body 渲染路径（tools/verify/dom-shim.ts）：volatile 时 L1 顶部出「家表未落盘」（.hu-err），
// 且三级照常（4 个家名 + 三级 chip 面包屑 + 底部「新建家」）——不是空态；落盘后该提示消失。
// 手法照 tools/verify/features/home-steel.ts：tsc 转译到临时目录 + createRequire + node_modules junction。
// HDEG_REPO 只为变异自证（拿 src/ 的临时副本当仓库根跑同一份测试），正常跑无需设置。
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocument, El } from '../dom-shim.ts'

const REPO = process.env.HDEG_REPO || process.cwd()
const CLIENT = join(REPO, 'src', 'client')
const COMP = join(CLIENT, 'components')

const tmp = mkdtempSync(join(tmpdir(), 'hdeg-'))
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(COMP, 'panel-data.ts'), join(COMP, 'panel-body.ts'),
    '--ignoreConfig', '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' })
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message))
  process.exit(1)
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction') } catch { /* 已存在跳过 */ }

/* 被测模块在渲染路径里裸用 document/window（dom.ts / ui/*）：先铺 node 侧 DOM 桩再 require。 */
const doc: any = createDocument()
const win: any = {
  document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'x' },
}
doc.defaultView = win
for (const n of ['HTMLElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLStyleElement', 'Node', 'Element']) win[n] = El
;(globalThis as any).window = win
;(globalThis as any).document = doc
try { (globalThis as any).localStorage = win.localStorage } catch { /* read-only */ }

const req = createRequire(join(tmp, 'run.cjs'))
const panelData: any = req('./components/panel-data.js')
const panelBody: any = req('./components/panel-body.js')
const streamMod: any = req('./data/connection-stream.js')
const model: any = req('./data/home-model.js')

/* ---------- 夹具：4 个工作区（一区一家）＋ 2 个有归属 bot ＋ 1 个未归属 bot ---------- */
const KETING = 'D:\\agents\\keting'
const ALI = 'D:\\agents\\ali'
const SHUFANG = 'D:\\agents\\shufang'
const XIAO = 'D:\\agents\\xiaoshuai'
const WS = [
  { workspaceId: 'ws-1', path: KETING, title: '客厅' },
  { workspaceId: 'ws-2', path: ALI, title: '' },
  { workspaceId: 'ws-3', path: SHUFANG, title: '书房' },
  { workspaceId: 'ws-4', path: XIAO, title: 'default-workspace' },
]
const BOTS = [
  { channel: 'feishu', botId: 'b1', workspace: KETING, botName: '小帅' },
  { channel: 'qq', botId: 'q1', workspace: ALI, botName: '' },
  { channel: 'feishu', botId: 'b9', workspace: '', botName: '野' },
]
const HOME_NAMES = ['客厅', 'ali', '书房', '默认工作区']
const VOLATILE_COPY = '家表未落盘（宿主半尚未重载）：当前为临时呈现，重载插件后即持久化。'
/* 空态标记（T6a 绿框）：L1 无家时 .hu-empty 的标题是「还没有家」。
 * 注意「还没有助理」不能再当空态标记——绿框家行的副标（无助理的家）就是这句，恒在场。 */
const EMPTY_STATE_TITLE = '还没有家'
const np = (p: string) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()
const onePerPath = (homes: any[]) => new Set(homes.map((h) => np(h.path))).size === homes.length

/* ---------- 宿主 double：old＝旧半（自有桥端点全不可用）；seed-ok＝家表仍空但 home.seed 已可用；
 * list-ok＝家表已可读（宿主真行）。home.* 走自有桥 channel '/im-companion'，connection.status 供快照。 ---------- */
const HOST: any = { mode: 'old', homes: [], assistants: [], calls: [] }
let seq = 0
const ok = (value: any) => ({ ok: true, value })
const err = (code: string, message: string) => ({ ok: false, error: { code, message } })
const hostRows = () => ({ homes: HOST.homes.map((h: any) => ({ ...h })), assistants: HOST.assistants.map((a: any) => ({ ...a })) })
function hostCreateHome(input: any) {
  if (HOST.mode === 'old') return err('bad-request', '未知端点: home.create')
  if (HOST.homes.some((h: any) => np(h.path) === np(input.path))) return err('already-exists', '家已存在')
  const row: any = { id: 'host-h-' + (++seq), workspaceId: input.workspaceId ?? null, path: input.path, name: input.title || input.path, nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: seq, updatedAt: seq }
  HOST.homes.push(row)
  return ok({ home: row })
}
function hostCreateAssistant(input: any) {
  if (HOST.mode === 'old') return err('bad-request', '未知端点: assistant.create')
  if (!HOST.homes.some((h: any) => h.id === input.homeId)) return err('not-found', '家不存在')
  if (HOST.assistants.some((a: any) => a.channel === input.channel && a.botId === input.botId && a.status === 'bound')) return err('already-bound', '已绑定')
  const row: any = { id: 'host-a-' + (++seq), homeId: input.homeId, channel: input.channel, botId: input.botId, status: 'bound', name: input.botName || input.homeText || '未命名助理', nameSource: input.botName ? 'bot' : 'home', avatar: null, avatarSource: 'default', createdAt: seq, boundAt: seq }
  HOST.assistants.push(row)
  return ok({ assistant: row })
}
/** 宿主落盘（种子临时 homeId 经规范路径换成宿主真 id）。 */
function hostSeed(seedDoc: any) {
  const homes = seedDoc?.homes ?? []
  for (const h of homes) hostCreateHome({ workspaceId: h.workspaceId, path: h.path, title: h.name })
  for (const a of seedDoc?.assistants ?? []) {
    const t = homes.find((x: any) => x.id === a.homeId)
    const homeId = t ? HOST.homes.find((h: any) => np(h.path) === np(t.path))?.id : undefined
    if (homeId) hostCreateAssistant({ homeId, channel: a.channel, botId: a.botId, botName: a.nameSource === 'bot' ? a.name : '', homeText: a.nameSource === 'bot' ? '' : a.name })
  }
}
const rpc = async (channel: string, endpoint: string, payload: any) => {
  if (channel !== '/im-companion') {
    const ch = String(channel).replace(/^\//, '')
    const bots = BOTS.filter((b) => b.channel === ch).map((b) => ({ botId: b.botId, workspace: b.workspace, bot: { name: b.botName } }))
    return bots.length ? ok({ bots }) : err('not-configured', '渠道未配置')
  }
  HOST.calls.push(endpoint)
  if (endpoint === 'home.list') return HOST.mode === 'old' ? err('bad-request', '未知端点: home.list') : ok(hostRows())
  if (endpoint === 'home.seed') {
    if (HOST.mode === 'old') return err('bad-request', '未知端点: home.seed')
    hostSeed(payload)
    return ok(hostRows())
  }
  if (endpoint === 'home.create') return hostCreateHome(payload)
  if (endpoint === 'assistant.create') return hostCreateAssistant(payload)
  return err('bad-request', '未知端点: ' + endpoint)
}

function fresh(mode = 'old') {
  HOST.mode = mode; HOST.homes = []; HOST.assistants = []; HOST.calls = []
  return panelData.createPanelData(rpc)
}
/** 降级夹具：快照先进（三级有料的前提），再读家表（两个端点都不可用）。 */
async function degrade() {
  const data = fresh('old')
  await streamMod.getSharedStream(rpc).refresh()
  await data.loadHomes(() => WS)
  return data
}
/* 单份 connection-stream 自带 15s 轮询 interval：跑完必须 dispose，否则 node --test 进程不退出。 */
test.after(() => { try { streamMod.getSharedStream(rpc).dispose() } catch { /* 未建则忽略 */ } })

function renderBody(state: any): any {
  const bodyEl = new El('div', doc)
  panelBody.createPanelBody({
    state, bodyEl, titleMetaEl: new El('div', doc),
    seg: { el: new El('div', doc), setLabel: () => {} },
    relayout: () => {}, getWorkspaces: () => WS,
    ops: { createHome: async () => {}, createAssistant: async () => {}, connect: () => {} },
    onRetry: () => {},
  }).render()
  return bodyEl
}

test('降级①：自有桥家表/落盘都不可用 → 内存临时呈现，volatile 且三级有料（不塌成空态）', async () => {
  const data = await degrade()
  const s = data.state

  assert.equal(s.volatile, true, '降级标记必须立起来（L1 提示与写操作如实报错的前提）')
  assert.equal(s.homesReady, true, 'homesReady 必须为真，否则 body 渲染骨架而非三级')
  assert.deepEqual(s.homes.map((h: any) => h.path).sort(), WS.map((w) => w.path).sort(), '家=全部工作区')
  assert.equal(s.assistants.length, 2, '助理=有归属 bot 各一行（未归属 bot 不建行）')
  assert.deepEqual(s.assistants.map((a: any) => a.botId).sort(), ['b1', 'q1'])
  assert.ok(s.homes.every((h: any) => !String(h.id).startsWith('host-')), '此刻是内存临时行（宿主真 id 尚不存在）')
  assert.ok(HOST.calls.includes('home.list') && HOST.calls.includes('home.seed'), '确实撞过自有桥端点')
})

test('降级②渲染：volatile 时 L1 顶部出「家表未落盘」，4 个家名与三级链路条照常（不是空态）', async () => {
  const data = await degrade()
  const el = renderBody(data.state)
  const text = el.textContent

  const notice = el.querySelector('.hu-err')
  assert.ok(notice, 'volatile 提示行（绿框 .hu-err）必须存在')
  assert.ok(notice.textContent.includes(VOLATILE_COPY), '提示文案一字不动：' + notice.textContent)
  /* 呈现策略：0 助理的家折叠在尾部（降级态同样生效），展开后 4 个家名都要在。 */
  const fold = el.querySelector('.hu-more-row')
  assert.ok(fold && fold.textContent.includes('2 个空家'), '降级态也要有空家折叠行：' + text.slice(0, 120))
  fold.dispatchEvent({ type: 'click' })
  for (const name of HOME_NAMES) assert.ok(el.textContent.includes(name), '三级缺家名：' + name)
  /* T4 原型绿框：三级 chip 面包屑（.hu-crumb 的 .hu-lv 带层级）＋ 页头说明行 ＋ 底部主操作。 */
  const chips = el.querySelectorAll('.hu-crumb')
  assert.equal(chips.length, 3, '三级链路条必须在（.hu-crumb × 3）：' + text.slice(0, 200))
  assert.deepEqual(chips.map((c: any) => c.querySelector('.hu-lv').textContent), ['L1', 'L2', 'L3'], '链路条层级 L1→L3')
  assert.ok(text.includes('L1家') && text.includes('L3机器人'), '链路条文案必须在（层级+标签同 chip）')
  assert.ok(text.includes('每个家对应一个工作区'), '页头说明行必须在（原型原文，L1 常驻）')
  assert.ok(text.includes('新建家'), '底部主操作（L1「新建家」）必须在')
  assert.ok(text.includes('助理'), '家行副标题带助理计数')
  assert.ok(!el.querySelector('.hu-empty'), '不得是空态（提示归提示，三级不许塌）')
  assert.ok(!text.includes(EMPTY_STATE_TITLE), '不得是空态（' + EMPTY_STATE_TITLE + '）')
})

test('恢复③（家表可读）：volatile 摘掉、换宿主真 id、一区一家不翻倍', async () => {
  const data = await degrade()
  const tempIds = data.state.homes.map((h: any) => h.id)
  assert.equal(data.state.volatile, true, '前提：先降级')

  HOST.mode = 'list-ok'
  hostSeed(model.buildSeed(WS, BOTS, null, 2000))
  const hostIds = HOST.homes.map((h: any) => h.id)
  await data.loadHomes(() => WS)

  const s = data.state
  assert.equal(s.volatile, false, '宿主已能读表 ⇒ 降级标记必须清掉（否则提示永久挂着）')
  assert.deepEqual(s.homes.map((h: any) => h.id), hostIds, 'state 换成宿主真 id')
  assert.ok(s.homes.every((h: any) => !tempIds.includes(h.id)), '不留任何内存临时行')
  assert.equal(s.homes.length, 4, '一区一家：家数不翻倍')
  assert.ok(onePerPath(s.homes), '同一工作区不得出现两家')
  assert.equal(s.assistants.length, 2, '助理行同样不翻倍')
  assert.ok(!renderBody(s).textContent.includes('家表未落盘'), '恢复后 L1 提示消失')
})

test('恢复④（home.seed 真落盘）：重试前先清内存临时行 → 宿主真行、一区一家、不翻倍', async () => {
  const data = await degrade()
  assert.equal(data.state.volatile, true, '前提：先降级')
  const tempPaths = data.state.homes.map((h: any) => np(h.path))
  assert.equal(tempPaths.length, 4, '前提：降级时内存里有 4 行临时家')

  /* 宿主半已重载：home.list 仍回空表（homes.json 还没落盘），但 home.seed 这次真能写。 */
  HOST.mode = 'seed-ok'
  await data.loadHomes(() => WS)

  const s = data.state
  assert.ok(HOST.calls.includes('home.seed'), '确实走了落盘重试')
  assert.equal(HOST.homes.length, 4, '宿主侧落了 4 家（幂等键=规范路径）')
  assert.equal(s.volatile, false, '真落盘 ⇒ persisted ⇒ 摘掉降级标记')
  assert.equal(s.homes.length, 4, '4 家且不翻倍（清内存行再落盘）')
  assert.ok(onePerPath(s.homes), '同一工作区不得出现两家（清内存行前不得与宿主真行并存）')
  assert.deepEqual(s.homes.map((h: any) => np(h.path)).sort(), tempPaths.sort(), '覆盖同一批工作区')
  assert.ok(s.homes.every((h: any) => String(h.id).startsWith('host-h-')), '终态是宿主真 id')
  assert.equal(s.assistants.length, 2, '助理行不翻倍')
  assert.equal(HOST.assistants.length, 2, '宿主助理表也未被写脏')
  assert.ok(!renderBody(s).textContent.includes('家表未落盘'), '落盘后 L1 提示消失')
})

test('恢复⑤（家表可读、工作区名单暂空）：volatile 由读表路径自己清掉，不许靠落盘重试兜底', async () => {
  const data = await degrade()
  assert.equal(data.state.volatile, true, '前提：先降级')

  HOST.mode = 'list-ok'
  hostSeed(model.buildSeed(WS, BOTS, null, 3000))
  /* 这一轮工作区名单还没读到 ⇒ buildSeed 为空 ⇒ ensureSeeded 早早返回，不会顺手改 volatile；
   * 于是「提示永久挂着」只可能被读表分支自己的清理拦住（就是这条断言要钉的契约）。 */
  await data.loadHomes(() => [])

  const s = data.state
  assert.equal(s.volatile, false, '家表可读即摘标记（否则提示永久挂着、后续缺口种子也被堵死）')
  assert.equal(s.homes.length, 4, '宿主真行照常呈现（三级不塌）')
  assert.ok(onePerPath(s.homes), '一区一家')
  const el = renderBody(s)
  assert.ok(!el.textContent.includes('家表未落盘'), '恢复后提示必须消失')
  el.querySelector('.hu-more-row').dispatchEvent({ type: 'click' })
  for (const name of HOME_NAMES) assert.ok(el.textContent.includes(name), '缺家名：' + name)
})

console.log('features/home-degrade: ALL PASS')
