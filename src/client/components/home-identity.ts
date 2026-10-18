/** 绿框身份派生（纯逻辑，无 DOM）：头像色相与字形只能由**不可变 id** ＋ 显式覆盖算出。
 *
 * 为什么不按显示名算：显示名是**可变派生值**（用户改名 / 工作区改名回落都会动）——
 * 名字一动头像就跳色，身份感断裂。色相是身份，不是文案。
 * 为什么是 FNV-1a：32 位、无依赖、短串上分布均匀；色相环仍是原型那 6 个色相（保真，不发明新调色板）。
 * 为什么还要字形：6 色相环装 13 行必然撞色（鸽笼原理）⇒ 字形是第二判别维（拉丁名取前两词首字母）。
 * owner 2026-10-17：预置色从「派生色相 ＋ 与底混色」改成**显式实色表**（含 DeepSeek 蓝白/黑白两档）——
 * 混色版把彩度压到 ~40%、明度压到 ~20%，七格看着像同一格的明暗变化；实色版各档可辨、对比可事先算准。
 * owner 2026-10-18（#152 追修）：9 预置＋照片首格＝10 格 5×2；#1 黑白 #17181C、#2 蓝白 #4D6BFE 不动，
 * 其余 7 格 5 款新莫兰迪（墨绿/深雾蓝/梅子/燕麦/砖红）＋2 款旧锚（紫罗兰/翠绿，保两两距离 ≥60）。 */

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

/** 预置 9 色（avatar "1".."9"）＝实色底＋固定字色：不跟主题混色 ⇒ 任意主题下都鲜明，对比可事先算准。
 *  1 黑白 #17181C；2 蓝白＝DeepSeek 品牌蓝 #4D6BFE；3 墨绿 #2F4A44；4 深雾蓝 #4E6E8E；5 梅子 #7A3E5A；
 *  6 燕麦 #C4B49A（深字）；7 砖红 #B5473A；8 紫罗兰 #7C3AED（旧锚）；9 翠绿 #0E8A43（旧锚）。 */
export const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['#17181C', '#FFFFFF'],
  ['#4D6BFE', '#FFFFFF'],
  ['#2F4A44', '#FFFFFF'],
  ['#4E6E8E', '#FFFFFF'],
  ['#7A3E5A', '#FFFFFF'],
  ['#C4B49A', '#1B1B1F'],
  ['#B5473A', '#FFFFFF'],
  ['#7C3AED', '#FFFFFF'],
  ['#0E8A43', '#FFFFFF'],
]

/** 头像底色/字色：显式预置优先（实色），未选色＝按 id 派生色相（改名不换色，身份稳定）。 */
export function avatarStyle(id: string, avatar: string | null = null): string {
  const i = avatar == null ? -1 : Number.parseInt(avatar, 10) - 1
  const p = Number.isInteger(i) && i >= 0 && i < PRESETS.length ? PRESETS[i] : null
  return p ? `background:${p[0]};color:${p[1]}` : `background:hsl(${hueOf(id, null)} 62% 30%);color:#fff`
}

/** 用户上传图片的铺满画法（T11 #128）：列表行与弹层预览共用，免两处各写一份 CSS 串。 */
export function imageCover(url: string): string {
  return `background-image:url("${url}");background-size:cover;background-position:center`
}
