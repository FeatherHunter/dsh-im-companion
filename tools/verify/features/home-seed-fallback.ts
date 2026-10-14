// T6a 钢线客户端「种子落盘」兼容回落自验证（node --test）。
// 只测外部行为：给定 rpc 信封与宿主 double → 端点调用序列、返回的宿主侧行、assistant.create 入参分流。
// 背景：自有桥 home.seed 是新端点；宿主半只在插件重载时更新（客户端 Ctrl+F5 不换宿主），
// 旧宿主没有它 → 必须回落到「逐行 home.create（吞 already-exists）→ home.list 取宿主真 id
// → 逐行 assistant.create（吞 already-bound）→ home.list」，且回落同样幂等。
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO = process.cwd()
const CLIENT = join(REPO, 'src', 'client')
const ENTRIES = [
  join(CLIENT, 'components', 'home-ops.ts'),
  join(CLIENT, 'data', 'home-model.ts'),
]

// —— 仓库自带 tsc 转译到临时目录（照 home-steel.ts 手法：--ignoreConfig 免读 tsconfig，junction 借 node_modules） ——
const tmp = mkdtempSync(join(tmpdir(), 'home-seed-fallback-'))
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...ENTRIES,
    '--ignoreConfig',
    '--rootDir', join(REPO, 'src'),
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' })
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message))
  process.exit(1)
}
try {
  symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction')
} catch { /* 已存在跳过 */ }
const req = createRequire(join(tmp, 'run.cjs'))
/* rootDir 已钉死 src ⇒ 产物在 client/ 下（T9 起 data 链牵到 src/log-events.ts，不钉就会随 import 图漂）。 */
const ops: any = req('./client/components/home-ops.js')
const model: any = req('./client/data/home-model.js')

// —— 夹具：两个工作区（一区一家）＋各一已归属机器人（一 bot 一助理） ——
const BRIDGE = '/im-companion'
const KETING = 'D:\\agents\\keting'
const ALI = 'D:\\agents\\ali'
const WS = [
  { workspaceId: 'ws-1', path: KETING, title: '客厅' },
  { workspaceId: 'ws-2', path: ALI, title: '阿梨窝' },
]
const BOTS = [
  { channel: 'feishu', botId: 'b1', workspace: KETING, botName: '小帅' },
  { channel: 'qq', botId: 'q1', workspace: ALI, botName: '' },
]

/** 独立规范路径（不借被测模块的 normPath：两边用同一坏规则会互相掩盖）。 */
const np = (p: string) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase()

/** 宿主 double：内存表 + 真判重语义（建家按规范路径 already-exists；建助理按 channel+botId already-bound）。
 * seedMode：live＝有 home.seed 端点（批量落盘＋id 回填）；canned＝固定回包；unsupported＝旧宿主（bad-request）。 */
function makeHost(o: { seedMode?: 'live' | 'canned' | 'unsupported'; canned?: any; homes?: any[]; assistants?: any[] } = {}) {
  const seedMode = o.seedMode ?? 'live'
  const calls: any[] = []
  const store = { homes: [...(o.homes ?? [])], assistants: [...(o.assistants ?? [])] }
  let seq = 0
  const ok = (value: any) => ({ ok: true, value })
  const err = (code: string, message: string) => ({ ok: false, error: { code, message } })
  const idOfPath = (path: string) => store.homes.find((h) => np(h.path) === np(path))?.id

  const createHomeRow = (input: any) => {
    if (store.homes.some((h) => np(h.path) === np(input.path))) return err('already-exists', '家已存在：' + input.path)
    const row = {
      id: 'host-h-' + (++seq), workspaceId: input.workspaceId ?? null, path: input.path,
      name: input.title || input.path, nameSource: 'system',
      avatar: null, avatarSource: 'default', createdAt: seq, updatedAt: seq,
    }
    store.homes.push(row)
    return ok({ home: row })
  }
  const createAssistantRow = (input: any) => {
    if (!store.homes.some((h) => h.id === input.homeId)) return err('not-found', '家不存在：' + input.homeId)
    const bound = store.assistants.find((a) => a.channel === input.channel && a.botId === input.botId && a.status === 'bound')
    if (bound) return err('already-bound', '机器人已绑定：' + input.channel + '/' + input.botId)
    const row = {
      id: 'host-a-' + (++seq), homeId: input.homeId, channel: input.channel, botId: input.botId,
      status: 'bound', name: input.botName || input.homeText || '未命名助理',
      nameSource: input.botName ? 'bot' : 'home',
      avatar: null, avatarSource: 'default', createdAt: seq, boundAt: seq,
    }
    store.assistants.push(row)
    return ok({ assistant: row })
  }
  /** 批量落盘（home.seed 的宿主实现口径：判重可重跑；种子临时 homeId 经规范路径换成宿主真 id）。 */
  const seedLive = (doc: any) => {
    const docHomes = doc?.homes ?? []
    for (const h of docHomes) createHomeRow({ workspaceId: h.workspaceId, path: h.path, title: h.name })
    for (const a of doc?.assistants ?? []) {
      const temp = docHomes.find((h: any) => h.id === a.homeId)
      const homeId = temp ? idOfPath(temp.path) : undefined
      if (homeId) {
        createAssistantRow({
          homeId, channel: a.channel, botId: a.botId,
          botName: a.nameSource === 'bot' ? a.name : '', homeText: a.nameSource === 'bot' ? '' : a.name,
        })
      }
    }
  }
  const rpc = async (channel: string, endpoint: string, payload: any, _signal: AbortSignal) => {
    let reply: any
    if (endpoint === 'home.seed') {
      if (seedMode === 'unsupported') reply = err('bad-request', '未知端点: home.seed')
      else if (seedMode === 'canned') reply = ok(o.canned)
      else { seedLive(payload); reply = ok({ homes: [...store.homes], assistants: [...store.assistants] }) }
    } else if (endpoint === 'home.create') {
      reply = createHomeRow(payload)
    } else if (endpoint === 'assistant.create') {
      reply = createAssistantRow(payload)
    } else if (endpoint === 'home.list') {
      reply = ok({ homes: [...store.homes], assistants: [...store.assistants] })
    } else {
      reply = err('bad-request', '未知端点: ' + endpoint)
    }
    calls.push({ channel, endpoint, payload, reply })
    return reply
  }
  return {
    rpc, calls, store,
    prime: (doc: any) => seedLive(doc),
    snapshot: () => ({ homes: store.homes.map((h) => ({ ...h })), assistants: store.assistants.map((a) => ({ ...a })) }),
    payloadsOf: (endpoint: string) => calls.filter((c) => c.endpoint === endpoint).map((c) => c.payload),
  }
}

const seedOnce = () => model.buildSeed(WS, BOTS, null, 1000)

test('快路径：home.seed 可用即一次到位，返回该回包内容且不碰逐行端点', async () => {
  const canned = {
    homes: [{ id: 'host-h-9', path: KETING, name: '客厅' }, { id: 'host-h-10', path: ALI, name: '阿梨窝' }],
    assistants: [{ id: 'host-a-9', homeId: 'host-h-9', channel: 'feishu', botId: 'b1' }],
  }
  const host = makeHost({ seedMode: 'canned', canned })
  const seed = seedOnce()
  const res = await ops.seedHomes(host.rpc, seed)

  assert.deepEqual(res, canned, '原样返回 home.seed 的 value')
  assert.deepEqual(host.calls.map((c) => c.endpoint), ['home.seed'], '只调 home.seed')
  assert.equal(host.calls[0].channel, BRIDGE, '走自有桥 channel')
  assert.equal(host.calls[0].payload.homes.length, seed.homes.length, '种子的家整批交宿主')
  assert.equal(host.calls[0].payload.assistants.length, seed.assistants.length, '种子的助理整批交宿主')
  assert.ok(!host.calls.some((c) => c.endpoint === 'home.create'), '不得出现 home.create')
  assert.ok(!host.calls.some((c) => c.endpoint === 'assistant.create'), '不得出现 assistant.create')
})

test('回落路径：旧宿主无 home.seed → 建家→list 取真 id→建助理→list，端点序与入参分流正确', async () => {
  const seed = seedOnce()
  const host = makeHost({ seedMode: 'unsupported' })
  assert.equal(host.store.homes.length, 0, '回落前宿主是空表（行只在 home.create 之后才有）')

  const res = await ops.seedHomes(host.rpc, seed)

  assert.deepEqual(
    host.calls.map((c) => c.endpoint),
    ['home.seed', 'home.create', 'home.create', 'home.list', 'assistant.create', 'assistant.create', 'home.list'],
    '端点序：seed 失败 → 逐行建家 → list → 逐行建助理 → list',
  )
  assert.ok(host.calls.every((c) => c.channel === BRIDGE), '全程走自有桥 channel')

  // 返回宿主侧行：id 来自宿主（不是种子里的客户端临时 id）
  assert.equal(res.homes.length, seed.homes.length)
  assert.equal(res.assistants.length, seed.assistants.length)
  assert.deepEqual(res.homes.map((h) => h.id), host.store.homes.map((h) => h.id), '返回宿主真行')
  assert.ok(res.homes.every((h) => !seed.homes.some((s) => s.id === h.id)), '家 id 非种子临时 id')
  assert.ok(res.assistants.every((a) => !seed.assistants.some((s) => s.id === a.id)), '助理 id 非种子临时 id')

  // assistant.create 的 homeId 必须是宿主真 id（种子临时 id 宿主不认识）
  const creates = host.payloadsOf('assistant.create')
  const feishu = creates.find((p) => p.channel === 'feishu')
  const qq = creates.find((p) => p.channel === 'qq')
  assert.ok(feishu && qq, '两个已归属机器人都发了 assistant.create')
  const hostIdOf = (p: string) => host.store.homes.find((h) => np(h.path) === np(p)).id
  const tempIdOf = (p: string) => seed.homes.find((h) => np(h.path) === np(p)).id
  assert.equal(feishu.homeId, hostIdOf(KETING), 'homeId 是宿主真 id')
  assert.notEqual(feishu.homeId, tempIdOf(KETING), 'homeId 不是种子临时 id')
  assert.equal(qq.homeId, hostIdOf(ALI), 'homeId 是宿主真 id')
  assert.equal(feishu.botId, 'b1')
  assert.equal(qq.botId, 'q1')

  // botName / homeText 按 nameSource 分流：bot→botName，否则 homeText
  assert.equal(seed.assistants.find((a) => a.channel === 'feishu').nameSource, 'bot', '夹具前提')
  assert.equal(seed.assistants.find((a) => a.channel === 'qq').nameSource, 'home', '夹具前提')
  assert.equal(feishu.botName, '小帅', 'nameSource=bot → botName 带走种子名')
  assert.equal(feishu.homeText, '', 'nameSource=bot → homeText 留空')
  assert.equal(qq.botName, '', 'nameSource=home → botName 留空')
  assert.equal(qq.homeText, '阿梨窝', 'nameSource=home → homeText 带走种子名')
})

test('回落幂等：already-exists / already-bound 被吞，不重复插入、终态稳定', async () => {
  const seed = seedOnce()
  const host = makeHost({ seedMode: 'unsupported' })
  host.prime(seed) // 宿主已落过一轮（= 重跑同一份种子）
  const before = host.snapshot()
  assert.equal(before.homes.length, seed.homes.length, '前提：宿主已有全部家')

  let res: any = null
  await assert.doesNotReject(async () => { res = await ops.seedHomes(host.rpc, seed) }, '回落重跑不得抛错')

  const homeCreates = host.payloadsOf('home.create')
  const asstCreates = host.payloadsOf('assistant.create')
  assert.equal(homeCreates.length, seed.homes.length, '每家一次 home.create')
  assert.equal(new Set(homeCreates.map((p) => np(p.path))).size, homeCreates.length, '同一路径不重复发 create')
  assert.equal(asstCreates.length, seed.assistants.length, '每助理一次 assistant.create')
  assert.equal(new Set(asstCreates.map((p) => p.channel + '/' + p.botId)).size, asstCreates.length, '同一 bot 不重复发 create')

  // 前提坐实：这一轮的 create 全部是被判重拒绝的（否则「幂等」是假的）
  const rejects = host.calls.filter((c) => c.endpoint === 'home.create').map((c) => c.reply?.error?.code)
  assert.deepEqual(rejects, ['already-exists', 'already-exists'], '建家全被 already-exists 拒绝')
  const asstRejects = host.calls.filter((c) => c.endpoint === 'assistant.create').map((c) => c.reply?.error?.code)
  assert.deepEqual(asstRejects, ['already-bound', 'already-bound'], '建助理全被 already-bound 拒绝')

  // 终态稳定：行数不翻倍、id 不变、最后一次 list 即返回值
  assert.deepEqual(res.homes.map((h) => h.id), before.homes.map((h) => h.id), '家 id 稳定')
  assert.deepEqual(res.assistants.map((a) => a.id), before.assistants.map((a) => a.id), '助理 id 稳定')
  assert.equal(res.homes.length, before.homes.length, '家数不翻倍')
  assert.equal(res.assistants.length, before.assistants.length, '助理数不翻倍')
  assert.equal(host.store.homes.length, before.homes.length, '宿主表未被写脏')
  assert.equal(host.store.assistants.length, before.assistants.length, '宿主表未被写脏')
  assert.equal(host.calls[host.calls.length - 1].endpoint, 'home.list', '以 list 收尾')
})

test('两种宿主等效：同一 buildSeed 输入，两条路家数/助理数一致', async () => {
  const seed = seedOnce()
  const fast = makeHost({ seedMode: 'live' })
  const slow = makeHost({ seedMode: 'unsupported' })

  const a = await ops.seedHomes(fast.rpc, seed)
  const b = await ops.seedHomes(slow.rpc, seed)

  assert.deepEqual(fast.calls.map((c) => c.endpoint), ['home.seed'], '快路径确实走了 home.seed')
  assert.ok(slow.calls.some((c) => c.endpoint === 'home.create') && slow.calls.some((c) => c.endpoint === 'assistant.create'), '回落路径确实逐行落了盘')

  assert.equal(a.homes.length, seed.homes.length, '快路径家数 = 种子家数')
  assert.equal(a.assistants.length, seed.assistants.length, '快路径助理数 = 种子助理数')
  assert.equal(a.homes.length, b.homes.length, '两条路家数一致')
  assert.equal(a.assistants.length, b.assistants.length, '两条路助理数一致')

  // 不只是数量：覆盖的家（规范路径）与绑定（channel/botId）也一致
  const paths = (r: any) => r.homes.map((h) => np(h.path)).sort()
  const binds = (r: any) => r.assistants.map((x) => x.channel + '/' + x.botId).sort()
  assert.deepEqual(paths(a), paths(b), '两条路覆盖同一批家')
  assert.deepEqual(binds(a), binds(b), '两条路覆盖同一批绑定')

  // 两条路都回宿主侧行（真 id），不是种子临时 id
  assert.ok([...a.homes, ...b.homes].every((h) => !seed.homes.some((s) => s.id === h.id)), '都取到宿主真 id')
  assert.ok([...a.assistants, ...b.assistants].every((x) => !seed.assistants.some((s) => s.id === x.id)), '都取到宿主真 id')
})

console.log('features/home-seed-fallback: ALL PASS')
