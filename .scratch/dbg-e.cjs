const fs = require('fs');
const html = fs.readFileSync('.scratch/e2-e-xuanzhi.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const src = m[1];
const mkEl = () => ({
  children: [], classList: { add() {}, remove() {} },
  setAttribute() {}, appendChild(c) { this.children.push(c); return c; },
  addEventListener() {}, style: {},
});
global.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  querySelectorAll: () => [],
};
try {
  eval(src + ';render();');
  console.log('RENDER OK');
} catch (e) {
  console.error('THROW: ' + (e && e.stack || e));
}
