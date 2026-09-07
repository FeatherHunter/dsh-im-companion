/** 会话真相（host 只读解码）：open turn / 收尾 kind / approval 配对 / 最新标题。 */
/* 全文件帧切分后单遍扫描；失败一律 null（fail-soft）。预算（单文件上限/数量/耗时）由调用方控制，本文件只给暂行常量（待巨文件重采校准）。 */
import { promises as fs } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

export interface SessionTruth { open: boolean; kind: string; approval: boolean; title: string; }

export const TRUTH_MAX_BYTES = 5 * 1024 * 1024;
export const TRUTH_MAX_FILES = 30;
export const TRUTH_BUDGET_MS = 250;

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const MAX_FRAMES = 20000;

function turnOf(o: { data?: { turn?: unknown } } | null): number {
  try {
    var d = o && o.data ? o.data : null;
    var t = d && typeof d.turn === 'number' ? (d.turn as number) : NaN;
    return isFinite(t) ? Math.floor(t) : 0;
  } catch (e) { return 0; }
}

function strField(o: unknown, path: string[]): string {
  try {
    var cur: unknown = o;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[path[i]];
    }
    return typeof cur === 'string' ? cur : '';
  } catch (e) { return ''; }
}

export async function readSessionTruth(file: string): Promise<SessionTruth | null> {
  try {
    var st = await fs.stat(file);
    if (!st.isFile() || st.size <= 0 || st.size > TRUTH_MAX_BYTES) return null;
    var buf = await fs.readFile(file);
    var idx: number[] = [];
    var o = 0;
    for (;;) {
      var at = buf.indexOf(MAGIC, o);
      if (at < 0) break;
      idx.push(at);
      o = at + 1;
      if (idx.length > MAX_FRAMES) break;
    }
    if (!idx.length) return null;
    var maxStart = 0;
    var maxEnd = 0;
    var kind = '';
    var lastAsked = '';
    var lastDecided = '';
    var title = '';
    for (var k = 0; k < idx.length; k++) {
      var s = idx[k];
      var e = k + 1 < idx.length ? idx[k + 1] : buf.length;
      var text = '';
      try { text = zstdDecompressSync(buf.subarray(s, e)).toString('utf8'); } catch (err) { continue; }
      var lines = text.split('\n');
      for (var li = 0; li < lines.length; li++) {
        var ln = lines[li];
        if (!ln || ln.charAt(0) !== '{') continue;
        var rec: { type?: unknown; data?: { turn?: unknown } } | null = null;
        try { rec = JSON.parse(ln); } catch (err) { continue; }
        var t = rec && typeof rec.type === 'string' ? rec.type : '';
        if (t === 'turn/start') {
          var sn = turnOf(rec);
          if (sn > maxStart) maxStart = sn;
        } else if (t === 'turn/end') {
          var en = turnOf(rec);
          if (en >= maxEnd && en > 0) {
            maxEnd = en;
            var kk = strField(rec, ['data', 'reason', 'kind']);
            if (kk) kind = kk;
          }
        } else if (t === 'approval/asked') {
          var qa = strField(rec, ['data', 'id']);
          if (qa) lastAsked = qa;
        } else if (t === 'approval/decided') {
          var qd = strField(rec, ['data', 'id']);
          if (qd) lastDecided = qd;
        } else if (t === 'session/title') {
          var tt = strField(rec, ['data', 'title']);
          if (tt.trim()) title = tt.trim().slice(0, 80);
        }
      }
    }
    return { open: maxStart > maxEnd, kind: kind, approval: !!lastAsked && lastAsked !== lastDecided, title: title };
  } catch (e) { return null; }
}
