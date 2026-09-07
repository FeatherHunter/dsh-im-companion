/** activity 快照（host 侧只读）：扫 sessions/ 各工作区目录取会话文件最大 mtime。 */
/* 只读 readdir + stat，不读内容、不解压（zstd 解码留 L3）；有界 fail-soft。 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface SessTop { name: string; mtime: number }

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
export const RUNNING_WINDOW_MS = 30000;
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

export async function collectActivity(dshHome: string, nowMs: number): Promise<{ entries: ActivityEntry[]; scannedAt: number }> {
  if (snapCache && nowMs - snapCache.at < SNAP_TTL_MS) return { entries: snapCache.entries, scannedAt: snapCache.at };
  const root = path.join(dshHome, 'sessions');
  let dirs: string[] = [];
  try {
    const ents = await fs.readdir(root);
    dirs = ents.filter((n) => n.startsWith('--')).slice(0, MAX_WS);
  } catch { return { entries: [], scannedAt: nowMs }; }
  const entries: ActivityEntry[] = [];
  for (const dir of dirs) {
    try {
      const kids = await fs.readdir(path.join(root, dir));
      let max = 0;
      const scored: SessTop[] = [];
      for (const k of kids) {
        if (k.indexOf('dsh-automation') === 0) continue;
        const child = path.join(root, dir, k);
        let cm = await mtimeOf(child);
        let sub: string[] = [];
        try {
          const st = await fs.stat(child);
          if (st.isDirectory()) sub = (await fs.readdir(child)).slice(0, MAX_FILES);
        } catch { /* 忽略 */ }
        for (const f of sub) {
          const ft = await mtimeOf(path.join(child, f));
          if (ft > cm) cm = ft;
        }
        if (cm > max) max = cm;
        if (cm > 0) scored.push({ name: k, mtime: cm });
      }
      scored.sort((a, b) => b.mtime - a.mtime);
      const rec: ActivityEntry = { dir, lastActive: max, sessions: kids.length, running: max > 0 && nowMs - max < RUNNING_WINDOW_MS, top: scored.slice(0, 8) };
      entries.push(rec);
      sticky.set(dir, { e: rec, at: nowMs });
    } catch { /* 单工作区失败跳过：走 sticky 兜底 */ }
  }
  for (const [dir, rec] of sticky) {
    if (nowMs - rec.at > STICKY_TTL_MS) { sticky.delete(dir); continue; }
    if (!entries.some((e) => e.dir === dir)) entries.push({ ...rec.e, running: false });
  }
  snapCache = { at: nowMs, entries };
  return { entries, scannedAt: nowMs };
}
