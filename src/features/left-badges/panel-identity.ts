/** left-badges 身份镜像（feature 禁引 A1 私有 components）：家/助理两套图标＋色板、字形、色相派生。
 * 与 components/home-identity.ts 同字面量（verify 钉两套 parity：旧 avatarStyle / 新 avatarStyleFor + 图标路径）；
 * 与 components/home-icons.ts 的 home/bot 字形同字面量（verify 钉 HU_ICON_PATHS parity）。
 * 只读镜像：这里多一个导出也不算共享层改动（feature 自包含，删掉本文件即整块退场）。 */

export type AvatarKind = 'home' | 'assistant'

export const HUE = [174, 205, 262, 32, 340, 150]

export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function hueOf(id: string, avatar: string | null = null): number {
  const i = avatar == null ? -1 : Number.parseInt(avatar, 10) - 1
  if (Number.isInteger(i) && i >= 0 && i < HUE.length) return HUE[i]
  return HUE[hash32(String(id ?? '')) % HUE.length]
}

/** 家 9 档（沉稳）：与 home-identity.PRESETS 同字面量。 */
export const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['#17181C', '#FFFFFF'], ['#4D6BFE', '#FFFFFF'], ['#2F4A44', '#FFFFFF'],
  ['#4E6E8E', '#FFFFFF'], ['#7A3E5A', '#FFFFFF'], ['#C4B49A', '#1B1B1F'],
  ['#B5473A', '#FFFFFF'], ['#7C3AED', '#FFFFFF'], ['#0E8A43', '#FFFFFF'],
]

/** 助理 9 档（暖亮）：与 home-identity.ASST_PRESETS 同字面量。 */
export const ASST_PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['#101418', '#FFD9A0'], ['#0B5A6E', '#C8F4FF'], ['#8A3D00', '#FFD9B0'],
  ['#4A5A10', '#EFFFC0'], ['#5E1060', '#E3B0FF'], ['#F0C8A0', '#3A2410'],
  ['#B01E4E', '#FFC2D4'], ['#2E1B8A', '#C9B0FF'], ['#0E6E35', '#C2FFD6'],
]

export function presetFor(kind: AvatarKind, avatar: string | null): readonly [string, string] | null {
  const i = avatar == null ? -1 : Number.parseInt(avatar, 10) - 1
  const table = kind === 'home' ? PRESETS : ASST_PRESETS
  return Number.isInteger(i) && i >= 0 && i < table.length ? table[i] : null
}

/** 按归属取头像底色/字色：与 home-identity.avatarStyleFor 同口径。 */
export function avatarStyleFor(kind: AvatarKind, id: string, avatar: string | null = null): string {
  const p = presetFor(kind, avatar)
  return p ? `background:${p[0]};color:${p[1]}` : `background:hsl(${hueOf(id, null)} 62% 30%);color:#fff`
}

/** 无上传图时的字形：家＝房子、助理＝小机器人（与 huIcon 的 home/bot 同名）。 */
export function avatarIconFor(kind: AvatarKind): 'home' | 'bot' {
  return kind === 'home' ? 'home' : 'bot'
}

export function initialsOf(name: string): string {
  const s = String(name ?? '').trim()
  if (!s) return '?'
  if (!/^[\x20-\x7e]+$/.test(s)) return Array.from(s)[0] ?? '?'
  const words = s.split(/[-_\s.]+/).filter(Boolean)
  if (words.length >= 2) return ((words[0][0] ?? '') + (words[1][0] ?? '')).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}

export type GlyphName = 'home' | 'bot'

/** home-icons.ts HU_PATHS.home / .bot 的逐字镜像（16x16 视图盒，currentColor）。 */
const GLYPHS: Record<GlyphName, string> = {
  home: '<path d="M2 7.6l6-4.8 6 4.8V14H9.6v-4H6.4v4H2V7.6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  bot: '<rect x="3" y="5.2" width="10" height="7" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6.3" cy="8.6" r="1" fill="currentColor"/><circle cx="9.7" cy="8.6" r="1" fill="currentColor"/><path d="M8 5.2V2.8M5.8 2.8h4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
}

/** 字形整 svg 字符串（paintFace / 机器人行 innerHTML 用；纯字符串，不碰 DOM，可单测）。 */
export function glyphSvg(name: GlyphName, size = 15): string {
  const inner = GLYPHS[name]
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" focusable="false" aria-hidden="true" data-lb-glyph="' + name + '">' + inner + '</svg>'
}

export const GLYPH_PATHS = GLYPHS
