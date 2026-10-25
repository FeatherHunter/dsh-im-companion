
import fs from 'node:fs';
import zlib from 'node:zlib';
const p = process.argv[2];
const buf = fs.readFileSync(p);
const magic = Buffer.from([0x28,0xb5,0x2f,0xfd]);
const positions = [];
let i = buf.indexOf(magic, 0);
while (i >= 0) { positions.push(i); i = buf.indexOf(magic, i+4); }
const chunks = []; let start = 0;
for (let k = 1; k < positions.length; k++) {
  const end = positions[k];
  try { chunks.push(zlib.zstdDecompressSync(buf.subarray(start, end))); start = end; } catch {}
}
try { chunks.push(zlib.zstdDecompressSync(buf.subarray(start))); } catch {}
const lines = Buffer.concat(chunks).toString('utf8').split('\n').filter(l => l.trim());
const wanted = new Set(['session','system/message','developer/message','request/header','request/context','agent/inbox/spliced','user/message','assistant/message','step/start','turn/start','permission/preset','sandbox/mode','model/selection','session/title']);
const seen = new Map();
for (let li = 0; li < lines.length; li++) {
  const o = JSON.parse(lines[li]);
  if (!wanted.has(o.type)) continue;
  const n = seen.get(o.type) || 0;
  if (n >= 1) continue;
  seen.set(o.type, n+1);
  console.log('=== line#' + li + ' type=' + o.type + ' keys=' + Object.keys(o).join(','));
  console.log(JSON.stringify(o).slice(0, 1600));
  console.log();
}
