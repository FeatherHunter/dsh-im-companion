import { markSessionViewed, trackSession, type RowState } from '../../client/data/activity';
/* 例外引用（§10 通道，理由见提审）：design-preview 为 TEMP 原型（定稿即删），复用 truth-flags
 * 纯逻辑（无 DOM/状态），T5 定稿时 flags 收敛进共享层后改道。禁反向、禁状态共享。 */
import { flagsForSession } from '../truth-flags/flags';
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
var dotCache = new Map<Element, { v: boolean; t: number }>();
var amberCache = new Map<Element, { v: boolean; t: number }>();
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
/** 系统琥珀点（#45 黄系统优先：行上已现系统黄点时无条件采系统）：与绿点同槽，判据为琥珀色小圆点（done 绿之外的 warning 色）。与 hasNativeDot 互斥（绿要 gg 显著大于 rr，琥珀要 rr 显著大于 bb 且 gg 居中）。 */
export function hasNativeAmber(el: Element): boolean {
  try {
    var now = Date.now();
    var hit = amberCache.get(el);
    if (hit && now - hit.t < 5000) return hit.v;
    var found = scanAmber(el);
    if (amberCache.size > 500) amberCache.clear();
    amberCache.set(el, { v: found, t: now });
    return found;
  } catch (e) { return false; }
}
function scanAmber(root: Element): boolean {
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
      if (!(rr > 140 && gg > 80 && bb < 140 && (rr - bb) > 60 && (gg - bb) > 30)) continue;
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
      /* 黄双路径二（冻结合约）：原生绿点行不依赖组态——组 calm 亦提待看；远古完成靠播种水位（生而可见）自然回落。 */
      if (rows.length) {
        for (var dr = 0; dr < rows.length; dr++) {
          var hasDot0 = false;
          try { hasDot0 = hasNativeDot(rows[dr]); } catch (e) { hasDot0 = false; }
          if (hasDot0) {
            setA(rows[dr], 'data-dp-sess', 'seen');
            setA(rows[dr], 'data-dp-tip', '待看 · 原生未读');
          }
        }
      }
      if (!st || (st.act !== 'exec' && st.act !== 'seen') || !st.top || !st.top.length) continue;
      if (!rows.length) continue;
      if (!attrProbe) probeAttrs(rows[0]);
      var taken: string[] = [];
      for (var r = 0; r < rows.length; r++) {
        /* 系统优先（#45 黄双路径一）：行上已有系统琥珀点 → 必黄，不再自算。 */
        var hasAmber = false;
        try { hasAmber = hasNativeAmber(rows[r]); } catch (e) { hasAmber = false; }
        if (hasAmber) {
          setA(rows[r], 'data-dp-sess', 'seen');
          setA(rows[r], 'data-dp-tip', '待看 · 系统黄');
          continue;
        }
        var hasDot = false;
        try { hasDot = hasNativeDot(rows[r]); } catch (e) { hasDot = false; }
        if (hasDot) {
          setA(rows[r], 'data-dp-sess', 'seen');
          setA(rows[r], 'data-dp-tip', '待看 · 原生未读');
          continue;
        }
        /* 行归属 join（时间作废令）：行文本对会话标题归一匹配，不用时间窗；无标题真相即无色（诚实未知）。
         * 颜色唯一判据 truth-flags：蓝=执行中（闪烁）、红=异常需处理（闪烁）、黄=待看/待确认选择。
         * P1废：approval-pending 永不判红，只判黄（等你选择）。 */
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
      /* 组行升级（只升不降）：组内任一会话红→组红（need 红闪），任一蓝→组蓝，任一黄→组黄。 */
      try {
        var gHasRed = false; var gHasBlue = false; var gHasYellow = false;
        for (var u = 0; u < rows.length; u++) {
          var sv = getA(rows[u], 'data-dp-sess');
          if (sv === 'red') gHasRed = true;
          else if (sv === 'exec') gHasBlue = true;
          else if (sv === 'seen' || sv === 'done') gHasYellow = true;
        }
        var gcur = getA(groups[i], 'data-dp-act');
        if (gHasRed && gcur !== 'need') { setA(groups[i], 'data-dp-act', 'need'); setA(groups[i], 'data-dp-tip', SESS_LABEL['red']); }
        else if (gHasBlue && gcur !== 'need' && gcur !== 'exec') { setA(groups[i], 'data-dp-act', 'exec'); setA(groups[i], 'data-dp-tip', SESS_LABEL['exec']); }
        else if (gHasYellow && (gcur === '' || gcur === 'nosig' || gcur === 'nosig0')) { setA(groups[i], 'data-dp-act', 'seen'); setA(groups[i], 'data-dp-tip', SESS_LABEL['seen']); }
      } catch (e) { /* 组升级失败不影响行 */ }
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
