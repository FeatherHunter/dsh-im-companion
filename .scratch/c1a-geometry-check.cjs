const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const REPO = 'D:/dsh-plugin/dsh-im-companion';
const tmp = mkdtempSync(join(tmpdir(), 'c1a-geom-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'features', 'c1a', 'data.ts'),
    '--ignoreConfig', '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String(e.stdout || '') + String(e.stderr || e.message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const data = req('./features/c1a/data.js');
const assert = require('node:assert/strict');
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
t('旧逻辑复现：内容矩形 bottom=0（越界到视口底）', () => {
  const g = data.sheetGeometry({ top: 200, right: 1200, bottom: 1400, left: 220 }, { width: 1600, height: 900 });
  assert.equal(g.bottom, 0);
});
t('新逻辑：裁剪后底边=面板底 → bottom=100', () => {
  const pane = [{ top: 200, left: 200, right: 1230, bottom: 800 }];
  const visible = data.clipRect({ top: 200, right: 1200, bottom: 1400, left: 220 }, pane);
  assert.deepEqual(visible, { top: 200, right: 1200, bottom: 800, left: 220 });
  const g = data.sheetGeometry(visible, { width: 1600, height: 900 });
  assert.deepEqual(g, { top: 200, right: 400, bottom: 100, width: 980 });
});
t('顶边夹取：面板滚出内容顶时 top=面板顶', () => {
  const pane = [{ top: 200, left: 200, right: 1230, bottom: 800 }];
  assert.deepEqual(data.clipRect({ top: -50, right: 1200, bottom: 1200, left: 220 }, pane),
    { top: 200, right: 1200, bottom: 800, left: 220 });
});
t('无裁剪祖先：原样返回', () => {
  assert.deepEqual(data.clipRect({ top: 10, right: 900, bottom: 600, left: 100 }, []),
    { top: 10, right: 900, bottom: 600, left: 100 });
});
t('完全裁没：null（调用方走兜底）', () => {
  assert.equal(data.clipRect({ top: 0, right: 500, bottom: 400, left: 100 }, [{ top: 500, left: 0, right: 900, bottom: 900 }]), null);
});
console.log('RESULT', pass + '/5 passed', process.exitCode ? 'FAILED' : 'ALL-PASS');
rmSync(tmp, { recursive: true, force: true });
