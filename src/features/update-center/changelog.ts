/** update-center 版本说明：拉取 → 解析 → 模态对话框（self-contained，不依赖任何 A1 私有件）。
 * 数据源优先级：① raw.githubusercontent ② jsDelivr 镜像；**禁用** github.com/.../raw/（跨域必失败）。
 * 必须带 AbortController 超时（直连会挂死）；**不使用** If-None-Match 条件请求。
 * 三态文案：拿到 → 展示该节；404 或 200 但切段为空 → `v<X.Y.Z> 暂无版本说明`；
 * 网络失败 → `已发布 v<X.Y.Z>，暂时取不到更新说明`。**禁止**写「你没有网络」（离线与跨域失败在 JS 层同形、不可细分）。 */
import { h } from '../../client/dom'
import { UPD_CHANGELOG_TIMEOUT, UPD_CHANGELOG_URLS } from './constants'

export type NotesState = 'ok' | 'empty' | 'unavailable'
export interface NotesResult { state: NotesState; items: string[] }

/** 行首 `^## ` 切节锚；容忍破折号 U+2014 / U+2013 与 ASCII `-`，版本号可带方括号与前导 v。 */
export function headingVersion(line: string): string | null {
  return versionKey(String(line).replace(/^##\s+/, ''))?.core ?? null
}
export interface VersionKey { core: string; tail: string }
/** 预发后缀词表：只认这些标签（`rc.2`/`beta.1`…）——标题里的日期尾巴（`— 2026-09-08`）绝不误判成后缀。 */
const PRE_TAGS = '(?:alpha|beta|pre|preview|next|dev|rc)'
/** 版本键 = 三段核心号 + 归一化预发后缀（`0.1.5-rc.2` ⇒ core `0.1.5` / tail `rc.2`；`0.1.5` ⇒ tail 空串）。
 * 切节时按**两者一起**比对：带 `-rc.N` 的目标能命中自己的预发节，稳定版也不会去顶替预发节（反之亦然）。 */
export function versionKey(raw: string): VersionKey | null {
  const s = String(raw).replace(/[[\]]/g, ' ').replace(/^#+\s*/, '').replace(/^[vV]/, '').trim()
  const m = s.match(new RegExp('^(\\d+\\.\\d+\\.\\d+)(?:\\s*[—–-]\\s*(' + PRE_TAGS + ')\\.?(\\d+)?)?', 'i'))
  if (!m) return null
  return { core: m[1], tail: m[2] ? m[2].toLowerCase() + (m[3] ? '.' + m[3] : '') : '' }
}
function bulletText(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').replace(/^#{1,6}\s+/, '').trim()
}
/** 取该版本小节；切段为空或无此节回 null（调用方按三态文案处理）。 */
export function parseSection(md: string, version: string): string[] | null {
  const want = versionKey(String(version ?? '').replace(/^v/i, '').trim())
  if (want === null) return null
  const lines = String(md ?? '').split('\n').map((l) => l.replace(/\r$/, ''))
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (!/^##\s+/.test(lines[i])) continue
    if (start >= 0) {
      end = i
      break
    }
    const key = versionKey(lines[i].replace(/^##\s+/, ''))
    if (key !== null && key.core === want.core && key.tail === want.tail) start = i + 1
  }
  if (start < 0) return null
  const items = lines.slice(start, end)
    .map(bulletText)
    .filter((t) => t !== '' && !/^-+$/.test(t))
  return items.length ? items : null
}

export interface NotesDeps {
  fetchImpl?: (url: string, init: { signal?: AbortSignal; cache: string }) => Promise<{ ok: boolean; text(): Promise<string> }>
  timeoutMs?: number
}
/** 依次试两个源：拿到就回；404 试下一个；超时/跨域/网络失败试下一个；全失败回 unavailable。 */
export async function fetchNotes(version: string | null, deps: NotesDeps = {}): Promise<NotesResult> {
  const doFetch = deps.fetchImpl ?? (typeof fetch === 'function' ? (fetch as NotesDeps['fetchImpl']) : undefined)
  if (!doFetch || !version) return { state: 'unavailable', items: [] }
  for (const url of UPD_CHANGELOG_URLS) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort() } catch { /* ignore */ } }, deps.timeoutMs ?? UPD_CHANGELOG_TIMEOUT) : null
    try {
      const res = await doFetch(url, { signal: ctrl?.signal, cache: 'no-store' })
      if (!res.ok) continue // 404 ⇒ 试下一个源
      const items = parseSection(await res.text(), version)
      return items ? { state: 'ok', items } : { state: 'empty', items: [] } // 200 但切段为空
    } catch { /* 超时 / 跨域 / 网络：试下一个源 */ } finally {
      if (timer !== null) clearTimeout(timer)
    }
  }
  return { state: 'unavailable', items: [] }
}

/** 三态文案（唯一出口，禁止在此之外另写一套）。 */
export function notesMessage(version: string | null, state: NotesState): string {
  const tag = version ? 'v' + String(version).replace(/^v/i, '') : '该版本'
  if (state === 'empty') return tag + ' 暂无版本说明'
  if (state === 'unavailable') return '已发布 ' + tag + '，暂时取不到更新说明'
  return ''
}

let openClose: (() => void) | null = null

/** 模态对话框：Esc / 点外部 / 关闭键三路可关；关掉后宿主里的待重启横幅仍在（本层不碰容器）。 */
export function openChangelog(opts: { version: string | null; deps?: NotesDeps }): () => void {
  const close = (): void => { if (openClose) openClose() }
  if (typeof document === 'undefined') return close
  try { openClose?.() } catch { /* 旧窗已在关 */ }
  const version = opts.version
  const overlay = h('div', { className: 'update-center-overlay' })
  const card = h('div', { className: 'update-center-dialog', role: 'dialog', 'aria-label': '版本说明' })
  const title = h('div', { className: 'update-center-dialog-title' })
  title.textContent = (version ? 'v' + String(version).replace(/^v/i, '') : '新版本') + ' · 更新说明'
  const body = h('div', { className: 'update-center-dialog-body' })
  body.textContent = '正在获取更新说明…'
  const foot = h('div', { className: 'update-center-dialog-foot' })
  const closeBtn = h('button', { className: 'update-center-btn update-center-secondary', type: 'button' })
  closeBtn.textContent = '关闭'
  foot.appendChild(closeBtn)
  card.appendChild(title)
  card.appendChild(body)
  card.appendChild(foot)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  let closed = false
  openClose = () => {
    if (closed) return
    closed = true
    openClose = null
    try { document.removeEventListener('keydown', onKey, true) } catch { /* ignore */ }
    try { overlay.remove() } catch { /* ignore */ }
  }
  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') close() }
  closeBtn.addEventListener('click', close)
  overlay.addEventListener('click', (e: MouseEvent) => { if (e.target === overlay) close() })
  try { document.addEventListener('keydown', onKey, true) } catch { /* ignore */ }

  void fetchNotes(version, opts.deps).then((out) => {
    if (closed) return
    if (out.state !== 'ok') { body.textContent = notesMessage(version, out.state); return }
    const list = h('ul', { className: 'update-center-notes' })
    for (const item of out.items) {
      const li = h('li')
      li.textContent = item
      list.appendChild(li)
    }
    body.replaceChildren(list)
  }).catch(() => {
    if (!closed) body.textContent = notesMessage(version, 'unavailable')
  })
  return close
}
