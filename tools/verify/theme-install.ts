// 热重载样式竞态回归：双 bundle 各自 apply 时，旧 fiber 卸载不得摘掉新标签。
// 背景：真机出现"改名后整面板失样式"——根因是旧式先到先得安装（已存在即返回空清理）+
// 旧 fiber 卸载直删共享标签；构建产物 CSS 经查完好，属运行时摘除。修法：同名复写 + 代戳清理。
// 跑法：node --test tools/verify/theme-install.ts（转译单文件 theme.ts，无外部依赖）。
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'theme-install-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'client', 'theme.ts'),
    '--ignoreConfig',
    '--outDir', tmp, '--module', 'nodenext', '--target', 'es2023',
    '--moduleResolution', 'nodenext', '--skipLibCheck',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String((e as any).stdout ?? '') + String((e as any).stderr ?? (e as Error).message));
  process.exit(1);
}

function stubDocument() {
  const tags = new Map<string, any>();
  const mkTag = () => ({
    attrs: {} as Record<string, string>,
    text: '',
    set id(v: string) { this.attrs['id'] = String(v); },
    get id() { return this.attrs['id']; },
    set textContent(v: any) { this.text = String(v ?? ''); },
    get textContent() { return this.text; },
    setAttribute(k: string, v: any) { this.attrs[String(k)] = String(v); },
    getAttribute(k: string) { return this.attrs[k] ?? null; },
    remove() { for (const [key, el] of tags) if (el === this) tags.delete(key); },
  });
  return {
    tags,
    getElementById: (id: string) => tags.get(String(id)) ?? null,
    createElement: () => mkTag(),
    head: { appendChild: (el: any) => { tags.set(el.id, el); } },
  };
}

const doc = stubDocument();
(globalThis as any).document = doc;
// 同一文件 import 两次（query 区分）= 两个 bundle 闭包，各自计数器独立，靠 DOM 代戳协调。
const base = pathToFileURL(join(tmp, 'theme.js')).href;
const m1 = await import(base + '?gen=old');
const m2 = await import(base + '?gen=new');

test('双 apply：新代复写内容，旧清理不误伤，新清理才拆除', () => {
  const disposeOld = m1.installStyles();
  assert.ok(doc.getElementById('dsh-im-companion-styles'), '首装建标签');
  const el1 = doc.getElementById('dsh-im-companion-styles');
  const disposeNew = m2.installStyles();
  assert.equal(doc.getElementById('dsh-im-companion-styles'), el1, '复写同一标签，不另建（防标签堆积）');
  disposeOld();
  assert.ok(doc.getElementById('dsh-im-companion-styles'), '旧清理后新标签必须还在');
  disposeNew();
  assert.equal(doc.getElementById('dsh-im-companion-styles'), null, '新清理后标签拆除');
});

test('installFeatureStyles：同 id 复写，不同 id 共存', () => {
  const d1 = m1.installFeatureStyles('x', '.a{}');
  m1.installFeatureStyles('x', '.b{}');
  assert.equal(doc.getElementById('af-feature-x')?.textContent, '.b{}');
  const d2 = m1.installFeatureStyles('y', '.c{}');
  assert.ok(doc.getElementById('af-feature-y'), '不同 id 共存');
  d1();
  assert.ok(doc.getElementById('af-feature-x'), '旧代清理不拆新内容');
  d2();
});

console.log('theme-install: ALL PASS');
