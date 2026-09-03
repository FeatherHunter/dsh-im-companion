const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const REPO = 'D:/dsh-plugin/dsh-im-companion';
const tmp = mkdtempSync(join(tmpdir(), 'c1a-noell-'));
try {
  execFileSync(process.execPath, [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'src', 'features', 'c1a', 'view.ts'),
    join(REPO, 'tools', 'verify', 'dom-shim.ts'),
    '--ignoreConfig', '--outDir', tmp, '--module', 'commonjs', '--target', 'es2023',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
    '--declaration', 'false', '--sourceMap', 'false', '--noCheck',
  ], { stdio: 'pipe' });
} catch (e) {
  console.error('TRANSPILE-FAIL ' + String(e.stdout || '') + String(e.stderr || e.message));
  process.exit(1);
}
const req = createRequire(join(tmp, 'run.cjs'));
const { createDocument } = req('./tools/verify/dom-shim.js');
globalThis.document = createDocument();
const data = req('./src/features/c1a/data.js');
const view = req('./src/features/c1a/view.js');
const assert = require('node:assert/strict');
function texts(el, out) {
  out = out || [];
  if (!el || typeof el !== 'object') return out;
  const kids = Array.isArray(el.childNodes) ? el.childNodes : [];
  if (kids.length === 0) {
    try {
      const t = typeof el.textContent === 'string' && el.textContent ? el.textContent : (typeof el.nodeValue === 'string' ? el.nodeValue : '');
      if (t) out.push(t);
    } catch (e) {}
  } else for (const c of kids) texts(c, out);
  return out;
}
function findByClass(el, cls) {
  const hit = [];
  const walk = (n) => {
    try { if (n && n.classList && n.classList.contains(cls)) hit.push(n); } catch (e) {}
    const ch = (n && n.children) || [];
    for (const c of ch) walk(c);
  };
  walk(el);
  return hit;
}
const W1 = 'D:\\agents\\xiaoshuai';
const noop = () => {};
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
t('引导语全文渲染、弹窗内无省略号', () => {
  const longGuide = '你是飞书群里的靠谱助手，说话简洁幽默，重要事项逐条列出并艾特相关人，闲聊时可以接梗但不刷屏。';
  assert.ok(longGuide.length > 40);
  const model = data.buildDrawerModel([{
    channel: 'feishu', botId: 'b1', workspace: W1, connected: true,
    healthStatus: 'healthy', agentPreset: null,
    contextEnhancement: { groupEnabled: true, directEnabled: true, fields: ['senderId'], guidance: longGuide },
  }], { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }, W1, { feishu: { defaultId: '', items: [] } });
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onBrowseWorkspace: noop, onDraftWorkspace: noop,
    onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  assert.ok(all.includes(longGuide), '引导语被截断');
  assert.ok(!all.includes('\u2026'), '弹窗内仍有省略号');
  assert.equal(findByClass(root, 'c1a-note').length, 1);
});
t('多渠道不一致占位不断尾', () => {
  const model = data.buildDrawerModel([
    { channel: 'feishu', botId: 'b1', workspace: W1, connected: true, healthStatus: 'healthy', agentPreset: null, contextEnhancement: { groupEnabled: false, directEnabled: true, fields: ['senderId'], guidance: 'hi' } },
    { channel: 'qq', botId: 'b2', workspace: W1, connected: true, healthStatus: 'healthy', agentPreset: 'coder', contextEnhancement: { groupEnabled: true, directEnabled: true, fields: [], guidance: '' } },
  ], { names: {}, avatars: {}, locals: [], presets: {}, ctxEnhance: {} }, W1, { feishu: { defaultId: '', items: [{ id: 'coder', label: '代码助手' }] } });
  assert.equal(model.preset, data.PRESET_MIXED);
  const root = view.renderDrawerContent(model, {
    onPreset: noop, onToggleGroup: noop, onToggleDirect: noop,
    onSaveWorkspace: noop, onRemoveBot: noop, onTestSend: noop, onClose: noop,
  });
  const all = texts(root).join('|');
  assert.ok(all.includes('多渠道不一致，请选择具体预设'));
  assert.ok(!all.includes('\u2026'), '弹窗内仍有省略号');
});
console.log('RESULT', pass + '/2 passed', process.exitCode ? 'FAILED' : 'ALL-PASS');
rmSync(tmp, { recursive: true, force: true });


