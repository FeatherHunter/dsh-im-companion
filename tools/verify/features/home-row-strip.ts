// T13 #135 家行条带自验证：真跑 src/client/components/home-row-strip.ts（DOM 桩），
// 断言三形态（空家「＋ 建助理」/ 有助理芯片＋计数徽章 / 孤儿红色警示行）与**按宽度三级降级**。
// 降级不靠估算：真机走 clientWidth/scrollWidth 实测；这里用 `applyFit(strip, fits)` 的接缝喂一个
// 「按当前 DOM 粗算宽度」的假测量，把三档都逼出来，再断言每档的不变式（徽章恒在且报总数）。
import { mkdtempSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, El } from '../dom-shim.ts';

const REPO = process.cwd();
const COMP = join(REPO, 'src', 'client', 'components');
const tmp = mkdtempSync(join(tmpdir(), 'home-row-strip-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(COMP, 'home-row-strip.ts'),
    '--ignoreConfig', '--rootDir', join(REPO, 'src'), '--outDir', tmp,
    '--module', 'commonjs', '--target', 'es2023', '--moduleResolution', 'bundler',
    '--skipLibCheck', '--types', 'node', '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}
try { symlinkSync(join(REPO, 'node_modules'), join(tmp, 'node_modules'), 'junction'); } catch { /* 已存在跳过 */ }

/* ---- DOM 桩（与 home-avatar.ts 同款口径）---- */
const domDoc: any = createDocument();
const domWin: any = {
  document: domDoc, console, setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { userAgent: 'node-shim' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'hrs' },
  CustomEvent: class { type: string; detail: any; constructor(t: string, o?: any) { this.type = t; this.detail = o?.detail } },
  dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {},
};
domDoc.defaultView = domWin;
(globalThis as any).window = domWin;
(globalThis as any).document = domDoc;
try { Object.defineProperty(globalThis, 'navigator', { value: domWin.navigator, configurable: true, writable: true }); } catch { /* 覆盖不了不影响本用例 */ }
for (const n of ['HTMLElement', 'HTMLButtonElement', 'HTMLDivElement', 'HTMLSpanElement', 'Node', 'Element']) domWin[n] = El;

const strip: any = createRequire(join(tmp, 'run.cjs'))('./client/components/home-row-strip.js');

const nodes = (root: any, out: any[] = []): any[] => {
  for (const c of root?.childNodes ?? []) if (c.nodeType === 1) { out.push(c); nodes(c, out); }
  return out;
};
const cls = (root: any, c: string): any[] => nodes(root).filter((e) => e.classList?.contains(c));
const one = (root: any, c: string): any => cls(root, c)[0] ?? null;
const txt = (e: any): string => String(e?.textContent ?? '').replace(/\s+/g, ' ').trim();

const asst = (o: any = {}): any => ({ id: 'a1', name: '小帅', avatar: null, on: true, sub: '飞书 · 小帅', ...o });
const LIST = [
  asst({ id: 'a1', name: '小美', on: true }),
  asst({ id: 'a2', name: 'dsh-prompt', on: false, sub: '飞书 · 机器人不在线' }),
  asst({ id: 'a3', name: '未命名助理', on: null, sub: '微信 · 未绑定' }),
];

/* 按「当前 DOM」粗算宽度：命名芯片 120px、收起芯片 34px、容器 40px。真机不用这个，只为把三档逼出来。 */
const fakeFits = (avail: number) => (el: any): boolean => {
  const n = cls(el, 'hu-chip').length;
  const named = cls(el, 'hu-cnm').length;
  return (named ? 40 + n * 120 : 40 + n * 34) <= avail;
};

test('T13 #135 条带三形态：空家＝＋建助理（走 item-act）、有助理＝芯片＋计数徽章、孤儿＝红色警示行', () => {
  const empty = strip.homeStrip({ homeId: 'h1', orphan: false, path: 'D:\\agents\\x', assts: [] });
  assert.equal(empty.className, 'hu-strip', '空家也画条带（不是什么都不画）');
  const add = one(empty, 'hu-add');
  assert.ok(add, '空家条带＝「＋ 建助理」');
  assert.equal(txt(add), '＋ 建助理');
  assert.equal(add.getAttribute('data-item-act'), 'new-asst', '必须带 data-item-act —— wireRow 只拦这个，否则点它会被当成进 L2');
  assert.equal(add.getAttribute('data-id'), 'h1', '带上家 id（跨级入口要用它锁家）');
  assert.equal(cls(empty, 'hu-chip').length, 0, '空家没有芯片');
  assert.equal(one(empty, 'hu-cnt'), null, '空家不挂计数徽章（零态由「＋ 建助理」承担）');

  const full = strip.homeStrip({ homeId: 'h1', orphan: false, path: '', assts: LIST });
  assert.equal(cls(full, 'hu-chip').length, 3, '一助理一芯片');
  assert.deepEqual(cls(full, 'hu-cnm').map((n) => txt(n)), ['小美', 'dsh-prompt', '未命名助理'], '芯片带名字');
  assert.equal(cls(full, 'hu-cdot').filter((d) => d.classList.contains('on')).length, 1, '绿＝在线');
  assert.equal(cls(full, 'hu-cdot').filter((d) => d.classList.contains('off')).length, 1, '红＝离线');
  assert.equal(cls(full, 'hu-cdot').filter((d) => d.classList.contains('none')).length, 1, '空心＝未绑定');
  assert.equal(txt(one(full, 'hu-cnt')), '3 助理', '末端计数徽章＝N 助理');
  assert.equal(full.getAttribute('data-rung'), 'full', '首帧画完整档（降级等挂进 DOM 实测之后）');
  assert.equal(cls(full, 'hu-chip').filter((c) => c.classList.contains('unbound')).length, 1, '未绑定芯片虚线');
  assert.ok(cls(full, 'hu-chip').every((c) => String(c.getAttribute('aria-label') ?? '').includes('：')), '芯片带 aria-label（名字：状态）');
  assert.equal(cls(full, 'hu-cnm').length + cls(full, 'hu-cnv').length, 3, '名字只出现一次口径（不重复渲染）');

  const orphan = strip.homeStrip({ homeId: 'h9', orphan: true, path: 'D:\\agents\\gone', assts: [] });
  assert.equal(orphan.className, 'hu-warnline', '孤儿家的条带位换成红色警示行');
  const pill = one(orphan, 'hu-pill');
  assert.ok(pill && pill.classList.contains('alert'), '警示章走 .hu-pill.alert（红色那套）');
  assert.equal(txt(pill), '⚠ 工作区已不在');
  assert.equal(txt(one(orphan, 'hu-path')), 'D:\\agents\\gone', '带上原工作区目录');
  assert.equal(cls(orphan, 'hu-chip').length, 0, '孤儿家不画助理芯片（工作区都没了）');
});

test('T13 #135 三级降级：完整 → 收起（只留头像＋点）→ 裁剪（末端徽章报总数）', () => {
  const el = strip.homeStrip({ homeId: 'h1', orphan: false, path: '', assts: LIST });
  /* ① 宽裕 ⇒ 完整档不动 */
  strip.applyFit(el, fakeFits(999));
  assert.equal(el.getAttribute('data-rung'), 'full');
  assert.equal(cls(el, 'hu-cnm').length, 3, '完整档三个名字都在');
  /* ② 完整放不下、收起放得下 ⇒ 收起档：名字退场，头像与点全在 */
  strip.applyFit(el, fakeFits(300));
  assert.equal(el.getAttribute('data-rung'), 'compact');
  assert.equal(cls(el, 'hu-chip').length, 3, '收起档仍是三枚芯片（一个都不少）');
  assert.equal(cls(el, 'hu-cnm').length, 0, '收起档不画名字（改由悬停气泡报）');
  assert.equal(cls(el, 'hu-cdot').length, 3, '收起档的点贴到头像上，仍是一助理一点');
  assert.equal(txt(one(el, 'hu-cnt')), '3 助理', '徽章恒在且报总数');
  /* ③ 连收起也放不下 ⇒ 裁剪：后面不画，徽章说明一共有几位 */
  strip.applyFit(el, fakeFits(120));
  assert.equal(el.getAttribute('data-rung'), 'trim');
  assert.equal(cls(el, 'hu-chip').length, 2, '裁剪档只画放得下的前两枚');
  assert.equal(txt(one(el, 'hu-cnt')), '3 助理', '徽章报的是**总数**（3），不是显示出来的 2');
  /* ④ 极窄 ⇒ 一枚头像都放不下，只剩徽章 */
  strip.applyFit(el, fakeFits(50));
  assert.equal(cls(el, 'hu-chip').length, 0);
  assert.equal(txt(one(el, 'hu-cnt')), '3 助理', '只剩徽章也必须说清总数');
  /* ⑤ 从裁剪回到完整（面板变宽/换设备）：降级不是单向闩锁 */
  strip.applyFit(el, fakeFits(999));
  assert.equal(el.getAttribute('data-rung'), 'full');
  assert.equal(cls(el, 'hu-cnm').length, 3, '变宽后名字回来了');
  /* ⑥ 量不到（真机隐藏面板/单测桩：clientWidth=0）⇒ 保持完整档，不许瞎降级 */
  const el2 = strip.homeStrip({ homeId: 'h2', orphan: false, path: '', assts: LIST });
  strip.applyFit(el2);
  assert.equal(el2.getAttribute('data-rung'), 'full', '量不到宽度一律当放得下（真实判据在 fitsNow）');
  /* ⑦ 没有助理/孤儿行：applyFit 不许抛（没有 CTX） */
  const empty = strip.homeStrip({ homeId: 'h3', orphan: false, path: '', assts: [] });
  strip.applyFit(empty);
  assert.equal(cls(empty, 'hu-add').length, 1, '空家条带不受降级影响');
});

test('T13 #135 样式：新表以独立 id 注册、全部规则挂 .home-ui（契约 §6）、类前缀 hu-', () => {
  /* 桩的 getElementById 只认属性，而 installTag 写的是 `.id` 属性位（真 DOM 会反射）⇒ 这里直接扫 head。 */
  const styles = (domDoc.head?.childNodes ?? []).filter((n: any) => String(n.nodeName).toLowerCase() === 'style');
  assert.equal(styles.length, 1, '新样式表只装一次（模块级幂等，不许每次画家行都追加）—— 实际 ' +
    styles.map((s: any) => String(s.getAttribute?.('id') ?? '?') + '(' + String(s.textContent ?? '').length + ')').join(' , '));
  const style = styles[0];
  assert.equal(String(style.getAttribute?.('id') ?? style.id ?? ''), 'af-feature-home-row-l1', '样式表 id 固定（热重载按 id 复用）');
  const css = String(style.textContent ?? '');
  assert.ok(css.length > 400, '样式表真的写进去了');
  const unscoped = css.split('\n').map((l) => l.trim()).filter((l) => l.includes('{') && !l.startsWith('@') && !l.includes('.home-ui'));
  assert.deepEqual(unscoped, [], '每条规则都必须挂在 .home-ui 之下（不污染全局）');
  assert.ok(css.includes('.home-ui .hu-chip:hover'), '芯片有悬停反馈');
  assert.ok(css.includes('.home-ui .hu-add:hover') && css.includes('.home-ui .hu-add:active'), '「＋ 建助理」悬停＋按下都有反馈');
  assert.ok(css.includes('.home-ui.hu-tiphost'), '悬停气泡是 body 级 float（宿主带 .home-ui，作用域不破）');
  assert.ok(css.includes('.home-ui.hu-tiphost.on'), '气泡有显隐过渡态');
  /* 源码侧钉子：不能长回老副标/老圆点条（owner 2026-10-15 已改口径）。渠道行（按渠道模式）另有一句
     「N 位助理 · M 位已绑」不在本票范围内，故这里只钉**家行**那一句。 */
  const rowsSrc = readFileSync(join(COMP, 'home-rows.ts'), 'utf8');
  assert.ok(!rowsSrc.includes('位助理 · ${d.from}'), '老家行副标「N 位助理 · 来源」不许长回来');
  assert.ok(!rowsSrc.includes('zeroDotEl'), '老空心标记不许长回来（零态＝「＋ 建助理」）');
  assert.ok(rowsSrc.includes('homeStrip({'), '家行第二段走 homeStrip（唯一入口）');
});

