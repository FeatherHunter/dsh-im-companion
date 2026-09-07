/** activity 快照（host 侧只读）：mtime 快扫全量 + 真相解码（异常全量常驻，首次冷启动全解，预算熔断仅增量轮）。 */
/* P2删STICKY（多智能体结论）：缺席即消失，fail-soft空 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TRUTH_BUDGET_MS, readSessionTruth, type SessionTruth } from './truth.js';

export interface SessTop { name: string; mtime: number; open?: boolean; kind?: string; approval?: boolean; title?: string }

export interface ActivityEntry {
  dir: string;
  lastActive: number;
  sessions: number;
  running: boolean;
  top: SessTop[];
}

const MAX_WS = 200;
/* 快照缓存：高频轮询（stream 快照/DOM 抖动）直接命中，大工作区全扫只发生在缓存过期后。 */
const SNAP_TTL_MS = 8000;
let snapCache: { at: number; entries: ActivityEntry[] } | null = null;
/* Windows 目录 mtime 内容追加不更新（仅新建/删除 bump），必须下探一层 stat 会话文件；全扫实测约 118ms。
 * MAX_FILES 已删（2026-09-07 用户裁定：观察视野=全部对话——stat 探全量，不截断第 9+ 个文件）。 */
/* 真相解码（2026-09-07 用户拍板：性能是工程约束，异常是事实——异常全量可见，窗口只约束性能）：
 * 快照 top 全量携带（每目录全部会话，不切 8）；异常常驻缓存（size+mtime 未变零解码）；
 * 首次冷启动全量真解（一次性 ~800ms）——磁盘发现异常即展示，不为性能截断事实。 */
var truthCache = new Map<string, { size: number; mtimeMs: number; truth: SessionTruth }>();

async function mtimeOf(p: string): Promise<number> {
  try {
    const st = await fs.stat(p);
    const t = st.mtimeMs;
    return Number.isFinite(t) ? Math.floor(t) : 0;
  } catch { return 0; }
}

interface RawTop { name: string; mtime: number; file: string }
interface RawDir { dir: string; max: number; sessions: number; tops: RawTop[] }

export async function collectActivity(dshHome: string, nowMs: number): Promise<{ entries: ActivityEntry[]; scannedAt: number }> {
  if (snapCache && nowMs - snapCache.at < SNAP_TTL_MS) return { entries: snapCache.entries, scannedAt: snapCache.at };
  const root = path.join(dshHome, 'sessions');
  let dirs: string[] = [];
  try {
    const ents = await fs.readdir(root);
    dirs = ents.filter((n) => n.startsWith('--')).slice(0, MAX_WS);
  } catch { return { entries: [], scannedAt: nowMs }; }
  const raws: RawDir[] = [];
  for (const dir of dirs) {
    try {
      const kids = await fs.readdir(path.join(root, dir));
      let max = 0;
      const tops: RawTop[] = [];
      for (const k of kids) {
        if (k.indexOf('dsh-automation') === 0) continue;
        const child = path.join(root, dir, k);
        let cm = await mtimeOf(child);
        let sub: string[] = [];
        let isDir = false;
        try {
          const st = await fs.stat(child);
          isDir = st.isDirectory();
          if (isDir) sub = await fs.readdir(child);
        } catch { /* 忽略 */ }
        for (const f of sub) {
          const ft = await mtimeOf(path.join(child, f));
          if (ft > cm) cm = ft;
        }
        let file = '';
        if (isDir && sub.indexOf('session.jsonl.zstd') !== -1) file = path.join(child, 'session.jsonl.zstd');
        else if (!isDir && k.length > 5 && k.slice(k.length - 5) === '.zstd') file = child;
        if (cm > max) max = cm;
        if (cm > 0) tops.push({ name: k, mtime: cm, file });
      }
      tops.sort((a, b) => b.mtime - a.mtime);
      raws.push({ dir, max, sessions: kids.length, tops });
    } catch { /* 单工作区失败跳过 */ }
  }
  /* 真相解码（2026-09-07 用户裁定：异常全量可见，窗口只约束正常会话）：
   * 池=全量候选（不切 top-8，预算熔断兜底）；缓存命中零成本；异常文件重解不受预算限。 */
  const truth = new Map<string, SessionTruth>();
  const abnormal = new Map<string, { size: number; mtimeMs: number; truth: SessionTruth }>();
  const t0 = Date.now();
  const pool: { dir: string; name: string; mtime: number; file: string }[] = [];
  for (const r of raws) {
    for (const t of r.tops) {
      if (t.file) pool.push({ dir: r.dir, name: t.name, mtime: t.mtime, file: t.file });
    }
  }
  pool.sort((a, b) => b.mtime - a.mtime);
  /* 首次冷启动（无缓存）全量真解：一次性 ~800ms 换永久全量视野（用户裁定：观察视野=全部对话）。
   * 后续轮：缓存命中零成本，仅 stat 变更文件重解；预算熔断只约束增量轮，异常发现不受限。 */
  const coldStart = truthCache.size === 0;
  for (const c of pool) {
    const key = c.file;
    try {
      const st = await fs.stat(key);
      const old = truthCache.get(key);
      if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) {
        truth.set(c.dir + '' + c.name, old.truth);
        if (old.truth.kind && old.truth.kind !== 'completed' && old.truth.kind !== '') abnormal.set(key, old);
        continue;
      }
      if (!coldStart && Date.now() - t0 > TRUTH_BUDGET_MS && !abnormal.has(key)) break;
      const tr = await readSessionTruth(key);
      if (tr) {
        const rec = { size: st.size, mtimeMs: st.mtimeMs, truth: tr };
        truthCache.set(key, rec);
        truth.set(c.dir + '' + c.name, tr);
        if (tr.kind && tr.kind !== 'completed' && tr.kind !== '') abnormal.set(key, rec);
      }
    } catch { /* 单文件失败跳过 */ }
  }
  /* 阶段二：常驻异常全量入快照（不受 top 窗口/预算限制——磁盘发现异常即展示）。
   * 异常文件追加进对应目录的 top（若不在原 top-8 内），保证行级 join 能看到它。
   * 清缓存中已消失文件的异常记录（会话被归档/删除 → B 机制自然失效）。 */
  const seenKeys = new Set<string>();
  for (const r of raws) for (const t of r.tops) if (t.file) seenKeys.add(t.file);
  for (const [f, rec] of truthCache) { if (!seenKeys.has(f)) truthCache.delete(f); }
  const extraByDir = new Map<string, SessTop[]>();
  for (const [f, rec] of abnormal) {
    if (!seenKeys.has(f)) continue;
    const dir = path.basename(path.dirname(path.dirname(f)));
    const name = path.basename(path.dirname(f));
    const dirRaw = raws.find((r) => r.dir === dir);
    const mtime = dirRaw ? dirRaw.tops.find((t) => t.file === f)?.mtime ?? 0 : 0;
    truth.set(dir + '' + name, rec.truth);
    const st: SessTop = { name, mtime, open: rec.truth.open, kind: rec.truth.kind, approval: rec.truth.approval, title: rec.truth.title };
    const arr = extraByDir.get(dir) || [];
    arr.push(st);
    extraByDir.set(dir, arr);
  }
  const entries: ActivityEntry[] = [];
  for (const r of raws) {
    const top: SessTop[] = r.tops.map((t) => {
      const tr = truth.get(r.dir + '' + t.name);
      if (!tr) return { name: t.name, mtime: t.mtime };
      return { name: t.name, mtime: t.mtime, open: tr.open, kind: tr.kind, approval: tr.approval, title: tr.title };
    });
    const extra = extraByDir.get(r.dir);
    if (extra) for (const ex of extra) {
      const dup = top.some((t) => t.name === ex.name);
      if (!dup) top.push(ex);
    }
    let running = false;
    for (const t of top) {
      if (t.open === true) { running = true; break; }
    }
    const rec: ActivityEntry = { dir: r.dir, lastActive: r.max, sessions: r.sessions, running, top };
    entries.push(rec);
  }
  snapCache = { at: nowMs, entries };
  return { entries, scannedAt: nowMs };
}
