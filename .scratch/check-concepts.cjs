const fs = require('fs');
const files = ['.scratch/e2-concept-a-doorplate.html', '.scratch/e2-concept-b-island.html', '.scratch/e2-concept-c-boarding.html'];
const { execFileSync } = require('node:child_process');
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
console.log('ALL CONCEPTS PARSE');
