
/* ===== 壳：渲染 + 接线（throwaway，不搬）===== */
'use strict';
var S = initialState();
var STEP_IDX = 0, CURRENT_TAB = 0;

var TABS = [
  { key: 'happy', label: '走查 1 · 正常绑定',
    desc: '起点：bot-feishu-1 未绑定。把它拖到工作区 B，直绑成功 + toast 撤销窗口打开；再让时间流逝到过期，验证“过期后撤销被拒绝”。看点：过期语义是否符合预期。',
    steps: [['start:bot-feishu-1','拿起 bot-feishu-1'], ['over:ws-b','悬停到工作区 B'], ['drop','放下 → 绑定'], ['tick','时间流逝 ×1'], ['tick','时间流逝 ×2'], ['tick','过期 ×3'], ['undo','再点撤销（应被拒绝）']] },
  { key: 'conflict', label: '走查 2 · 冲突换绑+撤销',
    desc: '起点：bot-qq-1 已属工作区 A。把它拖到工作区 B → 弹二次确认 → 确认换绑 → toast 撤销 → 回到 A。看点：最绕的一条链，确认文案与撤销回滚是否对。',
    steps: [['start:bot-qq-1','拿起 bot-qq-1（已属A）'], ['over:ws-b','悬停到工作区 B'], ['drop','放下 → 弹确认'], ['confirm-yes','确认换绑到 B'], ['undo','撤销 → 回到 A']] },
  { key: 'illegal', label: '走查 3 · 非法尝试',
    desc: '三种“应该什么都不发生”的情况：放到空白处、悬停就松手（目标之外）、放回自己所在的工作区。看点：拒绝提示清不清晰，有没有误写。',
    steps: [['start:bot-wechat-1','拿起 bot-wechat-1'], ['over:empty','悬停到空白处'], ['drop','放下（应拒绝）'], ['start:bot-qq-1','拿起 bot-qq-1（已属A）'], ['over:ws-a','悬停回工作区 A'], ['drop','放下（应无操作）']] },
  { key: 'cancel', label: '走查 4 · 取消与反悔',
    desc: '拖到一半取消（Esc），以及冲突确认时点“留在这里”。看点：取消后状态是否干净（无残留 drag / confirm）。',
    steps: [['start:bot-feishu-2','拿起 bot-feishu-2（已属B）'], ['over:ws-c','悬停到工作区 C'], ['cancel-drag','取消拖拽'], ['start:bot-feishu-2','再拿起'], ['over:ws-c','悬停到工作区 C'], ['drop','放下 → 弹确认'], ['confirm-no','点“留在这里”']] },
];

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function occupant(wsId){
  var out = [];
  for (var i = 0; i < BOTS.length; i++) if (S.bind[BOTS[i].id] === wsId) out.push(BOTS[i]);
  return out;
}
function renderState(){
  var el = document.getElementById('state'), h = '';
  h += '<div class="changed">刚才发生了什么：' + esc(S.lastChange) + '</div>';
  if (S.drag) h += '<div class="banner drag">🖐 手里拿着 <b>' + esc(S.drag.botId) + '</b>（' + esc(channelOf(S.drag.botId)) + '）' + (S.drag.over ? '，悬停在：<b>' + esc(S.drag.over === 'empty' ? '空白处' : wsName(S.drag.over)) + '</b>' : '，还没悬停到任何目标') + '</div>';
  if (S.confirm) h += '<div class="banner confirm">⚠️ 二次确认：<b>' + esc(S.confirm.botId) + '</b> 现属' + esc(wsName(S.confirm.from)) + '，换绑到 <b>' + esc(wsName(S.confirm.to)) + '</b>？<div class="btnrow" style="margin-top:8px"><button class="act primary" data-a="confirm-yes">确认换绑</button><button class="act" data-a="confirm-no">留在这里</button></div></div>';
  if (S.toast) h += '<div class="banner toast">✅ 已绑定 <b>' + esc(S.toast.botId) + '</b> → ' + esc(wsName(S.toast.to)) + '（撤销窗口还剩 ' + S.toast.left + ' 步） <div class="btnrow" style="margin-top:8px"><button class="act" data-a="undo">撤销</button><button class="act" data-a="tick">⏳ 时间流逝</button></div></div>';
  h += '<div class="wsgrid">';
  for (var i = 0; i < WS.length; i++){
    var w = WS[i], occ = occupant(w.id), cls = 'ws';
    if (S.drag && S.drag.over === w.id) cls += ((S.bind[S.drag.botId] && S.bind[S.drag.botId] !== w.id) ? ' hover-bad' : ' hover-ok');
    h += '<div class="' + cls + '"><div class="ws-name">' + esc(w.name) + '</div><div class="ws-sub">' + esc(w.id) + '</div><div>';
    if (!occ.length) h += '<div class="ws-sub" style="margin-top:8px">（空）</div>';
    for (var j = 0; j < occ.length; j++) h += '<span class="bot' + (S.drag && S.drag.botId === occ[j].id ? ' dragging' : '') + '">' + esc(occ[j].id) + ' · ' + esc(occ[j].channel) + '</span>';
    h += '</div></div>';
  }
  h += '</div><div class="pool"><div class="ws-sub">未绑定池（Fleet / 待领养）</div><div>';
  var any = false;
  for (var k = 0; k < BOTS.length; k++) if (!S.bind[BOTS[k].id]){ any = true; h += '<span class="bot' + (S.drag && S.drag.botId === BOTS[k].id ? ' dragging' : '') + '">' + esc(BOTS[k].id) + ' · ' + esc(BOTS[k].channel) + '</span>'; }
  if (!any) h += '<div class="ws-sub">（空：全被领养了，点“重置”回到起点）</div>';
  h += '</div><div class="ws-sub" style="margin-top:6px">左侧三块 = 左栏工作区行（唯一可放目标）；本虚线框之外 = 空白处（不可放）。源为抽象 Bot 行，不绑定 C1a/C1b 具体控件（grilling 结论）。</div></div>';
  h += '<div class="log">' + S.log.slice(-8).map(esc).join('<br>') + '</div>';
  el.innerHTML = h;
}
function parseStep(s){
  var i = s.indexOf(':');
  if (i < 0) return { type: s };
  return { type: s.slice(0, i), bot: s.slice(i + 1) === 'empty' || s.slice(i+1).indexOf('ws-') === 0 ? undefined : s.slice(i + 1), raw: s.slice(i + 1) };
}
function fire(spec){
  var p = spec.indexOf(':');
  if (p < 0) { S = reduce(S, { type: spec }); }
  else {
    var t = spec.slice(0, p), v = spec.slice(p + 1);
    if (t === 'start') S = reduce(S, { type: 'start', bot: v });
    else if (t === 'over') S = reduce(S, { type: 'over', target: v === 'null' ? null : v });
    else S = reduce(S, { type: spec });
  }
  sync();
}
function renderFree(){
  var el = document.getElementById('free'), h = '<div class="btnrow">';
  h += '<h4>拿起（拖拽源 = 抽象 Bot 行）</h4>';
  for (var i = 0; i < BOTS.length; i++) h += '<button class="act" data-f="start:' + BOTS[i].id + '">拿起 ' + BOTS[i].id + '</button>';
  h += '<h4>悬停（放置目标判定）</h4>';
  for (var j = 0; j < WS.length; j++) h += '<button class="act" data-f="over:' + WS[j].id + '">悬停 ' + WS[j].id + '</button>';
  h += '<button class="act" data-f="over:empty">悬停空白处</button>';
  h += '<button class="act" data-f="over:null">悬停离开</button>';
  h += '<h4>放下 / 收尾</h4><button class="act primary" data-f="drop">放下（drop）</button><button class="act" data-f="cancel-drag">取消拖拽（Esc）</button><button class="act danger" data-f="reset">重置到起点</button>';
  h += '</div>';
  el.innerHTML = h;
}
function renderTabs(){
  var el = document.getElementById('tabs'), h = '';
  for (var i = 0; i < TABS.length; i++) h += '<button data-t="' + i + '" class="' + (i === CURRENT_TAB ? 'on' : '') + '">' + esc(TABS[i].label) + '</button>';
  el.innerHTML = h;
  document.getElementById('scenario').textContent = TABS[CURRENT_TAB].desc;
  renderSteps();
}
function renderSteps(){
  var el = document.getElementById('steps'), h = '';
  var steps = TABS[CURRENT_TAB].steps;
  for (var i = 0; i < steps.length; i++)
    h += '<button class="act' + (i < STEP_IDX ? ' done' : '') + '" data-s="' + i + '"' + (i !== STEP_IDX ? ' disabled' : '') + '>' + (i + 1) + '. ' + esc(steps[i][1]) + '</button>';
  if (STEP_IDX >= steps.length) h += '<span class="ws-sub">走查完毕：上面的“刚才发生了什么”就是本场景的 verdict；也可继续用自由操作乱点。</span>';
  el.innerHTML = h;
}
function sync(){ renderState(); renderSteps(); }
document.addEventListener('click', function(e){
  var t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.hasAttribute('data-a')) { S = reduce(S, { type: t.getAttribute('data-a') }); sync(); return; }
  if (t.hasAttribute('data-f')) { fire(t.getAttribute('data-f')); return; }
  if (t.hasAttribute('data-t')) { CURRENT_TAB = +t.getAttribute('data-t'); STEP_IDX = 0; S = reduce(S, { type: 'reset' }); renderTabs(); sync(); return; }
  if (t.hasAttribute('data-s')) {
    var i = +t.getAttribute('data-s');
    if (i !== STEP_IDX) return;
    fire(TABS[CURRENT_TAB].steps[i][0]);
    STEP_IDX++;
    renderSteps();
  }
});
document.getElementById('openq').innerHTML =
  '假设：写路径 = <kbd>bot.workspace.set</kbd> 直写，写后广播刷新（沿用单写多读）；撤销窗口演示用 3 步，真实现再定 5s。' +
  '开放问题：D1（#11）反向声明仍在 grilling 中——若工作区侧声明与 Fleet 拖拽冲突如何消解，待 #11 关闭后回炉本状态机。' +
  '源抽象：C1a/C1b 仍在开发中，原型源为抽象 Bot 行，verdict 落在 reducer 上，实现时各控件 dispatch 同一 action 即可。';
renderState(); renderFree(); renderTabs();
