import { markSessionViewed, trackSession, type RowState } from '../../client/data/activity';
/* 例外引用（§10 通道，理由见提审）：design-preview 为 TEMP 原型（定稿即删），复用 truth-flags
 * 纯逻辑（无 DOM/状态），T5 定稿时 flags 收敛进共享层后改道。禁反向、禁状态共享。 */
import { flagsForSession } from '../truth-flags/flags';
import { readNativeState } from '../truth-flags/dom-state';
import { SESSION_VIEWED_EVENT } from '../../client/data/header-overlay';
var LN = String.fromCharCode(10);
var attrProbe = '';
export function sessionAttrProbe(): string { return attrProbe; }
var SESS_LABEL: Record<string, string> = { exec: '执行中', seen: '待看', done: '刚执行完待看', red: '异常 · 需处理', wait: '待确认 · 等你选择' };
function getA(el: Element, k: string): string {
  try { return el.getAttribute(k) || ''; } catch (e) { return ''; }
}
function textOf(el: Element): string {
  try { return typeof el.textContent === 'string' ? el.textContent : ''; } catch (e) { return ''; }
}
function setA(el: Element, k: string, v: string): void {
  try { if (el.getAttribute(k) !== v) el.setAttribute(k, v); } catch (e) { /* 忽略 */ }
}
function delA(el: Element, k: string): void {
  try { if (el.hasAttribute(k)) el.removeAttribute(k); } catch (e) { /* 忽略 */ }
}
function normRowTitle(s: string): string {
  /* 行文本/会话标题归一：去原生时间尾巴、去省略号、小写。时间只做字符串清洗，不做判据。 */
  try {
    var t = String(s == null ? '' : s).toLowerCase().trim();
    t = t.replace(/(刚刚|\d+\s*(分钟|小时|天))\s*$/, '').trim();
    t = t.replace(/[…\.]+$/, '').trim();
    return t;
  } catch (e) { return ''; }
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
  try {
    document.querySelectorAll('[data-dp-sess]').forEach(function (n) {
      try { delA(n, 'data-dp-sess'); delA(n, 'data-dp-tip'); } catch (e) { /* 忽略 */ }
    });
  } catch (e) { /* 忽略 */ }
  try {
    var sessMap = sessionsOf(groups);
    for (var i = 0; i < groups.length; i++) {
      var st = states[i];
      var rows = sessMap.get(groups[i]) || [];
      if (!rows.length) continue;
      if (!attrProbe) probeAttrs(rows[0]);
      var taken: string[] = [];
      for (var r = 0; r < rows.length; r++) {
        /* 原生语义优先（官方 sessionStatuses 同源）：ongoing=执行中蓝，warning=等你黄。
         * 零标题 join、零像素扫描——这是行级颜色的主路径。 */
        var nstate = '';
        try { nstate = readNativeState(rows[r]); } catch (e) { nstate = ''; }
        if (nstate === 'ongoing') {
          setA(rows[r], 'data-dp-sess', 'exec');
          setA(rows[r], 'data-dp-tip', SESS_LABEL['exec']);
          continue;
        }
        if (nstate === 'warning') {
          setA(rows[r], 'data-dp-sess', 'seen');
          setA(rows[r], 'data-dp-tip', SESS_LABEL['wait']);
          continue;
        }
        /* 真相路径（原生 done/无点时）：红（异常 kind）与收尾/待看仍靠解码+水位+标题 join。
         * P1废：approval-pending 永不判红，只判黄（等你选择）。 */
        if (!st || (st.act !== 'exec' && st.act !== 'seen') || !st.top || !st.top.length) continue;
        var rtext = textOf(rows[r]);
        var rnorm = normRowTitle(rtext);
        var hit: { key: string; flag: string; tip: string } | null = null;
        if (rnorm.length >= 2) {
          for (var c = 0; c < st.top.length; c++) {
            var t = st.top[c];
            var tnorm = normRowTitle(t.title || '');
            if (!tnorm || tnorm.length < 4) continue;
            var titleHit = tnorm === rnorm || (rnorm.length >= 4 && tnorm.indexOf(rnorm) === 0) || (rnorm.indexOf(tnorm) === 0);
            if (!titleHit) continue;
            var key = st.key + '/' + t.name;
            var running = t.open === true;
            var tr = trackSession(key, t.mtime, running);
            var needApproval = t.approval === true;
            if (!running && !tr.isNew && !needApproval) continue;
            if (taken.indexOf(key) !== -1) continue;
            var fg = flagsForSession({ open: running, kind: t.kind || '', approval: needApproval, amber: false, green: false, isNew: tr.isNew, justFinished: tr.justFinished, titleHit: true });
            if (fg.flag === 'none') continue;
            var ftip = fg.flag === 'red' ? SESS_LABEL['red'] : (fg.flag === 'blue' ? SESS_LABEL['exec'] : (fg.flag === 'done' ? SESS_LABEL['done'] : (fg.yellowSrc === 'approval-wait' ? SESS_LABEL['wait'] : SESS_LABEL['seen'])));
            hit = { key: key, flag: fg.flag, tip: ftip };
            break;
          }
        }
        if (!hit) continue;
        taken.push(hit.key);
        setA(rows[r], 'data-dp-sess', hit.flag === 'blue' ? 'exec' : (hit.flag === 'done' ? 'done' : (hit.flag === 'red' ? 'red' : 'seen')));
        setA(rows[r], 'data-dp-tip', hit.tip);
      }
      /* 组色＝会话聚合（不变量：组蓝/黄/红 ⇒ 必有同色会话；展开组恒成立）。
       * 有会话行的组：组色只由本轮行色决定——有同色行则置色，无则清 demo 的 entry 级旧色
       *（未归因的 running/水位信号不得单独染组，否则组色无行可解释）。
       * nosig 系诊断灰，永不动。无会话行的组（收起/映射空）：不动，留 demo 的 entry 级汇总。
       * 角标（svg 宿主 data-dp-icon/act）与组条同生命周期：置色同步、清条同步清——
       * 2026-09-07 截图实锤：paint 先画 seen 角标，组条被聚合清空，角标残留成孤儿橙点。 */
      try {
        var gHasRed = false; var gHasBlue = false; var gHasYellow = false;
        for (var u = 0; u < rows.length; u++) {
          var sv = getA(rows[u], 'data-dp-sess');
          if (sv === 'red') gHasRed = true;
          else if (sv === 'exec') gHasBlue = true;
          else if (sv === 'seen' || sv === 'done') gHasYellow = true;
        }
        var gcur = getA(groups[i], 'data-dp-act');
        var gdot: string | null = null;
        if (gHasRed) { setA(groups[i], 'data-dp-act', 'need'); setA(groups[i], 'data-dp-tip', SESS_LABEL['red']); gdot = 'need'; }
        else if (gHasBlue) { setA(groups[i], 'data-dp-act', 'exec'); setA(groups[i], 'data-dp-tip', SESS_LABEL['exec']); gdot = 'exec'; }
        else if (gHasYellow) { setA(groups[i], 'data-dp-act', 'seen'); setA(groups[i], 'data-dp-tip', SESS_LABEL['seen']); gdot = 'seen'; }
        else if (gcur === 'need' || gcur === 'exec' || gcur === 'seen') {
          delA(groups[i], 'data-dp-act'); delA(groups[i], 'data-dp-tip');
        }
        try {
          var svgG = groups[i].querySelector('svg');
          var hostG = svgG ? svgG.parentElement : null;
          if (hostG) {
            if (gdot) { setA(hostG, 'data-dp-icon', '1'); setA(hostG, 'data-dp-act', gdot); }
            else { delA(hostG, 'data-dp-icon'); delA(hostG, 'data-dp-act'); }
          }
        } catch (e2) { /* 角标同步失败不影响行 */ }
      } catch (e) { /* 组同步失败不影响行 */ }
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
