// #61 回归：新建空工作区组行左缘不再出现红色 dotted（nosig0 与平静一致无条）。
// Q1 锁定：已匹配但无会话数据不再渲染任何竖条；Q2：全量组行生效。
// 红/黄/蓝语义与 nosig 灰点保持不变。node --test 运行，零第三方依赖。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const FEAT = join(REPO, 'src', 'features', 'design-preview');
const cssSrc = readFileSync(join(FEAT, 'styles.ts'), 'utf8');
const demoSrc = readFileSync(join(FEAT, 'demo.ts'), 'utf8');

function cssRuleLines(): string[] {
  return cssSrc.split('\n').filter((l) => l.includes('::before') && l.includes('data-dp-act='));
}

test('nosig0 永不使用异常红（#d92d20 禁止出现在 nosig0 规则）', () => {
  const rules = cssRuleLines().filter((l) => l.includes('nosig0'));
  assert.ok(rules.length >= 1, '须保留 nosig0 兜底规则（陈旧属性 display:none），实际 0 条');
  for (const r of rules) {
    assert.equal(r.includes('#d92d20'), false, 'nosig0 规则不得含异常红：' + r);
    assert.equal(r.includes('dotted #d92d20'), false, 'nosig0 不得为红色 dotted：' + r);
  }
});

test('nosig0 与平静一致无条（陈旧属性兜底 display:none）', () => {
  const rules = cssRuleLines().filter((l) => l.includes('nosig0'));
  const hasNoBar = rules.some((r) => r.includes('display:none'));
  assert.ok(hasNoBar, 'nosig0 须 display:none（陈旧 DOM 也不渲染竖条），实际：' + JSON.stringify(rules));
});

test('sink 分支不再置 nosig0 act（无竖条，诊断 tip 保留供 devtools）', () => {
  const idx = demoSrc.indexOf("st.act === 'sink'");
  assert.ok(idx >= 0, 'demo.ts 须保留 sink 分支');
  const block = demoSrc.slice(idx, idx + 800);
  assert.equal(block.includes("setAttr(row, 'data-dp-act', 'nosig0')"), false, 'sink 不得再置 nosig0 act');
  assert.ok(block.includes("delAttr(row, 'data-dp-act')"), 'sink 须 delAttr（与平静一致无条）');
  assert.ok(block.includes("setAttr(row, 'data-dp-tip'"), 'sink 诊断 tip 须保留（devtools 可查）');
});

test('红/黄/蓝语义不变（402/aborted/未知收尾红实线闪烁，执行中蓝，待看黄）', () => {
  const rules = cssRuleLines();
  const need = rules.find((l) => l.includes('=need]'));
  const exec = rules.find((l) => l.includes('=exec]'));
  const seen = rules.find((l) => l.includes('=seen]'));
  assert.ok(need && need.includes('#d92d20'), '红 need 须保留 #d92d20：' + need);
  assert.ok(exec && exec.includes('#1677ff'), '蓝 exec 须保留 #1677ff：' + exec);
  assert.ok(seen && seen.includes('#dc6803'), '黄 seen 须保留 #dc6803：' + seen);
});

test('nosig 灰点诊断保留（未匹配行仍灰色 dotted，不受 #61 影响）', () => {
  const rules = cssRuleLines().filter((l) => l.includes('=nosig]'));
  assert.ok(rules.length >= 1, 'nosig 灰点规则须保留');
  assert.ok(rules.some((l) => l.includes('#b0b6bd') && l.includes('dotted')), 'nosig 须为灰色 dotted：' + JSON.stringify(rules));
});

test('红线：design-preview 单文件 ≤300 行（规模红线，非解耦检查）', () => {
  for (const f of ['styles.ts', 'demo.ts', 'sessions.ts', 'manifest.ts']) {
    const n = readFileSync(join(FEAT, f), 'utf8').split('\n').length;
    assert.ok(n <= 300, f + ' ≤300 行，实际 ' + n);
  }
});

console.log('features/design-preview: ALL PASS');
