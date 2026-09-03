const fs = require('fs');
// shell check mode: node .scratch/e2-logic-check.cjs --shell-only
if (process.argv.includes('--shell-only')) {
  const blocks = [...html_all().matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
  fs.writeFileSync('.scratch/e2-shell-check.js', blocks.join('\n'));
  console.log('shell blocks=' + blocks.length);
  process.exit(0);
}
function html_all() { return fs.readFileSync('prototypes/e2-adopt/prototype-e2-adopt.html', 'utf8'); }
const html = fs.readFileSync('prototypes/e2-adopt/prototype-e2-adopt.html', 'utf8');
const m = html.match(/<script id="e2-logic">([\s\S]*?)<\/script>/);
if (!m) { console.error('logic block not found'); process.exit(1); }
const api = eval(m[1] + ';({initialState, reduce});');
const initialState = api.initialState, reduce = api.reduce;
const eq = (a, b, msg) => { if (a !== b) { console.error('FAIL ' + msg + ': got ' + a + ' want ' + b); process.exit(1); } console.log('ok ' + msg); };
let s = initialState();
s = reduce(s, {type:'start', bot:'bot-feishu-1'});
s = reduce(s, {type:'over', target:'ws-b'});
s = reduce(s, {type:'drop'});
eq(s.bind['bot-feishu-1'], 'ws-b', 'happy-bind');
eq(!!s.toast, true, 'toast-open');
s = reduce(s, {type:'undo'});
eq(s.bind['bot-feishu-1'], undefined, 'undo-revert');
s = reduce(s, {type:'start', bot:'bot-qq-1'});
s = reduce(s, {type:'over', target:'ws-b'});
s = reduce(s, {type:'drop'});
eq(!!s.confirm, true, 'conflict-confirm');
s = reduce(s, {type:'confirm-yes'});
eq(s.bind['bot-qq-1'], 'ws-b', 'move');
s = reduce(s, {type:'undo'});
eq(s.bind['bot-qq-1'], 'ws-a', 'undo-move');
s = reduce(s, {type:'start', bot:'bot-wechat-1'});
s = reduce(s, {type:'over', target:'empty'});
s = reduce(s, {type:'drop'});
eq(s.bind['bot-wechat-1'], undefined, 'empty-reject');
s = reduce(s, {type:'start', bot:'bot-qq-1'});
s = reduce(s, {type:'over', target:'ws-a'});
s = reduce(s, {type:'drop'});
eq(!!s.confirm, false, 'same-noop');
eq(s.bind['bot-qq-1'], 'ws-a', 'same-kept');
s = reduce(s, {type:'cancel-drag'});
s = reduce(s, {type:'start', bot:'bot-feishu-1'});
s = reduce(s, {type:'over', target:'ws-c'});
s = reduce(s, {type:'drop'});
s = reduce(s, {type:'tick'}); s = reduce(s, {type:'tick'}); s = reduce(s, {type:'tick'});
eq(!!s.toast, false, 'expiry');
s = reduce(s, {type:'undo'});
eq(s.bind['bot-feishu-1'], 'ws-c', 'expiry-no-revert');
console.log('ALL E2 REDUCER CHECKS PASS');
