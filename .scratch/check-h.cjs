const fs = require('fs');
const { execFileSync } = require('node:child_process');
const html = fs.readFileSync('.scratch/e2-h-photos.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
fs.writeFileSync('.scratch/e2-h-photos.html.js', m[1]);
execFileSync(process.execPath, ['--check', '.scratch/e2-h-photos.html.js'], { stdio: 'pipe' });
console.log('H OK');
