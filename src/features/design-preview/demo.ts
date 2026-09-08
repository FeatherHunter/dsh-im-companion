/** TEMP 真实活性演示（定稿即删）：activity.snapshot 真数据 + 合成排序真排 + 真状态徽饰。 */
/* 时间=会话文件最大 mtime（文件级近似）；方向=粗分；需干预/会话级无真信号，保持缺席。 */
import { deriveRowStates, fetchActivity, fetchRoutesSafe, routesOf, type RowState } from '../../client/data/activity';
import { isLineageNode } from '../../client/dom';
import { clearSessionMarks, markSessions, sessionAttrProbe } from './sessions';
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
  try { document.querySelectorAll(ROW_SEL).forEach(function (n) { if (!isLineageNode(n)) out.push(n); }); } catch (e) { /* 空 */ }
  return out;
}
/* blockOf 已删（暴力重排否决，连带移除）。 */
function tipFor(st: RowState, rank: number, total: number): string {
  void rank;
  void total;
  var label = ACT_LABEL[st.act] || st.act;
  return label;
}
function paint(groups: Element[], states: RowState[]): void {
  try {
    for (var j = 0; j < groups.length; j++) {
      var row = groups[j] as HTMLElement;
      var st = states[j];
      /* dot 兜底已删（2026-09-07 水位退役+R1 证伪）：组行无原生点，readNativeState 恒空；
       * "原生未读"提示基于已删水位/旧前提。组色终态由 markSessions 行聚合/折叠缓存决定，
       * paint 只做 entry 级初稿与诊断（nosig/nosig0/pristine 净）。 */
      if (!st || st.via === 'none') {
        var lb = false;
        try { lb = (groups[j] as Element).hasAttribute('data-lb-kind'); } catch (e) { lb = false; }
        if (lb) {
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
        continue;
      }
      if (st.act === 'sink') {
        setAttr(row, 'data-dp-act', 'nosig0');
        setAttr(row, 'data-dp-tip', '诊断：已匹配 ' + (st.ws || st.key) + '，但无会话数据（端点空或目录未命中）');
        continue;
      }
      setAttr(row, 'data-dp-act', st.act);
      setAttr(row, 'data-dp-tip', tipFor(st, 0, states.length));
    }
  } catch (e) { /* 绘制失败下次 */ }
}
/* reorder 已拔（暴力重排否决，只高亮不搬 DOM，见 #45）。bubble 已删（2026-09-07 用户裁定：悬浮状态词污染视觉）。 */
var moving = false;
export function mountDesignPreview(ctx: FeatureCtx): () => void {
  var noop = function (): void {};
  if (typeof document === 'undefined') return noop;
  try { console.info('[dsh-im-companion] 真实活性演示（临时，定稿即删）：已挂载，等 stream 首轮快照'); } catch (e) { /* 静默 */ }
  var bots: BotSnap[] = [];
  var hasSnap = false;
  var fetching = false;
  var fetchStartedAt = 0;
  var lastGood = 0;
  var disposed = false;
  var refresh = function (): void {
    /* 门禁（#45 用户裁定：竖条体系扩全工作区，无助理行方向恒普通照显）：只看快照与取数态，不看 bots 非空；bots 为空时方向细分自然回落普通（见 deriveRowStates）。 */
    /* 防冻住：rpc 悬挂不回时 fetching 永真会杀死之后一切重绘——超 10s 强制复位 + 本轮 8s 竞速。 */
    try { if (fetching && Date.now() - fetchStartedAt > 10000) fetching = false; } catch (e) { fetching = false; }
    if (disposed || !hasSnap || fetching) return;
    fetching = true;
    try { fetchStartedAt = Date.now(); } catch (e) { /* 忽略 */ }
    var rpc = ctx.rpc;
    var raced: Promise<unknown[]> = Promise.race([Promise.all([fetchActivity(rpc), fetchRoutesSafe(rpc, bots)]), new Promise<unknown[]>(function (_, reject) {
      setTimeout(function () { reject(new Error('dp-timeout')); }, 8000);
    })]);
    raced.then(function (res) {
      var arr = res as unknown[];
      var entries = arr[0] as import('../../client/data/activity').ActivityEntry[];
      var routes = arr[1] as import('../../client/data/fleet-api').RouteRow[];
      if (disposed) return;
      try {
        if (!entries.length && lastGood > 0) { fetching = false; return; }
        lastGood = entries.length;
        var hasRoutes = routesOf(bots, routes);
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
  /* 悬浮气泡已删（2026-09-07 用户裁定："待看/执行中/异常需处理"提示污染视觉，与竖条重复）。
   * data-dp-tip 属性保留（devtools 诊断用），不再渲染可见文字。onKey 保留（5s 兜底刷新节拍）。 */
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
    document.addEventListener('keydown', onKey, true);
  } catch (e) { /* 监听失败就无兜底刷新 */ }
  /* 视觉对照器已删（2026-09-07 固化：组行竖条+会话行标题色，V3/V4/V5/V6 淘汰，面板使命完成）。 */
  return function (): void {
    disposed = true;
    try { if (unsub) unsub(); } catch (e) { /* 忽略 */ }
    try { if (observer) observer.disconnect(); } catch (e) { /* 忽略 */ }
    try { document.removeEventListener('keydown', onKey, true); } catch (e) { /* 忽略 */ }
    try { clearSessionMarks(); } catch (e) { /* 忽略 */ }
    try {
      document.querySelectorAll('[data-dp-act]').forEach(function (n) {
        try { n.removeAttribute('data-dp-act'); n.removeAttribute('data-dp-tip'); n.removeAttribute('data-dp-n'); } catch (e) { /* 忽略 */ }
      });
    } catch (e) { /* 忽略 */ }
  };
}
