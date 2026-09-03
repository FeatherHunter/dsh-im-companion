const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const REPO = 'D:/dsh-plugin/dsh-im-companion';
const tmp = mkdtempSync(join(tmpdir(), 'c1a-sig-'));
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
const W1 = 'D:\\agents\\xiaoshuai';
const CTX0 = { groupEnabled: false, directEnabled: true, fields: ['senderId'], guidance: 'hi' };
const bot = (over) => ({ channel: 'feishu', botId: 'b1', workspace: W1, connected: true, healthStatus: 'healthy', agentPreset: null, contextEnhancement: { ...CTX0 }, ...(over || {}) });
const metaDoc = () => ({ names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} });
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
t('同构快照指纹稳定（两次独立构建相等）', () => {
  const mk = (ctx) => data.buildDrawerModel([bot({ contextEnhancement: { ...ctx } })], metaDoc(), W1, {});
  const a = mk({ ...CTX0 }); const b = mk({ ...CTX0 });
  assert.ok(a && b);
  assert.equal(data.modelSig(a), data.modelSig(b));
});
t('真变指纹才变（开关翻转）', () => {
  const mk = (ctx) => data.buildDrawerModel([bot({ contextEnhancement: { ...ctx } })], metaDoc(), W1, {});
  const a = mk({ ...CTX0 });
  const c = mk({ ...CTX0, directEnabled: false });
  assert.ok(a && c);
  assert.notEqual(data.modelSig(a), data.modelSig(c));
});
console.log('RESULT', pass + '/2 passed', process.exitCode ? 'FAILED' : 'ALL-PASS');
rmSync(tmp, { recursive: true, force: true });
