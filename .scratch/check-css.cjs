const fs = require('fs');
const { execFileSync } = require('node:child_process');
const path = 'src/features/e2-adopt/styles.ts';
execFileSync(process.execPath, [require('path').join('node_modules', 'typescript', 'bin', 'tsc'), path, '--ignoreConfig', '--noEmit', '--skipLibCheck', '--module', 'commonjs', '--target', 'es2023', '--moduleResolution', 'bundler'], { stdio: 'pipe' });
console.log('styles.ts compiles');
const src = fs.readFileSync(path, 'utf8');
const css = src.split('\n').slice(2, -1).join('\n');
let depth = 0;
for (const ch of css) { if (ch === '{') depth++; if (ch === '}') depth--; if (depth < 0) throw new Error('unbalanced'); }
if (depth !== 0) throw new Error('unbalanced at end: ' + depth);
for (const sel of ['.e2-cockpit', '.e2-tape', '.e2-row', '.e2-h-online', '.e2-foot', '.e2-undo', '.e2-confirm', '@media (prefers-color-scheme: dark)', '.e2-row.e2-ph', '.e2-entry']) {
  if (!css.includes(sel)) throw new Error('missing ' + sel);
}
if (css.includes('.af-')) throw new Error('af- leak');
console.log('CSS balanced, all keys present, no af- leak');
