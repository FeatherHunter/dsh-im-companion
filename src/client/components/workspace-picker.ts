/** 工作区选择（选家）：优先系统目录对话框（ctx.get('uiWorkspace')），不可用时经 host 桥目录浏览器。 */
import { h } from '../dom'
import { icon } from '../icons'
import { showModal, type ModalHandle } from '../ui/modal'
import { makeButton } from '../ui/button'
import type { RpcCall } from '../data/fleet-api'
import { HOST_CHANNEL } from '../data/meta'

export interface PickerHandle {
  promise: Promise<string | null>
  el: HTMLElement
}

export function openWorkspacePicker(ctx: unknown, rpc: RpcCall | null): PickerHandle {
  let resolveFn: (v: string | null) => void = () => {}
  const promise = new Promise<string | null>((resolve) => {
    resolveFn = resolve
  })

  /* ① 原生系统目录对话框（官方直连优先：inject 声明后 ctx 直挂 uiWorkspace；其次 get 透传） */
  let nativeFn: (() => Promise<unknown>) | undefined
  try {
    const direct = (ctx as { uiWorkspace?: { pickDirectory?: () => Promise<unknown> } } | null)?.uiWorkspace
    if (direct && typeof direct.pickDirectory === 'function') {
      const pick = direct.pickDirectory.bind(direct)
      nativeFn = () => pick()
    }
  } catch { /* 直连缺失走 get 路径 */ }
  if (!nativeFn) try {
    const ui = typeof (ctx as { get?: (n: string) => unknown } | null)?.get === 'function'
      ? (ctx as { get: (n: string) => unknown }).get('uiWorkspace')
      : undefined
    const native = ui as { pickDirectory?: () => Promise<unknown> } | undefined
    if (native && typeof native.pickDirectory === 'function') {
      const pick = native.pickDirectory.bind(native)
      nativeFn = () => pick()
    }
  } catch {
    nativeFn = undefined
  }

  if (nativeFn) {
    const placeholder = h('div', { className: 'af-empty' }, h('span', null, '正在打开系统目录选择器…'))
    void (async () => {
      try {
        const raw = await nativeFn!()
        resolveFn(raw === null ? null : normalizePick(raw))
      } catch (e) {
        /* 取消类抛错：静默收场。真故障才回退内置，保证点击永远有可见反应。 */
        const msg = String((e as Error)?.message ?? e)
        if (/cancel|dismiss|abort|close/i.test(msg)) {
          resolveFn(null)
          return
        }
        try { console.warn('[dsh-im-companion] native picker failed, falling back:', e) } catch { /* ignore */ }
        if (!rpc) {
          resolveFn(null)
          return
        }
        openHostBrowser()
      }
    })()
    return { promise, el: placeholder }
  }

  /* ② host 桥目录浏览器 */
  if (!rpc) {
    resolveFn(null)
    return { promise, el: h('div', { className: 'af-empty' }) }
  }
  const hostModal = openHostBrowser()
  return { promise, el: hostModal.el }

  function openHostBrowser(): ModalHandle {

  const state = { path: '', loading: true, error: '' }
  /* 列表弹性高度：卡片定高后由它吸收内容多少，弹窗不再上下抖动（dir-picker 同款） */
  const list = h('div', { className: 'af-list', style: { flex: '1 1 auto', minHeight: '0', overflow: 'auto' } })
  const bar = h('div', { className: 'af-dirbar' })
  /* 标题锁色：宿主 h3 紫字会漏进来，内联盖掉（dir-picker 同款） */
  const title = h('h3', { className: 'af-modal-title', style: { color: 'var(--af-primary)' } }, '选择工作区')
  const sub = h('div', { className: 'af-modal-sub', style: { color: 'var(--af-secondary)' } }, '选择该 Agent 的文件夹（作为它的「家」）')
  /* 按钮只 resolve 不关窗 = 点取消没反应（dir-picker 同款 bug，同治） */
  let modal: ModalHandle;
  const done = (v: string | null): void => {
    try { modal?.close() } catch { /* 关闭失败忽略 */ }
    resolveFn(v)
  }
  const choose = makeButton({ kind: 'primary', label: '选择此目录', disabled: true, onClick: () => done(state.path) })
  const cancel = makeButton({ kind: 'ghost', label: '取消', onClick: () => done(null) })
  const foot = h('div', { className: 'af-modal-foot', style: { flex: 'none' } }, cancel, choose)
  modal = showModal([
    title, sub, bar, list, foot,
    h('div', { className: 'af-modal-sub', style: { margin: '10px 0 0' } }, '提示：也可拖入任意目录；仅展示文件夹。'),
  ], { onClose: () => resolveFn(null) })
  try {
    /* 固定弹窗几何：卡片定高纵向排布（dir-picker 同款，治上下抖动） */
    modal.el.style.height = 'min(560px, calc(100vh - 96px))'
    modal.el.style.minHeight = '280px'
    modal.el.style.display = 'flex'
    modal.el.style.flexDirection = 'column'
    modal.el.style.overflow = 'hidden'
  } catch {
    /* 保持默认尺寸层叠 */
  }

  async function navigate(path: string): Promise<void> {
    state.path = path
    state.loading = true
    state.error = ''
    bar.replaceChildren(h('span', { style: { wordBreak: 'break-all' } }, path))
    list.replaceChildren(...makeLoading())
    choose.disabled = !path
    try {
      const raw = await rpc!(HOST_CHANNEL, 'fs.list', { path }, AbortSignal.timeout(5000))
      const res = raw as { ok: boolean; value?: { path: string; parent: string | null; entries: { name: string; path: string }[] } }
      if (!res.ok || !res.value) throw new Error((res as { error?: { message?: string } }).error?.message ?? '目录读取失败')
      state.path = res.value.path
      bar.replaceChildren()
      appendBreadcrumb(bar, res.value.path, res.value.parent)
      const rows = res.value.entries.map((e) => {
        const row = h('div', { className: 'af-diritem' }, icon('folder', 16), e.name,
          h('span', { style: { marginLeft: 'auto', color: 'var(--af-tertiary)' } }, '›'))
        row.onclick = () => void navigate(e.path)
        return row
      })
      if (!rows.length) list.replaceChildren(h('div', { className: 'af-loading-row' }, '（此目录下没有子文件夹）'))
      else list.replaceChildren(...rows)
    } catch (e) {
      state.error = String((e as Error)?.message ?? e)
      list.replaceChildren(h('div', { className: 'af-error' }, '读取失败：' + state.error))
    } finally {
      state.loading = false
      choose.disabled = !state.path
    }
  }

  function makeLoading(): HTMLElement[] {
    return [h('div', { className: 'af-loading-row' }, h('span', { className: 'af-spin' }), '正在读取目录…')]
  }

  function appendBreadcrumb(barEl: HTMLElement, path: string, parent: string | null): void {
    const parts = path.split(/[\\/]+/).filter(Boolean)
    let acc = ''
    for (const [i, seg] of parts.entries()) {
      acc = acc ? acc + '\\' + seg : seg
      const segPath = acc
      const el = h('button', {
        className: 'af-btn ghost sm', type: 'button',
        style: { padding: '0 6px' },
        onClick: () => void navigate(segPath),
      }, seg)
      barEl.appendChild(el)
      if (i < parts.length - 1) barEl.appendChild(h('span', null, '›'))
    }
    if (parent) {
      const up = h('button', { className: 'af-btn ghost sm', type: 'button', style: { padding: '0 6px' }, onClick: () => void navigate(parent) }, '…上级')
      barEl.prepend(up)
    }
  }

  void (async () => {
    try {
      const rootRaw = await rpc!(HOST_CHANNEL, 'fs.defaultRoot', {}, AbortSignal.timeout(5000))
      const rootRes = rootRaw as { ok: boolean; value?: { path: string } }
      await navigate(rootRes.ok && rootRes.value ? rootRes.value.path : '')
    } catch {
      await navigate('')
    }
  })()

    return modal
  }

  function normalizePick(raw: unknown): string | null {
    if (typeof raw === 'string') {
      const s = raw.trim()
      return s ? s : null
    }
    if (raw && typeof raw === 'object') {
      const rec = raw as Record<string, unknown>
      for (const k of ['path', 'value', 'dir']) {
        if (typeof rec[k] === 'string' && (rec[k] as string).trim()) return (rec[k] as string).trim()
      }
    }
    return null
  }
}