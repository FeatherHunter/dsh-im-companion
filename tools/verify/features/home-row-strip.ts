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

const asst = (o: any = {}): any => ({ id: 'a1', name: '小帅', avatar: null, on: true, channel: 'feishu', sub: '飞书小帅', ...o });const LIST = [
  asst({ id: 'a1', name: '小美', on: true }),
  asst({ id: 'a2', name: 'dsh-prompt', on: false, channel: 'qq', sub: '飞书机器人不在线' }),
  asst({ id: 'a3', name: '未命名助理', on: null, channel: 'nope-unknown', sub: '微信未绑定' }),
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

test('T13 #135 窗宽跟随 refitStrips：活条带一起重判，游离条带只摘不判', () => {
  const host = domDoc.body;
  const a = strip.homeStrip({ homeId: 'h1', orphan: false, path: '', assts: LIST });
  const b = strip.homeStrip({ homeId: 'h2', orphan: false, path: '', assts: LIST });
  host.appendChild(a); host.appendChild(b);
  strip.refitStrips(fakeFits(120));
  for (const el of [a, b]) {
    assert.equal(el.getAttribute('data-rung'), 'trim', '窄窗下两条活条带一起被裁剪');
    assert.equal(txt(one(el, 'hu-cnt')), '3 助理', '重判后徽章仍报总数');
  }
  strip.refitStrips(fakeFits(999));
  assert.equal(a.getAttribute('data-rung'), 'full', '变宽后长回完整档（登记簿不是一次性快照）');
  strip.refitStrips(fakeFits(50));
  assert.equal(cls(a, 'hu-chip').length, 0, '极窄下活条带一枚头像都不留');
  assert.equal(txt(one(a, 'hu-cnt')), '3 助理', '只剩徽章也必须说清总数');
  /* 游离条带（面板刷新后被换掉的那种：从没挂进 DOM）⇒ 只摘不判，不抛、档位不动 */
  const ghost = strip.homeStrip({ homeId: 'hg', orphan: false, path: '', assts: LIST });
  assert.equal(ghost.parentNode, null, '前置：没挂进 DOM 就是游离');
  strip.refitStrips(fakeFits(50));
  assert.equal(ghost.getAttribute('data-rung'), 'full', '游离条带不参与重判（保持原档，且已被摘掉）');
  host.removeChild(a); host.removeChild(b);
});

test('T13 #136 气泡不滞留：锚点游离不画、单盒、样式掉了重装、收起拆盒、旧盒清扫', async () => {
  const tip: any = createRequire(join(tmp, 'run.cjs'))('./client/components/home-row-tip.js');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const boxes = (): any[] => (domDoc.body.querySelectorAll('.hu-tiphost') as any[]);
  const shown = (): any[] => boxes().filter((b) => b.classList.contains('on'));
  const enter = (chip: any): void => chip.dispatchEvent({ type: 'pointerenter' });
  const host = domDoc.body;
  const el = strip.homeStrip({ homeId: 'h1', orphan: false, path: '', assts: LIST });
  host.appendChild(el);
  const chips = cls(el, 'hu-chip');
  assert.equal(chips.length, 3, '前置：三枚芯片都在');
  /* ① 正常悬停 ⇒ 亮起，内容＝头像首字母＋名字＋状态＋渠道（无 ·，状态只讲一次） */
  enter(chips[0]); await sleep(200);
  assert.equal(boxes().length, 1, 'body 里永远只有一个气泡盒（不叠盒）');
  assert.equal(shown().length, 1, '悬停 120ms 后亮起');
  assert.ok(txt(shown()[0]).includes('小美') && txt(shown()[0]).includes('在线'), '气泡报名字＋状态');
  /* ② 换一枚 ⇒ 还是只有一个盒（拆了旧的建新的，不叠盒） */
  enter(chips[1]); await sleep(200);
  assert.equal(boxes().length, 1, '换芯片不另起盒');
  assert.ok(txt(shown()[0]).includes('dsh-prompt'), '内容跟着换到新芯片');
  /* ③ 延迟窗口里锚点被重画换掉（游离）⇒ 到点也不画（零 rect 钉 (8,8) 的漏堵死） */
  tip.hideAsstTip();
  chips[2].remove();
  enter(chips[2]); await sleep(200);
  assert.equal(shown().length, 0, '游离锚点到点也不画');
  /* ④ 样式被卸掉（热重载/插件重载窗口）⇒ 下次悬停先重装，裸盒不许出现 */
  const styles = (domDoc.head?.childNodes ?? []).filter((n: any) =>
    String(n.nodeName).toLowerCase() === 'style' && String(n.getAttribute?.('id') ?? (n as any).id ?? '') === 'af-feature-home-row-l1');
  assert.equal(styles.length, 1, '前置：新表样式在 head 里');
  domDoc.head.removeChild(styles[0]);
  const el2 = strip.homeStrip({ homeId: 'h9', orphan: false, path: '', assts: LIST });
  host.appendChild(el2);
  enter(cls(el2, 'hu-chip')[0]); await sleep(200);
  const back = (domDoc.head?.childNodes ?? []).filter((n: any) =>
    String(n.nodeName).toLowerCase() === 'style' && String(n.getAttribute?.('id') ?? (n as any).id ?? '') === 'af-feature-home-row-l1');
  assert.equal(back.length, 1, '悬停时样式先重装（认领的旧盒也不会裸奔）');
  assert.equal(shown().length, 1, '重装后气泡照常亮起');
  /* ⑤ 收起＝拆盒：body 里一个气泡盒都不留 ⇒ 以后样式再掉、版本再换，都没有裸字可露 */
  tip.hideAsstTip();
  assert.equal(shown().length, 0, '收起后不亮');
  assert.equal(boxes().length, 0, '收起即拆盒（不复用、不留盒，旧字没有过夜的地方）');
  /* ⑥ 旧盒清扫：手工往 body 里扔一个带旧字的裸盒（模拟跨版本热重载的残留），下次悬停必须先扫掉它 */
  const leftover = domDoc.createElement('div');
  leftover.className = 'home-ui hu-tiphost';
  leftover.textContent = 'DLdsh-log飞书未绑定';
  host.appendChild(leftover);
  enter(chips[0]); await sleep(200);
  assert.equal(boxes().length, 1, '每画必先扫：旧盒已带走，永远只有一个新盒');
  assert.equal(shown().length, 1, '清扫之后新盒照常亮起');
  assert.ok(!txt(boxes()[0]).includes('DLdsh-log'), '旧盒的旧字没有借尸还魂（新盒内容＝当前芯片）');
  assert.ok(txt(shown()[0]).includes('小美'), '新盒内容跟着当前悬停走');
  /* ⑦ 无·令（owner 2026-10-16：· 不许出现）：实际渲染文案＋两处源码连接处三钉 */
  assert.ok(!txt(shown()[0]).includes('·'), '气泡实际文案里没有 ·');
  assert.ok(cls(shown()[0], 'hu-ch').length === 1 && cls(shown()[0], 'hu-st').length === 1,
    '渠道与状态是两个独立节点（flex gap 分隔，不是拼字符串更不是紧贴）');
  assert.equal(cls(shown()[0], 'hu-st-bad').length, 0, '在线不染红（红色只给未绑定，当前是小美的在线气泡）');
  const tipSrc = readFileSync(join(COMP, 'home-row-tip.ts'), 'utf8');
  const rowsSrc = readFileSync(join(COMP, 'home-rows.ts'), 'utf8');
  const paintLine = tipSrc.split('\n').find((l) => l.includes('data.sub')) ?? '';
  assert.ok(paintLine.length > 0 && !paintLine.includes('·'), '气泡拼接行没有 ·（状态＋渠道紧贴，不用符号连接）');
  const subLine = rowsSrc.split('\n').find((l) => l.includes('sub: bot ?')) ?? '';
  assert.ok(subLine.length > 0 && !subLine.includes('·'), '家行 sub 行没有 ·（只讲渠道＋名，状态归 statusText）');
  /* ⑧ 平台 logo（A 方案：以图标认渠道）：桩的 innerHTML 不解析标签 ⇒ 源＋函数两头钉，位数在渲染侧钉 */
  const icons: any = createRequire(join(tmp, 'run.cjs'))('./client/icons.js');
  assert.ok(String(icons.channelGlyphSvg('feishu', 14)).includes('data-channel-logo="feishu"'), '飞书 logo 来自 icons.ts（原串只活一处，不在气泡里手写第二遍）');
  assert.ok(String(icons.channelGlyphSvg('feishu', 14)).includes('#00D6B9'), '品牌色保留（用户裁定：不跟 currentColor 变灰）');
  assert.equal(icons.channelGlyphSvg('nope-unknown', 14), null, '未知渠道回 null（气泡走首字徽标回退）');
  assert.ok(tipSrc.includes('channelGlyphSvg(data.channel'), '气泡 logo 就地取自 icons.ts（调用点，不是只 import）');
  assert.ok(tipSrc.includes('hu-logo-fb'), '未知渠道有首字徽标回退（detail-drawer 同款）');
  assert.equal(cls(shown()[0], 'hu-logo').length, 1, '气泡里有且仅有一个 logo 位（桩不解析 svg，只钉位数）');
  tip.hideAsstTip();
  const el3 = strip.homeStrip({ homeId: 'h8', orphan: false, path: '', assts: [asst({ id: 'ax', name: '野助理', on: null, channel: 'nope-unknown', sub: '火星来客' })] });
  host.appendChild(el3);
  enter(cls(el3, 'hu-chip')[0]); await sleep(200);
  assert.equal(shown().length, 1, '未知渠道也照常出气泡（回退不断流）');
  assert.equal(txt(one(shown()[0], 'hu-logo-fb')), '火', '回退徽标取 sub 首字（火星来客→火）');
  assert.equal(txt(one(shown()[0], 'hu-st-bad')), '未绑定', '未绑定三个字是红色档（hu-st-bad，只染未绑定）');
  tip.hideAsstTip();
  host.removeChild(el3);
  enter(chips[0]); await sleep(200);
  assert.equal(shown().length, 1, '回退段落之后盒子照常回来（进层钉的前置）');
  /* 进层与令牌钉（#112 同款坑）：body 级盒子自带 af-portal（否则 --hu-* 全失效），
   * 无 Popover API 的环境不带 popover 属性（否则 UA display:none 藏盒） */
  assert.ok(boxes()[0].classList.contains('af-portal'), '气泡盒自带 af-portal（body 在 .af-root 之外，令牌不能断）');
  assert.ok(!(boxes()[0].hasAttribute?.('popover') ?? false), '桩里无 Popover API ⇒ 不带 popover 属性（带了会被 UA 藏盒）');
  tip.hideAsstTip();
  host.removeChild(el2);
  tip.hideAsstTip();
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
  /* 模板杀手钉：CSS 住在 TS 模板字符串里，一个反引号就会提前终结字符串、构建直接炸
   *（本文件已连踩三回：都是注释里顺手写的反引号）。只查模板区（起始行尾的开引号到行首闭引号），文件头注释里的不管。 */
  const stylesSrc = readFileSync(join(COMP, 'home-row-styles.ts'), 'utf8');
  const tplMark = stylesSrc.indexOf('HOME_ROW_CSS =');
  const tplOpen = stylesSrc.indexOf('`', tplMark);
  const tplClose = stylesSrc.indexOf('\n`', tplOpen + 1);
  assert.ok(tplMark >= 0 && tplOpen > tplMark && tplClose > tplOpen, '前置：找得到 CSS 模板的起止引号');
  assert.ok(!stylesSrc.slice(tplOpen + 1, tplClose).includes('`'), 'CSS 模板区不许有反引号');
  const unscoped = css.split('\n').map((l) => l.trim()).filter((l) => l.includes('{') && !l.startsWith('@') && !l.includes('.home-ui'));
  assert.deepEqual(unscoped, [], '每条规则都必须挂在 .home-ui 之下（不污染全局）');
  assert.ok(css.includes('.home-ui .hu-chip:hover'), '芯片有悬停反馈');
  assert.ok(css.includes('.home-ui .hu-add:hover') && css.includes('.home-ui .hu-add:active'), '「＋ 建助理」悬停＋按下都有反馈');
  assert.ok(css.includes('.home-ui.hu-tiphost'), '悬停气泡是 body 级 float（宿主带 .home-ui，作用域不破）');
  assert.ok(css.includes('.home-ui.hu-tiphost.on'), '气泡有显隐过渡态');
  assert.ok(css.includes('.hu-tt small .hu-st'), '状态字独立成 span 且加粗提亮（结构分隔的另一半，灰脚注不许回来）');
  assert.ok(css.includes('.hu-tt small .hu-ch') && css.includes('.hu-logo-fb'), '渠道节点 inline-flex＋首字徽标回退样式（A 方案 logo 位）');
  assert.ok(css.includes('.hu-st-bad'), '未绑定红色档有样式（只染未绑定，在线离线不动）');
  /* 源码侧钉子：不能长回老副标/老圆点条（owner 2026-10-15 已改口径）。渠道行（按渠道模式）另有一句
     「N 位助理 · M 位已绑」不在本票范围内，故这里只钉**家行**那一句。 */
  const rowsSrc = readFileSync(join(COMP, 'home-rows.ts'), 'utf8');
  assert.ok(!rowsSrc.includes('位助理 · ${d.from}'), '老家行副标「N 位助理 · 来源」不许长回来');
  assert.ok(!rowsSrc.includes('zeroDotEl'), '老空心标记不许长回来（零态＝「＋ 建助理」）');
  assert.ok(rowsSrc.includes('homeStrip({'), '家行第二段走 homeStrip（唯一入口）');
  /* B 原型收敛版还原钉子（owner：列表还原原型）：主动作高亮、行悬停无投影、骨架两段同几何 */
  const orphanSrc = readFileSync(join(COMP, 'home-orphan-row.ts'), 'utf8');
  assert.ok(orphanSrc.includes('hu-ract strong'), '「选择工作区」挂 .strong（B 原型 accent 高亮主动作）');
  assert.ok(css.includes('.home-ui .hu-ract.strong'), '基表没有 .strong 档 ⇒ 新表必须自带（否则类名无样式）');
  /* 孤儿两枚按钮交互钉子（owner 2026-10-16：悬停没反应）：基表 hover 把 .danger 排除在外、
     .strong 的 idle 值又与基表 hover 值撞车 ⇒ 反馈必须落新表，这里钉死 */
  assert.ok(css.includes('.hu-acts2 .hu-ract.strong:hover') && css.includes('.hu-acts2 .hu-ract.danger:hover'),
    '孤儿两枚按钮悬停都有反馈（选择工作区加深＋微抬，删除家加深＋微抬）');
  assert.ok(css.includes('.hu-acts2 .hu-ract:active'), '按钮按下保持缩放反馈（不被悬停的位移吃掉）');
  assert.ok(css.includes('.hu-acts2 .hu-ract:focus-visible'), '孤儿按钮键盘可达（焦点环与「＋ 建助理」同口径）');
  /* 删除改 popconfirm（要求1）：按钮只上报，不改文案；确认弹的主按钮危险红底 */
  assert.ok(orphanSrc.includes("'remove-home'"), '删除家走 data-item-act 上报（确认在弹层里）');
  assert.ok(!orphanSrc.includes('armed'), '两段式布防已退役（按钮不再改文案）');
  assert.ok(css.includes('.hu-pbtn-s.danger'), '删除确认弹主按钮有危险红底（不用 accent 冒充）');
  /* 顶栏吸顶钉子（要求2）：同一容器 sticky，背景不透明，下垫与列表边距同位 */
  assert.ok(css.includes('.hu-top') && css.includes('position:sticky') && css.includes('top:0'),
    '顶栏吸顶：.hu-top sticky 置顶（列表未到底时粘住，父容器到底后自然滑出）');
  assert.ok(css.includes('.hu-top') && css.includes('background:var(--hu-panel)') && css.includes('z-index:7'),
    '吸顶容器背景不透明＋层级在行之上（行滚过去不透字）');
  assert.ok(css.includes('.home-ui .hu-row.hrow:hover'), '家行悬停只换边框＋底色（老投影在这里不出现，还原型）');
  assert.ok(rowsSrc.includes('hu-sstrip'), '骨架行两段式（上段身份＋下段条带灰条，与真行同几何）');
  assert.ok(css.includes('.home-ui .hu-sstrip'), '骨架条带样式与新表同注册（不回基表添行）');
  /* 气泡永不裸奔钉子（owner 2026-10-16：左下角裸字）：拆盒制＋无样式不画＋定位完才亮 */
  const tipSrc = readFileSync(join(COMP, 'home-row-tip.ts'), 'utf8');
  assert.ok(tipSrc.includes('homeRowStylesAlive'), '画之前先查样式活没活（死了就不画，宁可不弹也不裸）');
  assert.ok(tipSrc.indexOf("classList.add('on')") > tipSrc.indexOf('el.style.left'),
    '先定位、后点亮（定位丢了盒子就不亮，不许无定位现身左下角）');
  assert.ok(tipSrc.includes("querySelectorAll?.('.hu-tiphost')"), '每画必先扫旧盒（跨版本残留也带走，不认领）');
  assert.ok(tipSrc.includes('box = null'), '收起即拆盒（旧字没有过夜的地方）');
  /* 可见性钉（owner 2026-10-16：悬停了却什么都不出）：进层复用绿框 popover 系统，不过就再也没人修第二遍 */
  assert.ok(tipSrc.includes('af-portal'), '气泡盒自带 af-portal（令牌作用域不断）');
  assert.ok(tipSrc.includes('showLayer(el)') && tipSrc.includes('hideLayer(box)'), '画完进层、收起下层（调用点，不是只 import）');
  assert.ok(css.includes('.hu-tiphost[popover]'), 'popover 态中和 UA 默认（margin/inset 复位，不抢定位）');
  /* 方向必显式钉（owner 2026-10-16：真机竖排卡——宿主环境样式给了 column，本表只写 display:flex 就被接管；
   * 日志铁证 tip-show flex=column box=113x91。凡依赖初始值的轴向属性一律显式声明，不赌宿主脸色） */
  assert.ok(/\.home-ui\.hu-tiphost\{[^}]*flex-direction:row/.test(css), '气泡主轴横排写死（A 横排单轴，宿主 column 盖不掉）');
  assert.ok(/\.hu-tt small\{[^}]*flex-direction:row/.test(css), '状态行横排写死（点＋渠道＋状态一横排）');
  assert.ok(/\.hu-tt small \.hu-ch\{[^}]*flex-direction:row/.test(css), '渠道节点横排写死（logo＋渠道名不许竖叠）');
  assert.ok(tipSrc.includes("action: 'tip-show'"), '悬停自证几何日志不许丢（真机判官：flex/box/tav/kids，删了等于闭眼）');
});

