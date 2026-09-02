// Minimal-but-sufficient DOM shim for running ReactDOM client against our client bundle in Node.
// Not a real browser; covers the APIs React 18 touches for simple trees. TypeScript 源码（可擦除语法）。

export class ClassList {
  el: unknown
  _set: Set<string>
  constructor(el: unknown) { this.el = el; this._set = new Set(); }
  add(...cs: string[]) { for (const c of cs) this._set.add(c); }
  remove(...cs: string[]) { for (const c of cs) this._set.delete(c); }
  toggle(c: string) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); }
  contains(c: string) { return this._set.has(c); }
  get value() { return [...this._set].join(' '); }
  toString() { return this.value; }
}

function normalizeChild(c: unknown): unknown {
  if (c == null) return undefined;
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(normalizeChild).filter(Boolean);
  return c;
}

export class El {
  tagName = ''
  nodeName = ''
  nodeType = 1
  ownerDocument: any = null
  parentNode: El | null = null
  childNodes: El[] = []
  _style: Record<string, unknown> = {}
  attributes = new Map<string, string>()
  _listeners = new Map<string, Set<Function>>()
  classList: ClassList
  _value = ''
  _dataset: Record<string, string> = {}
  _textValue: string | null = null

  constructor(tag: string, ownerDocument: any) {
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.ownerDocument = ownerDocument;
    this.classList = new ClassList(this);
  }
  get nodeValue() { return this._textValue; }
  set nodeValue(v: unknown) { this._textValue = v == null ? null : String(v); }
  get childElementCount() { return this.childNodes.filter(n => n.nodeType === 1).length; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling() { if (!this.parentNode) return null; const i = this.parentNode.childNodes.indexOf(this); return this.parentNode.childNodes[i+1] ?? null; }
  get previousSibling() { if (!this.parentNode) return null; const i = this.parentNode.childNodes.indexOf(this); return this.parentNode.childNodes[i-1] ?? null; }
  get textContent() { return this._collectText(); }
  set textContent(v: unknown) {
    this.childNodes = [];
    if (v == null) return;
    const t = this.ownerDocument.createTextNode(String(v));
    t.parentNode = this;
    this.childNodes.push(t);
  }
  get innerHTML() {
    return this.childNodes.map((n) => n.nodeType === 3 ? n.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;') : '<' + n.nodeName.toLowerCase() + '>').join('');
  }
  set innerHTML(v: unknown) {
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
  get dataset() { return this._dataset; }
  _collectText(acc: string[] = []) {
    for (const n of this.childNodes) {
      if (n.nodeType === 3) acc.push(n.textContent);
      else n._collectText?.(acc);
    }
    return acc.join('');
  }
  appendChild(c: unknown) {
    const n = normalizeChild(c);
    if (n === undefined) return c;
    if (typeof n === 'string') { const t = this.ownerDocument.createTextNode(n); return this.appendChild(t); }
    if ((n as El).parentNode) (n as El).parentNode!.removeChild(n as El);
    (n as El).parentNode = this;
    this.childNodes.push(n as El);
    return c;
  }
  append(...cs: unknown[]) { for (const c of cs) this.appendChild(c); }
  replaceChildren(...cs: unknown[]) { this.childNodes = []; for (const c of cs) this.appendChild(c); }
  insertBefore(node: unknown, ref: El | null) {
    const n = normalizeChild(node);
    if (n === undefined) return;
    if (typeof n === 'string') { const t = this.ownerDocument.createTextNode(n); return this.insertBefore(t, ref); }
    if ((n as El).parentNode) (n as El).parentNode!.removeChild(n as El);
    (n as El).parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n as El);
    return n;
  }
  removeChild(c: El) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; }
    return c;
  }
  replaceChild(newChild: unknown, oldChild: El) {
    const i = this.childNodes.indexOf(oldChild);
    if (i >= 0) { this.childNodes.splice(i, 1, newChild as El); (newChild as El).parentNode = this; oldChild.parentNode = null; }
    return oldChild;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get style() { return this._style; }
  set style(v: unknown) { if (typeof v === 'string') { this._style.cssText = v; } else Object.assign(this._style, v as object); }
  setAttribute(k: string, v: unknown) { this.attributes.set(String(k), String(v)); }
  getAttribute(k: string) { return this.attributes.has(String(k)) ? this.attributes.get(String(k))! : null; }
  hasAttribute(k: string) { return this.attributes.has(String(k)); }
  removeAttribute(k: string) { this.attributes.delete(String(k)); }
  addEventListener(t: string, fn: Function) { const key = String(t); if (!this._listeners.has(key)) this._listeners.set(key, new Set()); this._listeners.get(key)!.add(fn); }
  removeEventListener(t: string, fn: Function) { this._listeners.get(String(t))?.delete(fn); }
  dispatchEvent(ev: any) {
    const set = this._listeners.get(ev.type);
    if (set) for (const fn of [...set]) { ev.currentTarget = this; fn.call(this, ev); }
    return true;
  }
  get value() { return this._value; }
  set value(v: unknown) { this._value = String(v ?? ''); }
  get checked() { return this.hasAttribute('checked'); }
  set checked(v: unknown) { if (v) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }
  get className() { return this.classList.toString(); }
  set className(v: unknown) { this.classList = new ClassList(this); if (typeof v === 'string') for (const c of v.split(/\s+/)) if (c) this.classList.add(c); }
  querySelector(sel: string) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      for (const n of this.childNodes) { if (n.nodeType === 1 && n.classList.contains(cls)) return n; const r = n.querySelector?.(sel); if (r) return r; }
    }
    return null;
  }
  querySelectorAll(sel: string) {
    const out: El[] = [];
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const walk = (n: El) => { for (const c of n.childNodes) { if (c.nodeType === 1) { if (cls && c.classList.contains(cls)) out.push(c); walk(c); } } };
    walk(this);
    return out;
  }
  setProperty(k: string, v: unknown) { this._style[k as string] = v; }
  getPropertyValue(k: string) { return this._style[k] ?? ''; }
  contains(n: unknown) { return n === this || this.childNodes.includes(n as El) || this.childNodes.some((c) => c.contains?.(n)); }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
}

export class TextNode extends El {
  constructor(text: string, ownerDocument: any) { super('#text', ownerDocument); this.nodeType = 3; this.nodeName = '#text'; this._textValue = String(text); this.tagName = ''; }
  get textContent() { return this._textValue; }
  set textContent(v: unknown) { this._textValue = String(v ?? ''); }
  _collectText(acc: string[] = []) { acc.push(this._textValue ?? ''); return acc; }
}

export class CommentNode extends El {
  constructor(text: string, ownerDocument: any) { super('#comment', ownerDocument); this.nodeType = 8; this.nodeName = '#comment'; this._textValue = String(text); }
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
  doc.createElement = (tag: string) => new El(tag, doc);
  doc.createTextNode = (t: unknown) => new TextNode(String(t), doc);
  doc.createComment = (t: unknown) => new CommentNode(String(t), doc);
  doc.createElementNS = (_ns: string, tag: string) => new El(tag, doc);
  doc.getElementById = (id: string) => { let found: El | null = null; const walk = (n: El) => { if (found) return; if (n.nodeType === 1 && n.getAttribute('id') === id) { found = n; return; } for (const c of n.childNodes) walk(c); }; walk(doc); return found; };
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  doc.hasFocus = () => false;
  doc.defaultView = null;
  return doc;
}
