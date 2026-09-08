import { type RowState } from '../../client/data/activity';
/* 例外引用（§10 通道，理由见提审）：design-preview 为 TEMP 原型（定稿即删），复用 truth-flags
 * 纯逻辑（无 DOM/状态），T5 定稿时 flags 收敛进共享层后改道。禁反向、禁状态共享。 */
import { flagsForSession } from '../truth-flags/flags';
import { readNativeState } from '../truth-flags/dom-state';
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
/* B 方案（2026-09-07 用户拍板）：收起组保留最后一次展开的行聚合色。
 * 官方折叠时不渲染会话行 → markSessions 聚合无行可看；demo paint 的组级"数据层色"会覆盖成
 * 平静/黄（截图实锤：展开蓝→收起黄）。缓存组key→聚合色，收起时恢复，组色不再随折叠漂移。
 * 展开组：每轮聚合后写缓存；收起组：读缓存恢复（无缓存=首见，不动）。 */
var groupActCache = new Map<string, string>();
/* 真相判定（2026-09-07 用户裁定：磁盘红>官方黄——绿点行也先查真相，异常才红，无异常真相才兜底黄）。
 * 唯一命中门（2026-09-07 同名串扰修复）：标题 join 候选必须恰好 1 个才生效——
 * 同名/同前缀多候选（如 [草稿][新增BUG] 双胞胎、[#530] 前缀撞车）⇒ 返回 null 不押注（诚实→无色/兜底黄），
 * 宁可漏染不可错染（错染=把 A 会话状态套到 B 行上，正是"两个同名会话都会变色"的根因）。
 * 返回 {key,flag,tip}|null：红=402/aborted/未知收尾，蓝=open，黄=approval；无信号=null（交调用方兜底）。 */
function truthHit(st: RowState, rn: string, taken: string[]): { key: string; flag: string; tip: string } | null {
  var hit: { key: string; flag: string; tip: string } | null = null;
  if (!st || !st.top || !st.top.length) return null;
  if (rn.length < 2) return null;
  var matches: { key: string; t: import('../../client/data/activity').SessTop }[] = [];
  for (var c = 0; c < st.top.length; c++) {
    var t = st.top[c];
    var tnorm = normRowTitle(t.title || '');
    if (!tnorm || tnorm.length < 4) continue;
    var titleHit = tnorm === rn || (rn.length >= 4 && tnorm.indexOf(rn) === 0) || (rn.indexOf(tnorm) === 0);
    if (!titleHit) continue;
    var key = st.key + '/' + t.name;
    if (taken.indexOf(key) !== -1) continue;
    matches.push({ key: key, t: t });
  }
  /* 唯一命中门：0 或 >1 候选都不押注（0=无真相可依；>1=同名串扰风险）。仅恰好 1 个时生效。 */
  if (matches.length !== 1) return null;
  var m = matches[0];
  var running = m.t.open === true;
  var needApproval = m.t.approval === true;
  var fg = flagsForSession({ open: running, kind: m.t.kind || '', approval: needApproval, titleHit: true });
  if (fg.flag === 'none') return null;
  var ftip = fg.flag === 'red' ? SESS_LABEL['red'] : (fg.flag === 'blue' ? SESS_LABEL['exec'] : (fg.yellowSrc === 'approval-wait' ? SESS_LABEL['wait'] : SESS_LABEL['seen']));
  return { key: m.key, flag: fg.flag, tip: ftip };
}

export function markSessions(groups: Element[], states: RowState[]): void {
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
      var gKey = st ? st.key : '';
      /* 收起组（无可见行）：用缓存恢复组条+角标；无缓存（首见收起）不动，留 paint 初稿。 */
      if (!rows.length) {
        if (gKey) {
          var rc = groupActCache.get(gKey);
          if (rc !== undefined) {
            try {
              if (rc) { setA(groups[i], 'data-dp-act', rc); setA(groups[i], 'data-dp-tip', rc === 'need' ? SESS_LABEL['red'] : (rc === 'exec' ? SESS_LABEL['exec'] : SESS_LABEL['seen'])); }
              else { delA(groups[i], 'data-dp-act'); delA(groups[i], 'data-dp-tip'); }
            } catch (e) { /* 恢复失败不影响行 */ }
          }
        }
        continue;
      }
      if (!attrProbe) probeAttrs(rows[0]);
      var taken: string[] = [];
      for (var r = 0; r < rows.length; r++) {
        /* 原生语义优先（官方 sessionStatuses 同源）：ongoing=执行中蓝，warning=等你黄，done=完成提醒绿点黄。
         * 零标题 join、零像素扫描——这是行级颜色的主路径。不看水位：已看由官方绿点自售自清。 */
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
        /* 绿点必黄（#497 真机裁定）：原生 done = 官方完成提醒。但 2026-09-07 用户裁定：磁盘红>官方黄——
         * 绿点行先查真相（窗内解码出 error/aborted/未知收尾 ⇒ 红），无异常真相才兜底黄。
         * 理由：官方完成提醒不区分"成功完成"与"异常收尾"；时间久≠已看（判据禁时间）。 */
        if (nstate === 'done') {
          var rtextD = textOf(rows[r]);
          var rnormD = normRowTitle(rtextD);
          var hitD = truthHit(st, rnormD, taken);
          if (hitD && hitD.flag === 'red') {
            taken.push(hitD.key);
            setA(rows[r], 'data-dp-sess', 'red');
            setA(rows[r], 'data-dp-tip', hitD.tip);
            continue;
          }
          setA(rows[r], 'data-dp-sess', 'seen');
          setA(rows[r], 'data-dp-tip', SESS_LABEL['seen']);
          continue;
        }
        /* 真相路径（原生无点——读失败/挂载错位时补偿）：红（402/aborted/未知收尾）与 approval 黄与 open 蓝。
         * 不做组级 act 门禁（异常即处理，无关组级活性）；不做水位（已退役）。
         * completed 收尾在 flags 为 none——绿点已由主路径处理，此处不重复染黄。 */
        if (!st || !st.top || !st.top.length) continue;
        var rtext = textOf(rows[r]);
        var rnorm = normRowTitle(rtext);
        var hit = truthHit(st, rnorm, taken);
        if (!hit) continue;
        taken.push(hit.key);
        setA(rows[r], 'data-dp-sess', hit.flag === 'blue' ? 'exec' : (hit.flag === 'done' ? 'done' : (hit.flag === 'red' ? 'red' : 'seen')));
        setA(rows[r], 'data-dp-tip', hit.tip);
      }
      /* 组色＝会话聚合（不变量：组蓝/黄/红 ⇒ 必有同色会话；展开组恒成立）。
       * 有会话行的组：组色只由本轮行色决定——有同色行则置色，无则清 demo 的 entry 级旧色
       *（未归因的 running 信号不得单独染组，否则组色无行可解释）。
       * nosig 系诊断灰，永不动。收起组：走上方缓存恢复（B 方案），不依赖可见行。
       * 角标（图标圆点）2026-09-07 已删（用户裁定：与竖条功能重复，无增量信息）。 */
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
        /* 组级优先级 红>黄>蓝（2026-09-07 用户裁定；原红>蓝>黄——有待看的组被蓝行压没，违反"黄=等你看"）。 */
        if (gHasRed) { setA(groups[i], 'data-dp-act', 'need'); setA(groups[i], 'data-dp-tip', SESS_LABEL['red']); gdot = 'need'; }
        else if (gHasYellow) { setA(groups[i], 'data-dp-act', 'seen'); setA(groups[i], 'data-dp-tip', SESS_LABEL['seen']); gdot = 'seen'; }
        else if (gHasBlue) { setA(groups[i], 'data-dp-act', 'exec'); setA(groups[i], 'data-dp-tip', SESS_LABEL['exec']); gdot = 'exec'; }
        else if (gcur === 'need' || gcur === 'exec' || gcur === 'seen') {
          delA(groups[i], 'data-dp-act'); delA(groups[i], 'data-dp-tip');
        }
        if (gKey) groupActCache.set(gKey, gdot || '');
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
