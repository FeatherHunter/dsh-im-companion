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
      if (Array.isArray(e.top)) {
        for (var ti = 0; ti < e.top.length && top.length < 8; ti++) {
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

/* 时间作废令（#45 用户裁定）：判据禁时间窗；待看只认水位比较（isNew），mtime 仅作水位与展示。旧 SEEN_TTL/DOT_FRESH 已删。 */
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

var sessSeen = new Map<string, number>();
var sessPrev = new Map<string, boolean>();
var sessSeeded = false;

export function seedSessionSeen(items: { key: string; mtime: number }[]): void {
  if (sessSeeded) return;
  sessSeeded = true;
  for (var i = 0; i < items.length; i++) sessSeen.set(items[i].key, items[i].mtime);
}

export function trackSession(key: string, mtime: number, running: boolean): { isNew: boolean; justFinished: boolean } {
  var prev = sessPrev.get(key);
  var mark = sessSeen.get(key);
  var isNew = mtime > (mark || 0);
  var justFinished = prev === true && !running && isNew;
  sessPrev.set(key, running);
  return { isNew: isNew, justFinished: justFinished };
}

export function peekSession(key: string, mtime: number): boolean {
  try {
    var mark = sessSeen.get(key);
    return mtime > (mark || 0);
  } catch (e) { return false; }
}

function normSid(id: string): string {
  var s = String(id || '').toLowerCase().trim();
  if (s.indexOf('session-') === 0) s = s.slice(8);
  return s;
}

export function markSessionViewed(sessionId: string): number {
  var hit = 0;
  try {
    var nid = normSid(sessionId);
    if (!nid || nid.length < 4) return 0;
    var now = Date.now();
    sessSeen.forEach(function (_, k) {
      try {
        var tail = k.slice(k.lastIndexOf('/') + 1).toLowerCase();
        if (tail.indexOf('session-') === 0) tail = tail.slice(8);
        var m = Math.min(nid.length, tail.length);
        if (m >= 8 && (tail === nid || tail.indexOf(nid) !== -1 || nid.indexOf(tail) !== -1)) { sessSeen.set(k, now); hit++; }
      } catch (e) { /* 单键忽略 */ }
    });
  } catch (e) { /* 忽略 */ }
  return hit;
}

export function deriveRowStates(rowTexts: string[], bots: BotSnap[], entries: ActivityEntry[], hasRoutes: Map<string, boolean>, nowMs?: number): RowState[] {
  var out: RowState[] = [];
  var seeds: { key: string; mtime: number }[] = [];
  var i: number;
  for (i = 0; i < rowTexts.length; i++) {
    var m0 = matchRowEntry(rowTexts[i], bots, entries);
    if (m0.via === 'none') continue;
    var key0 = m0.via === 'bot' ? ('w:' + m0.ws) : ('d:' + String(m0.entry && m0.entry.dir));
    var t0 = m0.entry ? m0.entry.lastActive : 0;
    if (t0 > 0) seeds.push({ key: key0, mtime: t0 });
    var e0 = (m0.entry && m0.entry.top) ? m0.entry.top : [];
    for (var s0 = 0; s0 < e0.length; s0++) seeds.push({ key: key0 + '/' + e0[s0].name, mtime: e0[s0].mtime });
  }
  seedSessionSeen(seeds);
  for (i = 0; i < rowTexts.length; i++) {
    var m = matchRowEntry(rowTexts[i], bots, entries);
    if (m.via === 'none') { out.push({ key: 'row:' + rowTexts[i], ws: '', act: 'sink', dir: '', time: 0, via: 'none', top: [] }); continue; }
    var key = m.via === 'bot' ? ('w:' + m.ws) : ('d:' + String(m.entry && m.entry.dir));
    var t = m.entry ? m.entry.lastActive : 0;
    var etop: SessTop[] = (m.entry && m.entry.top) ? m.entry.top : [];
    if (!m.entry || t <= 0) { out.push({ key: key, ws: m.ws, act: 'sink', dir: '', time: 0, via: m.via, top: etop }); continue; }
    var act: ActKind = 'calm';
    if (m.entry.running) act = 'exec';
    else {
      var anyNew = peekSession(key, t);
      if (!anyNew) {
        for (var s = 0; s < etop.length; s++) {
          if (peekSession(key + '/' + etop[s].name, etop[s].mtime)) { anyNew = true; break; }
        }
      }
      act = anyNew ? 'seen' : 'calm';
    }
    var dir = '';
    if (act === 'exec' || act === 'seen') dir = m.via === 'bot' ? (hasRoutes.get(m.ws) ? '混合' : '普通') : '普通';
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
