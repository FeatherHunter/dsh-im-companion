/** TEMP 真实活性演示（定稿即删）：activity.snapshot 真数据 + 合成排序真排 + 真状态徽饰。 */
/* 时间=会话文件最大 mtime（文件级近似）；方向=粗分；需干预/会话级无真信号，保持缺席。 */
import { DOT_FRESH_MS, deriveRowStates, fetchActivity, fetchRoutesSafe, fmtTime, routesOf, type RowState } from '../../client/data/activity';
import { clearSessionMarks, hasNativeDot, markSessions, sessionAttrProbe } from './sessions';
import type { BotSnap } from '../../client/data/fleet-api';
import type { StreamSnapshot } from '../../client/data/connection-stream';
import type { FeatureCtx } from '../protocol';

var ROW_SEL = 'div[role=treeitem][aria-expanded]';
var LN = String.fromCharCode(10);
var serviceProbe = '';
var BUILDV = '20260907-f';
void LN;
void BUILDV;
void serviceProbe;
void sessionAttrProbe;

function setAttr(el: Element, k: string, v: string): void {
  try { if (el.getAttribute(k) !== v) el.setAttribute(k, v); } catch (e) { /* 忽略 */ }
}
function delAttr(el: Element, k: string): void {
  try { if (el.hasAttribute(k)) el.removeAttribute(k); } catch (e) { /* 忽略 */ }
}
var ACT_LABEL: Record<string, string> = { exec: '执行中', seen: '待看', calm: '平静' };


function keyOf(row: Element): string {
  try { return typeof row.textContent === 'string' ? row.textContent.trim() : ''; } catch (e) { return ''; }
}
function collectGroups(): Element[] {
  var out: Element[] = [];
  try { document.querySelectorAll(ROW_SEL).forEach(function (n) { out.push(n); }); } catch (e) { /* 空 */ }
  return out;
}
/* blockOf 已删（暴力重排否决，连带移除）。 */
function tipFor(st: RowState, rank: number, total: number): string {
  void rank;
  void total;
  var t = fmtTime(st.time);
  var label = ACT_LABEL[st.act] || st.act;
  var head = (st.act === 'exec' && t) ? (label + ' - 开始于' + t) : (t ? (label + ' - ' + t) : label);
  return head;
}
function paint(groups: Element[], states: RowState[]): void {
  try {
    for (var j = 0; j < groups.length; j++) {
      var row = groups[j] as HTMLElement;
      var st = states[j];
      var dot = false;
      if (!st || (st.act !== 'exec' && st.act !== 'seen')) { try { dot = hasNativeDot(groups[j]); } catch (e) { dot = false; } }
      if (dot && st && st.act === 'calm' && st.time > 0 && Date.now() - st.time < DOT_FRESH_MS) {
        st = { key: st.key, ws: st.ws, act: 'seen', dir: '', time: st.time, via: st.via, top: st.top };
      }
      if (!st || st.via === 'none') {
        var lb = false;
        try { lb = (groups[j] as Element).hasAttribute('data-lb-kind'); } catch (e) { lb = false; }
        if (dot) {
          setAttr(row, 'data-dp-act', 'seen');
          setAttr(row, 'data-dp-tip', '待看 · 原生未读');
          try {
            var svgD = groups[j].querySelector('svg');
            var hostD = svgD ? svgD.parentElement : null;
            if (hostD) { setAttr(hostD, 'data-dp-icon', '1'); setAttr(hostD, 'data-dp-act', 'seen'); delAttr(hostD, 'data-dp-n'); }
          } catch (eD) { /* 忽略 */ }
        } else if (lb) {
          setAttr(row, 'data-dp-act', 'nosig');
          setAttr(row, 'data-dp-tip', '诊断：行“' + keyOf(groups[j]).slice(0, 20) + '”未匹配到绑定工作区');
        } else {
          delAttr(row, 'data-dp-act');
          delAttr(row, 'data-dp-tip');
        }
        continue;
      }
      if (st.act === 'calm') {
        delAttr(row, 'data-dp-act');
        delAttr(row, 'data-dp-tip');
        try {
          var svg0 = groups[j].querySelector('svg');
          var host0 = svg0 ? svg0.parentElement : null;
          if (host0) { delAttr(host0, 'data-dp-icon'); delAttr(host0, 'data-dp-act'); delAttr(host0, 'data-dp-n'); }
        } catch (e0) { /* 忽略 */ }
        continue;
      }
      if (dot && st.act === 'sink') {
        setAttr(row, 'data-dp-act', 'seen');
        var snt = fmtTime(st.time);
        setAttr(row, 'data-dp-tip', snt ? ('待看 - ' + snt + ' · 原生未读') : '待看 · 原生未读');
        try {
          var svgS = groups[j].querySelector('svg');
          var hostS = svgS ? svgS.parentElement : null;
          if (hostS) { setAttr(hostS, 'data-dp-icon', '1'); setAttr(hostS, 'data-dp-act', 'seen'); delAttr(hostS, 'data-dp-n'); }
        } catch (eS) { /* 忽略 */ }
        continue;
      }
      if (st.act === 'sink') {
        setAttr(row, 'data-dp-act', 'nosig0');
        setAttr(row, 'data-dp-tip', '诊断：已匹配 ' + (st.ws || st.key) + '，但无会话数据（端点空或目录未命中）');
        continue;
      }
      setAttr(row, 'data-dp-act', st.act);
      setAttr(row, 'data-dp-tip', tipFor(st, 0, states.length));
      if (dot) { try { setAttr(row, 'data-dp-tip', ((row as HTMLElement).getAttribute('data-dp-tip') || '') + ' · 原生未读'); } catch (e) { /* 忽略 */ } }
      try {
        var svg = groups[j].querySelector('svg');
        var host = svg ? svg.parentElement : null;
        if (host) {
          if (st.act === 'seen') {
            setAttr(host, 'data-dp-icon', '1');
            setAttr(host, 'data-dp-act', st.act);
          } else {
            delAttr(host, 'data-dp-icon');
            delAttr(host, 'data-dp-act');
          }
          delAttr(host, 'data-dp-n');
        }
      } catch (e2) { /* 无图标只留竖条 */ }
    }
  } catch (e) { /* 绘制失败下次 */ }
}
/* reorder 已拔（暴力重排否决，只高亮不搬 DOM，见 #45）。 */
var bubble: HTMLElement | null = null;
var moving = false;
function hideBubble(): void {
  try { if (bubble) bubble.style.display = 'none'; } catch (e) { /* 忽略 */ }
}
function ensureBubble(): HTMLElement | null {
  try {
    if (bubble) return bubble;
    var div = document.createElement('div');
    div.setAttribute('class', 'dp-bubble');
    document.body.appendChild(div);
    bubble = div as HTMLElement;
    return bubble;
  } catch (e) { return null; }
}
export function mountDesignPreview(ctx: FeatureCtx): () => void {
  var noop = function (): void {};
  if (typeof document === 'undefined') return noop;
  try { console.info('[dsh-im-companion] 真实活性演示（临时，定稿即删）：已挂载，等 stream 首轮快照'); } catch (e) { /* 静默 */ }
  var bots: BotSnap[] = [];
  var hasSnap = false;
  var fetching = false;
  var lastGood = 0;
  var disposed = false;
  var refresh = function (): void {
    /* 门禁（#45 用户裁定：竖条体系扩全工作区，无助理行方向恒普通照显）：只看快照与取数态，不看 bots 非空；bots 为空时方向细分自然回落普通（见 deriveRowStates）。 */
    if (disposed || !hasSnap || fetching) return;
    fetching = true;
    var rpc = ctx.rpc;
    Promise.all([fetchActivity(rpc), fetchRoutesSafe(rpc, bots)]).then(function (res) {
      if (disposed) return;
      try {
        var entries = res[0];
        if (!entries.length && lastGood > 0) { fetching = false; return; }
        lastGood = entries.length;
        var hasRoutes = routesOf(bots, res[1]);
        var groups = collectGroups();
        var texts = groups.map(function (g) { return keyOf(g); });
        var states = deriveRowStates(texts, bots, entries, hasRoutes);
        try {
          var ce = 0; var cs = 0; var cc = 0; var ck = 0;
          for (var q = 0; q < states.length; q++) {
            if (states[q].act === 'exec') ce++;
            else if (states[q].act === 'seen') cs++;
            else if (states[q].act === 'calm') cc++;
            else ck++;
          }
          console.info('[dsh-im-companion] 活性快照：entries=' + entries.length + ' exec=' + ce + ' seen=' + cs + ' calm=' + cc + ' sink=' + ck);
        } catch (e) { /* 计数失败忽略 */ }
        moving = true;
        try {
          paint(groups, states);
          markSessions(groups, states);
        } catch (e) { /* 本轮失败下轮 */ }
        moving = false;
      } catch (e) { /* 本轮失败下轮 */ }
      fetching = false;
    }).catch(function () { fetching = false; });
  };
  var unsub: (() => void) | null = null;
  try {
    unsub = ctx.subscribe(function (snap: StreamSnapshot) {
      bots = snap.bots;
      hasSnap = snap.updatedAt > 0;
      if (hasSnap) refresh();
    });
  } catch (e) { return noop; }
  try {
    var getFn2 = (ctx as unknown as { get?: (n: string) => unknown }).get;
    var svc2 = (typeof getFn2 === 'function' ? getFn2('workspaces') : null) as unknown as Record<string, unknown> | null;
    var bits: string[] = [];
    bits.push('svc:' + (svc2 ? Object.keys(svc2).sort().join(',') : 'none'));
    var lst = (svc2 ? (svc2 as Record<string, unknown>)['list'] : null) as unknown as Record<string, unknown> | null;
    bits.push('list:' + (lst ? Object.keys(lst).sort().join(',') : 'none'));
    var cands = ['move', 'reorder', 'setOrder', 'pin', 'unpin', 'sort', 'arrange', 'moveToTop'];
    var found: string[] = [];
    if (lst) {
      for (var ci = 0; ci < cands.length; ci++) {
        try { if (typeof lst[cands[ci]] === 'function') found.push(cands[ci]); } catch (e) { /* 忽略 */ }
      }
    }
    bits.push('orderAPI:' + (found.length ? found.join(',') : '无'));
    var itemsInfo = '';
    try {
      var snapFn = lst ? lst['getSnapshot'] : undefined;
      if (typeof snapFn === 'function') {
        var snap = (snapFn as () => { items?: Array<Record<string, unknown>> }).call(lst);
        var arr = snap && Array.isArray(snap.items) ? snap.items : [];
        itemsInfo = 'n=' + arr.length + (arr.length > 0 ? ' keys=' + Object.keys(arr[0] as object).sort().join(',') : '');
      } else itemsInfo = 'no-snapshot';
    } catch (e) { itemsInfo = 'snapERR'; }
    bits.push('items:' + itemsInfo);
    serviceProbe = '服务探针 | ' + bits.join(' | ');
  } catch (e) { serviceProbe = ''; }
  var observer: MutationObserver | undefined = undefined;
  try {
    observer = new MutationObserver(function () { if (!moving) refresh(); });
    observer.observe(document.body ? document.body : document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* 无 observer 只靠快照 */ }
  var onMove = function (e: MouseEvent): void {
    try {
      var t = e.target as unknown as { closest?: (s: string) => Element | null } | null;
      var row = t && typeof t.closest === 'function' ? t.closest('div[role=treeitem][data-dp-act],div[role=treeitem][data-dp-sess]') : null;
      if (!row) { hideBubble(); return; }
      var rect = (row as Element).getBoundingClientRect();
      var actNow = (row as Element).getAttribute('data-dp-act') || '';
      var isDiag = actNow === 'nosig' || actNow === 'nosig0';
      var isSessRow = false;
      try { isSessRow = (row as Element).hasAttribute('data-dp-sess'); } catch (e) { isSessRow = false; }
      if (!isDiag && !isSessRow && e.clientX - rect.left > 16) { hideBubble(); return; }
      var tip = (row as Element).getAttribute('data-dp-tip') || '';
      if (!tip) { hideBubble(); return; }
      var b = ensureBubble();
      if (!b) return;
      b.textContent = tip;
      b.style.display = 'block';
      b.style.left = Math.min(window.innerWidth - 270, rect.left + 20) + 'px';
      b.style.top = Math.min(window.innerHeight - 80, e.clientY + 12) + 'px';
    } catch (err) { hideBubble(); }
  };
  var onScroll = function (): void { hideBubble(); };
  var lastKey = 0;
  var onKey = function (): void {
    try {
      var now = Date.now();
      if (now - lastKey < 5000) return;
      lastKey = now;
      refresh();
    } catch (e) { /* 忽略 */ }
  };
  try {
    document.addEventListener('mousemove', onMove, true);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey, true);
  } catch (e) { /* 监听失败就无气泡 */ }
  return function (): void {
    disposed = true;
    try { if (unsub) unsub(); } catch (e) { /* 忽略 */ }
    try { if (observer) observer.disconnect(); } catch (e) { /* 忽略 */ }
    try { document.removeEventListener('mousemove', onMove, true); window.removeEventListener('scroll', onScroll, true); document.removeEventListener('keydown', onKey, true); } catch (e) { /* 忽略 */ }
    hideBubble();
    try { clearSessionMarks(); } catch (e) { /* 忽略 */ }
    try { if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble); bubble = null; } catch (e) { /* 忽略 */ }
    try {
      document.querySelectorAll('[data-dp-act]').forEach(function (n) {
        try { n.removeAttribute('data-dp-act'); n.removeAttribute('data-dp-tip'); n.removeAttribute('data-dp-n'); } catch (e) { /* 忽略 */ }
      });
      document.querySelectorAll('[data-dp-icon]').forEach(function (n) {
        try { n.removeAttribute('data-dp-icon'); } catch (e) { /* 忽略 */ }
      });
    } catch (e) { /* 忽略 */ }
  };
}
