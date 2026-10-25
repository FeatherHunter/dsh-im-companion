/** 头像视图（家/助理共用）：`avatarEl` 列表与详情同一枚元素（home-avatar.ts 验收①钉死调用点），
 * 预置钮 `avatarOptButton` 与弹层共用同一套字形/色板规则；自有格子位（条带/气泡）调 `paintAvatarFace`，
 * 三者同规则（有图铺图、有 kind 归属图标＋归属色板、无 kind 首字），规则只活这一处；
 * 样式自带独立 id 装配（home-row-styles 同款机制，防 home-ui-styles.ts 300 行破线——契约 §6 只加类、不占 .af-*）。
 * 删掉本文件即整块退场：调用方只剩 import 行需回退（home-rows / home-forms / home-detail / home-assistant-create / home-row-strip / home-row-tip）。 */
import { h } from '../dom'
import { installFeatureStyles } from '../theme'
import { huIcon, type HuIconName } from './home-icons'
import { avatarIconFor, avatarStyle, avatarStyleFor, imageCover, initialsOf, type AvatarKind } from './home-identity'
import { avatarSrc } from './home-avatar'

export const AVATAR_STYLE_ID = 'home-avatar'

export const AVATAR_CSS = `
.home-ui .hu-big .hu-bic img{width:100%;height:100%;object-fit:cover;display:block}
.home-ui .hu-big .hu-bic.off{background:var(--hu-panel-3);color:var(--hu-ink-2)}
.home-ui .hu-big small .hu-logo{display:inline-grid;place-items:center}
.home-ui .hu-big small .hu-logo svg{display:block}
`

/* 幂等装配（首枚头像渲染时调一次就够）：`installFeatureStyles` 按 id 复用同一 <style>，热重载安全。 */
let installed = false
export function ensureAvatarStyles(): void {
  if (installed) return
  installed = true
  installFeatureStyles(AVATAR_STYLE_ID, AVATAR_CSS)
}

/** 头像：色相与字形都由**不可变 id** 派生（改名不换色），字形见 initialsOf。
 *  `id` 与 `name` 分开传：身份来自 id，显示来自 name——两者不许混用。
 *  owner 2026-10-23（原型认可）：传了 `kind` 的家/助理行不再写首字——家＝房子图标、助理＝小机器人图标，
 *  底色走各自色板（avatarStyleFor）；渠道组等没 kind 的调用方照旧（首字＋ avatarStyle，不动）。 */
export function avatarEl(id: string, name: string, avatar: string | null, opts: { round?: boolean; small?: boolean; iconName?: HuIconName; kind?: AvatarKind } = {}): HTMLElement {
  ensureAvatarStyles()
  const cls = `hu-av${opts.round ? ' round' : ''}${opts.small ? ' sm' : ''}`
  if (opts.iconName) {
    const el = h('span', { className: cls, style: 'background:var(--hu-accent-soft);color:var(--hu-accent-deep)' })
    el.appendChild(huIcon(opts.iconName, 15))
    return el
  }
  const el = h('span', { className: cls })
  /* T11 #128：判定单点＝avatarSrc（列表/详情共用 ⇒ 一致是结构保证）；图未到先画回落款。 */
  paintAvatarFace(el, opts.kind, id, name, avatar)
  return el
}

/** 自有格子位（条带 `.hu-cav` / 气泡 `.hu-tav`）：样式与字形与 avatarEl 同一规则，
 *  格子类名与图标尺寸调用方自定（iconPx 默认 15）。
 *  有照片铺图；有 kind 走归属图标＋归属色板；无 kind 照旧首字（渠道组等，不动）。 */
export function paintAvatarFace(el: HTMLElement, kind: AvatarKind | undefined, id: string, name: string, avatar: string | null, iconPx = 15): void {
  /* 不装 AVATAR_CSS：它的规则只覆盖详情 `.hu-big` 位，条带/气泡位不需要；
   * 行/详情走 avatarEl，那边装——T13 #135 只许家行装一次表，这里多装一次就红。 */
  const img = avatarSrc(id, avatar)
  if (img) { el.setAttribute('style', imageCover(img)); return }
  if (kind) {
    el.setAttribute('style', avatarStyleFor(kind, id, avatar))
    el.appendChild(huIcon(avatarIconFor(kind), iconPx))
    return
  }
  el.setAttribute('style', avatarStyle(id, avatar))
  el.textContent = initialsOf(name)
}

/** 预置头像钮（弹层 9 格共用）：字形＝归属图标（avatarIconFor），底色＝归属色板（avatarStyleFor），
 *  `name` 只进无障碍名（`name＋'头像'＋v`），不再进字形；选中态由调用方在 `onPick` 里统一收拢。 */
export function avatarOptButton(kind: AvatarKind, id: string, name: string, v: string, selected: boolean, onPick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
  ensureAvatarStyles()
  const b = h('button', {
    type: 'button', className: 'hu-avopt', 'aria-selected': selected ? 'true' : 'false',
    style: avatarStyleFor(kind, id + v, v), 'aria-label': name + '头像' + v, 'data-avatar': v,
  }, huIcon(avatarIconFor(kind), 20)) as HTMLButtonElement
  b.addEventListener('click', () => onPick(b))
  return b
}
