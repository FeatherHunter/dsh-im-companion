/** 真实活性管线（共享数据层，只读）：activity.snapshot 拉取 + 目录启发匹配 + 状态推导 + 合成排序。 */
/* 时间=会话文件最大 mtime（文件级近似，非逐条发言）；方向=粗分（有IM路由即混合/机器人相关）。 */
import { fetchRouteRows, type BotSnap, type RpcCall, type RouteRow } from './fleet-api';

export interface SessTop { name: string; mtime: number; open?: boolean; kind?: string; approval?: boolean; title?: string }

export interface ActivityEntry { dir: string; lastActive: number; sessions: number; running: boolean; top: SessTop[] }

export type ActKind = 'exec' | 'seen' | 'calm' | 'sink';

export interface WsState { ws: string; act: ActKind; dir: string; time: number; n: number }

function segs(p: string): string[] {
  return String(p ?? '').split(/[\\/]+/).filter(function (s) { return !!s; }).map(function (s) { return s.toLowerCase(); });
}

function stripDir(d: string): string {
  return String(d ?? '').replace(/^-+|-+$/g, '').toLowerCase();
}

function matchScore(wsPath: string, dir: string): number {
  var s = segs(wsPath);
  if (!s.length) return 0;
  var d = stripDir(dir);
  if (!d) return 0;
  var last = s[s.length - 1];
  var tail = s.length > 1 ? s[s.length - 2] + '-' + last : last;
  if (d.indexOf(tail) !== -1) return 2;
  var ends = d.length >= last.length && d.slice(d.length - last.length) === last;
  if (ends) return 1;
  return 0;
}

export function matchEntry(wsPath: string, entries: ActivityEntry[]): ActivityEntry | null {
  var best: ActivityEntry | null = null;
  var bestScore = 0;
  for (var i = 0; i < entries.length; i++) {
    var sc = matchScore(wsPath, entries[i].dir);
    if (sc > bestScore) { bestScore = sc; best = entries[i]; }
  }
  return best;
}

export async function fetchActivity(rpc: RpcCall | null): Promise<ActivityEntry[]> {
  try {
    if (!rpc) return [];
    var raw = await rpc('/im-companion', 'activity.snapshot', {}, AbortSignal.timeout(5000));
    var v = raw as { ok?: boolean; value?: { entries?: unknown } } | null;
    var list = v && v.ok === true && v.value && Array.isArray(v.value.entries) ? (v.value.entries as unknown[]) : [];
    var out: ActivityEntry[] = [];
    for (var i = 0; i < list.length && out.length < 500; i++) {
      var e = list[i] as { dir?: unknown; lastActive?: unknown; sessions?: unknown; running?: unknown; top?: unknown };
      if (!e || typeof e.dir !== 'string' || !e.dir) continue;
      var t = typeof e.lastActive === 'number' && Number.isFinite(e.lastActive) && e.lastActive > 0 ? Math.floor(e.lastActive) : 0;
      var top: SessTop[] = [];
      /* V2 全量口径（#55）：未看判定要求全量会话可见——host 快照本已全量，此处解析窗需同步放开。
       * 旧 top-8 是 T4 性能窗残留；现唯一消费者为 unread paint（读快照侧已验证），500 与 entries 上限对齐。 */
      if (Array.isArray(e.top)) {
        for (var ti = 0; ti < e.top.length && top.length < 500; ti++) {
          var te = e.top[ti] as { name?: unknown; mtime?: unknown; open?: unknown; kind?: unknown; approval?: unknown; title?: unknown };
          if (!te || typeof te.name !== 'string' || !te.name) continue;
          var tm = typeof te.mtime === 'number' && Number.isFinite(te.mtime) && te.mtime > 0 ? Math.floor(te.mtime) : 0;
          var to: SessTop = { name: te.name, mtime: tm };
          if (te.open === true || te.open === false) to.open = te.open;
          if (typeof te.kind === 'string' && te.kind) to.kind = te.kind.slice(0, 24);
          if (te.approval === true) to.approval = true;
          if (typeof te.title === 'string' && te.title.trim()) to.title = te.title.trim().slice(0, 80);
          top.push(to);
        }
      }
      out.push({ dir: e.dir, lastActive: t, sessions: typeof e.sessions === 'number' ? e.sessions : 0, running: e.running === true, top: top });
    }
    return out;
  } catch (e) { return []; }
}

export function routesOf(bots: BotSnap[], routes: RouteRow[]): Map<string, boolean> {
  var m = new Map<string, boolean>();
  try {
    var byBot = new Map<string, string>();
    for (var i = 0; i < bots.length; i++) {
      if (bots[i].workspace) byBot.set(bots[i].channel + '\0' + bots[i].botId, bots[i].workspace);
    }
    for (var j = 0; j < routes.length; j++) {
      var ws = byBot.get(routes[j].channel + '\0' + routes[j].botId);
      if (ws) m.set(ws, true);
    }
  } catch (e) { /* 忽略 */ }
  return m;
}

export async function fetchRoutesSafe(rpc: RpcCall | null, bots: BotSnap[]): Promise<RouteRow[]> {
  try {
    if (!rpc || !bots.length) return [];
    return await fetchRouteRows(rpc, bots);
  } catch (e) { return []; }
}

const PRIO: Record<ActKind, number> = { exec: 0, seen: 1, calm: 2, sink: 3 };

/* 时间作废令（#45 用户裁定）：判据禁时间窗；mtime 仅作展示与缓存版本号。旧 SEEN_TTL/DOT_FRESH 已删。 */
export function deriveStates(bots: BotSnap[], entries: ActivityEntry[], hasRoutes: Map<string, boolean>, seen: Map<string, number>, nowMs?: number): WsState[] {
  var out: WsState[] = [];
  var order: string[] = [];
  var i: number;
  for (i = 0; i < bots.length; i++) {
    if (bots[i].workspace && order.indexOf(bots[i].workspace) === -1) order.push(bots[i].workspace);
  }
  for (i = 0; i < order.length; i++) {
    var ws = order[i];
    var e = matchEntry(ws, entries);
    if (!e || e.lastActive <= 0) { out.push({ ws: ws, act: 'sink', dir: '', time: 0, n: 0 }); continue; }
    var mark = seen.get(ws) || 0;
    var act: ActKind = e.running ? 'exec' : (e.lastActive > mark ? 'seen' : 'calm');
    var dir = (act === 'exec' || act === 'seen') ? (hasRoutes.get(ws) ? '混合' : '普通') : '';
    out.push({ ws: ws, act: act, dir: dir, time: e.lastActive, n: e.sessions });
  }
  return out;
}

export function sortStates(states: WsState[]): WsState[] {
  return states.slice().sort(function (a, b) {
    var p = PRIO[a.act] - PRIO[b.act];
    if (p !== 0) return p;
    if (b.time !== a.time) return b.time - a.time;
    return a.ws < b.ws ? -1 : a.ws > b.ws ? 1 : 0;
  });
}

export interface RowMatch { ws: string; entry: ActivityEntry | null; via: 'bot' | 'name' | 'none' }

export interface RowState { key: string; ws: string; act: ActKind; dir: string; time: number; via: 'bot' | 'name' | 'none'; top: SessTop[] }

function joined(p: string): string { return segs(p).join('/'); }

function flatLower(p: string): string { return String(p == null ? '' : p).toLowerCase().trim(); }

export function resolveBotWs(rowText: string, bots: BotSnap[]): string {
  var k = joined(rowText);
  if (!k) return '';
  for (var i = 0; i < bots.length; i++) {
    var b = bots[i];
    if (b.workspace && (joined(b.workspace) === k || baseOfSeg(b.workspace) === k)) return b.workspace;
    if (b.botName && flatLower(b.botName) === flatLower(rowText)) return b.workspace;
  }
  return '';
}

function baseOfSeg(p: string): string {
  var s = segs(p);
  return s.length ? s[s.length - 1] : '';
}

export function matchRowEntry(rowText: string, bots: BotSnap[], entries: ActivityEntry[]): RowMatch {
  var ws = resolveBotWs(rowText, bots);
  if (ws) return { ws: ws, entry: matchEntry(ws, entries), via: 'bot' };
  var parts = segs(rowText);
  var last = parts.length ? parts[parts.length - 1] : '';
  if (!last || last.length < 2) return { ws: '', entry: null, via: 'none' };
  var best: ActivityEntry | null = null;
  var bestScore = 0;
  var bestCount = 0;
  for (var i = 0; i < entries.length; i++) {
    var d = stripDir(entries[i].dir);
    if (!d) continue;
    var sc = 0;
    if (d === last) sc = 3;
    else if (d.length >= last.length && d.slice(d.length - last.length) === last) sc = 2;
    else if (d.indexOf(last) !== -1) sc = 1;
    if (sc > bestScore) { bestScore = sc; best = entries[i]; bestCount = 1; }
    else if (sc === bestScore && sc > 0) { bestCount++; }
  }
  if (best && bestCount === 1) return { ws: '', entry: best, via: 'name' };
  return { ws: '', entry: null, via: 'none' };
}

/* 水位（seed/track/peek/markSessionViewed/sessSeen）已于 2026-09-07 退役——
 * 用户拍板：水位=AI 错误引入概念；已看判定=官方绿点自售自清，插件不再存"看过没看过"。 */
export function deriveRowStates(rowTexts: string[], bots: BotSnap[], entries: ActivityEntry[], hasRoutes: Map<string, boolean>, nowMs?: number): RowState[] {
  var out: RowState[] = [];
  var i: number;
  for (i = 0; i < rowTexts.length; i++) {
    var m = matchRowEntry(rowTexts[i], bots, entries);
    if (m.via === 'none') { out.push({ key: 'row:' + rowTexts[i], ws: '', act: 'sink', dir: '', time: 0, via: 'none', top: [] }); continue; }
    var key = m.via === 'bot' ? ('w:' + m.ws) : ('d:' + String(m.entry && m.entry.dir));
    var t = m.entry ? m.entry.lastActive : 0;
    var etop: SessTop[] = (m.entry && m.entry.top) ? m.entry.top : [];
    if (!m.entry || t <= 0) { out.push({ key: key, ws: m.ws, act: 'sink', dir: '', time: 0, via: m.via, top: etop }); continue; }
    var act: ActKind = m.entry.running ? 'exec' : 'calm';
    if (act === 'calm') {
      /* 2026-09-07 水位退役：行级 act 只认"有无 open 会话"，不再有 seen（未看）——
       * 未看由官方绿点表达（DOM 主路径），数据层不得产出"未看"判定。 */
    }
    var dir = '';
    if (act === 'exec') dir = m.via === 'bot' ? (hasRoutes.get(m.ws) ? '混合' : '普通') : '普通';
    out.push({ key: key, ws: m.ws, act: act, dir: dir, time: t, via: m.via, top: etop });
  }
  return out;
}

export function sortRowStates(rs: RowState[]): RowState[] {
  return rs.slice().sort(function (a, b) {
    var p = PRIO[a.act] - PRIO[b.act];
    if (p !== 0) return p;
    if (b.time !== a.time) return b.time - a.time;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

export function fmtTime(ms: number): string {
  if (!ms || ms <= 0) return ''; 
  try {
    var d = new Date(ms);
    var now = new Date();
    var hm = d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  } catch (e) { return ''; }
}
