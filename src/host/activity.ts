/** activity 快照（host 侧只读）：mtime 快扫全量 + 真相解码子集（open/kind/approval/title，预算内新者优先）。 */
/* 时间作废令（#45 用户裁定）：running 只认解码 open，不认 mtime 窗；mtime 仅作排序/水位/展示。STICKY 沿用冻结修法（P2 待定前不动）。 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TRUTH_BUDGET_MS, TRUTH_MAX_FILES, readSessionTruth, type SessionTruth } from './truth.js';

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
/* Windows 目录 mtime 内容追加不更新（仅新建/删除 bump），必须下探一层 stat 会话文件；全扫实测约 118ms。 */
const MAX_FILES = 10;
const TOP_PER_DIR = 3;
/* 瞬时扫描失败兜底（mergeStaleBots 同款）：缺席目录保留上一轮快照最多 5 分钟，时间冻结且不谎称 running。 */
const STICKY_TTL_MS = 5 * 60 * 1000;
const sticky = new Map<string, { e: ActivityEntry; at: number }>();

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
          if (isDir) sub = (await fs.readdir(child)).slice(0, MAX_FILES);
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
      raws.push({ dir, max, sessions: kids.length, tops: tops.slice(0, 8) });
    } catch { /* 单工作区失败跳过：走 sticky 兜底 */ }
  }
  /* 真相解码：每目录取最新 TOP_PER_DIR，汇合按新排序取预算内，金 fuse 熔断；未解码会话保持未知（不猜）。 */
  const pool: { dir: string; name: string; mtime: number; file: string }[] = [];
  for (const r of raws) {
    const take = r.tops.slice(0, TOP_PER_DIR);
    for (const t of take) {
      if (t.file) pool.push({ dir: r.dir, name: t.name, mtime: t.mtime, file: t.file });
    }
  }
  pool.sort((a, b) => b.mtime - a.mtime);
  const truth = new Map<string, SessionTruth>();
  const t0 = Date.now();
  const capped = pool.slice(0, TRUTH_MAX_FILES);
  for (const c of capped) {
    if (Date.now() - t0 > TRUTH_BUDGET_MS) break;
    try {
      const tr = await readSessionTruth(c.file);
      if (tr) truth.set(c.dir + '' + c.name, tr);
    } catch { /* 单文件失败跳过 */ }
  }
  const entries: ActivityEntry[] = [];
  for (const r of raws) {
    const top: SessTop[] = r.tops.map((t) => {
      const tr = truth.get(r.dir + '' + t.name);
      if (!tr) return { name: t.name, mtime: t.mtime };
      return { name: t.name, mtime: t.mtime, open: tr.open, kind: tr.kind, approval: tr.approval, title: tr.title };
    });
    let running = false;
    for (const t of top) {
      if (t.open === true) { running = true; break; }
    }
    const rec: ActivityEntry = { dir: r.dir, lastActive: r.max, sessions: r.sessions, running, top };
    entries.push(rec);
    sticky.set(r.dir, { e: rec, at: nowMs });
  }
  for (const [dir, rec] of sticky) {
    if (nowMs - rec.at > STICKY_TTL_MS) { sticky.delete(dir); continue; }
    if (!entries.some((e) => e.dir === dir)) entries.push({ ...rec.e, running: false });
  }
  snapCache = { at: nowMs, entries };
  return { entries, scannedAt: nowMs };
}
