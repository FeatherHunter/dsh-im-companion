/** 目录选择原语（新增共享原语，各 feature 复用）：原生系统对话框优先，否则 host 桥目录浏览。
 * 与 components/workspace-picker 同源语义，落共享层供 feature 经契约使用（feature 禁直引 A1 私有）。 */
import { h } from '../dom'
import { makeButton } from './button'
import { showModal } from './modal'
import type { RpcCall } from '../data/fleet-api'
import { HOST_CHANNEL } from '../data/meta'

export interface DirPickerHandle {
  promise: Promise<string | null>
  el: HTMLElement
}

const isAbs = (p: string): boolean => !!p && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p))

export function openDirPicker(
  rpc: RpcCall | null, initial = '', native?: () => Promise<string | null>,
): DirPickerHandle {
  let resolveFn: (v: string | null) => void = () => undefined
  const promise = new Promise<string | null>((resolve) => {
    resolveFn = resolve
  })
  if (native) {
    void native().then((p) => resolveFn(p ?? null), () => resolveFn(null))
    return { promise, el: h('div', null, '正在打开系统目录选择器…') }
  }
  if (!rpc) {
    resolveFn(null)
    return { promise, el: h('div') }
  }
  const state = { path: '' }
  const list = h('div', { style: { maxHeight: '280px', overflow: 'auto' } })
  const bar = h('div', null)
  const choose = makeButton({ kind: 'primary', label: '选择此目录', disabled: true, onClick: () => resolveFn(state.path) })
  const cancel = makeButton({ kind: 'ghost', label: '取消', onClick: () => resolveFn(null) })
  const modal = showModal([
    h('h3', null, '选择目录'),
    h('div', null, '为该 Agent 选一个文件夹'),
    bar, list,
    h('div', null, cancel, choose),
  ], { onClose: () => resolveFn(null) })
  async function navigate(path: string): Promise<void> {
    state.path = path
    choose.disabled = !path
    bar.replaceChildren(h('span', { style: { wordBreak: 'break-all' } }, path || '…'))
    list.replaceChildren(h('div', null, '正在读取目录…'))
    try {
      const raw = await rpc!(HOST_CHANNEL, 'fs.list', { path }, AbortSignal.timeout(5000))
      const res = raw as { ok: boolean; value?: { path: string; parent: string | null; entries: { name: string; path: string }[] }; error?: { message?: string } }
      if (!res.ok || !res.value) throw new Error(res.error?.message ?? '目录读取失败')
      state.path = res.value.path
      choose.disabled = !state.path
      bar.replaceChildren()
      if (res.value.parent) {
        const up = h('button', { type: 'button', onClick: () => void navigate(res.value!.parent as string) }, '…上级')
        bar.appendChild(up)
      }
      bar.appendChild(h('span', { style: { wordBreak: 'break-all' } }, res.value.path))
      const rows = res.value.entries.map((e) => {
        const row = h('div', { role: 'button', title: e.path }, e.name)
        row.onclick = () => void navigate(e.path)
        return row
      })
      if (!rows.length) list.replaceChildren(h('div', null, '（此目录下没有子文件夹）'))
      else list.replaceChildren(...rows)
    } catch (e) {
      list.replaceChildren(h('div', null, '读取失败：' + String((e as Error)?.message ?? e)))
    }
  }
  void (async () => {
    if (isAbs(initial)) {
      await navigate(initial)
      return
    }
    try {
      const rootRaw = await rpc!(HOST_CHANNEL, 'fs.defaultRoot', {}, AbortSignal.timeout(5000))
      const rootRes = rootRaw as { ok: boolean; value?: { path: string } }
      await navigate(rootRes.ok && rootRes.value ? rootRes.value.path : '')
    } catch {
      await navigate('')
    }
  })()
  return { promise, el: modal.el }
}
