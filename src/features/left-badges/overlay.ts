/** left-badges 悬浮层：徽标以 body 级 fixed 芯片呈现，绝不进入 React 管理的行内 DOM。
 * （#6 真机教训：行内追加会被列表重渲染吃掉→删补互搏闪烁；独立层天然免疫，只读行几何。） */
import { OPEN_AGENT_EVENT, type LeftBadge } from '../../client/data/bindings'

const LAYER_CLASS = 'left-badges-layer'
const CHIP_CLASS = 'left-badges-badge'
const DOT_CLASS = 'left-badges-dot'
const LABEL_CLASS = 'left-badges-label'

export interface ChipItem {
  row: Element
  badge: LeftBadge
}

let layer: HTMLElement | null = null
const chips = new Map<string, { chip: HTMLElement; row: Element }>()

/* TODO(#6)：OPEN_AGENT_EVENT 的消费者（设置面板 #agent= 高亮联动）在后续票落地；此前事件只发无收。 */
function emitOpenAgent(workspace: string, agent: string): void {
  try {
    if (typeof window === 'undefined' || typeof window.CustomEvent !== 'function') return
    window.dispatchEvent(new window.CustomEvent(OPEN_AGENT_EVENT, { detail: { workspace, agent } }))
  } catch {
    /* 事件派发失败不影响徽标展示 */
  }
}

function vw(): number {
  try {
    return typeof window === 'undefined' ? 0 : window.innerWidth || 0
  } catch {
    return 0
  }
}

function vh(): number {
  try {
    return typeof window === 'undefined' ? 0 : window.innerHeight || 0
  } catch {
    return 0
  }
}

export function ensureLayer(): HTMLElement | null {
  try {
    if (layer) return layer
    if (typeof document === 'undefined') return null
    const el = document.createElement('div')
    el.setAttribute('class', LAYER_CLASS)
    const host = document.body ?? document.documentElement
    if (!host || typeof host.appendChild !== 'function') return null
    host.appendChild(el)
    layer = el as unknown as HTMLElement
    return layer
  } catch {
    return null
  }
}

export function removeLayer(): void {
  try {
    chips.clear()
    if (!layer) return
    const l = layer
    layer = null
    const parent = (l as unknown as { parentNode?: { removeChild?: (c: unknown) => void } }).parentNode
    if (parent && typeof parent.removeChild === 'function') parent.removeChild(l)
  } catch {
    /* 清理失败忽略 */
  }
}

function place(chip: HTMLElement, row: Element): boolean {
  try {
    const r = row.getBoundingClientRect()
    const W = vw()
    const H = vh()
    if (!r || r.width < 60 || r.height <= 0 || r.bottom < 0 || r.right < 0) return false
    if ((W > 0 && r.left > W) || (H > 0 && r.top > H)) return false
    const w = (chip as unknown as { offsetWidth?: number }).offsetWidth || 64
    const h = (chip as unknown as { offsetHeight?: number }).offsetHeight || 18
    const st = (chip as unknown as { style?: { left?: string; top?: string; display?: string } }).style
    if (!st) return true
    st.left = Math.max(0, r.right - 8 - w) + 'px'
    st.top = Math.max(0, r.top + (r.height - h) / 2) + 'px'
    st.display = ''
    return true
  } catch {
    return false
  }
}

function hide(chip: HTMLElement): void {
  try {
    const st = (chip as unknown as { style?: { display?: string } }).style
    if (st) st.display = 'none'
  } catch {
    /* 隐藏失败忽略 */
  }
}

function paintKey(b: LeftBadge): string {
  return b.kind + '|' + b.label + '|' + b.tooltip
}

function makeChip(item: ChipItem): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    const host = document.createElement('span')
    host.setAttribute('class', CHIP_CLASS + ' ' + item.badge.kind)
    host.setAttribute('title', item.badge.tooltip)
    const dot = document.createElement('span')
    dot.setAttribute('class', DOT_CLASS)
    const label = document.createElement('span')
    label.setAttribute('class', LABEL_CLASS)
    label.textContent = item.badge.label
    host.appendChild(dot)
    host.appendChild(label)
    host.addEventListener('click', () => emitOpenAgent(item.badge.workspace, item.badge.agent))
    return host as unknown as HTMLElement
  } catch {
    return null
  }
}

/** 按 workspace 对账芯片：新增/更新/摘除 + 定位；返回可见数。无变化不碰 DOM。 */
export function syncChips(items: ChipItem[]): number {
  try {
    const host = ensureLayer()
    if (!host) return 0
    const seen = new Set<string>()
    let visible = 0
    for (const item of items) {
      try {
        const key = item.badge.workspace
        if (!key || seen.has(key)) continue
        seen.add(key)
        let rec = chips.get(key)
        if (!rec) {
          const chip = makeChip(item)
          if (!chip) continue
          host.appendChild(chip)
          rec = { chip, row: item.row }
          chips.set(key, rec)
        } else {
          rec.row = item.row
        }
        const el = rec.chip as unknown as {
          setAttribute?: (k: string, v: string) => void
          querySelector?: (s: string) => { textContent?: string } | null
        }
        try {
          el.setAttribute?.('class', CHIP_CLASS + ' ' + item.badge.kind)
          el.setAttribute?.('title', item.badge.tooltip)
          const label = el.querySelector?.('.' + LABEL_CLASS)
          if (label) label.textContent = item.badge.label
        } catch {
          /* 更新失败保留旧芯片 */
        }
        if (place(rec.chip, rec.row)) visible++
        else hide(rec.chip)
      } catch {
        /* 单行失败不影响其他行 */
      }
    }
    for (const [key, rec] of [...chips]) {
      if (seen.has(key)) continue
      chips.delete(key)
      try {
        host.removeChild(rec.chip)
      } catch {
        /* 摘除失败忽略 */
      }
    }
    return visible
  } catch {
    return 0
  }
}

/** 滚动/尺寸变化后仅重定位（不重建不改内容）。 */
export function reposition(): void {
  try {
    if (!layer) return
    for (const [, rec] of chips) {
      try {
        if (!place(rec.chip, rec.row)) hide(rec.chip)
      } catch {
        /* 单芯片失败忽略 */
      }
    }
  } catch {
    /* 重定位失败忽略 */
  }
}
