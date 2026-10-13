/** 绿框身份派生（纯逻辑，无 DOM）：头像色相与字形只能由**不可变 id** ＋ 显式覆盖算出。
 *
 * 为什么不按显示名算：显示名是**可变派生值**（用户改名 / 工作区改名回落都会动）——
 * 名字一动头像就跳色，身份感断裂。色相是身份，不是文案。
 * 为什么是 FNV-1a：32 位、无依赖、短串上分布均匀；色相环仍是原型那 6 个色相（保真，不发明新调色板）。
 * 为什么还要字形：6 色相环装 13 行必然撞色（鸽笼原理）⇒ 字形是第二判别维（拉丁名取前两词首字母）。 */

/** 原型 HUE（proto-studio 头像色相环）。 */
export const HUE = [174, 205, 262, 32, 340, 150]

/** FNV-1a 32 位哈希（稳定、无依赖、纯函数）。 */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 色相：显式头像序号优先（用户选图，T6b），否则按 id 稳定派生 ⇒ 改名不换色。 */
export function hueOf(id: string, avatar: string | null = null): number {
  const i = avatar == null ? -1 : Number.parseInt(avatar, 10) - 1
  if (Number.isInteger(i) && i >= 0 && i < HUE.length) return HUE[i]
  return HUE[hash32(String(id ?? '')) % HUE.length]
}

/** 头像字形：CJK 取首字；拉丁按 -/_/空格/点切词取前两词首字母（dsh-log→DL、dsh-plugin-update→DP）。
 *  O(len)；目的：一屏十几行时靠字形也能分开（色相只有 6 个）。 */
export function initialsOf(name: string): string {
  const s = String(name ?? '').trim()
  if (!s) return '?'
  if (!/^[\x20-\x7e]+$/.test(s)) return Array.from(s)[0] ?? '?'
  const words = s.split(/[-_\s.]+/).filter(Boolean)
  if (words.length >= 2) return ((words[0][0] ?? '') + (words[1][0] ?? '')).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}

/** 头像底色/字色：与主题底色混色（浅色下≈原型 93% 亮度浅彩底，深色下也留得住色相）。 */
export function avatarStyle(id: string, avatar: string | null = null): string {
  const hue = hueOf(id, avatar)
  const bg = `color-mix(in srgb, hsl(${hue} 62% 50%) 28%, var(--hu-panel))`
  const fg = `color-mix(in srgb, hsl(${hue} 66% 44%) 62%, var(--hu-ink))`
  return `background:${bg};color:${fg}`
}
