/** T11 #128 头像图片上传格（UI 侧）：家/助理设置弹层里的第 8 格 ＋ 隐藏文件选择器 ＋ 明文拒绝。
 *
 * 交互与既有「恢复默认名」同一套先例：**点了就落**（不排进「确定」的补丁里）——图片要经宿主写文件
 * 才成得了标记，攒到确定再传会造出「弹层里的待传图」与「行里的真图」两套状态；落完由调用方
 * closeHomePop ＋ onDone（home-forms 提供）。
 * 校验三道（越早越省事）：文件 >10 MiB 直接拒（不读进内存）→ >2 MiB 明文拒 → 非 png/jpg/webp 明文拒；
 * 宿主侧还有第二道（魔数 ＋ 2 MiB）⇒「不写半行数据」是两侧都拒出来的，不是任一侧说了算。
 * 想读缩略图的场合：图片字节只走端口缓存（`home-avatar.ts`），本文件不碰 IO。
 */
import { h } from '../dom'
import { toast } from '../ui/toast'
import { logLine, logOn } from '../log'
import { avatarSrc, clearAvatarImage, hasImage, onAvatarImage, uploadAvatarImage } from './home-avatar'
import { aLog, hLog, msgOf } from './home-ops'
import { avatarStyle } from './home-identity'

const ACCEPT = 'image/png,image/jpeg,image/webp'
/** 选择器入口上限：先挡住手滑选中的巨型文件，别把它读进内存（票面口径的 2 MB 是**存盘**上限）。 */
const MAX_FILE = 10 * 1024 * 1024
/** 存盘上限（与宿主 AVATAR_MAX_BYTES 同值；两侧都卡，客户端这层只为即时反馈）。 */
const MAX_STORE = 2 * 1024 * 1024
const MIMES = ['image/png', 'image/jpeg', 'image/webp']

type Kind = 'home' | 'assistant'
/** 文件对象的最小形状（`File` 结构子集：单测直接喂假对象，不必造真 File）。 */
export interface FileLike {
  type?: string
  size?: number
  name?: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

const mb = (n: number): string => (n / 1048576).toFixed(1) + ' MB'

/** 选文件前的本地校验（纯函数，可单测）：回 null ＝ 可以读。 */
export function avatarFileReject(file: { type?: string; size?: number; name?: string } | null | undefined): string | null {
  if (!file) return '没选到文件'
  const size = typeof file.size === 'number' ? file.size : 0
  if (size > MAX_FILE) return '图片太大：' + mb(size) + '，请先压到 10 MB 以内再传'
  if (!size) return '空文件：' + String(file.name ?? '（未命名）')
  const type = String(file.type ?? '').toLowerCase()
  if (!MIMES.includes(type)) return '不支持的格式：只收 png / jpg / webp（当前 ' + (type || '未知类型') + '）'
  return null
}

/** 字节 → base64（分块拼：一次性 apply/展开大数组会爆栈）。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)))
  return btoa(out)
}

/** 字节 → data URL（带上 mime 头；宿主仍按**内容**再认一次类型，声明不作数）。 */
export function toDataUrl(bytes: Uint8Array, mime: string): string {
  return 'data:' + mime + ';base64,' + bytesToBase64(bytes)
}

/** 选完文件之后的整条链（与 DOM 解耦，单测直接喂假文件）：校验 → 读字节 → data URL → 端口上传。 */
export async function commitAvatarFile(id: string, kind: Kind, file: FileLike | null): Promise<{ ok: true } | { ok: false; message: string }> {
  const bad = avatarFileReject(file)
  if (bad) return { ok: false, message: bad }
  const declared = typeof file?.size === 'number' ? file.size : 0
  if (declared > MAX_STORE) return { ok: false, message: '图片太大：' + mb(declared) + '，上限 2 MB' }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await (file as FileLike).arrayBuffer())
  } catch (e) {
    return { ok: false, message: '读不到文件内容：' + msgOf(e) }
  }
  if (!bytes.length) return { ok: false, message: '空文件：' + String(file?.name ?? '（未命名）') }
  if (bytes.length > MAX_STORE) return { ok: false, message: '图片太大：' + mb(bytes.length) + '，上限 2 MB' }
  try {
    await uploadAvatarImage(id, kind, toDataUrl(bytes, String(file?.type ?? '').toLowerCase()))
  } catch (e) {
    return { ok: false, message: msgOf(e) }
  }
  return { ok: true }
}

/** 图片格的底色/内容：有图用图（cover），无图用「图」字 ＋ id 派生色相（与列表头像同一套色相口径）。 */
function cellStyle(id: string, url: string | null): string {
  const base = avatarStyle(id + ':img', null)
  return url ? base + ';background-image:url("' + url + '");background-size:cover;background-position:center' : base
}

/** 图片格：`{cell}` 塞进头像色板行（第 8 格），`{clear}` 由调用方摆在色板行下面（有图时才有）。 */
export function avatarImageCell(opts: {
  id: string
  kind: Kind
  current: string | null
  onCommitted: () => void
}): { cell: HTMLElement; clear: HTMLElement | null } {
  const { id, kind, current } = opts
  const log = kind === 'assistant' ? aLog : hLog
  const reject = (message: string): void => {
    log('reject-avatar-image', id, false, message)
    toast(message)
  }
  const input = h('input', { type: 'file', accept: ACCEPT, 'aria-label': '选择头像图片', style: 'display:none' }) as HTMLInputElement
  const shown = hasImage(current) ? avatarSrc(id, current) : null
  const btn = h('button', {
    type: 'button',
    className: 'hu-avopt hu-avimg',
    title: '图片头像：png / jpg / webp，2 MB 以内',
    'aria-label': '图片头像',
    'aria-selected': hasImage(current) ? 'true' : 'false',
    'data-avatar': 'img',
    style: cellStyle(id, shown),
  }, shown ? '' : '图')
  if (hasImage(current) && !shown) {
    /* 弹层是常驻 portal，不随面板重渲染 ⇒ 图取回来后自己补一次底色（一次性回调，见 home-avatar.onAvatarImage）。 */
    onAvatarImage(id, (url) => {
      btn.style.cssText = cellStyle(id, url)
      btn.textContent = ''
    })
  }
  btn.addEventListener('click', () => {
    if (typeof input.click === 'function') input.click()
    else if (logOn('debug')) logLine('debug', 'ui.action', { area: 'avatar', action: 'pick-unavailable', ok: false, message: '这个环境没有文件选择器' })
  })
  input.addEventListener('change', () => {
    const list = (input as unknown as { files?: ArrayLike<FileLike> | null }).files
    const file = list && list.length ? list[0] : null
    void commitAvatarFile(id, kind, file).then((r) => {
      try { input.value = '' } catch { /* 桩环境无 value 也不影响结果 */ }
      if (!r.ok) { reject(r.message); return }
      toast('头像图片已更新')
      opts.onCommitted()
    })
  })
  /* 清除图片：只在真有图时出现（等价「恢复默认」＝回落预设色 ＋ 首字母）。 */
  const clear = hasImage(current) ? h('button', { className: 'hu-plink', type: 'button' }, '清除图片（回到预设色）') : null
  if (clear) {
    clear.addEventListener('click', () => {
      clear.disabled = true
      void clearAvatarImage(id, kind)
        .then(() => { toast('已清除头像图片'); opts.onCommitted() })
        .catch((e) => { clear.disabled = false; reject(msgOf(e)) })
    })
  }
  return { cell: h('div', { className: 'hu-avimg-cell' }, btn, input), clear }
}
