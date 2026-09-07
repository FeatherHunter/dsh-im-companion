import { fmtTime, markSessionViewed, trackSession, type RowState } from '../../client/data/activity';
import { SESSION_VIEWED_EVENT } from '../../client/data/header-overlay';
var LN = String.fromCharCode(10);
var RUN_WIN = 30000;
var FRESH_MS = 24 * 3600 * 1000;
var attrProbe = '';
export function sessionAttrProbe(): string { return attrProbe; }
var SESS_LABEL: Record<string, string> = { exec: '执行中', seen: '待看', done: '刚执行完待看' };
function textOf(el: Element): string {
  try { return typeof el.textContent === 'string' ? el.textContent : ''; } catch (e) { return ''; }
}
function setA(el: Element, k: string, v: string): void {
  try { if (el.getAttribute(k) !== v) el.setAttribute(k, v); } catch (e) { /* 忽略 */ }
}
function delA(el: Element, k: string): void {
  try { if (el.hasAttribute(k)) el.removeAttribute(k); } catch (e) { /* 忽略 */ }
}
function parseWindow(text: string, nowMs: number): [number, number] | null {
  try {
    var m = /(\d+)\s*分钟/.exec(text);
    if (m) { var n = parseInt(m[1], 10); if (isFinite(n)) return [nowMs - (n + 2) * 60000, nowMs]; }
    m = /(\d+)\s*小时/.exec(text);
    if (m) { var h = parseInt(m[1], 10); if (isFinite(h)) return [nowMs - (h + 2) * 3600000, nowMs]; }
    m = /(\d+)\s*天/.exec(text);
    if (m) { var d = parseInt(m[1], 10); if (isFinite(d)) return [nowMs - (d + 1) * 86400000, nowMs]; }
    if (text.indexOf('刚刚') !== -1) return [nowMs - 120000, nowMs];
  } catch (e) { /* 忽略 */ }
  return null;
}
function sessionsOf(groups: Element[]): Map<Element, Element[]> {
  var map = new Map<Element, Element[]>();
  try {
    var order: Element[] = [];
    document.querySelectorAll('div[role="treeitem"]').forEach(function (n) { order.push(n); });
    var idx = new Map<Element, number>();
    for (var i = 0; i < groups.length; i++) idx.set(groups[i], i);
    var cur = -1;
    for (var j = 0; j < order.length; j++) {
      var el = order[j];
      if (el.getAttribute('aria-expanded') !== null) {
        cur = idx.has(el) ? (idx.get(el) as number) : -1;
        continue;
      }
      if (cur < 0) continue;
      var arr = map.get(groups[cur]);
      if (!arr) { arr = []; map.set(groups[cur], arr); }
      arr.push(el);
    }
  } catch (e) { /* 忽略 */ }
  return map;
}
function probeAttrs(row: Element): void {
  try {
    var parts: string[] = [];
    var atts = row.attributes;
    for (var a = 0; a < atts.length && parts.length < 12; a++) {
      var an = atts[a].name;
      if (an === 'data-dp-sess' || an === 'data-dp-tip') continue;
      var av = atts[a].value || '';
      if (an.indexOf('data-') === 0 || an.indexOf('aria-') === 0 || an === 'id' || an === 'role') parts.push(an + '=' + av.slice(0, 24));
      else parts.push(an);
    }
    attrProbe = '行属性探针 | ' + parts.join(' ');
  } catch (e) { attrProbe = '行属性探针取失败'; }
}
var dotCache = new Map<Element, { v: boolean; t: number }>();
export function hasNativeDot(el: Element): boolean {
  try {
    var now = Date.now();
    var hit = dotCache.get(el);
    if (hit && now - hit.t < 5000) return hit.v;
    var found = scanDots(el);
    if (dotCache.size > 500) dotCache.clear();
    dotCache.set(el, { v: found, t: now });
    return found;
  } catch (e) { return false; }
}
function scanDots(root: Element): boolean {
  try {
    var rleft = 0;
    try { rleft = (root as HTMLElement).getBoundingClientRect().left; } catch (e) { return false; }
    var list = root.querySelectorAll('*');
    if (list.length > 80) return false;
    for (var i = 0; i < list.length; i++) {
      var nd = list[i];
      var cls = '';
      try { cls = nd.getAttribute('class') || ''; } catch (e) { continue; }
      if (cls.indexOf('dp-bubble') !== -1) continue;
      var cs: CSSStyleDeclaration | null = null;
      try { cs = getComputedStyle(nd); } catch (e) { continue; }
      if (!cs) continue;
      var m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.backgroundColor || '');
      if (!m) continue;
      var rr = parseInt(m[1], 10); var gg = parseInt(m[2], 10); var bb = parseInt(m[3], 10);
      if (!(gg > 100 && gg > rr + 30 && gg > bb + 30)) continue;
      var w = 0; var h = 0; var l = 0;
      try { var rc = (nd as HTMLElement).getBoundingClientRect(); w = rc.width; h = rc.height; l = rc.left; } catch (e) { continue; }
      if (w <= 0 || w > 14 || h <= 0 || h > 14) continue;
      if (l - rleft > 140) continue;
      var br = cs.borderRadius || '';
      if (br.indexOf('%') === -1 && parseFloat(br) < 4) continue;
      return true;
    }
  } catch (e) { /* 忽略 */ }
  return false;
}
var viewedHooked = false;
function hookViewed(): void {
  if (viewedHooked) return;
  viewedHooked = true;
  try {
    window.addEventListener(SESSION_VIEWED_EVENT, function (ev: Event): void {
      try {
        var d = (ev as CustomEvent).detail as { sessionId?: unknown } | null;
        var sid = d && typeof d.sessionId === 'string' ? d.sessionId : '';
        if (sid) markSessionViewed(sid);
      } catch (e) { /* 忽略 */ }
    });
  } catch (e) { /* 忽略 */ }
}
export function markSessions(groups: Element[], states: RowState[]): void {
  hookViewed();
  var nowMs = Date.now();
  try {
    document.querySelectorAll('[data-dp-sess]').forEach(function (n) {
      try { delA(n, 'data-dp-sess'); delA(n, 'data-dp-tip'); } catch (e) { /* 忽略 */ }
    });
  } catch (e) { /* 忽略 */ }
  try {
    var sessMap = sessionsOf(groups);
    for (var i = 0; i < groups.length; i++) {
      var st = states[i];
      if (!st || (st.act !== 'exec' && st.act !== 'seen') || !st.top || !st.top.length) continue;
      var rows = sessMap.get(groups[i]) || [];
      if (!rows.length) continue;
      var freshCut = nowMs - FRESH_MS;
      var stFresh = 0;
      for (var fi = 0; fi < st.top.length; fi++) { if (st.top[fi].mtime > stFresh) stFresh = st.top[fi].mtime; }
      if (!attrProbe) probeAttrs(rows[0]);
      var taken: string[] = [];
      for (var r = 0; r < rows.length; r++) {
        var hasDot = false;
        try { hasDot = hasNativeDot(rows[r]); } catch (e) { hasDot = false; }
        if (hasDot && stFresh >= freshCut) {
          setA(rows[r], 'data-dp-sess', 'seen');
          setA(rows[r], 'data-dp-tip', '待看 · 原生未读');
          continue;
        }
        var w = parseWindow(textOf(rows[r]), nowMs);
        if (!w) continue;
        var rtext = textOf(rows[r]);
        var center = 0;
        var agem = /(\d+)\s*分钟/.exec(rtext);
        if (agem) center = nowMs - parseInt(agem[1], 10) * 60000;
        else {
          var ageh = /(\d+)\s*小时/.exec(rtext);
          if (ageh) center = nowMs - parseInt(ageh[1], 10) * 3600000;
          else {
            var aged = /(\d+)\s*天/.exec(rtext);
            if (aged) center = nowMs - parseInt(aged[1], 10) * 86400000;
            else if (rtext.indexOf('刚刚') !== -1) center = nowMs;
          }
        }
        if (!center) continue;
        var tol1 = Math.min(3 * 3600000, Math.max(120000, (nowMs - center) * 0.25));
        var tol2 = Math.max(300000, (nowMs - center) * 0.1);
        var hit: { key: string; mtime: number; running: boolean; done: boolean } | null = null;
        for (var c = 0; c < st.top.length; c++) {
          var t = st.top[c];
          if (t.mtime < freshCut) continue;
          var key = st.key + '/' + t.name;
          var running = t.mtime > 0 && nowMs - t.mtime < RUN_WIN;
          var tr = trackSession(key, t.mtime, running);
          var isNew = tr.isNew;
          if (!running && !isNew) continue;
          var done = tr.justFinished;
          if (taken.indexOf(key) !== -1) continue;
          if (t.mtime >= w[0] && t.mtime <= w[1] && t.mtime >= center - tol1 && t.mtime <= center + tol2) { hit = { key: key, mtime: t.mtime, running: running, done: done }; break; }
        }
        if (!hit) continue;
        taken.push(hit.key);
        setA(rows[r], 'data-dp-sess', hit.done ? 'done' : (hit.running ? 'exec' : 'seen'));
        var lbl = hit.done ? SESS_LABEL['done'] : (hit.running ? SESS_LABEL['exec'] : SESS_LABEL['seen']);
        var stime = fmtTime(hit.mtime);
        var stip = hit.running ? (lbl + ' - 开始于' + stime) : (stime ? (lbl + ' - ' + stime) : lbl);
        setA(rows[r], 'data-dp-tip', stip);
      }
    }
  } catch (e) { /* 忽略 */ }
}
export function clearSessionMarks(): void {
  try {
    document.querySelectorAll('[data-dp-sess]').forEach(function (n) {
      try { n.removeAttribute('data-dp-sess'); n.removeAttribute('data-dp-tip'); } catch (e) { /* 忽略 */ }
    });
  } catch (e) { /* 忽略 */ }
}
