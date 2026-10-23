/** Star History 图表门禁：把「README 里那张星标曲线图」的十条契约钉住。
 *
 * 移植自 dsh-mattpocock-skills-deck 的 tests/verify-star-history.ts（2026-10-21），断言口径不变，
 * 只按本仓风格改写（node:test + 中文失败说明）。
 *
 * 为什么值得单独钉：这张图是**手写 SVG 生成器**的产物，坑全在「看起来对」的地方 ——
 * 曲线被 <style> 里的 fill 悄悄盖成正文色、Daily 用 Catmull-Rom 在两个低点之间冲出
 * 数据里没有的波峰、峰值数字写死在模板里、浅色主题的亮色小字过不了对比度。
 * 这些都不会让构建变红，只会让图变丑或变成假数据。所以要钉。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateByDay, mergeHistory, withZeroStart } from '../../star-history/aggregate.ts'
import { buildSvg, monotonePath } from '../../star-history/generate-svg.ts'

const REPO = process.cwd()
const DOCS = join(REPO, 'docs')

/** 门禁用的样例数据：三天、累计 5 颗星、每日最多 2。 */
const days: Array<{ date: string; total: number; daily: number }> = [
  { date: '2026-08-17', total: 1, daily: 1 },
  { date: '2026-08-19', total: 3, daily: 2 },
  { date: '2026-08-20', total: 5, daily: 2 },
]

test('聚合：空输入、UTC 日、跨日合并', () => {
  assert.deepEqual(aggregateByDay([]), [], '空输入必须返回空数组')
  assert.deepEqual(
    aggregateByDay(['2026-08-17T03:19:47Z', '2026-08-17T10:00:00Z']),
    [{ date: '2026-08-17', total: 2, daily: 2 }],
    '同一天的多颗星必须合并成一条，UTC 日界',
  )
  const sample = [
    '2026-08-17T03:19:47Z', '2026-08-19T07:53:02Z', '2026-08-19T09:11:17Z',
    '2026-08-20T05:24:04Z', '2026-08-20T15:21:41Z', '2026-08-22T07:53:52Z', '2026-08-22T09:58:44Z',
  ]
  assert.deepEqual(
    aggregateByDay(sample),
    [
      { date: '2026-08-17', total: 1, daily: 1 },
      { date: '2026-08-19', total: 3, daily: 2 },
      { date: '2026-08-20', total: 5, daily: 2 },
      { date: '2026-08-22', total: 7, daily: 2 },
    ],
    '按 UTC 日聚合、按日升序、total 逐日累加',
  )
})

test('合并：增量追加 vs 全量回溯', () => {
  const existing = [{ date: '2026-08-17', total: 1, daily: 1 }, { date: '2026-08-19', total: 3, daily: 2 }]
  const next = [{ date: '2026-08-20', total: 5, daily: 2 }]
  assert.deepEqual(
    mergeHistory(existing, next),
    [
      { date: '2026-08-17', total: 1, daily: 1 },
      { date: '2026-08-19', total: 3, daily: 2 },
      { date: '2026-08-20', total: 5, daily: 2 },
    ],
    '日期不重叠时按增量追加并重算 total',
  )
  const full = [
    { date: '2026-08-17', total: 1, daily: 1 },
    { date: '2026-08-19', total: 3, daily: 2 },
    { date: '2026-08-20', total: 5, daily: 2 },
  ]
  assert.deepEqual(mergeHistory(existing, full), full, '日期重叠说明是全量回溯，直接以全量为准（否则同一天会被重复计数）')
})

test('SVG：同数据同主题必须字节一致（否则每日 Action 会刷噪声提交）', () => {
  assert.equal(buildSvg(days, 'dark'), buildSvg(days, 'dark'), '同数据同主题必须产出逐字节相同的 SVG')
  assert.notEqual(buildSvg(days, 'dark'), buildSvg(days, 'light'), '深浅两版必须不同')
})

test('SVG：标题唯一、坐标齐全、视口固定', () => {
  const dark = buildSvg(days, 'dark')
  assert.equal((dark.match(/Star History/g) || []).length, 1, '标题只能出现一次')
  assert.ok(dark.includes('08/20'), 'x 轴必须带日期刻度')
  assert.ok(dark.includes('5 stars · 2026-08-20'), '页脚必须写最新总量与日期')
  assert.ok(dark.includes('stroke-dasharray="6 4"'), '每日新增曲线必须在')
  assert.ok(dark.includes('viewBox="0 0 840 480"'), 'viewBox 必须固定')
})

test('SVG：双 Y 轴契约 —— 左读 Total、右读 Daily，两侧数字各染系列色', () => {
  const dark = buildSvg(days, 'dark')
  const light = buildSvg(days, 'light')
  assert.ok(dark.includes('data-axis="total"') && dark.includes('data-axis="daily"'), '两根轴线各带自己的标记')
  assert.ok(dark.includes('>Total Stars<') && dark.includes('>Daily New<'), '两根轴都要有横排轴名')
  assert.ok(!dark.includes('rotate('), '轴名不许竖排（读者要歪头看）')
  assert.ok(dark.includes('text-anchor="end" font-size="13" fill="#ff6b6b" data-axis="total"'), '左列刻度必须是 Total 的颜色')
  assert.ok(dark.includes('text-anchor="start" font-size="13" fill="#38bdf8" data-axis="daily"'), '右列刻度必须是 Daily 的颜色')
  assert.ok(!dark.includes('text-anchor="end" font-size="13" fill="#9aa3b2"'), '左列刻度不许退回中性灰')
})

test('SVG：一个系列一个色值；浅色主题整体压深保证 13px 小字过 AA', () => {
  const light = buildSvg(days, 'light')
  assert.ok(
    light.includes('fill="#b93a34"') && light.includes('stroke="#b93a34"')
    && light.includes('fill="#1d4ed8"') && light.includes('stroke="#1d4ed8"'),
    '浅色主题：曲线、轴线、刻度必须共用同一套压深色板',
  )
  assert.ok(
    !light.includes('#d94f4f') && !light.includes('#2f81f7'),
    '浅色主题的旧亮色不得回潮（对比度不够）',
  )
})

test('SVG：默认字色必须落在根 <svg> 的 fill 属性上（写进 <style> 会盖掉所有元素自己的 fill）', () => {
  const dark = buildSvg(days, 'dark')
  const light = buildSvg(days, 'light')
  const styleBlock = (dark.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
  assert.ok(!styleBlock.includes('fill:'), '<style> 里不许写 fill：CSS 规则优先级高于 presentation attribute，会盖掉轴名/刻度的颜色')
  assert.ok(/<svg[^>]*fill="#e6edf3"/.test(dark), '深色主题：根 svg 必须带默认正文色')
  assert.ok(/<svg[^>]*fill="#24292f"/.test(light), '浅色主题：根 svg 必须带默认正文色')
})

test('SVG：峰值标注必须来自数据（防止写死）', () => {
  const dark = buildSvg(days, 'dark')
  const light = buildSvg(days, 'light')
  assert.ok(dark.includes('data-peak="total"') && dark.includes('data-peak="daily"'), '两条曲线都要标峰值')
  const totalPeak = (dark.match(/data-peak="total">(\d+)<\/text>/) || [])[1] || ''
  const dailyPeak = (dark.match(/data-peak="daily">(\d+)<\/text>/) || [])[1] || ''
  assert.equal(totalPeak, '5', '峰值标注必须是总量最大值 5，不能拿轴刻度冒充')
  assert.equal(dailyPeak, '2', '峰值标注必须是日新增最大值 2')
  assert.ok(light.includes('data-peak="total"') && light.includes('data-peak="daily"'), '浅色主题也要有峰值标注')
})

test('SVG：每日新增曲线平滑且不越过两端取值（不许造出数据里没有的波峰）', () => {
  const dark = buildSvg(days, 'dark')
  const dailyPath = (dark.match(/d="([^"]+)" fill="none" stroke="#38bdf8"/) || [])[1] || ''
  assert.ok(dailyPath.includes('C'), '每日新增必须是三次曲线段，不是折线')
  assert.ok(!dailyPath.includes(' L '), '每日新增不许退回尖锐折角')
  const zig: number[][] = [[0, 100], [40, 60], [80, 100], [120, 20], [160, 80]]
  const segs = monotonePath(zig).split('C').slice(1)
    .map((s) => s.trim().split(/[\s,]+/).map(Number))
  assert.equal(segs.length, zig.length - 1, '相邻两点之间必须正好一段三次曲线')
  segs.forEach((nums, i) => {
    const lo = Math.min(zig[i][1], zig[i + 1][1])
    const hi = Math.max(zig[i][1], zig[i + 1][1])
    for (let k = 1; k < nums.length; k += 2) {
      assert.ok(
        nums[k] >= lo - 1e-6 && nums[k] <= hi + 1e-6,
        `第 ${i + 1} 段的控制点越出了两端取值范围（会造出假峰）`,
      )
    }
  })
  // 相邻两段在拐点处的切线要一致，否则拐点就是一个尖角。
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i]
    const b = segs[i + 1]
    const slopeIn = (a[5] - a[3]) / (a[4] - a[2])
    const slopeOut = (b[1] - a[5]) / (b[0] - a[4])
    assert.ok(Math.abs(slopeIn - slopeOut) < 0.1, `第 ${i + 1} 个拐点是尖角：入 ${slopeIn} vs 出 ${slopeOut}`)
  }
})

test('产物：docs/star-history.json 必须是合法且自洽的日聚合', () => {
  const raw = readFileSync(join(DOCS, 'star-history.json'), 'utf8')
  const data = JSON.parse(raw)
  assert.ok(Array.isArray(data) && data.length > 0, '数据文件必须是非空数组')
  let running = 0
  let prevDate = ''
  for (const row of data) {
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/, `日期格式必须是 YYYY-MM-DD：${row.date}`)
    assert.ok(row.date > prevDate, `日期必须严格升序且不重复：${row.date} 紧跟在 ${prevDate} 后面`)
    prevDate = row.date
    assert.ok(Number.isInteger(row.daily) && row.daily >= 0, `每日新增必须是非负整数（零星首行为 0）：${JSON.stringify(row)}`)
    running += row.daily
    assert.equal(row.total, running, `total 必须等于 daily 的累计和：${JSON.stringify(row)}`)
  }
})

test('产物：两张 SVG 必须与当前数据一致（数据改了没重画，必须红）', () => {
  const data = JSON.parse(readFileSync(join(DOCS, 'star-history.json'), 'utf8'))
  assert.equal(
    readFileSync(join(DOCS, 'star-history-dark.svg'), 'utf8'),
    buildSvg(data, 'dark'),
    '深色图与数据不一致 —— 跑 node tools/star-history/generate-svg.ts 重画',
  )
  assert.equal(
    readFileSync(join(DOCS, 'star-history-light.svg'), 'utf8'),
    buildSvg(data, 'light'),
    '浅色图与数据不一致 —— 跑 node tools/star-history/generate-svg.ts 重画',
  )
})

test('接线：README 与英文 README 都要内嵌这张图（且带缓存戳）', () => {
  for (const file of ['README.md', join('docs', 'README.en.md')]) {
    const text = readFileSync(join(REPO, file), 'utf8')
    assert.ok(
      /star-history-dark\.svg\?v=\d{8}/.test(text),
      `${file} 必须内嵌深色星标图（带 ?v=YYYYMMDD 缓存戳）`,
    )
    assert.ok(
      /star-history-light\.svg\?v=\d{8}/.test(text),
      `${file} 必须内嵌浅色星标图（带 ?v=YYYYMMDD 缓存戳）`,
    )
  }
})

test('聚合：withZeroStart 给首日补零星前一天，两条曲线从原点起画', () => {
  assert.deepEqual(withZeroStart([]), [], '空数组保持空')
  const got = withZeroStart([{ date: '2026-09-03', total: 2, daily: 2 }])
  assert.deepEqual(got, [
    { date: '2026-09-02', total: 0, daily: 0 },
    { date: '2026-09-03', total: 2, daily: 2 },
  ])
  assert.deepEqual(withZeroStart(got), got, '已有零星行必须幂等返回')
})
