// Minimal-but-sufficient DOM shim for running ReactDOM client against our client.js in Node.
// Not a real browser; covers the APIs React 18 touches for simple trees.

export class ClassList {
  constructor(el) { this.el = el; this._set = new Set(); }
  add(...cs) { for (const c of cs) this._set.add(c); }
  remove(...cs) { for (const c of cs) this._set.delete(c); }
  toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); }
  contains(c) { return this._set.has(c); }
  get value() { return [...this._set].join(' '); }
  toString() { return this.value; }
}

function normalizeChild(c) {
  if (c == null) return undefined;
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(normalizeChild).filter(Boolean);
  return c;
}

export class El {
  constructor(tag, ownerDocument) {
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._style = {};
    this.attributes = new Map();
    this._listeners = new Map();
    this.classList = new ClassList(this);
    this._value = '';
  }
  get nodeValue() { return this._textValue ?? null; }
  set nodeValue(v) { this._textValue = v == null ? null : String(v); }
  get childElementCount() { return this.childNodes.filter(n => n.nodeType === 1).length; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling() { if (!this.parentNode) return null; const i = this.parentNode.childNodes.indexOf(this); return this.parentNode.childNodes[i+1] ?? null; }
  get previousSibling() { if (!this.parentNode) return null; const i = this.parentNode.childNodes.indexOf(this); return this.parentNode.childNodes[i-1] ?? null; }
  get textContent() { return this._collectText(); }
  set textContent(v) {
    this.childNodes = [];
    if (v == null) return;
    const t = this.ownerDocument.createTextNode(String(v));
    t.parentNode = this;
    this.childNodes.push(t);
  }
  get innerHTML() {
    return this.childNodes.map((n) => n.nodeType === 3 ? n.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;') : '<' + n.nodeName.toLowerCase() + '>').join('');
  }
  set innerHTML(v) {
    this.childNodes = [];
    if (v == null) return;
    const s = String(v);
    if (s.includes('<')) {
      const text = s.replace(/<[^>]*>/g, '');
      if (text) { const t = this.ownerDocument.createTextNode(text); t.parentNode = this; this.childNodes.push(t); }
    } else if (s.length) {
      const t = this.ownerDocument.createTextNode(s); t.parentNode = this; this.childNodes.push(t);
    }
  }
  _collectText(acc = []) {
    for (const n of this.childNodes) {
      if (n.nodeType === 3) acc.push(n.textContent);
      else n._collectText?.(acc);
    }
    return acc.join('');
  }
  appendChild(c) {
    const n = normalizeChild(c);
    if (n === undefined) return c;
    if (typeof n === 'string') { const t = this.ownerDocument.createTextNode(n); return this.appendChild(t); }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    this.childNodes.push(n);
    return c;
  }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  insertBefore(node, ref) {
    const n = normalizeChild(node);
    if (n === undefined) return;
    if (typeof n === 'string') { const t = this.ownerDocument.createTextNode(n); return this.insertBefore(t, ref); }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n);
    return n;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; }
    return c;
  }
  replaceChild(newChild, oldChild) {
    const i = this.childNodes.indexOf(oldChild);
    if (i >= 0) { this.childNodes.splice(i, 1, newChild); newChild.parentNode = this; oldChild.parentNode = null; }
    return oldChild;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get style() { return this._style; }
  set style(v) { if (typeof v === 'string') { this._style.cssText = v; } else Object.assign(this._style, v); }
  setAttribute(k, v) { this.attributes.set(String(k), String(v)); }
  getAttribute(k) { return this.attributes.has(String(k)) ? this.attributes.get(String(k)) : null; }
  hasAttribute(k) { return this.attributes.has(String(k)); }
  removeAttribute(k) { this.attributes.delete(String(k)); }
  addEventListener(t, fn) { const key = String(t); if (!this._listeners.has(key)) this._listeners.set(key, new Set()); this._listeners.get(key).add(fn); }
  removeEventListener(t, fn) { this._listeners.get(String(t))?.delete(fn); }
  dispatchEvent(ev) {
    const set = this._listeners.get(ev.type);
    if (set) for (const fn of [...set]) { ev.currentTarget = this; fn.call(this, ev); }
    return true;
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v ?? ''); }
  get checked() { return this.hasAttribute('checked'); }
  set checked(v) { if (v) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }
  get className() { return this.classList.toString(); }
  set className(v) { this.classList = new ClassList(this); if (typeof v === 'string') for (const c of v.split(/\s+/)) if (c) this.classList.add(c); }
  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      for (const n of this.childNodes) { if (n.nodeType === 1 && n.classList.contains(cls)) return n; const r = n.querySelector?.(sel); if (r) return r; }
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 1) { if (cls && c.classList.contains(cls)) out.push(c); walk(c); } } };
    walk(this);
    return out;
  }
  setProperty(k, v) { this._style[k] = v; }
  getPropertyValue(k) { return this._style[k] ?? ''; }
  contains(n) { return n === this || this.childNodes.includes(n) || this.childNodes.some((c) => c.contains?.(n)); }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
}

export class TextNode extends El {
  constructor(text, ownerDocument) { super('#text', ownerDocument); this.nodeType = 3; this.nodeName = '#text'; this._textValue = String(text); this.tagName = ''; }
  get textContent() { return this._textValue; }
  set textContent(v) { this._textValue = String(v ?? ''); }
  _collectText(acc = []) { acc.push(this._textValue); return acc; }
}

export class CommentNode extends El {
  constructor(text, ownerDocument) { super('#comment', ownerDocument); this.nodeType = 8; this.nodeName = '#comment'; this._textValue = String(text); }
}

export function createDocument() {
  const doc = new El('#document', null);
  doc.nodeType = 9;
  doc.nodeName = '#document';
  const body = new El('body', doc);
  const head = new El('head', doc);
  doc.body = body; doc.head = head;
  doc.childNodes = [head, body];
  body.parentNode = doc; head.parentNode = doc;
  doc.createElement = (tag) => new El(tag, doc);
  doc.createTextNode = (t) => new TextNode(t, doc);
  doc.createComment = (t) => new CommentNode(t, doc);
  doc.createElementNS = (ns, tag) => new El(tag, doc);
  doc.getElementById = (id) => { let found = null; const walk = (n) => { if (found) return; if (n.nodeType === 1 && n.getAttribute('id') === id) { found = n; return; } for (const c of n.childNodes) walk(c); }; walk(doc); return found; };
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  doc.hasFocus = () => false;
  doc.defaultView = null;
  return doc;
}
