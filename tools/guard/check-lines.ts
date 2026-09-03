// T0·300 行红线守卫——F0 §5（docs/features-contract.md）机械执行。
// 口径：计数 src/**/*.ts 全部行（含注释）；豁免 lib/**、tools/**、.scratch/**、docs/**
// （均在 src 之外，只扫 src 即天然豁免）与 features 内 json/md 资源（非 .ts，不进扫描）。
// 超限即列出清单并 exit 1；用法：node tools/guard/check-lines.mjs [--limit 300] [--root <repo>] 。
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const LIMIT = Number(argVal('--limit', process.env.GUARD_LIMIT ?? '300'));
const REPO = resolve(argVal('--root', join(HERE, '..', '..')));
const SRC = join(REPO, 'src');

function collectTs(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules') continue;
      collectTs(full, out);
    } else if (name.isFile() && name.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function countLines(text) {
  if (text === '') return 0;
  const parts = text.split(/\r?\n/);
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

const files = collectTs(SRC).sort();
const rows = files.map((full) => ({
  rel: relative(REPO, full).replace(/\\/g, '/'),
  lines: countLines(readFileSync(full, 'utf8')),
}));
const over = rows.filter((r) => r.lines > LIMIT);
const max = rows.reduce((m, r) => Math.max(m, r.lines), 0);

for (const r of rows) console.log(String(r.lines).padStart(4) + '  ' + r.rel);
console.log('guard: ' + rows.length + ' files, max ' + max + ' lines, limit ' + LIMIT + ' \u2014 ' + (over.length === 0 ? 'PASS' : 'FAIL'));
if (over.length > 0) {
  console.error('over-limit files:');
  for (const r of over) console.error('  ' + r.lines + '  ' + r.rel + ' (limit ' + LIMIT + ')');
  process.exit(1);
}