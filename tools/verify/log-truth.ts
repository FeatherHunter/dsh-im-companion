// #130「日志不撒谎」门禁：把「事后只读日志就能判定」这条主线上缺的三件事钉死。
//
// 为什么值得单独一个验证物：#130 抓到的失效是**日志数值与真相相反**——`panel.load {homes:0, assistants:0}`
// （磁盘真相 14 家 / 6 助理）通过了当时全部 24 套 verify：既有门禁只查接线、字段形状、调用点与清单不漂移，
// **不查数值真伪**，于是它活了一天、靠人肉读日志才发现。本文件补的就是这一档：
//   ① 构建身份进日志（`build` = `<版本>@<产物写入时刻>`）：只读日志能答「这条出自哪一版产物」，
//      不再依赖事后 stat 库内文件（产物会被并发会话覆写，`lib/` 还是 gitignore 的）；
//   ② `panel.load` 总账的顺序与数值契约：必须在**读完家表之后**才记，且数字取自读回的家表；
//   ③ 顺序契约的源码接线不许被改回去（`panel.ts` 首屏把 `loadHomes` 交给 `load` 的 `afterHomes`）。
// 手法照 tools/verify/features/home-degrade.ts：tsc 转译到临时目录 + createRequire + node_modules junction，
// 并把客户端日志出口（`src/client/log.ts`）**换成桩**——拦在模块边界才能断言「记了什么、什么顺序」。
// 产物那条断言依赖 `lib/` 已构建（`npm run check` 里 build 在 verify 之前；单独跑 verify 请先 npm run build）。
// LOGTRUTH_REPO 只为变异自证（拿 src/ 的临时副本当仓库根跑同一份测试），正常跑无需设置。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'

const REPO = process.env.LOGTRUTH_REPO || process.cwd()
const tmp = mkdtempSync(join(tmpdir(), 'logtruth-'))
const tmpHome = mkdtempSync(join(tmpdir(), 'logtruth-home-'))
after(() => {
  for (const dir of [tmp, tmpHome]) rmSync(dir, { recursive: true, force: true })
})

/* ── 转译：客户端 panel-data 链（CJS）＋ 宿主 build-id 取值；junction node_modules 供 dsh-log 解析 ── */
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'client', 'components', 'panel-data.ts'),
    join(REPO, 'src', 'host', 'build-id.ts'),
    '--ignoreConfig', '--rootDir', join(REPO, 'src'), '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--declaration', 'false', '--sourceMap', 'false',
    /* 宿主那条取值链 import node:fs / node:url ⇒ 必须带上 node 类型（--ignoreConfig 后不会从 tsconfig 继承）。 */
    '--types', 'node',
  ], { stdio: 'pipe' })
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message))
  process.exit(1)
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction') } catch { /* 已存在跳过 */ }

const req = createRequire(join(tmp, 'run.cjs'))
/* 客户端日志出口换成桩：拦在模块边界才能断言「记了什么、什么顺序」（真 dsh-log 在这里只添噪声）。 */
const logged: Array<{ level: string; event: string; fields: Record<string, unknown> }> = []
const seq: string[] = []
const logPath = join(tmp, 'client', 'log.js')
const noop = (): void => {}
req.cache[logPath] = {
  id: logPath, filename: logPath, loaded: true,
  exports: {
    logLine: (level: string, event: string, fields: Record<string, unknown>) => { logged.push({ level, event, fields }); seq.push('log:' + event) },
    logOn: () => false, initLog: noop, flushLogs: noop, reconcileLogSwitch: noop, droppedLogs: () => 0,
  },
} as any

const buildId: any = req('./build-id.js')
const hostBuildId: any = req('./host/build-id.js').hostBuildId
const streamMod: any = req('./client/data/connection-stream.js')

/* ── 夹具：临时包布局（`<包根>/lib/index.js` + package.json）＝真装/开发态同一形状；宿主取值跑真函数 ── */
const pkgDir = join(tmp, 'fixture-pkg')
mkdirSync(join(pkgDir, 'lib'), { recursive: true })
writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: '9.9.9' }))
const entryFile = join(pkgDir, 'lib', 'index.js')
writeFileSync(entryFile, '// fixture host entry\n')
const ENTRY_MTIME = statSync(entryFile).mtimeMs
const HOST_ID = hostBuildId(pathToFileURL(entryFile).href)

test('构建身份①：格式统一 `<版本>@<UTC 秒>`；缺段不编造，取值不抛', () => {
  const at = Date.UTC(2026, 9, 15, 4, 1, 41)
  assert.equal(buildId.isoSeconds(at), '2026-10-15T04:01:41Z', '时刻一律 UTC 秒（毫秒去掉）')
  assert.equal(buildId.formatBuildId('v1.2.3', at), 'v1.2.3@2026-10-15T04:01:41Z', '宿主/客户端同形')
  assert.equal(buildId.formatBuildId('v1.2.3', '2026-10-15T04:01:41Z'), 'v1.2.3@2026-10-15T04:01:41Z', '注入的常量（字符串）同样吃')
  assert.equal(buildId.formatBuildId('', at), '2026-10-15T04:01:41Z', '版本取不到就只留时刻')
  assert.equal(buildId.formatBuildId('v1.2.3', '不是时间'), 'v1.2.3', '时刻取不到就只留版本')
  assert.equal(buildId.formatBuildId(undefined, NaN), '', '两段都取不到 ⇒ 空串，绝不编造')
  assert.equal(buildId.isoSeconds('nonsense'), '')
})

test('构建身份②：宿主侧取值＝入口产物 mtime ＋ 包版本；产物不在盘上也不抛', () => {
  assert.equal(HOST_ID, 'v9.9.9@' + buildId.isoSeconds(ENTRY_MTIME), '必须取自 package.json 的版本与入口产物自己的 mtime')
  assert.match(HOST_ID, /^v\d+\.\d+\.\d+@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, '形状固定，便于按日志 grep/对齐 lib/ mtime')
  const ghost = pathToFileURL(join(pkgDir, 'lib', 'not-there.js')).href
  assert.doesNotThrow(() => hostBuildId(ghost), '取不到一律降级，日志绝不许抛')
  assert.equal(hostBuildId(ghost), 'v9.9.9', '产物不在 ⇒ 只留版本那一段，绝不编造时刻')
  const orphan = pathToFileURL(join(tmp, 'no-pkg', 'lib', 'index.js')).href
  assert.equal(hostBuildId(orphan), '', '产物与 package.json 都不在 ⇒ 空串')
})

test('构建身份③：两侧接线与清单声明（改回去即红）', () => {
  const host = readFileSync(join(REPO, 'src', 'index.ts'), 'utf8')
  assert.match(host, /'host\.start',\s*\{[^}]*build:\s*hostBuildId\(import\.meta\.url\)/s, 'host.start 必须带 build，且取自运行中的本产物')
  const client = readFileSync(join(REPO, 'src', 'client', 'index.ts'), 'utf8')
  assert.match(client, /__BUILD_STAMP__/, '客户端时刻必须来自打包期注入的常量')
  assert.match(client, /'client\.start',\s*\{[^}]*build:\s*clientBuildId\(\)/s, 'client.start 必须带 build')
  const cfg = readFileSync(join(REPO, 'tsdown.config.ts'), 'utf8')
  assert.match(cfg, /__BUILD_STAMP__:\s*JSON\.stringify\(/, 'tsdown 必须注入 __BUILD_STAMP__（否则客户端那行恒为空）')
  const events = readFileSync(join(REPO, 'src', 'log-events.ts'), 'utf8')
  assert.match(events, /'host\.start':[^\n]*'build'/, '字段没进清单 ⇒ 与调用点漂移（log-pipeline 的双向断言也会红）')
  assert.match(events, /'client\.start':[^\n]*'build'/, '同上')
})

test('构建身份④：交付产物里两条身份都已折成字面量（验的是 lib/，不是源）', () => {
  const bundlePath = join(REPO, 'lib', 'client.js')
  assert.ok(existsSync(bundlePath), '先 npm run build（npm run check 的 build 排在 verify 之前）: ' + bundlePath)
  const bundle = readFileSync(bundlePath, 'utf8')
  assert.ok(bundle.includes('"client.start"'), '产物里必须仍有 client.start 事件名')
  assert.match(bundle, /"v\d+\.\d+\.\d+"\s*,\s*"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/,
    '打包必须把「版本 + 打包时刻」折进 clientBuildId 的取值（否则浏览器那行拿不到身份）')
  const hostOut = readFileSync(join(REPO, 'lib', 'index.js'), 'utf8')
  assert.match(hostOut, /build:\s*hostBuildId\(import\.meta\.url\)/, '宿主产物必须真的算一次 build')
})

test('构建身份⑤：真产物真落盘后用 `dsh-log tail` 的人话渲染能直接读到 build', async () => {
  const hostLogPath = join(REPO, 'lib', 'host', 'log.js')
  assert.ok(existsSync(hostLogPath), '先 npm run build（npm run check 的 build 排在 verify 之前）: ' + hostLogPath)
  /* 取运行中宿主产物的**真**身份（`lib/index.js`）——与 src/index.ts 启动时算的是同一个函数、同一份文件。 */
  const realId = hostBuildId(pathToFileURL(join(REPO, 'lib', 'index.js')).href)
  assert.match(realId, /^v\d+\.\d+\.\d+@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, '真产物必须答得出「版本@写入时刻」，取到的是: ' + realId)
  const hostLog: any = await import(pathToFileURL(hostLogPath).href)
  const handle = await hostLog.createHostLogFor(tmpHome)
  assert.ok(handle, '建库失败（真实环境里日志会静默降级，这里必须红）')
  handle.log('info', 'host.start', { route: '/api/im-companion', dshHome: tmpHome, build: realId })
  handle.log('info', 'host.log.init', { dir: handle.dir, ok: true, reason: '' })
  await handle.synced()
  assert.equal(handle.dropped(), 0, '不该有丢弃行')
  const cli = join(REPO, 'node_modules', 'dsh-log', 'dist', 'cli.js')
  assert.ok(existsSync(cli), 'dsh-log CLI 不在（读日志的惯例入口）: ' + cli)
  /* 传目录而非文件：与 AGENTS.md 的读法一致（`npx dsh-log tail <dir>`）；首行 `没找到日志目录：tail` 是无害提示。 */
  const out = execFileSync(process.execPath, [cli, 'tail', handle.dir, '-n', '20'], { encoding: 'utf8' })
  assert.ok(out.includes('build=' + realId), '人话渲染里必须看得见构建身份：' + out.slice(0, 500))
})

/* ── panel.load 总账：宿主 double（家表 3 家 / 助理 2 位 / 快照空） ───────────────────── */
const PATHS = ['D:\\agents\\jia', 'D:\\agents\\yi', 'D:\\agents\\bing']
const WS = PATHS.map((path, i) => ({ workspaceId: 'ws-' + (i + 1), path, title: ['甲', '', '丙'][i] }))
const HOMES = WS.map((w, i) => ({
  id: 'h-' + (i + 1), workspaceId: w.workspaceId, path: w.path, name: w.title || w.path,
  nameSource: 'system', avatar: null, avatarSource: 'default', createdAt: i + 1, updatedAt: i + 1,
}))
const ASSISTANTS = [
  { id: 'a-1', homeId: 'h-1', channel: 'feishu', botId: 'b1', status: 'bound', name: '小帅', nameSource: 'bot', avatar: null, avatarSource: 'default', createdAt: 1, boundAt: 1 },
  { id: 'a-2', homeId: 'h-2', channel: 'qq', botId: 'q1', status: 'bound', name: '阿奇', nameSource: 'bot', avatar: null, avatarSource: 'default', createdAt: 2, boundAt: 2 },
]
const rows = () => ({ homes: HOMES.map((h) => ({ ...h })), assistants: ASSISTANTS.map((a) => ({ ...a })) })
const ok = (value: unknown) => ({ ok: true, value })
const rpc = async (channel: string, endpoint: string) => {
  if (channel !== '/im-companion') return ok({ bots: [] }) // 渠道快照空 ⇒ 不触发孤儿回落，夹具只剩「读家表」一条线
  seq.push('rpc:' + endpoint)
  if (endpoint === 'ping') return ok({})
  if (endpoint === 'meta.get') return ok({ names: {} })
  if (endpoint === 'home.list') return ok(rows())
  if (endpoint === 'home.seed') return ok(rows())
  return { ok: false, error: { code: 'bad-request', message: 'unknown endpoint ' + endpoint } }
}

test('panel.load 不撒谎：总账在家表读完**之后**记，数字取自读回的家表', async () => {
  streamMod.resetSharedStream()
  const panelData: any = req('./client/components/panel-data.js')
  const data = panelData.createPanelData(rpc)
  await data.load(false, () => data.loadHomes(() => WS))
  const line = logged.filter((l) => l.event === 'panel.load').pop()
  assert.ok(line, 'panel.load 必须落一条总账')
  assert.ok(seq.includes('rpc:home.list'), '这一轮必须真读过家表（否则下面的顺序断言无意义）')
  assert.ok(seq.indexOf('rpc:home.list') < seq.indexOf('log:panel.load'), '顺序契约：家表读完才记总账（#130 真机验收抓到过反例）')
  assert.equal(line.fields.homes, HOMES.length, 'homes 必须等于读回的家表行数（不是 0，也不是种子数）')
  assert.equal(line.fields.assistants, ASSISTANTS.length, 'assistants 必须等于读回的助理行数')
  assert.equal(line.fields.homes, data.state.homes.length, '日志数值必须与面板状态同源')
  assert.equal(line.fields.assistants, data.state.assistants.length, '同上')
  assert.equal(line.fields.bots, 0, '快照为空 ⇒ bots=0（夹具写死，防止别的线悄悄塞行）')
  assert.equal(line.fields.ok, true, '这一轮全须全尾')
  assert.equal(line.level, 'info')
  streamMod.getSharedStream(rpc).dispose()
})

test('敏感性自证：顺序契约一破，总账当场变成假 0（本门禁不是恒绿）', async () => {
  streamMod.resetSharedStream()
  const panelData: any = req('./client/components/panel-data.js')
  const data = panelData.createPanelData(rpc)
  /* 旧形态：家表在 load 之外读 ⇒ 总账记的是还没读表的空状态——正是 #130 抓到的「日志撒谎」。 */
  await data.load(false)
  const line = logged.filter((l) => l.event === 'panel.load').pop()
  assert.equal(line?.fields.homes, 0, '没有 afterHomes 时总账只能是 0（这就是本门禁要抓的形态）')
  await data.loadHomes(() => WS)
  assert.equal(data.state.homes.length, HOMES.length, '家表其实有 3 行 ⇒ 上面那行 0 是假的')
  streamMod.getSharedStream(rpc).dispose()
})

test('接线不许改回去：panel.ts 首屏把 loadHomes 交进 load 的 afterHomes', () => {
  const panel = readFileSync(join(REPO, 'src', 'client', 'components', 'panel.ts'), 'utf8')
  assert.match(panel, /data\.load\(\s*false\s*,\s*\(\s*\)\s*=>\s*data\.loadHomes\(getWorkspaces\)\s*\)/,
    '首屏链必须把「读家表」传进 afterHomes：挂在这一步外面时，总账恒记 homes=0（T9 #123 真机验收实测）')
})
