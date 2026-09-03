/** e2-adopt 样式（命名空间 e2-*；不占用 .af-* 私有约定）。 */
export const CSS = [
  '.e2-pool{margin:8px 0;padding:10px 12px;border:1px dashed rgba(127,127,127,.45);border-radius:12px;background:transparent}',
  '.e2-pool-title{font-size:12px;font-weight:700;opacity:.75;margin-bottom:8px}',
  '.e2-chip{display:inline-block;font-size:12px;font-weight:700;border:1px solid rgba(127,127,127,.5);background:var(--dsw-alias-bg-base,#fff);border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;cursor:grab}',
  '.e2-chip[draggable="false"]{opacity:.45;cursor:default}',
  '.e2-drop-ok{outline:2px solid #1a9e54 !important;outline-offset:-2px}',
  '.e2-drop-warn{outline:2px solid #e6a700 !important;outline-offset:-2px}',
  '.e2-undo{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:80;display:flex;align-items:center;gap:10px;font-size:13px;padding:10px 14px;border-radius:12px;background:#1c1c1e;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.3)}',
  '.e2-undo button{font:inherit;font-size:12.5px;font-weight:700;color:#fff;background:transparent;border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:4px 10px;cursor:pointer}',
  '.e2-confirm{font-size:14px;line-height:1.7;padding:4px 2px}',
  '.e2-confirm-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}',
].join('\n')
