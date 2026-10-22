// 票 #169（T8-1）· 助理两栏（简介 description / 人物设定 persona）的**共享定义**单点。
// 判据（规格 #168「字段校验与共享定义」）：
// ① 上限按 **Unicode 码点**算（emoji / 增补面字符算 1，不是 UTF-16 的 2）——200/8000 过、201/8001 拒；
// ② CRLF 归一到 LF 再 trim（写盘与将来的注入共用同一个归一）；trim 后为空 ≡ 未提供；
// ③ 错误文案必须带字段定位（中文名 + 键名），下游（#171 表单 / #172 详情）直接复用，不许各写一份。
// 变异自证（把本文件指向 src 的临时副本 ⇒ 必须变红）：countCodePoints 改成 .length（A2/A3 红）、
//   删掉 CRLF 替换（A4 红）、错误文案去掉字段定位（A3/A5 红）、validateAssistantFields 把 undefined 当 ''（A5 红）。
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
const fields: any = await import(pathToFileURL(join(REPO, 'src', 'assistant-fields.ts')).href)

/* B 段要走**真 RPC 分发 + 真家表落盘**（同 home-store.ts 的转译夹具），故 src/ → 临时 BUILD。 */
const BUILD = mkdtempSync(join(tmpdir(), 'afields-'))
try {
  execFileSync(process.execPath, [join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json',
    '--outDir', BUILD, '--declarationDir', join(BUILD, 'types'), '--sourceMap', 'false'], { stdio: 'pipe' })
} catch (e: any) {
  console.error('TRANSPILE-FAIL ' + String(e?.stdout ?? '') + String(e?.stderr ?? e?.message))
  process.exit(1)
}
writeFileSync(join(BUILD, 'package.json'), '{"type": "module"}\n')
try { symlinkSync(join(REPO, 'node_modules'), join(BUILD, 'node_modules'), 'junction'); } catch { /* 已存在 */ }
const rpc: any = await import(pathToFileURL(join(BUILD, 'host', 'rpc.js')).href)
const store: any = await import(pathToFileURL(join(BUILD, 'host', 'home-store.js')).href)

const DIRS: string[] = []
const boot = () => {
  const dshHome = mkdtempSync(join(tmpdir(), 'af-'))
  DIRS.push(dshHome)
  const call = rpc.createAgentFleetHandler({}, { dshHome })
  return { dshHome, call, file: join(dshHome, 'integrations', 'dsh-im-companion', 'homes.yaml') }
}
after(() => { rmSync(BUILD, { recursive: true, force: true }); for (const d of DIRS) rmSync(d, { recursive: true, force: true }) })

const val = (r: any) => { assert.equal(r.ok, true, r.ok ? '' : `RPC 应成功，实际 ${r.error.code}: ${r.error.message}`); return r.value }
const mkHome = async (call: any, i: number) => val(await call('home.create', { workspaceId: 'w' + i, path: '/ws' + i, title: '家' + i })).home
const mkAssistant = async (call: any, homeId: string, extra: any = {}) => val(await call('assistant.create', { homeId, channel: 'ch', botId: 'bot' + Math.random().toString(36).slice(2, 8), ...extra })).assistant
const listRow = async (call: any, id: string) => val(await call('home.list', {})).assistants.find((a: any) => a.id === id)

test('A1 共享定义单点：键名 / 中文名 / 上限（简介 200、人物设定 8000）', () => {
  assert.deepEqual([...fields.ASSISTANT_FIELDS], ['description', 'persona'], '键名与规格 #168 逐字一致（snake-free）')
  assert.equal(fields.ASSISTANT_FIELD_SPECS.description.label, '简介')
  assert.equal(fields.ASSISTANT_FIELD_SPECS.description.max, 200)
  assert.equal(fields.ASSISTANT_FIELD_SPECS.persona.label, '人物设定')
  assert.equal(fields.ASSISTANT_FIELD_SPECS.persona.max, 8000)
  assert.equal(fields.fieldLocator('description'), '简介（description）', '错误文案的字段定位：中文名＋键名')
  assert.equal(fields.fieldLocator('persona'), '人物设定（persona）')
})

test('A2 按 Unicode 码点计长：emoji / 增补面字符算 1（不是 UTF-16 的 2）', () => {
  assert.equal(fields.countCodePoints('😀'), 1, '一个 emoji 是一个字符')
  assert.equal(fields.countCodePoints('a😀𠮷'), 3, 'BMP + 两个增补面字符')
  assert.equal(fields.countCodePoints('😀'.repeat(200)), 200)
  assert.equal(fields.countCodePoints('😀'.repeat(201)), 201, '201 个 emoji = 201 字（.length 会得 402）')
  assert.equal('😀'.repeat(200).length, 400, '前提：UTF-16 长度确实是 400 —— 用 .length 判长会把 200 个 emoji 误拒')
})

test('A3 边界：200/8000 通过，201/8001 拒绝；错误文案带字段定位与实测字数', () => {
  const ok200 = fields.checkFieldValue('description', '字'.repeat(200))
  assert.equal(ok200.ok, true, '200 字整必须过（边界闭区间）')
  assert.equal(ok200.value, '字'.repeat(200))
  const ok8000 = fields.checkFieldValue('persona', '字'.repeat(8000))
  assert.equal(ok8000.ok, true, '8000 字整必须过')
  assert.equal(ok8000.value.length, 8000)

  const over200 = fields.checkFieldValue('description', '字'.repeat(201))
  assert.equal(over200.ok, false, '201 字必须拒')
  assert.equal(over200.message, '简介（description）最多 200 字，当前 201 字', '错误文案是共享单点（下游不许各写一份）')
  const over8000 = fields.checkFieldValue('persona', '字'.repeat(8001))
  assert.equal(over8000.ok, false)
  assert.equal(over8000.message, '人物设定（persona）最多 8000 字，当前 8001 字')

  /* 边界按码点算的**行为证据**（不只是 countCodePoints 单测）：200 个 emoji 过、201 个 emoji 拒。 */
  assert.equal(fields.checkFieldValue('description', '😀'.repeat(200)).ok, true, '200 个 emoji（UTF-16 长 400）必须过')
  const emoji201 = fields.checkFieldValue('description', '😀'.repeat(201))
  assert.equal(emoji201.ok, false, '201 个 emoji 必须拒（按 .length 会误判成 402 字）')
  assert.equal(emoji201.message, '简介（description）最多 200 字，当前 201 字', '报的是码点数，不是 UTF-16 长度')
})

test('A4 CRLF 归一 + trim；空 / 缺失 / 清空三态等价', () => {
  assert.equal(fields.normalizeFieldText('第一行\r\n第二行\r第三行'), '第一行\n第二行\n第三行', 'CRLF / 裸 CR 一律归一成 LF')
  assert.equal(fields.normalizeFieldText('  \n 你好 \n '), '你好', '两端空白（含换行）trim 掉')
  assert.equal(fields.normalizeFieldText('   '), '', '纯空白 ⇒ 空')
  assert.equal(fields.normalizeFieldText(undefined), '', '缺失 ⇒ 空')
  assert.equal(fields.normalizeFieldText(null), '', 'null（清空）⇒ 空')

  assert.deepEqual(fields.checkFieldValue('description', undefined), { ok: true, value: undefined }, 'undefined＝未提供（不写、不清）')
  assert.deepEqual(fields.checkFieldValue('description', null), { ok: true, value: '' }, 'null＝清空（等价于空串）')
  assert.deepEqual(fields.checkFieldValue('description', '  \r\n  '), { ok: true, value: '' }, 'trim 后为空 ≡ 空串')
  assert.deepEqual(fields.checkFieldValue('description', '  你好  '), { ok: true, value: '你好' }, '存的是归一后的值')
})

test('A5 非字符串诚实拒绝；validateAssistantFields 只回「提供了的键」（undefined 不等于空串）', () => {
  const bad = fields.checkFieldValue('persona', 42)
  assert.equal(bad.ok, false, '数字不是字符串 ⇒ 拒（不 coerce、不当空）')
  assert.equal(bad.message, '人物设定（persona）必须是字符串')
  assert.equal(fields.checkFieldValue('persona', true).message, '人物设定（persona）必须是字符串')

  assert.deepEqual(fields.validateAssistantFields({}), { ok: true, value: {} }, '什么都没提供 ⇒ 空补丁（不 materialize 空键）')
  /* 空串必须**留在补丁里**（persona: ''）：它表达「清空」；键缺失才是「不动」——两者落到账本上是删键 vs 保原值。 */
  assert.deepEqual(fields.validateAssistantFields({ description: '简介', persona: '' }), { ok: true, value: { description: '简介', persona: '' } }, '空串＝显式清空（键在、值为空）')
  const v = fields.validateAssistantFields({ persona: '  \r\n 人设 \r\n' })
  assert.deepEqual(v, { ok: true, value: { persona: '人设' } }, '归一后再落账')
  const f = fields.validateAssistantFields({ description: '字'.repeat(201), persona: '字'.repeat(8001) })
  assert.equal(f.ok, false)
  assert.equal(f.code, 'bad-request', 'RPC 失败码与既有 bad-request 同形')
  assert.equal(f.message, '简介（description）最多 200 字，当前 201 字', '按字段顺序报第一个错')

  assert.equal(fields.assistantFieldText({}, 'persona'), '', '读侧访问器：缺失 ⇒ 空串（「空与缺失等价」的读侧）')
  assert.equal(fields.assistantFieldText({ persona: '  a\r\nb  ' }, 'persona'), 'a\nb', '读侧同样归一（注入层与 UI 共用）')
  assert.equal(fields.assistantFieldText({ persona: 42 }, 'persona'), '', '盘上坏类型按未设置读（读容忍）')
  assert.equal(fields.hasAssistantField({ description: ' ' }, 'description'), false, 'trim 后为空＝没设置')
  assert.equal(fields.hasAssistantField({ description: '简介' }, 'description'), true)
  assert.deepEqual(fields.stripEmptyFields({ id: 'a', description: '  ', persona: '人设' }), { id: 'a', persona: '人设' }, '写盘口：trim 空的键整键摘掉')
})

/* ── B 段：RPC 三通电话 + 家表落盘（create / createUnbound / update / move / bind / remove / home.list） ── */

test('B1 assistant.create：两栏随行落账并归一；home.list 只在非空时带键（空与缺失同形）', async () => {
  const { call, file } = boot()
  const h1 = await mkHome(call, 1)
  const a = await mkAssistant(call, h1.id, { description: '  第一行\r\n第二行  ', persona: '人设\r\n第二段' })
  assert.equal(a.description, '第一行\n第二行', 'create 侧归一（CRLF→LF、trim）')
  assert.equal(a.persona, '人设\n第二段')

  const bare = await mkAssistant(call, h1.id)
  assert.equal('description' in bare, false, '没给 ⇒ 行上连键都没有（不 materialize 空串）')
  assert.equal('persona' in bare, false)

  const listed = val(await call('home.list', {})).assistants
  const got = listed.find((x: any) => x.id === a.id)
  assert.equal(got.description, '第一行\n第二行')
  assert.equal(got.persona, '人设\n第二段')
  const bareGot = listed.find((x: any) => x.id === bare.id)
  assert.equal('description' in bareGot, false, 'home.list 不给空键')
  assert.equal('persona' in bareGot, false)

  /* 超长经 RPC 进来同样诚实拒绝（错误文案原样透传，且不多一行）。 */
  const rejected = await call('assistant.create', { homeId: h1.id, channel: 'ch', botId: 'bot-over', description: '字'.repeat(201) })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.error.code, 'bad-request')
  assert.equal(rejected.error.message, '简介（description）最多 200 字，当前 201 字')
  assert.equal(val(await call('home.list', {})).assistants.length, 2, '被拒的创建不留行')

  const text = readFileSync(file, 'utf8')
  assert.ok(/^version: 2$/m.test(text), '零迁移：version 仍是 2')
  assert.ok(!/description: ''/.test(text) && !/persona: ''/.test(text), '盘上不出现空串键')
  /* 老客户端读新账本不炸：行数、必填列都在。 */
  const doc = await store.loadHomesDoc(file)
  assert.equal(doc.assistants.length, 2)
})

test('B2 assistant.createUnbound：两栏同样落账（未绑定行也带），坏值诚实拒绝且不落盘', async () => {
  const { call, file } = boot()
  const h1 = await mkHome(call, 1)
  const r = val(await call('assistant.createUnbound', { homeId: h1.id, name: '待绑', description: '简介', persona: '人设' })).assistant
  assert.equal(r.description, '简介')
  assert.equal(r.persona, '人设')
  assert.equal(r.boundAt, null, '仍是未绑定行')

  const before = readFileSync(file, 'utf8')
  const bad = await call('assistant.createUnbound', { homeId: h1.id, persona: '字'.repeat(8001) })
  assert.equal(bad.ok, false)
  assert.equal(bad.error.code, 'bad-request')
  assert.equal(bad.error.message, '人物设定（persona）最多 8000 字，当前 8001 字')
  assert.equal(readFileSync(file, 'utf8'), before, '拒绝不落盘')
})

test('B3 assistant.update：闸门放宽到 name/avatar/description/persona 任一；单改一栏不动另一栏；空串＝删键', async () => {
  const { call, file } = boot()
  const h1 = await mkHome(call, 1)
  const a = await mkAssistant(call, h1.id)

  const gate = await call('assistant.update', { id: a.id })
  assert.equal(gate.ok, false, '只给 id ⇒ 拒（四个字段至少其一）')
  assert.equal(gate.error.message, 'name/avatar/description/persona 至少其一')

  /* 四个字段各自单独都能过闸（这一个循环就是「至少其一」的正面证据）。 */
  for (const [key, value] of [['name', '新名'], ['avatar', '1'], ['description', '简介'], ['persona', '人设']] as const) {
    const r: any = await call('assistant.update', { id: a.id, [key]: value })
    assert.equal(r.ok, true, `单给 ${key} 应过闸`)
    assert.equal(r.value.assistant[key], value)
  }
  let row = await listRow(call, a.id)
  assert.equal(row.name, '新名')
  assert.equal(row.avatar, '1')
  assert.equal(row.description, '简介', '改别的栏不动两栏')
  assert.equal(row.persona, '人设')

  const over = await call('assistant.update', { id: a.id, description: '字'.repeat(201) })
  assert.equal(over.ok, false)
  assert.equal(over.error.code, 'bad-request')
  assert.equal(over.error.message, '简介（description）最多 200 字，当前 201 字', '错误文案带字段定位，RPC 层原样透传')
  const badType = await call('assistant.update', { id: a.id, persona: 42 })
  assert.equal(badType.ok, false)
  assert.equal(badType.error.message, '人物设定（persona）必须是字符串')
  assert.equal(readFileSync(file, 'utf8').includes('字'.repeat(50)), false, '被拒的值没落盘')

  val(await call('assistant.update', { id: a.id, description: '' }))
  row = await listRow(call, a.id)
  assert.equal('description' in row, false, '空串＝清空（键从账本上消失）')
  assert.equal(row.persona, '人设', '清一栏不动另一栏')
  assert.ok(!/description: ''/.test(readFileSync(file, 'utf8')))
})

test('B4 两栏随 id 走：move 搬家 / bind 绑定都不丢；assistant.remove 随行一起删', async () => {
  const { call, file } = boot()
  const h1 = await mkHome(call, 1)
  const h2 = await mkHome(call, 2)
  const a = await mkAssistant(call, h1.id, { description: '简介', persona: '独特人设标记' })

  const moved: any = val(await call('assistant.move', { id: a.id, targetHomeId: h2.id }))
  assert.equal(moved.assistant.homeId, h2.id)
  assert.equal(moved.assistant.description, '简介', '搬家不丢两栏（两栏是助理行的列，不是家的）')
  assert.equal(moved.assistant.persona, '独特人设标记')
  assert.equal((await listRow(call, a.id)).persona, '独特人设标记', '读回仍在')

  const unbound = val(await call('assistant.createUnbound', { homeId: h1.id, description: '未绑简介', persona: '未绑人设' })).assistant
  const bound: any = val(await call('assistant.bind', { id: unbound.id, channel: 'ch', botId: 'b9', botName: '机器人', homeText: '家' }))
  assert.equal(bound.assistant.description, '未绑简介')
  assert.equal(bound.assistant.persona, '未绑人设')

  val(await call('assistant.remove', { id: a.id }))
  assert.equal(await listRow(call, a.id), undefined, '助理删了行就没了')
  const text = readFileSync(file, 'utf8')
  assert.ok(!text.includes('独特人设标记'), '两栏随行一起删除（不留孤儿键/值）')
  assert.ok(text.includes('未绑人设'), '别的助理的两栏不受影响')
})