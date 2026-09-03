/** welcome-banner 锚点层（DOM 发现，可 node 直测）：hero 空态三信号确认 + 工作区 chip 读取。
 * 与 view.ts 的渲染/挂载分离，纯粹为了 300 行红线；逻辑归属仍是 welcome-banner 自包含目录。 */
export const PHASE_SELECTOR = "[data-phase=\"hero\"]";
const HEADLINES = ["探索未至之境", "Into the Unknown"];
const PREVIEW_BADGES = ["预览版", "Preview"];
const WS_PICKER_LABELS = ["选择工作区", "Choose workspace"];

export function textOf(node: unknown): string {
  try {
    const t = (node as { textContent?: unknown } | null)?.textContent;
    return typeof t === "string" ? t : "";
  } catch {
    return "";
  }
}

/** hero 确认：phase 必须为 hero 且标题+徽标双信号齐全（防把普通会话误判为空态）。 */
export function heroConfirmed(phase: string | null, text: string): boolean {
  if (phase !== "hero") return false;
  const hasTitle = HEADLINES.some((s) => text.indexOf(s) >= 0);
  const hasBadge = PREVIEW_BADGES.some((s) => text.indexOf(s) >= 0);
  return hasTitle && hasBadge;
}

/** hero 内工作区 chip 文本（aria-label 双语兜底；取不到回空串）。 */
export function heroWorkspaceLabel(heroRoot: unknown): string {
  try {
    const root = heroRoot as {
      querySelector?: (s: string) => { textContent?: unknown } | null;
    } | null;
    if (!root || typeof root.querySelector !== "function") return "";
    for (const aria of WS_PICKER_LABELS) {
      const btn = root.querySelector('button[aria-label="' + aria + '"]');
      const t = btn && typeof btn.textContent === "string" ? btn.textContent.trim() : "";
      if (t) return t;
    }
    return "";
  } catch {
    return "";
  }
}

export function phaseAttr(node: unknown): string | null {
  try {
    const el = node as { closest?: (s: string) => unknown } | null;
    const root = el && typeof el.closest === "function"
      ? (el.closest("[data-phase]") as { getAttribute?: (k: string) => unknown } | null)
      : null;
    const v = root && typeof root.getAttribute === "function" ? root.getAttribute("data-phase") : null;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export function eachHero(doc: unknown, fn: (root: unknown) => void): void {
  try {
    const d = doc as { querySelectorAll?: (s: string) => unknown } | null;
    if (!d || typeof d.querySelectorAll !== "function") return;
    const list = d.querySelectorAll(PHASE_SELECTOR) as unknown;
    const arr: unknown[] = Array.isArray(list)
      ? list
      : typeof (list as { length?: unknown })?.length === "number"
        ? Array.prototype.slice.call(list)
        : [];
    for (const root of arr) {
      try { fn(root); } catch { /* 单节点异常跳过 */ }
    }
  } catch { /* 无 DOM 即静态 */ }
}
