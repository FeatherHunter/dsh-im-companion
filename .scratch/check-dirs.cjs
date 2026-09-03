const fs = require('fs');
const { execFileSync } = require('node:child_process');
const files = ['.scratch/e2-d1-livingroom.html', '.scratch/e2-d2-courtyard.html', '.scratch/e2-d3-blocks.html', '.scratch/e2-d4-aurora.html'];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { console.error('NO SCRIPT ' + f); process.exit(1); }
  const tmp = f + '.js';
  fs.writeFileSync(tmp, m[1]);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log('ok ' + f);
  } catch (e) {
    console.error('SYNTAX FAIL ' + f + '\n' + String(e.stderr || e.message));
    process.exit(1);
  }
}
console.log('ALL DIRS PARSE');
