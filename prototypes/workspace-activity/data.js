/* T4·workspace-activity 共享 mock + 纯排序模块（抛弃式原型，不进生产）。
 * 设计输入（用户冻结，不可改）：A 全部分类统一排序，时间口径=最后用户发言；
 * 合成 comparator：主键活性（需干预>执行中>待看>平静），次键该活性对应时间，
 * 平静区按最后发言，无交流沉底。B 语义态 6+平静，行上合一（最高优先，多方向标混合），卡里展开。
 * 铁律①：右侧"在线"健康徽标位不动，活性另开通道。S8/S9 待验证，乐观零降级。
 * 纯函数：零 DOM，可整体搬走做单测对照。无持久化，刷新即重置。 */
window.WA = (function () {
  'use strict';
  var PRIO = { need: 0, exec: 1, seen: 2, calm: 3, sink: 4 };
  var ACT = {
    need: { label: '需干预', color: '#d92d20', timeKind: '待看产生/新输出到达' },
    exec: { label: '执行中', color: '#1677ff', timeKind: '执行开始' },
    seen: { label: '待看', color: '#dc6803', timeKind: '新输出到达' },
    calm: { label: '平静', color: '#98a2ad', timeKind: '最后用户发言' },
    hot: { label: '有动态', color: '#7a5af8', timeKind: '最新动态' },
    sink: { label: '沉底', color: '#d0d5dd', timeKind: '—' }
  };
  var DIR = { human: { icon: '👤', label: '普通' }, bot: { icon: '🤖', label: '机器人' } };
  /* 7 个 mock 工作区：覆盖 6 态+平静+未绑定沉底；deploy 为必含混合示例（执行中·普通 + 待看·机器人×3）。t=当日分钟数，yest=昨天。 */
  var WS = [
    { id: 'pay', name: 'payment-bot', cat: '托管·A组', bound: true, health: 'online', lastUser: { t: 700, label: '11:40' },
      states: [{ act: 'need', dir: 'human', n: 1, t: 702, label: '11:42' }], note: '用户追问未回，活性之首' },
    { id: 'doc', name: 'doc-writer', cat: '托管·B组', bound: true, health: 'online', lastUser: { t: 690, label: '11:30' },
      states: [{ act: 'exec', dir: 'bot', n: 1, t: 697, label: '11:37' }], note: '机器人执行中后来居上' },
    { id: 'deploy', name: 'deploy-agent', cat: '托管·A组', bound: true, health: 'online', lastUser: { t: 680, label: '11:20' },
      states: [], note: '混合示例（下行赋值）' },
    { id: 'review', name: 'review-helper', cat: '托管·B组', bound: true, health: 'offline', lastUser: { t: 685, label: '11:25' },
      states: [{ act: 'seen', dir: 'human', n: 2, t: 693, label: '11:33' }], note: '健康离线但有待看：活性≠健康' },
    { id: 'notify', name: 'notify-bot', cat: '托管·A组', bound: true, health: 'online', lastUser: { t: 670, label: '11:10' },
      states: [{ act: 'seen', dir: 'bot', n: 1, t: 688, label: '11:28' }], note: '' },
    { id: 'archive', name: 'archive-old', cat: '托管·B组', bound: true, health: 'online', lastUser: { t: -1, label: '昨天 09:12' },
      states: [], note: '平静：仅健康徽标' },
    { id: 'orphan', name: 'orphan-tmp', cat: '未托管', bound: false, health: 'unbound', lastUser: null,
      states: [], note: '未绑定沉底（筛选与排序正交）' }
  ];
  /* 混合示例完整体：执行中·普通(n=1,11:35) + 待看·机器人(n=3,11:38)。 */
  WS[2].states = [
    { act: 'exec', dir: 'human', n: 1, t: 695, label: '11:35' },
    { act: 'seen', dir: 'bot', n: 3, t: 698, label: '11:38' }
  ];
  function dirOf(entries) {
    var ds = {};
    entries.forEach(function (s) { ds[s.dir] = 1; });
    var keys = Object.keys(ds);
    return keys.length > 1 ? 'mixed' : keys[0];
  }
  function dirTag(dir) {
    if (dir === 'mixed') return '👤🤖混合';
    return DIR[dir].icon + DIR[dir].label;
  }
  /* 行上合一：同行多活性取最高优先级；同活性多方向→混合，n 累加，t 取该活性最新。 */
  function topOf(entries) {
    var best = null;
    entries.forEach(function (s) {
      if (!best || PRIO[s.act] < PRIO[best.act] || (PRIO[s.act] === PRIO[best.act] && s.t > best.t)) best = s;
    });
    var same = entries.filter(function (s) { return s.act === best.act; });
    var n = 0, t = -1;
    same.forEach(function (s) { n += s.n; if (s.t > t) t = s.t; });
    return { act: best.act, dir: dirOf(same), n: n, t: t };
  }
  function rowOf(ws) {
    if (!ws.bound) return { act: 'sink', dir: 'mixed', n: 0, t: -2 };
    if (!ws.states.length) return { act: 'calm', dir: 'mixed', n: 0, t: ws.lastUser ? ws.lastUser.t : -1 };
    return topOf(ws.states);
  }
  function rowTime(ws, row) {
    if (row.act === 'calm' || row.act === 'sink') return ws.lastUser ? ws.lastUser.t : -2;
    return row.t;
  }
  /* 行上视图：act 取最高优先级（topOf），dir 取整行多方向（跨活性也标混合——deploy 即此例），n 取 top 同活性累计。 */
  function rowView(ws, level) {
    if (!ws.bound) return { act: 'sink', dir: 'mixed', n: 0, t: -2 };
    var shown = degrade(ws, level === undefined ? 0 : level);
    if (!shown.length) return { act: 'calm', dir: 'mixed', n: 0, t: 0 };
    var top = topOf(shown);
    top.dir = dirOf(shown);
    return top;
  }
  /* V-s0 纯时间（对照组）：最后用户发言倒序，无交流沉底。 */
  function sortS0(list) {
    return list.slice().sort(function (a, b) {
      var ta = a.lastUser ? a.lastUser.t : -2, tb = b.lastUser ? b.lastUser.t : -2;
      return tb - ta;
    });
  }
  /* V-s1 连续合成排序（默认推荐）：(活性优先级，活性时间) 全局倒序；平静区内按最后发言。 */
  function sortS1(list) {
    return list.slice().sort(function (a, b) {
      var ra = rowOf(a), rb = rowOf(b);
      if (PRIO[ra.act] !== PRIO[rb.act]) return PRIO[ra.act] - PRIO[rb.act];
      return rowTime(b, rb) - rowTime(a, ra);
    });
  }
  /* V-s2 分区排序（备选）：同 S1 全序，切段渲染。返回 [{key,label,items}]。 */
  function sortS2(list) {
    var order = sortS1(list);
    var secs = [
      { key: 'need', label: '🔴 需干预区', items: [] },
      { key: 'exec', label: '🔵 执行中区', items: [] },
      { key: 'seen', label: '🟠 待看区', items: [] },
      { key: 'calm', label: '⚪ 平静区（按最后发言）', items: [] },
      { key: 'sink', label: '⬇ 未绑定沉底', items: [] }
    ];
    order.forEach(function (w) { secs[PRIO[rowOf(w).act]].items.push(w); });
    return secs.filter(function (s) { return s.items.length; });
  }
  /* 降级模拟：L0 六态+平静 → L1 两态（方向折叠，需干预并入执行中）→ L2 单维（有动态/平静）。卡里明细永远保留全量。 */
  function degrade(ws, level) {
    if (level === 0) return ws.states.slice();
    if (level === 1) return ws.states.map(function (s) {
      return { act: s.act === 'need' ? 'exec' : s.act, dir: s.dir, n: s.n, t: s.t, label: s.label, orig: s.act };
    });
    var t = -1, n = 0;
    ws.states.forEach(function (s) { n += s.n; if (s.t > t) t = s.t; });
    return ws.states.length ? [{ act: 'hot', dir: 'mixed', n: n, t: t, label: '', orig: 'mixed' }] : [];
  }
  function healthLabel(h) {
    return h === 'online' ? '●在线' : h === 'offline' ? '○离线' : '未绑定';
  }
  return { PRIO: PRIO, ACT: ACT, DIR: DIR, WS: WS, dirOf: dirOf, dirTag: dirTag,
    topOf: topOf, rowOf: rowOf, rowTime: rowTime, rowView: rowView,
    sortS0: sortS0, sortS1: sortS1, sortS2: sortS2,
    degrade: degrade, healthLabel: healthLabel };
})();
