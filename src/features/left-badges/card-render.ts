/** 悬浮卡渲染（DOM）：家行 + 轻量分隔线 + 行列表（助理行 / 机器人行）+ 检测时间。
 * 数据全来自 card-model（纯函数）；本文件只做结构，不改归属判断。
 * 家行与助理行之间只有一条分隔线（#190 Q2=A 轻量：不加文字标签）。 */
import { HEALTH_LABELS, channelLabel } from '../../client/data/config'
import { paintFace } from './assistant-face'
import { glyphSvg } from './panel-identity'
import type { CardData, CardRow } from './card-model'
import type { HealthKind } from '../../client/data/config'
import { BREATH_BASE_MS, BREATH_SLOT_MS, breathPhase } from './styles'

export const CARD_CLASS = 'left-badges-card'
const HEAD_CLASS = 'left-badges-card-head'
const NAME_CLASS = 'left-badges-card-name'
const SEP_CLASS = 'left-badges-card-sep'
const ROW_CLASS = 'left-badges-card-row'
const GLYPH_CLASS = 'left-badges-card-glyph'
const LABEL_CLASS = 'left-badges-card-label'
const TAG_CLASS = 'left-badges-card-tag'
const DOT_CLASS = 'left-badges-card-dot'
const FOOT_CLASS = 'left-badges-card-foot'
const AVATAR_CLASS = 'left-badges-card-avatar'
export const CARD_CLASSES = { card: CARD_CLASS, head: HEAD_CLASS, name: NAME_CLASS, sep: SEP_CLASS, row: ROW_CLASS, glyph: GLYPH_CLASS, label: LABEL_CLASS, tag: TAG_CLASS, dot: DOT_CLASS, foot: FOOT_CLASS, avatar: AVATAR_CLASS }

function el(tag: string, cls: string, text?: string): HTMLElement | null {
  try {
    if (typeof document === 'undefined') return null
    const d = document.createElement(tag)
    d.setAttribute('class', cls)
    if (typeof text === 'string') d.textContent = text
    return d as unknown as HTMLElement
  } catch {
    return null
  }
}

function ariaOf(row: CardRow): string {
  return [row.channel ? channelLabel(row.channel) : '', row.name, row.tag, row.state ? HEALTH_LABELS[row.state] : '']
    .filter(Boolean).join(' ')
}

function dot(kind: HealthKind): HTMLElement | null {
  return el('span', DOT_CLASS + ' ' + kind)
}

/** 行结构：已绑助理＝渠道 logo + 脸 + 名 + 状态点；未绑定助理＝灰化虚线脸 + 名 + 「未绑定」（无 logo/状态点）；
 * 机器人行＝渠道 logo（未知渠道回落机器人字形）+ 名 + 档位标签 + 状态点（不用助理脸/名）。 */
function paintRow(row: CardRow, seen: Map<string, number>): HTMLElement | null {
  const line = el('div', ROW_CLASS + ' ' + row.kind + (row.unbound ? ' unbound' : '') + (row.role ? ' ' + row.role : ''))
  if (!line) return null
  try { line.setAttribute('aria-label', ariaOf(row)) } catch { /* 忽略 */ }
  if (row.kind === 'assistant') {
    /* 验收反馈①：未绑定助理无渠道 ⇒ 不给渠道 logo，也不拿首字母顶格（保持灰化虚线脸开头）。 */
    if (row.glyph) {
      const gl = el('span', GLYPH_CLASS)
      if (!gl) return null
      try { (gl as unknown as { innerHTML: string }).innerHTML = row.glyph } catch { /* 忽略 */ }
      line.appendChild(gl)
    }
    const face = row.face ? paintFace(row.face) : null
    if (face) {
      try { if (row.unbound) face.setAttribute('class', AVATAR_CLASS + ' dashed') } catch { /* 忽略 */ }
      line.appendChild(face)
    }
  } else {
    const gl = el('span', GLYPH_CLASS + ' robot' + (row.glyph ? ' logo' : ''))
    if (!gl) return null
    try { (gl as unknown as { innerHTML: string }).innerHTML = row.glyph || glyphSvg('bot', 14) } catch { /* 忽略 */ }
    line.appendChild(gl)
  }
  const lab = el('span', LABEL_CLASS, row.name)
  if (!lab) return null
  try { lab.setAttribute('title', row.name) } catch { /* 忽略 */ }
  line.appendChild(lab)
  if (row.tag) {
    const tag = el('span', TAG_CLASS, row.tag)
    if (tag) line.appendChild(tag)
  }
  if (row.state) {
    const d = dot(row.state)
    if (d) {
      try {
        const i = seen.get(row.channel) ?? 0
        seen.set(row.channel, i + 1)
        const ph = breathPhase(row.channel, row.name + '\u0000' + (row.bot || ''), (i * BREATH_SLOT_MS) % BREATH_BASE_MS)
        const st = (d as unknown as { style?: { animationDelay?: string; animationDuration?: string } }).style
        if (st) { st.animationDelay = ph.delay; st.animationDuration = ph.duration }
      } catch { /* 忽略 */ }
      line.appendChild(d)
    }
  }
  return line
}

/** 画整张卡（清空重填）。head 支不起来时返回 false（调用方保持隐藏）。 */
export function renderCard(card: HTMLElement, data: CardData): boolean {
  try {
    if (typeof document === 'undefined' || !card) return false
    const c = card as unknown as { replaceChildren: (...n: unknown[]) => void; appendChild: (n: unknown) => void }
    try { c.replaceChildren() } catch { /* 忽略 */ }
    const head = el('div', HEAD_CLASS)
    const face = paintFace(data.face)
    const name = el('span', NAME_CLASS, data.agent)
    if (!head || !face || !name) return false
    head.appendChild(face)
    head.appendChild(name)
    const parts: HTMLElement[] = [head]
    if (data.rows.length) {
      const sep = el('div', SEP_CLASS)
      if (sep) parts.push(sep)
    }
    const seen = new Map<string, number>()
    for (const row of data.rows) {
      const line = paintRow(row, seen)
      if (line) parts.push(line)
    }
    const foot = el('div', FOOT_CLASS, data.time)
    if (foot) parts.push(foot)
    for (const p of parts) c.appendChild(p)
    return true
  } catch {
    return false
  }
}
